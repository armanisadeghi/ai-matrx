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
  "lists.landing_tab.note": "all",
  "lists.landing_tab.task": "all",
  "lists.landing_tab.project": "all",
  "lists.landing_tab.file": "all",
  "lists.landing_tab.default": "all",
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
  seedRpc("knob_snapshot", { resolved: KNOBS, stamp: "2026-10-02T08:00:00.000Z" });
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
}
