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

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
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

/**
 * The component key the R6 generic fallback routes to — the official renderer
 * for a KNOWN shape that nothing render-trusted claims. Consumed by the
 * unified renderer's switch (BlockRenderer) as a block type.
 */
export const GENERIC_STRUCTURED_COMPONENT_KEY = "generic_structured" as const;

/**
 * The block type a DB-sourced (user-authored) kind component renders as —
 * consumed by the dispatch registry as `DbKindComponent` (the in-page
 * allowlist-compiled React flavor, or the sandboxed-iframe html flavor when
 * the row's `config.flavor === 'html'`). FE-synthesized: produced ONLY here,
 * never emitted upstream.
 */
export const DB_KIND_COMPONENT_KEY = "db_kind_component" as const;

/**
 * A DB row is render-trusted as a USER component when it is active, declares
 * `source='db'` (R1: db = web sandbox only), and actually carries a component
 * body. An active db-source row WITHOUT a body is a data defect — reported
 * loudly by the caller, which then falls through to the bundled behavior
 * (never un-render).
 */
function isDbSourceResolution(
  resolution: ComponentResolution | null,
): resolution is ComponentResolution {
  return (
    resolution !== null &&
    resolution.resolvedBy === "db" &&
    resolution.source === "db" &&
    resolution.isActive
  );
}

const reportedSourcelessDbRows = new Set<string>();

/** Loud recovery: an active source='db' row with no component_source. */
function reportDbRowWithoutSource(kind: string): void {
  const message = `[content-ir] kind_component for "${kind}" declares source='db' + is_active but has NO component_source — data defect; falling through to bundled rendering.`;
  if (!reportedSourcelessDbRows.has(kind)) {
    reportedSourcelessDbRows.add(kind);
    console.error(message);
  }
  captureError({ source: "content-ir", message, raw: { kind } });
}

/**
 * The db-override flip (deliverable of the 2026-07-17 ratified architecture):
 * an ACTIVE `source='db'` row carrying a component body wins over BOTH the
 * compiled bridge and any bundled resolution (R6: db overrides bundled). The
 * block re-types to `db_kind_component`; the renderer re-resolves the row and
 * compiles/sandboxes it. Returns null when the db flip does not apply.
 */
function routeToDbComponent<T extends IrRoutableBlock>(
  block: T,
  kind: string,
  resolution: ComponentResolution | null,
): T | null {
  if (!isDbSourceResolution(resolution)) return null;
  if (!resolution.componentSource || !resolution.componentSource.trim()) {
    reportDbRowWithoutSource(kind);
    return null;
  }
  if (block.type === DB_KIND_COMPONENT_KEY) return block;
  return {
    ...block,
    type: DB_KIND_COMPONENT_KEY,
    // The compiled/sandboxed component reads the envelope, never the raw
    // region's annotation serverData (same poison rule as bridged kinds).
    serverData: undefined,
    metadata: withRouteMarker(block.metadata, resolution),
  };
}

/** Why a block landed on the generic viewer instead of a real renderer. */
export type GenericFallbackReason =
  /** No compiled bridge and no `content_ir.kind_component` row at all. */
  | "no-component"
  /** A component row exists but is held `is_active = false`. */
  | "inactive";

export interface IrRouteMarker {
  by: ComponentResolution["resolvedBy"] | "generic";
  key: string;
  /**
   * Only on the generic fallback: the shape is NOT render-trusted, so the
   * viewer must say so out loud (R6 — never an error, never hidden content).
   */
  unverified?: true;
  reason?: GenericFallbackReason;
}

function isRouteMarker(value: unknown): value is IrRouteMarker {
  return (
    isRecord(value) &&
    typeof value.by === "string" &&
    typeof value.key === "string"
  );
}

