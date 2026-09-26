/**
 * A COLUMN SETTING THE SHEET SAVES IS KEPT, OR REFUSED BY NAME — NEVER DROPPED (lane
 * data-tables-grid-overhaul, "seam honesty", 2026-09-25; v2 readiness audit blocker 4).
 *
 * THE USE CASE: a plumbing company's September service board on the record store. The dispatcher
 * opens Column settings on Status in the Sheet, tints "Scheduled" blue and "Needs parts" amber,
 * turns off "allow other values", and saves. Before this lane the seam sent only the choice words
 * to `custom.field_update` (with a `type` word, which sends the patch down the door's behaviour arm
 * where an existing list's words are not even read), answered "Saved", and on reload every colour
 * was gone and "allow other values" was back on. The same seam wiped a "must differ from Crew
 * lead" rule set in the Grid the next time anyone saved a longest-length in the Sheet, dropped a
 * pattern's "enter it like" hint, could not turn "no two rows the same" OFF, lost an autonumber's
 * JOB- prefix, and let a formula column become the row label the store cannot draw.
 *
 * Driven through the real `setFieldFormat` / `updateTableConfig` / `setTableRowLabel` /
 * `getTableMetadata` (record-store.ts) against a fake of the store's field door that keeps what
 * `custom.field_update` keeps (settings arm vs behaviour arm, closed key list, allow_other on
 * lists only, display_format verbatim) — so "save → reload → save" is judged on what the store
 * would actually hold.
 */

export {};

const TABLE = "3260bbbe-aaa8-4148-a4d9-7ad880e7976d";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const USER = "87a6e699-3622-4869-8843-d0867456c0dd";

const F = {
  status: "0b5e7c1a-0000-4000-8000-000000000001",
  crew: "0b5e7c1a-0000-4000-8000-000000000002",
  job: "0b5e7c1a-0000-4000-8000-000000000003",
  notes: "0b5e7c1a-0000-4000-8000-000000000004",
  lead: "0b5e7c1a-0000-4000-8000-000000000005",
  due: "0b5e7c1a-0000-4000-8000-000000000006",
  customer: "0b5e7c1a-0000-4000-8000-000000000007",
  movedStage: "0b5e7c1a-0000-4000-8000-000000000008",
};

type Doc = Record<string, unknown> & { id: string; key: string; label: string; type: string; config: Record<string, unknown> };

/** The keys `custom.field_update` stores (its c_settings list, read off the live body 2026-09-25). */
const DOOR_KEYS = new Set([
  "key", "label", "required", "dated", "sort", "sensitivity", "context_policy", "unit", "rules", "options",
  "options_table_id", "display", "multi", "promoted", "unique", "depends_on", "applies_to_types", "expr",
  "compute_on", "relation_target", "relation_max", "on_target_delete", "source", "source_config",
  "review_interval_days", "parity_type", "plain", "type", "formula_text", "display_format", "allow_other",
]);

const store: {
  fields: Map<string, Doc>;
  options: Map<string, Array<Record<string, unknown>>>;
  table: Record<string, unknown>;
  writes: Array<{ field_id: string; patch: Record<string, unknown> }>;
} = { fields: new Map(), options: new Map(), table: {}, writes: [] };

