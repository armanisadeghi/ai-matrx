/**
 * useConversationRowMenu — list-level singleton hook for the conversation
 * row context menu.
 *
 * Mounts ONE `<ConversationRowMenu />` per list (no matter how many rows
 * the list contains) and exposes a single `openForRow(rowCtx, anchor)`
 * function that every row binds to its ⋯ button and `onContextMenu`.
 * This keeps the dialog/portal cost flat as lists grow to hundreds of
 * conversations.
 *
 * Anchor flexibility:
 *   - `HTMLElement` → menu anchors to the element (⋯ button click).
 *   - `MouseEvent`  → menu anchors to a synthetic 1×1 div placed at the
 *     event coordinates (right-click / `onContextMenu`).
 *   - `null`        → menu closes.
 *
 * The synthetic anchor is owned by the hook so the menu component never
 * has to know which kind it received.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

/**
 * Per-row data the menu factory needs to render. Passed by the consumer
 * each time a row's menu is opened — the menu re-builds its items every
 * open, so subsequent renames / favorites / archives are reflected
 * without remount.
 */
export interface ConversationRowMenuData {
  conversationId: string;
  title: string | null;
  isFavorite: boolean;
  isArchived: boolean;
  isOwner: boolean;
  href: string;
  surfaceKey?: string;
}

export type MenuAnchor =
  | HTMLElement
  | MouseEvent
  | ReactMouseEvent<unknown>
  | { x: number; y: number };

interface InternalState {
  isOpen: boolean;
  data: ConversationRowMenuData | null;
  anchorElement: HTMLElement | null;
}

export interface UseConversationRowMenuResult {
  /** Open the shared menu for `data`, anchored to a button element, mouse
   * event, or `{ x, y }` coordinates. */
  openForRow: (data: ConversationRowMenuData, anchor: MenuAnchor) => void;
  /** Close the menu without firing an action. */
  close: () => void;
  /** Controlled props to spread onto `<ConversationRowMenu />`. */
  menuProps: {
    isOpen: boolean;
    data: ConversationRowMenuData | null;
    anchorElement: HTMLElement | null;
    onClose: () => void;
  };
}

/**
 * Returns a tuple of `{ openForRow, close, menuProps }`. The consumer:
 *   - Calls `openForRow(rowCtx, e | btnRef.current)` from each row.
 *   - Spreads `menuProps` onto a single `<ConversationRowMenu />` mounted
 *     at the list's root.
 */
export function useConversationRowMenu(): UseConversationRowMenuResult {
  const [state, setState] = useState<InternalState>({
    isOpen: false,
    data: null,
    anchorElement: null,
  });

  // Synthetic anchor div for right-click positions. Lives in `body`, lazy-
  // created on first non-element anchor. Cleaned up on unmount.
  const syntheticAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (syntheticAnchorRef.current) {
        syntheticAnchorRef.current.remove();
        syntheticAnchorRef.current = null;
      }
    };
  }, []);

  const positionSyntheticAt = useCallback(
    (x: number, y: number): HTMLElement => {
      let el = syntheticAnchorRef.current;
      if (!el) {
        el = document.createElement("div");
        el.setAttribute("data-conversation-row-menu-anchor", "");
        el.style.position = "fixed";
        el.style.width = "1px";
        el.style.height = "1px";
        el.style.pointerEvents = "none";
        el.style.opacity = "0";
        document.body.appendChild(el);
        syntheticAnchorRef.current = el;
      }
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      return el;
    },
    [],
  );

  const openForRow = useCallback(
    (data: ConversationRowMenuData, anchor: MenuAnchor) => {
      let anchorElement: HTMLElement;

      if (anchor instanceof HTMLElement) {
        anchorElement = anchor;
      } else if (anchor && "clientX" in anchor && "clientY" in anchor) {
        anchorElement = positionSyntheticAt(anchor.clientX, anchor.clientY);
      } else if (anchor && "x" in anchor && "y" in anchor) {
        anchorElement = positionSyntheticAt(anchor.x, anchor.y);
      } else {
        // Anchor missing — bail rather than rendering an unanchored menu.
        return;
      }

      setState({ isOpen: true, data, anchorElement });
    },
    [positionSyntheticAt],
  );

  const close = useCallback(() => {
    setState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  }, []);

  return {
    openForRow,
    close,
    menuProps: {
      isOpen: state.isOpen,
      data: state.data,
      anchorElement: state.anchorElement,
      onClose: close,
    },
  };
}
