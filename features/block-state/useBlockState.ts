"use client";

// features/block-state/useBlockState.ts
//
// THE ONE HOOK for what a person does inside an answer. A kind calls
// `useBlockState()` and nothing else: the host (BlockStateHost) supplies the
// record, block identity and kind through context.
//
//   state     the saved state, with the person's unflushed edits on top
//   patch     merge-patch the state (answer keys are saved server-side; pure
//             view keys — a slide, a sort — stay local and are never staged)
//   loaded    the saved state has been read (render after this to seed UI)
//   saveError a refused / failed write — shown honestly under the block
//
// Writes: debounced (>= 800 ms), buffered until the answer has a database id
// and the block a stable identity, flushed (and chipped) on unmount. The chip
// for this block is derived from the saved row (see blockChipThunk).

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  interactionRemarkOf,
  splitKindState,
} from "@/features/content-ir/react/kind-interaction";
import type { RemarkItem } from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks";
import { BlockStateContext } from "./BlockStateContext";
import { BlockStateWriteError, setBlockState } from "./blockStateService";
import {
  selectBlockStateError,
  selectBlockStateHydration,
  selectBlockStateRow,
  setBlockStateSaveError,
  upsertBlockStateRows,
} from "./redux/blockStatesSlice";
import { ensureBlockStatesLoaded, unitRefOf, watchBlockStates } from "./redux/blockStateThunks";
import { syncBlockChip } from "./redux/blockChipThunk";
import { blockRowKey, hydrationKeyOf, type BlockStateSaveError } from "./types";

/** Writes are never sent more often than this (binding ruling B8). */
export const BLOCK_STATE_DEBOUNCE_MS = 800;

type State = Record<string, unknown>;

export interface UseBlockStateOptions {
  /** The block's human title ("Weeknight chili") — words for its chip. */
  title?: string | null;
  /** The block's data — lets the chip summary count against it ("3 of 8 ingredients"). */
  data?: unknown;
  /** Custom chip: kinds whose chip is not the generic interaction summary (the questionnaire's answers). */
  remark?: (state: State) => RemarkItem | null;
}

export interface UseBlockStateResult<T extends State> {
  state: T | null;
  loaded: boolean;
  patch: (patch: Partial<T>) => void;
  saveError: BlockStateSaveError | null;
  /** False when no host supplied a record (standalone demo): nothing is saved. */
  hosted: boolean;
}

