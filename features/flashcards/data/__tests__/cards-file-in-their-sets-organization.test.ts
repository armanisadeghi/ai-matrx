/**
 * A card belongs with its SET (coordinator ruling, 2026-09-25): `addCards`
 * files new cards — and their membership edges — in the set's organization,
 * never the selected one. EditSetView and AddMoreCardsButton called it with
 * no org (or the selected one), so a card added while another organization
 * was picked landed away from its deck.
 */

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: jest.fn(), rpc: jest.fn() },
}));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: { add: jest.fn(async () => ({ ok: true })) },
}));
jest.mock("@/lib/organizations/personalOrg", () => ({
  // Stands in for the SELECTED organization when the caller passes none.
  ensureOrgId: jest.fn(async (explicit?: string) => explicit ?? SELECTED_ORG),
}));

import { supabase } from "@/utils/supabase/client";
import { associationsService } from "@/features/scopes/service/associationsService";
import { resolveChildOrgId } from "@/lib/organizations/childOrganization";
import { fcService } from "../fcService";

const SET_ORG = "org-of-the-deck";
const SELECTED_ORG = "org-selected-in-the-header";

function install() {
  const inserted: Array<Record<string, unknown>> = [];
  const chain: Record<string, jest.Mock> = {};
  for (const m of ["from", "select", "eq", "is"]) chain[m] = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(async () => ({
    data: { organization_id: SET_ORG },
    error: null,
  }));
  chain.insert = jest.fn((rows: Array<Record<string, unknown>>) => {
    inserted.push(...rows);
    return {
      select: async () => ({
        data: rows.map((r, i) => ({ id: `card-${i}`, ...r })),
        error: null,
      }),
    };
  });
  (supabase.schema as jest.Mock).mockReturnValue(chain);
  return inserted;
}

afterEach(() => jest.clearAllMocks());

describe("fcService.addCards files cards in the set's organization", () => {
  it.each([
    ["no org passed (EditSetView)", undefined],
    ["the selected org passed (AddMoreCardsButton)", SELECTED_ORG],
  ])("%s", async (_label, orgId) => {
    const inserted = install();
    const res = await fcService.addCards(
      "set-1",
      [{ front: "What does a periodontal probe measure?", back: "Pocket depth in millimetres" }],
      orgId ? { orgId } : {},
    );
    expect(res.error).toBeNull();
    expect(inserted.map((r) => r.organization_id)).toEqual([SET_ORG]);
    expect(
      (associationsService.add as jest.Mock).mock.calls.map((c) => c[0].orgId),
    ).toEqual([SET_ORG]);
  });
});

describe("resolveChildOrgId — parent first", () => {
  it("the parent's organization wins over the explicit one", () => {
    expect(resolveChildOrgId({ organization_id: SET_ORG }, SELECTED_ORG)).toBe(SET_ORG);
    expect(resolveChildOrgId(SET_ORG, SELECTED_ORG)).toBe(SET_ORG);
  });
  it("the explicit organization applies only when the parent names none", () => {
    expect(resolveChildOrgId({ organization_id: null }, SELECTED_ORG)).toBe(SELECTED_ORG);
    expect(resolveChildOrgId(undefined, undefined)).toBeNull();
  });
});
