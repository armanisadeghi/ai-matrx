"use client";

/**
 * useOpenSandboxCanvas — the ONE way the Sandbox reaches the Canvas.
 *
 * The sandbox is a canvas CONTENT TYPE (`sandbox`), exactly like the Cloud
 * Browser (`cloud_browser`) and the working document. It is opened and
 * switched the way every other canvas content is, it collapses and resizes
 * with the canvas, and it never owns the region.
 *
 * Two verbs, and the difference between them is the whole design:
 *
 *   `open`  — put the sandbox on screen NOW (the canvas opens on this pane).
 *   `offer` — make it AVAILABLE in the canvas switcher and change nothing on
 *             screen. This is what happens when the user is already looking
 *             at a document or the browser: the champions' rule is that the
 *             agent's terminal appears on demand, never by yanking the user
 *             out of what they were reading.
 *
 * `sandbox` is NON_PERSISTABLE — a pty and a live file tree are never written
 * to `canvas_items`.
 */

import { useCallback } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import {
  offerCanvasItem,
  openCanvas,
  type CanvasContent,
} from "@/features/canvas/redux/canvasSlice";
import { useCanvasOpenGuard } from "@/features/canvas/hooks/useCanvasOpenGuard";
import { keepLiveSourceReachable } from "@/features/canvas/liveSourceReachability";

export interface OpenSandboxCanvasOptions {
  /** The box to show — `sandbox_instances.id`. */
  sandboxRowId: string;
  /** The chat whose sandbox work the Activity tab lists. */
  conversationId?: string | null;
  /** Label latched at binding time, so the pane paints before the row lands. */
  fallbackName?: string | null;
}

/**
 * Stable per-chat canvas identity, so opening twice (or offering then
 * opening) shows the ONE pane rather than stacking sandboxes.
 */
export function sandboxCanvasSourceId(
  conversationId: string | null | undefined,
  sandboxRowId: string,
): string {
  return `sandbox:${conversationId ?? "none"}:${sandboxRowId}`;
}

export function buildSandboxCanvasContent({
  sandboxRowId,
  conversationId,
  fallbackName,
}: OpenSandboxCanvasOptions): CanvasContent {
  return {
    type: "sandbox",
    data: {
      sandboxRowId,
      fallbackName: fallbackName ?? undefined,
    },
    metadata: {
      title: "Sandbox",
      conversationId: conversationId ?? undefined,
      sourceMessageId: sandboxCanvasSourceId(conversationId, sandboxRowId),
    },
  };
}

export function useOpenSandboxCanvas() {
  const dispatch = useAppDispatch();
  const { ensureCanvasReachable } = useCanvasOpenGuard();

  const open = useCallback(
    (opts: OpenSandboxCanvasOptions): boolean => {
      // A route with no canvas surface would swallow this open entirely — the
      // sandbox pane would simply never appear and nothing would say so.
      if (!ensureCanvasReachable("Sandbox")) return false;
      dispatch(openCanvas(buildSandboxCanvasContent(opts)));
      return true;
    },
    [dispatch, ensureCanvasReachable],
  );

  const offer = useCallback(
    (opts: OpenSandboxCanvasOptions) => {
      dispatch(offerCanvasItem(buildSandboxCanvasContent(opts)));
    },
    [dispatch],
  );

  return { open, offer };
}

// ── The on-demand decision ──────────────────────────────────────────────────

export type SandboxCanvasAction = "open" | "offer" | "none";

export interface SandboxCanvasDecisionInput {
  /** Does this conversation have a bound box at all? */
  bound: boolean;
  /** Has a sandbox tool run in this conversation yet? */
  toolRan: boolean;
  /** The user preference — on by default, off means never auto-open. */
  autoOpen: boolean;
  /**
   * Have we already auto-opened for this box in this conversation? Read from
   * `sandboxCanvasMemory`, not from a ref: a ref is wiped by the reload the
   * user is complaining about.
   */
  alreadyAutoOpened: boolean;
  /**
   * Did the user PUT THIS PANE AWAY? Then it stays away — across reloads,
   * across later tool calls, until they open it themselves. Remembered per
   * conversation × box.
   */
  userClosed: boolean;
  /** Does the canvas hold anything OTHER than this sandbox pane? */
  canvasHasOtherContent: boolean;
}

/**
 * What the sandbox surface should do right now. Pure, so the rules that matter
 * are pinned by tests rather than by reading a component:
 *
 *  1. No bound box → nothing exists. Never a control with nothing behind it.
 *  2. Bound but nothing has run → AVAILABLE, not visible. The canvas stays
 *     closed; the pane is one click away in the switcher.
 *  3. THE USER PUT IT AWAY → it stays away. Offered, never opened — including
 *     after the reload that used to resurrect it.
 *  4. Revealed once already → OFFERED, never opened again. This used to be
 *     `"none"`, and `"none"` meant the item was not even put in the switcher:
 *     after a reload (canvas slice not persisted, reveal memory persisted) a
 *     bound chat that also held a document showed ONLY the document, the
 *     switcher stayed hidden at one item, and the live box had NO door left
 *     (independent review, production `528560bbc8`, 2026-09-15). The rule now
 *     lives once, in `keepLiveSourceReachable`.
 *  5. First sandbox tool call, canvas showing nothing else → OPEN, the way
 *     Claude Code reveals its terminal the moment it runs a command.
 *  6. Canvas already showing a document / the browser, or the user turned
 *     auto-open off → OFFER. Never hijack.
 */
export function decideSandboxCanvasAction({
  bound,
  toolRan,
  autoOpen,
  alreadyAutoOpened,
  userClosed,
  canvasHasOtherContent,
}: SandboxCanvasDecisionInput): SandboxCanvasAction {
  // A bound box IS the live source. Everything below decides only between
  // showing the pane and merely offering it; the normalizer guarantees that a
  // bound conversation can never end up with no Sandbox entry at all, and that
  // an unbound one never grows a Sandbox entry with nothing behind it.
  return keepLiveSourceReachable(
    decideSandboxReveal({
      toolRan,
      autoOpen,
      alreadyAutoOpened,
      userClosed,
      canvasHasOtherContent,
    }),
    bound,
  );
}

/** The sandbox's OWN preference, before the reachability floor is applied. */
function decideSandboxReveal({
  toolRan,
  autoOpen,
  alreadyAutoOpened,
  userClosed,
  canvasHasOtherContent,
}: Omit<SandboxCanvasDecisionInput, "bound">): SandboxCanvasAction {
  if (!toolRan) return "offer";
  if (userClosed) return "offer";
  if (alreadyAutoOpened) return "none";
  if (!autoOpen) return "offer";
  if (canvasHasOtherContent) return "offer";
  return "open";
}
