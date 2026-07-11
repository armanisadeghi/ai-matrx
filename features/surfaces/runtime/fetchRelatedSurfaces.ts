/**
 * features/surfaces/runtime/fetchRelatedSurfaces.ts
 *
 * Lightweight parent + children lookup for the Agents chrome Related section.
 * Called only after the user opens the panel — never from the header shell.
 */

import { supabase } from "@/utils/supabase/client";
import { getManifest } from "@/features/surfaces/manifests/registry";

export interface RelatedSurfaceRef {
  name: string;
  label: string;
  kind: "parent" | "child" | "self";
}

/** Tokens that should stay fully uppercase in derived labels. */
const ACRONYMS = new Set([
  "pdf",
  "ai",
  "rag",
  "cms",
  "api",
  "ocr",
  "tts",
  "url",
  "id",
  "ui",
  "db",
  "wc",
]);

/**
 * Derive a human label from a `ui_surface.name` local slug.
 * `matrx-user/pdf-extractor` → "PDF Extractor".
 */
export function labelFromName(name: string): string {
  const local = name.includes("/") ? name.slice(name.indexOf("/") + 1) : name;
  return local
    .split(/[-_/]/)
    .filter(Boolean)
    .map((w) => {
      const lower = w.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/**
 * Pretty surface label: manifest `label` wins, else acronym-aware slug title.
 */
export function getSurfaceDisplayLabel(surfaceName: string): string {
  const fromManifest = getManifest(surfaceName)?.label?.trim();
  if (fromManifest) return fromManifest;
  return labelFromName(surfaceName);
}

/**
 * Resolve the active surface's parent (if any) and direct children.
 * One or two small reads against `ui.ui_surface` — only when the panel opens.
 */
export async function fetchRelatedSurfaces(
  surfaceName: string | null,
): Promise<{
  self: RelatedSurfaceRef | null;
  parent: RelatedSurfaceRef | null;
  children: RelatedSurfaceRef[];
}> {
  if (!surfaceName) {
    return { self: null, parent: null, children: [] };
  }

  const db = supabase.schema("ui");

  const { data: selfRow, error: selfErr } = await db
    .from("ui_surface")
    .select("name, description, parent_surface_name")
    .eq("name", surfaceName)
    .maybeSingle();

  if (selfErr) throw selfErr;

  const self: RelatedSurfaceRef = {
    name: surfaceName,
    label: getSurfaceDisplayLabel(surfaceName),
    kind: "self",
  };

  let parent: RelatedSurfaceRef | null = null;
  const parentName = (selfRow as { parent_surface_name?: string | null } | null)
    ?.parent_surface_name;
  if (parentName) {
    parent = {
      name: parentName,
      label: getSurfaceDisplayLabel(parentName),
      kind: "parent",
    };
  }

  const { data: childRows, error: childErr } = await db
    .from("ui_surface")
    .select("name")
    .eq("parent_surface_name", surfaceName)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (childErr) throw childErr;

  const children: RelatedSurfaceRef[] = (
    (childRows ?? []) as Array<{ name: string }>
  ).map((r) => ({
    name: r.name,
    label: getSurfaceDisplayLabel(r.name),
    kind: "child" as const,
  }));

  return { self, parent, children };
}
