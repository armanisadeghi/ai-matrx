// features/content-ir/studio/records/related-records-service.test.ts
//
// DD-178 — one tab is one PARENT FIELD, never one child kind.
//
// WHAT THIS PINS, and why it is a real test rather than a shape-check. The edge
// rows below are the shape `platform.associations` actually holds after
// `wf_055`, taken from a live emission of `claim_evidence` on the production
// database on 2026-09-13: two fields, `supportingEvidence` (2 items) and
// `contrastingEvidence` (3 items), whose items are the SAME child kind, so both
// fields number their children from 0 and the positions collide. Eleven live
// parent definitions declare such a pair.
//
// RED against the shipped slice-2 reader, and it was actually run — the
// `edge.role` filter removed in a DETACHED GIT WORKTREE (never in the shared
// working tree, where a peer sweeper commits whatever is on disk), 2026-09-13,
// 3 of 4 failing with exactly the defect:
//
//   the supportingEvidence tab   → + "Contrasting one/two/three" appended
//   the contrastingEvidence tab  → + "Supporting one/two" appended
//   a field the parent does not declare → all five rows instead of none
//
// The fourth (the field-less edge) passes either way: it is about a DIFFERENT
// half of the class, and it has its own RED — remove the `role === null` branch
// and the row lands silently inside a tab it does not belong to.
//
// The database-side half of this class (the writer, and the unique index that
// refuses two children in one slot) is proven against the live database in
// `aidream/services/kind_records/tests/test_children_by_field.py`. This file is
// the reader's half: the selection this screen performs over those rows.

// THE STAND-IN ANSWERS THE QUESTION IT WAS ASKED, and this is load-bearing.
// The first draft of this file returned a fixed set of rows regardless of the
// `.in(...)` the service sent — and the slice-2 reader PASSED it, because the
// stand-in hid the extra rows that reader had asked for. A mock that answers a
// different question from the one the code asks cannot fail when the code is
// wrong, which makes it worse than no test (`forcing-function-tests`). So this
// one selects from the full child set by the ids actually requested, exactly as
// `content_ir.kind_instance` would, and every row it can return is declared
// below rather than per-test.
interface MockResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

/** Set when a test wants the shape read itself to fail. */
const queryState: { error: { message: string } | null } = { error: null };

function queryBuilder() {
  const builder: Record<string, unknown> = {};
  let requested: string[] = [];
  builder.select = jest.fn(() => builder);
  builder.is = jest.fn(() => builder);
  builder.eq = jest.fn(() => builder);
  builder.in = jest.fn((_column: string, ids: string[]) => {
    requested = ids;
    return builder;
  });
  builder.then = (
    resolve: (value: MockResult) => unknown,
    reject: (reason: unknown) => unknown,
  ) =>
    Promise.resolve(
      queryState.error
        ? { data: null, error: queryState.error }
        : {
            data: CHILDREN.filter((child) => requested.includes(child.id)).map(
              instanceRow,
            ),
            error: null,
          },
    ).then(resolve, reject);
  return builder;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: jest.fn(() => ({ from: jest.fn(() => queryBuilder()) })),
  },
}));

jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: { listForTargets: jest.fn() },
}));

import { associationsService } from "@/features/scopes/service/associationsService";
import { listRelatedChildRecords } from "./related-records-service";

const PARENT = "812a4594-7d96-40ff-9b2c-3fd1c8d2d3c6";
const CHILD_DEFINITION = "fcf3487d-c092-4375-a838-5714c0aa1e54"; // evidence_source, live id
const SUPPORTING = "supportingEvidence";
const CONTRASTING = "contrastingEvidence";

/** One child: its edge (field + position) and the row the shape read returns. */
const CHILDREN = [
  { id: "11111111-1111-4111-8111-111111111111", field: SUPPORTING, position: 0, title: "Supporting one" },
  { id: "22222222-2222-4222-8222-222222222222", field: SUPPORTING, position: 1, title: "Supporting two" },
  { id: "33333333-3333-4333-8333-333333333333", field: CONTRASTING, position: 0, title: "Contrasting one" },
  { id: "44444444-4444-4444-8444-444444444444", field: CONTRASTING, position: 1, title: "Contrasting two" },
  { id: "55555555-5555-4555-8555-555555555555", field: CONTRASTING, position: 2, title: "Contrasting three" },
];

