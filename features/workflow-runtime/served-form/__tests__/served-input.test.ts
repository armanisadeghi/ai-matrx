/**
 * THE SERVED RUN FORM's laws, proven without a browser: the served surface
 * parses as declared, sourcing gates match the server's `unsatisfied_inputs`,
 * and provenance stamping obeys THE source=human invariant (only what a
 * person typed is claimed `human`; defaults and pinned values never are).
 *
 * Fixture = the live served surface of the "Bakeoff Test Run" definition
 * (31318fb7-…), read from GET /workflows/{id}/run-form on 2026-08-27.
 */

import {
  buildSubmission,
  missingValue,
  parseServedInput,
  parseServedRunForm,
  partitionBySourcing,
  readInputsRequiredGaps,
  seedServedValues,
  servedInputsFromSections,
  unsatisfiedServedInputs,
} from "../served-input";
import { valueTypeFromJsonSchema } from "../kind-source";

const SERVED = {
  definition_id: "31318fb7-5e1a-4554-b174-ca3960d72961",
  version: 9,
  sections: [{ node_id: "t_in", title: "Test run" }],
  variables: [],
  inputs: [
    {
      name: "message",
      kind: "text",
      sourcing: "require",
      variant: null,
      default: null,
      label: "A sentence to process",
      help: "",
      placeholder: "",
      options: [],
      origin: "field",
      node_id: "t_in",
      json_schema: { title: "A sentence to process", type: "string" },
      required: true,
      pinned: false,
      read_only: false,
      pinned_value: null,
    },
    {
      name: "flavor",
      kind: "text",
      sourcing: "require",
      variant: "choice",
      default: "plain",
      label: "Flavor",
      help: "",
      placeholder: "",
      options: ["plain", "loud", "fancy"],
      origin: "field",
      node_id: "t_in",
      json_schema: { type: "string", enum: ["plain", "loud", "fancy"] },
      required: true,
      pinned: false,
      read_only: false,
      pinned_value: null,
    },
  ],
};

describe("parsing the served surface", () => {
  it("parses every declared input, keeping kind, sourcing and variant", () => {
    const form = parseServedRunForm(SERVED);
    expect(form.surfaceServed).toBe(true);
    expect(form.inputs.map((i) => i.name)).toEqual(["message", "flavor"]);
    expect(form.inputs[1].kind).toBe("text");
    expect(form.inputs[1].variant).toBe("choice");
    expect(form.inputs[1].default).toBe("plain");
  });

  it("flags a backend that serves no input surface instead of showing an empty form", () => {
    const form = parseServedRunForm({ definition_id: "x", version: 1 });
    expect(form.surfaceServed).toBe(false);
    expect(form.inputs).toEqual([]);
  });

  it("drops an entry with no name or no kind — it cannot be addressed", () => {
    expect(parseServedInput({ kind: "text" })).toBeNull();
    expect(parseServedInput({ name: "a" })).toBeNull();
    expect(parseServedInput("nope")).toBeNull();
  });
});

describe("missingValue — identical to the server's", () => {
  it("treats null and empty string as missing, false/0/[] as real values", () => {
    expect(missingValue(null)).toBe(true);
    expect(missingValue("")).toBe(true);
    expect(missingValue(undefined)).toBe(true);
    expect(missingValue(false)).toBe(false);
    expect(missingValue(0)).toBe(false);
    expect(missingValue([])).toBe(false);
  });
});

