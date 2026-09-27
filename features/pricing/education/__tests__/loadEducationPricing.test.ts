/**
 * The public /pricing Free card: every number comes from
 * billing.capability_limit, in the window it is shown in, and a refused read
 * throws instead of rendering a Free card with no limits.
 */

type Row = Record<string, unknown>;
let rows: Record<string, Row[]> = {};
let refuse: string | null = null;

function builder(table: string) {
  const filters: { column: string; value: unknown }[] = [];
  let inFilter: { column: string; values: unknown[] } | null = null;
  const settle = () => {
    if (refuse === table) {
      return { data: null, error: { message: "permission denied", code: "42501" } };
    }
    const data = (rows[table] ?? []).filter(
      (r) =>
        filters.every((f) => r[f.column] === f.value) &&
        (!inFilter || inFilter.values.includes(r[inFilter.column])),
    );
    return { data, error: null };
  };
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (column: string, value: unknown) => (filters.push({ column, value }), api),
    in: (column: string, values: unknown[]) => ((inFilter = { column, values }), api),
    order: () => api,
    limit: () => api,
    maybeSingle: () => {
      const r = settle();
      return Promise.resolve(r.error ? r : { data: (r.data as Row[])[0] ?? null, error: null });
    },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve),
  };
  return api;
}

const client: { schema: () => unknown; from: (t: string) => Record<string, unknown> } = {
  schema: () => client,
  from: (t: string) => builder(t),
};
jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn(async () => client) }));

import { loadEducationPricing, PRICING_READ_TIMEOUT_MS } from "../loadEducationPricing";

beforeEach(() => {
  refuse = null;
  rows = {
    product: [],
    price: [],
    capability_limit: [
      { capability: "education.generate_cards", limit_value: 30, period: "month", tier: "free" },
      { capability: "education.generate_cards", limit_value: 10, period: "rolling_5h", tier: "free" },
      { capability: "education.tutor_message", limit_value: 30, period: "day", tier: "free" },
      { capability: "education.tutor_message", limit_value: 15, period: "rolling_5h", tier: "free" },
    ],
  };
});

it("headlines each capability in its own window, phrased as a unit", async () => {
  const { freeHighlights } = await loadEducationPricing();
  expect(freeHighlights).toEqual([
    { capability: "education.generate_cards", unit: "flashcard decks", limit: 30, period: "month" },
    { capability: "education.tutor_message", unit: "AI tutor messages", limit: 30, period: "day" },
  ]);
});

it("omits a capability with no row for its window rather than inventing one", async () => {
  rows.capability_limit = rows.capability_limit.filter((r) => r.period !== "day");
  const { freeHighlights } = await loadEducationPricing();
  expect(freeHighlights.map((h) => h.capability)).toEqual(["education.generate_cards"]);
});

it("throws on a refused limits read instead of showing a Free card with no limits", async () => {
  refuse = "capability_limit";
  await expect(loadEducationPricing()).rejects.toThrow(/billing\.capability_limit/);
});

it("fails fast with a named error when the database never answers (no platform 504)", async () => {
  jest.useFakeTimers();
  const realFrom = client.from;
  // A read that never settles — what every anon PostgREST read did on 2026-09-27.
  client.from = () => {
    const hang: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit"]) hang[m] = () => hang;
    hang.maybeSingle = () => new Promise(() => {});
    hang.then = () => new Promise(() => {});
    return hang;
  };
  try {
    const pending = loadEducationPricing();
    const assertion = expect(pending).rejects.toThrow(/billing\.product.*did not answer/);
    await jest.advanceTimersByTimeAsync(PRICING_READ_TIMEOUT_MS + 1);
    await assertion;
  } finally {
    client.from = realFrom;
    jest.useRealTimers();
  }
});
