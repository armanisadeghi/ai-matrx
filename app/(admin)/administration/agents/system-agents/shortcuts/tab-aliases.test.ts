// The class guard for "the [shortcutId] route swallows tab slugs".
//
// `/administration/agents/system-agents/shortcuts/<slug>` is matched by the
// dynamic `[shortcutId]` segment unless a STATIC route of that name exists.
// A person who deep-links or hand-edits the URL for one of this hub's tabs
// (production report 2026-08-31: `.../shortcuts/categories`) therefore landed
// inside the shortcut resolver instead of on the tab — the tabs-law says every
// sub-view of a hub is a real, linkable route.
//
// This walks the hub's OWN nav definition rather than a hand-written list, so a
// tab added to `SystemAgentsLayoutClient` tomorrow fails here until it is
// linkable under `/shortcuts/` too.

import fs from "fs";
import path from "path";

const HUB_DIR = path.join(__dirname, "..");
const HUB_BASE = "/administration/agents/system-agents";

function hubTabSlugs(): string[] {
  const source = fs.readFileSync(
    path.join(HUB_DIR, "SystemAgentsLayoutClient.tsx"),
    "utf8",
  );
  const hrefs = [...source.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);
  expect(hrefs.length).toBeGreaterThan(3); // it is actually reading the nav

  return hrefs
    .filter((href) => href.startsWith(`${HUB_BASE}/`))
    .map((href) => href.slice(HUB_BASE.length + 1))
    // Only single-segment tabs can collide with `[shortcutId]`; `shortcuts`
    // and `shortcuts/all` are already under the dynamic segment's own parent.
    .filter((slug) => !slug.includes("/") && slug !== "shortcuts");
}

describe("system-agents hub sub-tabs are linkable under /shortcuts/", () => {
  it("finds the hub's tabs", () => {
    expect(hubTabSlugs()).toEqual(
      expect.arrayContaining(["agents", "lineage", "categories"]),
    );
  });

  it.each(hubTabSlugs())(
    "`shortcuts/%s` is a real route, not a shortcut id",
    (slug) => {
      const alias = path.join(__dirname, slug, "page.tsx");
      const canonical = path.join(HUB_DIR, slug, "page.tsx");
      // Only tabs that actually exist one level up need an alias; a nav entry
      // pointing at a page that is not there is a different defect.
      if (!fs.existsSync(canonical)) return;
      expect(fs.existsSync(alias)).toBe(true);
      expect(fs.readFileSync(alias, "utf8")).toContain(
        `redirect("${HUB_BASE}/${slug}")`,
      );
    },
  );
});
