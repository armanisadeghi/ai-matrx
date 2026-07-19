// Ambient module declaration for `@babel/standalone`, which ships no types
// and has no `@types/babel__standalone` dependency installed in this repo.
// Covers only the surface actually used here: browser-side Babel transform
// for the agent-apps / tool-call-visualization / workflow-emit Babel
// sandboxes (compile-slot.ts, AgentAppPublicRendererImpl.tsx,
// TemplatePreviewRendererImpl.tsx, compileToolRenderer.ts,
// compileEmitRenderer.ts, compile-core.ts).
declare module "@babel/standalone" {
  export type BabelPlugin = (...args: unknown[]) => unknown;

  export interface TransformOptions {
    presets?: Array<string | [string, Record<string, unknown>]>;
    plugins?: Array<
      string | BabelPlugin | [string | BabelPlugin, Record<string, unknown>]
    >;
    filename?: string;
    sourceType?: "script" | "module" | "unambiguous";
    [key: string]: unknown;
  }

  export interface TransformResult {
    code?: string | null;
    map?: unknown;
    ast?: unknown;
  }

  export function transform(
    code: string,
    options?: TransformOptions,
  ): TransformResult;
}
