// features/spaces/page/gallery.ts — the pictures Spaces ships with (Notion's cover gallery and picture
// icons), bundled as static assets inside the feature: no external fetch, no Notion assets.
//
// Stored as `{ url: "gallery:<key>" }` like the CSS gradients, so a page keeps its choice by name and a
// build can re-encode the files without touching a saved page.

import desertDunes from "../assets/covers/desert-dunes.webp";
import goldenPalms from "../assets/covers/golden-palms.webp";
import lavenderDusk from "../assets/covers/lavender-dusk.webp";
import mistyMountains from "../assets/covers/misty-mountains.webp";
import oceanHorizon from "../assets/covers/ocean-horizon.webp";
import pineForest from "../assets/covers/pine-forest.webp";
import portraitFounder from "../assets/icons/portrait-founder.webp";

export const GALLERY_PREFIX = "gallery:";

/** Cover pictures, in the order the picker shows them. */
export const COVER_PHOTOS: Array<{ key: string; label: string; src: string }> = [
  { key: "photo-golden-palms", label: "Golden palms", src: goldenPalms.src },
  { key: "photo-desert-dunes", label: "Desert dunes", src: desertDunes.src },
  { key: "photo-ocean-horizon", label: "Ocean horizon", src: oceanHorizon.src },
  { key: "photo-misty-mountains", label: "Misty mountains", src: mistyMountains.src },
  { key: "photo-lavender-dusk", label: "Lavender dusk", src: lavenderDusk.src },
  { key: "photo-pine-forest", label: "Pine forest", src: pineForest.src },
];

/** Picture icons (Notion's portrait-style page icon) — illustrated, drawn procedurally; never a photo of a person. */
export const ICON_PICTURES: Array<{ key: string; label: string; src: string }> = [{ key: "portrait-founder", label: "Illustrated portrait", src: portraitFounder.src }];

const BY_KEY = new Map([...COVER_PHOTOS, ...ICON_PICTURES].map((p) => [p.key, p.src]));

/** The bundled picture a `gallery:<key>` value names, or null (a gradient key, or not a gallery value). */
export function galleryImage(url: string): string | null {
  return url.startsWith(GALLERY_PREFIX) ? (BY_KEY.get(url.slice(GALLERY_PREFIX.length)) ?? null) : null;
}
