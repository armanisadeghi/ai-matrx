/**
 * /transcripts has Archive (with Undo) — and now the Archived filter that finds what it archived.
 *
 * 2026-09-30: the list sent no archive option, so `trx_list_scoped` only ever listed active rows
 * and an archived transcript could be reached only through Undo or Trash. The list, its lane
 * counts and its facets now carry the axis (active | archived | all).
 */

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
jest.mock("@/utils/supabase/writeOne", () => ({ tryWriteOne: jest.fn() }));

import { DEFAULT_ENTITY_LIST_QUERY, type EntityListQuery } from "@/lib/entity-list/types";
import { fetchTranscriptFacets, fetchTranscriptListPage, fetchTranscriptScopeCounts } from "./service";
import type { TranscriptListRow } from "./types";

const sort = { sort: "updated", direction: "desc", pageSize: 25 } as never;

function query(archived: EntityListQuery["archived"]): EntityListQuery {
  return { ...DEFAULT_ENTITY_LIST_QUERY, archived, filters: { kind: { values: ["transcript"] } } as never };
}

function row(over: Partial<TranscriptListRow>): TranscriptListRow {
  return {
    id: "r",
    kind: "transcript",
    status: "final",
    visibility: "private",
    organization_name: "Org",
    owner_email: "admin@admin.com",
    folder_name: "Transcripts",
    tags: [],
    is_draft: false,
    is_archived: false,
    total_count: 1,
    ...over,
  } as TranscriptListRow;
}

beforeEach(() => {
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

it("under Archived only, the facets count the archived rows (with the archived facet)", async () => {
  rpc.mockResolvedValue({
    data: [row({ id: "a", is_archived: true, tags: ["x"] }), row({ id: "b", is_archived: true, kind: "session", status: "idle" })],
    error: null,
  });
  const facets = await fetchTranscriptFacets(query("archived"));
  const [fn, args] = rpc.mock.calls[0]!;
  expect(fn).toBe("trx_list_scoped");
  expect(args.p_filters).toEqual({ archived: { value: "archived" } });
  expect(facets.byKind.archived).toEqual([{ value: "archived", count: 2 }]);
  expect(facets.byKind.kind).toEqual([
    { value: "session", count: 1 },
    { value: "transcript", count: 1 },
  ]);
  expect(facets.byKind.tag).toEqual([{ value: "x", count: 1 }]);
});

it("Active only keeps the database facets", async () => {
  await fetchTranscriptFacets(query("active"));
  expect(rpc.mock.calls[0]![0]).toBe("trx_list_facets");
});
