"use client";

/**
 * SandboxCanvasOpener — the ON-DEMAND reveal, headless.
 *
 * Mount it once per chat room; it renders nothing. It watches one question:
 * *has the agent actually worked in this conversation's sandbox?* The first
 * time it has, the Sandbox opens in the Canvas — the way Claude Code shows
 * its terminal the moment it runs a command, and the way Cursor's agent
 * terminal appears when the agent starts a task. Before that, nothing is on
 * screen: a permanently-open sandbox panel is exactly the defect this
 * replaced (owner, 2026-09-13 — it *"covers the top section of the app"*).
 *
 * It never hijacks. If the canvas is already showing a document, an artifact
 * or the Cloud Browser, the sandbox is OFFERED instead: it joins the canvas
 * switcher (and the chat's Canvas button grows its dot) and the user decides
 * when to look. Same when the user has turned auto-open off.
 *
 * The rules live in the pure `decideSandboxCanvasAction`, which is what the
 * guards drive — this component is only the wiring.
 */

import { useCallback, useEffect, useRef } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { getEffectiveSandboxRef } from "@/lib/sandbox/active-binding";
import {
  selectCanvasIsOpen,
  selectCanvasItems,
  selectCurrentItemId,
} from "@/features/canvas/redux/canvasSlice";
import { selectToolCallsForConversation } from "@/features/agents/redux/execution-system/observability/observability.selectors";
import { selectLiveToolLifecycleByConversation } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { isSandboxTool } from "./sandbox-activity";
import {
  decideSandboxCanvasAction,
  sandboxCanvasSourceId,
  useOpenSandboxCanvas,
} from "./useOpenSandboxCanvas";
import {
  readSandboxCanvasMemory,
  writeSandboxCanvasMemory,
  type SandboxCanvasMemory,
} from "./sandboxCanvasMemory";

export function SandboxCanvasOpener({
  conversationId,
}: {
  conversationId?: string | null;
}): null {
  const { open, offer } = useOpenSandboxCanvas();

  // The bound box. `getEffectiveSandboxRef`, NOT `resolveAgentSandboxRef`:
  // the latter returns null for a box the token mint has learned is dead, and
  // a dead box is exactly what the pane must explain. Primitive selections
  // only — the resolver returns a fresh object on every call.
  const sandboxRowId = useAppSelector(
    (s) => getEffectiveSandboxRef(s, conversationId ?? null)?.rowId ?? null,
  );
  const sandboxName = useAppSelector(
    (s) => getEffectiveSandboxRef(s, conversationId ?? null)?.name ?? null,
  );

  const autoOpen = useAppSelector(
    (s) => s.userPreferences.coding.sandboxCanvasAutoOpen !== false,
  );

  // Has anything actually run in the box? Both halves of the same truth the
  // transcript renders from — the live lifecycle for the turn in flight, the
  // persisted rows for a reloaded conversation. No second data path.
  const records = useAppSelector(
    selectToolCallsForConversation(conversationId ?? ""),
  );
  const live = useAppSelector(
    selectLiveToolLifecycleByConversation(conversationId ?? ""),
  );
  const toolRan =
    records.some((record) => isSandboxTool(record.toolName)) ||
    (live
      ? [...live.values()].some((entry) => isSandboxTool(entry.toolName))
      : false);

  const items = useAppSelector(selectCanvasItems);
  const sourceId = sandboxRowId
    ? sandboxCanvasSourceId(conversationId, sandboxRowId)
    : null;
  const canvasHasOtherContent = items.some(
    (item) => item.sourceMessageId !== sourceId,
  );

  // The reveal decision SURVIVES RELOAD. It used to live only in a ref, and
  // the canvas slice is deliberately not persisted — so every reload replayed
  // the first-tool-call reveal and a pane the user had put away came back.
  //
  // Held in a ref, not state: this is a mirror of an external store
  // (localStorage) that only the effects below read and write, and it only
  // ever becomes MORE restrictive. Rendering nothing, there is nothing to
  // re-render for — and setState inside an effect would cascade for free.
  const memoryRef = useRef<{ key: string | null; value: SandboxCanvasMemory }>({
    key: null,
    value: { autoOpened: false, userClosed: false },
  });

  const readMemory = useCallback((key: string | null): SandboxCanvasMemory => {
    if (memoryRef.current.key !== key) {
      memoryRef.current = { key, value: readSandboxCanvasMemory(key) };
    }
    return memoryRef.current.value;
  }, []);

  const rememberMemory = useCallback(
    (key: string | null, patch: Partial<SandboxCanvasMemory>) => {
      const current = readMemory(key);
      memoryRef.current = { key, value: { ...current, ...patch } };
      writeSandboxCanvasMemory(key, patch);
    },
    [readMemory],
  );

  useEffect(() => {
    if (!sandboxRowId) return;
    const memory = readMemory(sourceId);
    const action = decideSandboxCanvasAction({
      bound: true,
      toolRan,
      autoOpen,
      alreadyAutoOpened: memory.autoOpened,
      userClosed: memory.userClosed,
      canvasHasOtherContent,
    });
    if (action === "none") return;
    const opts = {
      sandboxRowId,
      conversationId,
      fallbackName: sandboxName,
    };
    if (action === "open") {
      rememberMemory(sourceId, { autoOpened: true });
      open(opts);
      return;
    }
    offer(opts);
  }, [
    sandboxRowId,
    sandboxName,
    conversationId,
    sourceId,
    toolRan,
    autoOpen,
    canvasHasOtherContent,
    readMemory,
    rememberMemory,
    open,
    offer,
  ]);

  // "Put away canvas" while this sandbox pane was the one on screen is a
  // DECISION, and it is remembered. Reopening it clears the decision, so the
  // pane behaves normally again afterwards.
  const canvasIsOpen = useAppSelector(selectCanvasIsOpen);
  const currentItemId = useAppSelector(selectCurrentItemId);
  const sandboxItemId =
    items.find((item) => item.sourceMessageId === sourceId)?.id ?? null;
  const sandboxIsCurrent = !!sandboxItemId && currentItemId === sandboxItemId;
  const wasShowingSandbox = useRef(false);

  useEffect(() => {
    if (!sourceId) return;
    if (canvasIsOpen && sandboxIsCurrent) {
      wasShowingSandbox.current = true;
      if (readMemory(sourceId).userClosed) {
        rememberMemory(sourceId, { userClosed: false });
      }
      return;
    }
    // It was on screen a moment ago and now the canvas is closed: the user put
    // it away. That choice outlives the reload that used to undo it.
    if (wasShowingSandbox.current && !canvasIsOpen) {
      wasShowingSandbox.current = false;
      if (!readMemory(sourceId).userClosed) {
        rememberMemory(sourceId, { userClosed: true });
      }
    }
  }, [canvasIsOpen, sandboxIsCurrent, sourceId, readMemory, rememberMemory]);

  return null;
}

export default SandboxCanvasOpener;
