/**
 * D1 input contract — the pure law behind `KindInputForm`:
 *
 *   1. KEY PARITY — the input floor's `generic_structured` literal (duplicated
 *      in system-components.ts and kind-input-resolution.ts to stay out of the
 *      react layer) matches the react-layer authority.
 *   2. COVERAGE — every ACTIVE display root resolves an input path from the
 *      compiled floor alone (DB outage can't remove input capability), and the
 *      DB-only workflow input kinds resolve once their `kind_component` rows
 *      (mirrored from `migrations/content_ir_input_component_bindings.sql`)
 *      ingest. Data-only generated contract families are non-interactive BY
 *      CLASSIFICATION — they must NOT resolve.
 *   3. ROUTING LAW — `decideKindInputPath`: unknown/missing → refused (loud),
 *      inactive → refused, unrouted dedicated key → refused, generic + fields
 *      → bridged-form, generic + no field list → instance-json.
 *   4. EMISSION — the bridged pipeline (pair → assemble → structural leg over
 *      the kind's own exported JSON schema) emits schema-VALID instances, and
 *      an incomplete draft FAILS the same leg (never a silent pass).
 */

// component-registry first — anchors the registry cluster's import cycle.
import {
  ComponentRegistry,
  resolveComponent,
} from "../registry/component-registry";
import { getSystemComponentEntries } from "../registry/system-components";
import { SYSTEM_KIND_DEFINITIONS } from "../registry/system-kinds";
import { GENERIC_STRUCTURED_COMPONENT_KEY } from "../react/kind-route";
import { validateStructuralLeg } from "../registry/kind-dual-gate";
import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";
import type { KindSchema } from "../core/kind-schema.types";
import { KIND_KEY } from "../core/kind-schema.types";
import {
  decideKindInputPath,
  GENERIC_INPUT_COMPONENT_KEY,
} from "../input/kind-input-resolution";
import {
  assembleKindInstance,
  attributeStructuralErrors,
  initialValuesForVariables,
  pairKindFieldsWithVariables,
} from "../input/kind-input-values";

jest.mock("../registry/schema-source-kind-components", () => ({
  listKindComponentsFromTables: jest.fn(),
}));

/** The 20 ACTIVE display roots (live DB, 2026-07-15) — all compiled kinds. */
const ACTIVE_DISPLAY_ROOTS = [
  "comparison_set",
  "cooking_recipe",
  "decision_tree",
  "diagram_spec",
  "flashcard_set",
  "item_presentation",
  "math_problem",
  "mermaid_diagram",
  "presentation_deck",
  "progress_tracker",
  "questionnaire",
  "quiz_set",
  "research_report",
  "resource_collection",
  "schema_proposal",
  "structured_info",
  "task_list",
  "timeline",
  "transcript",
  "troubleshooting_guide",
] as const;

/**
 * The DB-only workflow I/O structural kinds — mirrors the row set inserted by
 * `migrations/content_ir_input_component_bindings.sql` (they have no compiled
 * definition, so their input path exists only as `kind_component` rows).
 */
const WORKFLOW_IO_INPUT_KINDS = [
  "boolean",
  "branch_result",
  "bulk_result",
  "gather_result",
  "http_response",
  "items",
  "json",
  "map_result",
  "number",
  "operation_result",
  "page",
  "regex_extract_result",
  "string_list",
  "text",
  "value",
  "workflow_run_result",
] as const;

function workflowInputRow(kind: string): KindComponentProjection {
  return {
    kind,
    platform: "web",
    role: "input",
    componentKey: GENERIC_INPUT_COMPONENT_KEY,
    source: "bundled",
    isActive: true,
    config: {},
  };
}

describe("generic input key parity", () => {
  it("both duplicated literals equal the react-layer authority", () => {
    expect(GENERIC_INPUT_COMPONENT_KEY).toBe(GENERIC_STRUCTURED_COMPONENT_KEY);
    for (const entry of getSystemComponentEntries()) {
      if (entry.role === "input") {
        expect(entry.componentKey).toBe(GENERIC_STRUCTURED_COMPONENT_KEY);
      }
    }
  });
});

describe("input-path coverage", () => {
  it("every ACTIVE display root resolves an input path from the compiled floor alone", () => {
    for (const kind of ACTIVE_DISPLAY_ROOTS) {
      const resolution = resolveComponent(kind, "web", "input");
      expect(resolution).not.toBeNull();
      expect(resolution).toMatchObject({
        componentKey: GENERIC_INPUT_COMPONENT_KEY,
        isActive: true,
        resolvedBy: "compiled",
      });
    }
  });

  it("every workflow input kind resolves once its DB rows ingest (migration mirror)", () => {
    const registry = new ComponentRegistry(getSystemComponentEntries);
    registry.ingestDbRows(WORKFLOW_IO_INPUT_KINDS.map(workflowInputRow));
    for (const kind of WORKFLOW_IO_INPUT_KINDS) {
      expect(registry.resolve(kind, "web", "input")).toMatchObject({
        componentKey: GENERIC_INPUT_COMPONENT_KEY,
        isActive: true,
        resolvedBy: "db",
      });
    }
  });

  it("data-only generated contract kinds do NOT resolve — non-interactive by classification", () => {
    // Representative generated-contract slugs (tool_io / action_io / agent_io
    // families) — no compiled floor entry, no DB input rows by design.
    for (const kind of ["tool_web_search_input", "action_http_get_output"]) {
      expect(resolveComponent(kind, "web", "input")).toBeNull();
      expect(decideKindInputPath(kind, null, null)).toMatchObject({
        mode: "refused",
      });
    }
  });
});

