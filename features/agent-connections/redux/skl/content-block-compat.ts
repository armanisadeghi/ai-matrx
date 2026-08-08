/**
 * Content-block compatibility layer — the bridge from the retired
 * `features/agents/redux/agent-content-blocks` slice onto the canonical
 * `skl` slice (`skill.render_definition`).
 *
 * "Content blocks" and "render blocks" are the SAME rows: `skill.render_definition`
 * (2026-08 canonicalization; `public.content_blocks` is retired — see
 * scripts/dead-relations.json). Consumers that used the old slice's selectors
 * (the unified agent context menu, agent-shortcuts hooks) read through these
 * selectors instead. Reads hydrate via `fetchRenderDefinitions` /
 * `fetchUnifiedMenu`; writes go through the skl thunks
 * (`createRenderDefinition` / `updateRenderDefinition` / `deleteRenderDefinition`).
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import {
  matchesScope,
  type Scope,
  type ScopeRef,
} from "@/features/agents/redux/shared/scope";
import { selectAllRenderDefinitions } from "./selectors";
import type { SklRenderDefinition } from "./types";

/**
 * Legacy aliases — the old slice carried `_dirty`/`_loading` bookkeeping that
 * no remaining consumer reads; both names now mean the canonical row shape.
 */
export type AgentContentBlockDef = SklRenderDefinition;
export type AgentContentBlockRecord = SklRenderDefinition;

export const selectAllContentBlocksArray = selectAllRenderDefinitions;

export const selectContentBlocksByScope = createSelector(
  [
    selectAllRenderDefinitions,
    (_s: RootState, scope: Scope, _scopeId?: string | null) => scope,
    (_s: RootState, _scope: Scope, scopeId?: string | null) => scopeId ?? null,
  ],
  (blocks, scope, scopeId): SklRenderDefinition[] =>
    blocks.filter((b) => matchesScope(b, { scope, scopeId })),
);

export const selectContentBlocksByScopeRef = createSelector(
  [selectAllRenderDefinitions, (_s: RootState, ref: ScopeRef) => ref],
  (blocks, ref): SklRenderDefinition[] =>
    blocks.filter((b) => matchesScope(b, ref)),
);

export const selectActiveContentBlocks = createSelector(
  [selectAllRenderDefinitions],
  (blocks): SklRenderDefinition[] => blocks.filter((b) => b.isActive),
);
