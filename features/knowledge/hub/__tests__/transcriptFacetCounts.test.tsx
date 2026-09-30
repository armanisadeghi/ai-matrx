/**
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
  "visibility=organization": 600,
  all: 690,
};
const FACETS = [
  { kind: "kind", value: "transcript", total: 615 },
  { kind: "kind", value: "session", total: 211 },
  { kind: "kind", value: "cleanup", total: 27 },
  { kind: "status", value: "idle", total: 227 },
  { kind: "status", value: "draft", total: 321 },
  { kind: "visibility", value: "organization", total: 700 },
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
jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc: (fn: string, args: Record<string, unknown>) => rpc(fn, args) } }));

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
  expect(count("visibility", "organization")).toBe(LIST_TOTALS["visibility=organization"]);
  // Transcript-only facets (folders, tags) come from the facets read, which agrees for transcripts.
  expect(count("folder", "Calls")).toBe(9);
  expect(state?.facets?.scope?.map((s) => s.value)).toEqual(["mine", "shared", "public"]);
});
