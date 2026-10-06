/**
 * KEYWORD TAGS — a keyword holds many tags, and the filter can ask for any or
 * all of them.
 *
 * Red before the tags work:
 *   • the stamp read kept ONE value per dimension ("last wins"), so a keyword
 *     with two tags showed one;
 *   • `cleanGscFilters` had no `tags` key, so a tag filter reached the RPC as a
 *     raw string the server ignores — every keyword matched;
 *   • there was no tag write that keeps the other tags (add) or removes only
 *     the named one (`p_remove`).
 */

const rpc = jest.fn();
const readAllRows = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  __esModule: true,
  supabase: { schema: () => ({ rpc: (...args: unknown[]) => rpc(...args) }) },
}));
jest.mock("@/utils/supabase/webDb", () => ({
  requireAuthenticatedSupabaseSession: jest.fn(async () => undefined),
}));
jest.mock("@ai-matrx/data/db", () => ({
  readAllRows: (...args: unknown[]) => readAllRows(...args),
}));

import { cleanGscFilters } from "@/features/marketing/search-console/data";
import { getKeywordStampLists, getKeywordStamps } from "../data";
import { tagValueKey, writeKeywordTags } from "../tags";
import {
  tagFilterMatch,
  tagFilterValues,
  toggleTagInFilter,
  withTagFilter,
} from "../tagFilter";

const SLUG = "site_tags_2edfba58";
const SITE = "2edfba58-525b-4589-b4c0-55c06bd5c5f5";

function stampRow(keywordId: string, value: string, valueId: string) {
  return {
    keyword_id: keywordId,
    dimension: SLUG,
    dimension_label: "Tags",
    value,
    value_label: value[0].toUpperCase() + value.slice(1),
    value_id: valueId,
    source: "human",
    pinned: false,
    notes: null,
  };
}

beforeEach(() => {
  rpc.mockReset();
  readAllRows.mockReset();
});

describe("the stamp read keeps every tag", () => {
  it("returns both tags of a keyword that carries two", async () => {
    readAllRows.mockResolvedValue([
      stampRow("k1", "priority", "v1"),
      stampRow("k1", "saved", "v2"),
      stampRow("k2", "saved", "v2"),
    ]);
    const lists = await getKeywordStampLists(SITE, ["k1", "k2"], [SLUG]);
    expect(lists.get("k1")?.get(SLUG)?.map((s) => s.value)).toEqual([
      "priority",
      "saved",
    ]);
    expect(lists.get("k2")?.get(SLUG)?.map((s) => s.value)).toEqual(["saved"]);
  });

  it("still gives single-answer readers one stamp per dimension", async () => {
    readAllRows.mockResolvedValue([
      stampRow("k1", "priority", "v1"),
      stampRow("k1", "saved", "v2"),
    ]);
    const map = await getKeywordStamps(SITE, ["k1"], [SLUG]);
    expect(map.get("k1")?.get(SLUG)?.value).toBe("priority");
  });
});

describe("the tag filter reaches the server", () => {
  it("sends Any as an any-of group on the one stamp predicate", () => {
    const filters = withTagFilter({}, SLUG, ["priority", "saved"], "any");
    expect(cleanGscFilters(filters)).toEqual({
      stamps: [
        { dimension: SLUG, value: "priority", mode: "any" },
        { dimension: SLUG, value: "saved", mode: "any" },
      ],
    });
  });

  it("sends All as plain all-of pairs, beside the other stamp filters", () => {
    const filters = withTagFilter(
      { stamps: "traffic_class:money" },
      SLUG,
      ["priority", "saved"],
      "all",
    );
    expect(cleanGscFilters(filters)).toEqual({
      stamps: [
        { dimension: "traffic_class", value: "money" },
        { dimension: SLUG, value: "priority" },
        { dimension: SLUG, value: "saved" },
      ],
    });
  });

  it("toggles one tag and keeps the any/all choice", () => {
    const any = withTagFilter({}, SLUG, ["priority"], "any");
    const both = toggleTagInFilter(any, SLUG, "saved");
    expect(tagFilterValues(both)).toEqual(["priority", "saved"]);
    expect(tagFilterMatch(both)).toBe("any");
    const one = toggleTagInFilter(both, SLUG, "priority");
    expect(tagFilterValues(one)).toEqual(["saved"]);
    const none = toggleTagInFilter(one, SLUG, "saved");
    expect(none.tags).toBeUndefined();
    expect(none.tags_match).toBeUndefined();
  });
});

describe("the tag write", () => {
  it("adds tags without removing the others, creating a new one first", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      const answer =
        name === "keyword_tag_dimension_slug"
          ? { data: SLUG, error: null }
          : name === "facet_value_upsert"
            ? { data: "new-value-id", error: null }
            : { data: name === "keyword_facet_set" ? [] : "dim-id", error: null };
      const promise = Promise.resolve(answer);
      return Object.assign(promise, { abortSignal: () => promise });
    });

    const result = await writeKeywordTags({
      siteId: SITE,
      keywordIds: ["k1", "k2"],
      tags: [
        { value: "priority", label: "Priority", isNew: false },
        { value: "q4_push", label: "Q4 push", isNew: true },
      ],
    });

    expect(result.created).toEqual(["Q4 push"]);
    const upsert = calls.find(([name]) => name === "facet_value_upsert");
    expect(upsert?.[1]).toMatchObject({
      p_dimension: SLUG,
      p_value: "q4_push",
      p_label: "Q4 push",
      p_site_id: SITE,
    });
    const sets = calls.filter(([name]) => name === "keyword_facet_set");
    expect(sets.map(([, args]) => args.p_value)).toEqual(["priority", "q4_push"]);
    for (const [, args] of sets) {
      expect(args).toMatchObject({
        p_keyword_ids: ["k1", "k2"],
        p_dimension: SLUG,
        p_site_id: SITE,
        p_source: "human",
      });
      expect(args.p_remove).toBeUndefined();
    }
  });

  it("removes only the named tag", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      const promise = Promise.resolve(
        name === "keyword_tag_dimension_slug"
          ? { data: SLUG, error: null }
          : { data: [], error: null },
      );
      return Object.assign(promise, { abortSignal: () => promise });
    });

    await writeKeywordTags({
      siteId: SITE,
      keywordIds: ["k1"],
      tags: [{ value: "saved", label: "Saved", isNew: false }],
      remove: true,
    });

    expect(calls.some(([name]) => name === "facet_value_upsert")).toBe(false);
    const sets = calls.filter(([name]) => name === "keyword_facet_set");
    expect(sets).toHaveLength(1);
    expect(sets[0][1]).toMatchObject({ p_value: "saved", p_remove: true });
  });

  it("names a tag the way the agent tool does", () => {
    expect(tagValueKey("Q4 push!")).toBe("q4_push");
    expect(tagValueKey("2026 plan")).toBe("t_2026_plan");
    expect(tagValueKey("  ")).toBeNull();
  });
});
