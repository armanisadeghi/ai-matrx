/**
 * NAMED PRESENTATION VARIANTS — registered ON the kind, selected BY NAME.
 *
 * The rule (common-docs `systems/workflows/INPUT-SURFACE.md` §"Presentation
 * variants — hints live ON the kind, never on the input"):
 *
 *   Where an input wants a specific rendering (a text kind as slider vs
 *   textarea vs select), the hint is a NAMED VARIANT registered on the kind;
 *   the input selects a registered variant BY NAME. Never an ad-hoc component
 *   defined on the input — that is a second renderer with a new hat. The kind
 *   registry stays the one home for anything that renders.
 *
 * This supersedes the Content-IR SPEC §1 `customComponent`-as-type-system
 * framing. The 27-member agent component vocabulary
 * (`VARIABLE_COMPONENT_TYPES`) is NOT retired — it survives here as the set of
 * variant IMPLEMENTATIONS.
 *
 * Storage: `content_ir.kind_definition.variants` (jsonb array, default `[]`).
 * This module is the one place that parses, validates, and resolves it. It is
 * PURE — no React, no Redux, no Supabase — so the run form, the compiler, the
 * registry admin, and the server-side tool-schema builder can all share it.
 *
 * Consumers arrive in Phase 2.2; nothing calls `resolveVariantComponent` yet.
 */

import {
  VARIABLE_COMPONENT_TYPES,
  type VariableComponentType,
  type VariableCustomComponent,
} from "@/features/agents/types/agent-definition.types";
import { getComponentTypeMeta } from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";
import type { ContextValueType } from "@/features/scope-system/redux/contextItemsSlice";

// ---------------------------------------------------------------------------
// The stored shape
// ---------------------------------------------------------------------------

/**
 * The config surface a variant may carry: the `VariableCustomComponent`
 * surface minus `type` (which is `component_type`), minus the authoring
 * scratchpad (`stash`), and minus the deprecated `picklist` alias. It is
 * deliberately the SAME surface the canonical `CustomComponentConfigurator`
 * emits, so the registry admin can embed that editor whole instead of forking
 * a second one — and so nothing it writes is silently dropped on the way into
 * the registry.
 */
export type KindVariantConfig = Omit<
  VariableCustomComponent,
  "type" | "stash" | "picklist"
>;

/** One registered variant. `name` is the string an input references. */
export interface KindPresentationVariant {
  /** snake_case, unique per kind. THE value an input's `variant` selects. */
  name: string;
  /** Human label for pickers. */
  label: string;
  /**
   * One of `VARIABLE_COMPONENT_TYPES`, or the `component_key` of a registered
   * `content_ir.kind_component` row (role `input`) for a DB-authored renderer.
   */
  component_type: string;
  /** The rendering config. Always present in storage; `{}` when unconfigured. */
  config: KindVariantConfig;
  /** Optional authoring note. */
  description?: string;
}

/**
 * BANNED variant names. Both words are the natural choice and both are locked
 * to a different platform meaning — `_context` is everything the LLM receives,
 * `_ref` is an entity pointer carrying no content. Reusing either for a
 * rendering blurs a distinction that is currently sharp.
 * See common-docs `systems/agents/mandates/VARIANT-NAMING.md` §Banned words.
 */
export const BANNED_VARIANT_NAMES: readonly string[] = ["_context", "_ref"];

/** snake_case: lowercase start, then lowercase / digits / underscores. */
export const VARIANT_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

const COMPONENT_TYPE_SET: ReadonlySet<string> = new Set(
  VARIABLE_COMPONENT_TYPES,
);

export function isVariableComponentType(
  value: string,
): value is VariableComponentType {
  return COMPONENT_TYPE_SET.has(value);
}

// ---------------------------------------------------------------------------
// Parsing — tolerant of anything jsonb can hold, silent about nothing
// ---------------------------------------------------------------------------

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((v) => typeof v === "string")
    ? (value as string[])
    : undefined;
}

