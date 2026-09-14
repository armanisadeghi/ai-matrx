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

import { useEffect, useRef } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { getEffectiveSandboxRef } from "@/lib/sandbox/active-binding";
import { selectCanvasItems } from "@/features/canvas/redux/canvasSlice";
import { selectToolCallsForConversation } from "@/features/agents/redux/execution-system/observability/observability.selectors";
import { selectLiveToolLifecycleByConversation } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { isSandboxTool } from "./sandbox-activity";
import {
  decideSandboxCanvasAction,
  sandboxCanvasSourceId,
  useOpenSandboxCanvas,
} from "./useOpenSandboxCanvas";

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

  const autoOpenedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!sandboxRowId) return;
    const action = decideSandboxCanvasAction({
      bound: true,
      toolRan,
      autoOpen,
      alreadyAutoOpened: autoOpenedFor.current === sourceId,
      canvasHasOtherContent,
    });
    if (action === "none") return;
    const opts = {
      sandboxRowId,
      conversationId,
      fallbackName: sandboxName,
    };
    if (action === "open") {
      autoOpenedFor.current = sourceId;
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
    open,
    offer,
  ]);

  return null;
}

export default SandboxCanvasOpener;
