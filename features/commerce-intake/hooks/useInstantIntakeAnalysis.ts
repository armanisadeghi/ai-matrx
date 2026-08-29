"use client";

/**
 * useInstantIntakeAnalysis — the INSTANT lane of the commerce intake capture
 * app, ported from the product-capture trial's proven architecture
 * (`features/product-capture/hooks/useInstantAnalysis.ts`) onto commerce rows:
 *
 * - SERVER lane: finishing an item writes `pipeline_state='captured'` and the
 *   W5 pipeline sweep runs the mandates server-side (`service.ts`).
 * - INSTANT lane (this hook): "Process" runs the intake-analysis agent from
 *   the browser through the MANDATE `commerce_intake.instant_analysis` — the
 *   agent identity lives in the DATABASE, never here (rebindable: swap the
 *   agent or bind a pricing workflow later, no deploy) — and streams the
 *   `electronics_intake_analysis` kind straight back into the capture UI.
 *
 * Built on the canonical primitives, nothing hand-rolled: `useLiveAgentRun`
 * launches the mandate; the asset's photos attach as multimodal message parts
 * via `fileHandler.toContentPart` — never smuggled through `user_input`
 * (THE USER-INPUT LAW).
 *
 * 🚨 A RUN THIS HOOK STARTED IS NEVER LOSABLE. Three seams, in order:
 *
 *  1. THE POINTER (`onConversationCreated`) — the conversation id is merged
 *     onto `intake_asset.metadata.instant_run` BEFORE a single token streams.
 *  2. THE RESULT SEAM (`onResult`) — `saveInstantResult` persists the record
 *     as `metadata.instant_analysis` AND moves the asset
 *     `captured → awaiting_triage` in one write, so the W5 sweep can never
 *     double-process an instant item.
 *  3. THE RECOVERY (on returning to an asset) — rehydrates the transcript
 *     (`loadConversation`), rejoins a turn still running on the server
 *     (`reconnectServerOperation`), and when the run finished while nobody
 *     was watching, extracts its JSON from the rehydrated conversation and
 *     persists it after the fact.
 *
 * Storage home rationale: `commerce.asset_mandate_result` is W5's own ledger
 * (step CHECK + idempotency contract) — a client-lane row there would be read
 * back as a pipeline step's output. See service.ts § instant lane.
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

import {
  readInstantResult,
  readInstantRunPointer,
  type InstantRunPointer,
  type IntakeAsset,
} from "../types";
import {
  listAssetArtifacts,
  loadAsset,
  saveInstantResult,
  saveInstantRunPointer,
} from "../service";

/** The one mandate key of this lane — resolved in the DB, rebindable there. */
export const INTAKE_INSTANT_ANALYSIS_MANDATE_KEY =
  "commerce_intake.instant_analysis";

/** Durable producer attribution, narrowed through the platform's own guard —
 *  a key drifting off the `mandate:<feature>.<key>` pattern fails at module
 *  init, loudly. */
function mandateSourceFeature(key: string): SourceFeature {
  const value = `mandate:${key}`;
  if (!isSourceFeature(value)) {
    throw new Error(
      `commerce-intake: "${value}" does not match a registered source-feature pattern`,
    );
  }
  return value;
}
const INSTANT_SOURCE_FEATURE = mandateSourceFeature(
  INTAKE_INSTANT_ANALYSIS_MANDATE_KEY,
);

export interface UseInstantIntakeAnalysisResult {
  /** Run the instant analysis on the asset's uploaded photos. Resolves when
   *  the run settles (the result is already persisted by then). */
  process: (asset: IntakeAsset) => Promise<void>;
  isRunning: boolean;
  error: string | null;
  /** Live handle for `<LiveRunDisplay conversationId={…} />` — the in-flight
   *  run's conversation, or the RESTORED one for a processed asset. */
  conversationId: string | null;
  /** True once this asset's result is saved (this run, or a previous one). */
  saved: boolean;
  /** The asset's stored `instant_analysis` record, when one exists. */
  storedResult: Record<string, unknown> | null;
  /** A run was started for this asset at some point (pointer on the row). */
  hasStoredRun: boolean;
  /** The restored run has a stream a viewer can render (see product-capture's
   *  restoredHasStream rationale — never bind a viewer that spins forever). */
  restoredHasStream: boolean;
  /** Rehydrating a previous run for the current asset. */
  restoring: boolean;
  dismiss: () => void;
}

