// features/unified-data/hub/__tests__/the-data-home-remembers-its-organization.test.ts
//
// THE USE CASE (lane DATA-HOME-2, Arman 2026-09-28 ~14:00 PT). The owner of Harbor Dental Group
// also keeps the books for Rincon Plumbing Co. On the data home she picks Harbor Dental in the
// organization dropdown. Tomorrow, on her phone (a fresh session), the home opens on Harbor Dental
// again. Somebody who never picked opens on All Orgs — the knob custom.data_home_default_organization.
// And moving the ACTIVE organization (the app header's switcher) never changes what she picked.
//
// RED before the lane: dataHomeScope had no organization resolver, and the preferences record had
// no place to remember the pick (it did not survive a fresh session).
import reducer, {
  initializeUserPreferencesState,
  setModulePreferences,
  type UserPreferencesState,
} from "@/lib/redux/preferences/userPreferencesSlice";
import { REHYDRATE_ACTION_TYPE } from "@/lib/sync/engine/rehydrate";
import * as scope from "../dataHomeScope";

const HARBOR = "11f4e747-0000-4000-8000-000000000001";
const RINCON = "884d1ce8-0000-4000-8000-000000000002";
const LEFT = "5b0e2a11-0000-4000-8000-000000000003"; // an organization she no longer belongs to
const MEMBER_OF = [HARBOR, RINCON];

type Resolve = (a: string | null, saved: unknown, knob: unknown, members: readonly string[] | null) => string;
const resolve = (): Resolve => {
  const fn = (scope as unknown as { resolveDataHomeOrganization?: Resolve }).resolveDataHomeOrganization;
  if (!fn) throw new Error("dataHomeScope has no resolveDataHomeOrganization — the dropdown's choice is decided nowhere");
  return fn;
};

/** A fresh session: a new store, the saved record rehydrated into it exactly as the sync engine does. */
function freshSessionFrom(saved: UserPreferencesState): UserPreferencesState {
  const { _meta, ...body } = saved;
  void _meta;
  return reducer(initializeUserPreferencesState(), {
    type: REHYDRATE_ACTION_TYPE,
    payload: { sliceName: "userPreferences", state: JSON.parse(JSON.stringify(body)) },
    meta: {} as never,
  });
}

describe("the data home · a new person opens on All Orgs", () => {
  it("no address, no saved pick, the platform knob 'all' → All Orgs", () => {
    const fresh = initializeUserPreferencesState();
    expect(fresh.lists.dataHomeOrganizationId ?? null).toBeNull();
    expect(resolve()(null, fresh.lists.dataHomeOrganizationId, "all", MEMBER_OF)).toBe("all");
  });

  it("the knob not read yet → All Orgs, never a guessed organization", () => {
    expect(resolve()(null, null, undefined, MEMBER_OF)).toBe("all");
  });
});

describe("the data home · her pick survives a fresh session", () => {
  it("picked Harbor Dental → a new session opens on Harbor Dental", () => {
    const today = reducer(
      initializeUserPreferencesState(),
      setModulePreferences({ module: "lists", preferences: { dataHomeOrganizationId: HARBOR } }),
    );
    const tomorrow = freshSessionFrom(today);
    expect(tomorrow.lists.dataHomeOrganizationId).toBe(HARBOR);
    expect(resolve()(null, tomorrow.lists.dataHomeOrganizationId, "all", MEMBER_OF)).toBe(HARBOR);
  });

  it("picked All Orgs after Harbor Dental → a new session opens on All Orgs", () => {
    let s = reducer(
      initializeUserPreferencesState(),
      setModulePreferences({ module: "lists", preferences: { dataHomeOrganizationId: HARBOR } }),
    );
    s = reducer(s, setModulePreferences({ module: "lists", preferences: { dataHomeOrganizationId: "all" } }));
    expect(resolve()(null, freshSessionFrom(s).lists.dataHomeOrganizationId, "all", MEMBER_OF)).toBe("all");
  });

  it("the pick keeps the archive setting beside it (one module, merged, never replaced)", () => {
    let s = reducer(
      initializeUserPreferencesState(),
      setModulePreferences({ module: "lists", preferences: { archivedDefault: "all" } }),
    );
    s = reducer(s, setModulePreferences({ module: "lists", preferences: { dataHomeOrganizationId: RINCON } }));
    expect(freshSessionFrom(s).lists).toEqual({ archivedDefault: "all", dataHomeOrganizationId: RINCON });
  });
});

describe("the data home · what wins", () => {
  it("the address (this visit's choice) wins over the saved pick", () => {
    expect(resolve()(RINCON, HARBOR, "all", MEMBER_OF)).toBe(RINCON);
    expect(resolve()("all", HARBOR, "all", MEMBER_OF)).toBe("all");
  });

  it("an organization she left is not honoured — the next source decides", () => {
    expect(resolve()(null, LEFT, "all", MEMBER_OF)).toBe("all");
    expect(resolve()(LEFT, HARBOR, "all", MEMBER_OF)).toBe(HARBOR);
  });

  it("memberships not read yet: the saved pick is held on trust, not dropped to All Orgs", () => {
    expect(resolve()(null, HARBOR, "all", null)).toBe(HARBOR);
  });

  it("the active organization is not an input at all — switching it cannot move the filter", () => {
    // The resolver's four inputs are the address, the saved pick, the knob and her memberships.
    expect(resolve().length).toBe(4);
    expect(resolve()(null, HARBOR, "all", MEMBER_OF)).toBe(HARBOR);
  });
});
