# LLM Summary Evaluation

## Purpose

This is a local-only evaluation workflow for testing whether an LLM can turn monitored source documents into useful review summaries.

It does not:

- write OpenSIST backend data
- write D1 rows
- publish drafts
- mark events as consumed

It only reads existing D1 rows and writes local ignored output files under:

```txt
outputs/llm-summary-evals/
```

## Current Recommendation

Use AI Gateway / Workers AI for low-friction experiments.

Initial model choice:

```txt
@cf/meta/llama-3.3-70b-instruct-fp8-fast
```

Reason:

- works through Cloudflare AI API
- follows JSON formatting better than tested Qwen3/GLM reasoning models
- avoids wasting completion tokens on visible reasoning traces
- good enough for review-summary experiments

Do not use this as the final merge model decision. It is only the current evaluation baseline.

## Pricing Notes

Cloudflare AI Gateway is the routing/logging/caching/rate-limit layer. Model usage is billed through the underlying model/provider.

For Workers AI:

- Free allocation: 10,000 Neurons/day
- Workers Paid overage: `$0.011 / 1,000 Neurons`

Relevant model pricing from Cloudflare docs:

```txt
@cf/qwen/qwen3-30b-a3b-fp8
  ~$0.051 / M input tokens
  ~$0.335 / M output tokens

@cf/meta/llama-3.3-70b-instruct-fp8-fast
  ~$0.293 / M input tokens
  ~$2.253 / M output tokens

@cf/deepseek-ai/deepseek-r1-distill-qwen-32b
  ~$0.497 / M input tokens
  ~$4.881 / M output tokens
```

The first summary experiments used roughly 1,100-1,300 total tokens per source document. That is small enough for prompt iteration, but large batch evaluation should still be capped.

## Prompt

The system prompt lives at:

```txt
prompts/llm-summary-system.md
```

Main rules:

- output strict JSON only
- summarize in Chinese
- use only source text
- do not copy long source text
- treat DP as sample patterns, not admission rules
- set `internalReviewOnly=true` only for `CHECK_SOURCE_LICENSE`
- set `shouldUseForDraft=true` for high-confidence same-program matches

## Local Script

Dry-run, no AI cost:

```sh
npm run eval:llm-summary -- --dry-run --limit 2
```

Real AI call:

```sh
CLOUDFLARE_API_TOKEN=<token> npm run eval:llm-summary -- --limit 2
```

Optional filters:

```sh
npm run eval:llm-summary -- --dry-run --source OpenCS --limit 5
npm run eval:llm-summary -- --dry-run --program-id CSE@Harvard
```

Options:

```txt
--limit <n>
--source <OpenCS|GlobalCS|CSGrad>
--program-id <ProgramID>
--model <Workers AI model id>
--gateway <AI Gateway id>
--dry-run
```

Notes:

- D1 sampling uses Wrangler login.
- AI calls require `CLOUDFLARE_API_TOKEN` or `CF_API_TOKEN`.
- Results are local and ignored by git.
- Failed AI requests are recorded in the output JSON instead of aborting the whole run.

## Current Test Result

Test sample:

```txt
OpenCS:docs/CSE@Harvard.md -> CSE@Harvard
model: @cf/meta/llama-3.3-70b-instruct-fp8-fast
usage: prompt_tokens=1125, completion_tokens=305, total_tokens=1430
validation: ok
```

Representative output:

```json
{
  "programId": "CSE@Harvard",
  "sourceKey": "OpenCS:docs/CSE@Harvard.md",
  "internalReviewOnly": false,
  "shouldUseForDraft": true,
  "oneSentenceSummaryZh": "哈佛CSE项目录取率略高于DS项目，非常偏好海本，注重科研和connection",
  "usefulSections": {
    "programOverview": [
      "CSE是计算科学与工程",
      "与应用数学接近"
    ],
    "curriculumAndStructure": [
      "必选2门CS课和3门应数/数值计算的课",
      "自选1年/1.5年/2年，是否完成thesis research"
    ],
    "admissionSignals": [
      "海本只要gpa高基本就很有戏",
      "科研经验和connection很重要"
    ],
    "applicationNotes": [
      "不允许通过Interfolio提交推荐信"
    ],
    "careerOrCostNotes": [
      "可以去MIT上课，每学期最多一半的学分能在MIT上"
    ],
    "representativeDpSummary": [
      "来源称海本可冲，陆本较难"
    ]
  },
  "risksAndConflicts": [
    "24fall疑似一个陆本ad都没有，需要确认"
  ],
  "missingInfoToVerify": [
    "具体的录取要求和流程"
  ],
  "promptNotes": [
    "项目特点：非常难，特别难"
  ]
}
```

Output file from the real local run:

```txt
outputs/llm-summary-evals/2026-06-16T08-46-11-669Z.json
```

## Matcher Finding From Summary Output

One sampled result revealed a matcher false positive:

```txt
sourceKey = GlobalCS:docs/Program/T0.5/EPFL MSDH.md
matchedProgramId = MSCS@EPFL
matchConfidence = 0.99
```

The source is about `MSDH` / Digital Humanities, while the matched OpenSIST program is `MSCS`. This should not be high confidence.

The LLM summary correctly marked the result as not suitable for draft use:

```json
{
  "programId": "MSCS@EPFL",
  "sourceKey": "GlobalCS:docs/Program/T0.5/EPFL MSDH.md",
  "internalReviewOnly": true,
  "shouldUseForDraft": false
}
```

This is useful as a second-line safety signal, but it should not replace deterministic matching. Before building `merge_drafts`, improve `src/matching/matcher.ts` so explicit program-code/name disagreements lower confidence.

## Prompt Iteration Notes

### Attempt 1

Model produced useful content but wrapped JSON in Markdown code fences and sometimes returned section headings instead of factual bullets.

Prompt fix:

- explicitly require first char `{` and last char `}`
- ban Markdown/code fences
- require complete factual summary sentences

### Attempt 2

Format improved, but model over-classified high-confidence matches as `shouldUseForDraft=false` and misread license handling.

Prompt fix:

- exact rule for `internalReviewOnly`
- high-confidence same-program match should default to `shouldUseForDraft=true`

### Attempt 3

License and draft eligibility improved. DP handling still needed tightening.

Prompt fix:

- DP must be summarized as patterns only
- if DP is too individual-specific, leave `representativeDpSummary` empty and list the risk

## Next Steps

1. Run 10-20 dry-run samples to choose evaluation targets.
2. Run 5-10 real summaries with the same prompt.
3. Review JSON validity, license handling, `shouldUseForDraft`, and DP summarization.
4. Add a `merge_drafts` table only after summary quality is acceptable.
5. Keep backend publishing separate and review-gated.
