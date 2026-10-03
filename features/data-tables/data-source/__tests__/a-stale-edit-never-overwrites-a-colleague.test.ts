/**
 * A STALE EDIT NEVER OVERWRITES A COLLEAGUE (lane 10 VIEWS-AND-FIELDS, sublane VWF, 2026-10-02).
 *
 * THE USE CASE: two front-desk coordinators at Cedar Ridge Physical Therapy have the Sheet open on
 * "Patient Visits". Dana moves Maya Okafor's visit to Thursday; Luis, whose page still shows
 * Tuesday, types a note into the same row a minute later. Before this lane Luis's write went with
 * no version and the store, which is last-write-wins without one, kept Luis's row — Dana's change
 * was silently gone. Now every update carries the version the person saw:
 *   · a cell edit over a colleague's change is refused, "Changed by someone else", and nothing is written;
 *   · a paste over five rows, one changed since, refuses the whole batch;
 *   · a row whose version could not be read is refused "Could not check for changes" — never sent bare;
 *   · Reload (the page read again) makes the next edit land;
 *   · an undo carries the version its own write produced, so it never undoes over a colleague.
 *
 * Driven through the real `record-store.ts` against a fake store that enforces versions exactly as
 * `custom.record_update` / `custom.record_change_many` do (PT409 on a stale version; no version =
 * last-write-wins). `SEAM_UNDER_TEST` points it at another copy of the seam (the red proof).
 */

export {};

const TABLE = "4c6db6d1-de2c-4dc6-bf8e-f2cabbc27bc6";
const ORG = "57f2a22b-5875-46c6-80df-437076421c28";
const HOME = { store: "record" as const, organizationId: ORG, userId: "87a6e699-3622-4869-8843-d0867456c0dd" };
const SEAM = process.env.SEAM_UNDER_TEST ?? "../record-store";

const FIELDS = [
  { id: "aae18f00-e054-45c4-b3cf-b5d19a236b7c", key: "patient", label: "Patient", type: "text", sort: 1, organization_id: ORG },
  { id: "8053521f-3ecc-4a8e-ab02-e2c7e71b166a", key: "visit_day", label: "Visit day", type: "text", sort: 2, organization_id: ORG },
  { id: "56e848b0-4805-4f60-ae13-fc3013e2b429", key: "desk_notes", label: "Desk notes", type: "text", sort: 3, organization_id: ORG },
];
const PATIENTS = ["Maya Okafor", "Tomás Reyes", "Grace Lindholm", "Imran Siddiqui", "Hana Watanabe"];
const ROWS = PATIENTS.map((patient, i) => ({
  id: `0000000${i}-0000-4000-8000-000000000000`,
  document: { patient, visit_day: "Tuesday", desk_notes: "" },
}));
const MAYA = ROWS[0]!.id;

type Stored = { document: Record<string, unknown>; version: number };
const store = { rows: new Map<string, Stored>(), headersFail: false, sentWithoutVersion: 0 };

/** Another browser (Dana's) writing straight to the store. */
function colleagueWrites(id: string, patch: Record<string, unknown>) {
  const row = store.rows.get(id)!;
  store.rows.set(id, { document: { ...row.document, ...patch }, version: row.version + 1 });
}

const ok = <T,>(data: T) => ({ ok: true as const, data });
const stale = (id: string, expected: number, current: number) => ({
  ok: false as const,
  error: {
    code: "stale_write",
    message: "Someone else changed this record since you read it.",
    hint: "Read it again and make your change on top of theirs.",
    detail: { record_id: id, expected_version: expected, current_version: current },
  },
});

