"use client";

// useMessageListInteractions — keyboard and touch access to every message:
//
//   Keyboard (on a focused message — Tab/click into the transcript first):
//     ArrowUp / ArrowDown (or k / j) · Home / End  move between messages
//     Enter, "." or Shift+F10 / ContextMenu         open that message's actions
//     p                                            pin / unpin it
//   Cmd/Ctrl+F inside the transcript                opens the in-thread find bar
//   Touch: long-press a message                     opens its actions menu
//
// The actions menu is the SAME registry menu the ⋯ button opens (we press that
// button), so there is exactly one menu. Messages carry `data-message-group`,
// a role and an aria-label, so a screen reader announces who said what.

import { useEffect } from "react";
import { nextMessageIndex } from "./message-keyboard-nav";
import { togglePinnedMessage } from "@/features/agents/message-pins/pinned-messages-store";

const GROUP = "[data-message-group]";
const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10;

function groupsIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(GROUP));
}

function openActions(group: HTMLElement): boolean {
  const trigger = group.querySelector<HTMLElement>(
    '[aria-label="More options"], [aria-label="Message options"]',
  );
  if (!trigger) return false;
  trigger.click();
  return true;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(
    el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)),
  );
}

export function useMessageListInteractions(
  rootRef: React.RefObject<HTMLElement | null>,
  onOpenFind: () => void,
  /** Re-attach when the transcript element mounts (empty → first message). */
  mounted: boolean,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !mounted) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        onOpenFind();
        return;
      }
      if (isTyping(e.target)) return;
      const group = (e.target as HTMLElement | null)?.closest<HTMLElement>(GROUP);
      if (!group || group !== e.target) return;
      const groups = groupsIn(root);
      const index = groups.indexOf(group);
      const next = nextMessageIndex(index, e.key, groups.length);
      if (next !== null && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        groups[next]?.focus();
        groups[next]?.scrollIntoView({ block: "nearest" });
        return;
      }
      if (e.key === "Enter" || e.key === "." || e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
        if (openActions(group)) e.preventDefault();
        return;
      }
      if (e.key === "p" && !e.metaKey && !e.ctrlKey) {
        const id = group.dataset.primaryMessageId;
        if (id) {
          e.preventDefault();
          void togglePinnedMessage(id);
        }
      }
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    let start: { x: number; y: number } | null = null;
    let fired = false;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      start = null;
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const group = (e.target as HTMLElement | null)?.closest<HTMLElement>(GROUP);
      if (!group || (e.target as HTMLElement).closest("button, a, input, textarea, [role='menu']")) return;
      fired = false;
      start = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        timer = null;
        if (openActions(group)) {
          fired = true;
          window.getSelection()?.removeAllRanges();
          navigator.vibrate?.(10);
        }
      }, LONG_PRESS_MS);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!start) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE) cancel();
    };
    // A fired long-press swallows the click / native menu that follows the
    // finger lifting. That click lands on whatever is under the finger NOW —
    // usually the just-opened menu's backdrop, outside this transcript — so
    // it is swallowed at the DOCUMENT, once, within a short window.
    const swallow = (e: Event) => {
      if (fired) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onPointerUp = () => {
      cancel();
      if (!fired) return;
      const doc = root.ownerDocument;
      const once = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        release();
      };
      const release = () => {
        fired = false;
        doc.removeEventListener("click", once, true);
      };
      doc.addEventListener("click", once, true);
      setTimeout(release, 700);
    };

    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointercancel", cancel);
    root.addEventListener("contextmenu", swallow, true);
    return () => {
      cancel();
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", cancel);
      root.removeEventListener("contextmenu", swallow, true);
    };
  }, [rootRef, onOpenFind, mounted]);
}
