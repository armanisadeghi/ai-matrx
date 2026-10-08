// SERVER ROWS ARE OFF UNLESS THE KNOB SAYS ON (lane SSR-ROWS-2).
//
// A table page waits for the server's first reads and draws its rows in the server's HTML only while
// `platform.feature_knob` (feature `data`, key `server_rows`) holds `true`. An absent row, a refused
// read or any other value is OFF, so main never ships a table page that depends on the seed path
// before it is proven. RED before: there was no knob — the seed path was always on.

jest.mock("server-only", () => ({}), { virtual: true });

let mockKnobRow: { value: unknown } | null = null;
let mockRefuse = false;
jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    schema: () => ({
      from: () => {
        const q = {
          select: () => q,
          eq: () => q,
          is: () => q,
          maybeSingle: async () => {
            if (mockRefuse) throw new Error("refused");
            return { data: mockKnobRow, error: null };
          },
        };
        return q;
      },
    }),
  }),
}));
jest.mock("@/utils/supabase/claimsUser", () => ({ getClaimsUser: async () => ({ data: { user: null } }) }));

beforeEach(() => {
  jest.resetModules();
  mockKnobRow = null;
  mockRefuse = false;
});

async function knob() {
  const { serverRowsOn } = await import("../tablePageSeed.server");
  return serverRowsOn();
}

it("no knob row: off", async () => {
  expect(await knob()).toBe(false);
});

it("a refused read: off", async () => {
  mockRefuse = true;
  expect(await knob()).toBe(false);
});

it("a value other than true: off", async () => {
  mockKnobRow = { value: "true" };
  expect(await knob()).toBe(false);
});

it("the knob says true: on", async () => {
  mockKnobRow = { value: true };
  expect(await knob()).toBe(true);
});
