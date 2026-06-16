import type {Env, SourceConfig, SourceDoc, SourceDocument} from "../types";
import {sha256Hex} from "../utils/hash";
import {extractTitle, markdownToText, normalizeMarkdown, titleFromPath} from "../utils/markdown";

type GitHubCommitResponse = {
  sha: string;
};

type GitHubTreeResponse = {
  tree: Array<{
    path: string;
    mode: string;
    type: "blob" | "tree" | "commit";
    sha: string;
    size?: number;
    url: string;
  }>;
  truncated: boolean;
};

export type GitHubDiscovery = {
  docs: SourceDoc[];
  seenKeys: Set<string>;
};

export async function discoverGitHubSource(
  env: Env,
  config: SourceConfig,
  existingDocs: Map<string, SourceDocument>,
): Promise<GitHubDiscovery> {
  const commit = await fetchCommit(env, config);
  const tree = await fetchTree(env, config, commit);
  if (tree.truncated) {
    throw new Error(`GitHub tree is truncated for ${config.name}; source-specific pagination is required.`);
  }
  const maxRawDownloads = parsePositiveInt(env.MAX_RAW_DOWNLOADS_PER_SOURCE, 25);
  let rawDownloads = 0;
  const docs: SourceDoc[] = [];
  const seenKeys = new Set<string>();
  for (const item of tree.tree) {
    if (item.type !== "blob" || !item.path.match(/\.mdx?$/i) || shouldExcludePath(config, item.path)) {
      continue;
    }
    const sourceKey = `${config.name}:${item.path}`;
    seenKeys.add(sourceKey);
    const existing = existingDocs.get(sourceKey);
    if (existing && existing.blob_sha === item.sha && !existing.deleted_at) {
      docs.push({
        source: config.name,
        sourceKey,
        sourceRepo: config.repoUrl,
        sourcePath: item.path,
        sourceCommit: commit,
        sourceUrl: githubBlobUrl(config, commit, item.path),
        license: existing.license_label,
        title: existing.title ?? titleFromPath(item.path),
        textPreview: existing.text_preview ?? "",
        contentHash: existing.content_hash,
        contentLength: existing.content_length,
        blobSha: item.sha,
        changed: false,
      });
      continue;
    }
    if (rawDownloads >= maxRawDownloads) {
      continue;
    }
    rawDownloads += 1;
    const rawMarkdown = await fetchRawMarkdown(env, config, commit, item.path);
    const markdown = normalizeMarkdown(rawMarkdown);
    if (!isLikelyProgramDescription(markdown, item.path)) {
      continue;
    }
    const text = markdownToText(markdown);
    const title = extractTitle(rawMarkdown, titleFromPath(item.path));
    docs.push({
      source: config.name,
      sourceKey,
      sourceRepo: config.repoUrl,
      sourcePath: item.path,
      sourceCommit: commit,
      sourceUrl: githubBlobUrl(config, commit, item.path),
      license: config.licenseLabel,
      title,
      markdown,
      textPreview: text.slice(0, 700),
      contentHash: await sha256Hex(markdown),
      contentLength: markdown.length,
      blobSha: item.sha,
      changed: true,
    });
  }
  return {docs, seenKeys};
}

async function fetchCommit(env: Env, config: SourceConfig): Promise<string> {
  const response = await githubFetch(env, `https://api.github.com/repos/${config.owner}/${config.repo}/commits/${config.branch}`);
  const commit = await response.json<GitHubCommitResponse>();
  return commit.sha;
}

async function fetchTree(env: Env, config: SourceConfig, commit: string): Promise<GitHubTreeResponse> {
  const response = await githubFetch(env, `https://api.github.com/repos/${config.owner}/${config.repo}/git/trees/${commit}?recursive=1`);
  return response.json();
}

async function fetchRawMarkdown(env: Env, config: SourceConfig, commit: string, sourcePath: string): Promise<string> {
  const response = await githubFetch(env, `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${commit}/${sourcePath}`);
  return response.text();
}

async function githubFetch(env: Env, url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      "accept": "application/vnd.github+json",
      "user-agent": "opensist-program-intro-sync",
      ...(env.GITHUB_TOKEN ? {authorization: `Bearer ${env.GITHUB_TOKEN}`} : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub request failed: ${response.status} ${response.statusText} (${url})`);
  }
  return response;
}

function shouldExcludePath(config: SourceConfig, sourcePath: string): boolean {
  const parts = sourcePath.split("/");
  if (parts.some((part) => config.excludePathParts.includes(part))) {
    return true;
  }
  return !config.contentRoots.some((root) => sourcePath === root || sourcePath.startsWith(`${root}/`));
}

function isLikelyProgramDescription(markdown: string, sourcePath: string): boolean {
  const path = sourcePath.toLowerCase();
  const text = markdownToText(markdown).toLowerCase();
  if (text.length < 120 || path.endsWith("/readme.md") || path === "readme.md") {
    return false;
  }
  const signals = [
    "项目",
    "申请",
    "录取",
    "课程",
    "就业",
    "学费",
    "master",
    "phd",
    "computer science",
    "mscs",
    "mcs",
  ];
  return signals.some((signal) => text.includes(signal) || path.includes(signal));
}

function githubBlobUrl(config: SourceConfig, commit: string, sourcePath: string): string {
  return `${config.repoUrl}/blob/${commit}/${sourcePath}`;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
