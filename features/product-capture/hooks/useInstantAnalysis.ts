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
 *
 * 🚨 A RUN THIS HOOK STARTED IS NEVER LOSABLE. Three seams, in the order they
 * fire, each covering the failure the one before it cannot:
 *
 *  1. THE POINTER (`onConversationCreated`) — the conversation id is written
 *     to the item as the `instant_run` payload BEFORE a single token streams.
 *     React state alone was the original defect: tapping elsewhere, leaving
 *     the route, or backgrounding the phone unmounted the hook, `useLiveAgentRun`
 *     destroyed the local instance, and a paid run became unreachable.
 *  2. THE RESULT SEAM (`onResult`) — saves the structured record as the item's
 *     `instant_analysis` payload and marks the item `processed` the instant
 *     the run settles, on every exit path.
 *  3. THE RECOVERY (`attach`, on returning to an item) — rehydrates the
 *     transcript from the DB (`loadConversation`), rejoins a turn still
 *     running on the server (`reconnectServerOperation`; streams run
 *     `detach_on_disconnect=True`, so leaving never stopped the work), and
 *     when the run finished while nobody was watching — seam 2 never got to
 *     run — extracts its JSON from the rehydrated conversation and persists it
 *     after the fact.
 *
 * `capturing → processed` skips `captured`, so the server-side workflow
 * trigger never double-processes an instant item (`markProcessed`).
 */

import { useCallback, useEffect, useState } from "react";

import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import {
  isSourceFeature,
  type SourceFeature,
} from "@/features/agents/types/instance.types";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { reconnectServerOperation } from "@/features/agents/runtime-reconnect/reconnect-server-operation.thunk";
import {
  selectLatestAnswerText,
  selectLatestRequestId,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectFirstExtractedObject } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import {
  extractContentBlocks,
  selectConversationMessages,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { fileHandler } from "@/features/files/handler/handler";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { extractFirstJson } from "@/utils/json/extract-json";

import type { CaptureItem } from "../types";
import { listItemFiles, markProcessed } from "../service";
import {
  listPayloads,
  loadPipelineItem,
  savePayload,
} from "../pipeline-service";
import {
  readInstantRunPointer,
  type InstantRunPointer,
} from "../pipeline-types";

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
  /**
   * Live handle for `<LiveRunDisplay conversationId={…} />` — the in-flight
   * run's conversation, or the RESTORED one for an item processed earlier.
   */
  conversationId: string | null;
  /** True once this item's result is saved (this run, or a previous one). */
  saved: boolean;
  /** The item's stored `instant_analysis` record, when one exists. */
  storedResult: Record<string, unknown> | null;
  /** A run was started for this item at some point (pointer on the item). */
  hasStoredRun: boolean;
  /**
   * The restored run has a stream a viewer can render. False with
   * `hasStoredRun` true means the run is gone beyond recovery — say so and
   * offer to re-analyze; never bind a viewer that would spin forever.
   */
  restoredHasStream: boolean;
  /** Rehydrating a previous run for the current item. */
  restoring: boolean;
  dismiss: () => void;
}

export interface UseInstantAnalysisOptions {
  /** The item the surface is on — drives restore. Null between items. */
  item: CaptureItem | null;
  /** Off in the standard lane: no pointer reads, no rehydration. */
  enabled: boolean;
}

/** The rehydrated conversation's answer text, from whichever slice has it. */
function restoredAnswerText(
  state: RootState,
  conversationId: string,
): string {
  const requestId = selectLatestRequestId(conversationId)(state);
  if (requestId) {
    const fromRequest = selectLatestAnswerText(conversationId)(state);
    if (fromRequest.trim()) return fromRequest;
  }
  // A cold-loaded conversation may have messages but no observability request
  // rows — the persisted assistant message is the authority then.
  const messages = selectConversationMessages(conversationId)(state);
  const assistant = messages.findLast((m) => m.role === "assistant");
  return extractContentBlocks(assistant)
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
}

/** The structured record of a rehydrated run, from Redux or its answer text. */
function restoredRecord(
  state: RootState,
  conversationId: string,
): Record<string, unknown> | null {
  const requestId = selectLatestRequestId(conversationId)(state);
  const extracted = requestId
    ? selectFirstExtractedObject(requestId)(state)
    : null;
  const fromSlice = extracted?.value;
  if (fromSlice && typeof fromSlice === "object" && !Array.isArray(fromSlice)) {
    return fromSlice as Record<string, unknown>;
  }
  const text = restoredAnswerText(state, conversationId);
  if (!text.trim()) return null;
  const parsed = extractFirstJson(text)?.value;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return null;
}

