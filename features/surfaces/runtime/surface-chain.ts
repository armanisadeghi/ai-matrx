/**
 * features/surfaces/runtime/surface-chain.ts
 *
 * THE SURFACE CHAIN — an agent sees every registered screen that is open, not
 * only the one on top (register `common-docs/projects/ai-reachable-everywhere`,
 * ARE-010 / ARE-012; Arman, 2026-09-23: "any model, window, sidebar, etc. …
 * automatically get the page's surface data and then extend it to add its own
 * data so that the context fully remains").
 *
 * An agent run adopts ONE primary surface (the deepest registered runtime, or
 * the one the caller named): its values are the flat `applicationScope`, and
 * its bindings, roles and write policies apply. Before this module, every
 * other mounted surface was invisible to the run — open Table settings over a
 * data table and the table vanished; open a window with its own surface and
 * the page vanished. Writes never had that gap (`applySurfaceWrite` walks the
 * whole stack), so an agent could write into a page it could not read.
 *
 * Now every launch and every follow-up turn adds two platform keys, built from
 * the LIVE registry at that moment (`withLiveSurfaceContext`):
 *
 *   - `surface_chain` — every OTHER mounted registered surface, nearest first:
 *     `{ surface, role, values: { name: { value, description } } }`, where
 *     `role` is `window` (a layer open over the page), `parent` (a surface the
 *     primary inherits from) or `page`. Only DECLARED, auto-context,
 *     non-empty values travel, each with its manifest description; a value
 *     the primary already carries with the same content is not repeated.
 *   - `window_forms` — every open window with NO registered surface, read
 *     field by field from the screen (`window-forms.ts`).
 *
 * The server (aidream `apply_surface_context`) expands both into one context
 * object per value (`<surface>::<value>`, `window::<title>`) and a
 * `<surface_chain>` intro block carrying each level's intro and write targets.
 * These are PLATFORM keys, declared once in `_baseline.manifest.ts`
 * (`PLATFORM_CONTEXT_VALUES`); a manifest may not claim either name.
 */

import type { ApplicationScope } from "@/features/agents/types/scope.types";
import {
  getManifest,
  getSurfaceAncestry,
} from "@/features/surfaces/manifests/registry";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  getSurfaceRuntimeStack,
  type SurfaceRuntimeValue,
} from "./SurfaceRuntimeContext";
import { readWindowForms, type WindowForm } from "./window-forms";

export const SURFACE_CHAIN_KEY = "surface_chain";
export const WINDOW_FORMS_KEY = "window_forms";

export type SurfaceChainRole = "window" | "page" | "parent";

export interface SurfaceChainLevel {
  surface: string;
  role: SurfaceChainRole;
  values: Record<string, { value: unknown; description: string }>;
}

/** A level whose scope cannot be read in this long is left out, loudly. */
const LEVEL_READ_TIMEOUT_MS = 3000;

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

async function readLevelScope(
  runtime: SurfaceRuntimeValue,
): Promise<SurfaceScopePayload | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(runtime.getScope()),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(`did not answer within ${LEVEL_READ_TIMEOUT_MS}ms`),
            ),
          LEVEL_READ_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    // Loud, non-fatal: the run goes ahead with the rest of the chain.
    console.error(
      `[surface-chain] "${runtime.surfaceName}" is open but its values could not be read — it is left out of this run's context`,
      error,
    );
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Every mounted registered surface other than `primarySurfaceName`, nearest
 * (deepest) first, with its declared values. Pure read of the live registry.
 */
export async function buildSurfaceChain(
  primarySurfaceName: string | null | undefined,
  primaryScope: Record<string, unknown> = {},
): Promise<SurfaceChainLevel[]> {
  const ancestry = new Set(
    primarySurfaceName ? getSurfaceAncestry(primarySurfaceName) : [],
  );
  const seen = new Set<string>(primarySurfaceName ? [primarySurfaceName] : []);
  const runtimes: SurfaceRuntimeValue[] = [];
  for (const runtime of getSurfaceRuntimeStack()) {
    if (seen.has(runtime.surfaceName)) continue;
    seen.add(runtime.surfaceName);
    runtimes.push(runtime);
  }

  const scopes = await Promise.all(runtimes.map(readLevelScope));
  const levels: SurfaceChainLevel[] = [];
  runtimes.forEach((runtime, index) => {
    const scope = scopes[index];
    const manifest = getManifest(runtime.surfaceName);
    if (!scope || !manifest) return;
    const values: SurfaceChainLevel["values"] = {};
    for (const declared of manifest.values) {
      if (declared.autoContext === false) continue;
      const value = scope[declared.name];
      if (isEmpty(value)) continue;
      if (sameValue(primaryScope[declared.name], value)) continue;
      values[declared.name] = { value, description: declared.description };
    }
    if (Object.keys(values).length === 0) return;
    levels.push({
      surface: runtime.surfaceName,
      role: runtime.layer || manifest.overlayId
        ? "window"
        : ancestry.has(runtime.surfaceName)
          ? "parent"
          : "page",
      values,
    });
  });
  return levels;
}

/**
 * The ONE place a run's scope gains the live screens around it. Called by
 * every chokepoint that builds a run's scope — agent launch
 * (`launch-agent-execution.thunk.ts`) and the submit-time refresh of every
 * follow-up turn (`refresh-surface-scope.thunk.ts`) — so each turn sees what
 * is open NOW. Keys the caller already set are never overwritten.
 */
export async function withLiveSurfaceContext(
  primarySurfaceName: string | null | undefined,
  scope: ApplicationScope,
): Promise<ApplicationScope> {
  const out: ApplicationScope = { ...scope };
  if (out[SURFACE_CHAIN_KEY] === undefined) {
    const chain = await buildSurfaceChain(primarySurfaceName, scope);
    if (chain.length > 0) out[SURFACE_CHAIN_KEY] = chain;
  }
  if (out[WINDOW_FORMS_KEY] === undefined) {
    const forms: WindowForm[] = readWindowForms();
    if (forms.length > 0) out[WINDOW_FORMS_KEY] = forms;
  }
  return out;
}
