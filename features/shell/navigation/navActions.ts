"use client";

/**
 * Shell nav action registry
 *
 * The single place that maps a declarative `ShellNavActionId` (set on a nav
 * entry in `nav-data.ts`) to the client-side handler that runs when an
 * action-aware surface (e.g. the desktop sidebar flyout) activates it. This is
 * how a sidebar entry can trigger an overlay/window IN PLACE instead of
 * navigating to a route.
 *
 * Pattern for adding the next one (this is the first of many):
 *   1. Add the id to `ShellNavActionId` in `constants/nav-data.ts`.
 *   2. Call its opener hook here and return a handler under that id.
 *   3. Set `action: "<id>"` on the nav entry (keep `href` as the fallback).
 * The `Record<ShellNavActionId, …>` return type makes step 1 without step 2 a
 * compile error, so the registry can never drift from the id union.
 *
 * Handlers must be cheap to build every render — they're plain closures over
 * opener hooks (React Compiler handles memoization; do not hand-memoize).
 */

import { useOpenCreateProjectWindow } from "@/features/window-panels/windows/projects/useOpenCreateProjectWindow";
import type { ShellNavActionId } from "../constants/nav-data";

export type ShellNavActionHandlers = Record<ShellNavActionId, () => void>;

export function useNavActions(): ShellNavActionHandlers {
  const openCreateProject = useOpenCreateProjectWindow();

  return {
    "create-project": () => {
      openCreateProject({});
    },
  };
}
