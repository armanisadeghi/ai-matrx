/**
 * Named presentation variants — parsing, validation, and the resolver ladder.
 *
 * The rule under test: a rendering hint is a NAMED VARIANT registered on the
 * kind, selected by name (INPUT-SURFACE.md §Presentation variants). Nothing
 * here may invent a component for an input that asked for a name the kind does
 * not register — it falls back, loudly.
 */

import {
  BANNED_VARIANT_NAMES,
  customComponentToVariantParts,
  defaultComponentForValueType,
  parseKindVariants,
  resolveVariantComponent,
  serializeKindVariants,
  validateKindVariant,
  validateKindVariants,
  variantToCustomComponent,
  type KindPresentationVariant,
} from "@/features/content-ir/variants/kind-variants";
import { componentToValueType } from "@/features/scope-system/utils/componentValueType";
import type { ContextValueType } from "@/features/agent-context/types";

const textarea: KindPresentationVariant = {
  name: "textarea",
  label: "Text area",
  component_type: "textarea",
  config: {},
};

const slider: KindPresentationVariant = {
  name: "slider",
  label: "Slider",
  component_type: "slider",
  config: { min: 0, max: 100, step: 1 },
};

describe("parseKindVariants", () => {
  it("reads the stored jsonb array", () => {
    const parsed = parseKindVariants([
      {
        name: "dropdown",
        label: "Dropdown",
        component_type: "select",
        config: { options: ["a", "b"], allowOther: true },
        description: "Compact single-select",
      },
    ]);
    expect(parsed).toEqual([
      {
        name: "dropdown",
        label: "Dropdown",
        component_type: "select",
        config: { options: ["a", "b"], allowOther: true },
        description: "Compact single-select",
      },
    ]);
  });

  it("never throws on junk, and drops what cannot be addressed by name", () => {
    expect(parseKindVariants(null)).toEqual([]);
    expect(parseKindVariants("nope")).toEqual([]);
    expect(parseKindVariants({ name: "x" })).toEqual([]);
    expect(
      parseKindVariants([
        null,
        42,
        { label: "no name" },
        { name: "no component" },
        { name: "ok", component_type: "textarea" },
      ]),
    ).toEqual([
      { name: "ok", label: "ok", component_type: "textarea", config: {} },
    ]);
  });

  it("keeps the first of duplicate names", () => {
    const parsed = parseKindVariants([
      { name: "dup", label: "First", component_type: "textarea" },
      { name: "dup", label: "Second", component_type: "select" },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].label).toBe("First");
  });

  it("round-trips through the storage form", () => {
    expect(parseKindVariants(serializeKindVariants([textarea, slider]))).toEqual(
      [textarea, slider],
    );
  });
});

