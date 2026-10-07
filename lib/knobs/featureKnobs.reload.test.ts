/** @jest-environment jsdom */
/**
 * THE 60 s KNOB WINDOW SURVIVES A RELOAD (lane PAGE-BUNDLE-2).
 *
 * Every hard load of every page read the whole `platform.feature_knob` catalogue (~3,500 rows, four
 * pages) again, even a reload a second after the last. A reload inside the same minute now reads it
 * from the tab's sessionStorage; past the minute it is read again, so "live within a minute" holds.
 */

let reads = 0;
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => {
          const query: Record<string, unknown> = {
            order: () => query,
            range: () => query,
            is: () => query,
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
              reads += 1;
              return Promise.resolve({
                data: [{ feature: "data_tables", key: "merged_grid", value: true }],
                error: null,
                count: 1,
              }).then(resolve, reject);
            },
          };
          return query;
        },
      }),
    }),
  }),
}));

type Knobs = typeof import("./featureKnobs");
const freshPageLoad = (): Knobs => {
  let mod: Knobs | null = null;
  jest.isolateModules(() => {
    mod = require("./featureKnobs") as Knobs;
  });
  return mod as unknown as Knobs;
};

describe("the knob catalogue across reloads", () => {
  const realNow = Date.now;
  afterEach(() => {
    Date.now = realNow;
    window.sessionStorage.clear();
    reads = 0;
  });

  it("is read once for two page loads inside the same minute", async () => {
    expect(await freshPageLoad().knobBool("data_tables", "merged_grid")).toBe(true);
    expect(await freshPageLoad().knobBool("data_tables", "merged_grid")).toBe(true);
    expect(reads).toBe(1);
  });

  it("is read again once the minute has passed", async () => {
    await freshPageLoad().knobBool("data_tables", "merged_grid");
    const later = realNow() + 61_000;
    Date.now = () => later;
    await freshPageLoad().knobBool("data_tables", "merged_grid");
    expect(reads).toBe(2);
  });

  it("is read again after an invalidation", async () => {
    const page = freshPageLoad();
    await page.knobBool("data_tables", "merged_grid");
    page.invalidateFeatureKnobs();
    await freshPageLoad().knobBool("data_tables", "merged_grid");
    expect(reads).toBe(2);
  });
});
