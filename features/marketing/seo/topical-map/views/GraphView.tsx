"use client";

/**
 * GRAPH — the map drawn as a graph.
 *
 * 🚨 THIS IS THE FEATURE'S ONE DYNAMIC IMPORT EDGE (CONTRACTS §0). Nothing else
 * under `features/marketing/seo/topical-map/` lazies anything: the code-splitting
 * skill's fragmentation rule says a boundary is worth its cost only where a
 * genuinely heavy, browser-only module sits behind it, and React Flow — which
 * measures the DOM and cannot render on the server — is exactly that module and
 * the only one here.
 *
 * `ssr: false` is not a preference. `GraphViewImpl` imports `@xyflow/react`
 * statically (the ONE sanctioned import in this feature, see the
 * `reactFlowStaticImportBan` in eslint.config.mjs), and that package reaches for
 * the DOM at module scope.
 *
 * The props type lives in the body's contract (`MapViewProps`), so consumers
 * stay typed without pulling the impl into their graph.
 */

import dynamic from "next/dynamic";

import SuspenseLoader from "@/components/loaders/SuspenseLoader";

import type { MapViewProps } from "../components/TopicalMapWorkspaceBody";

const GraphViewImpl = dynamic(() => import("./GraphViewImpl"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-textured">
      <SuspenseLoader size="md" centered={false} message="Loading the map drawing…" />
    </div>
  ),
});

export function GraphView(props: MapViewProps) {
  return <GraphViewImpl {...props} />;
}
