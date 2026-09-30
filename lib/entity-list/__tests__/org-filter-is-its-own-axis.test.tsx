/**
 * THE ORGANIZATION FILTER IS ITS OWN AXIS — AND NEVER THE ACTIVE ORGANIZATION
 * (Arman 2026-09-30, common-docs /policies/active-org-is-never-a-list-filter.md).
 *
 * 🚨 THE DEFECT CLASS. Lists narrowed by the active organization (the global
 * switcher), so records in a person's other organizations vanished. The repair
 * is two axes that never touch: the lane (All / Mine / My team / My Orgs / …)
 * and the page's organization filter, `EntityListQuery.orgId`, in the URL as
 * `?org_filter=`.
 *
 * What would make each test red on a wrong implementation:
 *   - the codec writing `?org=`: that param belongs to LinkOrganizationWatcher,
 *     which SWITCHES THE ACTIVE ORGANIZATION when it appears;
 *   - the filter seeding itself from the active organization;
 *   - choosing a filter value dispatching anything to the store;
 *   - a lane still carrying an organization id of its own.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { makeStore } from "@/lib/redux/store";
import { setOrganization } from "@/lib/redux/slices/appContextSlice";
import {
  DEFAULT_LIST_SCOPE,
  listOrgParam,
  makeScope,
  scopeKey,
  withStandardLanes,
} from "@/lib/list-scope/types";
import { DEFAULT_ENTITY_LIST_QUERY, type EntityListQuery } from "../types";
import {
  ENTITY_LIST_URL_PARAMS,
  historyModeFor,
  queryToParamPatch,
  readQueryFromParams,
} from "../urlQuery";
import { orgFilterPatch, readOrgFilter, useOrgFilterParam } from "../orgFilterUrl";

const ACTIVE = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const query = (partial: Partial<EntityListQuery>): EntityListQuery => ({
  ...DEFAULT_ENTITY_LIST_QUERY,
  ...partial,
});

describe("the lane vocabulary", () => {
  it("opens every list on All, and All is the first tab wherever it applies", () => {
    expect(DEFAULT_LIST_SCOPE).toEqual({ kind: "all" });
    expect(withStandardLanes(["mine", "orgs", "shared", "public"])).toEqual([
      "all",
      "mine",
      "team",
      "orgs",
      "shared",
      "public",
    ]);
  });

  it("adds no All to a list with one personal lane or none", () => {
    expect(withStandardLanes(["mine"])).toEqual(["mine"]);
    expect(withStandardLanes(["system"])).toEqual(["system"]);
    expect(withStandardLanes(["platform_orgs", "platform_users", "platform_all"])).toEqual([
      "platform_orgs",
      "platform_users",
      "platform_all",
    ]);
  });

  it("a personal lane carries no organization of its own", () => {
    expect(makeScope("orgs", OTHER)).toEqual({ kind: "orgs" });
    expect(makeScope("team", OTHER)).toEqual({ kind: "team" });
    expect(scopeKey(makeScope("orgs", OTHER))).toBe("orgs");
  });
});

describe("p_org_id is the page's organization filter", () => {
  it("is absent under All organizations and the chosen organization otherwise, on every lane", () => {
    for (const kind of ["all", "mine", "team", "orgs", "shared", "public", "system"] as const) {
      expect(listOrgParam(query({ scope: makeScope(kind) }))).toBeUndefined();
      expect(listOrgParam(query({ scope: makeScope(kind), orgId: OTHER }))).toBe(OTHER);
    }
  });

  it("keeps an admin support lane's own narrowing", () => {
    expect(listOrgParam(query({ scope: makeScope("platform_orgs", OTHER) }))).toBe(OTHER);
  });
});

describe("the URL codec", () => {
  it("names the filter ?org_filter= and never ?org=", () => {
    expect(ENTITY_LIST_URL_PARAMS.org).toBe("org_filter");
    const patch = queryToParamPatch(query({ orgId: OTHER }), DEFAULT_ENTITY_LIST_QUERY);
    expect(patch.org_filter).toBe(OTHER);
    expect(Object.keys(patch)).not.toContain("org");
    expect(Object.keys(orgFilterPatch(OTHER))).toEqual(["org_filter"]);
  });

  it("defaults to All organizations: absent in, absent out", () => {
    expect(readQueryFromParams(new URLSearchParams(""), DEFAULT_ENTITY_LIST_QUERY).orgId).toBeNull();
    expect(queryToParamPatch(query({}), DEFAULT_ENTITY_LIST_QUERY).org_filter).toBeNull();
    expect(readOrgFilter(new URLSearchParams(""))).toBeNull();
  });

  it("round-trips one organization", () => {
    const read = readQueryFromParams(
      new URLSearchParams(`org_filter=${OTHER}&scope=mine`),
      DEFAULT_ENTITY_LIST_QUERY,
    );
    expect(read.orgId).toBe(OTHER);
    expect(read.scope).toEqual({ kind: "mine" });
  });

  it("never reads ?org= (the active-organization link param) as the filter", () => {
    const read = readQueryFromParams(new URLSearchParams(`org=${ACTIVE}`), DEFAULT_ENTITY_LIST_QUERY);
    expect(read.orgId).toBeNull();
    expect(readOrgFilter(new URLSearchParams(`org=${ACTIVE}`))).toBeNull();
  });

  it("opens an old ?scope=orgs:<id> link on that organization, as the filter", () => {
    const read = readQueryFromParams(
      new URLSearchParams(`scope=orgs:${OTHER}`),
      DEFAULT_ENTITY_LIST_QUERY,
    );
    expect(read.scope).toEqual({ kind: "orgs" });
    expect(read.orgId).toBe(OTHER);
  });

  it("a filter change is a real history step", () => {
    expect(historyModeFor(query({}), query({ orgId: OTHER }))).toBe("push");
  });
});

describe("choosing an organization filter never touches the active organization", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.history.replaceState(null, "", "/");
  });

  it("starts on All organizations whatever the active organization is, and leaves it alone", async () => {
    const store = makeStore();
    store.dispatch(setOrganization({ id: ACTIVE, name: "Active Co" }));
    const activeBefore = store.getState().appContext.organization_id;
    const dispatched: unknown[] = [];
    const realDispatch = store.dispatch;
    store.dispatch = ((action: unknown) => {
      dispatched.push(action);
      return realDispatch(action as never);
    }) as typeof store.dispatch;

    let seen: string | null | undefined;
    let choose: (orgId: string | null) => void = () => undefined;
    function Host() {
      const [orgId, setOrgId] = useOrgFilterParam();
      seen = orgId;
      choose = setOrgId;
      return null;
    }

    window.history.replaceState(null, "", "/agents/all");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <Provider store={store}>
          <Host />
        </Provider>,
      );
    });

    // All organizations by default — never seeded from the active organization.
    expect(seen).toBeNull();

    await act(async () => choose(OTHER));
    const params = new URLSearchParams(window.location.search);
    expect(seen).toBe(OTHER);
    expect(params.get("org_filter")).toBe(OTHER);
    // `?org=` would make LinkOrganizationWatcher switch the active organization.
    expect(params.has("org")).toBe(false);
    expect(store.getState().appContext.organization_id).toBe(activeBefore);
    expect(dispatched).toEqual([]);

    await act(async () => choose(null));
    expect(seen).toBeNull();
    expect(new URLSearchParams(window.location.search).has("org_filter")).toBe(false);
    expect(store.getState().appContext.organization_id).toBe(activeBefore);
    expect(dispatched).toEqual([]);
  });
});
