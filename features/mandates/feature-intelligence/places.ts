// features/mandates/feature-intelligence/places.ts
//
// WHERE EACH JOB RUNS — two real sources, one list:
//   1. DECLARED places — each feature's map, kept true by its own test
//      (flashcards, research).
//   2. REGISTERED places — screens whose manifest names the job
//      (`ui.ui_surface_agent_role` joined to `ui.ui_surface`, public read).
// A job neither source names is shown as "not recorded yet", never guessed.

import { supabase } from "@/utils/supabase/client";
import { declaredPlacesFor } from "./registry";
import type { IntelligenceContext, ResolvedPlace } from "./types";

export { declaredPlacesFor };

/**
 * Fill `[param]` segments from the context. Returns null when any segment has
 * no value here — the caller shows the stop without a link.
 */
export function fillUrlPattern(
  pattern: string | null | undefined,
  context: IntelligenceContext,
): string | null {
  if (!pattern) return null;
  let missing = false;
  const filled = pattern.replace(/\[([A-Za-z0-9_]+)\]/g, (_match, name: string) => {
    const value = context[name];
    if (!value) {
      missing = true;
      return "";
    }
    return encodeURIComponent(value);
  });
  return missing ? null : filled;
}

interface RegisteredRoleRow {
  surface_name: string;
  label: string | null;
  mandate_key: string | null;
}

interface RegisteredSurfaceRow {
  name: string;
  label: string | null;
  url_pattern: string | null;
}

/**
 * Screens whose manifest names a job under one of these key prefixes — asked
 * without waiting for the job list, so the page reads both side by side. Keep
 * the answer to the jobs the viewer can see with `keepVisibleJobs`.
 */
export async function fetchRegisteredPlacesForFeature(
  prefixes: readonly string[],
  context: IntelligenceContext,
): Promise<ResolvedPlace[]> {
  if (prefixes.length === 0) return [];
  const { data: roles, error } = await supabase
    .schema("ui")
    .from("ui_surface_agent_role")
    .select("surface_name,label,mandate_key")
    .or(prefixes.map((prefix) => `mandate_key.like."${prefix}.%"`).join(","));
  if (error) throw new Error(`Registered places: ${error.message}`);
  return placesFromRoles((roles ?? []) as RegisteredRoleRow[], context);
}

/** Registered places narrowed to visible jobs; a place left with none is dropped. */
export function keepVisibleJobs(
  places: readonly ResolvedPlace[],
  visible: ReadonlySet<string>,
): ResolvedPlace[] {
  return places
    .map((place) => ({
      ...place,
      mandateKeys: place.mandateKeys.filter((key) => visible.has(key)),
    }))
    .filter((place) => place.mandateKeys.length > 0);
}

async function placesFromRoles(
  roleRows: readonly RegisteredRoleRow[],
  context: IntelligenceContext,
): Promise<ResolvedPlace[]> {
  if (roleRows.length === 0) return [];

  const names = [...new Set(roleRows.map((row) => row.surface_name))];
  const { data: surfaces, error: surfaceError } = await supabase
    .schema("ui")
    .from("ui_surface")
    .select("name,label,url_pattern")
    .in("name", names);
  if (surfaceError) throw new Error(`Registered places: ${surfaceError.message}`);
  const byName = new Map(
    ((surfaces ?? []) as RegisteredSurfaceRow[]).map((row) => [row.name, row]),
  );

  const grouped = new Map<string, ResolvedPlace>();
  for (const role of roleRows) {
    if (!role.mandate_key) continue;
    const surface = byName.get(role.surface_name);
    const existing = grouped.get(role.surface_name);
    if (existing) {
      grouped.set(role.surface_name, {
        ...existing,
        mandateKeys: [...new Set([...existing.mandateKeys, role.mandate_key])],
        trigger: existing.trigger.includes(role.label ?? "")
          ? existing.trigger
          : [existing.trigger, role.label].filter(Boolean).join(", "),
      });
      continue;
    }
    grouped.set(role.surface_name, {
      id: `registered:${role.surface_name}`,
      label: surface?.label ?? role.surface_name,
      trigger: role.label ?? "",
      href: fillUrlPattern(surface?.url_pattern, context),
      urlPattern: surface?.url_pattern ?? null,
      mandateKeys: [role.mandate_key],
      origin: "registered",
    });
  }
  return [...grouped.values()];
}

/** Declared places for a feature, with links filled from the context. */
export function resolveDeclaredPlaces(
  feature: string,
  context: IntelligenceContext,
): ResolvedPlace[] {
  const declared = declaredPlacesFor(feature);
  if (!declared) return [];
  return declared.places.map((place) => ({
    id: place.id,
    label: place.label,
    trigger: place.trigger,
    href: fillUrlPattern(place.urlPattern, context),
    urlPattern: place.urlPattern ?? null,
    mandateKeys: place.mandateKeys,
    origin: "declared" as const,
  }));
}

/**
 * One list: declared places first, then registered screens that add something
 * (a registered screen at the same route as a declared place merges into it).
 */
export function mergePlaces(
  declared: readonly ResolvedPlace[],
  registered: readonly ResolvedPlace[],
): ResolvedPlace[] {
  const out = declared.map((place) => ({ ...place }));
  for (const place of registered) {
    const twin = out.find(
      (candidate) =>
        candidate.urlPattern !== null && candidate.urlPattern === place.urlPattern,
    );
    if (twin) {
      twin.mandateKeys = [...new Set([...twin.mandateKeys, ...place.mandateKeys])];
      continue;
    }
    out.push({ ...place });
  }
  return out;
}
