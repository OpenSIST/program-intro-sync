import type {
  MatchStatus,
  OpenSistProgram,
  ProgramMatch,
  SourceConfig,
  SourceDoc,
  SourceDocument,
  SourceRecord,
  TriggerType,
} from "../types";

type EventInput = {
  eventKey: string;
  sourceDocumentId?: number | null;
  eventType:
    | "source_new"
    | "source_changed"
    | "source_removed"
    | "match_changed"
    | "match_confidence_changed"
    | "opensist_program_changed"
    | "opensist_description_changed"
    | "license_changed";
  matchedProgramId?: string | null;
  previousHash?: string | null;
  currentHash?: string | null;
  previousValue?: unknown;
  currentValue?: unknown;
};

export class MonitorRepository {
  constructor(private readonly db: D1Database) {}

  async createRun(runId: string, triggerType: TriggerType): Promise<void> {
    await this.db.prepare(
      `insert into monitor_runs (run_id, trigger_type, status)
       values (?, ?, 'running')`,
    ).bind(runId, triggerType).run();
  }

  async finishRun(runId: string, summary: {
    sourcesScanned: number;
    documentsSeen: number;
    eventsCreated: number;
  }): Promise<void> {
    await this.db.prepare(
      `update monitor_runs
       set status = 'success',
           finished_at = current_timestamp,
           sources_scanned = ?,
           documents_seen = ?,
           events_created = ?
       where run_id = ?`,
    ).bind(summary.sourcesScanned, summary.documentsSeen, summary.eventsCreated, runId).run();
  }

  async failRun(runId: string, error: unknown): Promise<void> {
    await this.db.prepare(
      `update monitor_runs
       set status = 'failed',
           finished_at = current_timestamp,
           error_message = ?
       where run_id = ?`,
    ).bind(error instanceof Error ? error.message : String(error), runId).run();
  }

  async listRuns(limit = 20): Promise<unknown[]> {
    const result = await this.db.prepare(
      `select *
       from monitor_runs
       order by started_at desc
       limit ?`,
    ).bind(limit).all();
    return result.results ?? [];
  }

  async listEvents(status = "pending", limit = 100): Promise<unknown[]> {
    const result = await this.db.prepare(
      `select e.*, d.source_key, d.source_path, d.source_url, d.title
       from description_change_events e
       left join source_documents d on d.id = e.source_document_id
       where e.status = ?
       order by e.created_at asc
       limit ?`,
    ).bind(status, limit).all();
    return result.results ?? [];
  }

  async markEvent(id: number, status: "acknowledged" | "ignored" | "consumed"): Promise<void> {
    await this.db.prepare(
      `update description_change_events
       set status = ?,
           consumed_at = case when ? = 'consumed' then current_timestamp else consumed_at end
       where id = ?`,
    ).bind(status, status, id).run();
  }

  async upsertSource(config: SourceConfig): Promise<SourceRecord> {
    await this.db.prepare(
      `insert into sources (name, type, repo_url, default_branch, license_label, enabled)
       values (?, ?, ?, ?, ?, 1)
       on conflict(name) do update set
         type = excluded.type,
         repo_url = excluded.repo_url,
         default_branch = excluded.default_branch,
         license_label = excluded.license_label,
         enabled = 1,
         updated_at = current_timestamp`,
    ).bind(
      config.name,
      config.type,
      config.repoUrl,
      config.branch,
      config.licenseLabel,
    ).run();
    const source = await this.db.prepare(
      `select * from sources where name = ?`,
    ).bind(config.name).first<SourceRecord>();
    if (!source) {
      throw new Error(`Failed to load source after upsert: ${config.name}`);
    }
    return source;
  }

  async listDocumentsBySource(sourceId: number): Promise<Map<string, SourceDocument>> {
    const result = await this.db.prepare(
      `select * from source_documents where source_id = ?`,
    ).bind(sourceId).all<SourceDocument>();
    return new Map((result.results ?? []).map((row) => [row.source_key, row]));
  }

