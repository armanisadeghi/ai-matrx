/**
 * kind-input-values — the value layer that carries the R5 schema bridge's
 * derived inputs back into kind space, and the two honesty channels the Inputs
 * tab renders.
 *
 * The headline test is `describeRoundTripDrift`: for a kind with a structured
 * field, `variableDefinitionsToKindFields` reports ZERO losses while silently
 * turning `array` into `string`. A tab that showed only `losses[]` would claim
 * the conversion was lossless. The drift table is what makes that a lie the UI
 * cannot tell.
 */

import {
  kindFieldsToVariableDefinitions,
  variableDefinitionsToKindFields,
} from "../convert/kind-variable-bridge";
import { validateStructuralLeg } from "../registry/kind-dual-gate";
import { KIND_KEY, type KindSchema } from "../core/kind-schema.types";
import {
  assembleKindInstance,
  attributeStructuralErrors,
  coerceInputValueToKindValue,
  describeRoundTripDrift,
  fieldTypeLabel,
  initialValuesForVariables,
  initialValuesFromInstance,
  KindInputPairingError,
  pairKindFieldsWithVariables,
} from "../input/kind-input-values";

// A faithful trim of the live `flashcard_set` kind: one required scalar plus a
// required structured field (the R5 structured-JSON textarea case).
const flashcardSetSchema: KindSchema = {
  kind: "flashcard_set",
  fields: {
    title: { type: "string", required: true },
    cards: { type: "array", itemKinds: ["flashcard"], required: true },
  },
};

