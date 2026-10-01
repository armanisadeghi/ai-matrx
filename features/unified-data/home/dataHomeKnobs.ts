// features/unified-data/home/dataHomeKnobs.ts — LANE DATA-HOME-3A
//
// The two Feature Knobs of the rebuilt data home, at their registry addresses (seeded by
// migrations/campaign/datahome3a_the_data_home_on_the_list_shell_is_a_knob.sql).
//
// `custom.data_home_shell` — WHICH DATA HOME /data-v2 SHOWS. Arman's rollout rule (2026-10-01): no
// redirects until validated; copy mode, old and new side by side, one flip later. Platform default
// false (the old hub); a person may turn it on for themselves; the platform flip is one press on
// the knob. Resolved at the person / platform tier, never in the active organization.
//
// `custom.data_home_default_view` — Table or Cards for a person who has not picked one (platform
// default table). A person's own pick (the shell's view preference) wins.

export const DATA_HOME_SHELL_KNOB = { feature: "custom", key: "data_home_shell" } as const;
export const DATA_HOME_DEFAULT_VIEW_KNOB = { feature: "custom", key: "data_home_default_view" } as const;

/** `?home=new` / `?home=old` shows one data home for this visit, whatever the knob says (side by side). */
export const DATA_HOME_PREVIEW_PARAM = "home";

export function resolveDataHomeShell(knob: unknown, preview: string | null): boolean | null {
  if (preview === "new") return true;
  if (preview === "old") return false;
  if (knob === undefined) return null;
  return knob === true || knob === "true";
}

export function resolveDataHomeView(knob: unknown): "table" | "cards" {
  return knob === "cards" ? "cards" : "table";
}
