/**
 * Canonical surface display helpers — the ONE seam every UI reads labels
 * through. THE NAMING LAW: a surface and each of its values have exactly one
 * canonical human label, declared in the manifest and mirrored to the DB.
 * No component may hand-type, override, or re-derive these strings.
 *
 * Registry lookups are static and synchronous — safe in server and client
 * components alike.
 */

import type { SurfaceManifest, SurfaceValueGroup } from "@/features/surfaces/types";
import { getManifest } from "@/features/surfaces/manifests/registry";

/** Tokens that stay fully uppercase in slug-derived fallback labels. */
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
 * Derive a human label from a `ui_surface.name` local slug
 * (`matrx-user/pdf-extractor` → "PDF Extractor"). LAST-RESORT fallback for
 * manifest-less DB surfaces only — never call this for a surface that has a
 * manifest; its canonical `label` is the only permitted name.
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
 * THE canonical surface display label: manifest `label` (required on every
 * manifest), slug-derived only for surfaces with no registered manifest.
 */
export function getSurfaceDisplayLabel(surfaceName: string): string {
  const fromManifest = getManifest(surfaceName)?.label?.trim();
  if (fromManifest) return fromManifest;
  return labelFromName(surfaceName);
}

/**
 * THE canonical label for one surface value. Screams (dev) and returns the
 * machine name when the value is undeclared — a page rendering an undeclared
 * value label is a completeness defect, but must never crash.
 */
export function getSurfaceValueLabel(
  surfaceName: string,
  valueName: string,
): string {
  const value = getManifest(surfaceName)?.values.find(
    (v) => v.name === valueName,
  );
  if (!value) {
    if (process.env.NODE_ENV !== "production") {
      console.error(
        `[surfaces] getSurfaceValueLabel: "${valueName}" is not declared on ` +
          `"${surfaceName}" — declare it in the manifest (completeness law).`,
      );
    }
    return valueName;
  }
  return value.label;
}

/** Canonical, ordered group list for a surface (empty for manifest-less surfaces). */
export function getSurfaceValueGroups(
  surfaceName: string,
): readonly SurfaceValueGroup[] {
  return getManifest(surfaceName)?.groups ?? [];
}

/**
 * Typed label map for a manifest — the ergonomic way for a page to render its
 * section titles and field labels byte-identically to the manifest:
 *
 *   const L = surfaceValueLabels(marketingPageManifest);
 *   <SectionCard title={L.page_content} />
 */
export function surfaceValueLabels<M extends SurfaceManifest>(
  manifest: M,
): Record<M["values"][number]["name"], string> {
  const out: Record<string, string> = {};
  for (const v of manifest.values) out[v.name] = v.label;
  return out as Record<M["values"][number]["name"], string>;
}

/**
 * Typed group-label map for a manifest (`G.page_intent` → "Page intent").
 * Same law as `surfaceValueLabels`, for group/section headings.
 */
export function surfaceGroupLabels<M extends SurfaceManifest>(
  manifest: M,
): Record<NonNullable<M["groups"]>[number]["key"], string> {
  const out: Record<string, string> = {};
  for (const g of manifest.groups ?? []) out[g.key] = g.label;
  return out as Record<NonNullable<M["groups"]>[number]["key"], string>;
}
