/**
 * The rank-grid screen, through the REAL `useToolAction` and screen-run client
 * (only the HTTP call `requestRaw` is faked, and the Leaflet canvas is a list):
 *  - finding the business asks for a stored search first (free probe) and only
 *    a click buys one, at the live definition's price;
 *  - the preview is free, shows the grid's points, and names the matched
 *    storefront; nothing is spent until "Run grid" is clicked, and the run
 *    carries the center the preview returned;
 *  - the result draws one bubble per point coloured by rank, "not found" read
 *    against the result count, us against the top winners, and "Reused from".
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/dynamic", () => () => {
  const Dyn = (props: Record<string, unknown>) => {
    const Canvas = jest.requireMock("@/components/mardown-display/blocks/map/MapCanvas").default;
    return <Canvas {...props} />;
  };
  return Dyn;
});
jest.mock("@/components/mardown-display/blocks/map/MapCanvas", () => ({
  __esModule: true,
  default: ({ markers }: { markers: { label?: string; bubble?: { text: string; className: string } }[] }) => (
    <ul data-testid="markers">
      {markers.map((m, i) => (
        <li key={i} data-bubble={m.bubble?.text ?? "pin"} data-class={m.bubble?.className ?? ""}>
          {m.label}
        </li>
      ))}
    </ul>
  ),
}));
jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: ({
    data,
    columns,
    urlState,
  }: {
    data: Record<string, unknown>[];
    columns: { accessorKey?: string; id?: string; cell?: (r: unknown) => React.ReactNode }[];
    urlState: { id: string };
  }) => (
    <table data-testid={urlState.id}>
      <tbody>
        {data.map((row, i) => (
          <tr key={i}>
            {columns.map((c, j) => (
              <td key={j}>{c.cell ? c.cell(row) : String(row[c.accessorKey ?? ""] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));
jest.mock("@/utils/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["schema", "from", "select", "eq", "is"]) chain[m] = () => chain;
  chain.maybeSingle = async () => ({
    data: {
      parameters: {
        $variants: {
          find_business: { description: "Paid — about $0.04 per call; reuses a result up to 7 days old for free." },
        },
      },
    },
    error: null,
  });
  return { supabase: chain };
});

const requestRaw = jest.fn();
jest.mock("@ai-matrx/chat/host/server/python-client", () => ({
  requestRaw: (...args: unknown[]) => requestRaw(...args),
}));

import { RankGrid } from "../RankGridWorkspace";
import live from "./fixtures-live-orthodontist-5x5.json";
import type { BusinessLocation } from "@/features/marketing/types";

// Platform cost reaches the screen in the viewer's unit (points); pin the rate.
jest.mock("@/components/cost/pointsRate.client", () => ({ usePointsRate: () => 10000 }));

type Call = { tool_name: string; arguments: Record<string, unknown> };
const calls = (): Call[] => requestRaw.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body));
const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const ok = (output: unknown) => reply({ call_id: "c", tool_name: "seo_local", status: "ok", output, error: null, approval: null });
const refused = (type: string, message: string) =>
  reply({ call_id: "c", tool_name: "seo_local", status: "error", output: null, approval: null, error: { error_type: type, message, suggested_action: null } });
const env = (data: unknown, cost: Record<string, unknown>, evidence: unknown[] = [], notices: string[] = []) => ({
  __kind: "seo.tool_envelope",
  status: "ok",
  data,
  cost,
  evidence,
  notices,
});

const LOCATION = {
  id: "loc-1",
  brand_id: "brand-1",
  organization_id: "org-1",
  name: "Bayside Orthodontics",
  latitude: 33.6189,
  longitude: -117.9298,
  locality: "Newport Beach",
  region: "CA",
  postal_code: null,
} as unknown as BusinessLocation;

const CANDIDATE = {
  name: "Bayside Orthodontics",
  cid: "111",
  place_id: "p-1",
  category: "Orthodontist",
  rating: 4.9,
  review_count: 210,
  claimed: true,
  url: null,
  address: "1 Bay St, Newport Beach",
  lat: 33.619,
  lng: -117.93,
  distance_km: 0.1,
};
const FOUND = {
  query: "Bayside Orthodontics",
  near: { label: "33.6189,-117.9298", lat: 33.6189, lng: -117.9298, source: "coordinate" },
  count: 1,
  complete: true,
  candidates: [CANDIDATE],
};
const POINTS = Array.from({ length: 9 }, (_, i) => ({ row: Math.floor(i / 3), col: i % 3, lat: 33.6 + i / 100, lng: -117.9 }));
const PREVIEW = {
  preview: true,
  center: { latitude: 33.619, longitude: -117.93, source: "argument" },
  center_confirmed_value: "33.619,-117.93",
  matched_business: { name: "Bayside Orthodontics", cid: "111", place_id: "p-1", address: "1 Bay St", lat: 33.619, lng: -117.93 },
  center_to_listing_km: 0,
  keyword: "orthodontist",
  grid_size: 3,
  spacing_km: 1,
  zoom: 14,
  depth: 20,
  device: "mobile",
  points: POINTS,
  estimate_usd: 0.018,
  reused_points: 0,
  always_asks_approval: false,
};
const W = { name: "Winner Braces", cid: "w" };
const RESULT_POINTS = [
  { rank: 1, results_count: 20, top_result: { name: "Bayside Orthodontics", cid: "111" } },
  { rank: 5, results_count: 20, top_result: W },
  { rank: 12, results_count: 20, top_result: W },
  { rank: null, results_count: 20, top_result: W, not_found_reading: "outranked" },
  { rank: null, results_count: 3, top_result: { name: "Small Smiles", cid: "s" }, not_found_reading: "sparse" },
  { rank: null, results_count: 0, top_result: null, not_found_reading: "no_results" },
  { rank: null, results_count: null, top_result: null, error: "failed: timeout; may still be charged" },
  { rank: 2, results_count: 20, top_result: { name: "Third Ortho", cid: "t" } },
  { rank: 3, results_count: 20, top_result: { name: "Fourth Ortho", cid: "f" } },
].map((p, i) => ({ ...POINTS[i], run_id: `r${i}`, ...p }));
const RESULT = {
  keyword: "orthodontist",
  grid_size: 3,
  spacing_km: 1,
  zoom: 14,
  depth: 20,
  device: "mobile",
  center: PREVIEW.center,
  matched_business: PREVIEW.matched_business,
  summary: { points_found: 5, points_searched: 9, points_failed: 1, points_pending: 0, avg_rank: 4.6, top3: 3, top10: 4 },
  grid_text: "",
  points: RESULT_POINTS,
  points_top_omitted: false,
  competitors: [
    { name: "Winner Braces", cid: "w", points_won: 3, points_present: 6, points_searched: 8, coverage: 0.75, avg_rank: 1.67, best_rank: 1 },
    { name: "Third Ortho", cid: "t", points_won: 1, points_present: 4, points_searched: 8, coverage: 0.5, avg_rank: 3.25, best_rank: 1 },
    { name: "Fourth Ortho", cid: "f", points_won: 1, points_present: 2, points_searched: 8, coverage: 0.25, avg_rank: 4, best_rank: 1 },
    { name: "Small Smiles", cid: "s", points_won: 1, points_present: 1, points_searched: 8, coverage: 0.13, avg_rank: 1, best_rank: 1 },
  ],
};

let root: Root;
let host: HTMLDivElement;
async function settle(n = 6) {
  for (let i = 0; i < n; i++) await act(async () => { await Promise.resolve(); });
}
async function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RankGrid location={LOCATION} />
      </QueryClientProvider>,
    );
  });
  await settle();
}
const text = () => host.textContent ?? "";
const button = (label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;
const field = (label: string) => host.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
async function click(label: string) {
  const b = button(label);
  if (!b) throw new Error(`no button "${label}" in: ${text()}`);
  await act(async () => { b.click(); });
  await settle();
}
async function type(label: string, value: string) {
  const input = field(label);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit(label: string) {
  const form = field(label).closest("form")!;
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await settle();
}
const compareTable = () =>
  [...host.querySelectorAll("[data-testid=rank-grid-compare] tr")].map((r) =>
    [...r.querySelectorAll("td")].map((c) => c.textContent),
  );
const markers = () => [...host.querySelectorAll("[data-testid=markers] li")] as HTMLElement[];

beforeEach(() => requestRaw.mockReset());
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("finds the business from a stored search first, and buys one only on a click", async () => {
  requestRaw.mockImplementation(async (_p: string, init: { body: string }) => {
    const { arguments: a } = JSON.parse(init.body) as Call;
    return a.max_cost_usd ? refused("over_max_cost", "estimated at $0.04") : ok(env(FOUND, { class: "paid", charged_usd: 0.04 }, [{ run_id: "f1", observed_at: "2026-10-06T12:00:00Z", operation: "x" }]));
  });
  await render();
  expect(requestRaw).not.toHaveBeenCalled();

  await click("Find on Google");
  expect(calls()).toEqual([
    {
      tool_name: "seo_local",
      arguments: {
        action: "find_business",
        name: "Bayside Orthodontics",
        near: { latitude: 33.6189, longitude: -117.9298 },
        max_cost_usd: 0.0001,
      },
    },
  ]);
  expect(text()).toContain("No stored search to reuse");
  expect(text()).toContain("400 points per search, then free for 7 days.");

  await click("Search · 400 points");
  expect(calls()[1].arguments).toEqual({
    action: "find_business",
    name: "Bayside Orthodontics",
    near: { latitude: 33.6189, longitude: -117.9298 },
  });
  expect(text()).toContain("Bought Oct 6, 2026 · 400 points");

  await click("Use this");
  expect(text()).toContain("cid 111");
  expect(button("Preview · free")).toBeDefined();
});

it("previews free, runs only on a click with the confirmed center, then shows the grid", async () => {
  requestRaw.mockImplementation(async (_p: string, init: { body: string }) => {
    const { arguments: a } = JSON.parse(init.body) as Call;
    if (a.action === "find_business") return ok(env(FOUND, { class: "paid", reused: true, reused_run_ids: ["f1"] }, [{ run_id: "f1", observed_at: "2026-10-04T12:00:00Z", operation: "x" }]));
    if (a.preview) return ok(env(PREVIEW, { class: "free" }, [], ["Preview only — nothing was spent."]));
    return ok(env(RESULT, { class: "paid", reused: true, reused_run_ids: RESULT_POINTS.map((p) => p.run_id) },
      RESULT_POINTS.map((p) => ({ run_id: p.run_id, observed_at: "2026-10-06T12:30:00Z", operation: "maps" }))));
  });
  await render();
  await click("Find on Google");
  expect(text()).toContain("Reused from Oct 4, 2026");
  await click("Use this");

  await type("Keyword", "orthodontist");
  await act(async () => { [...host.querySelectorAll("button")].find((b) => b.textContent === "3×3")!.click(); });
  await submit("Keyword");

  const preview = calls().at(-1)!;
  expect(preview.arguments).toEqual({
    action: "rank_grid",
    keyword: "orthodontist",
    name: "Bayside Orthodontics",
    cid: "111",
    center: { latitude: 33.619, longitude: -117.93 },
    grid_size: 3,
    spacing_km: 1,
    device: "mobile",
    preview: true,
  });
  expect(text()).toContain("Matched Bayside Orthodontics · 0 km from center");
  expect(markers().filter((m) => m.dataset.bubble === "·")).toHaveLength(9);
  const before = calls().length;
  expect(button("Run grid · 180 points")).toBeDefined();

  await click("Run grid · 180 points");
  const run = calls().slice(before);
  expect(run).toHaveLength(1);
  expect(run[0].arguments).toMatchObject({ preview: false, center_confirmed: "33.619,-117.93", grid_size: 3 });

  // One bubble per point, coloured by rank; not-found read three ways; a failure is "x".
  const bubbles = markers().map((m) => m.dataset.bubble);
  expect(bubbles).toEqual(["1", "5", "12", "20+", "–", "–", "x", "2", "3"]);
  const labels = markers().map((m) => m.textContent);
  expect(labels).toContain("Not in the top 20");
  expect(labels).toContain("Not listed among 3 results");
  expect(labels).toContain("No results for this search here");
  expect(markers()[0].dataset.class).toContain("emerald");
  expect(markers()[4].dataset.class).toContain("border-dashed");

  expect(text()).toContain("Reused from Oct 6, 2026");
  expect(text()).toContain("4.6");

  // Us, then the three most visible competitors, each with its own rank and coverage.
  expect(compareTable()[0]).toEqual(["Bayside OrthodonticsYou", "1 / 9", "4.6", "56% · 5 / 9"]);
  expect(compareTable()[1]).toEqual(["Winner Braces", "3 / 8", "1.67", "75% · 6 / 8"]);
  expect(compareTable().map((r) => r[0])).toEqual(["Bayside OrthodonticsYou", "Winner Braces", "Third Ortho", "Fourth Ortho"]);
});

it("drops the preview when the settings change, so a run never uses a stale center", async () => {
  requestRaw.mockImplementation(async (_p: string, init: { body: string }) => {
    const { arguments: a } = JSON.parse(init.body) as Call;
    if (a.action === "find_business") return ok(env(FOUND, { class: "paid", reused: true, reused_run_ids: ["f1"] }));
    return ok(env(PREVIEW, { class: "free" }));
  });
  await render();
  await click("Find on Google");
  await click("Use this");
  await type("Keyword", "orthodontist");
  await submit("Keyword");
  expect(button("Run grid")).toBeDefined();

  await type("Keyword", "dentist");
  expect(button("Run grid")).toBeUndefined();
  expect(text()).toContain("Preview a grid");
});

it("shows the server's words when the grid fails, and spends nothing to recover", async () => {
  requestRaw.mockImplementation(async (_p: string, init: { body: string }) => {
    const { arguments: a } = JSON.parse(init.body) as Call;
    if (a.action === "find_business") return ok(env(FOUND, { class: "paid", reused: true, reused_run_ids: ["f1"] }));
    return refused("billed_failure", "The rank grid stopped after a billing failure.");
  });
  await render();
  await click("Find on Google");
  await click("Use this");
  await type("Keyword", "orthodontist");
  await submit("Keyword");
  expect(text()).toContain("The rank grid stopped after a billing failure.");
  expect(button("Preview again")).toBeDefined();
});

it("draws a compacted grid (point table, no coordinates) and compares from the live summary", async () => {
  requestRaw.mockImplementation(async (_p: string, init: { body: string }) => {
    const { arguments: a } = JSON.parse(init.body) as Call;
    if (a.action === "find_business") return ok(env(FOUND, { class: "paid", reused: true, reused_run_ids: ["f1"] }));
    return ok(a.preview ? live.preview : live.run);
  });
  await render();
  await click("Find on Google");
  await click("Use this");
  await type("Keyword", "orthodontist");
  await submit("Keyword");
  await click("Open stored grid · free");

  expect(markers()).toHaveLength(25);
  expect(markers().map((m) => m.dataset.bubble).filter((b) => b === "20+")).toHaveLength(22);
  expect(markers().map((m) => m.dataset.bubble).filter((b) => b === "–")).toHaveLength(3);
  expect(compareTable()[1]).toEqual([
    "Newport-Mesa Orthodontics & Family Dentistry",
    "13 / 25",
    "1.55",
    "80% · 20 / 25",
  ]);
});
