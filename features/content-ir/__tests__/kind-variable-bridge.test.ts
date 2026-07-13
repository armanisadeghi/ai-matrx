/**
 * kind-variable-bridge — the R5 kind ↔ agent-spec converter.
 *
 * Covers: every FieldSchema variant forward (scalars, scalar arrays, enum,
 * array/object/inline_object/record/union JSON-stub textareas), every
 * VARIABLE_COMPONENT_TYPES member in reverse (compile-time-exhaustive via a
 * Record over the union), every ContextObjectType (same technique), the
 * loss-report discipline (toggleValues, min/max/step, allowOther, checkbox
 * enum-set, media refs, picklists, bindings, json-slot narrowing,
 * duplicates), name sanitization, and THE ROUND-TRIP LAW: for the clean
 * subset (string/number/boolean/enum) kindFields → variables → kindFields is
 * the identity with zero losses.
 */

import {
  contextSlotsToKindFields,
  kindFieldsToVariableDefinitions,
  LIST_HELP_TEXT,
  structuredJsonHelpText,
  variableDefinitionsToKindFields,
} from "../convert/kind-variable-bridge";
import {
  KIND_KEY,
  type FieldSchema,
  type KindSchema,
} from "../core/kind-schema.types";
import {
  VARIABLE_COMPONENT_TYPES,
  type VariableComponentType,
  type VariableCustomComponent,
  type VariableDefinition,
} from "@/features/agents/types/agent-definition.types";
import type {
  ContextObjectType,
  ContextSlot,
} from "@/features/agents/types/agent-api-types";

const makeSchema = (fields: KindSchema["fields"]): KindSchema => ({
  kind: "bridge_demo",
  fields,
});

const makeVar = (
  name: string,
  customComponent?: VariableCustomComponent,
  extra?: Partial<VariableDefinition>,
): VariableDefinition => ({
  name,
  defaultValue: "",
  ...(customComponent ? { customComponent } : {}),
  ...extra,
});

// ---------------------------------------------------------------------------
// 1) kindFieldsToVariableDefinitions — every FieldSchema variant
// ---------------------------------------------------------------------------

