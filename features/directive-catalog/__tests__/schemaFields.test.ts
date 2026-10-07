/**
 * schemaFields — proven against the REAL item schemas the server publishes
 * (`docs/protocol/kind_directives_catalog.generated.json`, the committed
 * snapshot of `GET /directives/catalog`), never against hand-written fixtures:
 * a fixture would only prove the code agrees with its author.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EntityTypeToken } from "@ai-matrx/associations";
import {
  buildSchemaPayload,
  deriveSchemaFields,
  humanFormFields,
  splitWarnings,
  valuesFromPayload,
  type SchemaField,
  type SchemaFieldValue,
} from "../schemaFields";

interface CatalogNoun {
  noun: string;
  title_column?: string | null;
  create: string;
  update: string;
  delete: string;
  schemas?: Record<string, unknown>;
}

const manifest = JSON.parse(
  readFileSync(
    join(process.cwd(), "docs/protocol/kind_directives_catalog.generated.json"),
    "utf8",
  ),
) as { nouns: CatalogNoun[]; noun_schemas: Record<string, Record<string, unknown>> };
// Each noun with its schemas from the manifest's `noun_schemas` map — the
// same body `GET /directives/catalog/{noun}` serves (G12 split).
const catalog = {
  nouns: manifest.nouns.map((n) => ({ ...n, schemas: manifest.noun_schemas[n.noun] })),
};

function noun(name: string): CatalogNoun {
  const n = catalog.nouns.find((x) => x.noun === name);
  if (!n) throw new Error(`catalog snapshot has no noun "${name}"`);
  return n;
}

/** The two ids a task's schema carries that are real records. */
const resolve = (key: string): EntityTypeToken | null =>
  key === "project_id"
    ? ("project" as EntityTypeToken)
    : key === "parent_task_id"
      ? ("task" as EntityTypeToken)
      : null;

const touched = (raw: string | boolean): SchemaFieldValue => ({ raw, touched: true });

function field(fields: SchemaField[], key: string): SchemaField {
  const f = fields.find((x) => x.key === key);
  if (!f) throw new Error(`no field "${key}"`);
  return f;
}

describe("deriveSchemaFields — every real writable schema", () => {
  const writable = catalog.nouns.filter(
    (n) => n.create === "yes" || n.update === "yes" || n.delete === "yes",
  );

  it("the snapshot still has writable nouns to test (guard against a vacuous pass)", () => {
    expect(writable.length).toBeGreaterThanOrEqual(10);
  });

  it.each(
    writable.flatMap((n) =>
      (["create", "update", "delete"] as const)
        .filter((verb) => n[verb] === "yes" && n.schemas?.[verb])
        .map((verb) => [`${n.noun}.${verb}`, n, verb] as const),
    ),
  )("%s: every schema property becomes exactly one field", (_label, n, verb) => {
    const schema = n.schemas![verb] as { properties?: Record<string, unknown> };
    const fields = deriveSchemaFields(schema, { titleColumn: n.title_column });
    const expected = Object.keys(schema.properties ?? {}).sort();
    expect(fields.map((f) => f.key).sort()).toEqual(expected);
    // Required fields always lead: nothing essential hides behind "More fields".
    const firstMore = fields.findIndex((f) => f.tier === "more");
    if (firstMore !== -1) {
      expect(fields.slice(firstMore).every((f) => f.tier === "more")).toBe(true);
      expect(fields.slice(firstMore).some((f) => f.required)).toBe(false);
    }
  });
});

