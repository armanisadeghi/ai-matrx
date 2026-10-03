/*
  Every `/[feature]/admin` map page is listed in FEATURE_MAPS, and every entry
  still has a page — so the admin menu's "Feature maps" page can never silently
  miss a map (the audit that found 19 maps nothing linked to) or open a 404.
*/
import { readdirSync, statSync } from "fs";
import { join, relative, sep } from "path";

import { FEATURE_MAPS } from "../feature-map-registry";

const CORE = join(process.cwd(), "app", "(core)");

function mapPageRoutes(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (name === "admin") {
      try {
        if (statSync(join(full, "page.tsx")).isFile()) {
          const segments = relative(CORE, full)
            .split(sep)
            // Route groups are not part of the URL.
            .filter((s) => !(s.startsWith("(") && s.endsWith(")")));
          // A dynamic segment means a per-record admin page, not a feature map.
          if (!segments.some((s) => s.startsWith("["))) {
            out.push(`/${segments.join("/")}`);
          }
        }
      } catch {
        // No page.tsx in this admin folder — nothing to register.
      }
    }
    mapPageRoutes(full, out);
  }
  return out;
}

describe("feature map registry", () => {
  const onDisk = mapPageRoutes(CORE).sort();
  const listed = FEATURE_MAPS.map((m) => m.href).sort();

  it("finds map pages at all (a vacuous scan would pass)", () => {
    expect(onDisk.length).toBeGreaterThan(10);
  });

  it("lists every map page on disk", () => {
    expect(onDisk.filter((href) => !listed.includes(href))).toEqual([]);
  });

  it("lists nothing that has no page", () => {
    expect(listed.filter((href) => !onDisk.includes(href))).toEqual([]);
  });

  it("lists each map once", () => {
    expect(new Set(listed).size).toBe(listed.length);
  });
});
