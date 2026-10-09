/**
 * A RELOADED TAB KEEPS ITS ORGANIZATION — new records never scatter across
 * organizations because SOMEONE ELSE switched (2026-10-08).
 *
 * THE DEFECT: three study kits made back-to-back by admin@admin.com from
 * /education/kits/new landed in three different organizations (Ashford Labs
 * 03:22, Signal & Scale Podcast 03:37, Bramble Lane Dog Grooming 03:38 UTC).
 * `ensureOrgId(null)` faithfully returned the tab's active organization each
 * time — but every full page load re-ran the load ladder with NO held
 * organization (Redux starts empty), so rung 2 answered with the ACCOUNT's
 * `last_active_organization_id`, which every other signed-in session of the
 * same account moves on each switch. The tab "kept its organization until the
 * person switches in that tab" only until it reloaded.
 *
 * THE RULE: the tab's answered organization is remembered for THIS tab
 * (sessionStorage — survives a reload of the same tab, never seen by another
 * tab) and is the ladder's rung 0 on its next load while it is still a
 * membership. A brand-new tab still opens to the account's last active.
 *
 * SUT: the real `appContextPolicy.remote.fetch`, the real resolver and rung
 * order, the real reducer, the real `tabOrganizationMiddleware`, the real
 * `ensureOrgId`. Doubles: the membership reads, the account's choices
 * (network), the link-session helpers (window location / toasts), and the
 * store singleton pointer.
 */

import { jest } from "@jest/globals";
import { configureStore } from "@reduxjs/toolkit";

const USER = "87a6e699-3622-4869-8843-d0867456c0dd";
const OTHER_USER = "99999999-9999-4999-8999-999999999999";
const ASHFORD = "c19a81b7-f65f-4c01-b04c-00f97f8b7e4d";
const SIGNAL = "60e17095-583e-40e2-8e8d-9bb00eacc6f5";
const BRAMBLE = "64cfcadc-50a1-4529-8af8-1d79ff9028ec";

const orgs = [
  { id: ASHFORD, name: "Ashford Labs" },
  { id: SIGNAL, name: "Signal & Scale Podcast" },
  { id: BRAMBLE, name: "Bramble Lane Dog Grooming" },
];
let memberships = [...orgs];
/** The ACCOUNT's last active — moved by any other session of the account. */
let lastActive: string | null = ASHFORD;

