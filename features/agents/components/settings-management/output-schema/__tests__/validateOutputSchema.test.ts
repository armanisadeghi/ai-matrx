import { validateOutputSchema } from "../validateOutputSchema";

const validSchema = {
  name: "response",
  description: "A structured response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: { answer: { type: "string" } },
    required: ["answer"],
  },
};

describe("validateOutputSchema", () => {
  it("passes a well-formed strict schema with no errors", () => {
    const r = validateOutputSchema(validSchema);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    // a clean strict schema needs no suggestions either
    expect(r.suggestions).toEqual([]);
  });

  it("treats null as a valid (no-schema) state, with a warning only", () => {
    const r = validateOutputSchema(null);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("errors when name is missing or malformed", () => {
    expect(validateOutputSchema({ ...validSchema, name: undefined }).ok).toBe(
      false,
    );
    expect(
      validateOutputSchema({ ...validSchema, name: "has spaces" }).errors
        .length,
    ).toBeGreaterThan(0);
  });

  it("errors when the root schema is missing or not an object type", () => {
    expect(validateOutputSchema({ name: "x" }).ok).toBe(false);
    const r = validateOutputSchema({
      name: "x",
      schema: { type: "string" },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/must be "object"/);
  });

  it("suggests additionalProperties:false and full required (strict gotchas)", () => {
    const r = validateOutputSchema({
      name: "x",
      strict: true,
      schema: {
        type: "object",
        properties: { a: { type: "string" }, b: { type: "number" } },
        required: ["a"],
      },
    });
    expect(r.suggestions.join(" ")).toMatch(/additionalProperties/);
    expect(r.suggestions.join(" ")).toMatch(/required/);
  });

  it("recurses into nested objects", () => {
    const r = validateOutputSchema({
      name: "x",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          nested: {
            type: "object",
            // missing additionalProperties:false + required
            properties: { inner: { type: "string" } },
          },
        },
        required: ["nested"],
      },
    });
    expect(r.suggestions.join(" ")).toMatch(/schema\.nested/);
  });

  it("never mutates the input", () => {
    const input = JSON.parse(JSON.stringify(validSchema));
    const snapshot = JSON.stringify(input);
    validateOutputSchema(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("flags a non-object top-level value", () => {
    expect(validateOutputSchema("nope").ok).toBe(false);
    expect(validateOutputSchema([]).ok).toBe(false);
  });
});
