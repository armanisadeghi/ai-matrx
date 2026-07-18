/**
 * dbKindComponentCache — session-scoped compile cache for DB-sourced kind
 * components (`content_ir.kind_component`, `source='db'`), modeled on the
 * proven tool-viz `toolRendererCache`.
 *
 * The compiler is the SHARED in-page allowlist compiler
 * (`compileSlotComponent` over `buildComponentScope`) — the same machinery
 * Agent Apps and the DB tool renderer run. No third compiler exists; this
 * module only adds the kind-component prop contract and the per-row cache.
 *
 * Contract (the db-row component contract, documented in SHAPE_SYSTEM.md):
 *  - `component_source` compiles to a React component receiving
 *    `{ data, kind, config }` where `data` is the kind instance value.
 *  - `props_transform` (optional) compiles to a `(data) => data` function
 *    applied to the value BEFORE it reaches the component — the same
 *    semantics as tool_ui's transform code. A throwing transform screams and
 *    the untransformed value is used (never a blank hole).
 *  - `config.allowed_imports` (string[]) narrows the scope; absent, the row
 *    gets the FULL registered allowlist (`getDefaultImportsForKindComponents`).
 *
 * Cache key: (kind, platform, role, row.updated_at) — one compile per
 * winning row VERSION. `refreshKindComponents()` (component-registry) is the
 * staleness path: a re-warm delivering an edited row re-keys and recompiles
 * naturally. `invalidateDbKindComponent` force-drops a key family. Server
 * edits never push to open clients — the contract is refresh-on-view.
 */

import type React from "react";

import { compileSlotComponent } from "@/features/agent-apps/utils/compile-slot";
import { getDefaultImportsForKindComponents } from "@/features/agent-apps/utils/allowed-imports";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { JsonObject } from "@/types/json";
import type { ComponentResolution } from "../../registry/component-registry";

/** Props every compiled DB kind component receives. */
export interface DbKindComponentRenderProps {
  /** The kind instance value — post-`props_transform` when one exists. */
  data: unknown;
  /** The kind slug the value belongs to. */
  kind: string;
  /** The resolver row's `config` object, verbatim. */
  config: JsonObject;
}

export interface CompiledDbKindComponent {
  Component: React.ComponentType<DbKindComponentRenderProps>;
  /** Compiled `props_transform`, or null when the row declares none. */
  transform: ((data: unknown) => unknown) | null;
}

export type DbKindCompileResult =
  | { ok: true; compiled: CompiledDbKindComponent }
  | { ok: false; error: string };

const cache = new Map<string, DbKindCompileResult>();
const screamedKeys = new Set<string>();

function cacheKey(
  kind: string,
  platform: string,
  role: string,
  updatedAt: string | null,
): string {
  // `updatedAt` (the winning row's freshness) is part of the key: a refresh
  // that delivers an edited row (bumped updated_at) recompiles automatically
  // instead of serving the stale compile for the rest of the session.
  return `${kind}${platform}${role}${updatedAt ?? ""}`;
}

/** Loud recovery: one console scream per key + structured capture. */
function screamCompileFailure(key: string, kind: string, error: string): void {
  const message = `[content-ir] DB kind component for "${kind}" failed to compile — rendering the generic structured viewer instead: ${error}`;
  if (!screamedKeys.has(key)) {
    screamedKeys.add(key);
    console.error(message);
  }
  captureError({ source: "content-ir", message, raw: { kind, error } });
}

function resolveAllowedImports(config: JsonObject): string[] {
  const declared = config.allowed_imports;
  if (
    Array.isArray(declared) &&
    declared.every((entry) => typeof entry === "string")
  ) {
    return declared;
  }
  return getDefaultImportsForKindComponents();
}

/**
 * Compile (once per resolver key per session) a db-source resolution's
 * `component_source` + optional `props_transform`. Synchronous — the caller
 * (a lazily-loaded Impl) already paid the Babel chunk.
 */
export function getOrCompileDbKindComponent(
  kind: string,
  resolution: ComponentResolution,
  platform = "web",
  role = "output",
): DbKindCompileResult {
  const key = cacheKey(kind, platform, role, resolution.updatedAt);
  const cached = cache.get(key);
  if (cached) return cached;

  const source = resolution.componentSource;
  if (!source || !source.trim()) {
    const result: DbKindCompileResult = {
      ok: false,
      error: "db-source resolution has no component_source",
    };
    screamCompileFailure(key, kind, result.error);
    cache.set(key, result);
    return result;
  }

  const allowedImports = resolveAllowedImports(resolution.config);

  const { Component, error } = compileSlotComponent({
    code: source,
    allowedImports,
  });
  if (!Component || error) {
    const result: DbKindCompileResult = {
      ok: false,
      error: error ?? "compile produced no component",
    };
    screamCompileFailure(key, kind, result.error);
    cache.set(key, result);
    return result;
  }

  // The optional props transform is its own tiny compile — a `(data) => data`
  // function (mirroring tool_ui's header_subtitle_code pattern). A broken
  // transform is LOUD but never fatal: the component still renders, fed the
  // untransformed value.
  let transform: ((data: unknown) => unknown) | null = null;
  if (resolution.propsTransform && resolution.propsTransform.trim()) {
    const { Component: transformFn, error: transformError } =
      compileSlotComponent({
        code: resolution.propsTransform,
        allowedImports: [],
      });
    if (typeof transformFn === "function" && !transformError) {
      transform = transformFn as unknown as (data: unknown) => unknown;
    } else {
      const message = `[content-ir] props_transform for kind "${kind}" failed to compile — value passes through untransformed: ${transformError ?? "no function produced"}`;
      console.error(message);
      captureError({
        source: "content-ir",
        message,
        raw: { kind, error: transformError },
      });
    }
  }

  const result: DbKindCompileResult = {
    ok: true,
    compiled: {
      // The shared compiler types components as ComponentType<Record<string,
      // unknown>>; the callsite always passes DbKindComponentRenderProps —
      // the single deliberate narrowing where the generic compiler meets the
      // kind contract (same pattern as compileToolRenderer).
      Component: Component as unknown as React.ComponentType<DbKindComponentRenderProps>,
      transform,
    },
  };
  cache.set(key, result);
  return result;
}

/**
 * Apply the row's transform to the kind value. Loud on throw, never fatal —
 * the untransformed value comes back so content is never hidden.
 */
export function applyPropsTransform(
  kind: string,
  compiled: CompiledDbKindComponent,
  value: unknown,
): unknown {
  if (!compiled.transform) return value;
  try {
    return compiled.transform(value);
  } catch (error) {
    const message = `[content-ir] props_transform for kind "${kind}" threw — using the untransformed value: ${
      error instanceof Error ? error.message : String(error)
    }`;
    console.error(message);
    captureError({ source: "content-ir", message, raw: { kind } });
    return value;
  }
}

/** Drop a key from the cache (authoring surfaces call after editing a row). */
export function invalidateDbKindComponent(
  kind: string,
  platform = "web",
  role = "output",
): void {
  const prefix = `${kind}${platform}${role}`;
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  for (const key of [...screamedKeys]) {
    if (key.startsWith(prefix)) screamedKeys.delete(key);
  }
}
