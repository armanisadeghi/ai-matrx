/**
 * media-order-presets.ts — the "order off the menu" model for site-level AI
 * image generation. Each preset is a predetermined image TYPE (hero,
 * infographic, share card…) carrying its default style prompt and target
 * dimensions, so ordering an image is: pick a type, describe the subject,
 * optionally tweak — never assemble a prompt from scratch.
 *
 * Dimensions resolve in this order: an explicit user override, then the
 * site's matching media-standard slot (settings.media_standards), then the
 * preset default. The style strings reuse the page image plan's vocabulary
 * (PageImagePlanCard STYLE_PRESETS) so both surfaces speak one language.
 */

import type {
  MediaStandardSlot,
  SiteMediaStandards,
} from "@/features/marketing/data/media-library";

export interface MediaOrderPreset {
  id: string;
  label: string;
  /** One-line menu description shown on the order card. */
  description: string;
  /** Style text handed to the prompt-generator agent. */
  style: string;
  /** Default target dimensions when the site has no matching standard slot. */
  width: number;
  height: number;
  /**
   * Lower-cased tokens matched against the site's standard slot names —
   * the first matching slot's dimensions/format take over the defaults.
   */
  slotTokens: string[];
}

export const MEDIA_ORDER_PRESETS: MediaOrderPreset[] = [
  {
    id: "hero",
    label: "Hero / banner",
    description: "Wide lead image for the top of a page.",
    style: "Hero / Banner",
    width: 1600,
    height: 900,
    slotTokens: ["hero", "banner"],
  },
  {
    id: "share-card",
    label: "Share card (OG)",
    description: "Social preview card shown when the page is shared.",
    style: "Social Share Card",
    width: 1200,
    height: 630,
    slotTokens: ["og", "share", "social"],
  },
  {
    id: "infographic",
    label: "Infographic",
    description: "Data or process explained visually, labeled sections.",
    style: "Infographic",
    width: 1080,
    height: 1350,
    slotTokens: ["infographic"],
  },
  {
    id: "diagram",
    label: "Diagram",
    description: "Clean informational diagram of a concept or flow.",
    style: "Informational Diagram",
    width: 1200,
    height: 900,
    slotTokens: ["diagram"],
  },
  {
    id: "blog-header",
    label: "Blog header",
    description: "Editorial lead image for an article.",
    style: "Editorial Illustration",
    width: 1200,
    height: 675,
    slotTokens: ["blog", "article", "header"],
  },
  {
    id: "photo",
    label: "Photo",
    description: "Photorealistic scene or subject.",
    style: "Photorealistic Photo",
    width: 1600,
    height: 1067,
    slotTokens: ["photo", "content"],
  },
  {
    id: "product",
    label: "Product shot",
    description: "Product photography or mockup on a clean stage.",
    style: "Product Photography & Mockup",
    width: 1200,
    height: 1200,
    slotTokens: ["product"],
  },
  {
    id: "illustration",
    label: "Illustration",
    description: "Branded editorial illustration, non-photographic.",
    style: "Editorial Illustration",
    width: 1200,
    height: 900,
    slotTokens: ["illustration"],
  },
];

export interface ResolvedOrderDimensions {
  width: number;
  height: number;
  format: string | null;
  /** Where the dimensions came from — shown on the order form. */
  source: "standard" | "preset";
  slotName: string | null;
}

/** Find the site standard slot matching this preset, if any. */
export function matchStandardSlot(
  preset: MediaOrderPreset,
  standards: SiteMediaStandards,
): MediaStandardSlot | null {
  for (const slot of standards.slots) {
    const name = slot.name.toLowerCase();
    if (preset.slotTokens.some((token) => name.includes(token))) return slot;
  }
  return null;
}

export function resolveOrderDimensions(
  preset: MediaOrderPreset,
  standards: SiteMediaStandards,
): ResolvedOrderDimensions {
  const slot = matchStandardSlot(preset, standards);
  if (slot && slot.width && slot.height) {
    return {
      width: slot.width,
      height: slot.height,
      format: slot.format,
      source: "standard",
      slotName: slot.name,
    };
  }
  return {
    width: preset.width,
    height: preset.height,
    format: null,
    source: "preset",
    slotName: null,
  };
}

/** Build the generation spec handed to the prompt-generator agent. */
export function buildSiteImageSpec(args: {
  siteName: string;
  siteUrl: string | null;
  preset: MediaOrderPreset;
  subject: string;
  dimensions: ResolvedOrderDimensions;
  brandNotes?: string;
  standardsNotes?: string;
}): string {
  return [
    `Generate ONE ${args.preset.label.toLowerCase()} image for the website ${args.siteName}${args.siteUrl ? ` (${args.siteUrl})` : ""}.`,
    `Subject: ${args.subject}`,
    `Target dimensions: ${args.dimensions.width}×${args.dimensions.height}${args.dimensions.format ? `, delivered as ${args.dimensions.format}` : ""} — compose for this exact aspect ratio.`,
    args.brandNotes ? `Brand context: ${args.brandNotes}` : null,
    args.standardsNotes ? `Site media rules: ${args.standardsNotes}` : null,
    "Return the image itself as your output.",
  ]
    .filter(Boolean)
    .join("\n");
}
