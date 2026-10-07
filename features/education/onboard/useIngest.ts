// features/education/onboard/useIngest.ts
//
// The front door's reading step: the Sources the person picked in the ONE
// Source input (`features/resource-manager/source-input`) → a
// `NormalizedIngest` — their grounded text + the durable `cld_files` anchor
// every kit artifact links back to. The text comes from the ONE server step
// (`POST /sources/resolve`, via `useSourceSet().resolve()`); every way new
// material becomes a Source (upload, paste, web page, YouTube, recording,
// image) is the Source input's, never this file's.
//
// The anchor: one Source with a stored file behind it anchors on THAT file
// (so a second run over it merges into the same kit); anything else is kept
// as one `.md` file the person owns (`anchorText`) — `kitSources.ts`.

"use client";

import { useCallback } from "react";
import type { ResolvedSourceSet } from "@ai-matrx/agents/sources";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { formatFileSize } from "@ai-matrx/kit/format";
import { knobInt } from "@/lib/knobs/featureKnobs";
import { KIT_KNOB_FEATURE } from "@/features/education/convert/coverage";
import { kitFileAnchor, kitMaterialFromSources, kitSourceRefs } from "./kitSources";
import type { NormalizedIngest, IngestProgress } from "./types";

/**
 * Source ceiling, in characters.
 *
 * Generation is SEGMENTED (`convert/coverage.ts`) — no model ever sees the
 * whole material at once — so the ceiling is not a context limit. It is a
 * blast-radius backstop, it lives in `platform.feature_knob`, and whatever it
 * cuts is reported LOUDLY (see `KitBoard`).
 */
async function clampToKnob(
  text: string,
): Promise<{ text: string; truncated: boolean; limit: number }> {
  const limit = await knobInt(KIT_KNOB_FEATURE, "max_source_chars");
  if (text.length <= limit) return { text, truncated: false, limit };
  return { text: text.slice(0, limit), truncated: true, limit };
}

/** Byte-accurate upload reporting for the anchor copy. */
function uploadProgressReporter(
  label: string,
  onProgress?: (p: IngestProgress) => void,
): ((loaded: number, total: number) => void) | undefined {
  if (!onProgress) return undefined;
  return (loaded, total) => {
    const ratio = total > 0 ? Math.min(1, loaded / total) : undefined;
    onProgress({
      phase: "uploading",
      message: label,
      ratio,
      detail:
        total > 0
          ? `${formatFileSize(loaded)} of ${formatFileSize(total)}`
          : formatFileSize(loaded),
    });
  };
}

export interface UseIngestResult {
  /** Resolve the picked Sources (the caller's `useSourceSet().resolve`) into the kit's material. */
  normalizeSources: (
    resolve: () => Promise<ResolvedSourceSet>,
    onProgress?: (p: IngestProgress) => void,
    /**
     * The anchor an interrupted run of this kit already used. A continued kit
     * keeps it — the multi-Source `.md` copy is never made twice, so every
     * artifact stays in the one kit.
     */
    keepAnchor?: NormalizedIngest["ref"],
    /**
     * `false`: keep NO merged `.md` copy — a multi-source kit holds each
     * Source itself (`kits/kitScope.ts`). Default `true` (the manual kit
     * creator still anchors on one file).
     */
    options?: { copyAnchor?: boolean },
  ) => Promise<NormalizedIngest>;
}

