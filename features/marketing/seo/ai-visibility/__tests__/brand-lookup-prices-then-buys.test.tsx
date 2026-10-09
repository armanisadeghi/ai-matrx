/**
 * The brand lookup, through the REAL `useToolAction`, `useToolSection` and
 * screen-run client (only the HTTP call `requestRaw` is faked):
 *  - it opens with FREE probes (`max_cost_usd` 0.0001) that leave out every
 *    default the tool fills from the site (brand, confirmed competitors), and
 *    names each section's exact price from the spend gate's own refusal;
 *  - a stored result comes back free and renders as counts per platform with
 *    source, market and date — share of voice as mention COUNTS, never a %;
 *  - with no confirmed competitors it says so and makes no share-of-voice call;
 *  - an edited competitor list is sent explicitly;
 *  - only a click on "Run" makes a paid call (no max_cost_usd).
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/marketing/b/seo/s/ai-visibility/brand",
}));

// The table renders every cell through the page's own column renderers, so
// what a person would read in a cell is what the test reads.
jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: ({
    data,
    columns,
  }: {
    data: Record<string, unknown>[];
    columns: { accessorKey: string; cell?: (r: unknown) => React.ReactNode }[];
  }) => (
    <table>
      <tbody>
        {data.map((row, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td key={c.accessorKey}>{c.cell ? c.cell(row) : String(row[c.accessorKey] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

// Layout only: the card frame's module pulls the whole error-alchemy chain.
jest.mock("@/features/marketing/components/shared/MarketingUi", () => ({
  SectionCard: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

let confirmed: { display_domain: string; classification_status: string }[] = [];
jest.mock("@/features/marketing/seo/site-context/service", () => ({
  fetchSiteCompetitors: async () => ({
    kept: confirmed.map((c, i) => ({ id: String(i), normalized_domain: c.display_domain, display_name: null, tracking_status: "tracking", posture: null, ...c })),
    ignored: 0,
    total: confirmed.length,
  }),
}));

const requestRaw = jest.fn();
jest.mock("@ai-matrx/chat/host/server/python-client", () => ({
  requestRaw: (...args: unknown[]) => requestRaw(...args),
}));

import { BrandLookupView } from "../brand-lookup/BrandLookupView";
import type { MarketingSite } from "@/features/marketing/types";

// Platform cost reaches the screen in the viewer's unit (points); pin the rate.
jest.mock("@/components/cost/pointsRate.client", () => ({ usePointsRate: () => 10000 }));

const SITE = { id: "site-1", domain: "allgreenrecycling.com", organization_id: "org-1" } as MarketingSite;

type Call = { tool_name: string; arguments: Record<string, unknown> };
const calls = (): Call[] => requestRaw.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body));
const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const ok = (output: unknown) =>
  reply({ call_id: "c", tool_name: "seo_ai_visibility", status: "ok", output, error: null, approval: null });
const overMax = (action: string, usd: string) =>
  reply({
    call_id: "c",
    tool_name: "seo_ai_visibility",
    status: "error",
    output: null,
    approval: null,
    error: {
      error_type: "over_max_cost",
      message: `This seo_ai_visibility.${action} call is estimated at $${usd} (16,080 points), above your max_cost_usd of $0.0001 (2 points); nothing was spent.`,
      suggested_action: null,
    },
  });
const envelope = (data: unknown) => ({
  __kind: "seo.tool_envelope",
  status: "ok",
  data,
  cost: { class: "paid", charged_usd: 0, reused: true },
  evidence: [{ run_id: "r1", observed_at: "2026-10-01T10:00:00Z", operation: "x" }],
  notices: [],
});

const MENTIONS = {
  target: { type: "domain", value: "allgreenrecycling.com" },
  market: { location_code: 2840, language_code: "en" },
  total_mentions: 140,
  total_ai_search_volume: 9000,
  platforms: [
    { platform: "google", status: "ok", mentions: 120, ai_search_volume: 8800 },
    { platform: "chat_gpt", status: "ok", mentions: null, ai_search_volume: null },
  ],
  top_cited_pages: [{ url: "https://allgreenrecycling.com/ewaste", platform: "google", mentions: 40, ai_search_volume: 500 }],
  top_cited_domains: { google: [{ domain: "yelp.com", mentions: 30, ai_search_volume: null }] },
  mentioning_prompts: [
    { platform: "google", question: "who recycles laptops in LA", ai_search_volume: 300, last_seen: "2026-09-20", cited_urls: [], brands_mentioned: ["All Green"] },
  ],
};
const SOV = {
  target: { type: "domain", value: "allgreenrecycling.com" },
  market: { location_code: 2840, language_code: "en" },
  entries: [
    { name: "rival.com", is_target: false, mentions: 300, share_pct: 68.18 },
    { name: "allgreenrecycling.com", is_target: true, mentions: 140, share_pct: 31.82 },
  ],
  platforms: [{ platform: "google", status: "ok" }],
};

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
        <BrandLookupView site={SITE} brandId="brand-1" />
      </QueryClientProvider>,
    );
  });
  await settle();
}
const settle = async () => {
  for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
};
const text = () => host.textContent ?? "";
const button = (label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;

beforeEach(() => {
  requestRaw.mockReset();
  confirmed = [{ display_domain: "rival.com", classification_status: "confirmed" }];
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("opens with free probes that send only what differs from the site's defaults, and names each exact price", async () => {
  requestRaw.mockImplementation(async (_p: string, init: { body: string }) => {
    const { arguments: a } = JSON.parse(init.body) as Call;
    return a.action === "brand_mentions" ? overMax("brand_mentions", "0.804") : overMax("share_of_voice", "0.202");
  });
  await render();

  const sent = calls();
  expect(sent.map((c) => c.arguments)).toEqual(
    expect.arrayContaining([
      { action: "brand_mentions", site_id: "site-1", max_cost_usd: 0.0001 },
      { action: "share_of_voice", site_id: "site-1", max_cost_usd: 0.0001 },
    ]),
  );
  expect(sent.every((c) => c.tool_name === "seo_ai_visibility" && c.arguments.max_cost_usd === 0.0001)).toBe(true);
  expect(text()).toContain("No stored AI mentions to reuse");
  expect(button("Run · 8,040 points")).toBeDefined();
  expect(button("Run · 2,020 points")).toBeDefined();
});

it("renders a stored result free: counts per platform, No data for null, share of voice as counts with no %", async () => {
  requestRaw.mockImplementation(async (_p: string, init: { body: string }) => {
    const { arguments: a } = JSON.parse(init.body) as Call;
    return ok(envelope(a.action === "brand_mentions" ? MENTIONS : SOV));
  });
  await render();

  expect(text()).toContain("Reused from Oct 1, 2026");
  expect(text()).toContain("United States · EN");
  expect(text()).toContain("Index sample, not a measurement");
  expect(text()).toContain("Google AI Overviews mentions");
  expect(text()).toContain("120");
  expect(text()).toContain("No data"); // ChatGPT's null is not 0
  expect(text()).toContain("who recycles laptops in LA");
  expect(text()).toContain("rival.com");
  expect(text()).toContain("300");
  expect(text()).not.toMatch(/\d+(\.\d+)?\s*%/); // no pooled or share percentage anywhere
  expect(calls().every((c) => c.arguments.max_cost_usd === 0.0001)).toBe(true);
});

it("with no confirmed competitors says so and never calls share_of_voice", async () => {
  confirmed = [];
  requestRaw.mockImplementation(async () => overMax("brand_mentions", "0.804"));
  await render();

  expect(text()).toContain("No competitors to compare");
  expect(calls().some((c) => c.arguments.action === "share_of_voice")).toBe(false);
});

it("sends an edited competitor list explicitly, and only Run makes a paid call", async () => {
  requestRaw.mockImplementation(async (_p: string, init: { body: string }) => {
    const { arguments: a } = JSON.parse(init.body) as Call;
    if (a.max_cost_usd === undefined) return ok(envelope(a.action === "brand_mentions" ? MENTIONS : SOV));
    return a.action === "brand_mentions" ? overMax("brand_mentions", "0.804") : overMax("share_of_voice", "0.202");
  });
  await render();

  const compare = host.querySelector('input[aria-label="Compare with"]') as HTMLInputElement;
  expect(compare.value).toBe("rival.com");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(compare, "rival.com, Other Co");
    compare.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    (host.querySelector('form[aria-label="Brand lookup"]') as HTMLFormElement).requestSubmit();
  });
  await settle();
  expect(calls().at(-1)?.arguments).toEqual({
    action: "share_of_voice",
    site_id: "site-1",
    competitors: ["rival.com", "Other Co"],
    max_cost_usd: 0.0001,
  });
  expect(calls().some((c) => c.arguments.max_cost_usd === undefined)).toBe(false);

  await act(async () => { button("Run · 8,040 points")!.click(); });
  await settle();
  const paid = calls().filter((c) => c.arguments.max_cost_usd === undefined);
  expect(paid.map((c) => c.arguments)).toEqual([{ action: "brand_mentions", site_id: "site-1" }]);
  expect(text()).toContain("Google AI Overviews mentions");
});
