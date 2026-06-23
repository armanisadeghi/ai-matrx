/**
 * compileEmitRenderer — thin wrapper over the PROVEN Agent Apps compiler.
 *
 * The Agent Apps applet runtime compiles fully-custom Babel components
 * SYNCHRONOUSLY (static `import { transform } from "@babel/standalone"` +
 * synchronous `buildComponentScope`). That same compiler renders custom
 * components in dev AND prod, so the workflow-emit renderer reuses it VERBATIM
 * (`compileSlotComponent` + the fixed allow-list) rather than inventing a
 * second compile/sandbox path. Identical to
 * `tool-call-visualization/db-renderer/compileToolRenderer.ts`, differing only
 * in the prop type the compiled component is narrowed to.
 *
 * The compiled component takes arbitrary props; we cast it to our canonical
 * `EmitRendererProps` shape since that's exactly what we pass at the callsite.
 */
import type React from "react";

import { compileSlotComponent } from "@/features/agent-apps/utils/compile-slot";
import type { EmitRendererProps } from "./types";

export interface CompileEmitRendererResult {
  Component: React.ComponentType<EmitRendererProps> | null;
  error: string | null;
}

export function compileEmitRenderer(
  code: string,
  allowedImports: string[],
): CompileEmitRendererResult {
  const { Component, error } = compileSlotComponent({
    code,
    allowedImports,
  });

  // The agent-apps compiler types the component as
  // `React.ComponentType<Record<string, unknown>>`. Our callsite always passes
  // the canonical `EmitRendererProps`, so we narrow the prop type here. This is
  // the single, deliberate cast where the generic compiler meets the emit
  // contract — no `any`.
  return {
    Component: Component as unknown as
      | React.ComponentType<EmitRendererProps>
      | null,
    error,
  };
}
