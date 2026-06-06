/**
 * Peek registry — catalogue key → lazy peek component.
 *
 * Each kind's peek lives in ./kinds/<Kind>Peek.tsx with a `default` export of
 * `ComponentType<PeekProps>`. Register it here (one line) and it lights up the
 * "Peek" action on that kind's resource rows. Kinds not in the registry show
 * "Peek — coming soon".
 *
 * Keyed by catalogue key (e.g. 'agent', 'file', 'note') — the same key the
 * resource page uses.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { PeekProps } from "./types";

export const PEEK_REGISTRY: Record<
  string,
  LazyExoticComponent<ComponentType<PeekProps>>
> = {
  agent: lazy(() => import("./kinds/AgentPeek")),
  file: lazy(() => import("./kinds/FilePeek")),
  note: lazy(() => import("./kinds/NotePeek")),
  // Add new kinds here as their peek components land.
};

export function hasPeek(key: string): boolean {
  return key in PEEK_REGISTRY;
}