function seed() {
  const mk = (id: string, key: string, label: string, type: string, sort: number, extra: Partial<Doc> = {}): Doc => ({
    id, key, label, type, sort, multi: false, rules: [], config: {}, required: false, organization_id: ORG,
    created_at: "2026-09-25T00:00:00Z", updated_at: "2026-09-25T00:00:00Z", version: 1, ...extra,
  });
  store.fields = new Map(
    [
      mk(F.status, "status", "Status", "list", 10, { config: { options_table_id: "opt-status" } }),
      mk(F.crew, "crew", "Crew", "text", 20, {
        rules: [
          { kind: "differs_from_field", value: "crew_lead" },
          { kind: "length", value: 40, applies_to_types: ["job"] },
        ],
      }),
      mk(F.job, "job_number", "Job #", "formula", 30, { format: "autonumber", config: { system: "autonumber" } }),
      mk(F.notes, "notes", "Notes", "text", 40),
      mk(F.lead, "crew_lead", "Crew lead", "text", 50, { unique: true }),
      mk(F.due, "due_label", "Due label", "formula", 60, { config: { formula_text: "{Scheduled} & \"\"" } }),
      mk(F.customer, "customer", "Customer", "relation", 70, { relation_target: "c0ffee00-0000-4000-8000-000000000000", relation_max: 1, on_target_delete: "set_null" }),
      mk(F.movedStage, "stage", "Stage", "list", 80, { config: { options_table_id: "opt-stage" } }),
    ].map((d) => [d.id, d]),
  );
  store.options = new Map<string, Array<Record<string, unknown>>>([
    ["opt-status", ["Scheduled", "In progress", "Needs parts", "Done"].map((title) => ({ data: { title } }))],
    // A list the MOVER carried across: its options key their words `name` and carry `color`.
    ["opt-stage", [{ data: { name: "Lead", color: "slate" } }, { data: { name: "Won", color: "green" } }]],
  ]);
  store.table = { name: "September service board — Camarillo", title_field: "notes", default_sort: [] };
  store.writes = [];
}

function refuse(message: string) {
  return { ok: false as const, error: { code: "23514", message } };
}

/** What `custom.field_update` does with a patch, arm by arm. */
function fieldUpdate({ field_id, patch }: { field_id: string; patch: Record<string, unknown> }) {
  const unknown = Object.keys(patch).filter((k) => !DOOR_KEYS.has(k));
  if (unknown.length) return refuse(`field_update does not keep ${unknown.join(", ")}.`);
  const old = store.fields.get(field_id);
  if (!old) return refuse("no such field");
  store.writes.push({ field_id, patch });
  const next: Doc = { ...old, config: { ...old.config } };
  const word = (patch.type ?? patch.parity_type ?? patch.plain) as string | undefined;
  if (word) {
    // THE BEHAVIOUR ARM: a fresh document from the old one with the patch over it.
    if (word === "select" || word === "multi_select") {
      next.type = "list";
      next.multi = word === "multi_select";
      if (!next.config.options_table_id && Array.isArray(patch.options) && patch.options.length) {
        const id = `opt-${field_id}`;
        store.options.set(id, (patch.options as string[]).map((title) => ({ data: { title } })));
        next.config.options_table_id = id;
      }
      // An existing list's words are NOT read by this arm.
    } else if (word === "relation") {
      next.type = "relation";
      next.relation_target = patch.relation_target ?? old.relation_target;
      next.relation_max = patch.relation_max ?? old.relation_max ?? 1;
      next.on_target_delete = patch.on_target_delete ?? old.on_target_delete ?? "set_null";
      delete next.display; // the behaviour arm's spec builder has no `display`
    } else if (word === "autonumber" || word === "created_time" || word === "modified_time") {
      next.type = "formula";
      next.format = word;
      next.config = { system: word };
    } else if (word === "formula") {
      next.type = "formula";
      next.config.formula_text = patch.formula_text ?? old.config.formula_text;
    } else {
      next.type = word === "number" ? "range" : word === "checkbox" ? "boolean" : "text";
      delete next.format;
      if (old.type === "list") delete next.config.options_table_id;
    }
    if (next.type === "list") {
      if ("allow_other" in patch) next.config.allow_other = patch.allow_other;
    } else if ("allow_other" in patch) {
      return refuse(`Only a choice column can take values that are not one of its choices, and "${old.label}" will not be one.`);
    } else delete next.config.allow_other;
    const df = patch.display_format === undefined ? old.display_format : patch.display_format;
    if (df === null || df === undefined) delete next.display_format;
    else next.display_format = { options: {}, ...(df as object) };
    if (patch.rules) next.rules = patch.rules as unknown[];
  } else {
    // THE SETTINGS ARM.
    for (const k of ["label", "required", "sort", "rules", "unique", "relation_target", "relation_max", "on_target_delete", "formula_text"]) {
      if (k in patch) {
        if (k === "formula_text") next.config.formula_text = patch[k];
        else next[k] = patch[k];
      }
    }
    if ("display" in patch) {
      if (next.type !== "relation") return refuse("Only a column that points at other records can say which of their columns to show.");
      next.display = patch.display === null ? undefined : { columns: [patch.display as string], separator: " " };
    }
    if ("allow_other" in patch) {
      if (next.type !== "list") return refuse(`Only a choice column can take values that are not one of its choices, and "${old.label}" is not one.`);
      next.config.allow_other = patch.allow_other;
    }
    if (Array.isArray(patch.options) && old.type === "list") {
      store.options.set(old.config.options_table_id as string, (patch.options as string[]).map((title) => ({ data: { title } })));
    }
    if ("display_format" in patch) {
      if (patch.display_format === null) delete next.display_format;
      else next.display_format = { options: {}, ...(patch.display_format as object) };
    }
  }
  store.fields.set(field_id, next);
  return { ok: true as const, data: field_id };
}

