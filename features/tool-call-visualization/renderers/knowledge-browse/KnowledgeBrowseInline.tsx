"use client";

import type React from "react";
import type { ToolRendererProps } from "../../types";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { getArg, resultAsObject } from "../_shared";
import { GenericRenderer } from "../../registry/GenericRenderer";
import { KnowledgeSourcesInline } from "./KnowledgeSourcesInline";
import { KnowledgeChunkInline } from "./KnowledgeChunkInline";
import { KnowledgeStoresInline } from "./KnowledgeStoresInline";
import { KnowledgeStoreInline } from "./KnowledgeStoreInline";
import { KnowledgeEntityInline } from "./KnowledgeEntityInline";

/**
 * Inline renderer for `knowledge_browse` — the ONE index-navigation tool that
 * absorbed five formerly-separate tools on 2026-07-18. The registry maps one
 * renderer per tool name, so the per-action split lives HERE: each action keeps
 * the purpose-built component it had when it was its own tool.
 *
 *   sources → the indexed-source inventory   (was `rag_list_sources`)
 *   stores  → the data-store roster          (was `rag_list_data_stores`)
 *   store   → one store + its members        (was `rag_get_data_store`)
 *   chunk   → the full passage text          (was `rag_get_chunk`)
 *   entity  → the knowledge-graph map        (was `knowledge_navigate`)
 *
 * `action` is a REQUIRED arg on the wire (a discriminated union server-side), so
 * the arg is the authoritative discriminator. The result-shape sniff below is a
 * pure backstop for a persisted row whose arguments never made it to the client
 * — it never overrides a valid `action`.
 */

type BrowseAction = "sources" | "stores" | "store" | "chunk" | "entity";

const RENDERERS: Record<
  BrowseAction,
  React.ComponentType<ToolRendererProps>
> = {
  sources: KnowledgeSourcesInline,
  stores: KnowledgeStoresInline,
  store: KnowledgeStoreInline,
  chunk: KnowledgeChunkInline,
  entity: KnowledgeEntityInline,
};

function isBrowseAction(v: unknown): v is BrowseAction {
  return typeof v === "string" && v in RENDERERS;
}

/**
 * Backstop only — infer the action from the result's variant-unique key when
 * the arguments are unavailable. Ordered most-specific first.
 */
function inferActionFromResult(entry: ToolLifecycleEntry): BrowseAction | null {
  const result = resultAsObject(entry);
  if (!result) return null;
  if (Array.isArray(result.sources)) return "sources";
  if (Array.isArray(result.data_stores)) return "stores";
  if (Array.isArray(result.members)) return "store";
  if (Array.isArray(result.artifacts) || Array.isArray(result.linked_entities))
    return "entity";
  if (typeof result.chunk_id === "string" || typeof result.text === "string")
    return "chunk";
  return null;
}

export function KnowledgeBrowseInline(props: ToolRendererProps) {
  const raw = getArg<unknown>(props.entry, "action");
  const action = isBrowseAction(raw) ? raw : inferActionFromResult(props.entry);

  // No action and no recognizable result shape: the generic renderer shows the
  // real payload rather than silently rendering the wrong purpose-built card.
  if (!action) return <GenericRenderer {...props} />;

  const Component = RENDERERS[action];
  return <Component {...props} />;
}