describe("validateKindVariant", () => {
  it("accepts a well-formed variant", () => {
    expect(validateKindVariant(slider).errors).toEqual([]);
  });

  it.each(BANNED_VARIANT_NAMES)("rejects the banned name %s", (name) => {
    const errors = validateKindVariant({ ...textarea, name }).errors;
    expect(errors.some((e) => e.includes("banned"))).toBe(true);
  });

  it("rejects names that are not snake_case", () => {
    for (const name of ["Textarea", "text-area", "2col", "text area"]) {
      expect(validateKindVariant({ ...textarea, name }).errors).not.toEqual([]);
    }
  });

  it("rejects a name already registered on the kind", () => {
    const { errors } = validateKindVariant(textarea, {
      existingNames: ["textarea"],
    });
    expect(errors.some((e) => e.includes("already registered"))).toBe(true);
  });

  it("rejects an unknown component type unless the kind registers it", () => {
    const custom = { ...textarea, component_type: "db_fancy_picker" };
    expect(validateKindVariant(custom).errors).not.toEqual([]);
    expect(
      validateKindVariant(custom, { dbComponentKeys: ["db_fancy_picker"] })
        .errors,
    ).toEqual([]);
  });

  it("rejects config that the component type does not use", () => {
    expect(
      validateKindVariant({ ...textarea, config: { min: 1, max: 2 } }).errors,
    ).not.toEqual([]);
    expect(
      validateKindVariant({ ...textarea, config: { options: ["a", "b"] } })
        .errors,
    ).not.toEqual([]);
  });

  it("warns (never blocks) on an option component whose options are still empty", () => {
    const result = validateKindVariant({
      name: "dropdown",
      label: "Dropdown",
      component_type: "select",
      config: { options: [] },
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).not.toEqual([]);
  });

  it("does not ask for options when the variant binds a Structured List", () => {
    const result = validateKindVariant({
      name: "dropdown",
      label: "Dropdown",
      component_type: "select",
      config: { options: [], structured_list: { listId: "abc" } },
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("rejects an inverted numeric range", () => {
    expect(
      validateKindVariant({ ...slider, config: { min: 10, max: 1 } }).errors,
    ).not.toEqual([]);
  });

  it("flags duplicates across a whole registered set", () => {
    const results = validateKindVariants([textarea, { ...slider, config: {} }]);
    expect(results.textarea.errors).toEqual([]);
    // Second slider config is empty — a warning about bounds, never an error.
    expect(results.slider.errors).toEqual([]);
  });
});

describe("resolveVariantComponent", () => {
  const kind = {
    kind: "text",
    variants: serializeKindVariants([textarea, slider]),
    defaultInputComponentKey: null,
    valueType: "string" as ContextValueType,
  };

  it("rung 1 — the named variant wins", () => {
    const resolved = resolveVariantComponent(kind, "slider");
    expect(resolved.source).toBe("variant");
    expect(resolved.variantName).toBe("slider");
    expect(resolved.component).toEqual({
      type: "slider",
      min: 0,
      max: 100,
      step: 1,
    });
    expect(resolved.unregisteredVariant).toBeNull();
  });

  it("rung 2 — no variant asked for falls to the kind's default input component", () => {
    const resolved = resolveVariantComponent({
      ...kind,
      defaultInputComponentKey: "markdown",
    });
    expect(resolved.source).toBe("kind-default-component");
    expect(resolved.component).toEqual({ type: "markdown" });
    expect(resolved.unregisteredVariant).toBeNull();
  });

  it("rung 2 — a DB-authored default component answers by key, not by config", () => {
    const resolved = resolveVariantComponent({
      ...kind,
      defaultInputComponentKey: "db_recipe_input",
    });
    expect(resolved.component).toBeNull();
    expect(resolved.dbComponentKey).toBe("db_recipe_input");
  });

  it("rung 3 — the componentValueType-derived default is the floor", () => {
    expect(resolveVariantComponent(kind).source).toBe("derived-default");
    expect(resolveVariantComponent(kind).component).toEqual({
      type: "textarea",
    });
    expect(
      resolveVariantComponent({ ...kind, valueType: "number" }).component,
    ).toEqual({ type: "number" });
  });

  it("an UNREGISTERED variant name falls back LOUDLY — never an ad-hoc component", () => {
    const resolved = resolveVariantComponent(kind, "invented_by_the_input");
    expect(resolved.source).toBe("derived-default");
    expect(resolved.unregisteredVariant).toBe("invented_by_the_input");
    expect(resolved.component).toEqual({ type: "textarea" });
  });

  it("a variant pointing at a DB renderer resolves to its key", () => {
    const resolved = resolveVariantComponent(
      {
        ...kind,
        variants: serializeKindVariants([
          { ...textarea, name: "fancy", component_type: "db_fancy_picker" },
        ]),
      },
      "fancy",
    );
    expect(resolved.source).toBe("variant");
    expect(resolved.component).toBeNull();
    expect(resolved.dbComponentKey).toBe("db_fancy_picker");
  });

  it("tolerates an unparsed / absent variants column", () => {
    expect(
      resolveVariantComponent({ kind: "text" }, "anything").source,
    ).toBe("derived-default");
    expect(
      resolveVariantComponent({ kind: "text", variants: "junk" }).component,
    ).toEqual({ type: "textarea" });
  });
});

describe("the derived-default table is the inverse of componentToValueType", () => {
  // Every value type componentToValueType can EMIT must map back to itself.
  // `boolean` is deliberately absent: componentToValueType collapses BOTH
  // toggle components to `string` storage, so no component emits it. The
  // table still maps boolean → toggle, matching the kind ⇄ variable bridge's
  // canonicalComponentForField.
  const emittable: ContextValueType[] = [
    "string",
    "number",
    "datetime",
    "time",
    "email",
    "url",
    "phone",
    "percent",
    "color",
    "markdown",
    "currency",
    "object",
  ];
  it.each(emittable)("%s round-trips", (valueType) => {
    const component = defaultComponentForValueType(valueType);
    expect(componentToValueType({ type: component })).toBe(valueType);
  });
});

describe("the shared VariableCustomComponent bridge", () => {
  it("converts a variant to the component the production input renderer speaks", () => {
    expect(variantToCustomComponent(slider)).toEqual({
      type: "slider",
      min: 0,
      max: 100,
      step: 1,
    });
    expect(
      variantToCustomComponent({ ...textarea, component_type: "db_thing" }),
    ).toBeUndefined();
  });

  it("splits the configurator's output back into component_type + config, dropping only UI residue", () => {
    expect(
      customComponentToVariantParts({
        type: "select",
        options: ["a", "b"],
        stash: { min: 1 },
      }),
    ).toEqual({
      component_type: "select",
      config: { options: ["a", "b"] },
    });
    expect(customComponentToVariantParts(undefined)).toEqual({
      component_type: "textarea",
      config: {},
    });
  });
});