export interface UseInstantIntakeAnalysisOptions {
  /** The asset the surface is on — drives restore. Null between items. */
  asset: IntakeAsset | null;
  /** Off in the standard lane: no pointer reads, no rehydration. */
  enabled: boolean;
}

/** The rehydrated conversation's answer text, from whichever slice has it. */
function restoredAnswerText(state: RootState, conversationId: string): string {
  const requestId = selectLatestRequestId(conversationId)(state);
  if (requestId) {
    const fromRequest = selectLatestAnswerText(conversationId)(state);
    if (fromRequest.trim()) return fromRequest;
  }
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

/** The asset-stamped restore cell (see product-capture's RestoredRun). */
interface RestoredRun {
  assetId: string;
  run: InstantRunPointer | null;
  result: Record<string, unknown> | null;
  hasStream: boolean;
}

export function useInstantIntakeAnalysis({
  asset,
  enabled,
}: UseInstantIntakeAnalysisOptions): UseInstantIntakeAnalysisResult {
  const live = useLiveAgentRun();
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const assetId = enabled ? (asset?.id ?? null) : null;

  // ONE state cell, stamped with the asset it belongs to — a stale asset's
  // pointer or record can never be shown for a tick against the next one.
  const [restored, setRestored] = useState<RestoredRun | null>(null);
  const forAsset = restored?.assetId === assetId ? restored : null;
  const storedRun = forAsset?.run ?? null;
  const storedResult = forAsset?.result ?? null;
  const restoredHasStream = forAsset?.hasStream ?? false;
  const restoring = assetId !== null && forAsset === null;

  const patchRestored = useCallback(
    (targetAssetId: string, patch: Partial<Omit<RestoredRun, "assetId">>) => {
      setRestored((prev) =>
        prev?.assetId === targetAssetId
          ? { ...prev, ...patch }
          : {
              assetId: targetAssetId,
              run: null,
              result: null,
              hasStream: false,
              ...patch,
            },
      );
    },
    [],
  );

  /** SEAM 3's backfill: a run finished while the surface was gone — extract
   *  the record from the rehydrated conversation and persist it now. */
  const recoverOrphanedResult = useCallback(
    async (targetAssetId: string, conversationId: string) => {
      const record = restoredRecord(store.getState(), conversationId);
      if (!record) return;
      const current = await loadAsset(targetAssetId);
      if (!current) return;
      if (readInstantResult(current.metadata.instant_analysis)) return; // seam 2 won
      await saveInstantResult(current, record);
      console.warn(
        `[commerce-intake] recovered an orphaned instant run for asset ${targetAssetId} ` +
          `(conversation ${conversationId}) — the result was saved after the fact.`,
      );
      return record;
    },
    [store],
  );

  // ── SEAM 3: restore whatever this asset already has ──────────────────────
  useEffect(() => {
    if (!assetId) return;

    let cancelled = false;
    void (async () => {
      const current = await loadAsset(assetId);
      if (cancelled) return;

      const result = readInstantResult(current?.metadata.instant_analysis);
      const pointer = readInstantRunPointer(current?.metadata.instant_run);
      // One write settles `restoring` whether or not this asset has anything.
      patchRestored(assetId, { run: pointer, result });
      if (!pointer) return;

      try {
        await dispatch(
          loadConversation({
            conversationId: pointer.conversationId,
            messageLimit: 20,
          }),
        ).unwrap();
      } catch (err: unknown) {
        console.error(
          "[commerce-intake] instant run transcript reload failed",
          err,
        );
        return;
      }
      if (cancelled) return;
      patchRestored(assetId, {
        hasStream: Boolean(
          selectLatestRequestId(pointer.conversationId)(store.getState()),
        ),
      });

      if (!result) {
        const recovered = await recoverOrphanedResult(
          assetId,
          pointer.conversationId,
        ).catch((err: unknown) => {
          console.error("[commerce-intake] instant run recovery failed", err);
          return undefined;
        });
        if (cancelled) return;
        if (recovered) patchRestored(assetId, { result: recovered });
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
          patchRestored(assetId, {
            hasStream: Boolean(
              selectLatestRequestId(pointer.conversationId)(store.getState()),
            ),
          });
          const recovered = await recoverOrphanedResult(
            assetId,
            pointer.conversationId,
          );
          if (!cancelled && recovered) {
            patchRestored(assetId, { result: recovered });
          }
        })
        .catch((err: unknown) => {
          console.error("[commerce-intake] instant run rejoin failed", err);
        });
    })().catch((err: unknown) => {
      console.error("[commerce-intake] instant run restore failed", err);
      if (!cancelled) patchRestored(assetId, {});
    });

    return () => {
      cancelled = true;
    };
  }, [assetId, dispatch, store, recoverOrphanedResult, patchRestored]);

  const process = useCallback(
    async (target: IntakeAsset) => {
      // A re-run replaces the record; clear it so the sheet shows the stream
      // rather than the previous answer while the new one is being written.
      patchRestored(target.id, { result: null });

      // The analyzer reads PHOTOS. The stored artifact rows are the source of
      // truth (covers assets resumed from earlier sessions); delineator
      // frames are boundaries, not evidence.
      const artifacts = await listAssetArtifacts(target.id);
      const photos = artifacts.filter(
        (a) => a.kind === "photo" && !a.isDelineator && a.fileId,
      );
      if (photos.length === 0) {
        throw new Error("Take at least one photo before processing.");
      }

      const parts = await Promise.all(
        photos.map((photo) =>
          fileHandler.toContentPart({
            kind: "file_id",
            fileId: photo.fileId as string,
          }),
        ),
      );

      const notes = target.notes?.trim();

      await live.run({
        mandateKey: INTAKE_INSTANT_ANALYSIS_MANDATE_KEY,
        surfaceKey: `commerce-intake-instant:${target.id}`,
        sourceFeature: INSTANT_SOURCE_FEATURE,
        organizationId: target.organizationId,
        initiation: "user",
        // The agent's one declared variable; omit entirely when empty so the
        // agent's own "None provided." default applies. NEVER user_input.
        ...(notes ? { variables: { dock_notes: notes } } : {}),
        messageParts: parts,
        failureMessages: {
          noJson:
            "The analysis finished but returned no structured record — try again.",
        },
        // SEAM 1: the durable pointer, before the first token.
        onConversationCreated: (conversationId) => {
          const pointer: InstantRunPointer = {
            version: 1,
            conversationId,
            startedAt: new Date().toISOString(),
          };
          patchRestored(target.id, { run: pointer });
          void (async () => {
            // Re-read for a fresh CAS version — the capture session may have
            // written notes/artifacts since this asset object was loaded.
            const current = (await loadAsset(target.id)) ?? target;
            await saveInstantRunPointer(current, pointer);
          })().catch((err: unknown) => {
            console.error(
              "[commerce-intake] instant run pointer write failed — this run " +
                "is NOT recoverable if the surface unmounts",
              { conversationId, assetId: target.id, err },
            );
          });
        },
        // SEAM 2: runs on every exit path, before the promise resolves. The
        // ONE write persists the record AND takes the asset out of the W5
        // sweep's reach (captured → awaiting_triage, never re-'captured').
        onResult: async (result) => {
          if (!result.success || result.data == null) return;
          const current = await loadAsset(target.id);
          if (!current) return;
          const record = result.data as Record<string, unknown>;
          await saveInstantResult(current, record);
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
