/**
 * The Phase-4 render flip, as a pure block transform.
 *
 * A block whose `metadata.__ir` envelope resolved a REGISTERED kind is
 * routed to that kind's component: today via the legacy-bridge facet
 * (`legacyBlockType` + `toLegacyServerData`), so the block enters the
 * existing unified renderer as its real type with envelope-derived
 * serverData. Blocks with no envelope, an unregistered kind, or no bridge
 * facet pass through UNTOUCHED — the strangler seam.
 *
 * This is where a bare/fenced JSON flashcard_set — which the legacy
 * detectors could only ever call "code" — becomes real flashcards, live
 * while streaming (the accumulator refreshes the envelope every flush).
 */

import { envelopeFromCompleteValue } from "../core/normalize";
import { readObjectKind } from "../core/kind-schema.types";
import { kindRegistry } from "../registry/kind-registry";
import {
  resolveComponent,
  type ComponentResolution,
} from "../registry/component-registry";
import { readEnvelope } from "../redux/render-block-envelope";

export interface IrRoutableBlock {
  type: string;
  serverData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Runtime routing marker (the Shape System's verification hook): stamped on
 * `metadata.__ir_route` whenever a block routes AND the component resolver
 * produced the decision. `by` says which resolver tier answered ("compiled"
 * floor vs a warm `content_ir.kind_component` row) — the live proof of
 * registry-resolution vs hard-coded fallback. Metadata-only, non-breaking.
 */
export const IR_ROUTE_KEY = "__ir_route" as const;

export interface IrRouteMarker {
  by: ComponentResolution["resolvedBy"];
  key: string;
}

function withRouteMarker(
  metadata: Record<string, unknown> | undefined,
  resolution: ComponentResolution,
): Record<string, unknown> {
  return {
    ...metadata,
    [IR_ROUTE_KEY]: {
      by: resolution.resolvedBy,
      key: resolution.componentKey,
    } satisfies IrRouteMarker,
  };
}

export function applyIrKindRoute<T extends IrRoutableBlock>(block: T): T {
  const envelope = readEnvelope(block.metadata);
  if (!envelope) return block;

  const kind = envelope.root.kind;
  if (!kind) return block; // raw / pending — legacy rendering stands

  const def = kindRegistry.getDefinition(kind);
  const resolution = resolveComponent(kind, "web", "output");

  // ── Compiled-bridge path — trusted at bootstrap (ruling R6) ─────────────
  // A kind carrying a legacyBlockType facet ALWAYS routes: today's behavior
  // for every existing kind, and the production floor a DB row can refine
  // (the marker records which tier resolved) but never un-render.
  if (def?.legacyBlockType) {
    // A block ALREADY emitted as the legacy type carrying its own serverData
    // is authoritative — the server typed it AND provided the component's
    // data.
    if (block.type === def.legacyBlockType && block.serverData) {
      return block;
    }

    // ROUTING a raw region (e.g. "code" → "flashcards"): the envelope is the
    // single source of truth. The block's own serverData here is NOT kind
    // data — it's the raw region's annotation (the accumulator emits
    // `data: { language: "json" }` for untyped code blocks, which the
    // live-chat hop maps onto serverData — see
    // render-block-to-content-block.ts). Preferring that junk handed the
    // legacy component `{ language: "json" }` instead of
    // cards/questions/slides — the 2026-07-04 "No flashcards available yet"
    // bug — so it is REPLACED (bridge output) or CLEARED (bridgeless kinds
    // parse `content` themselves), never forwarded.
    const serverData = def.toLegacyServerData?.(envelope);

    if (block.type === def.legacyBlockType && serverData === undefined) {
      return block; // nothing to change — keep reference stability
    }

    return {
      ...block,
      type: def.legacyBlockType,
      serverData,
      ...(resolution
        ? { metadata: withRouteMarker(block.metadata, resolution) }
        : null),
    };
  }

  // ── Resolver-only path (no compiled bridge): the registry decides ───────
  if (!resolution) return block; // unknown kind — untouched (strangler seam)

  // R6: a kind resolvable ONLY via the DB and flagged inactive is NOT
  // trusted to render — leave the block exactly as it renders today
  // (never an error, never hidden content).
  if (!resolution.isActive) return block;

  if (block.type === resolution.componentKey) {
    return block; // already the target type — keep reference stability
  }

  return {
    ...block,
    type: resolution.componentKey,
    // No compiled bridge exists — the routed component parses `content`
    // itself; the raw region's annotation serverData is CLEARED, never
    // forwarded (same poison rule as bridgeless compiled kinds).
    serverData: undefined,
    metadata: withRouteMarker(block.metadata, resolution),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rehydration route for STRUCTURED persisted artifacts (Track 2B).
 *
 * A materialized kind artifact stores its zero-loss value object (carrying
 * `__kind`) as `canvas_items.content.data`. Given that stored value, derive
 * the registered kind's legacy `serverData` WITHOUT re-parsing any text: the
 * value wraps into a complete envelope and runs through the same
 * `toLegacyServerData` bridge the live stream uses. Returns null for
 * non-objects, unregistered kinds, or kinds without a legacy bridge — callers
 * fall back to the string-payload path (which legacy rows keep forever).
 */
export function kindServerDataFromStoredValue(
  value: unknown,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const kind = readObjectKind(value);
  if (!kind) return null;

  const def = kindRegistry.getDefinition(kind);
  if (!def?.toLegacyServerData) return null;

  return def.toLegacyServerData(envelopeFromCompleteValue(value, kind)) ?? null;
}