  async touchDocument(documentId: number): Promise<void> {
    await this.db.prepare(
      `update source_documents
       set last_seen_at = current_timestamp,
           deleted_at = null
       where id = ?`,
    ).bind(documentId).run();
  }

  async upsertSourceDocument(source: SourceRecord, doc: SourceDoc): Promise<SourceDocument> {
    await this.db.prepare(
      `insert into source_documents (
         source_id,
         source_key,
         source_path,
         source_url,
         source_commit,
         blob_sha,
         title,
         content_hash,
         content_length,
         text_preview,
         license_label,
         last_seen_at,
         deleted_at,
         parse_status
       )
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, current_timestamp, null, 'ok')
       on conflict(source_key) do update set
         source_id = excluded.source_id,
         source_path = excluded.source_path,
         source_url = excluded.source_url,
         source_commit = excluded.source_commit,
         blob_sha = excluded.blob_sha,
         title = excluded.title,
         content_hash = excluded.content_hash,
         content_length = excluded.content_length,
         text_preview = excluded.text_preview,
         license_label = excluded.license_label,
         last_seen_at = current_timestamp,
         deleted_at = null,
         parse_status = 'ok',
         parse_error = null`,
    ).bind(
      source.id,
      doc.sourceKey,
      doc.sourcePath,
      doc.sourceUrl,
      doc.sourceCommit,
      doc.blobSha,
      doc.title,
      doc.contentHash,
      doc.contentLength,
      doc.textPreview,
      doc.license,
    ).run();
    const row = await this.db.prepare(
      `select * from source_documents where source_key = ?`,
    ).bind(doc.sourceKey).first<SourceDocument>();
    if (!row) {
      throw new Error(`Failed to load source document after upsert: ${doc.sourceKey}`);
    }
    return row;
  }

  async markDocumentDeleted(document: SourceDocument): Promise<void> {
    await this.db.prepare(
      `update source_documents
       set deleted_at = current_timestamp
       where id = ? and deleted_at is null`,
    ).bind(document.id).run();
  }

  async upsertProgram(program: OpenSistProgram): Promise<{
    previous: OpenSistProgram | null;
    changed: boolean;
    descriptionChanged: boolean;
  }> {
    const previous = await this.db.prepare(
      `select program_id, university, program_name, degree, region_json,
              target_applicant_major_json, description_hash
       from opensist_program_snapshots
       where program_id = ?`,
    ).bind(program.programId).first<{
      program_id: string;
      university: string;
      program_name: string;
      degree: string | null;
      region_json: string | null;
      target_applicant_major_json: string | null;
      description_hash: string | null;
    }>();
    const previousProgram = previous ? {
      programId: previous.program_id,
      university: previous.university,
      programName: previous.program_name,
      degree: previous.degree ?? undefined,
      region: parseJsonArray(previous.region_json),
      targetApplicantMajor: parseJsonArray(previous.target_applicant_major_json),
      descriptionHash: previous.description_hash,
    } : null;
    await this.db.prepare(
      `insert into opensist_program_snapshots (
         program_id,
         university,
         program_name,
         degree,
         region_json,
         target_applicant_major_json,
         description_hash,
         seen_at
       )
       values (?, ?, ?, ?, ?, ?, ?, current_timestamp)
       on conflict(program_id) do update set
         university = excluded.university,
         program_name = excluded.program_name,
         degree = excluded.degree,
         region_json = excluded.region_json,
         target_applicant_major_json = excluded.target_applicant_major_json,
         description_hash = excluded.description_hash,
         seen_at = current_timestamp`,
    ).bind(
      program.programId,
      program.university,
      program.programName,
      program.degree ?? null,
      JSON.stringify(program.region ?? []),
      JSON.stringify(program.targetApplicantMajor ?? []),
      program.descriptionHash,
    ).run();
    return {
      previous: previousProgram,
      changed: Boolean(previousProgram && (
        previousProgram.university !== program.university ||
        previousProgram.programName !== program.programName ||
        previousProgram.degree !== program.degree ||
        JSON.stringify(previousProgram.region ?? []) !== JSON.stringify(program.region ?? []) ||
        JSON.stringify(previousProgram.targetApplicantMajor ?? []) !== JSON.stringify(program.targetApplicantMajor ?? [])
      )),
      descriptionChanged: Boolean(previousProgram && previousProgram.descriptionHash !== program.descriptionHash),
    };
  }

