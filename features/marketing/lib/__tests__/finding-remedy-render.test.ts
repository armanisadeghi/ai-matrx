/**
 * Finding remedies come from the database (`web.analysis_item.remedy`, OSP-24)
 * and this module only renders them.
 *
 * Proven here:
 *  - THE ONE-COPY LAW: the old frontend registry file is gone and the renderer
 *    carries no remedy content keyed by check (no item-key literal, no map);
 *  - a stored `manual` remedy fills {page}/{page_url}/{page_href} for the page;
 *  - a stored `ai` remedy becomes a real launch_agent action whose brief carries
 *    the finding, and `apply_to_page` appends the one-click apply sentence;
 *  - THE FALLBACK LAW: no stored remedy (or a malformed one) renders the
 *    GENERIC remedy and says so (`isUnknownKey`), never null, never a throw.
 *
 * The stored shapes below are copied from the migration that filled the column
 * (aidream db/migrations/20260927210000_lane_f_analysis_item_remedy.sql).
 */

import fs from "node:fs";
import path from "node:path";

import {
  fillRemedyTemplate,
  humanizeItemKey,
  parseStoredRemedy,
  resolveFindingRemedy,
  SEO_PAGE_ANALYZER_MANDATE,
  type FindingRemedyContext,
} from "@/features/marketing/lib/finding-remedy-render";

const LIB = path.join(process.cwd(), "features/marketing/lib");

const CANONICAL_PRESENCE = {
  kind: "manual",
  title: "Tell search engines this is the original",
  summary:
    "This page does not declare which address is the real one, so duplicates can compete with it.",
  instruction:
    'On {page}, set the "canonical URL" to this page\'s own address:\n  {page_url}\n\nIn raw HTML it is one line in the page\'s <head>:\n  <link rel="canonical" href="{page_href}">',
  where: "your website's page SEO settings",
};

const TITLE_LENGTH = {
  kind: "ai",
  title: "Rewrite the title to fit",
  summary:
    "The SEO agent rewrites the headline so search engines show all of it. You approve it before anything changes.",
  ask: "This page's search-results title is the wrong length. Propose 3 replacement titles.",
  apply_to_page: true,
};

const BASE: FindingRemedyContext = {
  itemKey: "canonical_presence",
  category: "on_page",
  subcategory: "canonical",
  severity: "high",
  reasoning: "This page declares no canonical URL.",
  pageUrl: "https://example.com/pricing",
  pagePath: "/pricing",
  siteDomain: "example.com",
};

describe("one copy: the remedies live in the database", () => {
  it("the frontend remedy registry file no longer exists", () => {
    expect(fs.existsSync(path.join(LIB, "finding-remedies.ts"))).toBe(false);
  });

  it("the renderer names no check and holds no remedy map", () => {
    const source = fs.readFileSync(path.join(LIB, "finding-remedy-render.ts"), "utf8");
    for (const key of ["title_presence", "canonical_presence", "broken_page_4xx", "redirect_loop"]) {
      expect(source).not.toContain(`${key}:`);
    }
    expect(source).not.toMatch(/const REMEDIES\b/);
  });
});

describe("a stored manual remedy", () => {
  const resolved = resolveFindingRemedy({ ...BASE, remedy: CANONICAL_PRESENCE });

  it("is used, not the generic fallback", () => {
    expect(resolved.isUnknownKey).toBe(false);
    expect(resolved.remedy.kind).toBe("manual");
    expect(resolved.remedy.title).toBe(CANONICAL_PRESENCE.title);
  });

  it("fills the page into every template", () => {
    if (resolved.remedy.kind !== "manual") throw new Error("expected manual");
    expect(resolved.remedy.instruction).toContain("On https://example.com/pricing,");
    expect(resolved.remedy.instruction).toContain('href="https://example.com/pricing"');
    expect(resolved.remedy.instruction).not.toMatch(/\{page(_url|_href)?\}/);
  });

  it("degrades the templates when the page has no url", () => {
    const text = fillRemedyTemplate("{page} | {page_url} | {page_href}", {
      itemKey: "x",
    });
    expect(text).toBe(
      "this page | the page's full https:// address | https://your-page-address",
    );
  });
});

describe("a stored ai remedy", () => {
  const resolved = resolveFindingRemedy({
    ...BASE,
    itemKey: "title_length",
    remedy: TITLE_LENGTH,
  });

  it("is a real launch_agent action with the finding briefed", () => {
    if (resolved.remedy.kind !== "ai") throw new Error("expected ai");
    const action = resolved.remedy.action;
    if (action.kind !== "launch_agent") throw new Error("expected launch_agent");
    expect(action.mandateKey).toBe(SEO_PAGE_ANALYZER_MANDATE);
    expect(action.draftText).toContain("Check: title_length");
    expect(action.draftText).toContain("https://example.com/pricing");
    expect(action.draftText).toContain(TITLE_LENGTH.ask);
  });

  it("apply_to_page appends the one-click apply sentence", () => {
    if (resolved.remedy.kind !== "ai") throw new Error("expected ai");
    const action = resolved.remedy.action;
    if (action.kind !== "launch_agent") throw new Error("expected launch_agent");
    expect(action.draftText).toContain("apply the winner to the page in one click");
  });
});

describe("the fallback law", () => {
  it.each([
    ["no remedy", null],
    ["a malformed remedy", { kind: "manual", title: "x" }],
    ["an unknown kind", { kind: "magic", title: "t", summary: "s" }],
  ])("%s renders the generic remedy and announces it", (_label, remedy) => {
    const resolved = resolveFindingRemedy({ ...BASE, itemKey: "brand_new_check", remedy });
    expect(resolved.isUnknownKey).toBe(true);
    expect(resolved.remedy.kind).toBe("ai");
    expect(resolved.remedy.summary).toContain("No fix is written down for this check yet");
    expect(resolved.explanation).toBe(BASE.reasoning);
  });

  it("parseStoredRemedy refuses a non-object", () => {
    expect(parseStoredRemedy("title_length")).toBeNull();
    expect(parseStoredRemedy([1, 2])).toBeNull();
  });

  it("still explains itself with nothing but an item key", () => {
    const resolved = resolveFindingRemedy({ itemKey: "some_new_check" });
    expect(resolved.title).toBe("Some new check");
    expect(resolved.explanation).toContain("this page");
  });

  it("humanizeItemKey never returns an empty label", () => {
    expect(humanizeItemKey("___")).toBe("Unnamed check");
    expect(humanizeItemKey("redirect_chain")).toBe("Redirect chain");
  });
});
