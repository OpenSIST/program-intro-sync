# Backend Publish API

## Decision

OpenSIST program descriptions live in the backend database, not in the frontend repository. Therefore, GitHub PRs to `OpenSIST.github.io` are not the right primary publishing path for merged descriptions.

The preferred path is:

```txt
monitor events
-> merge_drafts
-> human review
-> backend API publish
-> backend database updates program description
```

The monitor remains read-only. Publishing should be implemented as a separate reviewed step.

## Why Not PR First

A PR is useful only if the target repository owns the source of truth. For program descriptions, the source of truth is the backend database. A frontend PR would only be useful as a review artifact, not as the publishing mechanism.

## Proposed Backend Flow

### 1. Draft Creation

A future merge worker reads pending D1 events and writes `merge_drafts`.

Draft state should include:

```txt
program_id
source_event_ids
current_description_hash
draft_markdown
source_attributions_json
conflicts_json
risk_level
status
created_at
reviewed_at
published_at
backend_response_json
```

Suggested statuses:

```txt
pending_review
approved
rejected
published
publish_failed
```

### 2. Human Review

Only reviewed drafts should be eligible for backend publishing.

The reviewer should be able to:

- inspect the current OpenSIST description
- inspect incoming source links and licenses
- inspect the LLM draft and conflicts
- edit the final Markdown
- approve or reject the draft

### 3. Backend Publish

After approval, a publisher calls a backend admin API.

Preferred endpoint shape:

```txt
POST /api/admin/program_descriptions/publish
```

Suggested request:

```json
{
  "programId": "MSCS@Duke",
  "descriptionMarkdown": "## 项目介绍\n...",
  "baseDescriptionHash": "sha256-of-description-before-draft",
  "sourceEventIds": [1, 2, 3],
  "sourceAttributions": [
    {
      "source": "CSGrad",
      "sourceUrl": "https://github.com/csms-apply/csgrad/blob/<commit>/docs/A+/Duke%20mscs.md",
      "sourceCommit": "<commit>",
      "license": "CHECK_SOURCE_LICENSE"
    }
  ],
  "review": {
    "reviewer": "admin@example.com",
    "reviewedAt": "2026-06-16T00:00:00Z"
  }
}
```

Suggested response:

```json
{
  "ok": true,
  "programId": "MSCS@Duke",
  "newDescriptionHash": "sha256-of-new-description",
  "updatedAt": "2026-06-16T00:00:01Z"
}
```

## Backend Safety Requirements

The backend should enforce:

- authentication and authorization for admin/bot publishing
- `baseDescriptionHash` optimistic concurrency check
- server-side validation that `programId` exists
- Markdown size limit
- audit log with reviewer, source event IDs, and timestamp
- rejection of publishes when the current backend description has changed since draft creation

The bot should not receive broad production write access. It only needs the specific publish endpoint after review.

## API Alternatives

If backend owners prefer an import job instead of a live admin endpoint:

```txt
POST /api/admin/program_description_import_jobs
```

The job can accept an approved batch and apply it asynchronously. This is safer for large batches and easier to audit.

If the backend repo owns migrations or seed data, a PR to the backend repo can be used as an implementation detail. It should still not be a PR to the frontend repo.

## Current MVP Status

Current code does not publish to the backend.

Current code only writes:

- `source_documents`
- `program_matches`
- `opensist_program_snapshots`
- `description_change_events`
- `monitor_runs`

Backend publishing should be added only after `merge_drafts` and review flow exist.