describe("kindFieldsToVariableDefinitions", () => {
  it("string → textarea with empty default", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({ title: { type: "string", required: true } }),
    );
    expect(vars).toStrictEqual([
      {
        name: "title",
        defaultValue: "",
        customComponent: { type: "textarea" },
        required: true,
      },
    ]);
  });

  it("number → number component with no min/max (FieldSchema v1 has none)", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({ count: { type: "number" } }),
    );
    expect(vars).toStrictEqual([
      { name: "count", defaultValue: 0, customComponent: { type: "number" } },
    ]);
  });

  it("boolean → toggle without toggleValues, default false", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({ enabled: { type: "boolean" } }),
    );
    expect(vars).toStrictEqual([
      {
        name: "enabled",
        defaultValue: false,
        customComponent: { type: "toggle" },
      },
    ]);
  });

  it("enum → select with options = values, empty (unselected) default", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({ tone: { type: "enum", values: ["formal", "casual"] } }),
    );
    expect(vars).toStrictEqual([
      {
        name: "tone",
        defaultValue: "",
        customComponent: { type: "select", options: ["formal", "casual"] },
      },
    ]);
  });

  it.each(["string[]", "number[]", "boolean[]"] as const)(
    "%s → one-per-line textarea with empty default (documented v1 flattening)",
    (type) => {
      const vars = kindFieldsToVariableDefinitions(
        makeSchema({ items: { type } }),
      );
      expect(vars).toStrictEqual([
        {
          name: "items",
          defaultValue: "",
          helpText: LIST_HELP_TEXT,
          customComponent: { type: "textarea" },
        },
      ]);
    },
  );

  it("array+itemKinds → structured-JSON textarea with one stub element per itemKind", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({
        cards: {
          type: "array",
          itemKinds: ["flashcard", "quiz_question"],
          required: true,
        },
      }),
    );
    const stub = [
      { [KIND_KEY]: "flashcard" },
      { [KIND_KEY]: "quiz_question" },
    ];
    expect(vars).toStrictEqual([
      {
        name: "cards",
        defaultValue: JSON.stringify(stub, null, 2),
        helpText: structuredJsonHelpText("array of flashcard | quiz_question"),
        customComponent: { type: "textarea" },
        required: true,
      },
    ]);
    expect(JSON.parse(String(vars[0].defaultValue))).toStrictEqual(stub);
  });

  it("object+kind → structured-JSON textarea with a __kind-only stub", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({ chart: { type: "object", kind: "bar_chart" } }),
    );
    expect(vars).toStrictEqual([
      {
        name: "chart",
        defaultValue: JSON.stringify({ [KIND_KEY]: "bar_chart" }, null, 2),
        helpText: structuredJsonHelpText("bar_chart"),
        customComponent: { type: "textarea" },
      },
    ]);
  });

  it("inline_object → structured-JSON textarea with recursive zero-value stub", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({
        meta: {
          type: "inline_object",
          fields: {
            label: { type: "string" },
            weight: { type: "number" },
            on: { type: "boolean" },
            tone: { type: "enum", values: ["a", "b"] },
            tags: { type: "string[]" },
            child: { type: "object", kind: "note_card" },
            lookup: { type: "record", values: "number" },
            mixed: { type: "union", scalars: ["number", "string"] },
          },
        },
      }),
    );
    expect(vars[0].helpText).toBe(structuredJsonHelpText("inline object"));
    expect(vars[0].customComponent).toStrictEqual({ type: "textarea" });
    expect(JSON.parse(String(vars[0].defaultValue))).toStrictEqual({
      label: "",
      weight: 0,
      on: false,
      tone: "a",
      tags: [],
      child: { [KIND_KEY]: "note_card" },
      lookup: {},
      mixed: 0,
    });
  });

  it("record → structured-JSON textarea with an empty-object stub", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({ lookup: { type: "record", values: "string" } }),
    );
    expect(vars).toStrictEqual([
      {
        name: "lookup",
        defaultValue: JSON.stringify({}, null, 2),
        helpText: structuredJsonHelpText("record of string"),
        customComponent: { type: "textarea" },
      },
    ]);
  });

  it("union → structured-JSON textarea stubbed with the first scalar's zero value", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({ mixed: { type: "union", scalars: ["string", "number"] } }),
    );
    expect(vars).toStrictEqual([
      {
        name: "mixed",
        defaultValue: JSON.stringify("", null, 2),
        helpText: structuredJsonHelpText("string | number"),
        customComponent: { type: "textarea" },
      },
    ]);
  });

  it("required is omitted (never false) when the field is not required", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({ note: { type: "string" } }),
    );
    expect("required" in vars[0]).toBe(false);
  });

  it("nullable has no VariableDefinition home — documented flattening", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({ note: { type: "string", nullable: true } }),
    );
    expect(vars).toStrictEqual([
      { name: "note", defaultValue: "", customComponent: { type: "textarea" } },
    ]);
  });

  it("sanitizes field keys via the variables-system sanitizer", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({ "My Field!": { type: "string" } }),
    );
    expect(vars[0].name).toBe("my_field");
  });

  it("keeps the verbatim key when sanitization yields an empty string", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({ "!!!": { type: "string" } }),
    );
    expect(vars[0].name).toBe("!!!");
  });

  it("suffixes post-sanitization name collisions so no field vanishes", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({
        "my field": { type: "string" },
        my_field: { type: "number" },
      }),
    );
    expect(vars.map((v) => v.name)).toStrictEqual(["my_field", "my_field_2"]);
  });

  it("sanitizeNames: false keeps keys verbatim", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({ "My Field": { type: "string" } }),
      { sanitizeNames: false },
    );
    expect(vars[0].name).toBe("My Field");
  });
});

// ---------------------------------------------------------------------------
// 2) variableDefinitionsToKindFields — every VARIABLE_COMPONENT_TYPES member
// ---------------------------------------------------------------------------

