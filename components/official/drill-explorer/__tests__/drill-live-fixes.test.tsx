/**
 * THE LIVE WALK'S FINDINGS, FIXED AT THE ROOT (lane DRILL-LIVE-FIXES; VERIFY-DRILL-LIVE F1, F3–F9).
 *
 * The data is what production answered on 2026-09-30 (read-only): `/administration/usage` drilled to
 * admin@admin.com · claude-opus-5 · Sep 12 — 1,026 executions of the AI usage ledger, $188.67 over 148
 * requests; the "Hours that spiked" finding, 120 hours over three times the median hour of which the
 * door lists 100; the Verification Desk workflow opened from its address; the KG cost default table.
 *
 * Break it names:
 *   F1 a knob read that splits its own name, or reads the platform row instead of the effective value
 *   F3 the records counted as "requests" (the host's noun), no sums in their header, a pager that reads
 *      the rows held instead of the door's total
 *   F4 a moment printed raw, a whole UUID leading a row
 *   F5 a finding cut at the door's cap with nothing said
 *   F6 a view without the headline Measure blanking the header; the KG table missing cleanup cost
 *   F7 a relation crumb that reads "whose name you cannot read" while the rows name it
 *   F8 times printed in the reader's clock while periods are cut in UTC, and the calendar unsaid
 *   F9 toolbar controls that shrink (and clip) instead of wrapping
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { formatCost, formatPoints } from "@ai-matrx/kit/format";
import { createRoot, type Root } from "react-dom/client";
import type { DrillDefinition } from "@ai-matrx/records";

const ensureEffectiveKnob = jest.fn();
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({ ensureEffectiveKnob: (...a: unknown[]) => ensureEffectiveKnob(...a) }));
jest.mock("@/components/official/InfoHint", () => ({ InfoHint: ({ text }: { text: string }) => <i data-hint={text} /> }));
jest.mock("@/components/navigation/AppLink", () => ({ __esModule: true, default: ({ children }: { children: unknown }) => <a>{children as never}</a> }));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/features/admin/usage-drill/useUsageDrill", () => ({ usageNameResolver: () => ({ resolve: async () => ({ ok: true, names: {} }) }) }));
jest.mock("../DrillExplorer", () => ({ DrillExplorer: () => null }));

const tableProps: { current?: Record<string, unknown> } = {};
jest.mock("@ai-matrx/design-system/data-table", () => {
  const actual = jest.requireActual("@ai-matrx/design-system/data-table");
  return {
    ...actual,
    MatrxDataTable: (p: Record<string, unknown>) => {
      tableProps.current = p;
      return <div data-table-stand-in="" />;
    },
  };
});

import { drillKnobAddress, readDrillKnob } from "../drillKnob";
import { DRILL_KNOB_READS, drillKnobsOf } from "../useDrillKnobs";
import { findingCount, grainNoun, isMoment, momentWords, pluralNoun, shortId } from "../explorerWords";
import { tipWords } from "../DrillExplorerNotes";
import { drillReconcileChip } from "../useDrillReconcile";
import { DrillRecords } from "../DrillRecords";
import { KG_COST_FIRST_QUESTION } from "@/features/administration/kg-cost/components/KgCostExplorer";

// A fixed rate so the cost fixtures read the same on every run; production reads the billing knob.
const FIXTURE_POINTS_RATE = 20_000;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd";
const PLATFORM_ORG = "39c38960-d30c-4840-b0c1-c9960de95582";

describe("F1 — every drill setting is read the way platform.drill_knob reads it", () => {
  it("splits at the last segment, as the door's regexp does", () => {
    expect(drillKnobAddress("drill.usage.stale_after_minutes")).toEqual({ feature: "drill.usage", key: "stale_after_minutes" });
    expect(drillKnobAddress("drill.chart.top_n")).toEqual({ feature: "drill.chart", key: "top_n" });
    expect(drillKnobAddress("drill.pivot_columns")).toEqual({ feature: "drill", key: "pivot_columns" });
    expect(drillKnobAddress("drill.finding.ai_usage.spikes.spike_multiplier")).toEqual({ feature: "drill.finding.ai_usage.spikes", key: "spike_multiplier" });
    expect(() => drillKnobAddress("usage.stale_after_minutes")).toThrow(/not a drill setting/);
  });

  it("reads the EFFECTIVE value (the knob snapshot), with the platform lane asking no organization", async () => {
    ensureEffectiveKnob.mockResolvedValueOnce(20);
    await expect(readDrillKnob("drill.usage.stale_after_minutes", { lane: "platform", organizationId: PLATFORM_ORG, userId: ADMIN })).resolves.toBe(20);
    expect(ensureEffectiveKnob).toHaveBeenLastCalledWith(null, ADMIN, { feature: "drill.usage", key: "stale_after_minutes" });
    ensureEffectiveKnob.mockResolvedValueOnce(80);
    await readDrillKnob("drill.pareto.share_pct", { lane: "mine", organizationId: "org-b", userId: ADMIN });
    expect(ensureEffectiveKnob).toHaveBeenLastCalledWith("org-b", ADMIN, { feature: "drill.pareto", key: "share_pct" });
    ensureEffectiveKnob.mockResolvedValueOnce("x");
    await expect(readDrillKnob("drill.chart.top_n", { lane: "mine", organizationId: "org-b", userId: ADMIN })).rejects.toThrow(/not a number/);
  });

  it("every setting the explorer reads is a drill setting name, and one it cannot read is named for the badge", () => {
    for (const r of DRILL_KNOB_READS) expect(() => drillKnobAddress(r.name)).not.toThrow();
    const ok = (value: number) => ({ ok: true as const, value });
    const no = { ok: false as const, message: "no knob is registered" };
    const got = drillKnobsOf([ok(10), no, ok(24), ok(2), ok(90), ok(366)]);
    expect(got).toMatchObject({ chartTopN: 10, paretoSharePct: null, pivotColumns: 24, grainLines: { hourMaxDays: 2, dayMaxDays: 90, weekMaxDays: 366 } });
    expect(got.unread.map((u) => u.label)).toEqual(["Pareto share"]);
  });

  it("no explorer file reads a knob any other way (the class, closed)", () => {
    const dir = join(__dirname, "..");
    for (const f of readdirSync(dir).filter((n) => /\.(ts|tsx)$/.test(n))) {
      const text = readFileSync(join(dir, f), "utf8");
      expect({ f, featureKnobs: /@\/lib\/knobs\/featureKnobs/.test(text), knobNumber: /\bknobNumber\(/.test(text) }).toEqual({ f, featureKnobs: false, knobNumber: false });
    }
  });
});

describe("the small words, from data", () => {
  it("F3: a records count's noun is its grain's", () => {
    expect(grainNoun("one row per execution of the AI usage ledger (a model call, a tool run, a scrape, a child agent run), with the request, conversation and sign-in session it belongs to")).toBe("execution");
    expect(grainNoun("one row per ingest run (a note, file, transcript, page or document read into knowledge)")).toBe("ingest run");
    expect(grainNoun("one row per workflow run (archived runs are not counted)")).toBe("workflow run");
    expect(grainNoun("one row per hour for each organization, person, agent, provider, model")).toBe("hour");
    expect(pluralNoun("execution", 1026)).toBe("executions");
    expect(pluralNoun("entry", 2)).toBe("entries");
  });

  it("F4/F8: a moment reads as a date and time in the calendar it is cut in; an unnamed id reads short", () => {
    expect(isMoment("2026-09-12T23:59:36.392599+00:00")).toBe(true);
    expect(isMoment("claude-opus-5")).toBe(false);
    expect(momentWords("2026-09-12T23:59:36.392599+00:00", "UTC")).toMatch(/Sep 12, 11:59\s?PM/);
    expect(shortId("0b6a1c2e-9f7d-4c1e-8a55-5a6f0e3d2b11")).toBe("0b6a1c2e");
    expect(shortId("Verification Desk")).toBeNull();
  });

  it("F5: a finding past the cap counts the door's distinct groups", () => {
    expect(findingCount(100, 120)).toEqual({ count: 120, capped: true });
    expect(findingCount(7, 7)).toEqual({ count: 7, capped: false });
    expect(findingCount(3, null)).toEqual({ count: 3, capped: false });
  });

  it("interface text: the reconciliation is a label + one-line tooltip; a tooltip never runs past 140", () => {
    const f = (v: number) => formatPoints(v, { short: true });
    const chip = drillReconcileChip(48_053_287, 38_608_227, "AI model calls", f);
    expect(chip.label).toBe("AI model calls 80%");
    expect(chip.tip).toBe("38,608,227 pts of 48,053,287 pts; 9,445,060 pts (20%) with no AI model call");
    expect(chip.tip.length).toBeLessThanOrEqual(140);
    const long = "120 of 718 groups meet the rule (cost more than 3 × the median group above zero); the rest are added together in Other. Showing the top 100 of 120 groups by cost; the other 20 are added together in Other.";
    expect(tipWords(long).length).toBeLessThanOrEqual(140);
    expect(tipWords(long).endsWith("…")).toBe(true);
  });

  it("F6: the KG default table carries cleanup cost, as the old section's did", () => {
    expect(KG_COST_FIRST_QUESTION.show).toEqual(expect.arrayContaining(["embedding_cost", "extraction_cost", "cleanup_cost", "enrichment_cost"]));
  });
});

// ── F3/F4: the records screen, against production's Sep 12 page ─────────────────────────────────
const USAGE_DEF = {
  key: "ai_usage",
  label: "AI usage",
  mode: "definer",
  grain: "one row per hour for each organization, person, agent, provider, model, app, feature, origin, manual or automated, and source",
  dimensions: [{ key: "person", label: "Person", from: "person_id", kind: "relation" }],
  measures: [
    { key: "cost", label: "Cost", op: "sum", of: "cost", unit: "usd" },
    { key: "requests", label: "Requests", op: "sum", of: "requests", unit: "count" },
    { key: "calls", label: "Calls", op: "count", unit: "count" },
  ],
  records: { fact: "ai_usage_executions", columns: ["created_at", "execution_id", "cost"] },
} as unknown as DrillDefinition;

describe("F3/F4 — the records read in their own noun, with their sums and the door's total", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("1,026 executions · Cost … · 148 requests, a pager over 1,026, moments and ids formatted", async () => {
    const client = {
      drillDescribe: jest.fn(async () => ({ ok: true, data: { grain: "one row per execution of the AI usage ledger (a model call, a tool run)" } })),
      drillAsk: jest.fn(async () => ({ ok: true, data: { rows: [] } })),
      drillRows: jest.fn(async () => ({
        ok: true,
        data: {
          total: 1026,
          limit: 100,
          offset: 0,
          rows: [{ created_at: "2026-09-12T23:59:36.392599+00:00", execution_id: "0b6a1c2e-9f7d-4c1e-8a55-5a6f0e3d2b11", cost: 0.12 }],
          as_of: "2026-09-30T23:00:00Z",
          measures: { cost: 188.67239483, requests: 148, calls: 1026 },
          counted: { cost: 188.67239483, requests: 148, calls: 1026 },
        },
      })),
    };
    await act(async () => {
      root.render(
        <DrillRecords
          client={client as never}
          source={{ kind: "entity", token: "ai_usage" }}
          lane="platform"
          def={USAGE_DEF}
          records={USAGE_DEF.records!}
          question={{ by: [], show: ["cost", "requests"], where: [], window: "2026-09-12..2026-09-13" }}
          dimensions={[{ key: "person", label: "Person", kind: "relation" }]}
          measures={[
            { key: "cost", label: "Cost (points)", additive: true, format: (v: number | null) => formatCost(v, { rate: FIXTURE_POINTS_RATE }) },
            { key: "requests", label: "Requests", additive: true },
          ]}
          rowNoun="request"
          timeZone="UTC"
          siblings={{
            offered: ["ai_usage_executions"],
            described: [{ token: "ai_usage_executions", group: "Executions", go: () => {}, source: { kind: "entity", token: "ai_usage_executions" }, def: { grain: "one row per execution of the AI usage ledger (a model call, a tool run)" } as never }],
          }}
        />,
      );
    });
    await act(async () => {});
    // the noun is the sibling definition's grain, already described by the explorer — never a describe of the fact (D2)
    expect(client.drillDescribe).not.toHaveBeenCalled();
    expect(host.querySelector("[data-drill-explorer-records-count]")?.textContent).toBe("1,026 executions");
    expect(host.querySelector('[data-drill-explorer-records-sum="cost"]')?.textContent).toMatch(/Cost 3,773,448 points/);
    expect(host.querySelector('[data-drill-explorer-records-sum="requests"]')?.textContent).toMatch(/148 requests/);
    // the pager is the door's: controlled-append over the true total
    const query = tableProps.current!.query as { mode: string; pagination: { totalItems: number; hasNextPage: boolean } };
    expect(query.mode).toBe("controlled-append");
    expect(query.pagination.totalItems).toBe(1026);
    expect(query.pagination.hasNextPage).toBe(true);
    // cells: a moment in UTC, an unnamed id short
    const columns = tableProps.current!.columns as Array<{ id: string; cell: (row: Record<string, unknown>) => React.ReactElement }>;
    const row = { created_at: "2026-09-12T23:59:36.392599+00:00", execution_id: "0b6a1c2e-9f7d-4c1e-8a55-5a6f0e3d2b11", cost: 0.12 };
    const cellHost = document.createElement("div");
    const cellRoot = createRoot(cellHost);
    await act(async () => cellRoot.render(<>{columns.map((c) => <span key={c.id} data-col={c.id}>{c.cell(row)}</span>)}</>));
    expect(cellHost.querySelector('[data-col="created_at"]')?.textContent).toMatch(/^Sep 12, 11:59\s?PM$/);
    expect(cellHost.querySelector('[data-col="execution_id"]')?.textContent).toBe("0b6a1c2e");
    act(() => cellRoot.unmount());
  });

  it("a records page states its moment as one As of chip, and nothing settles (lane DRILL-FACTS)", async () => {
    const client = {
      drillDescribe: jest.fn(async () => ({ ok: true, data: { grain: "one row per execution of the AI usage ledger" } })),
      drillAsk: jest.fn(async () => ({ ok: true, data: { rows: [] } })),
      drillRows: jest.fn(async () => ({
        ok: true,
        data: {
          total: 3,
          limit: 100,
          offset: 0,
          rows: [],
          as_of: "2026-09-30T23:00:00Z",
          measures: { cost: 2, requests: 1 },
        },
      })),
    };
    await act(async () => {
      root.render(
        <DrillRecords
          client={client as never}
          source={{ kind: "entity", token: "ai_usage" }}
          lane="platform"
          def={USAGE_DEF}
          records={USAGE_DEF.records!}
          question={{ by: [], show: ["cost"], where: [], window: "24h" }}
          dimensions={[]}
          measures={[{ key: "cost", label: "Cost (points)", additive: true, format: (v: number | null) => formatCost(v, { rate: FIXTURE_POINTS_RATE }) }]}
          rowNoun="request"
        />,
      );
    });
    await act(async () => {});
    const chip = host.querySelector("[data-drill-explorer-records-as-of]");
    expect(chip?.getAttribute("data-matrx-control")).toBe("badge");
    expect(chip?.textContent).toMatch(/^As of /);
    expect(host.querySelector('[data-drill-explorer-records-header] [data-hint]')).toBeNull();
  });
});
