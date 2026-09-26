/**
 * The non-admin mandate suite's pure seams: which seat asks the database what
 * (scope args), reading its answer back, which tabs each seat gets, who may
 * remove or share, where Back may return, and what the create door sends.
 * Real mandate keys from the platform corpus.
 */
import { DEFAULT_ENTITY_LIST_QUERY, type EntityListQuery } from "@/lib/entity-list/types";

jest.mock("@/utils/supabase/client", () => ({ supabase: {}, createClient: () => ({}) }));
jest.mock("@/lib/api/call-api", () => ({ callApi: jest.fn() }));

import { memberCountsFromAnswer, memberScopeArgs } from "../service";
import { memberRowFromWire, type MandateMemberWireRow } from "../rpc";
import { canRemoveMemberRow, canShareMemberRow, memberMandateListConfig } from "../listConfig";
import { memberMandateRecordHref, newSoftMandateHref } from "../routes";
import {
  parseRecordTabFrom,
  recordTabsForLevel,
  tabRowOf,
} from "@/features/mandates/record-next/record-tabs";
import { isMandateListPath } from "@/features/mandates/record-next/useRecordBackHref";
import { softMandateBody } from "@/features/mandates/authoring-level/service";
import { levelDraftKey } from "@/features/mandates/authoring-level/level-draft";

const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const ACTIVE = "8cb71c8b-5b49-4563-a5fe-d77ff600f8ee";

function query(partial: Partial<EntityListQuery>): EntityListQuery {
  return { ...DEFAULT_ENTITY_LIST_QUERY, ...partial };
}

const wire: MandateMemberWireRow = {
  id: "6d6173ee-3807-4a99-9fb7-6b14abbb459a",
  mandate_key: "agent_apps.auto_create",
  name: "Agent Apps — Auto Create",
  feature_label: "Agent Apps",
  goal: "Builds a complete Prompt App (UI code) from the app's prompt object.",
  created_by_me: null,
  organization_id: "39c38960-d30c-4840-b0c1-c9960de95582",
  is_system: true,
  home_label: "System",
  holder_type: "agent",
  holder_id: "4b9563db-7a95-476d-b2c7-b76385d35e9c",
  holder_name: "Prompt UI Builder",
  decided_by: "Default",
  decided_rung: "system",
  pin_text: "Latest",
  customized_by: ["Default"],
  health: "OK",
  origin: "code",
  visibility: "public",
  is_enabled: true,
  updated_at: "2026-08-30T01:39:24.148361+00:00",
  created_at: "2026-08-22T18:09:55.254163+00:00",
};

describe("member list scope args", () => {
  it("person seat resolves in the active org and narrows My Orgs by the chosen org", () => {
    const args = memberScopeArgs(
      query({ scope: { kind: "orgs", organizationId: ORG }, search: "  seo " }),
      { level: "person", resolveOrgId: ACTIVE },
    );
    expect(args).toMatchObject({
      p_level: "person",
      p_scope: "orgs",
      p_org_id: ORG,
      p_resolve_org_id: ACTIVE,
      p_search: "seo",
    });
  });

  it("organization seat always names the route org and never a personal resolution", () => {
    const args = memberScopeArgs(query({ scope: { kind: "system" } }), {
      level: "organization",
      organizationId: ORG,
      resolveOrgId: ACTIVE,
    });
    expect(args.p_org_id).toBe(ORG);
    expect(args.p_resolve_org_id).toBeUndefined();
  });

  it("organization seat never sends a scope its database door refuses", () => {
    const args = memberScopeArgs(query({ scope: { kind: "mine" } }), {
      level: "organization",
      organizationId: ORG,
    });
    expect(args.p_scope).toBe("orgs");
  });

  it("organization counts carry no Mine or Shared tab", () => {
    const counts = memberCountsFromAnswer(
      { mine: 4, shared: 1, orgs: 2, public: 7, system: 469, orgs_narrow: [] },
      "organization",
    );
    expect(counts.byKind).toEqual({ orgs: 2, public: 7, system: 469 });
  });

  it("person counts carry every lane: mine, shared, organizations, public, system", () => {
    const counts = memberCountsFromAnswer(
      { mine: 4, shared: 1, orgs: 2, public: 7, system: 469, orgs_narrow: [] },
      "person",
    );
    expect(counts.byKind).toEqual({ mine: 4, shared: 1, orgs: 2, public: 7, system: 469 });
  });

  it("the published (community) lane reaches the organization seat's door by name", () => {
    const args = memberScopeArgs(query({ scope: { kind: "public" } }), {
      level: "organization",
      organizationId: ORG,
    });
    expect(args.p_scope).toBe("public");
  });

  it("the person seat asks for Shared by name", () => {
    const args = memberScopeArgs(query({ scope: { kind: "shared" } }), { level: "person" });
    expect(args.p_scope).toBe("shared");
    expect(args.p_org_id).toBeUndefined();
  });
});

describe("reading the database row", () => {
  it("a mandate with no creator is not mine", () => {
    const row = memberRowFromWire(wire);
    expect(row.createdByMe).toBe(false);
    expect(row.decidedRung).toBe("system");
    expect(row.origin).toBe("code");
  });
});

