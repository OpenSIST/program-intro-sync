# LLM Merge Policy

## Principle

The LLM generates review drafts only. It does not publish descriptions, write backend data, or decide factual conflicts.

Publishing is a separate reviewed backend API step. See `docs/backend-publish-api.md`.

## Merge Eligibility

Generate a draft only when:

- Source document is matched to an OpenSIST `ProgramID` with high confidence.
- Source license is known or explicitly marked for internal review only.
- The source document is new or meaningfully changed.
- The document is about one specific program, not a broad application guide.

Send to manual review without merge when:

- Match confidence is low or ambiguous.
- The current OpenSIST description is already detailed and the source conflicts with it.
- Source content is mostly subjective, outdated, or DP-only.
- Source license is missing and the draft would copy substantial text.

Skip when:

- The document is navigation, index, README, or changelog.
- Content is too short to be useful.
- It cannot be tied to a school/program.

## Required Output Schema

LLM providers should return JSON:

```json
{
  "shouldMerge": true,
  "riskLevel": "low",
  "reason": "Source adds missing application notes and representative DP.",
  "mergedMarkdown": "## 项目介绍\n...",
  "conflicts": [
    {
      "topic": "项目时长",
      "existing": "1.5 years",
      "incoming": "2 years",
      "recommendation": "needs_review"
    }
  ],
  "sourceAttributions": [
    {
      "section": "录取偏好/条件",
      "sources": ["OpenCS:docs/CS Align@NEU.md@d3e4bc3"]
    }
  ]
}
```

## Target Markdown Sections

Drafts should use this section order when applicable:

```md
## 项目介绍

## 录取偏好/条件

## 课程与项目特点

## 申请注意事项

## 就业/去向信息

## 代表性 DP

## 冲突与待确认信息

## 外部资料来源
```

Empty sections should be omitted.

## Factual Rules

- Preserve OpenSIST current description unless there is a clear reason to reorganize it.
- Do not overwrite existing OpenSIST claims with external claims.
- If sources conflict, add a conflict note instead of resolving it.
- Time-sensitive claims must include year or application cycle when available.
- DP should be framed as examples, not admission rules.
- The model must not add school facts that are not in input sources.
- The draft must contain source attribution links.

## Prompt Shape

The merge prompt should include:

```txt
System:
You are producing a review draft for OpenSIST. Use only supplied sources.

Inputs:
- OpenSIST current description
- Incoming source docs with source URL, commit, license
- Known matched ProgramID
- Required output schema

Instructions:
- Merge only source-supported content.
- Preserve attribution.
- Report conflicts.
- Return strict JSON.
```

## Provider Abstraction

Implement a provider interface:

```ts
type MergeProvider = {
  name: string;
  merge(input: MergeInput): Promise<MergeResult>;
};
```

Providers:

- `mock`: deterministic local output for testing
- `deepseek`: user-provided API key
- `qwen`: user-provided API key

The pipeline should work with `mock` before real LLM APIs are configured.

## Validation

After LLM output:

- Parse JSON strictly.
- Reject missing `mergedMarkdown` when `shouldMerge=true`.
- Reject markdown without source attribution.
- Reject output containing unsupported provider commentary.
- Force manual review when `riskLevel=high` or conflicts are non-empty.

## Publish Boundary

After validation, the merge worker may write a draft row, but it must not call the backend publish API directly.

Only an approved draft should be eligible for backend publishing. The publisher should send the reviewed Markdown, source attributions, event IDs, and base description hash to the backend API so the backend can perform authorization, concurrency checks, and audit logging.