  async listProgramSnapshots(): Promise<Map<string, OpenSistProgram>> {
    const result = await this.db.prepare(
      `select program_id, university, program_name, degree, region_json,
              target_applicant_major_json, description_hash
       from opensist_program_snapshots`,
    ).all<{
      program_id: string;
      university: string;
      program_name: string;
      degree: string | null;
      region_json: string | null;
      target_applicant_major_json: string | null;
      description_hash: string | null;
    }>();
    return new Map((result.results ?? []).map((row) => [row.program_id, {
      programId: row.program_id,
      university: row.university,
      programName: row.program_name,
      degree: row.degree ?? undefined,
      region: parseJsonArray(row.region_json),
      targetApplicantMajor: parseJsonArray(row.target_applicant_major_json),
      descriptionHash: row.description_hash,
    }]));
  }

  async upsertPrograms(programs: OpenSistProgram[]): Promise<void> {
    const statement = this.db.prepare(
      `insert into opensist_program_snapshots (
         program_id,
         university,
         program_name,
         degree,
         region_json,
         target_applicant_major_json,
         description_hash,
         seen_at
       )
       values (?, ?, ?, ?, ?, ?, ?, current_timestamp)
       on conflict(program_id) do update set
         university = excluded.university,
         program_name = excluded.program_name,
         degree = excluded.degree,
         region_json = excluded.region_json,
         target_applicant_major_json = excluded.target_applicant_major_json,
         description_hash = excluded.description_hash,
         seen_at = current_timestamp`,
    );
    for (let index = 0; index < programs.length; index += 50) {
      const chunk = programs.slice(index, index + 50);
      await this.db.batch(chunk.map((program) => statement.bind(
        program.programId,
        program.university,
        program.programName,
        program.degree ?? null,
        JSON.stringify(program.region ?? []),
        JSON.stringify(program.targetApplicantMajor ?? []),
        program.descriptionHash,
      )));
    }
  }

  async getMatch(sourceDocumentId: number): Promise<{
    matched_program_id: string | null;
    confidence: number;
    status: MatchStatus;
  } | null> {
    return this.db.prepare(
      `select matched_program_id, confidence, status
       from program_matches
       where source_document_id = ?`,
    ).bind(sourceDocumentId).first();
  }

  async upsertMatch(sourceDocumentId: number, match: ProgramMatch): Promise<void> {
    await this.db.prepare(
      `insert into program_matches (
         source_document_id,
         matched_program_id,
         confidence,
         reasons_json,
         alternatives_json,
         status,
         matched_at
       )
       values (?, ?, ?, ?, ?, ?, current_timestamp)
       on conflict(source_document_id) do update set
         matched_program_id = excluded.matched_program_id,
         confidence = excluded.confidence,
         reasons_json = excluded.reasons_json,
         alternatives_json = excluded.alternatives_json,
         status = excluded.status,
         matched_at = current_timestamp`,
    ).bind(
      sourceDocumentId,
      match.matchedProgramId,
      match.confidence,
      JSON.stringify(match.reasons),
      JSON.stringify(match.alternatives),
      match.status,
    ).run();
  }

  async insertEvent(event: EventInput): Promise<boolean> {
    const result = await this.db.prepare(
      `insert or ignore into description_change_events (
         event_key,
         source_document_id,
         event_type,
         matched_program_id,
         previous_hash,
         current_hash,
         previous_value_json,
         current_value_json
       )
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      event.eventKey,
      event.sourceDocumentId ?? null,
      event.eventType,
      event.matchedProgramId ?? null,
      event.previousHash ?? null,
      event.currentHash ?? null,
      event.previousValue === undefined ? null : JSON.stringify(event.previousValue),
      event.currentValue === undefined ? null : JSON.stringify(event.currentValue),
    ).run();
    return (result.meta.changes ?? 0) > 0;
  }
}

function parseJsonArray(value: string | null): string[] | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
