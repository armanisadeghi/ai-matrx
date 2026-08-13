/**
 * ONE vocabulary for the canonical `platform.visibility` enum.
 *
 * Every surface that shows a row's visibility reads it from here, so the words
 * the user sees cannot drift between a pill, a panel, and a copy-for-AI payload.
 * Extracted 2026-08-13 while certifying `app.definition` — that table's legacy
 * `is_public` boolean was replaced by this enum, and the boolean's old
 * "Public / Personal" two-state labelling was actively wrong (a row that is
 * merely `internal` is not personal).
 *
 * `short` is for pills, badges and dense table cells. `long` is for panels that
 * have room to explain what the setting actually does.
 */

import type { Database } from "@/types/database.types";

export type Visibility = Database["platform"]["Enums"]["visibility"];

const LABELS: Record<Visibility, { short: string; long: string }> = {
  public: {
    short: "Public",
    long: "Public — anyone with the link",
  },
  link: {
    short: "Link",
    long: "Link — anyone holding a share link",
  },
  internal: {
    short: "Internal",
    long: "Internal — readable inside the owning organization",
  },
  personal: {
    short: "Personal",
    long: "Personal — belongs to one person",
  },
};

function entry(visibility: string) {
  return LABELS[visibility as Visibility];
}

/** Compact label for a pill / badge / table cell. Unknown values pass through. */
export function visibilityLabelShort(visibility: string | null | undefined): string {
  if (!visibility) return "Unknown";
  return entry(visibility)?.short ?? visibility;
}

/** Explanatory label for a panel with room for a sentence. */
export function visibilityLabelLong(visibility: string | null | undefined): string {
  if (!visibility) return "Unknown";
  return entry(visibility)?.long ?? visibility;
}

/** True when the row is reachable by people outside the owning org. */
export function isPubliclyVisible(visibility: string | null | undefined): boolean {
  return visibility === "public";
}
