/**
 * Delivery tests — `delivery: "context"` bindings send lazy resource_refs
 * instead of injected text.
 *
 * The properties pinned here:
 *  1. A context-delivered kind never costs the token budget and never evicts a
 *     direct kind's items.
 *  2. Resolution emits one `resource_ref` envelope per selected item, typed by
 *     the catalog's `resourceType`, and fetches NO bodies for them.
 *  3. Kinds that cannot travel as refs (derived — no row) fall back to direct
 *     delivery rather than silently sending nothing.
 */

import { parseManifest } from "../resources/manifest";
import {
  deliveryFor,
  planResolution,
  previewBundle,
  resolveBundle,
} from "../resources/resolve";
import type {
  BundleBinding,
  ContextBundle,
  ManifestItemRaw,
  ResourceSelector,
} from "../resources/types";

const TOPIC = "11111111-1111-1111-1111-111111111111";

function rawManifest(): { items: ManifestItemRaw[]; [key: string]: unknown } {
  return {
    topic_id: TOPIC,
    generated_at: "2026-07-25T00:00:00Z",
    topic: { id: TOPIC, name: "Test topic", description: "d", tone_profile: null },
    keywords: [],
    tags: [],
    tag_sources: [],
    edges: [],
    kinds: [
      { kind: "search.result", item_count: 1, chars: 100 },
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
        f: { included: true, url: "https://a.com/x" },
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
        f: { good_scrape: true, included: true },
      },
      {
        k: "page.content",
        id: "content-b",
        p: "src-a",
        l: "Source A again",
        s: "a.com",
        c: 20_000,
        st: "success",
        t: "2026-07-04T00:00:00Z",
        f: { good_scrape: true, included: true },
      },
    ],
  };
}

function bundle(
  selectors: ResourceSelector[],
  bindings: BundleBinding[],
  maxTokens?: number,
): ContextBundle {
  return {
    id: "b1",
    entityType: "research_topic",
    entityId: TOPIC,
    name: "Test bundle",
    description: null,
    slug: null,
    selectors,
    bindings,
    budget: maxTokens ? { maxTokens } : null,
    agentId: null,
    isSystem: false,
    organizationId: null,
    createdBy: null,
    createdAt: "2026-07-25T00:00:00Z",
    updatedAt: "2026-07-25T00:00:00Z",
  };
}

const m = () => parseManifest(rawManifest(), TOPIC);

describe("deliveryFor", () => {
  it("honours a context binding on a row-backed kind", () => {
    const b = bundle(
      [{ kind: "page.content", mode: "all" }],
      [{ variable: "scraped_pages", kinds: ["page.content"], delivery: "context" }],
    );
    expect(deliveryFor(b, "page.content")).toBe("context");
  });

  it("falls back to direct for derived kinds — they have no row to reference", () => {
    const b = bundle(
      [{ kind: "topic.brief", mode: "all" }],
      [{ variable: "research_brief", kinds: ["topic.brief"], delivery: "context" }],
    );
    expect(deliveryFor(b, "topic.brief")).toBe("direct");
  });

  it("defaults to direct with no binding or no delivery field", () => {
    const b = bundle(
      [{ kind: "page.content", mode: "all" }],
      [{ variable: "scraped_pages", kinds: ["page.content"] }],
    );
    expect(deliveryFor(b, "page.content")).toBe("direct");
  });
});

describe("budget interaction", () => {
  it("context kinds cost the budget nothing and never evict direct items", () => {
    // Budget sized so 30k chars of page content could NOT also fit the
    // search result if pages were counted — as context, they must not count.
    const b = bundle(
      [
        { kind: "page.content", mode: "all" },
        { kind: "search.result", mode: "all" },
      ],
      [
        { variable: "scraped_pages", kinds: ["page.content"], delivery: "context" },
        { variable: "search_results", kinds: ["search.result"] },
      ],
      1_000,
    );
    const { planned } = planResolution(m(), b);
    const pages = planned.find((p) => p.kind === "page.content");
    const search = planned.find((p) => p.kind === "search.result");
    expect(pages?.items).toHaveLength(2);
    expect(pages?.dropped.over_budget).toBeUndefined();
    expect(search?.items).toHaveLength(1);
  });

  it("preview reports context kinds at 0 tokens with their delivery flagged", () => {
    const b = bundle(
      [{ kind: "page.content", mode: "all" }],
      [{ variable: "scraped_pages", kinds: ["page.content"], delivery: "context" }],
    );
    const p = previewBundle(m(), b);
    const pages = p.perKind.find((k) => k.kind === "page.content");
    expect(pages?.delivery).toBe("context");
    expect(pages?.tokens).toBe(0);
    // Size is still shown honestly; only the injected cost is zero.
    expect(pages?.chars).toBe(30_000);
    expect(p.tokens).toBe(0);
  });
});

describe("resolveBundle with context delivery", () => {
  it("emits one typed resource_ref per item, fetches no bodies, injects no text", async () => {
    const b = bundle(
      [{ kind: "page.content", mode: "all" }],
      [{ variable: "scraped_pages", kinds: ["page.content"], delivery: "context" }],
    );
    // No supabase mock needed: a context-delivered kind must not fetch. If this
    // resolution ever reaches fetchBodies, the test environment's missing
    // client will throw — which is exactly the regression this pins.
    const resolved = await resolveBundle(m(), b);
    expect(resolved.variables.scraped_pages).toBeUndefined();
    expect(Object.keys(resolved.contextRefs).sort()).toEqual([
      "scraped_pages_1",
      "scraped_pages_2",
    ]);
    expect(resolved.contextRefs.scraped_pages_1).toEqual({
      __kind: "resource_ref",
      resource_type: "research_content",
      resource_id: "content-a",
    });
    const perKind = resolved.report.perKind.find(
      (k) => k.kind === "page.content",
    );
    expect(perKind?.delivery).toBe("context");
    expect(perKind?.included).toBe(2);
    expect(perKind?.tokens).toBe(0);
    expect(
      resolved.report.notes.some((n) => n.includes("lazy context")),
    ).toBe(true);
  });

  it("uses the bare variable name when exactly one item travels", async () => {
    const b = bundle(
      [{ kind: "page.content", mode: "explicit", ids: ["content-a"] }],
      [{ variable: "scraped_pages", kinds: ["page.content"], delivery: "context" }],
    );
    const resolved = await resolveBundle(m(), b);
    expect(Object.keys(resolved.contextRefs)).toEqual(["scraped_pages"]);
  });
});
