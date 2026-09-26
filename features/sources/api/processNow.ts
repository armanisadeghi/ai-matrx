"use client";

/**
 * features/sources/api/processNow.ts
 *
 * "Process now" for a Source whose processing the door deferred (or whose
 * kind the policy never processes) — the person's explicit override. Runs the
 * existing per-document stage routes in order and reports the first failure
 * in words. A file's canonical extract runs the whole pipeline (it may need
 * re-extraction); every other Source already HAS its text, so it runs
 * clean → chunk → embed.
 */

import { runStageStream, type StageName } from "@/features/rag/api/stages";

export interface ProcessNowResult {
  ok: boolean;
  /** Plain sentence for the toast. */
  message: string;
}

const STAGE_WORDS: Record<StageName, string> = {
  extract: "reading its pages",
  clean: "cleaning it",
  chunk: "making it searchable",
  embed: "indexing it",
  run_all: "processing it",
};

export async function processSourceNow(
  processedDocumentId: string,
  options: { isFileExtract: boolean; signal?: AbortSignal },
): Promise<ProcessNowResult> {
  const stages: StageName[] = options.isFileExtract ? ["run_all"] : ["clean", "chunk", "embed"];
  for (const stage of stages) {
    for await (const ev of runStageStream(processedDocumentId, stage, { signal: options.signal })) {
      if (ev.event === "stage.error") {
        const reason = typeof ev.data?.message === "string" && ev.data.message ? ev.data.message : "the server did not say why";
        return { ok: false, message: `Processing stopped while ${STAGE_WORDS[stage]}: ${reason}.` };
      }
    }
  }
  return { ok: true, message: "Processed: cleaned, searchable and indexed." };
}
