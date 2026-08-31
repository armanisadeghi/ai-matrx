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
