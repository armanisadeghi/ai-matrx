/**
 * 🚨 A DECLARED HREF LANDS ON WHAT IT NAMES — RESOLVING IS NOT ANSWERING.
 *
 * THE DEFECT THIS PINS (V-28 NEW-4). F-119/F-121 gave the connectors' first
 * actions a real guard: a route action must reach a route the manifest knows,
 * and not a registered coming-soon placeholder. It passed
 * `/marketing/sites/tracking` — the very href `features/connectors/FEATURE.md`
 * names as the defect the guard was written for — because the matcher resolved
 * it to `/marketing/sites/[siteId]` with `siteId = "tracking"`. Next.js really
 * would serve that page; the page would then look up the site whose id is the
 * literal word "tracking", find nothing, and refuse. `status: "live"` and a
 * door to nowhere, at the same time.
 *
 * So the check a declared destination gets is `routeAnswerFor`, not
 * `routeStatusFor`: a href whose caller supplies NO parameter values may only
 * be served by a pattern with NO dynamic segments, and a href that DOES carry
 * an id says which segment it filled. Next.js's own specificity is untouched —
 * a genuine dynamic href still resolves to its dynamic pattern and still
 * answers.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { routeAnswerFor, routeEntryFor, routeStatusFor } from "../match";
import { SETTINGS_SECTION_IDS } from "../vocabulary";

describe("a static href may not be swallowed by a dynamic segment", () => {
  it("fails the exact href the connectors doc names, by name", () => {
    const answer = routeAnswerFor("/marketing/sites/tracking");

    // Next.js really does serve it — that is the whole trap.
    expect(answer.status).toBe("live");
    expect(answer.entry?.pattern).toBe("/marketing/sites/[siteId]");
    expect(answer.answers).toBe(false);
    expect(answer.problem).toBe(
      "`/marketing/sites/tracking` is served by `/marketing/sites/[siteId]` — it would open the site named 'tracking'.",
    );
    // The check it walked straight through, kept here so the two can never be
    // confused again.
    expect(routeStatusFor("/marketing/sites/tracking")).toBe("live");
  });

  it("passes a static href served by a wholly static pattern", () => {
    const answer = routeAnswerFor("/marketing/brands");
    expect(answer.answers).toBe(true);
    expect(answer.problem).toBeNull();
    expect(answer.entry?.pattern).toBe("/marketing/brands");
  });

  it("passes a dynamic href whose caller declares the param it filled", () => {
    const answer = routeAnswerFor("/marketing/sites/8f1c0d2e-site", {
      params: ["siteId"],
    });
    expect(answer.entry?.pattern).toBe("/marketing/sites/[siteId]");
    expect(answer.answers).toBe(true);
    expect(answer.problem).toBeNull();
  });

  it("still fails a dynamic href that declares the WRONG param", () => {
    const answer = routeAnswerFor("/marketing/sites/8f1c0d2e-site", {
      params: ["brandId"],
    });
    expect(answer.answers).toBe(false);
    expect(answer.problem).toContain("`/marketing/sites/[siteId]`");
  });

  it("fails a registered coming-soon placeholder", () => {
    const answer = routeAnswerFor("/hr/me/schedule");
    expect(answer.status).toBe("placeholder");
    expect(answer.answers).toBe(false);
    expect(answer.problem).toContain("coming-soon placeholder");
  });

  it("fails a route nothing serves", () => {
    const answer = routeAnswerFor("/tag-manager/tracking");
    expect(answer.status).toBe("unbuilt");
    expect(answer.answers).toBe(false);
    expect(answer.problem).toContain("served by no route");
  });

  it("ignores query and hash, which are the route's business", () => {
    expect(routeAnswerFor("/marketing/brands?tab=live#top").answers).toBe(true);
    expect(routeAnswerFor("/marketing/sites/tracking?x=1").problem).toContain(
      "the site named 'tracking'",
    );
  });
});

describe("Next.js specificity survives the guard", () => {
  it("serves a static segment with the static pattern, never the sibling param", () => {
    expect(routeEntryFor("/marketing/sites/new")?.pattern).toBe("/marketing/sites/new");
    expect(routeAnswerFor("/marketing/sites/new").answers).toBe(true);
  });

  it("lets an optional catch-all match zero segments", () => {
    // `/marketing/brands/[brandId]/[[...rest]]` serves a bare brand href, and
    // the catch-all that consumed nothing is not somebody's id.
    const answer = routeAnswerFor("/marketing/brands/brand-42", { params: ["brandId"] });
    expect(answer.entry?.pattern).toBe("/marketing/brands/[brandId]/[[...rest]]");
    expect(answer.answers).toBe(true);
  });

  it("treats a catch-all that DID consume segments as an undeclared param", () => {
    const answer = routeAnswerFor("/marketing/brands/brand-42/settings", {
      params: ["brandId"],
    });
    expect(answer.answers).toBe(false);
    expect(answer.problem).toContain("rest");
  });
});

describe("a route may declare its segment is a page name, and must prove it", () => {
  it("answers a settings section — the working door the first rule falsely refused", () => {
    const answer = routeAnswerFor("/user-settings/integrations");
    expect(answer.entry?.pattern).toBe("/user-settings/[[...path]]");
    expect(answer.answers).toBe(true);
    expect(answer.problem).toBeNull();
    // A nested tab under a real section answers too.
    expect(routeAnswerFor("/user-settings/ai/text-generation").answers).toBe(true);
    // And the settings home, where the catch-all consumed nothing at all.
    expect(routeAnswerFor("/user-settings").answers).toBe(true);
  });

  it("still refuses a settings href naming no section", () => {
    const answer = routeAnswerFor("/user-settings/tracking");
    expect(answer.status).toBe("live");
    expect(answer.answers).toBe(false);
    expect(answer.problem).toBe(
      "`/user-settings/tracking` is served by `/user-settings/[[...path]]` — it would open the path named 'tracking'.",
    );
  });

  /**
   * 🚨 THE VOCABULARY IS NOT A HAND LIST THAT MAY DRIFT. It is a claim about
   * `features/settings/registry.ts`, so it is diffed against that file: adding a
   * settings section, or retiring one, fails here until `vocabulary.ts` knows.
   */
  it("declares exactly the settings sections the registry declares", () => {
    const registry = readFileSync(
      path.join(__dirname, "..", "..", "..", "features", "settings", "registry.ts"),
      "utf8",
    );
    const sections = new Set(
      [...registry.matchAll(/^\s+id: "([^"]+)"/gm)].map((hit) => hit[1].split(".")[0]),
    );
    expect(sections.size).toBeGreaterThan(5); // the parse itself found something
    expect([...SETTINGS_SECTION_IDS].sort()).toEqual([...sections].sort());
  });
});
