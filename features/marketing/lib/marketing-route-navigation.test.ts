import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { listMarketingEntries } from "./marketing-nav";

const MARKETING_APP_ROOT = join(process.cwd(), "app/(core)/marketing");

const INTENTIONALLY_INTERNAL_TOP_LEVEL_ROUTES = new Set([
  // Privileged maintenance destinations are reached through administration,
  // not the customer-facing Marketing map.
  "/marketing/admin",
]);

describe("Marketing top-level navigation inventory", () => {
  it("registers every customer-facing top-level Marketing page", () => {
    const registered = new Set(
      listMarketingEntries().map((entry) => entry.href),
    );
    const missing = readdirSync(MARKETING_APP_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `/marketing/${entry.name}`)
      .filter((route) =>
        existsSync(
          join(
            MARKETING_APP_ROOT,
            route.slice("/marketing/".length),
            "page.tsx",
          ),
        ),
      )
      .filter((route) => !INTENTIONALLY_INTERNAL_TOP_LEVEL_ROUTES.has(route))
      .filter((route) => !registered.has(route));

    expect(missing).toEqual([]);
  });

  it("does not advertise a top-level Marketing route without a page", () => {
    const missingPages = listMarketingEntries()
      .map((entry) => entry.href)
      .filter((route) => route.startsWith("/marketing/"))
      .filter((route) => route.split("/").length === 3)
      .filter(
        (route) =>
          !existsSync(
            join(
              MARKETING_APP_ROOT,
              route.slice("/marketing/".length),
              "page.tsx",
            ),
          ),
      );

    expect(missingPages).toEqual([]);
  });
});
