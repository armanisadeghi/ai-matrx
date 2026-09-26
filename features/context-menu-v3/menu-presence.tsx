"use client";

// features/context-menu-v3/menu-presence.tsx
//
// 🚨 "AM I ALREADY INSIDE A MENU?"
//
// v3's nesting rule is THE INNERMOST WINS — every trigger stops propagation, so
// an inner menu shadows every outer one. That rule is correct for the cases it
// was written for, and it becomes a trap the moment a shared PRIMITIVE wants to
// mount a menu of its own.
//
// `ProTextarea` is the case that forced this (2026-08-26). It has 387
// consumers, 361 of which have no right-click menu at all — the single largest
// coverage gap in the app, and every one of them is also a field agents cannot
// stream edits into, because `EditableContextMenu` is what registers the
// WidgetHandle. Mounting a menu inside ProTextarea fixes all 361 at once.
//
// But ~26 consumers ALREADY wrap their ProTextarea in a carefully-wired menu
// carrying their own entity, surfaceName and extraSections. Under
// innermost-wins, a menu inside ProTextarea would SHADOW every one of those —
// silently replacing a rich, surface-specific menu with a generic one, on
// exactly the surfaces someone took the trouble to wire properly.
//
// So the primitive has to be able to ask whether an ancestor already provides a
// menu, and stand down when one does. That is all this module is: a boolean
// context published by the shell.
//
// THE RULE FOR PRIMITIVES: a shared component may mount its own menu ONLY as a
// FLOOR — when nothing above it has. A surface that wires its own menu always
// wins, and never has to know the primitive exists.

import { createContext, useContext } from "react";
import type { ContentSource } from "@/features/rich-document/types";

/**
 * True anywhere inside a mounted v3 menu (either wrapper). Provided by the
 * shell; read by shared primitives that would otherwise nest.
 */
const MenuPresenceContext = createContext(false);

export const MenuPresenceProvider = MenuPresenceContext.Provider;

/**
 * `true` when some ancestor already mounts a v3 menu.
 *
 * A shared primitive uses this to decide whether to provide its own floor:
 *
 * ```tsx
 * const insideMenu = useIsInsideContextMenu();
 * return insideMenu ? field : <EditableContextMenu …>{field}</EditableContextMenu>;
 * ```
 *
 * Do NOT use it to change what a menu CONTAINS — only whether a primitive
 * mounts one at all. Content decisions belong to the surface.
 */
export function useIsInsideContextMenu(): boolean {
  return useContext(MenuPresenceContext);
}

/**
 * THE ONE MENU (RC-B6). The content source of the innermost v3 menu that was
 * given one (`contentSource`) — null when none. A ⋯ button whose own content
 * is that same source opens THIS menu (openContextMenuForElement) instead of
 * drawing a second one, so the ⋯ menu and the right-click are the same menu
 * by construction: same registry tree, same agent libraries, same order.
 */
const RegistryMenuSourceContext = createContext<ContentSource | null>(null);

export const RegistryMenuSourceProvider = RegistryMenuSourceContext.Provider;

export function useRegistryMenuSource(): ContentSource | null {
  return useContext(RegistryMenuSourceContext);
}

/** Two sources name the same content (type + every identifying id). */
export function sameContentSource(
  a: ContentSource | null | undefined,
  b: ContentSource | null | undefined,
): boolean {
  if (!a || !b || a.type !== b.type) return false;
  return contentSourceKey(a) === contentSourceKey(b);
}

/**
 * A content source's identity as one string (every identifying field, the
 * read-only flag excluded). The shell stamps it on its trigger
 * (`data-content-source`) so a ⋯ button can open the ONE menu that carries its
 * content even when the button renders beside that content, not inside it.
 */
export function contentSourceKey(s: ContentSource): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(s as Record<string, unknown>)
        .filter(([k]) => k !== "readOnly")
        .sort(([x], [y]) => x.localeCompare(y)),
    ),
  );
}
