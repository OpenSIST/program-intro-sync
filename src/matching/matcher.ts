import type {MatchStatus, OpenSistProgram, ProgramAlternative, ProgramMatch, SourceDoc} from "../types";

type MatchThresholds = {
  highConfidence: number;
  lowConfidence: number;
};

type ScoredProgram = {
  program: OpenSistProgram;
  score: number;
  reasons: string[];
};

const DEGREE_ALIASES: Record<string, string[]> = {
  master: ["master", "masters", "ms", "msc", "meng", "mcs", "mscs", "研究生", "硕士"],
  phd: ["phd", "ph.d", "doctor", "doctoral", "博士"],
};

const SCHOOL_ALIASES: Record<string, string[]> = {
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
  "university michigan ann arbor": ["umich", "um ann arbor", "michigan ann arbor"],
  "university pennsylvania": ["upenn", "penn"],
  "university southern california": ["usc"],
  "university texas austin": ["ut austin"],
  "university washington": ["uw", "uw seattle"],
};

export function parseThresholds(env: {
  HIGH_CONFIDENCE?: string;
  LOW_CONFIDENCE?: string;
}): MatchThresholds {
  return {
    highConfidence: parseFinite(env.HIGH_CONFIDENCE, 0.72),
    lowConfidence: parseFinite(env.LOW_CONFIDENCE, 0.45),
  };
}

export function matchProgram(
  doc: SourceDoc,
  programs: OpenSistProgram[],
  thresholds: MatchThresholds,
): ProgramMatch {
  const haystack = normalize(`${doc.title} ${doc.sourcePath} ${doc.textPreview}`);
  const scored = programs
    .map((program) => scoreProgram(haystack, program))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
  const best = scored[0];
  if (!best) {
    return {
      matchedProgramId: null,
      confidence: 0,
      reasons: [],
      alternatives: [],
      status: "unmatched",
    };
  }
  const confidence = Math.min(0.99, Number(best.score.toFixed(3)));
  const alternatives = scored.slice(1).map(toAlternative);
  return {
    matchedProgramId: confidence >= thresholds.lowConfidence ? best.program.programId : null,
    confidence,
    reasons: best.reasons,
    alternatives,
    status: matchStatus(confidence, thresholds),
  };
}

function scoreProgram(haystack: string, program: OpenSistProgram): ScoredProgram {
  const reasons: string[] = [];
  let score = 0;
  const universityTerms = termsForUniversity(program.university);
  const universityHit = strongestTermHit(haystack, universityTerms);
  if (universityHit) {
    score += universityHit.weight;
    reasons.push(`university:${universityHit.term}`);
  }
  const programTerms = termsForProgram(program.programName);
  const programHit = strongestTermHit(haystack, programTerms);
  if (programHit) {
    score += programHit.weight;
    reasons.push(`program:${programHit.term}`);
  }
  const degreeHit = degreeMatch(haystack, program.degree);
  if (degreeHit) {
    score += degreeHit.weight;
    reasons.push(`degree:${degreeHit.term}`);
  }
  if (universityHit && programHit) {
    score += 0.18;
    reasons.push("university+program");
  }
  if (universityHit && degreeHit) {
    score += 0.08;
    reasons.push("university+degree");
  }
  return {program, score, reasons};
}

function termsForUniversity(university: string): Array<{term: string; weight: number}> {
  const normalized = normalize(university);
  const compact = compactName(normalized);
  const aliases = SCHOOL_ALIASES[compact] ?? [];
  return [
    {term: normalized, weight: 0.42},
    {term: compact, weight: 0.36},
    ...aliases.map((alias) => ({term: normalize(alias), weight: alias.length <= 4 ? 0.34 : 0.39})),
  ].filter((item) => item.term.length >= 2);
}

function termsForProgram(programName: string): Array<{term: string; weight: number}> {
  const normalized = normalize(programName);
  const compact = compactName(normalized);
  const terms = [
    {term: normalized, weight: 0.38},
    {term: compact, weight: 0.3},
  ];
  if (compact.includes("computer science")) {
    terms.push({term: "computer science", weight: 0.24});
    terms.push({term: "cs", weight: 0.16});
  }
  if (compact.includes("data science")) {
    terms.push({term: "data science", weight: 0.24});
  }
  return terms.filter((item) => item.term.length >= 2);
}

function strongestTermHit(
  haystack: string,
  terms: Array<{term: string; weight: number}>,
): {term: string; weight: number} | null {
  let best: {term: string; weight: number} | null = null;
  for (const term of terms) {
    if (containsTerm(haystack, term.term) && (!best || term.weight > best.weight)) {
      best = term;
    }
  }
  return best;
}

function degreeMatch(haystack: string, degree?: string): {term: string; weight: number} | null {
  if (!degree) {
    return null;
  }
  const normalizedDegree = normalize(degree);
  for (const [label, aliases] of Object.entries(DEGREE_ALIASES)) {
    if (normalizedDegree.includes(label) || aliases.some((alias) => normalizedDegree.includes(alias))) {
      const hit = aliases.find((alias) => containsTerm(haystack, normalize(alias)));
      return hit ? {term: hit, weight: 0.12} : null;
    }
  }
  return containsTerm(haystack, normalizedDegree) ? {term: normalizedDegree, weight: 0.1} : null;
}

function containsTerm(haystack: string, term: string): boolean {
  if (term.length <= 4 && /^[a-z0-9]+$/.test(term)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}([^a-z0-9]|$)`).test(haystack);
  }
  return haystack.includes(term);
}

function matchStatus(confidence: number, thresholds: MatchThresholds): MatchStatus {
  if (confidence >= thresholds.highConfidence) {
    return "high_confidence";
  }
  if (confidence >= thresholds.lowConfidence) {
    return "needs_review";
  }
  return "unmatched";
}

function toAlternative(scored: ScoredProgram): ProgramAlternative {
  return {
    programId: scored.program.programId,
    confidence: Math.min(0.99, Number(scored.score.toFixed(3))),
    reasons: scored.reasons,
  };
}

function compactName(value: string): string {
  return value
    .replace(/\b(the|of|at|in|and|for|campus)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseFinite(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