describe("deriveSchemaFields — task create, field by field", () => {
  const t = noun("task");
  const fields = deriveSchemaFields(t.schemas!.create, {
    titleColumn: t.title_column,
    resolveRecordToken: resolve,
  });

  it("puts the one required field first, as plain text", () => {
    expect(fields[0]).toMatchObject({
      key: "title",
      kind: "text",
      required: true,
      tier: "essential",
    });
    expect(fields.filter((f) => f.tier === "essential").map((f) => f.key)).toEqual([
      "title",
    ]);
  });

  it("reads pick-lists, dates, records, and JSON columns from the schema shape", () => {
    expect(field(fields, "priority")).toMatchObject({
      kind: "enum",
      enumValues: ["low", "medium", "high"],
      nullable: true,
    });
    expect(field(fields, "due_date").kind).toBe("date");
    expect(field(fields, "completed_at").kind).toBe("datetime");
    expect(field(fields, "due_time").kind).toBe("time");
    expect(field(fields, "project_id")).toMatchObject({
      kind: "record",
      recordToken: "project",
      label: "Project",
    });
    expect(field(fields, "parent_task_id").recordToken).toBe("task");
    // An id the registry cannot resolve stays text — never a wrong search.
    expect(field(fields, "assignee_id").kind).toBe("text");
    // The six-branch "Any JSON value" column is one JSON field, not a crash.
    expect(field(fields, "metadata").kind).toBe("json");
    expect(field(fields, "status").defaultValue).toBe("incomplete");
  });

  it("orders 'More fields' pick-lists and records first, raw JSON last", () => {
    const more = fields.filter((f) => f.tier === "more");
    expect(more[0]!.kind).toBe("enum");
    expect(more[more.length - 1]!.kind).toBe("json");
  });

  it("a note's title column is essential even though it is not required", () => {
    const n = noun("note");
    const noteFields = deriveSchemaFields(n.schemas!.create, {
      titleColumn: n.title_column,
    });
    expect(noteFields[0]!.key).toBe(n.title_column);
    expect(noteFields[0]!.tier).toBe("essential");
  });

  it("labels the title column 'Title' — a note's is stored as `label`", () => {
    const n = noun("note");
    const noteFields = deriveSchemaFields(n.schemas!.create, {
      titleColumn: n.title_column,
    });
    expect(noteFields[0]).toMatchObject({ key: "label", label: "Title" });
  });

  it("the human form drops raw JSON and bare-id boxes, but never a required field", () => {
    const human = humanFormFields(fields);
    expect(human.some((f) => f.kind === "json")).toBe(false);
    // assignee_id has no resolver in this test → a bare id box → not offered.
    expect(human.some((f) => f.key === "assignee_id")).toBe(false);
    // project_id resolves to a record search → offered.
    expect(human.some((f) => f.key === "project_id")).toBe(true);
    expect(human.some((f) => f.key === "title")).toBe(true);
    const requiredJson = [{ ...field(fields, "metadata"), required: true }];
    expect(humanFormFields(requiredJson)).toHaveLength(1);
  });

  it("returns [] for anything that is not an object schema", () => {
    expect(deriveSchemaFields(null)).toEqual([]);
    expect(deriveSchemaFields({ type: "string" })).toEqual([]);
  });
});

