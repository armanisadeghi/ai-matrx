// features/unified-data/home/dataHomeKnobs.ts — LANE DATA-HOME-3A
//
// The data home's Feature Knob, at its registry address (seeded by
// migrations/campaign/datahome3_lane_a_the_data_home_shell_is_a_knob.sql).
//
// `custom.data_home_default_view` — Table or Cards for a person who has not picked one (platform
// default table). A person's own pick (the shell's view preference) wins.
//
// (`custom.data_home_shell`, which chose between the old hub and this home, left with the old hub
// after the switch's soak — lane ONE-HOME wave 4.)

export const DATA_HOME_DEFAULT_VIEW_KNOB = { feature: "custom", key: "data_home_default_view" } as const;

export function resolveDataHomeView(knob: unknown): "table" | "cards" {
  return knob === "cards" ? "cards" : "table";
}
