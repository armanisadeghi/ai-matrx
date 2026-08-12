"use client";

/**
 * Write handlers for `matrx-user/transcript-studio` — the receiving end of the
 * two `writeTargets` declared in
 * `features/surfaces/manifests/transcript-studio.manifest.ts`.
 *
 * WHAT THIS ADDS THAT DID NOT EXIST. The studio already runs three agent
 * pipelines that WRITE its columns (cleaning, concepts, module), but those are
 * scheduled passes: they only ever APPEND their own new output on a timer, and
 * only for the window of transcript they have not covered yet. Nothing could
 * go back and fix ONE row that came out wrong — that was exclusively the
 * user's per-row Edit → Save. These two targets give a header-launched agent
 * that corrective ability, addressing a single row by the id the surface
 * already publishes in `concept_items` / `cleaned_segments`.
 *
 * Rules, all enforced here rather than trusted to the caller:
 *
 *  • EVERY handler validates and THROWS on a bad shape. The writeback seam
 *    (`features/surfaces/runtime/surface-writeback.ts`) turns a throw into a
 *    safe error envelope the agent reads and can correct against. Nothing is
 *    coerced and nothing is partially applied — validation completes before
 *    any dispatch.
 *
 *  • Nothing bypasses the canonical write path. `concept_item` dispatches
 *    `updateConceptItemThunk` and `cleaned_segment_text` dispatches
 *    `updateCleanedSegmentTextThunk` — the exact thunks `ConceptsColumn` and
 *    `CleanedTranscriptColumn` dispatch from their own row editors' Save
 *    buttons. There is no second write path and no raw supabase.
 *
 *  • THE ROW IS RESOLVED FROM THE STORE AT CALL TIME, never from a render
 *    snapshot. `applySurfaceWrite` resolves the handler BEFORE it shows the
 *    confirm dialog, and the studio streams new segments continuously while
 *    recording, so a row list captured in a closure can be stale by the time
 *    the user presses Apply. Resolving late also means a row deleted while the
 *    dialog was open refuses loudly instead of writing to a dead id.
 *
 *  • `unwrapResult` on every dispatch, so a rejected thunk surfaces as an
 *    error to the agent rather than a false success.
 *
 * `mode: "entity"` for both — see the manifest's writeTargets block: the
 * per-row edit buffers are local `useState` inside the row components, so
 * there is no staging layer a `draft` target could honestly land in.
 */

import { useCallback } from "react";
import { unwrapResult } from "@reduxjs/toolkit";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  updateCleanedSegmentTextThunk,
  updateConceptItemThunk,
} from "../redux/thunks";
import { CONCEPT_KINDS, type ConceptKind } from "../types";

/** Max label length — matches the `maxLength` on the row editor's input. */
const CONCEPT_LABEL_MAX = 200;

function asWriteObject(
  value: unknown,
  target: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `${target} expects an object value, received ${
        value === null || value === undefined ? "nothing" : typeof value
      }.`,
    );
  }
  return value as Record<string, unknown>;
}

function requireText(
  patch: Record<string, unknown>,
  key: string,
  target: string,
): string {
  const raw = patch[key];
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(
      `${target} expects a non-empty string "${key}", received ${
        raw === undefined ? "nothing" : JSON.stringify(raw)
      }.`,
    );
  }
  return raw.trim();
}

export function useStudioSurfaceWriteHandlers(
  sessionId: string | null,
): () => SurfaceWriteHandlers {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  return useCallback(
    (): SurfaceWriteHandlers => ({
      concept_item: async (value) => {
        if (!sessionId) {
          throw new Error(
            "No session is open — select or start a transcription session before editing its concepts.",
          );
        }
        const patch = asWriteObject(value, "concept_item");
        const id = requireText(patch, "id", "concept_item");

        // Resolve against the store NOW, not against a render snapshot.
        const state = store.getState();
        const item = state.transcriptStudio.conceptsById[sessionId]?.[id];
        if (!item) {
          throw new Error(
            `concept_item "id" must match an id from the concept_items value; "${id}" is not a concept in this session.`,
          );
        }

        const next: {
          kind?: ConceptKind;
          label?: string;
          description?: string | null;
        } = {};

        if (patch.kind !== undefined) {
          if (
            typeof patch.kind !== "string" ||
            !(CONCEPT_KINDS as readonly string[]).includes(patch.kind)
          ) {
            throw new Error(
              `concept_item "kind" must be one of ${CONCEPT_KINDS.join(
                " | ",
              )}, received ${JSON.stringify(patch.kind)}.`,
            );
          }
          next.kind = patch.kind as ConceptKind;
        }

        if (patch.label !== undefined) {
          const label = requireText(patch, "label", "concept_item");
          if (label.length > CONCEPT_LABEL_MAX) {
            throw new Error(
              `concept_item "label" must be at most ${CONCEPT_LABEL_MAX} characters, received ${label.length}.`,
            );
          }
          next.label = label;
        }

        if (patch.description !== undefined) {
          if (patch.description === null) {
            next.description = null;
          } else if (typeof patch.description === "string") {
            next.description = patch.description.trim() || null;
          } else {
            throw new Error(
              `concept_item "description" must be a string or null, received ${typeof patch.description}.`,
            );
          }
        }

        if (Object.keys(next).length === 0) {
          throw new Error(
            'concept_item needs at least one of "kind", "label" or "description" to change alongside "id".',
          );
        }

        unwrapResult(
          await dispatch(
            updateConceptItemThunk({ sessionId, itemId: id, patch: next }),
          ),
        );
        toast.success("Concept updated");
      },

      cleaned_segment_text: async (value) => {
        if (!sessionId) {
          throw new Error(
            "No session is open — select or start a transcription session before editing its cleaned transcript.",
          );
        }
        const patch = asWriteObject(value, "cleaned_segment_text");
        const id = requireText(patch, "id", "cleaned_segment_text");
        const text = requireText(patch, "text", "cleaned_segment_text");

        const state = store.getState();
        const segment = state.transcriptStudio.cleanedById[sessionId]?.[id];
        if (!segment) {
          throw new Error(
            `cleaned_segment_text "id" must match an id from the cleaned_segments value; "${id}" is not a cleaned segment in this session.`,
          );
        }
        // `cleaned_segments` only publishes active canonical rows, so an id
        // that resolves to a superseded row or another processor's output was
        // not read off this surface — refuse rather than silently rewrite it.
        if (segment.processorKey !== "clean" || segment.supersededAt) {
          throw new Error(
            `cleaned_segment_text "${id}" is not an active cleaned segment (it is superseded or belongs to a custom processor) and cannot be edited here.`,
          );
        }

        unwrapResult(
          await dispatch(
            updateCleanedSegmentTextThunk({ sessionId, segmentId: id, text }),
          ),
        );
        toast.success("Cleaned segment updated");
      },
    }),
    [dispatch, sessionId, store],
  );
}