describe("seeding and sourcing gates", () => {
  const inputs = parseServedRunForm(SERVED).inputs;

  it("seeds declared defaults", () => {
    expect(seedServedValues(inputs)).toEqual({ flavor: "plain" });
  });

  it("gates a require input with no value and no default", () => {
    const gaps = unsatisfiedServedInputs(
      inputs,
      seedServedValues(inputs),
      new Set(),
    );
    expect(gaps.map((g) => g.name)).toEqual(["message"]);
  });

  it("lets a declared default satisfy require, but never ask", () => {
    const withAsk = [
      { ...inputs[1], name: "asked", sourcing: "ask" as const },
    ];
    const values = seedServedValues(withAsk);
    expect(
      unsatisfiedServedInputs(withAsk, values, new Set()).map((g) => g.name),
    ).toEqual(["asked"]);
    expect(
      unsatisfiedServedInputs(withAsk, values, new Set(["asked"])),
    ).toEqual([]);
  });

  it("clears every gate once the person answers", () => {
    const values = { ...seedServedValues(inputs), message: "hello" };
    expect(
      unsatisfiedServedInputs(inputs, values, new Set(["message"])),
    ).toEqual([]);
  });

  it("treats a pinned value as satisfied and unaskable", () => {
    const pinned = [
      {
        ...inputs[0],
        pinned: true,
        readOnly: true,
        pinnedValue: "locked by the mandate",
      },
    ];
    expect(unsatisfiedServedInputs(pinned, {}, new Set())).toEqual([]);
  });

  it("partitions by sourcing for presentation", () => {
    const parts = partitionBySourcing(inputs);
    expect(parts.require).toHaveLength(2);
    expect(parts.ask).toHaveLength(0);
    expect(parts.optional).toHaveLength(0);
  });
});

describe("THE source=human invariant, client side", () => {
  const inputs = parseServedRunForm(SERVED).inputs;

  it("stamps human on exactly what the person typed", () => {
    const values = { message: "hello", flavor: "plain" };
    const submission = buildSubmission(inputs, values, new Set(["message"]));
    expect(submission.inputs).toEqual({ message: "hello" });
    expect(submission.inputSources).toEqual({ message: "human" });
  });

  it("never re-sends a seeded default the person left alone", () => {
    const submission = buildSubmission(
      inputs,
      seedServedValues(inputs),
      new Set(),
    );
    expect(submission.inputs).toEqual({});
    expect(submission.inputSources).toEqual({});
  });

  it("sends an edited default, stamped human", () => {
    const submission = buildSubmission(
      inputs,
      { flavor: "loud" },
      new Set(["flavor"]),
    );
    expect(submission.inputs).toEqual({ flavor: "loud" });
    expect(submission.inputSources.flavor).toBe("human");
  });

  it("never echoes a pinned value back — pinned is server-stamped", () => {
    const pinned = [
      { ...inputs[0], pinned: true, readOnly: true, pinnedValue: "locked" },
    ];
    const submission = buildSubmission(
      pinned,
      { message: "typed anyway" },
      new Set(["message"]),
    );
    expect(submission.inputs).toEqual({});
  });
});

describe("the 409 gap list — a refused start is never a dead end", () => {
  it("reads the server's inputs_required gaps", () => {
    const gaps = readInputsRequiredGaps({
      detail: {
        error: "inputs_required",
        message: "This workflow needs input before it can start.",
        missing: [
          {
            name: "message",
            kind: "text",
            sourcing: "require",
            label: "A sentence to process",
            help: "",
          },
        ],
      },
    });
    expect(gaps).toEqual([
      {
        name: "message",
        kind: "text",
        sourcing: "require",
        label: "A sentence to process",
        help: "",
      },
    ]);
  });

  it("recognizes the FLATTENED 409 the live middleware actually sends, and reports it un-enumerated", () => {
    // Verified live against aidream at HEAD, 2026-08-28: the API error
    // middleware normalizes the HTTPException detail and DROPS `missing`.
    // Recognizable (not null) but empty — the form says exactly that.
    expect(
      readInputsRequiredGaps({
        error: "inputs_required",
        message: "This workflow needs input before it can start.",
        user_message: "Something went wrong. Please try again later.",
        details: null,
        request_id: "f5338d0808224f2ea426c89699e175cb",
      }),
    ).toEqual([]);
  });

  it("returns null for any other failure, so a real error is never shown as a gap", () => {
    expect(readInputsRequiredGaps({ detail: "boom" })).toBeNull();
    expect(readInputsRequiredGaps(null)).toBeNull();
  });
});

