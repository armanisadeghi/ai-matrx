/**
 * An organization list never shows a coworker's Only-me row (access ladder T-11 leak fixes,
 * 2026-09-28). The notes sidebar used `scopeToOwner`, whose "no" applied NO filter, and listed 54
 * of a coworker's Only-me notes to test@test.com. `defaultListFilter` must always narrow an
 * organization list through Shown to; this test fails against the old yes/no door (no `.or`).
 */
const rpc = jest.fn();
const registryRows = [
  { token: "note", default_list_scope: "organization" },
  { token: "task", default_list_scope: "mine" },
];
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      rpc: (...args: unknown[]) => rpc(...args),
      from: () => ({ select: async () => ({ data: registryRows, error: null }) }),
    }),
  },
}));

import { defaultListFilter, resetListScopeCache } from "../index";
import { shownToMyOrgsFilter, type ShownToContext } from "../shownTo";

const ME = "11111111-1111-4111-8111-111111111111";
const MATE = "22222222-2222-4222-8222-222222222222";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

class FakeQuery {
  calls: Array<[string, string, string?]> = [];
  eq(column: string, value: string) {
    this.calls.push(["eq", column, value]);
    return this;
  }
  or(filters: string) {
    this.calls.push(["or", filters]);
    return this;
  }
}

describe("shownToMyOrgsFilter", () => {
  const ctx: ShownToContext = {
    [ORG_A]: { d: "everyone", t: [ME, MATE] },
    [ORG_B]: { d: "only_me", t: [ME] },
  };

  it("never lets an unset personal row or an only_me row through inside my organizations", () => {
    const f = shownToMyOrgsFilter(ctx, ME)!;
    expect(f).toContain(`created_by.eq.${ME}`);
    expect(f).toContain("shown_to.in.(everyone,everyone_on_ai_matrx)");
    expect(f).toContain(`and(organization_id.eq.${ORG_A},shown_to.eq.my_team,created_by.in.(${MATE}))`);
    // Only ORG_A shows unset rows by default, and never a legacy personal (= Only me) row.
    expect(f).toContain(`and(organization_id.in.(${ORG_A}),shown_to.is.null)`);
    expect(f).not.toContain("only_me");
    // Rows outside my organizations reached me by a share and stay.
    expect(f).toContain(`organization_id.not.in.(${ORG_A},${ORG_B})`);
  });

  it("has nothing to add for a person in no organization", () => {
    expect(shownToMyOrgsFilter({}, ME)).toBeNull();
  });
});

describe("defaultListFilter", () => {
  beforeEach(() => {
    resetListScopeCache();
    rpc.mockReset();
  });

  it("an organization list is narrowed by Shown to — never left unfiltered", async () => {
    rpc.mockResolvedValue({ data: { [ORG_A]: { d: "everyone", t: [ME] } }, error: null });
    const scope = await defaultListFilter("note", { userId: ME });
    const q = scope.apply(new FakeQuery());
    expect(scope.ownerOnly).toBe(false);
    expect(rpc).toHaveBeenCalledWith("shown_to_context", { p_token: "note" });
    expect(q.calls).toHaveLength(1);
    expect(q.calls[0][0]).toBe("or");
    expect(q.calls[0][1]).toContain("shown_to.is.null");
    expect(q.calls[0][1]).not.toContain("neq.personal");
  });

  it("a mine list is the owner filter, with the owner column the caller names", async () => {
    const scope = await defaultListFilter("task", { userId: ME, ownerColumn: "user_id" });
    expect(scope.apply(new FakeQuery()).calls).toEqual([["eq", "user_id", ME]]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a scope the person clicked wins over the registry", async () => {
    const scope = await defaultListFilter("note", { userId: ME, requested: "mine" });
    expect(scope.ownerOnly).toBe(true);
  });

  it("a failed Shown-to read throws instead of listing wider", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(defaultListFilter("note", { userId: ME })).rejects.toThrow(/Shown to|shown to/i);
  });
});
