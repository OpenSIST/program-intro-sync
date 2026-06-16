export type TriggerType = "cron" | "manual" | "dry_run";
export type SourceType = "github_repo" | "web";
export type MatchStatus = "high_confidence" | "needs_review" | "unmatched";

export type Env = {
  DB: D1Database;
  OPENSIST_API_ROOT: string;
  OPENSIST_COOKIE?: string;
  GITHUB_TOKEN?: string;
  ADMIN_TOKEN?: string;
  HIGH_CONFIDENCE?: string;
  LOW_CONFIDENCE?: string;
  MAX_PROGRAM_UPSERTS_PER_RUN?: string;
  MAX_RAW_DOWNLOADS_PER_SOURCE?: string;
};

export type SourceConfig = {
  name: "OpenCS" | "GlobalCS" | "CSGrad";
  type: "github_repo";
  owner: string;
  repo: string;
  repoUrl: string;
  branch: string;
  licenseLabel: string;
  contentRoots: string[];
  excludePathParts: string[];
};

export type SourceRecord = {
  id: number;
  name: string;
  type: SourceType;
  repo_url: string | null;
  default_branch: string | null;
  license_label: string;
  enabled: number;
};

export type SourceDocument = {
  id: number;
  source_id: number;
  source_key: string;
  source_path: string | null;
  source_url: string;
  source_commit: string | null;
  blob_sha: string | null;
  title: string | null;
  content_hash: string;
  content_length: number;
  text_preview: string | null;
  license_label: string;
  deleted_at: string | null;
};

export type SourceDoc = {
  source: SourceConfig["name"];
  sourceKey: string;
  sourceRepo: string;
  sourcePath: string;
  sourceCommit: string;
  sourceUrl: string;
  license: string;
  title: string;
  markdown?: string;
  textPreview: string;
  contentHash: string;
  contentLength: number;
  blobSha: string;
  changed: boolean;
};

export type OpenSistProgram = {
  programId: string;
  university: string;
  programName: string;
  degree?: string;
  region?: string[];
  targetApplicantMajor?: string[];
  descriptionMarkdown?: string | null;
  descriptionHash: string | null;
};

export type ProgramAlternative = {
  programId: string;
  confidence: number;
  reasons: string[];
};

export type ProgramMatch = {
  matchedProgramId: string | null;
  confidence: number;
  reasons: string[];
  alternatives: ProgramAlternative[];
  status: MatchStatus;
};

export type MonitorSummary = {
  runId: string;
  sourcesScanned: number;
  documentsSeen: number;
  eventsCreated: number;
};
