"use client";

/**
 * useInstantAnalysis — the INSTANT lane of product capture (the client-side
 * A/B test of the process modes):
 *
 * - SERVER lane: `closeItem()` flips status `capturing → captured` and the
 *   DB workflow trigger runs the pipeline server-side (`service.ts`).
 * - INSTANT lane (this hook): "Process" runs the intake-analysis agent from
 *   the browser through the MANDATE `product_capture.instant_analysis` — the
 *   agent identity lives in the DATABASE, never here — and streams the
 *   `electronics_intake_analysis` kind straight back into the capture UI.
 *
 * Built on the canonical primitives, nothing hand-rolled:
 * - `useLiveAgentRun` (headless-JSON runner in live posture) launches the
 *   mandate, keeps the conversation alive for the streaming display, and
 *   resolves with the structured result.
 * - The item's photos attach as multimodal message parts via
 *   `fileHandler.toContentPart` (the fastfire grade recipe) — never smuggled
 *   through `user_input`.
 * - THE PERSISTENCE SEAM (`onResult`) saves the result as the item's
 *   `instant_analysis` payload and marks the item `processed` the instant the
 *   run settles — a closed sheet or route change can't lose a paid answer.
 *   `capturing → processed` skips `captured`, so the server-side workflow
 *   trigger never double-processes an instant item (`markProcessed`).
 */

import { useCallback, useState } from "react";

import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import {
  isSourceFeature,
  type SourceFeature,
} from "@/features/agents/types/instance.types";
import { fileHandler } from "@/features/files/handler/handler";

import type { CaptureItem } from "../types";
import { listItemFiles, markProcessed } from "../service";
import { loadPipelineItem, savePayload } from "../pipeline-service";

/** The one mandate key of this lane — resolved in the DB, rebindable there. */
export const INSTANT_ANALYSIS_MANDATE_KEY = "product_capture.instant_analysis";

/**
 * Durable producer attribution for this lane. `mandate:<feature>.<key>` is a
 * registry-blessed pattern (`SOURCE_FEATURE_PATTERNS`), narrowed through the
 * platform's own guard rather than a blind cast — a key drifting off the
 * pattern fails at module init, loudly.
 */
function mandateSourceFeature(key: string): SourceFeature {
  const value = `mandate:${key}`;
  if (!isSourceFeature(value)) {
    throw new Error(
      `product-capture: "${value}" does not match a registered source-feature pattern`,
    );
  }
  return value;
}
const INSTANT_SOURCE_FEATURE = mandateSourceFeature(
  INSTANT_ANALYSIS_MANDATE_KEY,
);

export interface UseInstantAnalysisResult {
  /**
   * Run the instant analysis on the item's uploaded photos. Resolves when the
   * run settles (the result is already persisted by then). Throws with a
   * user-readable message when the item has no photos or the run fails —
   * the live display keeps the partial stream + error visible either way.
   */
  process: (item: CaptureItem) => Promise<void>;
  isRunning: boolean;
  /** The last run error (also rendered inside the live display). */
  error: string | null;
  /** Live handle for `<LiveRunDisplay conversationId={…} />`. */
  conversationId: string | null;
  /** Gate the display mount on THIS (see useLiveAgentRun). */
  hasLiveRun: boolean;
  /** True once the current run's result was saved to the item. */
  saved: boolean;
  dismiss: () => void;
}

export function useInstantAnalysis(): UseInstantAnalysisResult {
  const live = useLiveAgentRun();
  const [saved, setSaved] = useState(false);

  const process = useCallback(
    async (item: CaptureItem) => {
      setSaved(false);

      // The analyzer reads PHOTOS. Uploaded files are the source of truth
      // (covers items resumed from earlier sessions, not just this visit's
      // artifacts); the caller gates on pending uploads finishing.
      const files = await listItemFiles(item.id);
      const photos = files.filter((f) => f.kind === "photo");
      if (photos.length === 0) {
        throw new Error("Take at least one photo before processing.");
      }

      const parts = await Promise.all(
        photos.map((photo) =>
          fileHandler.toContentPart({ kind: "file_id", fileId: photo.fileId }),
        ),
      );

      const notes = item.notes?.trim();

      await live.run({
        mandateKey: INSTANT_ANALYSIS_MANDATE_KEY,
        surfaceKey: `product-capture-instant:${item.id}`,
        sourceFeature: INSTANT_SOURCE_FEATURE,
        organizationId: item.organizationId,
        initiation: "user",
        // The agent's one declared variable; omit entirely when empty so the
        // agent's own "None provided." default applies.
        ...(notes ? { variables: { dock_notes: notes } } : {}),
        messageParts: parts,
        failureMessages: {
          noJson:
            "The analysis finished but returned no structured record — try again.",
        },
        // THE PERSISTENCE SEAM: runs on every exit path, before the promise
        // resolves, so the paid result survives any UI lifecycle.
        onResult: async (result) => {
          if (!result.success || result.data == null) return;
          const pipelineItem = await loadPipelineItem(item.id);
          if (!pipelineItem) return;
          await savePayload(
            pipelineItem,
            "instant_analysis",
            result.data as Record<string, unknown>,
          );
          await markProcessed(pipelineItem);
          setSaved(true);
        },
      });
    },
    [live],
  );

  return {
    process,
    isRunning: live.isRunning,
    error: live.error,
    conversationId: live.conversationId,
    hasLiveRun: live.hasLiveRun,
    saved,
    dismiss: live.dismiss,
  };
}
