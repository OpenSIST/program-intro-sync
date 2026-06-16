import {execFileSync} from "node:child_process";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";

const DEFAULT_DATABASE = "program-intro-sync";
const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const DEFAULT_ACCOUNT_ID = "c1e0d935e0f8ba4685b9b6702130efe7";
const DEFAULT_GATEWAY_ID = "default";
const OUTPUT_DIR = "outputs/llm-summary-evals";
const SYSTEM_PROMPT_PATH = "prompts/llm-summary-system.md";

const args = parseArgs(process.argv.slice(2));
const limit = parsePositiveInt(args.limit, 3);
const model = args.model ?? DEFAULT_MODEL;
const accountId = args.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? DEFAULT_ACCOUNT_ID;
const gatewayId = args.gateway ?? DEFAULT_GATEWAY_ID;
const dryRun = Boolean(args.dryRun);
const database = args.database ?? DEFAULT_DATABASE;
const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? process.env.CF_API_TOKEN;
const systemPrompt = readFileSync(SYSTEM_PROMPT_PATH, "utf8");

const samples = loadSamples({database, limit, source: args.source, programId: args.programId});
if (samples.length === 0) {
  console.log("No high-confidence source documents found for the requested filter.");
  process.exit(0);
}

mkdirSync(OUTPUT_DIR, {recursive: true});
const startedAt = new Date();
const runId = startedAt.toISOString().replace(/[:.]/g, "-");
const results = [];

for (const sample of samples) {
  const input = buildInput(sample);
  if (dryRun) {
    results.push({
      sourceKey: sample.source_key,
      programId: sample.matched_program_id,
      dryRun: true,
      input,
    });
    continue;
  }
  if (!apiToken) {
    throw new Error(
      "Missing CLOUDFLARE_API_TOKEN or CF_API_TOKEN. D1 sampling uses Wrangler login, but AI calls need an API token.",
    );
  }
  try {
    const response = await runAi({
      accountId,
      apiToken,
      gatewayId,
      model,
      systemPrompt,
      input,
    });
    const responseText = response.result?.response ?? null;
    results.push({
      sourceKey: sample.source_key,
      sourceUrl: sample.source_url,
      programId: sample.matched_program_id,
      matchConfidence: sample.confidence,
      licenseLabel: sample.license_label,
      model,
      usage: response.result?.usage ?? null,
      responseText,
      parsedResponse: parseJsonObject(responseText),
      validation: validateResponse({
        responseText,
        licenseLabel: sample.license_label,
        matchConfidence: sample.confidence,
        sourceKey: sample.source_key,
        title: sample.title,
        programId: sample.matched_program_id,
      }),
      rawResult: response.result,
      errors: response.errors ?? [],
    });
  } catch (error) {
    results.push({
      sourceKey: sample.source_key,
      sourceUrl: sample.source_url,
      programId: sample.matched_program_id,
      matchConfidence: sample.confidence,
      licenseLabel: sample.license_label,
      model,
      usage: null,
      responseText: null,
      parsedResponse: null,
      validation: {ok: false, warnings: ["ai_request_failed"]},
      rawResult: null,
      errors: [error instanceof Error ? error.message : String(error)],
    });
  }
}

const output = {
  runId,
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  model,
  gatewayId,
  promptPath: SYSTEM_PROMPT_PATH,
  dryRun,
  sampleCount: samples.length,
  results,
};
const outputPath = join(OUTPUT_DIR, `${runId}.json`);
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
printSummary(output);