describe("who may remove", () => {
  const mine = { ...memberRowFromWire(wire), origin: "soft" as const, isSystem: false, createdByMe: true };
  it("a person removes only their own soft mandate", () => {
    expect(canRemoveMemberRow(mine, { level: "person", onChanged: () => {} })).toBe(true);
    expect(
      canRemoveMemberRow(memberRowFromWire(wire), { level: "person", onChanged: () => {} }),
    ).toBe(false);
  });
  it("an org member cannot remove; an org manager removes the org's own", () => {
    const orgRow = { ...mine, createdByMe: false, organizationId: ORG };
    expect(canRemoveMemberRow(orgRow, { level: "organization", orgId: ORG, onChanged: () => {} })).toBe(false);
    expect(
      canRemoveMemberRow(orgRow, { level: "organization", orgId: ORG, canManageOrg: true, onChanged: () => {} }),
    ).toBe(true);
  });
});

describe("who may share, and the lane order", () => {
  const mine = { ...memberRowFromWire(wire), origin: "soft" as const, isSystem: false, createdByMe: true };
  it("the creator shares their own soft mandate — on any seat; nobody shares a system or code mandate", () => {
    expect(canShareMemberRow(mine)).toBe(true);
    expect(canShareMemberRow({ ...mine, organizationId: ORG })).toBe(true);
    expect(canShareMemberRow({ ...mine, createdByMe: false })).toBe(false);
    expect(canShareMemberRow(memberRowFromWire(wire))).toBe(false);
  });
  it("lanes read mine · orgs · shared · public (+ system), the agents and workflows order", () => {
    expect(memberMandateListConfig({ level: "person", onChanged: () => {} }).scopes).toEqual([
      "mine",
      "orgs",
      "shared",
      "public",
      "system",
    ]);
  });
});

describe("record tabs per seat", () => {
  const ids = (level: "system" | "person" | "organization", readOnly = false) =>
    recordTabsForLevel(level, { readOnly }).map((t) => t.id);
  it("admin-only tabs are absent on member seats", () => {
    for (const id of ["source", "diagnostics"]) {
      expect(ids("system")).toContain(id);
      expect(ids("person")).not.toContain(id);
      expect(ids("organization")).not.toContain(id);
    }
  });
  it("every seat can test at its own level (MANDATE-SYSTEM.md §2)", () => {
    expect(ids("system")).toContain("test");
    expect(ids("person")).toContain("test");
    expect(ids("organization")).toContain("test");
    expect(ids("organization", true)).toContain("test");
  });
  it("a member seat has ONE Overrides tab — the simple one, named plainly", () => {
    for (const level of ["person", "organization"] as const) {
      const tabs = recordTabsForLevel(level);
      expect(tabs.map((t) => t.id)).not.toContain("overrides");
      expect(tabs.find((t) => t.id === "overrides-simple")?.label).toBe("Overrides");
      expect(tabs.map((t) => t.label)).not.toContain("Overrides (simple)");
      expect(parseRecordTabFrom("overrides", tabs)).toBe("overrides-simple");
    }
    expect(ids("system")).toEqual(expect.arrayContaining(["overrides", "overrides-simple"]));
  });
  it("New agent is a header action, never a tab in the row", () => {
    for (const level of ["system", "person", "organization"] as const) {
      const tabs = recordTabsForLevel(level);
      expect(tabs.map((t) => t.id)).toContain("create-agent");
      expect(tabRowOf(tabs).map((t) => t.id)).not.toContain("create-agent");
    }
  });
  it("a read-only org member sees definition, binding, test and notes only", () => {
    expect(ids("organization", true)).toEqual(["definition", "holder", "test", "notes"]);
  });
});

describe("routes and Back", () => {
  it("each seat's record and create hrefs", () => {
    expect(memberMandateRecordHref("person", "agent_apps.auto_create")).toBe(
      "/mandates/record-preview/agent_apps.auto_create",
    );
    expect(memberMandateRecordHref("organization", "agent_apps.auto_create", ORG, "holder")).toBe(
      `/organizations/${ORG}/mandates/agent_apps.auto_create?tab=holder`,
    );
    expect(newSoftMandateHref("organization", ORG)).toBe(`/organizations/${ORG}/mandates/new`);
    expect(newSoftMandateHref("person")).toBe("/mandates/new-preview");
  });
  it("Back may return to every mandate list, and nothing else", () => {
    expect(isMandateListPath("/mandates/list-preview")).toBe(true);
    expect(isMandateListPath(`/organizations/${ORG}/mandates`)).toBe(true);
    expect(isMandateListPath(`/organizations/${ORG}/mandates/new`)).toBe(false);
    expect(isMandateListPath("/agents")).toBe(false);
  });
});

describe("create door", () => {
  it("never puts an organization in the body (the request context carries it)", () => {
    const body = softMandateBody({
      level: "organization",
      organizationId: ORG,
      mandateKey: " crm.follow_up_writer ",
      label: "Follow-up writer",
      goal: "Write the follow-up email after a discovery call.",
      draftInputs: [{ description: "The call notes" }, { description: " " }],
    });
    expect(body).toEqual({
      level: "organization",
      mandate_key: "crm.follow_up_writer",
      label: "Follow-up writer",
      goal: "Write the follow-up email after a discovery call.",
      draft_inputs: [{ description: "The call notes" }],
    });
  });
  it("drafts are kept per seat", () => {
    expect(levelDraftKey("person")).not.toBe(levelDraftKey("organization", ORG));
  });
});