const ok = <T,>(data: T) => ({ ok: true as const, data });
const client = {
  recordRead: jest.fn(async () => ok({ document: store.table })),
  fields: jest.fn(async () => ok([...store.fields.values()].map((d) => JSON.parse(JSON.stringify(d))))),
  myLevels: jest.fn(async () => ok([{ id: TABLE, level: "admin" }])),
  fieldOptions: jest.fn(async ({ field_id }: { field_id: string }) => {
    const table = store.fields.get(field_id)?.config.options_table_id as string | undefined;
    return ok(table ? JSON.parse(JSON.stringify(store.options.get(table) ?? [])) : []);
  }),
  list: jest.fn(async () => ok({ rows: [] })),
  tableDecorations: jest.fn(async () => ok({ rules: [] })),
  rowActions: jest.fn(async () => ok({ actions: [] })),
  views: jest.fn(async () => ok([])),
  fieldUpdate: jest.fn(async (args: { field_id: string; patch: Record<string, unknown> }) => fieldUpdate(args)),
  recordUpdate: jest.fn(async ({ patch }: { patch: Record<string, unknown> }) => {
    Object.assign(store.table, patch);
    return ok(2);
  }),
  autonumberBackfill: jest.fn(async () => ok({ numbered: 0, highest: 0 })),
};

const fakeSupabase = {
  schema: () => ({
    rpc: async (fn: string) =>
      fn === "view_keys" ? { data: [], error: null } : { data: null, error: { code: "PGRST202", message: fn, details: null, hint: null } },
    from: () => {
      throw new Error("the Sheet touched a table directly");
    },
  }),
  rpc: async () => ({ data: null, error: null }),
};

jest.mock("@ai-matrx/records/core", () => ({
  ...jest.requireActual("@ai-matrx/records/core"),
  createRecordsClient: () => client,
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => fakeSupabase }));

const HOME = { store: "record" as const, organizationId: ORG, userId: USER };

type Column = { id: string; field_name: string; metadata: { format?: unknown }; validation_rules: Record<string, unknown> | null };

async function load() {
  jest.resetModules();
  return import("../record-store");
}

async function columns(rs: Awaited<ReturnType<typeof load>>): Promise<Column[]> {
  rs.invalidateRecordStoreTable(TABLE);
  const meta = await rs.getTableMetadata(HOME, { tableId: TABLE });
  if (!meta.success) throw new Error(meta.error);
  return meta.data.columns as unknown as Column[];
}

async function formatOf(rs: Awaited<ReturnType<typeof load>>, fieldId: string) {
  return (await columns(rs)).find((c) => c.id === fieldId)!.metadata.format;
}

beforeEach(() => {
  seed();
  client.fieldUpdate.mockClear();
  client.recordUpdate.mockClear();
});

