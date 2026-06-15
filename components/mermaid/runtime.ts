"use client";

/**
 * The mermaid engine singleton — the ONLY module that imports `mermaid` or
 * `@mermaid-js/layout-elk`. Both load dynamically so they never enter the
 * initial bundle; call preloadMermaid() the moment a mermaid block appears
 * so the chunk download races the stream.
 *
 * mermaid's config is GLOBAL and `render` is async, so all renders are
 * serialized through one promise chain and the config is re-initialized only
 * when the options key changes. securityLevel stays "strict" (sanitized
 * labels, no script/click execution) and must NEVER be "sandbox" — sandbox
 * renders into an iframe, which would kill our SVG interactivity layer.
 */

import type { MermaidConfig } from "mermaid";

import { renderOptionsKey, type MermaidRenderOptions } from "./types";

console.log(
  "%c[MERMAID IMPORT TEST] components/mermaid/runtime.ts",
  "color: #fff; background: #7c3aed; font-weight: bold; padding: 2px 6px; border-radius: 3px;",
);

type MermaidModule = (typeof import("mermaid"))["default"];

let mermaidPromise: Promise<MermaidModule> | null = null;
let elkRegistered = false;
let lastConfigKey = "";
let renderChain: Promise<unknown> = Promise.resolve();
let idCounter = 0;

function baseConfig(): MermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: "strict",
    // Plain-SVG labels (no <foreignObject>) so PNG export via canvas never
    // taints and Safari rasterization works.
    flowchart: { htmlLabels: false },
    fontFamily: "inherit",
  };
}

async function getMermaid(): Promise<MermaidModule> {
  if (!mermaidPromise) {
    mermaidPromise = (async () => {
      const [{ default: mermaid }, elk] = await Promise.all([
        import("mermaid"),
        import("@mermaid-js/layout-elk").catch((err) => {
          // ELK is an enhancement — dagre still works without it. Loud, not fatal.
          console.warn(
            "[MermaidRuntime] ELK layout plugin failed to load; dagre only",
            err,
          );
          return null;
        }),
      ]);
      if (elk?.default) {
        try {
          mermaid.registerLayoutLoaders(elk.default);
          elkRegistered = true;
        } catch (err) {
          console.warn(
            "[MermaidRuntime] registerLayoutLoaders(elk) failed; dagre only",
            err,
          );
        }
      }
      mermaid.initialize(baseConfig());
      lastConfigKey = "";
      return mermaid;
    })();
  }
  return mermaidPromise;
}

/** Fire-and-forget warmup — call when a mermaid block mounts mid-stream. */
export function preloadMermaid(): void {
  if (typeof window === "undefined") return;
  void getMermaid().catch(() => {});
}

export function isElkAvailable(): boolean {
  return elkRegistered;
}

/**
 * Parse-only validation. Returns ok=false (never throws) on invalid source.
 */
export async function validateMermaid(
  source: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const mermaid = await getMermaid();
    const result = await mermaid.parse(source, { suppressErrors: true });
    return result === false ? { ok: false } : { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function applyOptions(
  mermaid: MermaidModule,
  opts: MermaidRenderOptions,
): void {
  const key = renderOptionsKey(opts);
  if (key === lastConfigKey) return;
  const layout =
    opts.layout === "elk" && !elkRegistered ? "dagre" : opts.layout;
  mermaid.initialize({
    ...baseConfig(),
    theme: opts.theme,
    look: opts.look,
    layout,
  });
  lastConfigKey = key;
}

async function doRender(
  source: string,
  opts: MermaidRenderOptions,
): Promise<{ svg: string }> {
  const mermaid = await getMermaid();
  applyOptions(mermaid, opts);
  const id = `mmd-${++idCounter}`;
  try {
    const { svg } = await mermaid.render(id, source);
    return { svg };
  } catch (err) {
    // Known mermaid quirk: a failed render can leave an orphaned error
    // element appended to <body>. Remove both possible ids.
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
    throw err;
  }
}

/**
 * Serialized render — mermaid.render is async AND reads global config; two
 * concurrent renders with different options would corrupt each other. A
 * failed render must not poison the chain for the next caller.
 */
export function renderMermaid(
  source: string,
  opts: MermaidRenderOptions,
): Promise<{ svg: string }> {
  const task = renderChain.then(() => doRender(source, opts));
  renderChain = task.catch(() => {});
  return task;
}