describe("value type for the resolver's last rung", () => {
  it("maps the input's own JSON Schema type", () => {
    expect(valueTypeFromJsonSchema({ type: "string" })).toBe("string");
    expect(valueTypeFromJsonSchema({ type: "integer" })).toBe("number");
    expect(valueTypeFromJsonSchema({ type: "boolean" })).toBe("boolean");
    expect(valueTypeFromJsonSchema({ type: "array" })).toBe("array");
    expect(valueTypeFromJsonSchema({})).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// THE VERSION-SKEW FALLBACK
// ---------------------------------------------------------------------------

/**
 * A server that predates the compiled input surface, verbatim: the shape
 * GET /workflows/{id}/run-form answered with for definition
 * fd6cea24-… before `inputs` existed — `sections`, each a JSON Schema.
 */
const SKEW_BODY = {
  definition_id: "fd6cea24-af30-451d-886a-34e56271ba50",
  version: 3,
  sections: [
    {
      node_id: "ask",
      title: "The Elements of Style — the Strunk Canon",
      json_schema: {
        type: "object",
        properties: {
          document: {
            title: "The text (verbatim)",
            type: "string",
            "ui:widget": "textarea",
          },
          notes: {
            title: "Facts that must not change",
            type: "string",
            default: "",
          },
          passes: { title: "Passes", type: "integer", default: 2 },
        },
        required: ["document"],
      },
    },
  ],
};

describe("the version-skew fallback reads the older `sections` schema", () => {
  const form = parseServedRunForm(SKEW_BODY);

  it("is honest that no surface was served, and says where the fields came from", () => {
    expect(form.surfaceServed).toBe(false);
    expect(form.derivedFromSections).toBe(true);
    expect(form.inputs.map((i) => i.name)).toEqual([
      "document",
      "notes",
      "passes",
    ]);
  });

  it("keeps what the schema really declares — label, default, value contract", () => {
    const [document, notes, passes] = form.inputs;
    expect(document.label).toBe("The text (verbatim)");
    expect(document.sourcing).toBe("require");
    expect(notes.sourcing).toBe("optional");
    expect(passes.default).toBe(2);
    expect(passes.kind).toBe("number");
    expect(document.kind).toBe("text");
  });

  it("never invents `ask`, a variant, or a pin — the old shape cannot express them", () => {
    // This is the guarantee the banner has to state: an input a person must
    // answer EVERY run is indistinguishable here from one a default satisfies.
    for (const input of form.inputs) {
      expect(input.sourcing).not.toBe("ask");
      expect(input.variant).toBeNull();
      expect(input.pinned).toBe(false);
      expect(input.readOnly).toBe(false);
    }
  });

  it("stays name-unique: a key two nodes both claim is kept once", () => {
    const inputs = servedInputsFromSections([
      ...SKEW_BODY.sections,
      {
        node_id: "ask2",
        json_schema: {
          type: "object",
          properties: { document: { title: "Text again", type: "string" } },
        },
      },
    ]);
    expect(inputs.filter((i) => i.name === "document")).toHaveLength(1);
    expect(inputs.find((i) => i.name === "document")?.label).toBe(
      "The text (verbatim)",
    );
  });

  it("degrades to nothing — never to a lie — when there is no schema either", () => {
    const empty = parseServedRunForm({ definition_id: "x", version: 1 });
    expect(empty.surfaceServed).toBe(false);
    expect(empty.derivedFromSections).toBe(false);
    expect(empty.inputs).toEqual([]);
  });

  it("still gates and submits by THE one law once derived", () => {
    const values = seedServedValues(form.inputs);
    expect(values.passes).toBe(2);
    // `document` is required and has no default: it blocks until typed.
    expect(
      unsatisfiedServedInputs(form.inputs, values, new Set()).map((i) => i.name),
    ).toEqual(["document"]);
    const typed = { ...values, document: "Their being late was due to..." };
    const touched = new Set(["document"]);
    expect(unsatisfiedServedInputs(form.inputs, typed, touched)).toEqual([]);
    // Only what the person typed travels, stamped `human`.
    expect(buildSubmission(form.inputs, typed, touched)).toEqual({
      inputs: { document: "Their being late was due to..." },
      inputSources: { document: "human" },
    });
  });
});
