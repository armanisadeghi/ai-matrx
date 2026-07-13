// Shared metadata builder for the per-variant real-favicon test routes.
// Each subroute exports `metadata = buildVariantFaviconMetadata("<id>")` so the
// variant renders as the ACTUAL browser-tab favicon (the only honest way to
// judge two-letter fit at 16px). All routes use "WR" on War Room red so shape
// is the only variable; the tab title says which variant it is.
import type { Metadata } from "next";
import { svgToDataURI } from "@/utils/favicon-utils";
import { FAVICON_VARIANTS, type FaviconVariantId } from "@/utils/favicon-variants";

export const LAB_LETTER = "WR";
export const LAB_COLOR = "#dc2626";

export function buildVariantFaviconMetadata(id: FaviconVariantId): Metadata {
  const variant = FAVICON_VARIANTS.find((v) => v.id === id)!;
  const uri = svgToDataURI(variant.generate({ letter: LAB_LETTER, color: LAB_COLOR }));
  return {
    title: `${variant.label} · Favicon Lab`,
    icons: { icon: [{ url: uri, type: "image/svg+xml" }] },
  };
}
