/**
 * build-manifest.mjs
 *
 * Pre-computes GitHub source file matches for all OpenSIST programs.
 * Run once before batch-processing; agents read manifest.json instead of
 * searching GitHub themselves — eliminates ~10 API calls per agent.
 *
 * Usage:
 *   node skill/program-summary/scripts/build-manifest.mjs
 *   GITHUB_TOKEN=xxx node skill/program-summary/scripts/build-manifest.mjs
 *
 * Output:
 *   skill/program-summary/manifest.json
 */

import { writeFileSync } from "fs";
import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "../manifest.json");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";
const BASE_HEADERS = {
  Accept: "application/vnd.github.v3+json",
  ...(GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {}),
};

// ── Source repo definitions ─────────────────────────────────────────────────

const SOURCES = {
  OpenCS: {
    owner: "opencsapp",
    repo: "opencsapp.github.io",
    branch: "master",
    scanDirs: ["docs"],
    excludeNames: ["grade.md", "index.md", "SUMMARY.md"],
  },
  GlobalCS: {
    owner: "Global-CS-application",
    repo: "global-cs-application.github.io",
    branch: "main",
    // tier subdirs discovered dynamically under docs/Program
    scanDirs: [],
    parentDir: "docs/Program",
    excludeNames: ["index.md", ".pages"],
  },
  CSGrad: {
    owner: "csms-apply",
    repo: "csgrad",
    branch: "main",
    // tier subdirs discovered dynamically under docs
    scanDirs: [],
    parentDir: "docs",
    excludeNames: [
      "addpr.md",
      "intro.mdx",
      "找我辅导.md",
      "转码项目.md",
      "datapoints submit.mdx",
      "index.md",
    ],
    excludeDirNames: ["tutorial-basics", "useful_docs"],
  },
};

// ── GitHub API helpers ──────────────────────────────────────────────────────

async function ghFetch(url) {
  const res = await fetch(url, { headers: BASE_HEADERS });
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} for ${url}`);
  }
  return res.json();
}

async function listDir(owner, repo, dirPath) {
  return ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(dirPath)}`
  );
}

function rawUrl(owner, repo, branch, filePath) {
  const encoded = filePath.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encoded}`;
}

function htmlUrl(owner, repo, branch, filePath) {
  const encoded = filePath.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${owner}/${repo}/blob/${branch}/${encoded}`;
}

// ── File tree fetching ──────────────────────────────────────────────────────

async function fetchAllFiles(sourceName) {
  const src = SOURCES[sourceName];
  const { owner, repo, branch } = src;
  const files = [];

  // Discover scan dirs if not statically defined
  let scanDirs = [...(src.scanDirs ?? [])];

  if (src.parentDir) {
    const parentItems = await listDir(owner, repo, src.parentDir);
    const subdirs = parentItems
      .filter(
        (item) =>
          item.type === "dir" &&
          !(src.excludeDirNames ?? []).includes(item.name)
      )
      .map((item) => item.path);
    scanDirs = [...scanDirs, ...subdirs];
  }

  for (const dir of scanDirs) {
    let items;
    try {
      items = await listDir(owner, repo, dir);
    } catch (err) {
      console.warn(`  [${sourceName}] skip ${dir}: ${err.message}`);
      continue;
    }
    for (const item of items) {
      if (
        item.type === "file" &&
        (item.name.endsWith(".md") || item.name.endsWith(".mdx")) &&
        !(src.excludeNames ?? []).includes(item.name)
      ) {
        files.push({
          path: item.path,
          name: item.name,
          rawUrl: rawUrl(owner, repo, branch, item.path),
          htmlUrl: htmlUrl(owner, repo, branch, item.path),
          sha: item.sha ?? null,
        });
      }
    }
  }

  return files;
}

// ── University alias table (port from matcher.ts) ──────────────────────────

