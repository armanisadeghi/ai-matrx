/**
 * THE FALLBACK LAW, proven.
 *
 * The server's canonical check registry (aidream
 * `matrx_scraper/seo_audit.py::PAGE_CHECKS`) adds keys on its own schedule.
 * These tests assert that a key this frontend has never heard of still
 * renders a complete, actionable finding — the DB-supplied reasoning,
 * category, severity, and a REAL one-click remedy — with no code change here.
 */

import {
  humanizeItemKey,
  registeredRemedyKeys,
  resolveFindingRemedy,
  SEO_PAGE_ANALYZER_SLOT,
  type FindingRemedyContext,
} from "@/features/marketing/lib/finding-remedies";

const BASE: FindingRemedyContext = {
  itemKey: "title_presence",
  category: "on_page",
  subcategory: "metadata",
  severity: "high",
  reasoning: "This page has no <title> tag (or it is empty).",
  pageUrl: "https://example.com/pricing",
  pagePath: "/pricing",
  siteDomain: "example.com",
};

/** The eight keys the server registry is gaining — none of them need to be
 * registered here for the UI to work, which is the entire point. */
const NEW_SERVER_KEYS = [
  "broken_page_4xx",
  "server_error_5xx",
  "redirect_chain",
  "redirect_loop",
  "pagination_markup",
  "mixed_content",
  "page_weight",
  "ttfb_server_response",
];

describe("humanizeItemKey", () => {
  it("turns a snake_case key into readable words", () => {
    expect(humanizeItemKey("redirect_chain")).toBe("Redirect chain");
    expect(humanizeItemKey("ttfb_server_response")).toBe("Ttfb server response");
  });

  it("never returns an empty label", () => {
    expect(humanizeItemKey("")).toBe("Unnamed check");
    expect(humanizeItemKey("___")).toBe("Unnamed check");
  });
});

describe("resolveFindingRemedy — a completely unknown item_key", () => {
  const ctx: FindingRemedyContext = {
    itemKey: "hreflang_return_tag_missing_v3",
    category: "international",
    subcategory: "hreflang",
    severity: "med",
    reasoning:
      "This page declares an alternate for fr-FR, but that page does not point back here.",
    pageUrl: "https://example.com/pricing",
    pagePath: "/pricing",
    siteDomain: "example.com",
  };
  const resolved = resolveFindingRemedy(ctx);

  it("is flagged as unknown but still fully resolved", () => {
    expect(resolved.isUnknownKey).toBe(true);
  });

  it("titles the finding from the key when the catalogue has no label", () => {
    expect(resolved.title).toBe("Hreflang return tag missing v3");
  });

  it("uses the server's reasoning sentence as the explanation", () => {
    expect(resolved.explanation).toBe(ctx.reasoning);
    expect(resolved.explanationFromServer).toBe(true);
  });

  it("still offers a REAL one-click remedy", () => {
    expect(resolved.remedy.kind).toBe("ai");
    if (resolved.remedy.kind !== "ai") throw new Error("expected an ai remedy");
    expect(resolved.remedy.action.kind).toBe("launch_agent");
    if (resolved.remedy.action.kind !== "launch_agent") {
      throw new Error("expected launch_agent");
    }
    expect(resolved.remedy.action.slotKey).toBe(SEO_PAGE_ANALYZER_SLOT);
    // The brief carries the finding the user is looking at — key, page, and
    // the analyzer's own words.
    const draft = resolved.remedy.action.draftText ?? "";
    expect(draft).toContain(ctx.itemKey);
    expect(draft).toContain("https://example.com/pricing");
    expect(draft).toContain(ctx.reasoning as string);
  });
});

describe("resolveFindingRemedy — the eight incoming server checks", () => {
  it.each(NEW_SERVER_KEYS)("%s resolves to an actionable remedy", (key) => {
    const resolved = resolveFindingRemedy({
      ...BASE,
      itemKey: key,
      reasoning: `Synthetic reasoning for ${key}.`,
    });
    expect(resolved.title.length).toBeGreaterThan(0);
    expect(resolved.explanation).toBe(`Synthetic reasoning for ${key}.`);
    if (resolved.remedy.kind === "manual") {
      // An honest instruction: it must actually say something, and it must
      // name the page it is about.
      expect(resolved.remedy.instruction.length).toBeGreaterThan(40);
      expect(resolved.remedy.instruction).toContain("https://example.com/pricing");
      expect(resolved.remedy.where.length).toBeGreaterThan(0);
    } else {
      expect(resolved.remedy.action.kind).toBe("launch_agent");
    }
  });
});

describe("resolveFindingRemedy — degradation", () => {
  it("falls back to the catalogue description when there is no reasoning", () => {
    const resolved = resolveFindingRemedy({
      itemKey: "title_length",
      itemDescription: "Titles should fit the space search engines give them.",
    });
    expect(resolved.explanation).toBe(
      "Titles should fit the space search engines give them.",
    );
    expect(resolved.explanationFromServer).toBe(false);
  });

  it("still explains itself with nothing but an item key", () => {
    const resolved = resolveFindingRemedy({ itemKey: "some_new_check" });
    expect(resolved.explanation).toContain("Some new check");
    expect(resolved.explanation).toContain("this page");
    expect(resolved.remedy.kind).toBe("ai");
  });

  it("prefers the catalogue label for the title when present", () => {
    const resolved = resolveFindingRemedy({
      ...BASE,
      itemLabel: "Missing page title",
    });
    expect(resolved.title).toBe("Missing page title");
  });
});

describe("every registered remedy is actionable", () => {
  it.each(registeredRemedyKeys())("%s", (key) => {
    const { remedy } = resolveFindingRemedy({ ...BASE, itemKey: key });
    expect(remedy.title.length).toBeGreaterThan(0);
    expect(remedy.summary.length).toBeGreaterThan(0);
    if (remedy.kind === "manual") {
      expect(remedy.instruction.trim().length).toBeGreaterThan(40);
    } else {
      expect(remedy.action.kind).toBe("launch_agent");
      if (remedy.action.kind !== "launch_agent") return;
      expect((remedy.action.draftText ?? "").length).toBeGreaterThan(40);
    }
  });
});
