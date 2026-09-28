// features/agent-shortcuts/draft-seed.ts
//
// A NEW shortcut can start from a mapping someone already built. The Custom
// Agent screen (right-click → Custom agent…) holds a person's one-off mapping
// in the same `ValueMappingMap` language a shortcut stores; "Save as shortcut"
// parks it here and opens the ONE shortcut editor, which starts its draft
// from it. Module scope, taken once — same lifetime as the client navigation
// that carries its id.

import type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";
import type { ValueMappingMap } from "@/features/surfaces/types";

export interface ShortcutDraftSeed {
  surfaceName: string | null;
  valueMappings: ValueMappingMap;
  displayMode: ResultDisplayMode;
  allowChat: boolean;
  autoRun: boolean;
}

const seeds = new Map<string, ShortcutDraftSeed>();

export function putShortcutDraftSeed(seed: ShortcutDraftSeed): string {
  const id = crypto.randomUUID();
  seeds.set(id, seed);
  return id;
}

/** The seed for this id, removed as it is read. */
export function takeShortcutDraftSeed(
  id: string | null | undefined,
): ShortcutDraftSeed | null {
  if (!id) return null;
  const seed = seeds.get(id) ?? null;
  seeds.delete(id);
  return seed;
}

/**
 * The seed for a person's own mapping: a run they open in a floating window,
 * that waits for them to press send and lets them keep chatting.
 */
export function shortcutSeedForMapping(
  valueMappings: ValueMappingMap,
  surfaceName: string | null,
): ShortcutDraftSeed {
  return {
    surfaceName,
    valueMappings,
    displayMode: "floating-chat",
    allowChat: true,
    autoRun: false,
  };
}
