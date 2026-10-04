/**
 * features/surfaces/runtime/surface-chain.ts
 *
 * THE SURFACE CHAIN — an agent sees every registered screen that is open, not
 * only the one on top (register `common-docs/systems/platform/ui-shell/projects/ai-reachable-everywhere`,
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

import type { ApplicationScope } from "../../agents/types/scope.types";
import {
  getManifest,
  getSurfaceAncestry,
} from "./registry";
import type { SurfaceScopePayload } from "../types";
import {
  getSurfaceRuntimeDepths,
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

  // A HOST the primary sits inside (a Board whose tile is live): mounted at a
  // shallower depth than the primary, and not a layer laid over the page.
  const mountedDepths = getSurfaceRuntimeDepths();
  const primaryDepth = primarySurfaceName
    ? mountedDepths.find((entry) => entry.surfaceName === primarySurfaceName)?.depth
    : undefined;
  const isHostOfPrimary = (runtime: SurfaceRuntimeValue): boolean => {
    if (primaryDepth === undefined || runtime.layer) return false;
    const depth = mountedDepths.find((entry) => entry.surfaceName === runtime.surfaceName)?.depth;
    return depth !== undefined && depth < primaryDepth;
  };

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
    // The active surface is ONE item the host holds: the host's first value
    // says so and says how to reach the rest (`SurfaceManifest.hostLead`), so
    // the items that follow are read as the person's other open things.
    if (manifest.hostLead && isHostOfPrimary(runtime)) {
      const first = Object.keys(values)[0];
      values[first] = {
        ...values[first],
        description: `${manifest.hostLead} ${values[first].description}`,
      };
    }
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

/** True when `surfaceName`'s manifest declares it a companion pane (`companion`). */
export function isCompanionSurface(surfaceName: string | null | undefined): boolean {
  return Boolean(surfaceName && getManifest(surfaceName)?.companion);
}

/**
 * A surface whose live scope changed without re-registering (the canvas
 * switched tab, opened or closed an item) announces it here, so a view that
 * shows what the next turn will carry — the composer's value list before the
 * first send — re-reads it. Registration changes are the registry's own
 * `subscribe`; this covers the values behind an unchanged registration.
 */
const scopeChangeListeners = new Set<() => void>();

export function announceSurfaceScopeChange(): void {
  for (const listener of [...scopeChangeListeners]) listener();
}

export function subscribeSurfaceScopeChanges(listener: () => void): () => void {
  scopeChangeListeners.add(listener);
  return () => {
    scopeChangeListeners.delete(listener);
  };
}

/** True when a companion pane (the canvas) is mounted right now. */
export function companionSurfaceOpen(): boolean {
  return getSurfaceRuntimeStack().some((runtime) => isCompanionSurface(runtime.surfaceName));
}

/**
 * The scope a page's OWN conversation receives: only the COMPANION panes open
 * beside the page (the canvas), as `surface_chain` levels — never the page
 * itself, which that conversation IS. Empty when no companion is mounted.
 */
export async function companionSurfaceScope(): Promise<ApplicationScope> {
  const levels = (await buildSurfaceChain(null)).filter((level) =>
    isCompanionSurface(level.surface),
  );
  return levels.length > 0 ? { [SURFACE_CHAIN_KEY]: levels } : {};
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