describe("decideKindInputPath — the routing law", () => {
  const active = (componentKey: string) => ({
    componentKey,
    source: "bundled",
    config: {},
    isActive: true,
    resolvedBy: "compiled" as const,
  });
  const fieldSchema: KindSchema = {
    kind: "k",
    fields: { title: { type: "string", required: true } },
  };

  it("unknown kind (null resolution) refuses loudly, naming the kind", () => {
    const path = decideKindInputPath("mystery_kind", null, null);
    expect(path.mode).toBe("refused");
    if (path.mode === "refused") {
      expect(path.reason).toContain("mystery_kind");
    }
  });

  it("inactive binding refuses — held is not a fallback license", () => {
    expect(
      decideKindInputPath(
        "k",
        { ...active(GENERIC_INPUT_COMPONENT_KEY), isActive: false },
        fieldSchema,
      ).mode,
    ).toBe("refused");
  });

  it("an unrouted dedicated component key refuses rather than substituting the generic form", () => {
    const path = decideKindInputPath("k", active("mermaid_workbench"), fieldSchema);
    expect(path.mode).toBe("refused");
    if (path.mode === "refused") {
      expect(path.reason).toContain("mermaid_workbench");
    }
  });

  it("generic + stored fields → bridged-form; no field list → instance-json", () => {
    expect(
      decideKindInputPath("k", active(GENERIC_INPUT_COMPONENT_KEY), fieldSchema)
        .mode,
    ).toBe("bridged-form");
    expect(
      decideKindInputPath("k", active(GENERIC_INPUT_COMPONENT_KEY), null).mode,
    ).toBe("instance-json");
    expect(
      decideKindInputPath(
        "k",
        active(GENERIC_INPUT_COMPONENT_KEY),
        { kind: "k", fields: {} },
      ).mode,
    ).toBe("instance-json");
  });
});

describe("emission — bridged pipeline emits schema-valid instances", () => {
  const resolve = (kind: string): KindSchema | undefined =>
    SYSTEM_KIND_DEFINITIONS.find((d) => d.kind === kind)?.schema;
  const flashcardSchema = resolve("flashcard_set");
  const exported = kindSchemaToJsonSchema("flashcard_set", resolve, {
    injectKind: false,
  });

  it("a filled form assembles an instance that PASSES the structural leg", () => {
    if (!flashcardSchema || !exported) throw new Error("flashcard_set missing");
    const pairs = pairKindFieldsWithVariables(flashcardSchema);
    const values = initialValuesForVariables(pairs.map((p) => p.variable));
    values.title = "Cell Biology";
    values.cards = JSON.stringify([
      { front: "What is a mitochondrion?", back: "The powerhouse of the cell" },
    ]);
    const assembled = assembleKindInstance("flashcard_set", pairs, values);
    expect(assembled.coercionErrors).toEqual({});
    expect(assembled.instance[KIND_KEY]).toBe("flashcard_set");
    expect(validateStructuralLeg(assembled.instance, exported.schema)).toEqual({
      ok: true,
    });
  });

  it("attributed errors are DEDUPED — ajv anyOf branches repeat identical messages, and consumers key lists by message", () => {
    // Real shape: a card missing `front` fails flashcard AND enhanced AND
    // tiered branches → the same string three times in `detail`.
    const detail =
      "sample failed schema: /cards/0 must have required property 'front'; /cards/0 must have required property 'front'; /cards/0 must have required property 'front'; (root) must have required property 'title'; (root) must have required property 'title'";
    const attributed = attributeStructuralErrors(detail, ["cards", "title"]);
    expect(attributed.byField.cards).toEqual([
      "/cards/0 must have required property 'front'",
    ]);
    expect(attributed.byField.title).toEqual([
      "(root) must have required property 'title'",
    ]);
    expect(attributed.formLevel).toEqual([]);
  });

  it("an incomplete draft FAILS the same leg — never a silent pass", () => {
    if (!flashcardSchema || !exported) throw new Error("flashcard_set missing");
    const pairs = pairKindFieldsWithVariables(flashcardSchema);
    const values = initialValuesForVariables(pairs.map((p) => p.variable));
    // title + cards left blank → omitted → required-property failures.
    const assembled = assembleKindInstance("flashcard_set", pairs, values);
    const leg = validateStructuralLeg(assembled.instance, exported.schema);
    expect(leg.ok).toBe(false);
    expect(leg.detail).toContain("required");
  });
});