describe("variableDefinitionsToKindFields", () => {
  // Compile-time exhaustive: adding a member to VARIABLE_COMPONENT_TYPES
  // breaks this Record until the bridge (and this table) handle it.
  const BARE_EXPECTATIONS: Record<
    VariableComponentType,
    { type: FieldSchema["type"]; loss: boolean }
  > = {
    textarea: { type: "string", loss: false },
    toggle: { type: "boolean", loss: false },
    "light-switch": { type: "boolean", loss: false },
    radio: { type: "string", loss: true }, // no static options
    "pill-toggle": { type: "string", loss: true },
    "selection-list": { type: "string", loss: true },
    buttons: { type: "string", loss: true },
    select: { type: "string", loss: true },
    checkbox: { type: "string[]", loss: false }, // no options → no enum-set to lose
    number: { type: "number", loss: false },
    slider: { type: "number", loss: false }, // no min/max/step set
    datetime: { type: "string", loss: true },
    time: { type: "string", loss: true },
    email: { type: "string", loss: true },
    url: { type: "string", loss: true },
    phone: { type: "string", loss: true },
    percent: { type: "number", loss: false },
    color: { type: "string", loss: true },
    markdown: { type: "string", loss: true },
    currency: { type: "string", loss: true },
    image: { type: "string", loss: true },
    audio: { type: "string", loss: true },
    video: { type: "string", loss: true },
    youtube: { type: "string", loss: true },
    document: { type: "string", loss: true },
  };

  it("maps every VARIABLE_COMPONENT_TYPES member (bare component, no options)", () => {
    for (const type of VARIABLE_COMPONENT_TYPES) {
      const { fields, losses } = variableDefinitionsToKindFields([
        makeVar("v", { type }),
      ]);
      const expected = BARE_EXPECTATIONS[type];
      expect(fields.v.type).toBe(expected.type);
      expect(losses.length > 0).toBe(expected.loss);
    }
  });

  it("a variable without customComponent is a textarea → string", () => {
    const { fields, losses } = variableDefinitionsToKindFields([
      makeVar("plain"),
    ]);
    expect(fields.plain).toStrictEqual({ type: "string" });
    expect(losses).toStrictEqual([]);
  });

  it.each(["select", "radio", "pill-toggle", "selection-list", "buttons"] as const)(
    "%s with options → enum with values = options, no loss",
    (type) => {
      const { fields, losses } = variableDefinitionsToKindFields([
        makeVar("v", { type, options: ["a", "b"] }),
      ]);
      expect(fields.v).toStrictEqual({ type: "enum", values: ["a", "b"] });
      expect(losses).toStrictEqual([]);
    },
  );

  it("allowOther widens an optioned single-select to string, with a loss", () => {
    const { fields, losses } = variableDefinitionsToKindFields([
      makeVar("v", { type: "select", options: ["a", "b"], allowOther: true }),
    ]);
    expect(fields.v).toStrictEqual({ type: "string" });
    expect(losses).toHaveLength(1);
    expect(losses[0].reason).toContain("allowOther");
  });

  it("checkbox with options → string[] with the enum-set constraint in the loss report", () => {
    const { fields, losses } = variableDefinitionsToKindFields([
      makeVar("v", { type: "checkbox", options: ["x", "y"] }),
    ]);
    expect(fields.v).toStrictEqual({ type: "string[]" });
    expect(losses).toHaveLength(1);
    expect(losses[0].reason).toContain("enum-set");
    expect(losses[0].reason).toContain('"x"');
  });

  it.each(["toggle", "light-switch"] as const)(
    "%s with toggleValues → boolean plus a toggleValues loss entry",
    (type) => {
      const { fields, losses } = variableDefinitionsToKindFields([
        makeVar("v", { type, toggleValues: ["Off", "On"] }),
      ]);
      expect(fields.v).toStrictEqual({ type: "boolean" });
      expect(losses).toHaveLength(1);
      expect(losses[0].reason).toContain("toggleValues");
      expect(losses[0].reason).toContain("On");
    },
  );

  it.each(["number", "slider"] as const)(
    "%s with min/max/step → number plus a bounds loss entry",
    (type) => {
      const { fields, losses } = variableDefinitionsToKindFields([
        makeVar("v", { type, min: 1, max: 10, step: 2 }),
      ]);
      expect(fields.v).toStrictEqual({ type: "number" });
      expect(losses).toHaveLength(1);
      expect(losses[0].reason).toContain("min, max, step");
    },
  );

  it.each(["image", "audio", "video", "youtube", "document"] as const)(
    "%s → string with a media-ref loss entry",
    (type) => {
      const { fields, losses } = variableDefinitionsToKindFields([
        makeVar("v", { type }),
      ]);
      expect(fields.v).toStrictEqual({ type: "string" });
      expect(losses).toHaveLength(1);
      expect(losses[0].reason).toContain("media ref");
    },
  );

  it("picklist-bound with static options (single-select) → enum, no loss", () => {
    const { fields, losses } = variableDefinitionsToKindFields([
      makeVar("v", {
        type: "select",
        options: ["x", "y"],
        picklist: { listId: "list-1" },
      }),
    ]);
    expect(fields.v).toStrictEqual({ type: "enum", values: ["x", "y"] });
    expect(losses).toStrictEqual([]);
  });

  it("picklist-bound without static options → string plus a loss", () => {
    const { fields, losses } = variableDefinitionsToKindFields([
      makeVar("v", { type: "select", picklist: { listId: "list-1" } }),
    ]);
    expect(fields.v).toStrictEqual({ type: "string" });
    expect(losses).toHaveLength(1);
    expect(losses[0].reason).toContain("picklist-bound");
    expect(losses[0].reason).toContain("list-1");
  });

  it("picklist-bound multi-select → string plus a loss even with static options", () => {
    const { fields, losses } = variableDefinitionsToKindFields([
      makeVar("v", {
        type: "checkbox",
        options: ["x"],
        picklist: { listId: "list-1", multiple: true },
      }),
    ]);
    expect(fields.v).toStrictEqual({ type: "string" });
    expect(losses).toHaveLength(1);
    expect(losses[0].reason).toContain("multi-select");
  });

  it("a binding-driven variable emits NO field, only a loss entry", () => {
    const { fields, losses } = variableDefinitionsToKindFields([
      {
        name: "ctx",
        defaultValue: "",
        binding: {
          contextItemId: "ci-1",
          scopeTypeId: "st-1",
          itemKey: "client_name",
        },
      },
    ]);
    expect(fields).toStrictEqual({});
    expect(losses).toHaveLength(1);
    expect(losses[0]).toStrictEqual({
      name: "ctx",
      reason:
        'bound to scope context item "client_name" — value is resolved at run time, no kind field emitted',
    });
  });

  it("required: true carries; absent required stays absent", () => {
    const { fields } = variableDefinitionsToKindFields([
      makeVar("must", { type: "textarea" }, { required: true }),
      makeVar("may", { type: "textarea" }),
    ]);
    expect(fields.must).toStrictEqual({ type: "string", required: true });
    expect(fields.may).toStrictEqual({ type: "string" });
  });

  it("duplicate variable names overwrite (last wins) and record a loss", () => {
    const { fields, losses } = variableDefinitionsToKindFields([
      makeVar("dup", { type: "textarea" }),
      makeVar("dup", { type: "number" }),
    ]);
    expect(fields.dup).toStrictEqual({ type: "number" });
    expect(losses).toHaveLength(1);
    expect(losses[0].name).toBe("dup");
    expect(losses[0].reason).toContain("duplicate");
  });
});