describe("September service board · choice colours and allow-other", () => {
  const STATUS = {
    id: "choice" as const,
    options: {
      choices: [
        { value: "Scheduled", color: "blue" },
        { value: "In progress" },
        { value: "Needs parts", color: "amber", help: "Waiting on the supplier" },
        { value: "Done", color: "green" },
      ],
      allowOther: false,
    },
  };

  it("keeps every colour and the allow-other switch through save → reload → save", async () => {
    const rs = await load();
    const saved = await rs.setFieldFormat(HOME, { tableId: TABLE, fieldId: F.status, format: STATUS });
    expect(saved.success).toBe(true);
    const back = await formatOf(rs, F.status);
    expect(back).toEqual(STATUS);
    // An existing list's settings go down the SETTINGS arm: no `type` word.
    expect(store.writes.every((w) => !("type" in w.patch))).toBe(true);
    // Saving what came back changes nothing in the store.
    const before = JSON.stringify(store.fields.get(F.status));
    const again = await rs.setFieldFormat(HOME, { tableId: TABLE, fieldId: F.status, format: back as never });
    expect(again.success).toBe(true);
    expect(JSON.stringify(store.fields.get(F.status))).toBe(before);
  });

  it("an added choice reaches the store's list (the behaviour arm never read an existing list's words)", async () => {
    const rs = await load();
    const withCancelled = { ...STATUS, options: { ...STATUS.options, choices: [...STATUS.options.choices, { value: "Cancelled", color: "red" }] } };
    const saved = await rs.setFieldFormat(HOME, { tableId: TABLE, fieldId: F.status, format: withCancelled });
    expect(saved.success).toBe(true);
    expect((await formatOf(rs, F.status) as { options: { choices: Array<{ value: string }> } }).options.choices.map((c) => c.value)).toEqual([
      "Scheduled", "In progress", "Needs parts", "Done", "Cancelled",
    ]);
  });

  it("reads allow-other back as it is stored, so the grid's default of 'on' never lies about a list that says off", async () => {
    const rs = await load();
    expect((await formatOf(rs, F.status) as { options: { allowOther?: boolean } }).options.allowOther).toBe(false);
  });

  it("a text column made a choice column keeps the grid's default (other values allowed) and its colours", async () => {
    const rs = await load();
    const format = { id: "choice" as const, options: { choices: [{ value: "Morning", color: "teal" }, { value: "Afternoon" }] } };
    const saved = await rs.setFieldFormat(HOME, { tableId: TABLE, fieldId: F.notes, format });
    expect(saved.success).toBe(true);
    expect(await formatOf(rs, F.notes)).toEqual({ id: "choice", options: { ...format.options, allowOther: true } });
  });

  it("REFUSES a dependent (pick-list) binding before writing anything, naming it", async () => {
    const rs = await load();
    const saved = await rs.setFieldFormat(HOME, {
      tableId: TABLE,
      fieldId: F.status,
      format: { id: "choice", options: { structuredList: { listId: "b1", groupFromField: "service_type" } } },
    });
    expect(saved.success).toBe(false);
    if (saved.success) return;
    expect(saved.error).toMatch(/Service Type|service_type/i);
    expect(saved.error).toMatch(/Nothing .*changed/);
    expect(client.fieldUpdate).not.toHaveBeenCalled();
  });

  it("REFUSES rewriting the words of a list the mover carried across (its options are keyed `name`), before writing", async () => {
    const rs = await load();
    const saved = await rs.setFieldFormat(HOME, {
      tableId: TABLE,
      fieldId: F.movedStage,
      format: { id: "choice", options: { choices: [{ value: "Lead" }, { value: "Won" }, { value: "Lost" }] } },
    });
    expect(saved.success).toBe(false);
    expect(client.fieldUpdate).not.toHaveBeenCalled();
  });

  it("a moved list's colours are read from its options, and saving them again rewrites no word", async () => {
    const rs = await load();
    const back = (await formatOf(rs, F.movedStage)) as { options: { choices: unknown[] } };
    expect(back.options.choices).toEqual([{ value: "Lead", color: "slate" }, { value: "Won", color: "green" }]);
    const saved = await rs.setFieldFormat(HOME, { tableId: TABLE, fieldId: F.movedStage, format: { id: "choice", options: { ...back.options, allowOther: true } } as never });
    expect(saved.success).toBe(true);
    expect(store.writes.every((w) => !("options" in w.patch))).toBe(true);
  });
});