/** @see useInstantAnalysis — the item-stamped restore cell. */
interface RestoredRun {
  itemId: string;
  run: InstantRunPointer | null;
  result: Record<string, unknown> | null;
  /**
   * The rehydrated conversation actually carries a request the stream viewer
   * can render. A conversation can come back with messages but NO request row,
   * and `<LiveRunDisplay>` derives its handle from exactly that row — binding
   * it anyway leaves a "Starting…" spinner on screen forever for a run that
   * ended long ago. Consumers branch on this instead.
   */
  hasStream: boolean;
}

export function useInstantAnalysis({
  item,
  enabled,
}: UseInstantAnalysisOptions): UseInstantAnalysisResult {
  const live = useLiveAgentRun();
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const itemId = enabled ? (item?.id ?? null) : null;

  // ONE state cell, STAMPED WITH THE ITEM IT BELONGS TO. Keying it this way is
  // what makes "restoring" and "this item has nothing" derivable instead of
  // reset-on-change: a stale item's pointer or record can never be shown for a
  // tick against the next item, and the effect never sets state synchronously
  // (react-hooks/set-state-in-effect).
  const [restored, setRestored] = useState<RestoredRun | null>(null);
  const forItem = restored?.itemId === itemId ? restored : null;
  const storedRun = forItem?.run ?? null;
  const storedResult = forItem?.result ?? null;
  const restoredHasStream = forItem?.hasStream ?? false;
  // Nothing has landed for the item on screen yet — the lookup is in flight.
  const restoring = itemId !== null && forItem === null;

  const patchRestored = useCallback(
    (targetItemId: string, patch: Partial<Omit<RestoredRun, "itemId">>) => {
      setRestored((prev) =>
        prev?.itemId === targetItemId
          ? { ...prev, ...patch }
          : {
              itemId: targetItemId,
              run: null,
              result: null,
              hasStream: false,
              ...patch,
            },
      );
    },
    [],
  );

  /**
   * SEAM 3. A run finished while the surface was gone: the transcript is in
   * the DB but seam 2 never fired, so the item still has no result. Extract it
   * from the rehydrated conversation and persist it now.
   */
  const recoverOrphanedResult = useCallback(
    async (targetItemId: string, conversationId: string) => {
      const record = restoredRecord(store.getState(), conversationId);
      if (!record) return;
      const pipelineItem = await loadPipelineItem(targetItemId);
      if (!pipelineItem) return;
      const existing = await listPayloads(targetItemId);
      if (existing.instant_analysis) return; // seam 2 won the race
      await savePayload(pipelineItem, "instant_analysis", record);
      await markProcessed(pipelineItem);
      console.warn(
        `[product-capture] recovered an orphaned instant run for item ${targetItemId} ` +
          `(conversation ${conversationId}) — the result was saved after the fact.`,
      );
      return record;
    },
    [store],
  );

  // ── SEAM 3: restore whatever this item already has ───────────────────────
  useEffect(() => {
    if (!itemId) return;

    let cancelled = false;
    void (async () => {
      const payloads = await listPayloads(itemId);
      if (cancelled) return;

      const stored = payloads.instant_analysis?.data ?? null;
      const result =
        stored && Object.keys(stored).length > 0
          ? (stored as Record<string, unknown>)
          : null;
      const pointer = readInstantRunPointer(payloads.instant_run?.data);
      // One write settles `restoring` whether or not this item has anything.
      patchRestored(itemId, { run: pointer, result });
      if (!pointer) return;

      // The transcript first (so the sheet has something the moment it opens),
      // then the rejoin — a turn still running on the server keeps streaming
      // into the same conversation.
      try {
        await dispatch(
          loadConversation({
            conversationId: pointer.conversationId,
            messageLimit: 20,
          }),
        ).unwrap();
      } catch (err: unknown) {
        console.error(
          "[product-capture] instant run transcript reload failed",
          err,
        );
        return;
      }
      if (cancelled) return;
      patchRestored(itemId, {
        hasStream: Boolean(
          selectLatestRequestId(pointer.conversationId)(store.getState()),
        ),
      });

      if (!result) {
        const recovered = await recoverOrphanedResult(
          itemId,
          pointer.conversationId,
        ).catch((err: unknown) => {
          console.error("[product-capture] instant run recovery failed", err);
          return undefined;
        });
        if (cancelled) return;
        if (recovered) patchRestored(itemId, { result: recovered });
      }

      // Rejoin last: it resolves only when the server turn is terminal, and a
      // terminal turn means one more recovery attempt is worth making.
      void dispatch(
        reconnectServerOperation({
          conversationId: pointer.conversationId,
          source: "cold-load",
        }),
      )
        .unwrap()
        .then(async (outcome) => {
          if (cancelled || !outcome.followed) return;
          // A rejoin mints the request row the viewer renders from.
          patchRestored(itemId, {
            hasStream: Boolean(
              selectLatestRequestId(pointer.conversationId)(store.getState()),
            ),
          });
          const recovered = await recoverOrphanedResult(
            itemId,
            pointer.conversationId,
          );
          if (!cancelled && recovered) {
            patchRestored(itemId, { result: recovered });
          }
        })
        .catch((err: unknown) => {
          console.error("[product-capture] instant run rejoin failed", err);
        });
    })().catch((err: unknown) => {
      console.error("[product-capture] instant run restore failed", err);
      // Never strand the surface in "restoring" on a failed lookup — an item
      // with nothing readable is an item with nothing.
      if (!cancelled) patchRestored(itemId, {});
    });

    return () => {
      cancelled = true;
    };
  }, [itemId, dispatch, store, recoverOrphanedResult, patchRestored]);

  const process = useCallback(
    async (target: CaptureItem) => {
      // A re-run replaces the record; clear it so the sheet shows the stream
      // rather than the previous answer while the new one is being written.
      patchRestored(target.id, { result: null });

      // The analyzer reads PHOTOS. Uploaded files are the source of truth
      // (covers items resumed from earlier sessions, not just this visit's
      // artifacts); the caller gates on pending uploads finishing.
      const files = await listItemFiles(target.id);
      const photos = files.filter((f) => f.kind === "photo");
      if (photos.length === 0) {
        throw new Error("Take at least one photo before processing.");
      }

      const parts = await Promise.all(
        photos.map((photo) =>
          fileHandler.toContentPart({ kind: "file_id", fileId: photo.fileId }),
        ),
      );

      const notes = target.notes?.trim();

      await live.run({
        mandateKey: INSTANT_ANALYSIS_MANDATE_KEY,
        surfaceKey: `product-capture-instant:${target.id}`,
        sourceFeature: INSTANT_SOURCE_FEATURE,
        organizationId: target.organizationId,
        initiation: "user",
        // The agent's one declared variable; omit entirely when empty so the
        // agent's own "None provided." default applies.
        ...(notes ? { variables: { dock_notes: notes } } : {}),
        messageParts: parts,
        failureMessages: {
          noJson:
            "The analysis finished but returned no structured record — try again.",
        },
        // SEAM 1: the durable pointer, before the first token. Everything that
        // makes a run recoverable hangs off this write.
        onConversationCreated: (conversationId) => {
          const pointer: InstantRunPointer = {
            version: 1,
            conversationId,
            startedAt: new Date().toISOString(),
          };
          patchRestored(target.id, { run: pointer });
          // savePayload's insert-then-reread handles the (item, kind) unique
          // race on a re-run, so no existing row has to be threaded here.
          void savePayload(target, "instant_run", pointer).catch(
            (err: unknown) => {
              console.error(
                "[product-capture] instant run pointer write failed — this run " +
                  "is NOT recoverable if the surface unmounts",
                { conversationId, itemId: target.id, err },
              );
            },
          );
        },
        // SEAM 2: runs on every exit path, before the promise resolves, so the
        // paid result survives any UI lifecycle.
        onResult: async (result) => {
          if (!result.success || result.data == null) return;
          const pipelineItem = await loadPipelineItem(target.id);
          if (!pipelineItem) return;
          const record = result.data as Record<string, unknown>;
          await savePayload(pipelineItem, "instant_analysis", record);
          await markProcessed(pipelineItem);
          patchRestored(target.id, { result: record });
        },
      });
    },
    [live, patchRestored],
  );

  return {
    process,
    isRunning: live.isRunning,
    error: live.error,
    conversationId: live.conversationId ?? storedRun?.conversationId ?? null,
    saved: storedResult !== null,
    storedResult,
    hasStoredRun: storedRun !== null,
    restoredHasStream,
    restoring,
    dismiss: live.dismiss,
  };
}
