"use client";

/**
 * The open/closed state of the chat room's "Sandbox" side panel, and the
 * bound-box reference that decides whether the panel exists at all.
 *
 * Two components read this from two different React trees — the toggle lives
 * in the app-shell header (`ChatRunHeader`) while the panel itself renders
 * inside the room body (`ChatRoomClient`) — so the state is a USER PREFERENCE
 * in Redux, never component state. That also satisfies the product rule: the
 * choice follows the user across reloads and devices.
 *
 * `chatSandboxPanelOpen` is tri-state on purpose. "auto" means the user has
 * never expressed a preference, and the sensible default differs by viewport:
 * a phone has no room for a side panel, a desktop does. A boolean cannot tell
 * "never touched" apart from "deliberately closed".
 */

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { useIsMobile } from "@/hooks/use-mobile";
import { getEffectiveSandboxRef } from "@/lib/sandbox/active-binding";

export type ChatSandboxPanelPref = "auto" | "open" | "closed";

export interface ChatSandboxPanelState {
  /** The bound box's row id, or null when this conversation has no box. */
  boundRowId: string | null;
  /** Display label latched at binding time, when the binding carries one. */
  boundName: string | null;
  /** "ec2" | "hosted" | "local-pc" — where the box actually lives. */
  boundKind: string | null;
  boundTier: string | null;
  /** True when the panel should be on screen right now. */
  open: boolean;
  /** True when the toggle control should exist at all. */
  available: boolean;
  /** Phone viewport — the panel renders as a bottom sheet instead. */
  isMobile: boolean;
  toggle: () => void;
  close: () => void;
}

/**
 * Resolve the panel state for one conversation.
 *
 * Deliberately uses `getEffectiveSandboxRef`, NOT `resolveAgentSandboxRef`:
 * the latter returns null for a box the token-mint has learned is dead, and a
 * dead box is exactly the case this panel exists to explain. Hiding the panel
 * the moment the box dies would reproduce the blindness it is fixing.
 */
export function useChatSandboxPanel(
  conversationId: string | null | undefined,
): ChatSandboxPanelState {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();

  // Primitive selections only — getEffectiveSandboxRef returns a fresh object
  // on every call, so selecting the object itself would re-render this hook's
  // consumers on every unrelated store change.
  const boundRowId = useAppSelector(
    (s) => getEffectiveSandboxRef(s, conversationId)?.rowId ?? null,
  );
  const boundName = useAppSelector(
    (s) => getEffectiveSandboxRef(s, conversationId)?.name ?? null,
  );
  const boundKind = useAppSelector(
    (s) => getEffectiveSandboxRef(s, conversationId)?.kind ?? null,
  );
  const boundTier = useAppSelector(
    (s) => getEffectiveSandboxRef(s, conversationId)?.tier ?? null,
  );
  const pref = useAppSelector(
    (s) => s.userPreferences.coding.chatSandboxPanelOpen ?? "auto",
  ) as ChatSandboxPanelPref;

  const available = Boolean(boundRowId);
  const resolved = pref === "auto" ? !isMobile : pref === "open";
  const open = available && resolved;

  const write = (value: ChatSandboxPanelPref) => {
    dispatch(
      setPreference({
        module: "coding",
        preference: "chatSandboxPanelOpen",
        value,
      }),
    );
  };

  return {
    boundRowId,
    boundName,
    boundKind,
    boundTier,
    open,
    available,
    isMobile,
    toggle: () => write(resolved ? "closed" : "open"),
    close: () => write("closed"),
  };
}