function applyPatch(base: State, patch: State): State {
  const next: State = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

export function useBlockState<T extends State = State>(options: UseBlockStateOptions = {}): UseBlockStateResult<T> {
  const target = useContext(BlockStateContext);
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const entityId = target?.entityId ?? null;
  const blockKey = target?.blockKey ?? null;
  const scope = target?.scope ?? "viewer";
  const rowKey = target && entityId && blockKey ? blockRowKey(target.entityType, entityId, blockKey, scope) : null;
  const unit = target ? hydrationKeyOf(target) : null;

  const row = useAppSelector((state) => (rowKey ? selectBlockStateRow(state, rowKey) : undefined));
  const hydration = useAppSelector((state) => selectBlockStateHydration(state, unit));
  const saveError = useAppSelector((state) => selectBlockStateError(state, rowKey)) ?? null;

  // The person's edits not yet acknowledged by the server, and the local-only view keys.
  const overlayRef = useRef<State>({});
  const rowStateRef = useRef<State | null>(null);
  rowStateRef.current = row?.state ?? null;
  const [overlay, setOverlay] = useState<State>({});
  const [view, setView] = useState<State>({});

  // ── Hydrate + live feed (one batched read per conversation) ──
  const entityType = target?.entityType ?? null;
  const conversationId = target?.conversationId ?? null;
  useEffect(() => {
    if (!entityType || !userId) return undefined;
    const ref = unitRefOf(entityType, entityId, conversationId);
    if (!ref) return undefined;
    void dispatch(ensureBlockStatesLoaded(ref));
    return dispatch(watchBlockStates(ref));
  }, [dispatch, entityType, entityId, conversationId, userId]);

  // ── Write path ──
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);
  const targetRef = useRef({ target, entityId, blockKey, rowKey });
  targetRef.current = { target, entityId, blockKey, rowKey };

  const flush = useCallback(async (): Promise<void> => {
    const { target: t, entityId: id, blockKey: key, rowKey: rk } = targetRef.current;
    if (!t || !id || !key || !rk) return; // buffered until the answer is durable
    if (flushingRef.current) return;
    const sending = overlayRef.current;
    if (Object.keys(sending).length === 0) return;
    flushingRef.current = true;
    try {
      const saved = await setBlockState({
        entityType: t.entityType,
        entityId: id,
        blockKey: key,
        kind: t.kind,
        scope: t.scope,
        patch: sending,
        fingerprint: t.fingerprint,
      });
      dispatch(setBlockStateSaveError({ rowKey: rk, error: null }));
      dispatch(upsertBlockStateRows([saved]));
      // Drop only what this write carried; anything changed meanwhile stays buffered.
      const remaining: State = {};
      for (const [k, v] of Object.entries(overlayRef.current)) if (sending[k] !== v) remaining[k] = v;
      overlayRef.current = remaining;
      setOverlay(remaining);
    } catch (error) {
      const detail: BlockStateSaveError =
        error instanceof BlockStateWriteError
          ? error.detail
          : { code: null, message: error instanceof Error ? error.message : "Save failed", signedOut: false };
      dispatch(setBlockStateSaveError({ rowKey: rk, error: detail }));
    } finally {
      flushingRef.current = false;
    }
    if (Object.keys(overlayRef.current).length > 0 && !timerRef.current) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, BLOCK_STATE_DEBOUNCE_MS);
    }
  }, [dispatch]);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, BLOCK_STATE_DEBOUNCE_MS);
  }, [flush]);

  // The answer / block identity just became durable: send what was buffered.
  useEffect(() => {
    if (rowKey && Object.keys(overlayRef.current).length > 0) schedule();
  }, [rowKey, schedule]);

  // True unmount: flush immediately (the last tick is never lost).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      void flush();
    };
  }, [flush]);

  const kind = target?.kind ?? "";
  const patch = useCallback(
    (next: Partial<T>) => {
      const { durable, view: viewPart } = splitKindState(kind, next as State);
      if (Object.keys(viewPart).length > 0) setView((held) => ({ ...held, ...viewPart }));
      // A write that changes nothing is never sent (it would bump the version and re-raise a chip).
      const current = { ...(rowStateRef.current ?? {}), ...overlayRef.current };
      for (const key of Object.keys(durable)) {
        if (JSON.stringify(current[key]) === JSON.stringify(durable[key])) delete durable[key];
      }
      if (Object.keys(durable).length === 0) return;
      overlayRef.current = { ...overlayRef.current, ...durable };
      setOverlay(overlayRef.current);
      schedule();
    },
    [kind, schedule],
  );

  // ── The chip: derived from the saved row ──
  useEffect(() => {
    const t = targetRef.current.target;
    if (!t || !row || !t.conversationId || !hydration) return;
    const { title, data, remark } = optionsRef.current;
    const build =
      remark ??
      ((state: State) =>
        interactionRemarkOf({
          kind: t.kind,
          title,
          conversationId: t.conversationId,
          messageId: t.messageId,
          blockIndex: t.blockIndex,
          state,
          data,
        }));
    void dispatch(syncBlockChip({ conversationId: t.conversationId, row, build }));
  }, [dispatch, row, hydration]);

  const merged = useMemo<T | null>(() => {
    const hasAny = row || Object.keys(overlay).length > 0 || Object.keys(view).length > 0;
    if (!hasAny) return null;
    return { ...applyPatch(row?.state ?? {}, overlay), ...view } as T;
  }, [row, overlay, view]);

  const loaded = !target || !unit || !userId || hydration === "loaded" || hydration === "error";

  return { state: merged, loaded, patch, saveError, hosted: !!target };
}
