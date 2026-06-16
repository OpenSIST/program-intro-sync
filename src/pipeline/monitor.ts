import {SOURCE_CONFIGS} from "../config/sources";
import {MonitorRepository} from "../db/repository";
import {matchProgram, parseThresholds} from "../matching/matcher";
import {fetchOpenSistPrograms} from "../opensist/client";
import {discoverGitHubSource} from "../sources/github";
import type {Env, MonitorSummary, OpenSistProgram, SourceDocument, TriggerType} from "../types";

type MutableSummary = MonitorSummary;

export async function runMonitor(env: Env, triggerType: TriggerType): Promise<MonitorSummary> {
  const runId = crypto.randomUUID();
  const repository = new MonitorRepository(env.DB);
  const summary: MutableSummary = {
    runId,
    sourcesScanned: 0,
    documentsSeen: 0,
    eventsCreated: 0,
  };
  await repository.createRun(runId, triggerType);
  try {
    const programs = await fetchOpenSistPrograms(env);
    await syncOpenSistPrograms(repository, programs, summary);
    const thresholds = parseThresholds(env);
    for (const sourceConfig of SOURCE_CONFIGS) {
      const source = await repository.upsertSource(sourceConfig);
      const existingDocs = await repository.listDocumentsBySource(source.id);
      const discovery = await discoverGitHubSource(env, sourceConfig, existingDocs);
      summary.sourcesScanned += 1;
      summary.documentsSeen += discovery.docs.length;
      for (const doc of discovery.docs) {
        const previous = existingDocs.get(doc.sourceKey) ?? null;
        if (!doc.changed && previous) {
          await repository.touchDocument(previous.id);
          continue;
        }
        const saved = await repository.upsertSourceDocument(source, doc);
        await recordDocumentEvents(repository, previous, saved, summary);
        const previousMatch = await repository.getMatch(saved.id);
        const match = matchProgram(doc, programs, thresholds);
        await repository.upsertMatch(saved.id, match);
        await recordMatchEvents(repository, saved.id, previousMatch, match, summary);
      }
      await recordRemovedDocuments(repository, existingDocs, discovery.seenKeys, summary);
    }
    await repository.finishRun(runId, summary);
    return summary;
  } catch (error) {
    await repository.failRun(runId, error);
    throw error;
  }
}

async function syncOpenSistPrograms(
  repository: MonitorRepository,
  programs: OpenSistProgram[],
  summary: MutableSummary,
): Promise<void> {
  for (const program of programs) {
    const result = await repository.upsertProgram(program);
    if (result.changed) {
      await countEvent(summary, repository.insertEvent({
        eventKey: `opensist_program_changed:${program.programId}:${program.descriptionHash ?? "no-desc"}`,
        eventType: "opensist_program_changed",
        matchedProgramId: program.programId,
        previousHash: result.previous?.descriptionHash ?? null,
        currentHash: program.descriptionHash,
        previousValue: result.previous,
        currentValue: program,
      }));
    }
    if (result.descriptionChanged) {
      await countEvent(summary, repository.insertEvent({
        eventKey: `opensist_description_changed:${program.programId}:${program.descriptionHash ?? "no-desc"}`,
        eventType: "opensist_description_changed",
        matchedProgramId: program.programId,
        previousHash: result.previous?.descriptionHash ?? null,
        currentHash: program.descriptionHash,
      }));
    }
  }
}

async function recordDocumentEvents(
  repository: MonitorRepository,
  previous: SourceDocument | null,
  saved: SourceDocument,
  summary: MutableSummary,
): Promise<void> {
  if (!previous || previous.deleted_at) {
    await countEvent(summary, repository.insertEvent({
      eventKey: `source_new:${saved.source_key}:${saved.content_hash}`,
      sourceDocumentId: saved.id,
      eventType: "source_new",
      previousHash: previous?.content_hash ?? null,
      currentHash: saved.content_hash,
    }));
    return;
  }
  if (previous.content_hash !== saved.content_hash || previous.blob_sha !== saved.blob_sha) {
    await countEvent(summary, repository.insertEvent({
      eventKey: `source_changed:${saved.source_key}:${saved.content_hash}`,
      sourceDocumentId: saved.id,
      eventType: "source_changed",
      previousHash: previous.content_hash,
      currentHash: saved.content_hash,
    }));
  }
  if (previous.license_label !== saved.license_label) {
    await countEvent(summary, repository.insertEvent({
      eventKey: `license_changed:${saved.source_key}:${saved.license_label}`,
      sourceDocumentId: saved.id,
      eventType: "license_changed",
      previousValue: previous.license_label,
      currentValue: saved.license_label,
    }));
  }
}

async function recordMatchEvents(
  repository: MonitorRepository,
  sourceDocumentId: number,
  previous: {
    matched_program_id: string | null;
    confidence: number;
    status: string;
  } | null,
  current: {
    matchedProgramId: string | null;
    confidence: number;
    status: string;
  },
  summary: MutableSummary,
): Promise<void> {
  if (!previous) {
    return;
  }
  if (previous.matched_program_id !== current.matchedProgramId) {
    await countEvent(summary, repository.insertEvent({
      eventKey: `match_changed:${sourceDocumentId}:${previous.matched_program_id ?? "none"}:${current.matchedProgramId ?? "none"}`,
      sourceDocumentId,
      eventType: "match_changed",
      matchedProgramId: current.matchedProgramId,
      previousValue: previous,
      currentValue: current,
    }));
  } else if (previous.status !== current.status) {
    await countEvent(summary, repository.insertEvent({
      eventKey: `match_confidence_changed:${sourceDocumentId}:${previous.status}:${current.status}`,
      sourceDocumentId,
      eventType: "match_confidence_changed",
      matchedProgramId: current.matchedProgramId,
      previousValue: previous,
      currentValue: current,
    }));
  }
}

async function recordRemovedDocuments(
  repository: MonitorRepository,
  existingDocs: Map<string, SourceDocument>,
  seenKeys: Set<string>,
  summary: MutableSummary,
): Promise<void> {
  for (const document of existingDocs.values()) {
    if (document.deleted_at || seenKeys.has(document.source_key)) {
      continue;
    }
    await repository.markDocumentDeleted(document);
    await countEvent(summary, repository.insertEvent({
      eventKey: `source_removed:${document.source_key}:${document.content_hash}`,
      sourceDocumentId: document.id,
      eventType: "source_removed",
      previousHash: document.content_hash,
      currentHash: null,
    }));
  }
}

async function countEvent(summary: MutableSummary, result: Promise<boolean>): Promise<void> {
  if (await result) {
    summary.eventsCreated += 1;
  }
}
