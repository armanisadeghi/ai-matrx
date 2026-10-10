/**
 * The organization filter reaches EVERY lane of the Transcripts view (policies/access-ladder.md,
 * "Server contract for list RPCs": p_org_id applies to every lane, counts and facets included). It used to
 * ride only on the "orgs" lane, so "Mine", "Shared" and "Public" ignored the filter while wearing it.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rpc = jest.fn(async (fn: string, _args: Record<string, unknown>): Promise<{ data: unknown; error: null }> => {
  if (fn === "trx_list_facets") return { data: [], error: null };
  if (fn === "trx_list_scoped")
    return { data: [{ id: "r1", kind: "transcript", title: "T", total_count: 7, tags: [] }], error: null };
  return { data: [], error: null };
});
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => jest.requireActual("@/lib/entity-list/testing/pagedRpcDouble").asPagedRpc(rpc(fn, args)),
    // Facet and count reads go through `platform.list_rpc_once` (one request, every row); the double
    // unwraps it so the assertions below still see the list function and its arguments.
    schema: () => ({
      rpc: (_once: string, wrapped: { p_fn: string; p_args: Record<string, unknown> }) => rpc(wrapped.p_fn, wrapped.p_args),
    }),
  },
}));

import { useTranscriptList } from "@/features/knowledge/hub/transcripts/useTranscriptList";
import type { TranscriptFacetSelection } from "@/features/knowledge/hub/transcripts/transcriptRows";
import { transcriptOrgCounter } from "@/features/knowledge/hub/hooks/useHubOrgCounts";

let root: Root;
let host: HTMLDivElement;
function Probe({ orgId, selection }: { orgId: string | null; selection: TranscriptFacetSelection }) {
  useTranscriptList({ enabled: true, text: "", selection, orgId, sort: "updated" });
  return null;
}
beforeEach(() => {
  rpc.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function mountWith(orgId: string | null, selection: TranscriptFacetSelection) {
  await act(async () => root.render(<Probe orgId={orgId} selection={selection} />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe.each([["orgs", {}], ["mine", { scope: ["mine"] }], ["shared", { scope: ["shared"] }], ["public", { scope: ["public"] }]] as const)(
  "the %s lane",
  (scope, selection) => {
    it("sends the page's organization filter on the rows and on the facet values", async () => {
      await mountWith("org-acme", selection as TranscriptFacetSelection);
      const list = rpc.mock.calls.filter(([fn, a]) => fn === "trx_list_scoped" && a.p_scope === scope);
      const facets = rpc.mock.calls.filter(([fn]) => fn === "trx_list_facets");
      expect(list.length).toBeGreaterThan(0);
      expect(facets.length).toBe(1);
      for (const [, a] of [...list, ...facets]) expect(a.p_org_id).toBe("org-acme");
    });

    it("sends no organization when the filter is All organizations", async () => {
      await mountWith(null, selection as TranscriptFacetSelection);
      const all = rpc.mock.calls.filter(([fn]) => fn === "trx_list_scoped" || fn === "trx_list_facets");
      expect(all.length).toBeGreaterThan(0);
      for (const [, a] of all) expect(a.p_org_id).toBeUndefined();
    });
  },
);

it("the Scope counts (Mine / Shared / Public) are asked inside the same organization", async () => {
  await mountWith("org-acme", {});
  const scopeAsks = rpc.mock.calls.filter(
    ([fn, a]) => fn === "trx_list_scoped" && a.p_limit === 1 && ["mine", "shared", "public"].includes(a.p_scope as string),
  );
  expect(scopeAsks.map(([, a]) => a.p_scope).sort()).toEqual(["mine", "public", "shared"]);
  for (const [, a] of scopeAsks) expect(a.p_org_id).toBe("org-acme");
});

it("per-organization counts are ONE read of the list's own count grouped by organization (never one heavy read per organization)", async () => {
  rpc.mockImplementationOnce(async () => ({
    data: [
      { scope: "orgs", narrow_id: null, label: null, total: 9 },
      { scope: "orgs", narrow_id: "org-acme", label: "Acme", total: 7 },
      { scope: "orgs", narrow_id: "org-globex", label: "Globex", total: 2 },
      { scope: "team", narrow_id: "org-acme", label: "Acme", total: 5 },
    ],
    error: null,
  }));
  const counts = await transcriptOrgCounter({
    scope: "orgs",
    search: "",
    filters: { status: { values: ["idle"] } },
  })(["org-acme", "org-globex", "org-initech"]);
  expect(counts.get("org-acme")).toBe(7);
  expect(counts.get("org-globex")).toBe(2);
  // An organization the read did not return has NO number — never a confident 0.
  expect(counts.has("org-initech")).toBe(false);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls[0][0]).toBe("trx_list_scope_counts");
  expect(rpc.mock.calls[0][1]).toMatchObject({ p_filters: { status: { values: ["idle"] } } });
});

it("another lane or a text search has no per-organization numbers, and asks nothing", async () => {
  expect((await transcriptOrgCounter({ scope: "mine", search: "", filters: {} })([])).size).toBe(0);
  expect((await transcriptOrgCounter({ scope: "orgs", search: "budget", filters: {} })([])).size).toBe(0);
  expect(rpc).not.toHaveBeenCalled();
});
