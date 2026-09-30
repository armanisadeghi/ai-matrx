/**
 * Arman's ruling (2026-09-26): a Source is organization data; there is no
 * per-Source privacy choice. The lanes are the shell's words (All / Mine / My team / My Orgs),
 * answered as who captured it — never as privacy — and no row calls a Source "Personal".
 */
import {
  applySourcesScope,
  sourcesScopeIsEmpty,
} from "@/features/sources/sourceRows";

function recorder() {
  const calls: string[] = [];
  const q = {
    eq: (c: string, v: string) => (calls.push(`eq ${c}=${v}`), q),
    neq: (c: string, v: string) => (calls.push(`neq ${c}=${v}`), q),
    or: (f: string) => (calls.push(`or ${f}`), q),
  };
  return { q, calls };
}

describe("the Sources lanes are who captured it, never privacy", () => {
  it("All is every Source row security lets me read: no lane predicate", () => {
    const { q, calls } = recorder();
    applySourcesScope(q, { kind: "all" }, "me");
    expect(calls).toEqual([]);
  });

  it("Mine filters by creator only", () => {
    const { q, calls } = recorder();
    applySourcesScope(q, { kind: "mine" }, "me");
    expect(calls).toEqual(["eq created_by=me"]);
  });

  it("My Orgs is what someone else captured", () => {
    const { q, calls } = recorder();
    applySourcesScope(q, { kind: "orgs", organizationId: "org-1" }, "me");
    expect(calls).toEqual(["neq created_by=me", "eq organization_id=org-1"]);
  });

  it("with no organization filter My Orgs spans every organization", () => {
    const { q, calls } = recorder();
    applySourcesScope(q, { kind: "orgs", organizationId: null }, "me");
    expect(calls).toEqual(["neq created_by=me"]);
  });

  it("My team is the team reach, and a person on no team reads nothing", () => {
    const { q, calls } = recorder();
    const filter = "and(organization_id.eq.o1,created_by.in.(me,you))";
    applySourcesScope(q, { kind: "team", teamFilter: filter }, "me");
    expect(calls).toEqual([`or ${filter}`]);
    expect(sourcesScopeIsEmpty({ kind: "team", teamFilter: null })).toBe(true);
    expect(sourcesScopeIsEmpty({ kind: "team", teamFilter: filter })).toBe(false);
    expect(sourcesScopeIsEmpty({ kind: "all" })).toBe(false);
  });

  it("the organization filter narrows every lane", () => {
    const { q, calls } = recorder();
    applySourcesScope(q, { kind: "mine", organizationId: "org-1" }, "me");
    expect(calls).toEqual(["eq created_by=me", "eq organization_id=org-1"]);
  });
});
