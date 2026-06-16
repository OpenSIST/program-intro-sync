import type {Env, OpenSistProgram} from "../types";
import {sha256Hex} from "../utils/hash";

type ProgramListResponse = {
  data?: Record<string, RawProgram[]>;
};

type ProgramDescResponse = {
  data?: Record<string, string | null>;
};

type RawProgram = {
  ProgramID?: string;
  University?: string;
  Program?: string;
  Degree?: string;
  Region?: string[];
  TargetApplicantMajor?: string[];
};

const DESC_BATCH_SIZE = 50;

export async function fetchOpenSistPrograms(env: Env): Promise<OpenSistProgram[]> {
  const root = normalizedRoot(env.OPENSIST_API_ROOT);
  const programsResponse = await postJson<ProgramListResponse>(`${root}api/list/programs`, {}, env);
  const summaries = flattenPrograms(programsResponse.data ?? {});
  const descriptions = await fetchProgramDescriptions(root, summaries.map((program) => program.programId), env);
  return Promise.all(summaries.map(async (program) => {
    const descriptionMarkdown = descriptions[program.programId] ?? null;
    return {
      ...program,
      descriptionMarkdown,
      descriptionHash: descriptionMarkdown === null ? null : await sha256Hex(descriptionMarkdown),
    };
  }));
}

async function fetchProgramDescriptions(root: string, programIds: string[], env: Env): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  for (let index = 0; index < programIds.length; index += DESC_BATCH_SIZE) {
    const batch = programIds.slice(index, index + DESC_BATCH_SIZE);
    const response = await postJson<ProgramDescResponse>(`${root}api/query/program_description_batch`, {
      ProgramIDs: batch,
    }, env);
    Object.assign(result, response.data ?? {});
  }
  return result;
}

function flattenPrograms(programsByUniversity: Record<string, RawProgram[]>): Omit<OpenSistProgram, "descriptionHash">[] {
  return Object.entries(programsByUniversity).flatMap(([university, programs]) => (
    (programs ?? []).flatMap((program) => {
      const programName = program.Program;
      const programUniversity = program.University || university;
      const programId = program.ProgramID || (programName && programUniversity ? `${programName}@${programUniversity}` : "");
      if (!programId || !programName) {
        return [];
      }
      return [{
        programId,
        university: programUniversity,
        programName,
        degree: program.Degree,
        region: program.Region ?? [],
        targetApplicantMajor: program.TargetApplicantMajor ?? [],
        descriptionMarkdown: null,
      }];
    })
  ));
}

async function postJson<T>(url: string, body: unknown, env: Env): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.OPENSIST_COOKIE ? {cookie: env.OPENSIST_COOKIE} : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`OpenSIST request failed: ${response.status} ${response.statusText} (${url})`);
  }
  return response.json();
}

function normalizedRoot(root: string): string {
  return root.endsWith("/") ? root : `${root}/`;
}
