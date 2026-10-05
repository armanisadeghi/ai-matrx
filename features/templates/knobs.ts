"use client";

// features/templates/knobs.ts — every template limit is a feature knob (`platform.feature_knob`,
// feature `templates`), never a constant. Seeded 2026-09-30 on live and the clone with
// agent-set defaults and a 45-day review:
//
//   seed_row_cap        200   rows/table Save as template copies      org-overridable
//   preview_rows          8   rows/table the installed view shows      org + user
//   attached_poll_ms   4000   re-read while another tab installs platform-locked
//   run_lease_seconds   180   an install claim's lifetime        platform-locked
//   archive_max_passes  200   archive passes per table on remove platform-locked
//
// Platform-locked knobs are read through the global reader (`knobInt`); the two a
// person or organization may change go through the scoped index (`useScopedKnobs`),
// which answers the effective value for the organization and user. A missing knob is
// never replaced by a constant — the reader raises, and the scoped hook reports it.

import { knobInt } from "@/lib/knobs/featureKnobs";
import { useScopedKnobs } from "@/lib/scoped-config/useScopedKnobs";

export const TEMPLATES_KNOB_FEATURE = "templates";

export type PlatformTemplateKnob = "attached_poll_ms" | "run_lease_seconds" | "archive_max_passes";

export function templateKnob(key: PlatformTemplateKnob): Promise<number> {
  return knobInt(TEMPLATES_KNOB_FEATURE, key);
}

export interface ScopedTemplateKnobs {
  /** Null while loading, or when the knob is missing (then `missing` names it). */
  seedRowCap: number | null;
  previewRows: number | null;
  missing: string[];
}

function asInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** The template knobs an organization (and, for preview rows, a person) may override. */
export function useScopedTemplateKnobs(organizationId: string | null | undefined): ScopedTemplateKnobs {
  const { knobs, isLoading, missing } = useScopedKnobs({ organizationId, featurePrefix: TEMPLATES_KNOB_FEATURE });
  const find = (key: string) => knobs.find((k) => k.feature === TEMPLATES_KNOB_FEATURE && k.key === key);
  const seed = find("seed_row_cap");
  const preview = find("preview_rows");
  const absent = isLoading
    ? []
    : [
        ...missing.map((k) => k.full_key),
        ...(["seed_row_cap", "preview_rows"] as const).filter((k) => !find(k)).map((k) => `templates.${k}`),
      ];
  return {
    seedRowCap: seed && seed.origin !== "missing" ? asInt(seed.effective_value) : null,
    previewRows: preview && preview.origin !== "missing" ? asInt(preview.effective_value) : null,
    missing: Array.from(new Set(absent)),
  };
}
