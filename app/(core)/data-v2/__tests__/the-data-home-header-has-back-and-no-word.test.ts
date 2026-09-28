// app/(core)/data-v2/__tests__/the-data-home-header-has-back-and-no-word.test.ts
//
// LANE DATA-HOME-1 (Arman, 2026-09-27 21:20 PT). On the data home the route header read "Data"
// at the top centre — a word the page says everywhere else — and carried no back arrow, so from
// `?scope=all` there was no way back. The header is the platform's route-header primitive
// (HeaderStructured): it carries `back` and no title. RED on the page before the lane.
// The screen half (navigate, press Back, land on /data-v2) is proven headless on the preview.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAGE = readFileSync(
  process.env.DATA_HOME_PAGE_UNDER_TEST ?? join(__dirname, "..", "page.tsx"),
  "utf8",
);

describe("the data home's route header", () => {
  const mounts = PAGE.match(/<HeaderStructured\b[^>]*\/>/gs) ?? [];

  it("is the route header primitive, mounted once", () => {
    expect(mounts).toHaveLength(1);
  });

  it("carries a back arrow", () => {
    expect(mounts[0]).toMatch(/\bback\b/);
  });

  it("says no title in the middle", () => {
    expect(mounts[0]).not.toMatch(/\btitle\s*=/);
  });
});
