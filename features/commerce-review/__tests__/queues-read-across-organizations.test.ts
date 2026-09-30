/**
 * The review queues answer "what is waiting for ME", across every organization
 * the person can reach — never just the header's selected one. The organization
 * is an OPTIONAL explicit filter; without it no `organization_id` narrowing is
 * applied (access decides, via RLS).
 */

const eqCalls: Array<[string, unknown]> = [];

function builder(): unknown {
  const b: Record<string, unknown> = {};
  for (const method of ["select", "is", "order", "range", "or", "in"]) {
    b[method] = () => b;
  }
  b.eq = (column: string, value: unknown) => {
    eqCalls.push([column, value]);
    return b;
  };
  return b;
}

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({ from: () => builder() }),
  }),
}));
jest.mock("@/utils/supabase/writeOne", () => ({ writeOne: jest.fn() }));
jest.mock("@/features/commerce-intake/service", () => ({
  listArtifactsForAssets: jest.fn(async () => new Map()),
}));
jest.mock("@ai-matrx/data/db", () => ({
  guardedUpdate: jest.fn(),
  // Run the page function once so the query chain is built, return no rows.
  readAllRows: async (page: (range: { from: number; to: number }) => unknown) => {
    page({ from: 0, to: 9 });
    return [];
  },
}));

import { listAttentionQueue, listDraftQueue, listTriageQueue } from "../service";

describe("commerce review queues", () => {
  beforeEach(() => {
    eqCalls.length = 0;
  });

  it.each([
    ["triage", () => listTriageQueue()],
    ["draft", () => listDraftQueue()],
    ["attention", () => listAttentionQueue()],
  ])("%s queue applies no organization narrowing by default", async (_name, run) => {
    await run();
    expect(eqCalls.some(([column]) => column === "organization_id")).toBe(false);
  });

  it("an explicit organization filter still narrows (the on-page control)", async () => {
    await listTriageQueue("org-1");
    expect(eqCalls).toContainEqual(["organization_id", "org-1"]);
  });
});