const SCHOOL_ALIASES = {
  "carnegie mellon university": ["cmu", "carnegie mellon"],
  "columbia university": ["columbia"],
  "cornell university": ["cornell"],
  "duke university": ["duke"],
  "georgia institute technology": ["gatech", "georgia tech"],
  "harvard university": ["harvard"],
  "johns hopkins university": ["jhu", "johns hopkins"],
  "massachusetts institute of technology": ["mit"],
  "new york university": ["nyu"],
  "northeastern university": ["neu", "northeastern"],
  "northwestern university": ["northwestern"],
  "stanford university": ["stanford"],
  "university california berkeley": ["uc berkeley", "ucb", "berkeley"],
  "university california los angeles": ["ucla"],
  "university california san diego": ["ucsd"],
  "university california santa barbara": ["ucsb"],
  "university chicago": ["uchicago", "u chicago"],
  "university illinois urbana champaign": ["uiuc", "illinois urbana champaign"],
  "university michigan ann arbor": ["umich", "michigan ann arbor"],
  "university pennsylvania": ["upenn", "penn"],
  "university southern california": ["usc"],
  "university texas austin": ["ut austin", "ut"],
  "university washington": ["uw", "uw seattle"],
  "epfl": ["epfl"],
  "eth zurich": ["eth", "ethz", "eth zurich"],
  "national university singapore": ["nus"],
  "nanyang technological university": ["ntu", "nanyang"],
  "university toronto": ["uoft", "toronto"],
  "university british columbia": ["ubc"],
  "mcgill university": ["mcgill"],
  "university waterloo": ["waterloo"],
  "simon fraser university": ["sfu"],
  "texas a&m university": ["tamu", "texas a&m", "texas am"],
  "virginia tech": ["vt", "virginia tech"],
  "university wisconsin madison": ["wisc", "wisconsin"],
  "purdue university": ["purdue"],
  "ohio state university": ["osu", "ohio state"],
  "rensselaer polytechnic institute": ["rpi"],
  "brown university": ["brown"],
  "dartmouth college": ["dartmouth"],
  "yale university": ["yale"],
  "princeton university": ["princeton"],
  "caltech": ["caltech"],
  "boston university": ["bu", "boston university"],
  "washington university st louis": ["washu"],
  "rice university": ["rice"],
  "university notre dame": ["notre dame"],
  "rutgers university": ["rutgers"],
  "university maryland": ["umd", "maryland"],
  "pennsylvania state university": ["psu", "penn state"],
  "stony brook university": ["stony brook", "suny stony brook"],
  "university massachusetts amherst": ["umass", "umass amherst"],
};

function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniTokens(university) {
  const norm = normalize(university);
  // collect all known aliases
  const extras = [];
  for (const [key, aliases] of Object.entries(SCHOOL_ALIASES)) {
    const keyNorm = normalize(key);
    if (keyNorm === norm || norm.includes(keyNorm) || keyNorm.includes(norm)) {
      extras.push(...aliases);
    }
  }
  // also add any individual words from the university name that are ≥4 chars
  const words = norm.split(" ").filter((w) => w.length >= 4);
  return [norm, ...words, ...extras].map((t) => normalize(t));
}

function progTokens(programName) {
  const norm = normalize(programName);
  const compact = norm.replace(/\b(master|science|engineering|arts|of|in|and|the)\b/g, " ").replace(/\s+/g, " ").trim();
  return [norm, compact].filter((t) => t.length >= 2);
}

// ── Matching ────────────────────────────────────────────────────────────────

/**
 * For OpenCS: files are named as ProgramID (e.g. "MSCS@CMU.md") — exact match.
 */
function matchOpenCS(programId, file) {
  const base = file.name.replace(/\.(md|mdx)$/, "");
  if (base === programId) return "exact";
  if (normalize(base) === normalize(programId)) return "high";
  return null;
}

/**
 * For GlobalCS / CSGrad: files named like "CMU MSCS.md" or "cmu mscs.md".
 * Requires BOTH university AND program tokens to appear in the file name.
 * Then checks for explicit program-code conflict (negative rule).
 */
function matchLoose(programId, university, programName, file) {
  const base = normalize(file.name.replace(/\.(md|mdx)$/, ""));

  const uniTerms = uniTokens(university);
  const hasUni = uniTerms.some((t) => t.length >= 3 && base.includes(t));
  if (!hasUni) return null;

  const progTerms = progTokens(programName);
  const hasProg = progTerms.some((t) => t.length >= 2 && base.includes(t));
  if (!hasProg) return null;

  // Negative rule: extract explicit program code from programId (before @)
  // If the file name contains a different code, reject.
  const [programCode] = programId.split("@");
  const codeNorm = normalize(programCode);
  // Only apply conflict check for short codes (2-8 chars) to avoid false rejects
  if (codeNorm.length >= 2 && codeNorm.length <= 8) {
    // Does file contain a different program code that is NOT our code?
    // Heuristic: split file base into tokens; if any token looks like a program
    // code (2-8 chars, no spaces) and doesn't match ours, penalize.
    const fileTokens = base.split(" ").filter((t) => t.length >= 2 && t.length <= 8);
    const conflictingCode = fileTokens.find(
      (t) =>
        t !== codeNorm &&
        !uniTerms.includes(t) &&
        t.length >= 2 &&
        !["the", "and", "for", "of", "in", "ms", "msc", "meng"].includes(t)
    );
    // If file explicitly contains another code that doesn't overlap ours, reject
    if (conflictingCode && !codeNorm.includes(conflictingCode) && !conflictingCode.includes(codeNorm)) {
      return null;
    }
  }

  return "high";
}

// ── Main ────────────────────────────────────────────────────────────────────