// ---------------------------------------------------------------------------
// 3) contextSlotsToKindFields — every ContextObjectType member
// ---------------------------------------------------------------------------

describe("contextSlotsToKindFields", () => {
  // Compile-time exhaustive over ContextObjectType.
  const SLOT_EXPECTATIONS: Record<
    ContextObjectType,
    { type: FieldSchema["type"]; loss: boolean }
  > = {
    text: { type: "string", loss: false },
    json: { type: "record", loss: true },
    file_url: { type: "string", loss: true },
    db_ref: { type: "string", loss: true },
    user: { type: "string", loss: true },
    org: { type: "string", loss: true },
    workspace: { type: "string", loss: true },
    project: { type: "string", loss: true },
    task: { type: "string", loss: true },
    variable: { type: "string", loss: true },
  };

  it("maps every ContextObjectType member", () => {
    const entries = Object.entries(SLOT_EXPECTATIONS) as Array<
      [ContextObjectType, { type: FieldSchema["type"]; loss: boolean }]
    >;
    for (const [slotType, expected] of entries) {
      const slot: ContextSlot = { key: `k_${slotType}`, type: slotType };
      const { fields, losses } = contextSlotsToKindFields([slot]);
      expect(fields[`k_${slotType}`].type).toBe(expected.type);
      expect(losses.length > 0).toBe(expected.loss);
    }
  });

  it("text → string with no loss and no required (slots are always optional)", () => {
    const { fields, losses } = contextSlotsToKindFields([
      { key: "summary", type: "text", label: "Summary" },
    ]);
    expect(fields.summary).toStrictEqual({ type: "string" });
    expect(losses).toStrictEqual([]);
  });

  it("json → record-of-strings with an explicit narrowing loss", () => {
    const { fields, losses } = contextSlotsToKindFields([
      { key: "payload", type: "json" },
    ]);
    expect(fields.payload).toStrictEqual({ type: "record", values: "string" });
    expect(losses).toHaveLength(1);
    expect(losses[0].reason).toContain("record-of-strings");
  });

  it("structured reference slots → string with a loss naming the slot type", () => {
    const { fields, losses } = contextSlotsToKindFields([
      { key: "row", type: "db_ref" },
    ]);
    expect(fields.row).toStrictEqual({ type: "string" });
    expect(losses).toHaveLength(1);
    expect(losses[0].reason).toContain("db_ref");
  });

  it("duplicate slot keys overwrite (last wins) and record a loss", () => {
    const { fields, losses } = contextSlotsToKindFields([
      { key: "dup", type: "text" },
      { key: "dup", type: "text" },
    ]);
    expect(fields.dup).toStrictEqual({ type: "string" });
    expect(losses).toHaveLength(1);
    expect(losses[0].reason).toContain("duplicate");
  });
});

