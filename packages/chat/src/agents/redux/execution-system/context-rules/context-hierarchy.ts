/**
 * WHERE EACH CONTEXT VALUE SITS — the one placement the composer chip, the
 * full view and a sent message's receipt all render (Arman, 2026-10-02):
 *
 *   Marketing › Marketing Brand Cockpit      ← the page: its section + its real name
 *     Brand identity                         ← the manifest's own groups, own labels
 *       Brand ID · Brand name
 *     Brand portfolio …
 *   Attached                                 ← files and documents on the chat
 *   AI Matrx                                 ← the person, their organization, the client
 *
 * Every label comes from where the surface already declares it: the section
 * from the host's navigation (`getSurfaceSectionLabel`), the page from
 * `getSurfaceDisplayLabel`, each group from the resolved manifest's `groups`
 * (the same list the Surface Context window renders). Nothing here is typed by
 * hand except the two platform levels.
 *
 * The shape matches `@ai-matrx/agents/context/react`'s `ContextRowPlace`
 * structurally, so this file needs no particular package version.
 */

import { DEFAULT_SURFACE_KEY, type ResolvedContextRow } from "@ai-matrx/agents/context";
import { getManifest, getSurfaceSectionLabel } from "../../../../surfaces/runtime/registry";
import { getSurfaceDisplayLabel } from "../../../../surfaces/utils/surface-display";
import {
  PAGE_OFF_WITHHELD,
  PERSON_CONTEXT_VALUES,
} from "../../../../surfaces/manifests/_baseline.manifest";

export interface ContextLevelPlace {
  id: string;
  path: string[];
  order: number;
}

export interface ContextGroupPlace {
  id: string;
  label: string;
  order: number;
}

export interface ContextRowPlacement {
  level: ContextLevelPlace;
  group: ContextGroupPlace | null;
}

/** The platform's own values — "AI Matrx", never "System". */
export const AI_MATRX_PLACE: ContextLevelPlace = { id: "ai_matrx", path: ["AI Matrx"], order: 900 };
/** Files and documents attached to the chat. */
export const ATTACHED_PLACE: ContextLevelPlace = { id: "attached", path: ["Attached"], order: 500 };

/** A page's level: its section, then its real name ("Marketing › Marketing Brand Cockpit"). */
export function surfaceLevelPlace(surfaceName: string): ContextLevelPlace {
  const name = getSurfaceDisplayLabel(surfaceName);
  const section = getSurfaceSectionLabel(surfaceName);
  return {
    id: surfaceName,
    path: section && section.toLowerCase() !== name.toLowerCase() ? [section, name] : [name],
    order: 100,
  };
}

/** The manifest group a page declares this value in, with the manifest's own label. */
function declaredGroup(surfaceName: string, key: string): ContextGroupPlace | null {
  const manifest = getManifest(surfaceName);
  const groupKey = manifest?.values.find((v) => v.name === key)?.groupKey;
  if (!groupKey) return null;
  const group = manifest?.groups.find((g) => g.key === groupKey);
  return group ? { id: `${surfaceName}:${group.key}`, label: group.label, order: group.sortOrder } : null;
}

/**
 * Place one row. `pageSurface` is the page in play (the request's primary
 * surface); the values that ARE the page — its route, the screens around it
 * (`PAGE_OFF_WITHHELD`) — sit under it, because its switch turns them off.
 */
export function placeContextRow(
  row: Pick<ResolvedContextRow, "key" | "surfaceKey" | "origin">,
  pageSurface: string | null,
): ContextRowPlacement {
  if (PERSON_CONTEXT_VALUES.has(row.key)) return { level: AI_MATRX_PLACE, group: null };
  if (row.origin === "attached") return { level: ATTACHED_PLACE, group: null };
  const surface =
    row.surfaceKey && row.surfaceKey !== DEFAULT_SURFACE_KEY
      ? row.surfaceKey
      : pageSurface && PAGE_OFF_WITHHELD.includes(row.key)
        ? pageSurface
        : null;
  if (!surface) return { level: AI_MATRX_PLACE, group: null };
  return { level: surfaceLevelPlace(surface), group: declaredGroup(surface, row.key) };
}

/** A placer bound to one page, memoized per row identity for a render. */
export function contextRowPlacer(
  pageSurface: string | null,
): (row: Pick<ResolvedContextRow, "key" | "surfaceKey" | "origin">) => ContextRowPlacement {
  const memo = new Map<string, ContextRowPlacement>();
  return (row) => {
    const id = `${row.origin}|${row.surfaceKey}|${row.key}`;
    let hit = memo.get(id);
    if (!hit) {
      hit = placeContextRow(row, pageSurface);
      memo.set(id, hit);
    }
    return hit;
  };
}
