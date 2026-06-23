"use client";

/**
 * DbEmitRenderer — lazy entry point for the DB-driven workflow emit renderer.
 *
 * `DbEmitRendererImpl` statically imports the Agent Apps compiler, which in
 * turn statically imports `@babel/standalone` (~hundreds of KB). Loading the
 * impl via `next/dynamic({ ssr: false })` keeps Babel OUT of the main bundle:
 * it ships in its own chunk that's fetched only when a node actually emits and
 * this component mounts.
 *
 * `loading: () => null` — no spinner while the chunk loads; the impl then
 * renders the generic body immediately (a complete rendering) while it fetches
 * any custom renderer, so the emission paints right away and the custom
 * component upgrades it in place once compiled.
 *
 * This is the ONLY public entry point for consumers — render a `node_emitted`
 * event by mapping its `data` onto these props. Cloned from
 * `tool-call-visualization/db-renderer/DbToolRenderer.tsx`.
 */
import dynamic from "next/dynamic";
import React from "react";

import type { DbEmitRendererImplProps } from "./DbEmitRendererImpl";

const LazyImpl = dynamic(
  () =>
    import("./DbEmitRendererImpl").then((m) => ({
      default: m.DbEmitRendererImpl,
    })),
  { ssr: false, loading: () => null },
);

// The public wrapper props ARE the impl props — the only thing the wrapper
// adds is the lazy boundary, so it shares the exact same prop contract.
export type DbEmitRendererProps = DbEmitRendererImplProps;

export const DbEmitRenderer: React.FC<DbEmitRendererProps> = (props) => {
  return <LazyImpl {...props} />;
};

export default DbEmitRenderer;
