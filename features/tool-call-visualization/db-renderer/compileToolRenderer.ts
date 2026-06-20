/**
 * compileToolRenderer — thin wrapper over the PROVEN Agent Apps compiler.
 *
 * The Agent Apps applet runtime compiles fully-custom Babel components
 * SYNCHRONOUSLY (static `import { transform } from "@babel/standalone"` +
 * synchronous `buildComponentScope`). That same compiler renders custom
 * components in dev AND prod (verified by the agent-apps surface), so the
 * DB-driven tool renderer reuses it verbatim rather than reinventing a
 * second compile path (the old async `dynamic/compiler.ts` hangs).
 *
 * The compiled component takes arbitrary props; we cast it to our canonical
 * `ToolRendererProps` shape since that's exactly what we pass at the callsite.
 */
import type React from "react";

import { compileSlotComponent } from "@/features/agent-apps/utils/compile-slot";
import type { ToolRendererProps } from "../types";

export interface CompileToolRendererResult {
  Component: React.ComponentType<ToolRendererProps> | null;
  error: string | null;
}

export function compileToolRenderer(
  code: string,
  allowedImports: string[],
): CompileToolRendererResult {
  const { Component, error } = compileSlotComponent({
    code,
    allowedImports,
  });

  // The agent-apps compiler types the component as
  // `React.ComponentType<Record<string, unknown>>`. Our callsite always passes
  // the canonical `ToolRendererProps`, so we narrow the prop type here. This is
  // the single, deliberate cast where the generic compiler meets the tool
  // contract — no `any`.
  return {
    Component: Component as unknown as
      | React.ComponentType<ToolRendererProps>
      | null,
    error,
  };
}
