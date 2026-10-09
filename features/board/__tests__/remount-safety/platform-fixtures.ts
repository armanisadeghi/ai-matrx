/**
 * What the platform answers for ANY signed-in screen, whatever the tile: the
 * person's membership in their organization, the settings snapshot, who lists
 * are shown to, sharing authority on their own records. Shapes are the RPCs'
 * own (their callers' row types, cited beside each); values are one property
 * manager in one organization.
 */

import { ORGANIZATION, PERSON } from "./people";
import { seed, seedRpc } from "./fake-backend";

/** The platform's seeded knob rows a board tile reads (`feature.key` → value). */
const KNOBS: Record<string, unknown> = {
  "tables.density.mode": "normal",
  // features/settings/universal/knobEnumVocabularies.generated.ts — the copy door's flavor (a chat reply's copy action).
  "copy.default_flavor": "markdown",
  "lists.landing_tab.note": "all",
  "lists.landing_tab.task": "all",
  "lists.landing_tab.project": "all",
  "lists.landing_tab.file": "all",
  "lists.landing_tab.default": "all",
  // migrations/chat_composer_knobs_2026_09_27.sql
  "agents.chat_composer.default_mode": "chat",
  "agents.chat_composer.remember_last_mode": true,
  "agents.chat_composer.compact_input_max_height_pct": 50,
  "selection_toolbar.highlight_while_editing": false,
  // migrations/campaign/merge7_the_merged_grid_is_a_feature_knob.sql
  "data_tables.merged_grid": false,
};

export function seedPlatform(): void {
  // features/organizations/service/membershipsService.ts `MbrForUserRow`
  seedRpc("mbr_for_user", [
    {
      id: "c1e7a3f0-2b9d-4c58-8e16-5a0f3d7b9c21",
      organization_id: ORGANIZATION.id,
      container_id: ORGANIZATION.id,
      user_id: PERSON.id,
      role: "owner",
      status: "active",
      created_at: "2026-03-14T16:05:00.000Z",
    },
  ]);
  // lib/scoped-config/effectiveKnobs.ts — `{ resolved, stamp }`; nothing overridden.
  // features/organizations/service/membershipsService.ts `MbrCountRow`
  seedRpc("mbr_count", [{ container_id: ORGANIZATION.id, member_count: 4 }]);
  seedRpc("knob_snapshot", { resolved: KNOBS, stamp: "2026-10-02T08:00:00.000Z" });
  // KNOB-SNAPSHOT (2026-10-08): the same answer in its two halves. `knob_defaults` is the platform's values
  // (kept once per tab, in memory + localStorage), `knob_snapshot_delta` the person's difference (nothing here).
  // Unseeded, both fail, and a failed read is never kept - every wake would ask again.
  seedRpc("knob_defaults", { version: "d1", unchanged: false, defaults: KNOBS });
  seedRpc("knob_snapshot_delta", { etag: "e1", defaults_version: "d1", unchanged: false, overrides: {} });
  // lib/list-scope/shownTo.ts `ShownToContext`
  seedRpc("shown_to_context", { [ORGANIZATION.id]: { d: "everyone", t: [PERSON.id] } });
  // utils/permissions/service.ts — the person owns what the tile shows.
  seedRpc("may_manage_sharing", true);
  // features/tasks/redux/taskAssociationsSlice.ts — no task links this record yet.
  seedRpc("get_tasks_for_entity", { tasks: [] });
  seed("public.app_instances", []);
  // lib/organizations/systemOrg.ts — the platform's own organization (not the person's).
  seed("iam.system_orgs", [
    { key: "system", organization_id: "00000000-0000-4000-8000-0000000000a1" },
    { key: "library", organization_id: "00000000-0000-4000-8000-0000000000b2" },
  ]);
  // @ai-matrx/associations `listForSources` — nothing attached yet.
  seedRpc("assoc_for_sources", []);
  seedRpc("assoc_for_targets", []);
  seedRpc("assoc_for_entity", []);
  seedRpc("conversation_files", []);
  // favorites/pins (`ues_get_bulk`): only rows that HAVE state come back — none yet.
  seedRpc("ues_get_bulk", []);
  // lib/knobs/unifiedDataCampaign.ts — the record store is on for this organization.
  seedRpc("unified_data_store_on", { on: true });
}
