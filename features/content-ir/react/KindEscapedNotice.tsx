"use client";

/**
 * The kind-escaped tripwire — rendered by `JsonBlock` when a plain JSON code
 * block turns out to CONTAIN a `__kind` marker.
 *
 * WHY (Arman, 2026-08-29): a `__kind` anywhere in an object that is not being
 * rendered by its kind is a defect, and until now it was a SILENT one — the
 * JSON block knew nothing about kinds, so an escaped instance looked exactly
 * like data that was never a shape at all. Nobody could tell "this JSON is
 * fine" from "the pipeline dropped a shape on the floor".
 *
 * Two honest states:
 *  - REGISTERED slug → a pipeline crack fired. Say so, and file it
 *    (`kind_escaped_render` incident + captureError) so it lands in the same
 *    queue the component-authoring agent and admins already work.
 *  - UNREGISTERED slug → not ours to claim (R6 boundary): say the payload
 *    declares a shape this platform doesn't know, so a typo'd or not-yet-
 *    created shape is visible instead of silent.
 *
 * Quiet chrome: one amber line above the code block. Never blocks or replaces
 * the JSON — zero data loss stays absolute.
 */

import React, { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import { useEnsureKindRenderable } from "@/features/content-ir/react/ensure-kind-renderable";
import { useContentIrKindVersion } from "@/features/content-ir/react/use-registry-repaint";
import { reportKindComponentIncident } from "@/features/content-ir/react/db-component/kindComponentIncident";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { FoundKindMarker } from "@/features/content-ir/react/kind-problems";

const screamed = new Set<string>();

export function KindEscapedNotice({
  markers,
}: {
  markers: FoundKindMarker[];
}) {
  const first = markers[0] ?? null;
  const slug = first?.slug ?? null;
  // Make sure "unregistered" means unregistered, not "cold cache": demand the
  // definition and repaint when it lands — the same guarantee every other
  // render path gets from ensure-kind-renderable.
  useEnsureKindRenderable(slug);
  useContentIrKindVersion(slug);
  // "Registered" = catalog membership (`isKnownKind`) — the lazy registry's
  // one predicate, covering compiled kinds, every catalog row (Python-owned
  // included), and anything a cold fetch landed.
  const registered = Boolean(slug && kindRegistry.isKnownKind(slug));

  useEffect(() => {
    if (!slug || !registered) return;
    const firstPath = first?.path;
    const key = `${slug}:${firstPath === undefined ? "" : firstPath}`;
    if (screamed.has(key)) return;
    screamed.add(key);
    captureError({
      source: "content-ir",
      relation: slug,
      message: `Registered kind "${slug}" rendered as a raw JSON code block — it escaped the promotion path (path: ${first?.path || "root"}).`,
      hint: "The accumulator/splitter should have promoted this region (or embedded-kind recovery should have caught it). Find which arrival path delivered it.",
      recoverable: true,
    });
    reportKindComponentIncident({
      kind: slug,
      errorType: "kind_escaped_render",
      message: `Registered kind "${slug}" rendered as a raw JSON code block (escaped the promotion path at ${first?.path || "root"}).`,
    });
  }, [slug, registered, first?.path]);

  if (!first) return null;

  return (
    <div className="mb-1 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {registered ? (
          <>
            This JSON contains a <span className="font-mono">{first.slug}</span>{" "}
            Shape instance that is not rendering as its component — this is a
            pipeline defect and has been reported.
          </>
        ) : (
          <>
            This JSON declares a Shape (
            <span className="font-mono">{first.slug}</span>) that isn&apos;t
            registered on this platform — check the slug, or create the Shape to
            render it properly.
          </>
        )}
        {markers.length > 1 ? ` (+${markers.length - 1} more)` : null}
      </span>
    </div>
  );
}

export default KindEscapedNotice;
