"use client";

/**
 * THE PAGE'S CONTEXT FOR THE SHELL CHAT — how a page hands the ONE chat (the
 * shell's `ShellChatDock`) what it is showing, instead of owning a chat.
 *
 *   useShellChatContext({ getCanvasContext, contextChip })
 *
 * `getCanvasContext()` returns ONE named context entry (never user input —
 * THE USER-INPUT LAW); the chat column writes it when the conversation exists
 * and again right before every send, and drops it when the page goes away.
 * `contextChip` is the composer pill for it (`contextKey` = the entry's key).
 *
 * A page that publishes its OWN surface (the Board's `matrx-user/board`)
 * passes nothing here: every conversation already follows the page surface
 * (`useConversationFollowsPage`), and a second snapshot would send it twice.
 *
 * A module store, not React context: the dock is a sibling of the page under
 * the shell, so no context reaches from `<main>` into it. Newest wins;
 * releasing restores the one underneath.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { AttachedContextRailItem } from "../../agents/components/inputs/smart-input/ConversationContextRail";
import type { CanvasContextEntry } from "./CanvasChatColumn";

export interface ShellChatPageContext {
  /** The page as ONE context entry. Called at send time; keep it cheap. */
  getCanvasContext?: () => CanvasContextEntry;
  /** Shown in the composer's context rail. */
  contextChip?: AttachedContextRailItem;
}

const stack: { token: symbol; context: ShellChatPageContext }[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of [...listeners]) listener();
}

/** Register the page's context. Returns the release. */
export function registerShellChatPageContext(context: ShellChatPageContext): () => void {
  const token = Symbol("shell-chat-page-context");
  stack.push({ token, context });
  emit();
  return () => {
    const at = stack.findIndex((entry) => entry.token === token);
    if (at >= 0) stack.splice(at, 1);
    emit();
  };
}

function current(): ShellChatPageContext | null {
  return stack[stack.length - 1]?.context ?? null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What the page on screen hands the shell chat (null = nothing). The dock reads this. */
export function useShellChatPageContext(): ShellChatPageContext | null {
  return useSyncExternalStore(subscribe, current, () => null);
}

/**
 * A page hands the shell chat its context while mounted. The latest
 * `getCanvasContext` is always the one called (it may close over fresh state
 * every render) without re-registering; a new chip re-registers.
 */
export function useShellChatContext(context: ShellChatPageContext | null | undefined): void {
  const latest = useRef(context);
  useEffect(() => {
    latest.current = context;
  });
  const hasEntry = Boolean(context?.getCanvasContext);
  const chip = context?.contextChip;
  useEffect(() => {
    if (!hasEntry && !chip) return undefined;
    return registerShellChatPageContext({
      getCanvasContext: hasEntry
        ? () => {
            const read = latest.current?.getCanvasContext;
            if (!read) throw new Error("[shell-chat] the page's context reader went away while still registered");
            return read();
          }
        : undefined,
      contextChip: chip,
    });
  }, [hasEntry, chip]);
}

/** Test seam. */
export function resetShellChatPageContextForTest() {
  stack.length = 0;
  emit();
}