const client = {
  recordRead: jest.fn(async () => ok({ document: { name: "Patient Visits" } })),
  fields: jest.fn(async () => ok(FIELDS)),
  myLevels: jest.fn(async () => ok([{ id: TABLE, level: "editor" }])),
  tableCapacity: jest.fn(async () => ok({ records: ROWS.length })),
  fieldOptions: jest.fn(async () => ok([])),
  tableDecorations: jest.fn(async () => ok({ rules: [] })),
  rowActions: jest.fn(async () => ok({ actions: [] })),
  views: jest.fn(async () => ok([])),
  listPage: jest.fn(async (a: { limit: number; offset: number }) => {
    const rows = [...store.rows].map(([id, r]) => ({ id, document: { ...r.document }, level: "editor", hidden: {} }));
    return ok({ total: rows.length, limit: a.limit, offset: a.offset, rows: rows.slice(a.offset, a.offset + a.limit) });
  }),
  recordHeaders: jest.fn(async ({ ids }: { ids: string[] }) => {
    if (store.headersFail) return { ok: false as const, error: { code: "unreachable", message: "The store did not answer." } };
    return ok(ids.filter((id) => store.rows.has(id)).map((id) => ({ id, version: store.rows.get(id)!.version })));
  }),
  // custom.record_update: a hard compare-and-set when handed a version; last-write-wins without one.
  recordUpdate: jest.fn(async ({ record_id, patch, expectedVersion }: { record_id: string; patch: Record<string, unknown>; expectedVersion?: number }) => {
    const row = store.rows.get(record_id)!;
    if (expectedVersion === undefined) store.sentWithoutVersion += 1;
    else if (expectedVersion !== row.version) return stale(record_id, expectedVersion, row.version);
    const { _op_id: _opId, ...rest } = patch;
    store.rows.set(record_id, { document: { ...row.document, ...rest }, version: row.version + 1 });
    return ok(row.version + 1);
  }),
  // custom.record_change_many: ONE transaction; one stale update refuses every change.
  recordChangeMany: jest.fn(async ({ changes }: { changes: Array<{ op: string; record_id: string; patch: Record<string, unknown>; expected_version?: number | null }> }) => {
    for (const c of changes) {
      if (c.op !== "update") continue;
      const row = store.rows.get(c.record_id)!;
      if (c.expected_version === undefined || c.expected_version === null) store.sentWithoutVersion += 1;
      else if (c.expected_version !== row.version) return stale(c.record_id, c.expected_version, row.version);
    }
    const out = changes.map((c) => {
      const row = store.rows.get(c.record_id)!;
      store.rows.set(c.record_id, { document: { ...row.document, ...c.patch }, version: row.version + 1 });
      return { op: "update", id: c.record_id, version: row.version + 1 };
    });
    return ok(out);
  }),
};

jest.mock("@ai-matrx/records/core", () => ({
  ...jest.requireActual("@ai-matrx/records/core"),
  createRecordsClient: () => client,
}));
const fakeSupabase = {
  schema: () => ({ rpc: async (fn: string) => (fn === "view_keys" ? { data: [], error: null } : { data: null, error: { code: "PGRST202", message: fn } }) }),
  rpc: async () => ({ data: null, error: null }),
};
jest.mock("@/utils/supabase/client", () => ({ createClient: () => fakeSupabase }));

type Seam = typeof import("../record-store");

beforeEach(() => {
  jest.resetModules();
  store.rows = new Map(ROWS.map((r) => [r.id, { document: { ...r.document }, version: 1 }]));
  store.headersFail = false;
  store.sentWithoutVersion = 0;
  for (const fn of Object.values(client)) fn.mockClear();
});

/** Luis opens the Sheet: the page is drawn (and, with it, the versions he saw). */
async function luisOpensTheSheet(rs: Seam) {
  const page = await rs.getTablePage(HOME, { tableId: TABLE, limit: 50, offset: 0 });
  if (!page.success) throw new Error(page.error);
  return page.data.rows;
}

