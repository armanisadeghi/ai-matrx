"use client";

/**
 * THE ONE SEAM: every tool renderer the registry hands out passes through
 * here, so any tool call that carries a surface-write receipt shows the shared
 * `SurfaceWriteDiff` — static renderers, DB-authored renderers and the generic
 * fallback alike. A new tool gets the diff with zero per-tool code; a renderer
 * cannot opt out (the guard `surface-write/__tests__` renders every declared
 * surface-writing tool through `getInlineRenderer` and fails without it).
 *
 * While the call is still streaming there is no receipt yet (it lands with
 * the tool's completion), so the tool's own renderer keeps its live preview —
 * e.g. `PatchDiffInline` animating a `context_patch` edit from its arguments.
 * The moment the receipt arrives the same card body shows the authoritative
 * before → after.
 */

import type React from "react";

import type { ToolRendererProps } from "../types";
import { readSurfaceWrite } from "./readSurfaceWrite";
import { SurfaceWriteDiff } from "./SurfaceWriteDiff";

const wrapped = new WeakMap<
  React.ComponentType<ToolRendererProps>,
  React.ComponentType<ToolRendererProps>
>();

export function withSurfaceWriteDiff(
  Inner: React.ComponentType<ToolRendererProps>,
): React.ComponentType<ToolRendererProps> {
  const hit = wrapped.get(Inner);
  if (hit) return hit;
  const Wrapped: React.FC<ToolRendererProps> = (props) => {
    const receipt = readSurfaceWrite(props.entry);
    if (receipt) return <SurfaceWriteDiff receipt={receipt} />;
    return <Inner {...props} />;
  };
  Wrapped.displayName = `SurfaceWriteAware(${Inner.displayName ?? Inner.name ?? "Renderer"})`;
  wrapped.set(Inner, Wrapped);
  return Wrapped;
}
