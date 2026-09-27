"use client";

/**
 * useChatDock — the ONE controller for the shell's chat dock, read by the dock
 * itself and by its header control (and the phone overflow row).
 *
 *   - Desktop (≥1024px): the dock is a column of the shell grid, open/closed
 *     remembered in a cookie. Until someone toggles it in this tab, readers use
 *     the server-read value they were rendered with (`initialOpen`).
 *   - Below 1024px: the same chat opens as a bottom sheet — never remembered,
 *     so a dock left open on a desktop never throws a sheet over a phone.
 *   - On a route that has its own chat (the /chat pages, canvas pages) the
 *     dock is unavailable: closed, and the control is disabled with the reason.
 */

import { usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useMediaQueryState } from "@/hooks/use-media-query";
import {
  selectChatDockOpen,
  selectChatDockSheetOpen,
  setChatDockOpen,
  setChatDockSheetOpen,
} from "@/lib/redux/slices/layoutSlice";
import { chatDockUnavailableReason, writeChatDockOpen } from "./chat-dock-cookie";

export const CHAT_DOCK_COMPACT_QUERY = "(max-width: 1023px)";

export interface ChatDockController {
  /** Desktop column open (independent of the viewport; the CSS hides it below 1024px). */
  dockOpen: boolean;
  /** Phone/tablet sheet open. */
  sheetOpen: boolean;
  compact: boolean;
  /**
   * The chat is on screen right now (column on a wide screen, sheet below
   * 1024px). False until the viewport is KNOWN — a phone's first render must
   * never start the conversation of a dock left open on a desktop.
   */
  shown: boolean;
  /** Null when the dock can open on this route; otherwise why not. */
  unavailableReason: string | null;
  /** What the header control shows as pressed. */
  pressed: boolean;
  toggle: () => void;
  closeDock: () => void;
  closeSheet: () => void;
}

export function useChatDock(initialOpen: boolean): ChatDockController {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const viewportCompact = useMediaQueryState(CHAT_DOCK_COMPACT_QUERY);
  const compact = viewportCompact === true;
  const stored = useAppSelector(selectChatDockOpen);
  const sheetOpenRaw = useAppSelector(selectChatDockSheetOpen);
  const unavailableReason = chatDockUnavailableReason(pathname ?? "/");
  const available = unavailableReason === null;
  const dockOpen = available && (stored ?? initialOpen);
  const sheetOpen = available && compact && sheetOpenRaw;
  const shown = viewportCompact === null ? false : viewportCompact ? sheetOpen : dockOpen;

  const setDock = (open: boolean) => {
    dispatch(setChatDockOpen(open));
    writeChatDockOpen(open);
  };

  return {
    dockOpen,
    sheetOpen,
    compact,
    shown,
    unavailableReason,
    pressed: compact ? sheetOpen : dockOpen,
    toggle: () => {
      if (!available) return;
      if (compact) dispatch(setChatDockSheetOpen(!sheetOpen));
      else setDock(!dockOpen);
    },
    closeDock: () => setDock(false),
    closeSheet: () => dispatch(setChatDockSheetOpen(false)),
  };
}