function loadSamples({database, limit, source, programId}) {
  const filters = ["m.status = 'high_confidence'"];
  if (source) {
    filters.push(`d.source_key like ${sqlString(`${source}:%`)}`);
  }
  if (programId) {
    filters.push(`m.matched_program_id = ${sqlString(programId)}`);
  }
  const sql = `
    select d.id, d.source_key, d.source_url, d.source_commit, d.title, d.text_preview, d.license_label,
           m.matched_program_id, m.confidence, m.status,
           p.university, p.program_name, p.degree, p.description_hash
    from source_documents d
    join program_matches m on m.source_document_id = d.id
    left join opensist_program_snapshots p on p.program_id = m.matched_program_id
    where ${filters.join(" and ")}
    order by d.id desc
    limit ${limit}
  `;
  const stdout = execFileSync("npx", [
    "wrangler",
    "d1",
    "execute",
    database,
    "--remote",
    "--json",
    "--command",
    sql,
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(stdout);
  return parsed?.[0]?.results ?? parsed?.result?.[0]?.results ?? [];
}

function buildInput(sample) {
  return {
    programId: sample.matched_program_id,
    university: sample.university,
    programName: sample.program_name,
    degree: sample.degree,
    sourceKey: sample.source_key,
    sourceUrl: sample.source_url,
    title: sample.title,
    licenseLabel: sample.license_label,
    matchConfidence: sample.confidence,
    sourceText: sample.text_preview,
  };
}

async function runAi({accountId, apiToken, gatewayId, model, systemPrompt, input}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: {
        messages: [
          {role: "system", content: systemPrompt},
          {role: "user", content: JSON.stringify(input, null, 2)},
        ],
        max_tokens: 900,
        temperature: 0,
        response_format: {type: "json_object"},
      },
      options: {
        gateway: {
          id: gatewayId,
          skipCache: true,
        },
      },
    }),
  });
  const body = await response.json();
  if (!response.ok || body.success === false) {
    throw new Error(`Cloudflare AI request failed: ${response.status} ${JSON.stringify(body.errors ?? body)}`);
  }
  return body;
}

function printSummary(output) {
  for (const result of output.results) {
    console.log(`\n${result.sourceKey} -> ${result.programId}`);
    if (result.usage) {
      console.log(`tokens: prompt=${result.usage.prompt_tokens}, completion=${result.usage.completion_tokens}, total=${result.usage.total_tokens}`);
    }
    const text = result.responseText;
    if (!text) {
      console.log("No response text.");
      continue;
    }
    const parsed = result.parsedResponse ?? parseJsonObject(text);
    if (parsed) {
      console.log(`shouldUseForDraft=${parsed.shouldUseForDraft}, internalReviewOnly=${parsed.internalReviewOnly}`);
      console.log(parsed.oneSentenceSummaryZh);
      if (result.validation?.warnings?.length) {
        console.log(`warnings: ${result.validation.warnings.join("; ")}`);
      }
    } else {
      console.log(text.slice(0, 500));
    }
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function parsePositiveInt(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseJsonObject(value) {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function validateResponse({responseText, licenseLabel, matchConfidence, sourceKey, title, programId}) {
  const warnings = [];
  const parsed = parseJsonObject(responseText);
  if (!parsed) {
    return {ok: false, warnings: ["response_not_valid_json"]};
  }
  const expectedInternalReviewOnly = licenseLabel === "CHECK_SOURCE_LICENSE";
  if (parsed.internalReviewOnly !== expectedInternalReviewOnly) {
    warnings.push("internalReviewOnly_mismatch");
  }
  const sameProgram = String(sourceKey).toLowerCase().includes(String(programId).toLowerCase())
    || String(title).toLowerCase().includes(String(programId).split("@")[0].toLowerCase());
  if (matchConfidence >= 0.9 && sameProgram && parsed.shouldUseForDraft === false) {
    warnings.push("high_confidence_same_program_marked_not_useful");
  }
  for (const bullet of collectBullets(parsed.usefulSections)) {
    if (isHeadingOnlyBullet(bullet)) {
      warnings.push(`heading_only_bullet:${bullet}`);
    }
  }
  return {ok: warnings.length === 0, warnings};
}

function collectBullets(usefulSections) {
  if (!usefulSections || typeof usefulSections !== "object") {
    return [];
  }
  return Object.values(usefulSections).flatMap((value) => Array.isArray(value) ? value : []);
}

function isHeadingOnlyBullet(value) {
  const normalized = String(value).trim().toLowerCase();
  const headings = [
    "项目介绍",
    "录取偏好",
    "录取dp",
    "录取 dp",
    "项目特点",
    "网申备注",
    "申请注意事项",
  ];
  return headings.includes(normalized);
}
