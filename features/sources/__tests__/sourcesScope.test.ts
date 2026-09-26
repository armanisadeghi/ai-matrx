/**
 * Arman's ruling (2026-09-26): a Source is organization data; there is no
 * per-Source privacy choice. "Mine" is only "captured by me"; the organization
 * view lists every Source in the organization — never filtered by visibility —
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
});