function edgeRow(child: (typeof CHILDREN)[number], index: number) {
  return {
    id: `edge-${index}`,
    targetId: PARENT,
    sourceType: "content_ir_kind_instance",
    sourceId: child.id,
    role: child.field,
    label: "part_of",
    position: child.position,
    metadata: { field: child.field },
    orgId: "7cd12da2-2213-4378-8fba-a9e2dc4ea657",
    createdAt: "2026-09-13T00:00:00.000Z",
  };
}

function instanceRow(child: (typeof CHILDREN)[number]) {
  return {
    id: child.id,
    title: child.title,
    data: { sourceTitle: child.title },
    confirmation: "unconfirmed",
    confirmed_at: null,
    confirmed_by: null,
    // Created NEWEST FIRST relative to position, so a reader that fell back to
    // creation order would produce a different list and be caught.
    created_at: `2026-09-13T00:00:${String(59 - child.position).padStart(2, "0")}.000Z`,
    created_by: null,
    created_by_tier: "ai",
    created_by_system: "chat_kind_emission",
    organization_id: "7cd12da2-2213-4378-8fba-a9e2dc4ea657",
    archived_at: null,
    kind_version: 2,
    validation_status: "passed",
    metadata: { home: { conversation_id: null } },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  queryState.error = null;
  jest.mocked(associationsService.listForTargets).mockResolvedValue({
    ok: true,
    data: { edges: CHILDREN.map(edgeRow) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

describe("two array fields of one child kind are two different lists (DD-178)", () => {
  it.each([
    [SUPPORTING, ["Supporting one", "Supporting two"]],
    [CONTRASTING, ["Contrasting one", "Contrasting two", "Contrasting three"]],
  ])("the %s tab shows exactly its own array, in its own order", async (field, titles) => {

    const result = await listRelatedChildRecords({
      parentId: PARENT,
      fieldName: field,
      childDefinitionId: CHILD_DEFINITION,
      confirmation: "all",
      archiveFilter: "active",
    });

    expect(result.rows.map((row) => row.title)).toEqual(titles);
    // The positions are the FIELD's own 0..n-1 — the numbers that collide with
    // the other field's, which is exactly why the field had to be asked for.
    expect(result.rows.map((row) => row.position)).toEqual(
      titles.map((_title, index) => index),
    );
    // And every count on the screen describes this same field's rows.
    expect(result.confirmationCounts.all).toBe(titles.length);
    expect(result.archiveCounts.all).toBe(titles.length);
    expect(result.fieldlessCount).toBe(0);
  });

  it("a field the parent does not declare is empty, not everything", async () => {

    const result = await listRelatedChildRecords({
      parentId: PARENT,
      fieldName: "recentDevelopments",
      childDefinitionId: CHILD_DEFINITION,
      confirmation: "all",
      archiveFilter: "active",
    });

    expect(result.rows).toEqual([]);
    expect(result.fieldlessCount).toBe(0);
  });
});

describe("a child whose edge names no field is reported, never dropped", () => {
  it("counts it so the screen can say so", async () => {
    jest.mocked(associationsService.listForTargets).mockResolvedValue({
      ok: true,
      data: {
        edges: [
          ...CHILDREN.filter((c) => c.field === SUPPORTING).map(edgeRow),
          // The pre-wf_055 shape: owned, positioned, but with no field at all.
          { ...edgeRow(CHILDREN[2], 99), role: null, metadata: {} },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await listRelatedChildRecords({
      parentId: PARENT,
      fieldName: SUPPORTING,
      childDefinitionId: CHILD_DEFINITION,
      confirmation: "all",
      archiveFilter: "active",
    });

    expect(result.rows.map((row) => row.title)).toEqual([
      "Supporting one",
      "Supporting two",
    ]);
    // Not silently swallowed into this tab, and not silently gone either: the
    // panel renders this number as a named sentence.
    expect(result.fieldlessCount).toBe(1);
  });
});