/** Read the routing marker a block picked up at the seam (or null). */
export function readIrRouteMarker(
  metadata: Record<string, unknown> | null | undefined,
): IrRouteMarker | null {
  const candidate = metadata?.[IR_ROUTE_KEY];
  return isRouteMarker(candidate) ? candidate : null;
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

/**
 * R6's sanctioned disposition for a shape the platform KNOWS (a kind
 * definition supplied its schema) but nothing render-trusted claims: the
 * generic structured viewer, carrying an honest "unverified shape" affordance
 * — never an error, never a raw code block, never hidden content.
 *
 * `serverData` is CLEARED for the same reason the resolver-only path clears
 * it: a raw region's annotation (`{ language: "json" }`) is not kind data,
 * and the generic viewer reads the envelope, not serverData.
 */
function routeToGeneric<T extends IrRoutableBlock>(
  block: T,
  reason: GenericFallbackReason,
): T {
  if (block.type === GENERIC_STRUCTURED_COMPONENT_KEY) return block;

  return {
    ...block,
    type: GENERIC_STRUCTURED_COMPONENT_KEY,
    serverData: undefined,
    metadata: {
      ...block.metadata,
      [IR_ROUTE_KEY]: {
        by: "generic",
        key: GENERIC_STRUCTURED_COMPONENT_KEY,
        unverified: true,
        reason,
      } satisfies IrRouteMarker,
    },
  };
}

export function applyIrKindRoute<T extends IrRoutableBlock>(block: T): T {
  const envelope = readEnvelope(block.metadata);
  if (!envelope) return block;

  const kind = envelope.root.kind;
  if (!kind) return block; // raw / pending — legacy rendering stands

  // An identified kind whose SCHEMA is still cold-fetching (pending_schema)
  // has no compliant value yet — routing now would hand a component early
  // scalars at best. The loading layer (BlockRenderer's pending stage, keyed
  // by the kind's loading_component) owns this window; the parser upgrades
  // in place the moment the schema lands, and end() converts a lost race to
  // a kind-preserving raw — both of which route normally.
  if (envelope.root.kindState === "pending_schema") return block;

  const def = kindRegistry.getDefinition(kind);
  const resolution = resolveComponent(kind, "web", "output");

  // ── DB user-component path — db overrides bundled (ruling R6) ───────────
  // An active `source='db'` row with a component body wins over the compiled
  // bridge AND any bundled resolution. Checked FIRST so a user's registered
  // component actually renders; a defective row (no source) screams and
  // falls through to today's behavior — never un-renders.
  const dbRouted = routeToDbComponent(block, kind, resolution);
  if (dbRouted) return dbRouted;

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
  // R6: only an ACTIVE resolution is render-trusted. An inactive row means
  // "held", not "route it anyway".
  if (resolution?.isActive) {
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

  // ── R6 generic fallback: a KNOWN shape that nothing render-trusted claims ─
  // `def` exists ⇒ a kind definition (compiled, or warm from
  // `content_ir.kind_definition`) supplied this kind's schema: the platform
  // knows the shape. It has no compiled bridge, and either no
  // `kind_component` row at all (`no-component`) or one held inactive
  // (`inactive`). Ruling R6 sends exactly this case to the generic structured
  // viewer with an "unverified shape" affordance — the disposition that
  // retires the permanently-red "no-component root" kinds (q_and_a_set,
  // study_pack_set, schema_showcase) without pretending they have renderers.
  if (def) {
    return routeToGeneric(block, resolution ? "inactive" : "no-component");
  }

  // A kind PRESERVED through a schema-availability raw fallback: the region
  // declared `__kind`, but the schema never arrived before the region ended
  // (cold fetch lost the race, or the kind has no definition row). The shape
  // claims to be structured content, so it renders as the generic structured
  // viewer — never a raw JSON dump — and the repaint hook upgrades it to the
  // real component the moment the registries learn better.
  if (envelope.root.kindState === "raw") {
    return routeToGeneric(block, "no-component");
  }

  // A kind slug the platform has NO definition for (typo, foreign emitter, a
  // kind_component row pointing at nothing we can describe) is genuinely
  // unknown — we cannot claim to "know this shape", so the strangler seam
  // holds and legacy rendering stands, untouched and by reference.
  return block;
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
