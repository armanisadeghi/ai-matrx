"use client";

/**
 * THE CONVERGENCE SEAM — fetch-from-render.
 *
 * The loading sequence for a `__kind` block must be IDENTICAL no matter how
 * the block arrived: live stream, DB reload of history, workflow transport,
 * a pasted payload. Before this seam existed, the schema/component cold
 * fetches were triggered only by the LIVE STREAM's kind event
 * (stream-block-accumulator), so a block rendered from the database had
 * nobody fetching its component — it sat on the generic fallback until the
 * user happened to navigate somewhere that warmed the registry and came
 * back. (Arman: "something won't render, but you go to a different page and
 * come back, and suddenly it renders.")
 *
 * The fix is structural: the RENDER PATH itself requests whatever it is
 * missing. Rendering a kind block IS the demand signal, and it exists on
 * every path by definition. Both registries dedupe in-flight requests and
 * remember misses, so calling this once per (mount, kind) is idempotent and
 * cheap; the granular repaint hook (useContentIrKindVersion) re-runs the
 * route when the answers land.
 */

import { useEffect } from "react";
import { kindRegistry } from "../registry/kind-registry";
import { componentRegistry } from "../registry/component-registry";
import { MATRX_CONTENT_IR_PLATFORM } from "../host/route-env";

/**
 * Fire-and-forget: make sure this kind's schema and web output component are
 * fetched (or known-missing). Safe to call redundantly — every layer dedupes.
 *
 * DD-215: the demand is UNCONDITIONAL for the component. See the comment in
 * the body — a resolution that exists is not the same as a resolution that is
 * settled, and the difference is which component a reader sees.
 */
export function ensureKindRenderable(kind: string): void {
  if (!kindRegistry.getSchema(kind)) {
    kindRegistry.requestSchema(kind);
  }
  // 🚨 NO `if (!resolve(...))` GUARD (DD-215). A compiled floor answers for
  // every kind that ships a `legacyBlockType`, so that guard silently skipped
  // the demand for exactly the kinds an organization can override — the
  // organization's component was then left to whether the warm list happened
  // to land before the block routed. `requestComponent` is the ONE place that
  // decides whether a fetch is needed (it dedupes in flight, remembers misses,
  // and treats a compiled answer as provisional until the db tier settles), so
  // the render path always DEMANDS and never pre-judges.
  componentRegistry.requestComponent(kind, MATRX_CONTENT_IR_PLATFORM, "output");
  announceWrongComponent(kind);
}

/**
 * A WRONG RENDER IS NEVER SILENT (DD-215b).
 *
 * This is the render path, so it is the one place that knows a reader is about
 * to be shown SOMETHING for this kind. Two states mean that something is the
 * platform's compiled component when it should not be:
 *
 *  1. The kind's db read was REFUSED (42501 — a signed-in door answered with no
 *     session). The registry files at the moment of refusal too; this covers a
 *     block that mounts afterwards, and the incident dedupes to one row.
 *  2. An ACTIVE `source='db'` row is bound but declares no body, so
 *     `routeToDbComponent` refuses it and the route falls through to the
 *     compiled floor — permanently, because `needsColdFetch` is false for such
 *     a row and nothing ever fetches the body again.
 *
 * Both used to be completely silent: a plausible-looking platform block, no
 * error, no banner, and `content_ir.kind_component_incident` at zero while
 * eighteen of twenty-one production reads rendered the wrong component (V-99,
 * 2026-09-14).
 *
 * 🚨 The sandbox GATE is deliberately NOT consulted here. This module is on the
 * SELECTION path and `check:kind-sandbox-protocol` fails the build if the gate
 * is read from one — and rightly: a wrong component is wrong whether it renders
 * framed or in the page, so the incident does not depend on the placement.
 */
function announceWrongComponent(kind: string): void {
  const resolution = componentRegistry.resolve(
    kind,
    MATRX_CONTENT_IR_PLATFORM,
    "output",
  );
  const sourcelessDbRow =
    resolution?.resolvedBy === "db" &&
    resolution.source === "db" &&
    resolution.isActive &&
    !resolution.hasComponentSource;
  if (!sourcelessDbRow && !componentRegistry.wasRefused(kind)) return;
  void (async () => {
    try {
      const { reportKindComponentIncident } = await import(
        "./db-component/kindComponentIncident"
      );
      reportKindComponentIncident({
        kind,
        errorType: "component_read_refused",
        platform: MATRX_CONTENT_IR_PLATFORM,
        role: "output",
        componentKey: resolution?.componentKey ?? null,
        componentUpdatedAt: resolution?.updatedAt ?? null,
        message: sourcelessDbRow
          ? `"${kind}" is bound to the active component "${resolution?.componentKey}" ` +
            `(source='db'), but the resolver holds no body for it, so the route ` +
            `refused it and the reader was shown the platform's bundled component ` +
            `instead. Nothing will fetch the body again on its own.`
          : `The reader was shown the platform's bundled component for "${kind}" ` +
            `because this organization's component row could not be READ — the ` +
            `request carried no session and the door refused it.`,
      });
    } catch {
      /* an alarm that throws is worse than one that misses */
    }
  })();
}

/**
 * Hook form for render paths: request on mount and whenever the kind
 * changes. Pass null for blocks with no envelope kind (nothing to fetch).
 */
export function useEnsureKindRenderable(kind: string | null): void {
  useEffect(() => {
    if (kind) ensureKindRenderable(kind);
  }, [kind]);
}