jest.mock("@/features/organizations/service", () => ({
  getUserOrganizations: async () => memberships,
}));
jest.mock("@/lib/organizations/accountOrganizationChoices", () => ({
  readAccountOrganizationChoices: async () => ({
    lastActiveOrganizationId: lastActive,
    startupOrganizationId: null,
  }),
  writeLastActiveOrganization: async (id: string) => {
    lastActive = id;
  },
}));
jest.mock("@/features/organizations/service/membershipsService", () => ({
  membershipsService: {
    forUser: async () => ({
      data: {
        memberships: orgs.map((o, i) => ({
          containerId: o.id,
          status: "active",
          createdAt: `2026-01-0${i + 1}`,
        })),
      },
    }),
  },
}));
jest.mock("@/lib/organizations/linkOrganizationSession", () => ({
  readLinkOrganizationFromLocation: () => null,
  readSwitchWhenALinkAsks: () => true,
  readSignedInAs: () => null,
  announceLinkOrganizationDecision: async () => {},
  claimLinkOrganizationDecision: () => false,
}));
jest.mock("@/lib/organizations/announceActiveOrganizationReplaced", () => ({
  announceActiveOrganizationReplaced: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({ toast: { error: () => {}, info: () => {} } }));

import appContextReducer, {
  appContextPolicy,
  setOrganization,
} from "@/lib/redux/slices/appContextSlice";
import userAuthReducer, { setUserAuth } from "@/lib/redux/slices/userAuthSlice";
import { buildRehydrateAction } from "@/lib/sync/engine/rehydrate";
import { tabOrganizationMiddleware } from "@/lib/organizations/tabOrganization";
import { resetOrgBootstrapGate } from "@/lib/organizations/orgBootstrapGate";
import { setStoreSingleton } from "@/lib/redux/store-singleton";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";

function makeStore(userId: string) {
  const store = configureStore({
    reducer: { appContext: appContextReducer, userAuth: userAuthReducer },
    middleware: (getDefault) => getDefault().concat(tabOrganizationMiddleware),
  });
  store.dispatch(setUserAuth({ id: userId }));
  return store;
}
const BOOT = { fromRehydrate: true };
type TestStore = ReturnType<typeof makeStore>;

/** One full page load of a tab: fresh Redux, cache paint, then the ladder. */
async function load(userId = USER): Promise<TestStore> {
  resetOrgBootstrapGate();
  const store = makeStore(userId);
  setStoreSingleton(store as never);
  // The shared browser cache paints whatever any tab last held.
  store.dispatch(
    buildRehydrateAction("appContext", { organization_id: lastActive, organization_name: "painted" }, BOOT) as never,
  );
  const fetchLadder = appContextPolicy.config.remote?.fetch;
  if (!fetchLadder) throw new Error("appContextPolicy has no remote fetch");
  const answer = await fetchLadder({
    identity: { type: "auth", userId, key: `auth:${userId}` },
    signal: new AbortController().signal,
  } as never);
  store.dispatch(
    buildRehydrateAction("appContext", appContextPolicy.config.deserialize!(answer as never), BOOT) as never,
  );
  return store;
}

beforeEach(() => {
  window.sessionStorage.clear();
  memberships = [...orgs];
  lastActive = ASHFORD;
});

describe("a tab's organization across reloads", () => {
  it("survives a reload after another session moved the account's last active", async () => {
    const tab = await load();
    expect(await ensureOrgId(null)).toBe(ASHFORD);

    // Another session of the SAME account switches twice.
    lastActive = SIGNAL;
    lastActive = BRAMBLE;

    // This tab reloads (kit made → back to /education/kits/new by URL).
    void tab;
    await load();
    expect(await ensureOrgId(null)).toBe(ASHFORD);
  });

  it("returns the same organization on every repeated create across reloads", async () => {
    await load();
    const seen = new Set<string>();
    for (const elsewhere of [SIGNAL, BRAMBLE, SIGNAL]) {
      seen.add(await ensureOrgId(null));
      seen.add(await ensureOrgId(null));
      lastActive = elsewhere;
      await load();
    }
    seen.add(await ensureOrgId(null));
    expect([...seen]).toEqual([ASHFORD]);
  });

  it("follows the person's own switch in this tab, across a reload", async () => {
    const tab = await load();
    tab.dispatch(chooseActiveOrganization({ id: BRAMBLE, name: "Bramble Lane" }) as never);
    expect(await ensureOrgId(null)).toBe(BRAMBLE);
    lastActive = SIGNAL; // another session moves it again
    await load();
    expect(await ensureOrgId(null)).toBe(BRAMBLE);
  });

  it("a brand-new tab opens to the account's last active", async () => {
    await load();
    lastActive = SIGNAL;
    window.sessionStorage.clear(); // a new tab has its own, empty session
    await load();
    expect(await ensureOrgId(null)).toBe(SIGNAL);
  });

  it("drops the remembered organization once it is no longer a membership", async () => {
    await load();
    lastActive = SIGNAL;
    memberships = orgs.filter((o) => o.id !== ASHFORD);
    await load();
    expect(await ensureOrgId(null)).toBe(SIGNAL);
  });

  it("never carries one person's tab organization to another person", async () => {
    await load(USER);
    lastActive = SIGNAL;
    await load(OTHER_USER);
    expect(await ensureOrgId(null)).toBe(SIGNAL);
  });

  it("the cache paint alone never becomes the tab's remembered organization", async () => {
    resetOrgBootstrapGate();
    const store = makeStore(USER);
    setStoreSingleton(store as never);
    store.dispatch(
      buildRehydrateAction("appContext", { organization_id: BRAMBLE, organization_name: "painted" }, BOOT) as never,
    );
    store.dispatch(setOrganization({ id: null }));
    lastActive = SIGNAL;
    await load();
    expect(await ensureOrgId(null)).toBe(SIGNAL);
  });
});
