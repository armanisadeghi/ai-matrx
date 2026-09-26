/**
 * Research documents are numbered by `capture_version` (migration 1298);
 * `version` is the platform's row-edit counter. Every document read orders by
 * the capture number, so "the newest document" is the newest capture.
 */
type Call = { method: string; args: unknown[] };
const calls: Call[] = [];

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls.push({ method: `${table}.${m}`, args });
      return builder;
    });
  }
  builder.maybeSingle = jest.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve: (r: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  return builder;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: jest.fn(() => ({ from: jest.fn((t: string) => makeBuilder(t)) })),
    rpc: jest.fn(),
  },
}));
jest.mock("@/lib/python-client", () => ({ getJson: jest.fn(), postJson: jest.fn(), patchJson: jest.fn() }));

import {
  getDocument,
  getDocumentVersions,
  getLatestSuccessfulDocument,
} from "../service";

beforeEach(() => {
  calls.length = 0;
});

it.each([
  ["getDocument", () => getDocument("t1")],
  ["getLatestSuccessfulDocument", () => getLatestSuccessfulDocument("t1")],
  ["getDocumentVersions", () => getDocumentVersions("t1")],
])("%s orders by capture_version, never the row-edit counter", async (_n, read) => {
  await read();
  const orders = calls.filter((c) => c.method === "rs_document.order");
  expect(orders.length).toBeGreaterThan(0);
  expect(orders.map((o) => o.args[0])).toEqual(orders.map(() => "capture_version"));
});
