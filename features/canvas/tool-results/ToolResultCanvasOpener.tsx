"use client";

/**
 * ToolResultCanvasOpener — the headless wire from a tool result to the canvas.
 *
 * Mount it once per chat room; it renders nothing. It watches the
 * conversation's tool calls — the live lifecycle for the turn in flight and the
 * persisted rows for a reloaded conversation, the same two halves the
 * transcript renders from, no second data path — and asks
 * `readToolResultCanvasOffer` whether each result created a record the canvas
 * can host. Every such record is OFFERED (it joins the canvas switcher and the
 * chat's Canvas button grows its dot). The newest one also OPENS, but only into
 * a canvas that is showing nothing else and only when the user's auto-open knob
 * is on.
 *
 * Why it exists (production, 2026-09-14): the agent created a document, said it
 * had opened it in the canvas, and nothing happened anywhere — no pane, no
 * card, not even a failure notice, because a tool result had no path to the
 * canvas at all.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  offerCanvasItem,
  openCanvas,
  selectCanvasIsOpen,
  selectCanvasItems,
  selectCurrentItemId,
} from "@/features/canvas/redux/canvasSlice";
import { useCanvasOpenGuard } from "@/features/canvas/hooks/useCanvasOpenGuard";
import { selectToolCallsForConversation } from "@/features/agents/redux/execution-system/observability/observability.selectors";
import { selectLiveToolLifecycleByConversation } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { createCanvasRevealMemory } from "@/features/canvas/revealMemory";
import {
  readToolResultCanvasOffer,
  type ToolResultCanvasOffer,
} from "./toolResultCanvasRegistry";
import { decideToolResultCanvasAction } from "./decideToolResultCanvasAction";

/** How many records from one conversation may sit in the switcher at once. */
const MAX_OFFERED = 8;

const memory = createCanvasRevealMemory("matrx.toolResultCanvas.");

/**
 * The result a persisted row carries. `outputPreview` is the structured copy;
 * `output` is the serialized one. Reading both is what keeps a RELOADED
 * conversation's documents reachable instead of only a live turn's.
 */
function readPersistedResult(record: {
  outputPreview?: unknown;
  output?: unknown;
}): unknown {
  if (record.outputPreview && typeof record.outputPreview === "object") {
    return record.outputPreview;
  }
  if (typeof record.output === "string" && record.output.trim().startsWith("{")) {
    try {
      return JSON.parse(record.output);
    } catch {
      return null;
    }
  }
  return null;
}

export function ToolResultCanvasOpener({
  conversationId,
}: {
  conversationId?: string | null;
}): null {
  const dispatch = useAppDispatch();
  const { isCanvasAvailable } = useCanvasOpenGuard();

  const autoOpen = useAppSelector(
    (s) => s.userPreferences.coding.toolResultCanvasAutoOpen !== false,
  );

  const records = useAppSelector(
    selectToolCallsForConversation(conversationId ?? ""),
  );
  const live = useAppSelector(
    selectLiveToolLifecycleByConversation(conversationId ?? ""),
  );

  // Oldest → newest, deduped by the record's own identity. A record that was
  // both streamed and persisted is ONE offer, not two panes.
  const offers = useMemo<ToolResultCanvasOffer[]>(() => {
    const bySource = new Map<string, ToolResultCanvasOffer>();
    const consider = (toolName: string | null, result: unknown) => {
      const offer = readToolResultCanvasOffer(toolName, result, {
        conversationId,
      });
      if (!offer) return;
      // Later wins: a document edited after it was created shows its new name.
      bySource.delete(offer.sourceId);
      bySource.set(offer.sourceId, offer);
    };

    for (const record of records) {
      if (record.isError === true || record.success === false) continue;
      consider(record.toolName, readPersistedResult(record));
    }
    if (live) {
      for (const entry of live.values()) {
        if (entry.status !== "completed") continue;
        consider(entry.toolName, entry.result);
      }
    }

    const all = [...bySource.values()];
    return all.slice(Math.max(0, all.length - MAX_OFFERED));
  }, [records, live, conversationId]);

  const items = useAppSelector(selectCanvasItems);
  const offeredSourceIds = useMemo(
    () => new Set(offers.map((o) => o.sourceId)),
    [offers],
  );
  const canvasHasOtherContent = items.some(
    (item) =>
      !item.sourceMessageId || !offeredSourceIds.has(item.sourceMessageId),
  );

  const memoryRef = useRef(new Map<string, ReturnType<typeof memory.read>>());
  const readMemory = useCallback((sourceId: string) => {
    const cached = memoryRef.current.get(sourceId);
    if (cached) return cached;
    const value = memory.read(sourceId);
    memoryRef.current.set(sourceId, value);
    return value;
  }, []);
  const rememberMemory = useCallback(
    (sourceId: string, patch: Partial<ReturnType<typeof memory.read>>) => {
      const next = { ...readMemory(sourceId), ...patch };
      memoryRef.current.set(sourceId, next);
      memory.write(sourceId, patch);
    },
    [readMemory],
  );

  useEffect(() => {
    if (offers.length === 0) return;
    // A route with no canvas surface would swallow every one of these: the
    // items would land in the slice and absolutely nothing would render. That
    // is the silent no-op this whole wire exists to remove, so we simply do
    // not offer there — the thread card's own "Open in canvas" action still
    // announces the drop with a remedy if the user clicks it.
    if (!isCanvasAvailable) return;

    const newestId = offers[offers.length - 1].sourceId;
    for (const offer of offers) {
      const remembered = readMemory(offer.sourceId);
      const action = decideToolResultCanvasAction({
        autoOpen,
        alreadyAutoOpened: remembered.autoOpened,
        userClosed: remembered.userClosed,
        canvasHasOtherContent,
        isNewest: offer.sourceId === newestId,
      });
      if (action === "none") continue;
      if (action === "open") {
        rememberMemory(offer.sourceId, { autoOpened: true });
        dispatch(openCanvas(offer.content));
        continue;
      }
      dispatch(offerCanvasItem(offer.content));
    }
  }, [
    offers,
    autoOpen,
    canvasHasOtherContent,
    isCanvasAvailable,
    dispatch,
    readMemory,
    rememberMemory,
  ]);

  // "Put away canvas" while one of these panes was on screen is a DECISION, and
  // it is remembered across the reload that used to undo it. Reopening it
  // clears the decision, so the pane behaves normally again afterwards.
  const canvasIsOpen = useAppSelector(selectCanvasIsOpen);
  const currentItemId = useAppSelector(selectCurrentItemId);
  const currentSourceId =
    items.find((item) => item.id === currentItemId)?.sourceMessageId ?? null;
  const wasShowing = useRef<string | null>(null);

  useEffect(() => {
    if (canvasIsOpen && currentSourceId && offeredSourceIds.has(currentSourceId)) {
      wasShowing.current = currentSourceId;
      if (readMemory(currentSourceId).userClosed) {
        rememberMemory(currentSourceId, { userClosed: false });
      }
      return;
    }
    const previous = wasShowing.current;
    if (previous && !canvasIsOpen) {
      wasShowing.current = null;
      if (!readMemory(previous).userClosed) {
        rememberMemory(previous, { userClosed: true });
      }
    }
  }, [
    canvasIsOpen,
    currentSourceId,
    offeredSourceIds,
    readMemory,
    rememberMemory,
  ]);

  return null;
}

export default ToolResultCanvasOpener;
