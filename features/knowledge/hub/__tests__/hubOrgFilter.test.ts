/**
 * The hub's organization filter (Arman 2026-09-30, policies/active-org-is-never-a-list-filter.md):
 * a fresh load sends no org filter; `?org_filter=<id>` narrows every section and count through the one
 * query the runner receives; the header's active organization never reaches a read.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { hubHref, hubStateFromParams, hubStateToParams, normalizeQuery, orgFilterOf } from "../hubState";

describe("hub organization filter", () => {
  it("a fresh load carries no organization filter (All organizations)", () => {
    const s = hubStateFromParams(new URLSearchParams(""));
    expect(s.query.organizations).toBeUndefined();
    expect(orgFilterOf(s.query)).toBeNull();
    expect(hubStateToParams(s).toString()).toBe("");
  });

  it("?org_filter=<id> becomes the query's organizations and round-trips as ?org_filter=", () => {
    const s = hubStateFromParams(new URLSearchParams("org_filter=org-1"));
    expect(s.query.organizations).toEqual(["org-1"]);
    expect(orgFilterOf(s.query)).toBe("org-1");
    expect(hubHref(s)).toBe("/knowledge/hub?org_filter=org-1");
    expect(hubHref(s)).not.toMatch(/[?&]orgs?=/);
  });

  it("the retired 'active' word is dropped from links and saved views, never resolved", () => {
    expect(hubStateFromParams(new URLSearchParams("org_filter=active")).query.organizations).toBeUndefined();
    expect(normalizeQuery({ mode: "find", organizations: ["active", "org-2"] }).organizations).toEqual(["org-2"]);
    expect(hubStateFromParams(new URLSearchParams("orgs=active")).query.organizations).toBeUndefined();
  });

  it("no hub read resolves the header's active organization", () => {
    const page = readFileSync(join(__dirname, "../components/KnowledgeHubPage.tsx"), "utf8");
    const state = readFileSync(join(__dirname, "../hubState.ts"), "utf8");
    expect(state).not.toMatch(/resolveOrganizationReach|ACTIVE_ORGANIZATION/);
    // The active org may only feed writes (ensureOrgId / dialogs), never the query.
    expect(page).not.toMatch(/resolveOrganizationReach|organizationReachOf/);
    expect(page).toMatch(/const effectiveQuery = presetPending && presetDef \? mergePresetQuery\(presetDef\.query, state\.query\) : state\.query;/);
  });
});
