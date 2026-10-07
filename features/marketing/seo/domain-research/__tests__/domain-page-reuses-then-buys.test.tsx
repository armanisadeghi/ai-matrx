/**
 * The domain page, through the REAL `useToolAction` and screen-run client
 * (only the HTTP call `requestRaw` is faked):
 *  - it opens by asking for a free stored result (`max_cost_usd` probe) and,
 *    when the tool reuses one, shows "Reused from <date>" and the stat cards
 *    without any paid call;
 *  - when nothing is stored it offers the run at the price the live tool
 *    definition states, and only a click makes the paid call;
 *  - a failure shows the server's words, and "Try again" never spends;
 *  - with no domain it asks for one and calls nothing.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let search = new URLSearchParams();
const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useSearchParams: () => search,
  useRouter: () => ({ replace, push: replace }),
  usePathname: () => "/marketing/tools/domain",
}));

jest.mock("@/features/shell/components/header/templates/RecordPageHeader", () => ({
  RecordPageHeader: ({ record }: { record: { name: string } }) => <h1>{record.name}</h1>,
}));
jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: ({ data }: { data: unknown[] }) => <div data-testid="table">{data.length} rows</div>,
}));
jest.mock("@/features/marketing/competitors/data", () => ({ listCompetitorSites: async () => [] }));
jest.mock("@ai-matrx/data/db", () => ({ readAllRows: async () => [] }));

const LIVE_PARAMETERS = {
  $variants: {
    overview: { description: "Paid — about $0.04 per call; reuses a result up to 7 days old for free." },
    ranked_keywords: { description: "Paid — about $0.02 per call; reuses a result up to 30 days old for free." },
    serp_competitors: { description: "Paid — about $0.02 per call; reuses a result up to 7 days old for free." },
    keyword_gap: { description: "Paid — about $0.02 per call; reuses a result up to 7 days old for free." },
  },
};
const definitionReads: string[] = [];
jest.mock("@/utils/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["schema", "from", "select", "eq", "is", "order", "range"]) {
    chain[m] = (...args: unknown[]) => {
      if (m === "eq") definitionReads.push(String(args[1]));
      return chain;
    };
  }
  chain.maybeSingle = async () => ({ data: { parameters: LIVE_PARAMETERS }, error: null });
  return { supabase: chain };
});

const requestRaw = jest.fn();
jest.mock("@ai-matrx/chat/host/server/python-client", () => ({
  requestRaw: (...args: unknown[]) => requestRaw(...args),
}));

import { DomainResearchPage } from "../DomainResearchPage";

// Platform cost reaches the screen in the viewer's unit (points); pin the rate.
jest.mock("@/components/cost/pointsRate.client", () => ({ usePointsRate: () => 10000 }));

type Call = { tool_name: string; arguments: Record<string, unknown> };
const calls = (): Call[] => requestRaw.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body));
const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

const OVERVIEW = {
  domain: "python.org",
  scope: "subdomains",
  organic_traffic_est: 1_250_000,
  organic_keywords: 48_000,
  paid_keywords: null,
  backlinks: null,
  referring_domains: null,
  backlinks_source: null,
  backlinks_as_of: null,
  market: { location_code: 2840, language_code: "en", defaulted: true },
  as_of: "2026-09-28",
};
const envelope = (data: unknown, reused: boolean, charged = 0) => ({
  __kind: "seo.tool_envelope",
  status: "ok",
  data,
  cost: { class: "paid", charged_usd: charged, reused },
  evidence: [{ run_id: "r1", observed_at: "2026-09-28T23:18:48Z", operation: "x" }],
  notices: [],
});
const ok = (output: unknown) => reply({ call_id: "c", tool_name: "seo_domain", status: "ok", output, error: null, approval: null });
const refused = (type: string, message: string) =>
  reply({ call_id: "c", tool_name: "seo_domain", status: "error", output: null, approval: null, error: { error_type: type, message, suggested_action: null } });

let root: Root;
let host: HTMLDivElement;
async function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <DomainResearchPage />
      </QueryClientProvider>,
    );
  });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}
const text = () => host.textContent ?? "";
const button = (label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;

beforeEach(() => {
  requestRaw.mockReset();
  replace.mockReset();
  definitionReads.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("reuses a stored result first: the probe returns it free and no paid call is made", async () => {
  search = new URLSearchParams("d=https://www.Python.org/about");
  requestRaw.mockImplementation(async (_path: string, init: { body: string }) => {
    const { arguments: a } = JSON.parse(init.body) as Call;
    return a.action === "overview" ? ok(envelope(OVERVIEW, true)) : refused("over_max_cost", "estimated at $0.02");
  });
  await render();

  const sent = calls();
  expect(sent.every((c) => c.tool_name === "seo_domain")).toBe(true);
  expect(sent.find((c) => c.arguments.action === "overview")?.arguments).toEqual({
    action: "overview",
    target: "python.org",
    max_cost_usd: 0.0001,
  });
  expect(sent.every((c) => c.arguments.max_cost_usd === 0.0001)).toBe(true);
  expect(text()).toContain("python.org");
  expect(text()).toContain("Reused from Sep 28, 2026");
  expect(text()).toContain("1.3M");
  expect(text()).toContain("United States");
  // Keywords had nothing stored: offered at the definition's price, not bought.
  expect(text()).toContain("No stored keywords to reuse");
  expect(button("Run · 200 points")).toBeDefined();
  expect(definitionReads).toContain("seo_domain");
});

it("offers the paid run at the definition's price and only a click spends", async () => {
  search = new URLSearchParams("d=python.org");
  requestRaw.mockImplementation(async (_path: string, init: { body: string }) => {
    const { arguments: a } = JSON.parse(init.body) as Call;
    if (a.max_cost_usd) return refused("over_max_cost", "estimated at $0.04");
    return a.action === "overview" ? ok(envelope(OVERVIEW, false, 0.0121)) : refused("over_max_cost", "x");
  });
  await render();

  expect(text()).toContain("No stored stats to reuse");
  expect(text()).toContain("400 points per run, then free for 7 days.");
  const before = calls().length;
  expect(calls().every((c) => c.arguments.max_cost_usd === 0.0001)).toBe(true);

  await act(async () => { button("Run · 400 points")!.click(); });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });

  const paid = calls().slice(before);
  expect(paid).toHaveLength(1);
  expect(paid[0].arguments).toEqual({ action: "overview", target: "python.org" });
  expect(text()).toContain("Bought Sep 28, 2026 · 121 points");
  expect(text()).toContain("48k");
  expect(text()).toContain("Monthly estimate · Sep 28, 2026");
});

it("shows the server's failure, and Try again asks for stored data without spending", async () => {
  search = new URLSearchParams("d=python.org");
  requestRaw.mockImplementation(async () => refused("provider_error", "DataForSEO did not answer."));
  await render();

  expect(text()).toContain("Could not load stats");
  expect(text()).toContain("DataForSEO did not answer.");
  const before = calls().length;
  await act(async () => { button("Try again")!.click(); });
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
  const again = calls().slice(before);
  expect(again.length).toBeGreaterThan(0);
  expect(again.every((c) => c.arguments.max_cost_usd === 0.0001)).toBe(true);
});

it("with no domain it asks for one and calls no tool", async () => {
  search = new URLSearchParams();
  await render();
  expect(text()).toContain("Research any domain");
  expect(requestRaw).not.toHaveBeenCalled();
});