describe("buildSchemaPayload", () => {
  const t = noun("task");
  const createFields = deriveSchemaFields(t.schemas!.create, {
    titleColumn: t.title_column,
    resolveRecordToken: resolve,
  });
  const updateFields = deriveSchemaFields(t.schemas!.update, {
    titleColumn: t.title_column,
    exclude: ["id"],
    resolveRecordToken: resolve,
  });

  it("create sends what was set and nothing else — the server applies its defaults", () => {
    const { payload, warnings } = buildSchemaPayload(
      createFields,
      {
        title: touched("Kickoff"),
        priority: touched("high"),
        project_id: touched("7c1a5f0e-0000-4000-8000-000000000001"),
        status: { raw: "", touched: false },
      },
      "create",
    );
    expect(payload).toEqual({
      title: "Kickoff",
      priority: "high",
      project_id: "7c1a5f0e-0000-4000-8000-000000000001",
    });
    expect(warnings).toEqual([]);
  });

  it("a missing required field WARNS and still builds the payload (never blocks)", () => {
    const { payload, warnings } = buildSchemaPayload(createFields, {}, "create");
    expect(payload).toEqual({});
    expect(warnings).toEqual([
      expect.objectContaining({ key: "title" }),
    ]);
  });

  it("update sends only touched fields, on top of the id the picker supplies", () => {
    const { payload, warnings } = buildSchemaPayload(
      updateFields,
      { status: touched("completed"), description: touched("") },
      "update",
      { id: "task-1" },
    );
    expect(payload).toEqual({ id: "task-1", status: "completed" });
    expect(warnings).toEqual([]);
  });

  it("a blank field is NEVER sent on an update — not as '' and not as null", () => {
    // Live 2026-09-30: typing into Metadata then clearing it sent
    // `metadata: null` into a NOT NULL column. Every update field is optional
    // in the schema, which says nothing about whether the column may be emptied.
    const { payload } = buildSchemaPayload(
      updateFields,
      { metadata: touched(""), description: touched("   ") },
      "update",
      { id: "task-1" },
    );
    expect(payload).toEqual({ id: "task-1" });
  });

  it("an update that sets nothing warns that the button would do nothing", () => {
    const { payload, warnings } = buildSchemaPayload(updateFields, {}, "update", {
      id: "task-1",
    });
    expect(payload).toEqual({ id: "task-1" });
    expect(warnings.map((w) => w.key)).toEqual([null]);
  });

  it("the admin builder's update (id is a field there) still warns when only the id is set", () => {
    const adminUpdate = deriveSchemaFields(t.schemas!.update, {
      titleColumn: t.title_column,
      resolveRecordToken: (k) => (k === "id" ? ("task" as EntityTypeToken) : null),
    });
    expect(field(adminUpdate, "id")).toMatchObject({
      kind: "record",
      recordToken: "task",
      tier: "essential",
    });
    const { payload, warnings } = buildSchemaPayload(
      adminUpdate,
      { id: touched("task-1") },
      "update",
    );
    expect(payload).toEqual({ id: "task-1" });
    expect(warnings.map((w) => w.key)).toEqual([null]);
  });

  it("an update leads with the record it changes, named by its type — never 'id'", () => {
    const adminUpdate = deriveSchemaFields(t.schemas!.update, {
      titleColumn: t.title_column,
      resolveRecordToken: (k) => (k === "id" ? ("task" as EntityTypeToken) : null),
    });
    expect(adminUpdate[0]).toMatchObject({ key: "id", label: "Task" });
    expect(adminUpdate[1]?.key).toBe(t.title_column);
  });

  it("converts a local date-time to ISO, and keeps bad JSON as text with a warning", () => {
    const { payload, warnings } = buildSchemaPayload(
      createFields,
      {
        title: touched("x"),
        completed_at: touched("2026-09-30T14:05"),
        metadata: touched("{not json"),
      },
      "create",
    );
    expect(payload.completed_at).toBe(new Date("2026-09-30T14:05").toISOString());
    expect(payload.metadata).toBe("{not json");
    expect(warnings.map((w) => w.key)).toEqual(["metadata"]);
  });

  it("an untouched form is calm: what is missing sits at the button, a bad value at its field", () => {
    const pristine = buildSchemaPayload(createFields, {}, "create");
    const calm = splitWarnings(pristine.warnings, {});
    expect(calm.field).toEqual([]);
    expect(calm.action).toEqual([expect.stringContaining("Title is required")]);

    const values = { title: touched(""), metadata: touched("{bad") };
    const typed = buildSchemaPayload(createFields, values, "create");
    const split = splitWarnings(typed.warnings, values);
    // Touched-and-emptied required, and a bad value, belong to their fields.
    expect(split.field.map((w) => w.key).sort()).toEqual(["metadata", "title"]);
    expect(split.action).toEqual([]);
  });

  it("round-trips through valuesFromPayload (the admin builder's JSON ⇄ fields switch)", () => {
    const original = {
      title: "Round trip",
      priority: "low",
      metadata: { a: 1 },
      completed_at: new Date("2026-09-30T14:05").toISOString(),
    };
    const values = valuesFromPayload(createFields, original);
    const { payload } = buildSchemaPayload(createFields, values, "create");
    expect(payload).toEqual(original);
  });
});
