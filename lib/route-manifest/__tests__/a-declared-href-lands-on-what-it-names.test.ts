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

import { settingsRegistry } from "@/features/settings/registry";

import { routeAnswerFor, routeEntryFor, routeStatusFor } from "../match";
import { SETTINGS_TAB_IDS } from "../vocabulary";

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

  it("passes a dynamic href whose caller supplies the VALUE it filled", () => {
    const answer = routeAnswerFor("/marketing/sites/8f1c0d2e-site", {
      params: { siteId: "8f1c0d2e-site" },
    });
    expect(answer.entry?.pattern).toBe("/marketing/sites/[siteId]");
    expect(answer.answers).toBe(true);
    expect(answer.problem).toBeNull();
  });

  it("still fails a dynamic href that declares the WRONG param", () => {
    const answer = routeAnswerFor("/marketing/sites/8f1c0d2e-site", {
      params: { brandId: "8f1c0d2e-site" },
    });
    expect(answer.answers).toBe(false);
    expect(answer.problem).toContain("`/marketing/sites/[siteId]`");
  });

  /**
   * 🚨 A DECLARATION IS NOT A FACT (V-29 NEW-6). `params` used to be a list of
   * NAMES, and a name simply switched the check off for that segment — so
   * `routeAnswerFor("/marketing/sites/tracking", { params: ["siteId"] })`
   * answered TRUE: the one href this whole suite exists to refuse, waved
   * through by the caller's own say-so. The first action that legitimately
   * carries a param would have disabled the guard for its own row, hardcoded
   * literal and all.
   */
  it("refuses the door-to-nowhere href even when the caller DECLARES the param", () => {
    const answer = routeAnswerFor("/marketing/sites/tracking", {
      params: { siteId: "8f1c0d2e-site" },
    });
    expect(answer.answers).toBe(false);
    expect(answer.problem).toBe(
      "`/marketing/sites/tracking` declares `siteId` = '8f1c0d2e-site', but its `[siteId]` segment carries 'tracking' — the href does not name what the caller says it does.",
    );
  });

  it("refuses a param declared by NAME only, and says the declaration proves nothing", () => {
    const answer = routeAnswerFor("/marketing/sites/tracking", {
      params: ["siteId"],
    });
    expect(answer.answers).toBe(false);
    expect(answer.problem).toBe(
      "`/marketing/sites/tracking` declares the parameter `siteId` but supplies no value for it, so nothing checked that 'tracking' is a real site and not a literal word — pass `params: { siteId: <the value in the href> }`.",
    );
    // Even a genuine id is unverified when only the NAME was declared: the
    // whole point is that nobody compared the href to the value.
    expect(routeAnswerFor("/marketing/sites/8f1c0d2e-site", { params: ["siteId"] }).answers).toBe(
      false,
    );
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

  /**
   * 🚨 AN ABSOLUTE ADDRESS IS NOT A 404 (V-29 NEW-9). This used to come back
   * "served by no route in the manifest — it is a 404", sending the reader to
   * hunt for a route that was never missing. It fails safe either way; the
   * sentence is the defect.
   */
  it("calls an absolute href external, never a missing route", () => {
    const answer = routeAnswerFor("https://aimatrx.com/marketing/sites/tracking");
    expect(answer.answers).toBe(false);
    expect(answer.external).toBe(true);
    expect(answer.problem).toBe(
      "`https://aimatrx.com/marketing/sites/tracking` is an absolute address, not a path this app routes — an external address is never a route door; use an explicit external action.",
    );
    expect(answer.problem).not.toContain("404");

    for (const href of [
      "http://example.com/x",
      "//aimatrx.com/marketing/brands",
      "mailto:support@aimatrx.com",
      "tel:+15555550100",
    ]) {
      const external = routeAnswerFor(href);
      expect(external.external).toBe(true);
      expect(external.problem).toContain("an external address is never a route door");
    }

    // A same-origin path is still judged as a path, absolute-looking or not.
    expect(routeAnswerFor("/marketing/brands").external).toBeUndefined();
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
    const answer = routeAnswerFor("/marketing/brands/brand-42", {
      params: { brandId: "brand-42" },
    });
    expect(answer.entry?.pattern).toBe("/marketing/brands/[brandId]/[[...rest]]");
    expect(answer.answers).toBe(true);
  });

  it("treats a catch-all that DID consume segments as an undeclared param", () => {
    const answer = routeAnswerFor("/marketing/brands/brand-42/settings", {
      params: { brandId: "brand-42" },
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
   * 🚨 EVERY SEGMENT IS JUDGED, NOT JUST THE FIRST (V-29 NEW-7). The first
   * version of the vocabulary read segment ONE and stopped, so
   * `/user-settings/integrations/not-a-real-tab` — a real section and a tab
   * that does not exist — answered TRUE inside the guard whose only question is
   * whether following the href lands on what it names. The settings URL is one
   * whole tab id (`urlToTabId`), and an id the registry does not carry renders
   * no tab at all.
   */
  it("refuses a real settings section with a sub-tab that does not exist", () => {
    const answer = routeAnswerFor("/user-settings/integrations/not-a-real-tab");
    expect(answer.status).toBe("live");
    expect(answer.answers).toBe(false);
    expect(answer.problem).toBe(
      "`/user-settings/integrations/not-a-real-tab` is served by `/user-settings/[[...path]]` — it would open the path named 'integrations/not-a-real-tab'.",
    );
    // …and the real sub-tab beside it still answers.
    expect(routeAnswerFor("/user-settings/integrations/google-workspace").answers).toBe(true);
    // A category that is not itself a tab is as dead as any other literal:
    // `communication.email` is a tab, `communication` is not.
    expect(routeAnswerFor("/user-settings/communication").answers).toBe(false);
    expect(routeAnswerFor("/user-settings/communication/email").answers).toBe(true);
  });

  /**
   * 🚨 THE VOCABULARY IS NOT A HAND LIST THAT MAY DRIFT, AND THE DRIFT GUARD IS
   * NOT A REGEX (V-29 NEW-7). This used to `readFileSync` the registry and
   * match `^\s+id: "…"`, which measures ONE SPELLING IN ONE FILE: a section id
   * written with single quotes, computed, or declared in another module walked
   * straight past it. It now imports the registry's REAL export, so the check
   * is against the ids the app actually renders.
   */
  it("declares exactly the tab ids the settings registry really exports", () => {
    const ids = settingsRegistry.map((tab) => tab.id).sort();
    expect(ids.length).toBeGreaterThan(20); // the import itself found something
    expect([...SETTINGS_TAB_IDS].sort()).toEqual(ids);
  });

  it("answers every href the registry's own tab ids build", () => {
    const dead = settingsRegistry
      .map((tab) => ({
        id: tab.id,
        href: `/user-settings/${tab.id
          .split(".")
          .map((part) => part.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase())
          .join("/")}`,
      }))
      .map((row) => ({ ...row, problem: routeAnswerFor(row.href).problem }))
      .filter((row) => row.problem !== null);
    expect(dead).toEqual([]);
  });

  /**
   * The taxonomy-driven configuration sections are built at runtime from the
   * org's registry domains (`features/settings/universal/configTree.ts`), so
   * this file cannot enumerate their leaves — the `config` root answers, and
   * this test is the written statement that its leaves are NOT checked.
   */
  it("answers a config-rooted settings href, whose leaves it cannot enumerate", () => {
    expect(routeAnswerFor("/user-settings/config").answers).toBe(true);
    expect(routeAnswerFor("/user-settings/config/marketing/sites").answers).toBe(true);
  });
});