function asToggleValues(value: unknown): [string, string] | undefined {
  const arr = asStringArray(value);
  return arr && arr.length === 2 ? [arr[0], arr[1]] : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseConfig(value: unknown): KindVariantConfig {
  const raw = asObject(value);
  if (!raw) return {};
  const config: KindVariantConfig = {};
  const options = asStringArray(raw.options);
  if (options) config.options = options;
  if (typeof raw.allowOther === "boolean") config.allowOther = raw.allowOther;
  const toggleValues = asToggleValues(raw.toggleValues);
  if (toggleValues) config.toggleValues = toggleValues;
  const min = asNumber(raw.min);
  if (min !== undefined) config.min = min;
  const max = asNumber(raw.max);
  if (max !== undefined) config.max = max;
  const step = asNumber(raw.step);
  if (step !== undefined) config.step = step;
  // Structured shapes the canonical configurator can emit. Carried opaquely so
  // the registry never silently drops what the shared editor wrote.
  const structuredList = asObject(raw.structured_list);
  if (structuredList && typeof structuredList.listId === "string") {
    config.structured_list =
      structuredList as unknown as KindVariantConfig["structured_list"];
  }
  const assignment = asObject(raw.assignment);
  if (assignment) {
    config.assignment = assignment as unknown as KindVariantConfig["assignment"];
  }
  const resourceContext = asObject(raw.resource_context);
  if (resourceContext) {
    config.resource_context =
      resourceContext as unknown as KindVariantConfig["resource_context"];
  }
  return config;
}

/**
 * Read `kind_definition.variants` into typed variants. Rows that are not
 * objects with a string `name` + `component_type` are DROPPED — they cannot be
 * addressed by name, so they are not variants. `parseKindVariants` never
 * throws: a malformed registry must not take the run form down with it. Use
 * {@link validateKindVariants} in the authoring surface to surface defects.
 */
export function parseKindVariants(value: unknown): KindPresentationVariant[] {
  if (!Array.isArray(value)) return [];
  const out: KindPresentationVariant[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const name = typeof raw.name === "string" ? raw.name : "";
    const componentType =
      typeof raw.component_type === "string" ? raw.component_type : "";
    if (!name || !componentType || seen.has(name)) continue;
    seen.add(name);
    out.push({
      name,
      label: typeof raw.label === "string" && raw.label ? raw.label : name,
      component_type: componentType,
      config: parseConfig(raw.config),
      ...(typeof raw.description === "string" && raw.description
        ? { description: raw.description }
        : {}),
    });
  }
  return out;
}

/**
 * Variant → the `VariableCustomComponent` the canonical
 * `CustomComponentConfigurator` (and `VariableInputComponent`) speaks.
 * Returns undefined for a DB-authored renderer, which has no such config.
 */
export function variantToCustomComponent(
  variant: Pick<KindPresentationVariant, "component_type" | "config">,
): VariableCustomComponent | undefined {
  return isVariableComponentType(variant.component_type)
    ? { type: variant.component_type, ...variant.config }
    : undefined;
}

/**
 * The reverse — the configurator's output split back into `component_type` +
 * `config`. The authoring scratchpad (`stash`) and the deprecated `picklist`
 * alias are the only things dropped, exactly as the kind ⇄ variable bridge
 * drops them: they are UI residue, not semantics.
 */
export function customComponentToVariantParts(
  component: VariableCustomComponent | undefined,
): { component_type: string; config: KindVariantConfig } {
  if (!component) return { component_type: "textarea", config: {} };
  const { type, stash: _stash, picklist: _picklist, ...config } = component;
  return { component_type: type, config };
}

/** Storage form — what the admin surface writes back into the jsonb column. */
export function serializeKindVariants(
  variants: KindPresentationVariant[],
): Array<Record<string, unknown>> {
  return variants.map((v) => ({
    name: v.name,
    label: v.label,
    component_type: v.component_type,
    config: v.config,
    ...(v.description ? { description: v.description } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface VariantValidation {
  /** Blocking — the variant must not be saved. */
  errors: string[];
  /** Non-blocking — saveable, but incomplete (an option list still empty, …). */
  warnings: string[];
}

export interface ValidateVariantOptions {
  /** Every other registered name on this kind, for the uniqueness check. */
  existingNames?: readonly string[];
  /**
   * `component_key`s of the kind's registered `content_ir.kind_component`
   * rows (role `input`). A `component_type` outside the 27 is legal only when
   * it names one of these.
   */
  dbComponentKeys?: readonly string[];
}

/**
 * Validate ONE variant. Config rules are read from the agent editor's own
 * component metadata (`getComponentTypeMeta`) — the same table that drives
 * `CustomComponentConfigurator`, never a fork of it.
 */
export function validateKindVariant(
  variant: KindPresentationVariant,
  options: ValidateVariantOptions = {},
): VariantValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = variant.name.trim();

  if (!name) {
    errors.push("Name is required — it is the string an input references.");
  } else if (BANNED_VARIANT_NAMES.includes(name)) {
    errors.push(
      `"${name}" is a banned variant name — it is locked to a different platform meaning (VARIANT-NAMING.md).`,
    );
  } else if (!VARIANT_NAME_PATTERN.test(name)) {
    errors.push(
      `"${name}" is not snake_case — use lowercase letters, digits and underscores, starting with a letter.`,
    );
  } else if ((options.existingNames ?? []).includes(name)) {
    errors.push(`"${name}" is already registered on this kind.`);
  }

  if (!variant.label.trim()) errors.push("Label is required.");

  const componentType = variant.component_type;
  if (!componentType) {
    errors.push("Component type is required.");
  } else if (!isVariableComponentType(componentType)) {
    if (!(options.dbComponentKeys ?? []).includes(componentType)) {
      errors.push(
        `"${componentType}" is neither one of the ${VARIABLE_COMPONENT_TYPES.length} component types nor a registered input component on this kind.`,
      );
    }
    // A DB component owns its own props; there is no config contract to check.
    return { errors, warnings };
  }

  const meta = getComponentTypeMeta(componentType as VariableComponentType);
  const { options: opts, toggleValues, min, max, step } = variant.config;

  const boundToStructuredList = Boolean(variant.config.structured_list?.listId);

  if (meta.requiresOptions) {
    if (boundToStructuredList) {
      // Options hydrate from the bound Structured List at run time.
    } else if (opts === undefined || opts.length === 0) {
      warnings.push(
        `${meta.label} renders an option set — config.options is still empty, so this variant is not usable yet.`,
      );
    } else if (opts.length === 1) {
      warnings.push(`${meta.label} with a single option offers no choice.`);
    } else if (new Set(opts).size !== opts.length) {
      errors.push("config.options contains duplicates.");
    } else if (opts.some((o) => !o.trim())) {
      errors.push("config.options contains a blank option.");
    }
  } else if (opts !== undefined) {
    errors.push(`${meta.label} does not use config.options.`);
  }

  if (meta.requiresToggleValues) {
    if (!toggleValues) {
      warnings.push(
        `${meta.label} uses config.toggleValues (off, on) — none set, so the component's own defaults apply.`,
      );
    } else if (toggleValues.some((v) => !v.trim())) {
      errors.push("config.toggleValues must be two non-empty labels.");
    } else if (toggleValues[0] === toggleValues[1]) {
      errors.push("config.toggleValues must be two different labels.");
    }
  } else if (toggleValues !== undefined) {
    errors.push(`${meta.label} does not use config.toggleValues.`);
  }

  if (meta.requiresMinMax) {
    if (min !== undefined && max !== undefined && min >= max) {
      errors.push("config.min must be less than config.max.");
    }
    if (step !== undefined && step <= 0) {
      errors.push("config.step must be greater than zero.");
    }
    if (componentType === "slider" && (min === undefined || max === undefined)) {
      warnings.push(
        "A slider without config.min and config.max falls back to the component's own bounds.",
      );
    }
  } else if (min !== undefined || max !== undefined || step !== undefined) {
    errors.push(`${meta.label} does not use config.min / max / step.`);
  }

  return { errors, warnings };
}

/** Validate a whole registered set, including cross-variant uniqueness. */
export function validateKindVariants(
  variants: KindPresentationVariant[],
  options: Omit<ValidateVariantOptions, "existingNames"> = {},
): Record<string, VariantValidation> {
  const out: Record<string, VariantValidation> = {};
  variants.forEach((variant, index) => {
    const others = variants
      .filter((_, i) => i !== index)
      .slice(0, index)
      .map((v) => v.name);
    out[variant.name] = validateKindVariant(variant, {
      ...options,
      existingNames: others,
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------------

/**
 * The component the platform falls back to for a storage value type when the
 * kind registers neither a matching variant nor a default input component.
 * The INVERSE of `features/scope-system/utils/componentValueType.ts`
 * (`componentToValueType`), and kept honest by a round-trip test: every value
 * type that `componentToValueType` can EMIT maps back to its own key here.
 * The remaining members are value types no component produces: `boolean`
 * (both toggle components store as `string`) maps to `toggle`, matching the
 * kind ⇄ variable bridge's `canonicalComponentForField`; `date`, `array` and
 * `reference` degrade to the flattening that bridge already documents.
 */
const DEFAULT_COMPONENT_BY_VALUE_TYPE: Record<
  ContextValueType,
  VariableComponentType
> = {
  string: "textarea",
  number: "number",
  boolean: "toggle",
  date: "datetime",
  datetime: "datetime",
  time: "time",
  email: "email",
  url: "url",
  phone: "phone",
  percent: "percent",
  color: "color",
  markdown: "markdown",
  currency: "currency",
  object: "document",
  array: "textarea",
  document: "document",
  reference: "textarea",
};

/** The kind, as much of it as the resolver needs. */
export interface VariantResolvableKind {
  /** The kind slug — echoed on the result so a miss can be reported. */
  kind: string;
  /** `kind_definition.variants`, raw jsonb or already parsed. */
  variants?: unknown;
  /**
   * The kind's default EXTRACTION component: the `component_key` of its
   * `content_ir.kind_component` row with role `input` and `is_default`.
   */
  defaultInputComponentKey?: string | null;
  /**
   * Storage value type of the kind's value, when known — drives the last
   * fallback. Absent means `string`.
   */
  valueType?: ContextValueType | null;
}

export type VariantResolutionSource =
  | "variant"
  | "kind-default-component"
  | "derived-default";

export interface ResolvedVariantComponent {
  /** Which rung of the ladder answered. */
  source: VariantResolutionSource;
  /** The resolved variant's name, or null when no variant was involved. */
  variantName: string | null;
  /** Display label, when the answer came from a registered variant. */
  label: string | null;
  /**
   * The component to render, ready to hand to `VariableInputComponent`.
   * Null ONLY when a DB-authored renderer answers (`dbComponentKey` is then set).
   */
  component: VariableCustomComponent | null;
  /** `content_ir.kind_component.component_key` when a DB renderer answers. */
  dbComponentKey: string | null;
  /**
   * LOUD: the variant name that was asked for and is NOT registered on this
   * kind. Non-null means the caller's declaration is a defect — the resolver
   * still returns a working component, but the mismatch must be reported, not
   * swallowed. (Loud-patches law: a fallback that hides its own trigger is a
   * defect.)
   */
  unregisteredVariant: string | null;
}

/**
 * Resolve the component an input should render with.
 *
 * THE LADDER, in order:
 *   1. the NAMED VARIANT registered on the kind, when `variantName` names one;
 *   2. the kind's DEFAULT EXTRACTION COMPONENT (its `is_default` role-`input`
 *      `kind_component` row);
 *   3. the componentValueType-DERIVED default for the kind's storage value type.
 *
 * An input that asks for a variant the kind does not register does not get an
 * ad-hoc component — it gets the next rung down plus `unregisteredVariant`
 * set, which is the honest answer and a reportable defect.
 *
 * @param kind        the kind and what the ladder reads from it
 * @param variantName the variant the input declared, if any
 */
export function resolveVariantComponent(
  kind: VariantResolvableKind,
  variantName?: string | null,
): ResolvedVariantComponent {
  const variants = Array.isArray(kind.variants)
    ? parseKindVariants(kind.variants)
    : parseKindVariants(kind.variants ?? []);

  const requested = variantName?.trim() || null;
  const match = requested
    ? (variants.find((v) => v.name === requested) ?? null)
    : null;

  if (match) {
    if (isVariableComponentType(match.component_type)) {
      return {
        source: "variant",
        variantName: match.name,
        label: match.label,
        component: { type: match.component_type, ...match.config },
        dbComponentKey: null,
        unregisteredVariant: null,
      };
    }
    // A variant may point at a DB-authored renderer registered on the kind.
    return {
      source: "variant",
      variantName: match.name,
      label: match.label,
      component: null,
      dbComponentKey: match.component_type,
      unregisteredVariant: null,
    };
  }

  const unregisteredVariant = requested;

  const defaultKey = kind.defaultInputComponentKey?.trim() || null;
  if (defaultKey) {
    return {
      source: "kind-default-component",
      variantName: null,
      label: null,
      component: isVariableComponentType(defaultKey)
        ? { type: defaultKey }
        : null,
      dbComponentKey: isVariableComponentType(defaultKey) ? null : defaultKey,
      unregisteredVariant,
    };
  }

  return {
    source: "derived-default",
    variantName: null,
    label: null,
    component: {
      type: DEFAULT_COMPONENT_BY_VALUE_TYPE[kind.valueType ?? "string"],
    },
    dbComponentKey: null,
    unregisteredVariant,
  };
}

/** The derived-default table, exposed for the round-trip test and for callers
 * that need the fallback component without a kind in hand. */
export function defaultComponentForValueType(
  valueType: ContextValueType | null | undefined,
): VariableComponentType {
  return DEFAULT_COMPONENT_BY_VALUE_TYPE[valueType ?? "string"];
}
