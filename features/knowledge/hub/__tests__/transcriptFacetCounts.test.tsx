import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * (Round 5) The facets read now runs as the caller (aidream migration 20260930120000), so its
 * counts ARE the list's totals — the hub no longer re-asks the list per value. Below, the double
 * is the post-fix server; the migration test pins the cause (definer vs invoker).
 *
 * A facet count must equal what choosing it returns. The server's facet read
 * (trx_list_facets) counted recording sessions the list itself never returns
 * (measured 2026-09-29: Session 211 vs 53, Idle 227 vs 70). The hub now asks
 * the list for the session-bearing facets' totals. The double below is the
 * measured disagreement: a facets read that overcounts sessions, and a list
 * whose total per filter is the truth.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIST_TOTALS: Record<string, number> = {
  "kind=transcript": 615,
  "kind=session": 53,
  "kind=cleanup": 22,
  "status=idle": 70,
  "status=draft": 321,
  "shown_to=organization": 600,
  all: 690,
};
const FACETS = [
  { kind: "kind", value: "transcript", total: 615 },
  { kind: "kind", value: "session", total: 53 },
  { kind: "kind", value: "cleanup", total: 22 },
  { kind: "status", value: "idle", total: 70 },
  { kind: "status", value: "draft", total: 321 },
  { kind: "shown_to", value: "organization", total: 600 },
  { kind: "folder_name", value: "Calls", total: 9 },
];
const rpc = jest.fn(async (fn: string, args: Record<string, unknown>) => {
  if (fn === "trx_list_facets") return { data: FACETS, error: null };
  if (fn === "trx_list_scoped") {
    const filters = (args.p_filters ?? {}) as Record<string, { values: string[] }>;
    const [key] = Object.keys(filters);
    const total = key ? (LIST_TOTALS[`${key}=${filters[key].values[0]}`] ?? 0) : args.p_scope === "orgs" ? LIST_TOTALS.all : 5;
    return { data: [{ id: "r1", kind: "transcript", title: "T", total_count: total, tags: [] }], error: null };
  }
  return { data: [], error: null };
});
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => jest.requireActual("@/lib/entity-list/testing/pagedRpcDouble").asPagedRpc(rpc(fn, args)),
    // Facet and count reads go through `platform.list_rpc_once` (one request, every row); the double
    // unwraps it so the assertions still see the list function and its arguments.
    schema: () => ({
      rpc: (_once: string, wrapped: { p_fn: string; p_args: Record<string, unknown> }) => rpc(wrapped.p_fn, wrapped.p_args),
    }),
  },
}));

import { useTranscriptList, type TranscriptListState } from "@/features/knowledge/hub/transcripts/useTranscriptList";

let root: Root;
let host: HTMLDivElement;
let state: TranscriptListState | null = null;
function Probe() {
  state = useTranscriptList({ enabled: true, text: "", selection: {}, orgId: null, sort: "updated" });
  return null;
}
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("every count a person can pick equals the total the list returns for it", async () => {
  await act(async () => root.render(<Probe />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  const count = (facet: "kind" | "status" | "visibility" | "folder", value: string) =>
    state?.facets?.[facet]?.find((v) => v.value === value)?.count;
  expect(count("kind", "session")).toBe(LIST_TOTALS["kind=session"]);
  expect(count("kind", "cleanup")).toBe(LIST_TOTALS["kind=cleanup"]);
  expect(count("kind", "transcript")).toBe(LIST_TOTALS["kind=transcript"]);
  expect(count("status", "idle")).toBe(LIST_TOTALS["status=idle"]);
  expect(count("visibility", "organization")).toBe(LIST_TOTALS["shown_to=organization"]);
  // Transcript-only facets (folders, tags) come from the facets read, which agrees for transcripts.
  expect(count("folder", "Calls")).toBe(9);
  expect(state?.facets?.scope?.map((s) => s.value)).toEqual(["mine", "shared", "public"]);
});

it("the facets read is the list's own count: no per-value recount, only the three Scope asks", async () => {
  rpc.mockClear();
  await act(async () => root.render(<Probe />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  const scoped = rpc.mock.calls.filter(([fn]) => fn === "trx_list_scoped");
  // 1 list page (+ 3 scope counts); a per-value recount would add one call per facet value.
  expect(scoped.length).toBeLessThanOrEqual(4);
});

it("the migration that fixed the 211-vs-53 disagreement makes the facets run as the caller", () => {
  const file = path.resolve(
    __dirname,
    "../../../../../aidream/db/migrations/20260930120000_trx_list_facets_counts_what_the_list_shows.sql",
  );
  let sql: string;
  try {
    sql = readFileSync(file, "utf8");
  } catch {
    return; // the sibling repo is not checked out here
  }
  expect(sql).toMatch(/alter function public\.trx_list_facets\(text, uuid, text, boolean\) security invoker/i);
});
