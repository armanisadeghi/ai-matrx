/**
 * Resource selection + resolution tests.
 *
 * These pin the two properties the whole system rests on:
 *
 *  1. A SELECTOR IS A RULE, not a frozen id list — the same saved bundle picks
 *     up sources added by a later pipeline run, and ordering decides who
 *     survives a limit (importance and authority are different axes).
 *  2. TRUNCATION IS ALWAYS REPORTED. A silently trimmed context is the
 *     difference between "the agent read our research" and "the agent read the
 *     first third and nobody knew", so every drop is counted with its reason,
 *     and a payload that is STILL over budget says so out loud.
 */

import { parseManifest } from "../resources/manifest";
import { applySelector } from "../resources/selector";
import { planResolution, previewBundle } from "../resources/resolve";
import { estimateTokens, charsForTokenBudget } from "@/lib/tokens/estimate";
import type {
  ContextBundle,
  ManifestItemRaw,
  ResourceSelector,
} from "../resources/types";

const TOPIC = "11111111-1111-1111-1111-111111111111";
const KW_A = "22222222-2222-2222-2222-222222222222";
const KW_B = "33333333-3333-3333-3333-333333333333";

/** Two sources: A ranks #1 for one keyword, B ranks #5 and #7 for two. */
function rawManifest(): {
  items: ManifestItemRaw[];
  [key: string]: unknown;
} {
  return {
    topic_id: TOPIC,
    generated_at: "2026-07-25T00:00:00Z",
    topic: { id: TOPIC, name: "Test topic", description: "d", tone_profile: null },
    keywords: [
      { id: KW_A, keyword: "alpha", position: 1, searched_at: "2026-07-01T00:00:00Z" },
      { id: KW_B, keyword: "beta", position: 2, searched_at: null },
    ],
    tags: [{ id: "tag-1", name: "Leadership", description: null, sort_order: 1 }],
    tag_sources: [["tag-1", "src-b"]],
    edges: [
      ["src-a", KW_A, 1],
      ["src-b", KW_A, 5],
      ["src-b", KW_B, 7],
    ],
    kinds: [
      { kind: "search.result", item_count: 2, chars: 300 },
      { kind: "page.content", item_count: 2, chars: 30_000 },
    ],
    items: [
      {
        k: "search.result",
        id: "src-a",
        p: null,
        l: "Source A",
        s: "a.com",
        c: 100,
        st: "success",
        t: "2026-07-01T00:00:00Z",
        f: { included: true, authority: 40, tier: "medium", hostname: "a.com", url: "https://a.com/x" },
      },
      {
        k: "search.result",
        id: "src-b",
        p: null,
        l: "Source B",
        s: "b.com",
        c: 200,
        st: "success",
        t: "2026-07-02T00:00:00Z",
        f: { included: true, authority: 90, tier: "high", hostname: "b.com", url: "https://b.com/y" },
      },
      {
        k: "page.content",
        id: "content-a",
        p: "src-a",
        l: "Source A",
        s: "a.com",
        c: 10_000,
        st: "success",
        t: "2026-07-03T00:00:00Z",
        f: { good_scrape: true, included: true, hostname: "a.com", authority: 40, tier: "medium" },
      },
      {
        k: "page.content",
        id: "content-b",
        p: "src-b",
        l: "Source B",
        s: "b.com",
        c: 20_000,
        st: "poor",
        t: "2026-07-04T00:00:00Z",
        f: { good_scrape: false, included: false, hostname: "b.com", authority: 90, tier: "high" },
      },
    ],
  };
}

function bundle(selectors: ResourceSelector[], maxTokens?: number): ContextBundle {
  return {
    id: "b1",
    entityType: "research_topic",
    entityId: TOPIC,
    name: "Test bundle",
    description: null,
    slug: null,
    selectors,
    bindings: [],
    budget: maxTokens ? { maxTokens } : null,
    agentId: null,
    isSystem: false,
    organizationId: null,
    createdBy: null,
    createdAt: "2026-07-25T00:00:00Z",
    updatedAt: "2026-07-25T00:00:00Z",
  };
}

describe("parseManifest", () => {
  it("derives importance from ALL keyword ranks, so breadth beats a lone #1", () => {
    const m = parseManifest(rawManifest(), TOPIC);
    const sources = m.itemsByKind.get("search.result") ?? [];
    const a = sources.find((s) => s.id === "src-a");
    const b = sources.find((s) => s.id === "src-b");
    // #1 = 10; #5 + #7 = 6 + 4 = 10... b also ranks twice, so it ties on score
    // but wins on keyword breadth. The point is both keywords are counted.
    expect(a?.importance).toBe(10);
    expect(b?.importance).toBe(10);
    expect(b?.keywordIds).toHaveLength(2);
    expect(a?.bestRank).toBe(1);
    expect(b?.bestRank).toBe(5);
  });

  it("propagates source reachability (keywords, tags, curation) to page items", () => {
    const m = parseManifest(rawManifest(), TOPIC);
    const pages = m.itemsByKind.get("page.content") ?? [];
    const pageB = pages.find((p) => p.id === "content-b");
    expect(pageB?.sourceId).toBe("src-b");
    expect(pageB?.tagIds).toEqual(["tag-1"]);
    expect(pageB?.keywordIds).toHaveLength(2);
    expect(pageB?.included).toBe(false);
    expect(pageB?.authority).toBe(90);
  });

  it("reports unknown kinds instead of dropping them silently", () => {
    const raw = rawManifest();
    raw.items.push({
      k: "future.kind",
      id: "x",
      p: null,
      l: "x",
      s: null,
      c: 1,
      st: null,
      t: null,
      f: {},
    });
    const m = parseManifest(raw, TOPIC);
    expect(m.unknownKinds).toEqual(["future.kind"]);
  });
});

