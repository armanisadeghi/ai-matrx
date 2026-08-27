"use client";

/**
 * The mermaid engine singleton — the ONLY module that imports `mermaid` or
 * `@mermaid-js/layout-elk`. Mermaid loads dynamically so it never enters the
 * initial bundle; the optional 15 MB-on-disk ELK plugin loads only when the
 * user actually selects ELK. Default Dagre diagrams must never pay for it.
 *
 * mermaid's config is GLOBAL and `render` is async, so all renders are
 * serialized through one promise chain and the config is re-initialized only
 * when the options key changes. securityLevel stays "strict" (sanitized
 * labels, no script/click execution) and must NEVER be "sandbox" — sandbox
 * renders into an iframe, which would kill our SVG interactivity layer.
 */

import type { MermaidConfig } from "mermaid";

import { humanizeMermaidError } from "./sanitize";
import { renderOptionsKey, type MermaidRenderOptions } from "./types";

console.log(
  "%c[MERMAID IMPORT TEST] components/mermaid/runtime.ts",
  "color: #fff; background: #7c3aed; font-weight: bold; padding: 2px 6px; border-radius: 3px;",
);

type MermaidModule = (typeof import("mermaid"))["default"];

let mermaidPromise: Promise<MermaidModule> | null = null;
let elkPromise: Promise<boolean> | null = null;
let elkRegistered = false;
let lastConfigKey = "";
let renderChain: Promise<unknown> = Promise.resolve();
let idCounter = 0;
const MAX_RENDER_CACHE_ENTRIES = 12;
const renderCache = new Map<string, { svg: string }>();
interface InFlightRender {
  promise: Promise<{ svg: string }>;
  consumers: Set<string | null>;
}
const inFlightRenders = new Map<string, InFlightRender>();
const latestRenderByConsumer = new Map<string, string>();

export class MermaidRenderSupersededError extends Error {
  constructor() {
    super("Mermaid render superseded by newer source");
    this.name = "MermaidRenderSupersededError";
  }
}

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
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize(baseConfig());
      lastConfigKey = "";
      return mermaid;
    })();
  }
  return mermaidPromise;
}

async function ensureElk(mermaid: MermaidModule): Promise<boolean> {
  if (elkRegistered) return true;
  if (!elkPromise) {
    elkPromise = import("@mermaid-js/layout-elk")
      .then((elk) => {
        mermaid.registerLayoutLoaders(elk.default);
        elkRegistered = true;
        return true;
      })
      .catch((err) => {
        console.warn(
          "[MermaidRuntime] ELK layout plugin failed to load; dagre only",
          err,
        );
        return false;
      });
  }
  return elkPromise;
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
    // suppressErrors covers grammar parse failures (which return false), but
    // mermaid can still THROW a raw JS runtime error (e.g. the infamous
    // "Converting circular structure to JSON" TypeError holding a DOM node).
    // Scream with the raw error for debugging, surface a clean one upstream.
    const raw = err instanceof Error ? err.message : String(err);
    console.warn(
      "[MermaidRuntime] mermaid.parse threw (not a clean parse failure):",
      err,
    );
    return { ok: false, error: humanizeMermaidError(raw) };
  }
}

async function applyOptions(
  mermaid: MermaidModule,
  opts: MermaidRenderOptions,
): Promise<void> {
  const layout =
    opts.layout === "elk" && !(await ensureElk(mermaid))
      ? "dagre"
      : opts.layout;
  const key = renderOptionsKey({ ...opts, layout });
  if (key === lastConfigKey) return;
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
  await applyOptions(mermaid, opts);
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
  consumerId?: string,
): Promise<{ svg: string }> {
  const cacheKey = `${renderOptionsKey(opts)}\u0000${source}`;
  if (consumerId) latestRenderByConsumer.set(consumerId, cacheKey);
  const cached = renderCache.get(cacheKey);
  if (cached) {
    // Refresh insertion order so the bounded cache behaves as an LRU.
    renderCache.delete(cacheKey);
    renderCache.set(cacheKey, cached);
    return Promise.resolve(cached);
  }
  const inFlight = inFlightRenders.get(cacheKey);
  if (inFlight) {
    inFlight.consumers.add(consumerId ?? null);
    return inFlight.promise;
  }

  const consumers = new Set<string | null>([consumerId ?? null]);
  const task = renderChain
    .then(() => {
      const stillWanted = [...consumers].some(
        (id) => id === null || latestRenderByConsumer.get(id) === cacheKey,
      );
      if (!stillWanted) throw new MermaidRenderSupersededError();
      return doRender(source, opts);
    })
    .then((result) => {
      renderCache.set(cacheKey, result);
      while (renderCache.size > MAX_RENDER_CACHE_ENTRIES) {
        const oldestKey = renderCache.keys().next().value;
        if (oldestKey === undefined) break;
        renderCache.delete(oldestKey);
      }
      return result;
    })
    .finally(() => {
      inFlightRenders.delete(cacheKey);
    });
  inFlightRenders.set(cacheKey, { promise: task, consumers });
  renderChain = task.catch(() => {});
  return task;
}

/** Mark a mounted renderer's queued work stale before its next debounce fires. */
export function supersedeMermaidRender(consumerId: string): void {
  latestRenderByConsumer.delete(consumerId);
}
