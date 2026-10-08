// features/administration/custom-tables/testFixtureOrgs.ts — MARK / UNMARK ORGANIZATIONS AS TEST FIXTURES.
//
// One admin-lane bulk action on the Custom tables page (lane ONE-HOME, wave 6.2, chair request).
// The classification is the stored one every picker already reads: the PRESENCE of the key
// `iam.organizations.settings.test_fixture` (features/make/recent.ts `isTestOrganization`,
// features/scopes/service/scopesService.ts `is_test_fixture`). Marked organizations leave the
// organization pickers and Recent; unmarking removes the key and they come back.
//
// THE DOOR: `public.org_update(p_org_id, p_patch)` — the one write door for an organization's
// settings (SECURITY DEFINER; admits `is_platform_admin()`, which is true only on the admin lane, or
// a manager of that organization; refusals are sentences). It REPLACES `settings` whole, so every
// organization is read fresh immediately before its own write and only the one key changes; every
// other setting is carried across untouched. No raw table update from the client.
//
// NOTHING FAILS SILENTLY: a refused organization is reported by name with the door's own sentence
// and the run carries on with the next one; an organization already in the asked state is skipped
// and counted, never rewritten.

import { isTestOrganization } from "@/features/make/recent";

export type Settings = Record<string, unknown>;

/** What a door call returned: the value, or the door's refusal sentence. */
export type DoorResult<T> = { ok: true; data: T } | { ok: false; message: string };

export interface OrgSettingsDoors {
  /** The organization's settings as stored right now (`iam.organizations.settings`). */
  readSettings: (orgId: string) => Promise<DoorResult<Settings | null>>;
  /** `public.org_update(p_org_id, { settings })` — replaces settings whole. */
  writeSettings: (orgId: string, settings: Settings) => Promise<DoorResult<unknown>>;
}

export interface FixtureTarget {
  id: string;
  name: string;
}

export type FixtureOutcome =
  | { status: "changed"; target: FixtureTarget }
  | { status: "unchanged"; target: FixtureTarget }
  | { status: "refused"; target: FixtureTarget; message: string };

export function isTestFixture(settings: unknown): boolean {
  return isTestOrganization({ settings });
}

/**
 * The settings with the mark set (on) or removed (off), every other key carried across. The stored
 * value says where the mark came from; readers only ask whether the key is there.
 */
export function withTestFixture(settings: Settings | null | undefined, on: boolean, stamp: string): Settings {
  const base: Settings = settings && typeof settings === "object" && !Array.isArray(settings) ? { ...settings } : {};
  if (on) {
    base.test_fixture = stamp;
  } else {
    delete base.test_fixture;
  }
  return base;
}

/** The provenance stored under the key when this page marks an organization. */
export function fixtureStamp(now: Date = new Date()): string {
  return `Custom tables admin page, ${now.toISOString().slice(0, 10)}`;
}

export async function setTestFixture(
  targets: readonly FixtureTarget[],
  on: boolean,
  doors: OrgSettingsDoors,
  stamp: string = fixtureStamp(),
): Promise<FixtureOutcome[]> {
  const outcomes: FixtureOutcome[] = [];
  for (const target of targets) {
    outcomes.push(await setOne(target, on, doors, stamp));
  }
  return outcomes;
}

async function setOne(target: FixtureTarget, on: boolean, doors: OrgSettingsDoors, stamp: string): Promise<FixtureOutcome> {
  try {
    const read = await doors.readSettings(target.id);
    if (!read.ok) return { status: "refused", target, message: read.message || "The organization could not be read." };
    if (isTestFixture(read.data) === on) return { status: "unchanged", target };
    const wrote = await doors.writeSettings(target.id, withTestFixture(read.data, on, stamp));
    if (!wrote.ok) return { status: "refused", target, message: wrote.message || "The change was refused." };
    return { status: "changed", target };
  } catch (thrown) {
    return { status: "refused", target, message: thrown instanceof Error ? thrown.message : String(thrown) };
  }
}