export function useIngest(): UseIngestResult {
  const { upload } = useFileUpload();

  /** Persist arbitrary extracted text as a durable `.md` file the user owns. */
  const anchorText = useCallback(
    async (
      text: string,
      title: string,
      onProgress?: (p: IngestProgress) => void,
    ): Promise<string | undefined> => {
      const safe = title.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_").slice(0, 60) || "source";
      const blob = new Blob([text], { type: "text/markdown" });
      const file = new File([blob], `${safe}.md`, { type: "text/markdown" });
      // 🚨 THE ANCHOR IS LINEAGE, NOT THE PAYLOAD — IT MAY NEVER SINK THE INGEST.
      //
      // This copy exists so a kit's artifacts can link a `source` edge back to
      // what they were built from. Useful; not the thing the person asked for.
      // The thing they asked for is the text they already handed us, which is
      // in `text` right now and needs nothing from storage.
      //
      // It used to `await upload(...)` bare, so a storage outage threw straight
      // out of `normalize()` and the whole study kit died — and what the person
      // saw was `file upload failed — ClientError: An error occurred
      // (InvalidAccessKeyId) when calling the PutObject operation`. On
      // 2026-09-20 that ran for 91 minutes (21:19:35Z-22:49:51Z, 18 captured
      // errors across /education/start and /chat) while somebody was PASTING
      // TEXT and had uploaded nothing at all. Two lies in one sentence: it
      // named a file the person never chose, and it read as their fault.
      //
      // The path below already tolerated a missing anchor — `ref.fileId` is
      // `string | undefined` and every downstream reader handles it. Only the
      // THROW was fatal. So a storage failure now degrades exactly like a
      // missing fileId: loudly, to us, and invisibly to the person's outcome.
      let result: Awaited<ReturnType<typeof upload>> | null = null;
      try {
        result = await upload(
          { kind: "file", file },
          { onProgress: uploadProgressReporter(`Saving ${title}…`, onProgress) },
        );
      } catch (cause) {
        captureError({
          source: "runtime-exception",
          operation: "insert",
          relation: "education/onboard/anchor-source",
          message: `Education ingest could not archive its source copy: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
          // What the person would be told IF we told them. Never the storage
          // provider's sentence, and never the word "upload" on a paste.
          userMessage:
            "Your notes are safe and your study kit is being built — we just couldn't keep a copy of the original source.",
          // The kit is built from text we are still holding. Nothing is lost
          // except the lineage edge, which re-anchors on the next ingest.
          recoverable: true,
          raw: cause,
        });
        return undefined;
      }
      if (!result.fileId) {
        // Same outcome by a different route: the call succeeded but handed
        // back no id, so there is still nothing to hang a lineage edge on.
        captureError({
          source: "runtime-exception",
          operation: "insert",
          relation: "education/onboard/anchor-source",
          message:
            "Education ingest anchor upload returned no fileId — kit artifacts will have no source lineage.",
          userMessage:
            "Your notes are safe and your study kit is being built — we just couldn't keep a copy of the original source.",
          recoverable: true,
        });
      }
      return result.fileId;
    },
    [upload],
  );

  const normalizeSources = useCallback(
    async (
      resolve: () => Promise<ResolvedSourceSet>,
      onProgress?: (p: IngestProgress) => void,
      keepAnchor?: NormalizedIngest["ref"],
      options?: { copyAnchor?: boolean },
    ): Promise<NormalizedIngest> => {
      onProgress?.({ phase: "extracting", message: "Reading your sources…" });
      const resolved = await resolve();
      const material = kitMaterialFromSources(resolved);
      const dropped = resolved.dropped.map(
        (d) => d.detail ?? `One source was left out (${d.reason.replace("_", " ")}).`,
      );
      const notes = [
        ...dropped,
        ...material.sources.flatMap((s) => s.notes.map((n) => `${s.label}: ${n}`)),
      ];
      const anchor = kitFileAnchor(resolved);
      let fileId = keepAnchor ? keepAnchor.fileId : anchor?.fileId;
      if (!fileId && !keepAnchor && options?.copyAnchor !== false) {
        onProgress?.({ phase: "uploading", message: "Saving the material…" });
        fileId = await anchorText(material.text, material.title, onProgress);
      }
      const { text, truncated } = await clampToKnob(material.text);
      const kitSources = kitSourceRefs(resolved);
      return {
        text,
        title: material.title,
        ref: keepAnchor
          ? { ...keepAnchor, kitSources: keepAnchor.kitSources ?? kitSources }
          : anchor
            ? { kind: "file", fileId, processedDocumentId: anchor.processedDocumentId, kitSources }
            : { kind: "paste", ...(fileId ? { fileId } : {}), kitSources },
        meta: {
          chars: text.length,
          pages: material.pages,
          extractionMethod: "sources",
          truncated: truncated || material.truncated,
          sourceCount: material.sourceCount,
          notes,
          sourceTitles: material.sources.map((src) => src.label),
        },
      };
    },
    [anchorText],
  );

  return { normalizeSources };
}
