/**
 * THE SURFACE MANIFESTS SEAM (CPM-009a, P19).
 *
 * The package never imports a host's manifests. A host registers the lookup
 * it owns once at startup (matrx-frontend: `providers/chat-surface-manifests.ts`,
 * mounted in `app/Providers.tsx`), and every package reader goes through the
 * functions below — same names and shapes the app registry exports, so call
 * sites only changed their import path.
 *
 * Unregistered (a bare host that brings no manifests, a test that never
 * registers): every lookup answers "no manifest" — exactly what an unknown
 * surface answers today — and the first lookup says so once on the console,
 * with the remedy (PACKAGE-INDEPENDENCE §5.1: never blank, never silent).
 *
 * The registration lives on `globalThis` so a second module instance of this
 * file (a server layer, a reset test registry) reads the same host lookup.
 */
import type { ResolvedSurfaceManifest, SurfaceManifest } from "../types";

/** What a host hands the package: its manifest lookup, already resolved. */
export interface SurfaceManifestSource {
  /** One surface's resolved manifest (inheritance + baselines applied), or undefined. */
  getManifest(surfaceName: string): ResolvedSurfaceManifest | undefined;
  /** Every registered manifest, resolved, in declaration order. */
  getAllManifests(): readonly ResolvedSurfaceManifest[];
  /** The manifest exactly as authored (before inheritance and baselines). */
  getRawManifest(surfaceName: string): SurfaceManifest | undefined;
  /** Parent chain, ROOT FIRST; [] for an unknown surface. */
  getSurfaceAncestry(surfaceName: string): string[];
  /** Direct children (manifests whose `inheritsFrom` names it), in declaration order. */
  getSurfaceChildren(surfaceName: string): string[];
  /**
   * The app section a surface's page sits in ("Marketing" for the brand
   * cockpit) — the host's own navigation names it; null when no section owns
   * the page. Optional: a host without sections omits it.
   */
  getSurfaceSection?(surfaceName: string): string | null;
}

const SLOT = Symbol.for("@ai-matrx/chat/surfaces/manifest-source");

type Slot = { source: SurfaceManifestSource | null; announced: boolean };

function slot(): Slot {
  const holder = globalThis as unknown as Record<symbol, Slot | undefined>;
  let current = holder[SLOT];
  if (!current) {
    current = { source: null, announced: false };
    holder[SLOT] = current;
  }
  return current;
}

const UNREGISTERED: SurfaceManifestSource = {
  getManifest: () => undefined,
  getAllManifests: () => [],
  getRawManifest: () => undefined,
  getSurfaceAncestry: () => [],
  getSurfaceChildren: () => [],
};

function source(): SurfaceManifestSource {
  const current = slot();
  if (current.source) return current.source;
  if (!current.announced) {
    current.announced = true;
    console.warn(
      "[chat surfaces] No surface manifests are registered, so every surface reads as undeclared " +
        "(no page values, client tools or write targets). Register the host's manifests once at " +
        "startup with registerSurfaceManifests() from @ai-matrx/chat/surfaces/runtime/registry.",
    );
  }
  return UNREGISTERED;
}

/**
 * Register the host's manifest lookup. Returns an unregister function that
 * restores whatever was registered before (tests use it; a host never needs it).
 */
export function registerSurfaceManifests(next: SurfaceManifestSource): () => void {
  const current = slot();
  const previous = current.source;
  current.source = next;
  return () => {
    if (current.source === next) current.source = previous;
  };
}

/** True once a host registered its manifests. */
export function hasRegisteredSurfaceManifests(): boolean {
  return slot().source !== null;
}

/** Get a manifest by surface name. Returns `undefined` when no manifest is registered. */
export function getManifest(surfaceName: string): ResolvedSurfaceManifest | undefined {
  return source().getManifest(surfaceName);
}

/** All known manifests, in declaration order. */
export function getAllManifests(): readonly ResolvedSurfaceManifest[] {
  return source().getAllManifests();
}

/** The manifest as authored, before inherited declarations and baselines. */
export function getRawManifest(surfaceName: string): SurfaceManifest | undefined {
  return source().getRawManifest(surfaceName);
}

/** Parent chain for a surface, ROOT FIRST. Unknown surfaces return `[]`. */
export function getSurfaceAncestry(surfaceName: string): string[] {
  return source().getSurfaceAncestry(surfaceName);
}

/** Direct children of a surface, in declaration order. */
export function getSurfaceChildren(surfaceName: string): string[] {
  return source().getSurfaceChildren(surfaceName);
}

/** The app section a surface sits in ("Marketing"), or null (`SurfaceManifestSource.getSurfaceSection`). */
export function getSurfaceSectionLabel(surfaceName: string): string | null {
  return source().getSurfaceSection?.(surfaceName) ?? null;
}

/**
 * Whether shell chrome and binding services may treat this surface as owning
 * a bound-agent roster. Unknown/legacy surfaces keep the historical `bound`
 * default; registered universal hosts opt out explicitly in their manifest.
 */
export function surfaceAcceptsAgentBindings(surfaceName: string): boolean {
  return getManifest(surfaceName)?.agentRosterMode !== "universal";
}

const declarerMemo = new WeakMap<SurfaceManifestSource, Map<string, string | null>>();

/**
 * THE ONE SURFACE THAT AUTHORED a value name, or null — the fallback for a
 * context value whose publishing runtime was not recorded (an entry written
 * before its surface was stamped). Reads each manifest AS AUTHORED, so the
 * shared baselines every page inherits (`content`, `text_before`…) never
 * claim a page; a name two pages both author is ambiguous and answers null.
 */
export function getDeclaringSurface(valueName: string): string | null {
  const current = source();
  let memo = declarerMemo.get(current);
  if (!memo) {
    memo = new Map();
    declarerMemo.set(current, memo);
  }
  const hit = memo.get(valueName);
  if (hit !== undefined) return hit;
  let found: string | null = null;
  let ambiguous = false;
  for (const manifest of current.getAllManifests()) {
    const authored = current.getRawManifest(manifest.surfaceName);
    if (!authored?.values?.some((v) => v.name === valueName)) continue;
    if (found && found !== manifest.surfaceName) {
      ambiguous = true;
      break;
    }
    found = manifest.surfaceName;
  }
  const answer = ambiguous ? null : found;
  memo.set(valueName, answer);
  return answer;
}