// ---------------------------------------------------------------------------
// 4) THE ROUND-TRIP LAW
// ---------------------------------------------------------------------------

describe("round-trip law", () => {
  it("clean subset (string/number/boolean/enum) round-trips to identity with zero losses", () => {
    const clean: KindSchema["fields"] = {
      title: { type: "string", required: true },
      count: { type: "number" },
      enabled: { type: "boolean", required: true },
      tone: { type: "enum", values: ["formal", "casual"] },
    };
    const vars = kindFieldsToVariableDefinitions({
      kind: "clean_demo",
      fields: clean,
    });
    const { fields, losses } = variableDefinitionsToKindFields(vars);
    expect(fields).toStrictEqual(clean);
    expect(losses).toStrictEqual([]);
  });

  it("scalar arrays flatten to string on the way back (documented v1 flattening)", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({ items: { type: "string[]" } }),
    );
    const { fields, losses } = variableDefinitionsToKindFields(vars);
    expect(fields.items).toStrictEqual({ type: "string" });
    expect(losses).toStrictEqual([]);
  });

  it("structured fields flatten to string on the way back (structured-JSON textarea)", () => {
    const vars = kindFieldsToVariableDefinitions(
      makeSchema({
        chart: { type: "object", kind: "bar_chart" },
        cards: { type: "array", itemKinds: ["flashcard"] },
        meta: { type: "inline_object", fields: { label: { type: "string" } } },
        lookup: { type: "record", values: "string" },
        mixed: { type: "union", scalars: ["string", "number"] },
      }),
    );
    const { fields, losses } = variableDefinitionsToKindFields(vars);
    expect(fields).toStrictEqual({
      chart: { type: "string" },
      cards: { type: "string" },
      meta: { type: "string" },
      lookup: { type: "string" },
      mixed: { type: "string" },
    });
    expect(losses).toStrictEqual([]);
  });

  it("required survives the round trip in both the true and absent forms", () => {
    const source: KindSchema["fields"] = {
      must: { type: "enum", values: ["a"], required: true },
      may: { type: "boolean" },
    };
    const { fields } = variableDefinitionsToKindFields(
      kindFieldsToVariableDefinitions({ kind: "req_demo", fields: source }),
    );
    expect(fields).toStrictEqual(source);
  });
});
