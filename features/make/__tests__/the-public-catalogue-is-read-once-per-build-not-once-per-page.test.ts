/**
 * The build prerenders every /templates/category/* and /templates/job/* page. React `cache()` lasts
 * one request, so each page used to re-read the whole paged catalogue: 192 RPC calls and ~4 minutes
 * of every Vercel build (2026-10-08). The read is now shared across pages for a few minutes.
 */
jest.mock("server-only", () => ({}));
// Each prerendered page is its own request, so React `cache()` never carries a read from one page
// to the next. Model that: cache() memoizes nothing across calls here.
jest.mock("react", () => ({ ...jest.requireActual("react"), cache: <T,>(fn: T) => fn }));

const rpc = jest.fn(async () => ({ data: { cards: [], total: 0 }, error: null }));
jest.mock("@/utils/supabase/getScriptClient", () => ({
  getScriptSupabaseClient: () => ({ schema: () => ({ rpc }) }),
}));

import { readPublicCatalogue } from "../gallery/publicCatalogue.server";

describe("the public catalogue is read once per build, not once per page", () => {
  it("many page renders share one catalogue read", async () => {
    for (let page = 0; page < 20; page++) await readPublicCatalogue();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
