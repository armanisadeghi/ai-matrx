"use client";

/**
 * THE ROUTE, KEYED ON THE REGISTRY STATE THAT PRODUCED IT (DD-215c).
 *
 * A block's route is not a function of the block alone — it is a function of
 * the block AND of what the component resolver held when the decision was
 * made. Writing it as `f(block)` and hanging the registry version off a memo
 * dependency array is what froze `/shapes/<kind>/instances` on the platform's
 * bundled component for a reader whose organization had authored its own: the
 * React Compiler re-infers memo inputs from data flow, the version was only
 * ever `void`-ed, and the emitted cache was keyed on the block alone. The whole
 * story, and the rule, are in `registry-versioned.ts`.
 *
 * So the version is an ARGUMENT here. Call it with
 * `useContentIrKindVersion(envelopeKind)` and the route follows every arrival;
 * there is no way to call it and silently lose the invalidation.
 */

import {
  applyIrKindRoute,
  DB_KIND_COMPONENT_KEY,
  readIrRouteMarker,
  type IrRoutableBlock,
} from "./kind-route";
import { resolveSupersededKindRender } from "./partial-kind-route";
import { readAtVersionFor } from "./registry-versioned";
import { readEnvelope } from "../redux/render-block-envelope";
import { componentRegistry } from "../registry/component-registry";
import {
  MATRX_CONTENT_IR_PLATFORM,
  MATRX_OWNED_BLOCK_TYPES,
} from "../host/route-env";

interface RoutedEntry {
  version: number;
  value: IrRoutableBlock;
}

/**
 * One entry per block object. A block is re-created by its producer whenever
 * its content changes, so a WeakMap keyed on it collects naturally and never
 * serves an answer computed for different content.
 */
const routed = new WeakMap<object, RoutedEntry>();

/**
 * Route one block at a known registry version — the seam every render path
 * calls instead of `applyIrKindRoute` directly.
 *
 * `resolveSupersededKindRender` runs first for the same reason it always has:
 * a block whose partial channel was superseded routes off the completed value,
 * not off the partial envelope.
 */
export function routeBlockAtRegistryVersion<
  T extends IrRoutableBlock & { content: string },
>(block: T, registryVersion: number): T {
  const answer = readAtVersionFor(
    routed as WeakMap<T, { version: number; value: T }>,
    block,
    registryVersion,
    () =>
      (resolveSupersededKindRender(block)?.block ?? applyIrKindRoute(block)) as T,
  );
  announceStaleRoute(answer);
  return answer;
}

/** One incident per (kind, rendered key, resolver key) per session. */
const announced = new Set<string>();

/** Test seam — drops the per-session dedupe. */
export function resetStaleRouteReports(): void {
  announced.clear();
}

/**
 * A WRONG RENDER IS NEVER SILENT (law 4) — and this is the shape of "wrong"
 * that three lanes could not see, because nothing on the page or in any queue
 * said a word about it.
 *
 * The route stamps `metadata.__ir_route` with the decision it made: which TIER
 * answered (`compiled` / `db`) and which component key. If the resolver now
 * answers differently for that kind, the reader is looking at a decision that
 * the registry has already moved past — a plausible-looking component that is
 * not the one this organization authored. That is exactly what
 * `keyword_relationship_research` did on production on 2026-09-14: the route
 * marker said `compiled/keyword_research` while the resolver held
 * `db/keyword_relationship_board` with a 21,562-byte body.
 *
 * `generic` and `directive` markers are deliberately exempt: those routes are
 * taken for reasons the resolution does not describe (a raw/broken instance, a
 * reserved directive slug), so a disagreement there is not evidence of
 * anything.
 */
function announceStaleRoute(block: IrRoutableBlock): void {
  const marker = readIrRouteMarker(block.metadata);
  if (marker && (marker.by === "generic" || marker.by === "directive")) return;
  const envelope = readEnvelope(block.metadata);
  const kind = envelope?.root.kind;
  if (!kind) return;
  const resolution = componentRegistry.resolve(
    kind,
    MATRX_CONTENT_IR_PLATFORM,
    "output",
  );
  if (!resolution) return;
  if (
    marker &&
    marker.by === resolution.resolvedBy &&
    marker.key === resolution.componentKey
  ) {
    return;
  }
  if (!marker) {
    // No marker means no resolution existed when this block was routed — a
    // kind with a compiled bridge but no compiled component row. The route is
    // still stale if the resolver now holds a renderable organization
    // component and the block did not go to it. The three exemptions are the
    // routes that legitimately ignore a resolution: a block type THIS app owns
    // (artifact, matrx), a raw/broken instance, and a kind whose schema has
    // not landed — `applyIrKindRoute` returns before the db route in each.
    const routable =
      resolution.resolvedBy === "db" &&
      resolution.source === "db" &&
      resolution.isActive &&
      resolution.hasComponentSource;
    const exempt =
      (MATRX_OWNED_BLOCK_TYPES as readonly string[]).includes(block.type) ||
      envelope?.root.kindState === "raw" ||
      envelope?.root.kindState === "pending_schema";
    if (!routable || exempt || block.type === DB_KIND_COMPONENT_KEY) return;
  }
  const renderedBy = marker?.by ?? "no route marker";
  const renderedKey = marker?.key ?? block.type;
  const seen = `${kind}|${renderedBy}:${renderedKey}|${resolution.resolvedBy}:${resolution.componentKey}`;
  if (announced.has(seen)) return;
  announced.add(seen);
  void (async () => {
    try {
      const { reportKindComponentIncident } = await import(
        "./db-component/kindComponentIncident"
      );
      reportKindComponentIncident({
        kind,
        errorType: "stale_route_render",
        platform: MATRX_CONTENT_IR_PLATFORM,
        role: "output",
        componentKey: resolution.componentKey,
        componentUpdatedAt: resolution.updatedAt,
        message:
          `The reader is being shown "${renderedKey}" (resolved by ${renderedBy}) for ` +
          `kind "${kind}", but this browser's resolver already answers ` +
          `"${resolution.componentKey}" (resolved by ${resolution.resolvedBy}` +
          `${resolution.hasComponentSource ? ", body present" : ", no body"}). ` +
          `The rendered block is a STALE route decision: the component row ` +
          `arrived after the block mounted and the route was not recomputed. ` +
          `Nothing on screen says so — the wrong component looks like the right one. ` +
          `Rendered at ${block.type}.`,
      });
    } catch {
      /* an alarm that throws is worse than one that misses */
    }
  })();
}