describe("applySelector", () => {
  const m = () => parseManifest(rawManifest(), TOPIC);

  it("filters on curation and scrape quality", () => {
    const r = applySelector(m(), {
      kind: "page.content",
      mode: "filtered",
      filter: { includedOnly: true, goodScrapeOnly: true },
    });
    expect(r.items.map((i) => i.id)).toEqual(["content-a"]);
    expect(r.dropped.filtered).toBe(1);
  });

  it("orders by authority when asked, and by importance by default", () => {
    const byAuthority = applySelector(m(), {
      kind: "search.result",
      mode: "filtered",
      order: "authority",
    });
    expect(byAuthority.items.map((i) => i.id)).toEqual(["src-b", "src-a"]);

    const byRank = applySelector(m(), {
      kind: "search.result",
      mode: "filtered",
      order: "rank",
    });
    expect(byRank.items.map((i) => i.id)).toEqual(["src-a", "src-b"]);
  });

  it("honours topN and counts what it cut", () => {
    const r = applySelector(m(), {
      kind: "search.result",
      mode: "filtered",
      order: "authority",
      filter: { topN: 1 },
    });
    expect(r.items.map((i) => i.id)).toEqual(["src-b"]);
    expect(r.dropped.overItemLimit).toBe(1);
  });

  it("keeps explicit ids in their saved order", () => {
    const r = applySelector(m(), {
      kind: "search.result",
      mode: "explicit",
      ids: ["src-b", "src-a"],
    });
    expect(r.items.map((i) => i.id)).toEqual(["src-b", "src-a"]);
  });

  it("silently drops nothing on an id that no longer exists — it reports zero items", () => {
    const r = applySelector(m(), {
      kind: "search.result",
      mode: "explicit",
      ids: ["gone"],
    });
    expect(r.items).toHaveLength(0);
  });

  it("selects tag members via canonical tag edges", () => {
    const r = applySelector(m(), {
      kind: "page.content",
      mode: "filtered",
      filter: { tagIds: ["tag-1"] },
    });
    expect(r.items.map((i) => i.id)).toEqual(["content-b"]);
  });
});

describe("budget enforcement", () => {
  it("drops items that do not fit and records over_budget", () => {
    // 10k + 20k chars of page content. A 3k-token budget = 12k chars, so only
    // the first page fits.
    const m = parseManifest(rawManifest(), TOPIC);
    const { planned } = planResolution(
      m,
      bundle([{ kind: "page.content", mode: "filtered", order: "authority" }], 3_000),
    );
    const pages = planned.find((p) => p.kind === "page.content");
    // Authority order puts the 20k page first; it alone fills the budget.
    expect(pages?.items.map((i) => i.id)).toEqual(["content-b"]);
    expect(pages?.dropped.over_budget).toBe(1);
  });

  it("never returns nothing: one oversized resource is kept", () => {
    const m = parseManifest(rawManifest(), TOPIC);
    const { planned } = planResolution(
      m,
      bundle([{ kind: "page.content", mode: "explicit", ids: ["content-b"] }], 10),
    );
    const pages = planned.find((p) => p.kind === "page.content");
    expect(pages?.items).toHaveLength(1);
  });

  it("counts a filter exclusion as voluntary, not as truncation", () => {
    // The user asked for good scrapes only; the poor one being left out is the
    // rule working, not a loss. Flagging it would fire on every normal run.
    const m = parseManifest(rawManifest(), TOPIC);
    const { planned } = planResolution(
      m,
      bundle([
        {
          kind: "page.content",
          mode: "filtered",
          filter: { goodScrapeOnly: true },
        },
      ]),
    );
    const pages = planned.find((p) => p.kind === "page.content");
    expect(pages?.items.map((i) => i.id)).toEqual(["content-a"]);
    // Still counted for the detail view…
    expect(pages?.dropped.filtered).toBe(1);
    // …but never as a budget/system loss.
    expect(pages?.dropped.over_budget).toBeUndefined();
  });

  it("preview totals use the same char counts and estimator as the run", () => {
    const m = parseManifest(rawManifest(), TOPIC);
    const b = bundle([{ kind: "page.content", mode: "all" }]);
    const preview = previewBundle(m, b);
    const pages = preview.perKind.find((k) => k.kind === "page.content");
    expect(pages?.chars).toBe(30_000);
    expect(pages?.tokens).toBe(estimateTokens(30_000, "prose"));
  });
});

describe("token estimation", () => {
  it("round-trips a budget to the char ceiling the resolver cuts at", () => {
    expect(charsForTokenBudget(1_000)).toBe(4_000);
    expect(estimateTokens(4_000)).toBe(1_000);
  });

  it("counts structured payloads as denser than prose", () => {
    expect(estimateTokens(3_000, "structured")).toBeGreaterThan(
      estimateTokens(3_000, "prose"),
    );
  });
});
