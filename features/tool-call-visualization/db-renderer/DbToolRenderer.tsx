"use client";

/**
 * DbToolRenderer — lazy entry point for the DB-driven tool renderer.
 *
 * `DbToolRendererImpl` statically imports the Agent Apps compiler, which in
 * turn statically imports `@babel/standalone` (~hundreds of KB). Loading the
 * impl via `next/dynamic({ ssr: false })` keeps Babel OUT of the main chat
 * bundle: it ships in its own chunk that's fetched only when a tool actually
 * has a DB renderer and this component mounts.
 *
 * `loading: () => null` — no spinner while the chunk loads; the impl then
 * renders null while it fetches the row, so the row stays quiet until the
 * compiled component (or the GenericRenderer fallback) is ready.
 */
import dynamic from "next/dynamic";
import React from "react";

import type { DbToolRendererImplProps } from "./DbToolRendererImpl";

const LazyImpl = dynamic(
  () =>
    import("./DbToolRendererImpl").then((m) => ({
      default: m.DbToolRendererImpl,
    })),
  { ssr: false, loading: () => null },
);

// The public wrapper props ARE the impl props — the only thing the wrapper
// adds is the lazy boundary, so it shares the exact same prop contract.
export type DbToolRendererProps = DbToolRendererImplProps;

export const DbToolRenderer: React.FC<DbToolRendererProps> = (props) => {
  return <LazyImpl {...props} />;
};

export default DbToolRenderer;
