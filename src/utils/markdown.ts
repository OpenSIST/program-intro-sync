export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---")) {
    return markdown;
  }
  const closingIndex = markdown.indexOf("\n---", 3);
  return closingIndex === -1 ? markdown : markdown.slice(closingIndex + 4);
}

export function normalizeMarkdown(markdown: string): string {
  return stripFrontmatter(markdown)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

export function extractTitle(markdown: string, fallback: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m);
  if (heading?.[1]) {
    return cleanTitle(heading[1]);
  }
  const titleField = markdown.match(/^title:\s*["']?(.+?)["']?\s*$/m);
  return titleField?.[1] ? cleanTitle(titleField[1]) : fallback;
}

export function titleFromPath(sourcePath: string): string {
  const fileName = sourcePath.split("/").at(-1) ?? sourcePath;
  return decodeURIComponent(fileName.replace(/\.mdx?$/i, ""))
    .replace(/[-_]+/g, " ")
    .trim();
}

export function markdownToText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_\-|~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(title: string): string {
  return title.replace(/\{#.+?}/g, "").replace(/<!--.*?-->/g, "").trim();
}
