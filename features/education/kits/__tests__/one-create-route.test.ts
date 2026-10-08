// ONE page creates a study kit (Arman, 2026-10-07: "One page makes sense ...
// follows the same pattern as ... agents"). The agents pattern: list
// (/agents) → New → one create route (/agents/new) → the record page
// (/agents/[id]) for everything after. For kits that is
// /education/kits → /education/kits/new → /education/kits/[id].
//
// The class this guards: a second create page, or a link that still points at
// the retired address, so two doors drift apart again.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { NEW_KIT_HREF, newKitHref } from "@/features/education/onboard/startRoutes";

const ROOT = join(__dirname, "../../../..");
const SCAN = ["app", "features", "components", "lib"];
const SKIP_DIRS = new Set(["node_modules", "__tests__", ".next", "generated"]);
// The retired address's own page only forwards.
const FORWARDER = "app/(core)/education/start/page.tsx";

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) sourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const files = SCAN.flatMap((d) => sourceFiles(join(ROOT, d)));
const rel = (f: string) => relative(ROOT, f);

describe("one study-kit create route", () => {
  it("the create route is the kits list's /new, like /agents/new", () => {
    expect(NEW_KIT_HREF).toBe("/education/kits/new");
  });

  it("a passed source travels to the create route", () => {
    expect(newKitHref()).toBe("/education/kits/new");
    expect(newKitHref({ source: "f1" })).toBe("/education/kits/new?source=f1");
    expect(newKitHref({ source: "s 1", from: "scope" })).toBe(
      "/education/kits/new?source=s+1&from=scope",
    );
    // Unknown keys are dropped; an empty value is dropped.
    expect(newKitHref({ source: "", other: "x" } as Record<string, string>)).toBe(
      "/education/kits/new",
    );
  });

  it("nothing links to the retired /education/start address", () => {
    const offenders = files
      .filter((f) => rel(f) !== FORWARDER)
      // A string literal or a template that builds on it — a `/education/start`
      // inside a comment is history, not a link.
      .filter((f) => /["']\/education\/start["'?/]|`\/education\/start[?/$]/.test(readFileSync(f, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("the second create page is gone", () => {
    expect(existsSync(join(ROOT, "features/education/kits/components/ManualKitCreator.tsx"))).toBe(false);
    const offenders = files
      .filter((f) => /\bManualKitCreator\b/.test(readFileSync(f, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("adding saved aids to a kit stays on the kit page", () => {
    const hub = readFileSync(join(ROOT, "features/education/kits/components/KitHub.tsx"), "utf8");
    expect(hub).not.toMatch(/kits\/new\?source=\$\{encodeURIComponent\(kit\./);
  });
});