// The matching emitted_json_schema (anyOf collapsed to a single item schema so
// ajv's messages are deterministic; the real one is otherwise identical).
const flashcardSetEmitted = {
  type: "object",
  required: ["cards", "title"],
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    cards: {
      type: "array",
      items: {
        type: "object",
        required: ["front", "back"],
        additionalProperties: false,
        properties: {
          front: { type: "string" },
          back: { type: "string" },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// pairKindFieldsWithVariables
// ---------------------------------------------------------------------------

describe("pairKindFieldsWithVariables", () => {
  it("zips fields to derived variables in declaration order", () => {
    const pairs = pairKindFieldsWithVariables(flashcardSetSchema);
    expect(pairs.map((p) => p.fieldKey)).toEqual(["title", "cards"]);
    expect(pairs.map((p) => p.variable.name)).toEqual(["title", "cards"]);
    expect(pairs.every((p) => !p.renamed)).toBe(true);
  });

  it("flags a field the bridge renamed via sanitizeVariableName", () => {
    const pairs = pairKindFieldsWithVariables({
      kind: "demo",
      fields: { "Card Count": { type: "number" } },
    });
    expect(pairs).toHaveLength(1);
    expect(pairs[0].fieldKey).toBe("Card Count");
    expect(pairs[0].variable.name).toBe("card_count");
    expect(pairs[0].renamed).toBe(true);
  });

  it("carries the field's own schema, not just its type", () => {
    const pairs = pairKindFieldsWithVariables(flashcardSetSchema);
    expect(pairs[1].field).toEqual({
      type: "array",
      itemKinds: ["flashcard"],
      required: true,
    });
  });

  it("exports a loud error type for the one-variable-per-field contract", () => {
    expect(new KindInputPairingError("x")).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// coerceInputValueToKindValue — variable string-space → kind typed-space
// ---------------------------------------------------------------------------

describe("coerceInputValueToKindValue", () => {
  it("omits blank input so a required field fails on `required`, not on `type`", () => {
    expect(
      coerceInputValueToKindValue({ type: "string" }, ""),
    ).toEqual({ status: "omitted" });
    expect(
      coerceInputValueToKindValue({ type: "string" }, "   "),
    ).toEqual({ status: "omitted" });
    expect(
      coerceInputValueToKindValue({ type: "number" }, undefined),
    ).toEqual({ status: "omitted" });
  });

  it("treats `false` and `0` as real values, never as blank", () => {
    expect(coerceInputValueToKindValue({ type: "boolean" }, false)).toEqual({
      status: "ok",
      value: false,
    });
    expect(coerceInputValueToKindValue({ type: "number" }, 0)).toEqual({
      status: "ok",
      value: 0,
    });
    // The number stepper emits strings.
    expect(coerceInputValueToKindValue({ type: "number" }, "0")).toEqual({
      status: "ok",
      value: 0,
    });
  });

  it("parses the toggle's label output back into a boolean", () => {
    // ToggleInput emits its onLabel/offLabel; the bridge emits no toggleValues,
    // so VariableInputComponent's defaults ("Yes"/"No") are what arrive here.
    expect(coerceInputValueToKindValue({ type: "boolean" }, "Yes")).toEqual({
      status: "ok",
      value: true,
    });
    expect(coerceInputValueToKindValue({ type: "boolean" }, "No")).toEqual({
      status: "ok",
      value: false,
    });
    expect(coerceInputValueToKindValue({ type: "boolean" }, "true")).toEqual({
      status: "ok",
      value: true,
    });
  });

  it("errors — never guesses — on an uncoercible boolean or number", () => {
    expect(coerceInputValueToKindValue({ type: "boolean" }, "maybe")).toEqual({
      status: "error",
      message: expect.stringContaining("is not a boolean"),
    });
    expect(coerceInputValueToKindValue({ type: "number" }, "twelve")).toEqual({
      status: "error",
      message: expect.stringContaining("is not a number"),
    });
  });

  it("splits scalar-array textareas one-per-line, dropping blank lines", () => {
    expect(
      coerceInputValueToKindValue({ type: "string[]" }, "alpha\n\n beta \n"),
    ).toEqual({ status: "ok", value: ["alpha", "beta"] });
    expect(
      coerceInputValueToKindValue({ type: "number[]" }, "1\n2\n3"),
    ).toEqual({ status: "ok", value: [1, 2, 3] });
    expect(
      coerceInputValueToKindValue({ type: "boolean[]" }, "yes\nno"),
    ).toEqual({ status: "ok", value: [true, false] });
  });

  it("reports the offending line number for a bad scalar-array entry", () => {
    expect(
      coerceInputValueToKindValue({ type: "number[]" }, "1\nnope\n3"),
    ).toEqual({
      status: "error",
      message: expect.stringContaining("line 2"),
    });
  });

  it("JSON-parses every structured field (R5: structured-JSON textarea)", () => {
    expect(
      coerceInputValueToKindValue(
        { type: "array", itemKinds: ["flashcard"] },
        '[{"front":"a","back":"b"}]',
      ),
    ).toEqual({ status: "ok", value: [{ front: "a", back: "b" }] });

    expect(
      coerceInputValueToKindValue({ type: "record", values: "string" }, "{}"),
    ).toEqual({ status: "ok", value: {} });

    expect(
      coerceInputValueToKindValue({ type: "union", scalars: ["number"] }, "7"),
    ).toEqual({ status: "ok", value: 7 });
  });

  it("surfaces malformed structured JSON as an error, not an empty object", () => {
    const result = coerceInputValueToKindValue(
      { type: "object", kind: "flashcard" },
      "{ not json",
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toContain("not valid JSON");
    }
  });

  it("passes enum values through untouched — membership is ajv's job", () => {
    expect(
      coerceInputValueToKindValue({ type: "enum", values: ["a", "b"] }, "zzz"),
    ).toEqual({ status: "ok", value: "zzz" });
  });
});

// ---------------------------------------------------------------------------
// assembleKindInstance
// ---------------------------------------------------------------------------

describe("assembleKindInstance", () => {
  it("stamps __kind and keys the instance by FIELD KEY, not variable name", () => {
    const schema: KindSchema = {
      kind: "demo",
      fields: { "Card Count": { type: "number" } },
    };
    const pairs = pairKindFieldsWithVariables(schema);
    const { instance } = assembleKindInstance("demo", pairs, {
      card_count: "12",
    });
    expect(instance).toEqual({ [KIND_KEY]: "demo", "Card Count": 12 });
  });

  it("omits blank fields and records uncoercible ones without dropping them silently", () => {
    const pairs = pairKindFieldsWithVariables(flashcardSetSchema);
    const result = assembleKindInstance("flashcard_set", pairs, {
      title: "",
      cards: "{ broken",
    });
    expect(result.omittedFields).toEqual(["title"]);
    expect(Object.keys(result.coercionErrors)).toEqual(["cards"]);
    // The bad field is absent from the instance, but LOUDLY so.
    expect(result.instance).toEqual({ [KIND_KEY]: "flashcard_set" });
  });

  it("seeds from the bridge's defaultValues so the form opens on a real stub", () => {
    const variables = kindFieldsToVariableDefinitions(flashcardSetSchema);
    const values = initialValuesForVariables(variables);
    expect(values.title).toBe("");
    expect(JSON.parse(String(values.cards))).toEqual([
      { [KIND_KEY]: "flashcard" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// describeRoundTripDrift — the honesty channel losses[] cannot provide
// ---------------------------------------------------------------------------

describe("describeRoundTripDrift", () => {
  it("flags array→string flattening that the loss report reports as lossless", () => {
    const pairs = pairKindFieldsWithVariables(flashcardSetSchema);
    const roundTrip = variableDefinitionsToKindFields(
      pairs.map((p) => p.variable),
    );

    // THE POINT: the reverse converter narrowed no value domain, so it records
    // nothing — yet `cards` came back as a plain string.
    expect(roundTrip.losses).toEqual([]);
    expect(roundTrip.fields.cards).toEqual({ type: "string", required: true });

    const drift = describeRoundTripDrift(pairs, roundTrip.fields);
    expect(drift).toEqual([
      {
        fieldKey: "title",
        variableName: "title",
        originalType: "string",
        reconstructedType: "string",
        changed: false,
      },
      {
        fieldKey: "cards",
        variableName: "cards",
        originalType: "array(flashcard)",
        reconstructedType: "string",
        changed: true,
      },
    ]);
  });

  it("is the identity for the bridge's documented clean subset", () => {
    const clean: KindSchema = {
      kind: "clean",
      fields: {
        name: { type: "string", required: true },
        count: { type: "number" },
        enabled: { type: "boolean" },
        mode: { type: "enum", values: ["fast", "slow"] },
      },
    };
    const pairs = pairKindFieldsWithVariables(clean);
    const roundTrip = variableDefinitionsToKindFields(
      pairs.map((p) => p.variable),
    );
    expect(roundTrip.losses).toEqual([]);
    const drift = describeRoundTripDrift(pairs, roundTrip.fields);
    expect(drift.filter((row) => row.changed)).toEqual([]);
  });

  it("reports a dropped field as null rather than pretending it round-tripped", () => {
    const pairs = pairKindFieldsWithVariables(flashcardSetSchema);
    const drift = describeRoundTripDrift(pairs, {});
    expect(drift.map((row) => row.reconstructedType)).toEqual([null, null]);
    expect(drift.every((row) => row.changed)).toBe(true);
  });
});

describe("fieldTypeLabel", () => {
  it("renders the structural payload, not just the bare type name", () => {
    expect(fieldTypeLabel({ type: "enum", values: ["a", "b"] })).toBe(
      "enum(a | b)",
    );
    expect(fieldTypeLabel({ type: "array", itemKinds: ["x", "y"] })).toBe(
      "array(x | y)",
    );
    expect(fieldTypeLabel({ type: "object", kind: "flashcard" })).toBe(
      "object(flashcard)",
    );
    expect(fieldTypeLabel({ type: "record", values: "number" })).toBe(
      "record<string, number>",
    );
    expect(
      fieldTypeLabel({ type: "inline_object", fields: { a: { type: "string" } } }),
    ).toBe("inline_object(1 fields)");
    expect(fieldTypeLabel({ type: "string[]" })).toBe("string[]");
  });
});

// ---------------------------------------------------------------------------
// attributeStructuralErrors
// ---------------------------------------------------------------------------

describe("attributeStructuralErrors", () => {
  const keys = ["title", "cards"] as const;

  it("returns empty channels when the leg passed", () => {
    expect(attributeStructuralErrors(undefined, keys)).toEqual({
      byField: {},
      formLevel: [],
    });
  });

  it("attributes a root `required` error to the missing field", () => {
    const { byField, formLevel } = attributeStructuralErrors(
      "sample failed schema: (root) must have required property 'title'",
      keys,
    );
    expect(byField).toEqual({
      title: ["(root) must have required property 'title'"],
    });
    expect(formLevel).toEqual([]);
  });

  it("attributes a nested instancePath to its top-level owner", () => {
    const { byField } = attributeStructuralErrors(
      "sample failed schema: /cards/0 must have required property 'front'; /cards/0 must have required property 'back'",
      keys,
    );
    expect(byField.cards).toEqual([
      "/cards/0 must have required property 'front'",
      "/cards/0 must have required property 'back'",
    ]);
  });

  it("never drops an unattributable error — it lands in formLevel", () => {
    const { byField, formLevel } = attributeStructuralErrors(
      "sample failed schema: (root) must NOT have additional properties; /unknown_field must be string",
      keys,
    );
    expect(byField).toEqual({});
    expect(formLevel).toEqual([
      "(root) must NOT have additional properties",
      "/unknown_field must be string",
    ]);
  });
});

// ---------------------------------------------------------------------------
// End-to-end against the REAL validator (the activation gate's ajv leg)
// ---------------------------------------------------------------------------

describe("assembled instance ⇄ validateStructuralLeg", () => {
  const pairs = pairKindFieldsWithVariables(flashcardSetSchema);
  const fieldKeys = pairs.map((p) => p.fieldKey);

  it("fails the untouched default form, attributing each error to its field", () => {
    // The bridge's stub for `cards` is `[{"__kind":"flashcard"}]`. The gate
    // strips __kind recursively, leaving `[{}]` — a card with no front/back.
    const values = initialValuesForVariables(pairs.map((p) => p.variable));
    const { instance } = assembleKindInstance("flashcard_set", pairs, values);

    const leg = validateStructuralLeg(instance, flashcardSetEmitted);
    expect(leg.ok).toBe(false);

    const { byField } = attributeStructuralErrors(leg.detail, fieldKeys);
    // title was blank → omitted → root `required` error, attributed to `title`.
    expect(byField.title?.join(" ")).toContain("required property 'title'");
    // the stub card is missing both of its own required properties.
    expect(byField.cards?.join(" ")).toContain("required property 'front'");
    expect(byField.cards?.join(" ")).toContain("required property 'back'");
  });

  it("passes once the form holds a real instance", () => {
    const { instance, coercionErrors } = assembleKindInstance(
      "flashcard_set",
      pairs,
      {
        title: "Cell Biology",
        cards: '[{"front":"Mitochondria?","back":"Powerhouse"}]',
      },
    );
    expect(coercionErrors).toEqual({});
    expect(instance[KIND_KEY]).toBe("flashcard_set");

    const leg = validateStructuralLeg(instance, flashcardSetEmitted);
    expect(leg.ok).toBe(true);
    expect(attributeStructuralErrors(leg.detail, fieldKeys)).toEqual({
      byField: {},
      formLevel: [],
    });
  });

  it("keeps __kind out of ajv's way (additionalProperties:false at root)", () => {
    const { instance } = assembleKindInstance("flashcard_set", pairs, {
      title: "T",
      cards: '[{"front":"a","back":"b"}]',
    });
    expect(Object.keys(instance)).toContain(KIND_KEY);
    expect(validateStructuralLeg(instance, flashcardSetEmitted).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P-2 instance persistence: the coercion INVERSE that prefires the edit form
// ---------------------------------------------------------------------------

describe("inputValueForKindValue / initialValuesFromInstance (edit-prefill inverse)", () => {
  // Wide schema exercising every inverse branch.
  const wideSchema: KindSchema = {
    kind: "wide",
    fields: {
      name: { type: "string", required: true },
      score: { type: "number", required: true },
      active: { type: "boolean", required: false },
      tags: { type: "string[]", required: false },
      steps: { type: "array", itemKinds: ["step"], required: false },
    },
  };

  it("round-trips every schema-valid value through coerceInputValueToKindValue", () => {
    const pairs = pairKindFieldsWithVariables(wideSchema);
    const instanceData: Record<string, unknown> = {
      name: "Ridge",
      score: 95,
      active: true,
      tags: ["a", "b"],
      steps: [{ label: "x" }],
    };
    const values = initialValuesFromInstance(pairs, instanceData);
    for (const pair of pairs) {
      const outcome = coerceInputValueToKindValue(
        pair.field,
        values[pair.variable.name],
      );
      expect(outcome).toEqual({ status: "ok", value: instanceData[pair.fieldKey] });
    }
  });

  it("falls back to variable defaults for keys the instance omits", () => {
    const pairs = pairKindFieldsWithVariables(wideSchema);
    const values = initialValuesFromInstance(pairs, { name: "Only" });
    const namePair = pairs.find((p) => p.fieldKey === "name");
    const scorePair = pairs.find((p) => p.fieldKey === "score");
    if (!namePair || !scorePair) throw new Error("pair lookup failed");
    expect(values[namePair.variable.name]).toBe("Only");
    expect(values[scorePair.variable.name]).toBe(scorePair.variable.defaultValue);
  });
});