async function fetchPrograms() {
  console.log("Fetching programs from remote D1...");
  const projectRoot = path.join(__dirname, "../../..");
  const sql = "SELECT DISTINCT program_id, university, program_name, degree FROM opensist_program_snapshots ORDER BY program_id";

  const result = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "program-intro-sync", "--remote", "--json", "--command", sql],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    }
  );

  if (result.error) {
    throw new Error(`spawnSync error: ${result.error.message}`);
  }

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  // wrangler prints ANSI warnings to stderr; stdout should be pure JSON (with --json)
  // but sometimes the JSON lands in stderr too — try stdout first, then stderr
  for (const output of [stdout, stderr]) {
    const jsonStart = output.indexOf("[");
    if (jsonStart === -1) continue;
    try {
      const parsed = JSON.parse(output.slice(jsonStart));
      const rows = parsed?.[0]?.results ?? [];
      if (rows.length > 0) {
        console.log(`  Found ${rows.length} programs in D1`);
        return rows.map((r) => ({
          programId: r.program_id,
          university: r.university,
          programName: r.program_name,
          degree: r.degree,
        }));
      }
    } catch {
      // not valid JSON in this output, try the other
    }
  }

  throw new Error(
    `Could not parse D1 output.\nstdout: ${stdout.slice(0, 300)}\nstderr: ${stderr.slice(0, 300)}`
  );
}

async function main() {
  console.log("=== Building source manifest ===\n");

  // 1. Fetch programs
  const programs = await fetchPrograms();

  // 2. Fetch file trees from all 3 repos
  console.log("\nFetching file trees from GitHub repos...");
  const fileTrees = {};
  for (const sourceName of Object.keys(SOURCES)) {
    console.log(`  [${sourceName}] scanning...`);
    fileTrees[sourceName] = await fetchAllFiles(sourceName);
    console.log(`  [${sourceName}] found ${fileTrees[sourceName].length} files`);
  }

  // 3. Match each program against each source
  console.log("\nMatching programs to source files...");
  const manifest = {
    generatedAt: new Date().toISOString(),
    programCount: programs.length,
    fileCounts: Object.fromEntries(
      Object.entries(fileTrees).map(([k, v]) => [k, v.length])
    ),
    programs: {},
  };

  let richCount = 0;
  let mediumCount = 0;
  let thinCount = 0;

  for (const prog of programs) {
    const entry = { sources: {}, sourceCount: 0 };

    // OpenCS
    const ocMatch = fileTrees.OpenCS.find((f) => matchOpenCS(prog.programId, f));
    if (ocMatch) {
      entry.sources.OpenCS = {
        matched: true,
        path: ocMatch.path,
        rawUrl: ocMatch.rawUrl,
        htmlUrl: ocMatch.htmlUrl,
      };
      entry.sourceCount++;
    } else {
      entry.sources.OpenCS = { matched: false };
    }

    // GlobalCS
    const gcMatch = fileTrees.GlobalCS.find((f) =>
      matchLoose(prog.programId, prog.university, prog.programName, f)
    );
    if (gcMatch) {
      entry.sources.GlobalCS = {
        matched: true,
        path: gcMatch.path,
        rawUrl: gcMatch.rawUrl,
        htmlUrl: gcMatch.htmlUrl,
      };
      entry.sourceCount++;
    } else {
      entry.sources.GlobalCS = { matched: false };
    }

    // CSGrad
    const cgMatch = fileTrees.CSGrad.find((f) =>
      matchLoose(prog.programId, prog.university, prog.programName, f)
    );
    if (cgMatch) {
      entry.sources.CSGrad = {
        matched: true,
        path: cgMatch.path,
        rawUrl: cgMatch.rawUrl,
        htmlUrl: cgMatch.htmlUrl,
      };
      entry.sourceCount++;
    } else {
      entry.sources.CSGrad = { matched: false };
    }

    entry.hasSources = entry.sourceCount > 0;

    if (entry.sourceCount >= 2) richCount++;
    else if (entry.sourceCount === 1) mediumCount++;
    else thinCount++;

    manifest.programs[prog.programId] = entry;
  }

  // 4. Write manifest
  writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`\n=== Done ===`);
  console.log(`Rich (2-3 sources): ${richCount}`);
  console.log(`Medium (1 source):  ${mediumCount}`);
  console.log(`Thin (0 sources):   ${thinCount}`);
  console.log(`\nWritten to: ${OUT_PATH}`);

  // Token savings estimate
  const savedToolCalls = programs.length * 10;
  const savedTokens = savedToolCalls * 3000;
  const savedCost = ((savedTokens * 0.82 * 3) / 1e6) + ((savedTokens * 0.18 * 15) / 1e6);
  console.log(`\nEstimated token savings vs. per-agent GitHub search:`);
  console.log(`  ~${(savedTokens / 1e6).toFixed(1)}M tokens saved`);
  console.log(`  ~$${savedCost.toFixed(0)} saved`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
