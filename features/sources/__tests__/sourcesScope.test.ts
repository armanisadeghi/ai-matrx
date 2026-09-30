/**
 * Arman's ruling (2026-09-26): a Source is organization data; there is no
 * per-Source privacy choice. "Mine" is only "captured by me"; the organization
 * view lists every Source in the organization — never filtered by who sees it —
 * and no row calls a Source "Personal".
 */
import { applySourcesScope } from "@/features/sources/sourceRows";

function recorder() {
  const calls: string[] = [];
  const q = {
    eq: (c: string, v: string) => (calls.push(`eq ${c}=${v}`), q),
    neq: (c: string, v: string) => (calls.push(`neq ${c}=${v}`), q),
  };
  return { q, calls };
}

describe("the Sources scope is who captured it, never privacy", () => {
  it("captured by me filters by creator only", () => {
    const { q, calls } = recorder();
    applySourcesScope(q, { kind: "mine" }, "me");
    expect(calls).toEqual(["eq created_by=me"]);
  });

  it("the organization view lists every Source in it", () => {
    const { q, calls } = recorder();
    applySourcesScope(q, { kind: "orgs", organizationId: "org-1" }, "me");
    expect(calls).toEqual(["eq organization_id=org-1"]);
  });

  it("with no organization filter the organization view spans every organization", () => {
    const { q, calls } = recorder();
    applySourcesScope(q, { kind: "orgs", organizationId: null }, "me");
    expect(calls).toEqual([]);
  });

  it("the organization filter narrows the captured-by-me lane too", () => {
    const { q, calls } = recorder();
    applySourcesScope(q, { kind: "mine", organizationId: "org-1" }, "me");
    expect(calls).toEqual(["eq created_by=me", "eq organization_id=org-1"]);
  });
});
