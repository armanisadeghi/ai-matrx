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
import {
  KindComponentFixBadge,
  useCanFixKindComponent,
} from "./KindComponentFixBadge";
import { cn } from "@/lib/utils";

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
  // The wrapper reserves the badge's corner inside its own box. Chat
  // intentionally clips horizontal overflow to contain wide model output, so a
  // negative right offset gets cut regardless of z-index — keeping the gutter
  // in-flow makes the badge immune to host overflow clipping everywhere this
  // renderer appears.
  //
  // The band must clear the badge's FULL 24px height, not the 8px it used to
  // get: at 8px the badge overlapped the component's own top-right by 16px and,
  // sitting at the popover layer, swallowed every click in that square. The
  // shell cannot know what an arbitrary DB-authored component draws up there,
  // so it reserves the whole band and leaves nothing behind the badge.
  // Reserved only when the badge actually renders (author / super admin), so
  // ordinary viewers keep the original 8px gutter and their layout is unchanged.
  const { canFix } = useCanFixKindComponent(props.content, props.metadata);
  return (
    <div className={cn("relative pr-2", canFix ? "pt-7" : "pt-2")}>
      <KindComponentFixBadge content={props.content} metadata={props.metadata} />
      <LazyImpl {...props} runAction={runAction} />
    </div>
  );
};

export default DbKindComponent;
