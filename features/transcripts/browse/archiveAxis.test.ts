/**
 * /transcripts has Archive (with Undo) — and now the Archived filter that finds what it archived.
 *
 * 2026-09-30: the list sent no archive option, so `trx_list_scoped` only ever listed active rows
 * and an archived transcript could be reached only through Undo or Trash. The list, its lane
 * counts and its facets now carry the axis (active | archived | all).
 */

const rpc = jest.fn();
/** One page of a paged call, by row range; unset = the whole mocked result. */
let page: ((from: number, to: number) => unknown) | null = null;
jest.mock("@/utils/supabase/client", () => {
  const supabase = {
    rpc: (...a: unknown[]) => {
      const whole = rpc(...a);
      const builder = Object.assign(Promise.resolve(whole), {
        order: () => builder,
        range: (from: number, to: number) => Promise.resolve(page ? page(from, to) : whole),
      });
      return builder;
    },
    // Facet and count reads go through `platform.list_rpc_once` (lib/entity-list/readListRpc.ts):
    // ONE request that runs the named function and answers every row. The stand-in unwraps
    // that envelope so the assertions below see the function that was actually asked for.
    schema: () => ({
      rpc: (_once: string, envelope: { p_fn: string; p_args: unknown }) => rpc(envelope.p_fn, envelope.p_args),
    }),
  };
  return { supabase };
});
jest.mock("@/utils/supabase/writeOne", () => ({ tryWriteOne: jest.fn() }));

import { DEFAULT_ENTITY_LIST_QUERY, type EntityListQuery } from "@/lib/entity-list/types";
import { fetchTranscriptFacets, fetchTranscriptListPage, fetchTranscriptScopeCounts } from "./service";
import { transcriptListConfig } from "./listConfig";

const sort = { sort: "updated", direction: "desc", pageSize: 25 } as never;

function query(archived: EntityListQuery["archived"]): EntityListQuery {
  return { ...DEFAULT_ENTITY_LIST_QUERY, archived, filters: { kind: { values: ["transcript"] } } as never };
}

beforeEach(() => {
  page = null;
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
});

it.each(["active", "archived", "all"] as const)("the list sends the archive option (%s) beside its filters", async (a) => {
  await fetchTranscriptListPage(query(a), sort);
  const [fn, args] = rpc.mock.calls[0]!;
  expect(fn).toBe("trx_list_scoped");
  expect(args.p_filters).toEqual({ kind: { values: ["transcript"] }, archived: { value: a } });
});

it("the lane counts read the same archive option as the list", async () => {
  await fetchTranscriptScopeCounts(query("archived"));
  const [fn, args] = rpc.mock.calls[0]!;
  expect(fn).toBe("trx_list_scope_counts");
  expect(args.p_filters.archived).toEqual({ value: "archived" });
});

it.each(["active", "archived", "all"] as const)(
  "the facets come from trx_list_facets for every archive option (%s) — one path, no browser counting",
  async (a) => {
    rpc.mockResolvedValue({
      data: [
        { kind: "kind", value: "transcript", total: 1 },
        { kind: "kind", value: "session", total: 13 },
        { kind: "shown_to", value: "internal", total: 14 },
        { kind: "archived", value: "archived", total: a === "active" ? 0 : 14 },
      ],
      error: null,
    });
    const facets = await fetchTranscriptFacets(query(a));
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe("trx_list_facets");
    expect(args.p_archived).toBe(a);
    expect(facets.byKind.kind).toEqual([
      { value: "session", count: 13 },
      { value: "transcript", count: 1 },
    ]);
    expect(facets.byKind.shown_to).toEqual([{ value: "internal", count: 14 }]);
    expect(facets.byKind.archived).toEqual([{ value: "archived", count: a === "active" ? 0 : 14 }]);
  },
);

it("the Visibility filter reads the database's access facet and keeps its label and filter key", () => {
  const section = transcriptListConfig.facetSections?.find((s) => s.filterId === "shown_to");
  expect(section).toMatchObject({ facet: "shown_to", label: "Visibility" });
});

it("the facets read past the API's 1,000-row cap: every page until a short one", async () => {
  // A person with ~1,000 tags: the access facet sorts before the tags, the tags run past row 1,000.
  const rows = [
    { kind: "shown_to", value: "internal", total: 687 },
    { kind: "shown_to", value: "personal", total: 1 },
    ...Array.from({ length: 1392 }, (_, i) => ({ kind: "tag", value: `t${i}`, total: 1 })),
  ];
  // One request returns every row as a single array, so the API's row cap cannot cut it.
  rpc.mockResolvedValue({ data: rows, error: null });
  const facets = await fetchTranscriptFacets(query("active"));
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(facets.byKind.tag).toHaveLength(1392);
  expect(facets.byKind.shown_to).toEqual([
    { value: "internal", count: 687 },
    { value: "personal", count: 1 },
  ]);
});