describe("September service board · autonumber prefix, relation settings", () => {
  it("keeps the JOB- prefix on an autonumber column", async () => {
    const rs = await load();
    const saved = await rs.setFieldFormat(HOME, { tableId: TABLE, fieldId: F.job, format: { id: "autonumber", options: { prefix: "JOB-" } } });
    expect(saved.success).toBe(true);
    expect(await formatOf(rs, F.job)).toEqual({ id: "autonumber", options: { prefix: "JOB-" } });
  });

  it("keeps a relation's on-delete and display column", async () => {
    const rs = await load();
    const format = {
      id: "relation" as const,
      options: { relation_target: "c0ffee00-0000-4000-8000-000000000000", relation_max: 1, on_delete: "restrict" as const, display: "company" },
    };
    const saved = await rs.setFieldFormat(HOME, { tableId: TABLE, fieldId: F.customer, format });
    expect(saved.success).toBe(true);
    expect(await formatOf(rs, F.customer)).toEqual(format);
  });
});

describe("September service board · rules", () => {
  it("MERGES: a Sheet rule save keeps the Grid's 'must differ from Crew lead' rule", async () => {
    const rs = await load();
    const saved = await rs.updateTableConfig(HOME, {
      tableId: TABLE,
      fieldUpdates: [{ id: F.crew, validation_rules: { maxLength: 60 } }],
    });
    expect(saved.success).toBe(true);
    expect(store.fields.get(F.crew)!.rules).toEqual([
      { kind: "differs_from_field", value: "crew_lead" },
      { kind: "length", value: 60, applies_to_types: ["job"] },
    ]);
  });

  it("keeps a pattern's 'enter it like' hint and a shortest length, both ways", async () => {
    const rs = await load();
    const rules = { pattern: "^[A-Z]{2}-[0-9]{3}$", patternHint: "PX-204", minLength: 6, maxLength: 6 };
    const saved = await rs.updateTableConfig(HOME, { tableId: TABLE, fieldUpdates: [{ id: F.notes, validation_rules: rules }] });
    expect(saved.success).toBe(true);
    const back = (await columns(rs)).find((c) => c.id === F.notes)!.validation_rules;
    expect(back).toEqual(rules);
  });

  it("turns 'no two rows the same' off, and reads it back on where the store has it", async () => {
    const rs = await load();
    expect((await columns(rs)).find((c) => c.id === F.lead)!.validation_rules).toEqual({ unique: true });
    const saved = await rs.updateTableConfig(HOME, { tableId: TABLE, fieldUpdates: [{ id: F.lead, validation_rules: {} }] });
    expect(saved.success).toBe(true);
    expect(store.fields.get(F.lead)!.unique).toBe(false);
  });

  it("REFUSES a machine-name change, a per-column public switch and an unknown setting, before writing anything", async () => {
    const rs = await load();
    for (const update of [
      { id: F.notes, display_name: "Job notes", field_name: "job_notes" },
      { id: F.notes, display_name: "Job notes", is_public: true },
      { id: F.notes, display_name: "Job notes", colour_scale: "heat" },
    ]) {
      const saved = await rs.updateTableConfig(HOME, { tableId: TABLE, fieldUpdates: [update] });
      expect(saved.success).toBe(false);
      if (!saved.success) expect(saved.error).toMatch(/Nothing .*changed/);
    }
    expect(client.fieldUpdate).not.toHaveBeenCalled();
  });

  it("REFUSES an unknown table setting instead of dropping it", async () => {
    const rs = await load();
    const saved = await rs.updateTableConfig(HOME, { tableId: TABLE, tableUpdates: { table_name: "Board", is_public: true } });
    expect(saved.success).toBe(false);
    expect(client.recordUpdate).not.toHaveBeenCalled();
  });
});

describe("September service board · the row label", () => {
  it("REFUSES a formula column as the row label — the store names a record by words it holds", async () => {
    const rs = await load();
    const saved = await rs.setTableRowLabel(HOME, { tableId: TABLE, rowLabel: { kind: "field", field: "due_label" } });
    expect(saved.success).toBe(false);
    expect(client.recordUpdate).not.toHaveBeenCalled();
  });

  it("a typed column is carried as the title field", async () => {
    const rs = await load();
    const saved = await rs.setTableRowLabel(HOME, { tableId: TABLE, rowLabel: { kind: "field", field: "crew_lead" } });
    expect(saved.success).toBe(true);
    expect(store.table.title_field).toBe("crew_lead");
  });
});