describe("Cedar Ridge PT · Patient Visits · a stale edit never overwrites a colleague", () => {
  it("a cell edit over a colleague's change is refused 'Changed by someone else' and her change stays", async () => {
    const rs: Seam = await import(SEAM);
    const { versionRefusalLabel } = await import("@/lib/records/record-versions");
    await luisOpensTheSheet(rs);
    colleagueWrites(MAYA, { visit_day: "Thursday" });

    const saved = await rs.upsertCell(HOME, { tableId: TABLE, rowId: MAYA, fieldName: "visit_day", value: "Wednesday" });

    expect(saved.success).toBe(false);
    if (saved.success) return;
    expect(versionRefusalLabel(saved.refusal)).toBe("Changed by someone else");
    expect(store.rows.get(MAYA)!.document.visit_day).toBe("Thursday");
    expect(store.sentWithoutVersion).toBe(0);
  });

  it("after Reload the same edit lands, against the version now on screen", async () => {
    const rs: Seam = await import(SEAM);
    await luisOpensTheSheet(rs);
    colleagueWrites(MAYA, { visit_day: "Thursday" });
    expect((await rs.upsertCell(HOME, { tableId: TABLE, rowId: MAYA, fieldName: "desk_notes", value: "Bring knee brace" })).success).toBe(false);

    await luisOpensTheSheet(rs); // Reload
    const saved = await rs.upsertCell(HOME, { tableId: TABLE, rowId: MAYA, fieldName: "desk_notes", value: "Bring knee brace" });

    expect(saved.success).toBe(true);
    expect(store.rows.get(MAYA)!.document).toMatchObject({ visit_day: "Thursday", desk_notes: "Bring knee brace" });
  });

  it("a paste over five rows, one changed since, is refused whole — nothing is pasted", async () => {
    const rs: Seam = await import(SEAM);
    await luisOpensTheSheet(rs);
    colleagueWrites(ROWS[3]!.id, { desk_notes: "Insurance card on file" });
    const before = new Map([...store.rows].map(([id, r]) => [id, { ...r.document }]));

    const pasted = await rs.bulkWrite(HOME, {
      tableId: TABLE,
      operations: ROWS.map((r) => ({ op: "cell" as const, row_id: r.id, field_name: "desk_notes", value: "Confirm copay at check-in" })),
    });

    expect(pasted.success).toBe(false);
    for (const [id, doc] of before) expect(store.rows.get(id)!.document).toEqual(doc);
    expect(store.sentWithoutVersion).toBe(0);
  });

  it("a row whose version could not be read is refused 'Could not check for changes' and nothing is sent", async () => {
    const rs: Seam = await import(SEAM);
    const { versionRefusalLabel } = await import("@/lib/records/record-versions");
    store.headersFail = true;
    await luisOpensTheSheet(rs);

    const saved = await rs.upsertCell(HOME, { tableId: TABLE, rowId: MAYA, fieldName: "visit_day", value: "Friday" });

    expect(saved.success).toBe(false);
    if (saved.success) return;
    expect(versionRefusalLabel(saved.refusal)).toBe("Could not check for changes");
    expect(client.recordUpdate).not.toHaveBeenCalled();
    expect(store.rows.get(MAYA)!.document.visit_day).toBe("Tuesday");
  });

  it("an undo carries the version its own write produced: a colleague's change since is never undone over", async () => {
    const rs: Seam = await import(SEAM);
    await luisOpensTheSheet(rs);
    const edit = await rs.upsertCell(HOME, { tableId: TABLE, rowId: MAYA, fieldName: "desk_notes", value: "Running 10 min late" });
    if (!edit.success) throw new Error(edit.error);
    const own = await rs.seenRowVersion(MAYA);
    colleagueWrites(MAYA, { desk_notes: "Arrived, in room 2" });
    await luisOpensTheSheet(rs); // the page is read again (realtime) and shows Dana's note

    const undone = await rs.upsertCell(HOME, { tableId: TABLE, rowId: MAYA, fieldName: "desk_notes", value: "", expectedVersion: own });

    expect(undone.success).toBe(false);
    expect(store.rows.get(MAYA)!.document.desk_notes).toBe("Arrived, in room 2");
  });
});
