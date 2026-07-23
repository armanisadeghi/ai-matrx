"use client";

/**
 * DbKindComponent — lazy entry point for DB-sourced kind components,
 * modeled directly on tool-viz's DbToolRenderer shell/Impl split.
 *
 * `DbKindComponentImpl` reaches the shared allowlist compiler
 * (`compileSlotComponent`), which statically imports `@babel/standalone`.
 * Loading the impl via `next/dynamic({ ssr: false })` keeps Babel OUT of the
 * main chat/notes bundle: the chunk is fetched only when a block actually
 * routed to a DB kind component (`applyIrKindRoute`'s db-override flip) and
 * this component mounts — the condition IS the route decision.
 *
 * `loading: () => null` — compile is synchronous and fast once the chunk
 * lands; a spinner would only flash.
 */
import dynamic from "next/dynamic";
import React from "react";

import type { DbKindComponentImplProps } from "./DbKindComponentImpl";
import { useKindActionRunner } from "../actions/useKindActionRunner";

const LazyImpl = dynamic(
  () =>
    import("./DbKindComponentImpl").then((m) => ({
      default: m.DbKindComponentImpl,
    })),
  { ssr: false, loading: () => null },
);

// The public wrapper props ARE the impl props MINUS runAction — the shell owns
// binding the action seam (it's the always-client boundary, under the Redux
// provider), so callers never supply it.
export type DbKindComponentProps = Omit<DbKindComponentImplProps, "runAction">;

export const DbKindComponent: React.FC<DbKindComponentProps> = (props) => {
  // Bind the action runner here (client, under the provider) and hand it to the
  // compiled component. Keeping this in the shell — not the impl — keeps the
  // impl bare-renderable (tests/SSR) and Redux out of that path.
  const runAction = useKindActionRunner();
  return <LazyImpl {...props} runAction={runAction} />;
};

export default DbKindComponent;
