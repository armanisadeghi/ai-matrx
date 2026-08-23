/**
 * A BOUND AGENT'S INPUTS ARE A TYPED FORM (§10d-C, the payoff).
 *
 * aidream's agent-input bridge registers an agent's declared variables as a
 * real kind: `data` carries the ordered field list, `metadata.family` is
 * `agent_input`, and a role='input' `generic_structured` component row is
 * written with it. That is exactly the shape D1's input path was built for —
 * so nothing new had to be built on this side, and this suite is the proof
 * that the claim is true rather than plausible.
 *
 * The row below is VERBATIM from the live registry
 * (`agent_input_instructions_scraped_content_queries_search_results`, four
 * agents bound, 2026-08-23), so it fails if the campaign ever writes a row the
 * form cannot route.
 */

import {
  decideKindInputPath,
  GENERIC_INPUT_COMPONENT_KEY,
} from "../input/kind-input-resolution";
import { kindFieldsToVariableDefinitions } from "../convert/kind-variable-bridge";
import {
  GENERATED_CONTRACT_FAMILY_VALUES,
  kindFamilyFromMetadata,
} from "../registry/schema-source-kind-tables";
import { assembleKindInstance, pairKindFieldsWithVariables } from "../input/kind-input-values";
import type { KindSchema } from "@ai-matrx/content-ir";

const KIND = "agent_input_instructions_scraped_content_queries_search_results";

/** `content_ir.kind_definition.data`, verbatim. */
const STORED_FIELDS = [
  {
    name: "instructions",
    type: "string",
    required: true,
    description: "The specific topics or details needed for this research topic.",
  },
  {
    name: "scraped_content",
    type: "string",
    required: true,
    description:
      "Any large amounts of scraped content from the web or other data to be used as a source",
  },
  { name: "queries", type: "string", description: "The queries used to get the search results" },
  { name: "search_results", type: "string", required: true, description: "The results of the web search" },
] as const;

/** `content_ir.kind_definition.metadata`, the parts the input path reads. */
const STORED_METADATA = { family: "agent_input", data_only: false };

/** The `kind_component` row the campaign writes beside the kind. */
const STORED_COMPONENT = {
  componentKey: GENERIC_INPUT_COMPONENT_KEY,
  isActive: true,
  source: "bundled",
} as const;

function schemaFromStoredFields(): KindSchema {
  const fields: KindSchema["fields"] = {};
  for (const { name, ...field } of STORED_FIELDS) {
    fields[name] = field as KindSchema["fields"][string];
  }
  return { kind: KIND, fields };
}

describe("an agent-input kind renders as a typed form", () => {
  it("is not classified as a machine contract", () => {
    const family = kindFamilyFromMetadata(STORED_METADATA as never);
    expect(family).toBe("agent_input");
    // The generated data-only families are machine-filled and MUST refuse a
    // form. This one is the opposite: it is the one a human fills.
    expect(GENERATED_CONTRACT_FAMILY_VALUES.has(family as string)).toBe(false);
  });

  it("routes to the bridged form, not the JSON-textarea fallback", () => {
    const path = decideKindInputPath(
      KIND,
      STORED_COMPONENT as never,
      schemaFromStoredFields(),
      false,
    );
    expect(path).toEqual({ mode: "bridged-form" });
  });

  it("would refuse loudly if the campaign forgot the input component row", () => {
    const path = decideKindInputPath(KIND, null, schemaFromStoredFields(), false);
    expect(path.mode).toBe("refused");
  });

  it("falls back to whole-instance JSON when no field list was stored", () => {
    // The python-owned posture BEFORE the bridge: `data` NULL, so the form has
    // nothing to render field-by-field. Storing `data` is what upgrades it.
    const path = decideKindInputPath(KIND, STORED_COMPONENT as never, null, false);
    expect(path).toEqual({ mode: "instance-json" });
  });

  it("bridges the stored fields back into the production input components", () => {
    const variables = kindFieldsToVariableDefinitions(schemaFromStoredFields());
    expect(variables.map((v) => v.name)).toEqual([
      "instructions",
      "scraped_content",
      "queries",
      "search_results",
    ]);
    expect(variables[0]).toEqual({
      name: "instructions",
      defaultValue: "",
      customComponent: { type: "textarea" },
      helpText: "The specific topics or details needed for this research topic.",
      required: true,
    });
    // The optional one stays optional — `required` is a key you omit.
    expect(variables[2].required).toBeUndefined();
  });

  it("assembles what the user types into an instance of the kind", () => {
    const schema = schemaFromStoredFields();
    const variables = kindFieldsToVariableDefinitions(schema);
    const pairs = pairKindFieldsWithVariables(schema, variables);
    const { instance, coercionErrors, omittedFields } = assembleKindInstance(KIND, pairs, {
      instructions: "Condense the findings on GLP-1 supply.",
      scraped_content: "…pages…",
      queries: "",
      search_results: "…results…",
    });
    expect(coercionErrors).toEqual({});
    expect(omittedFields).toEqual(["queries"]); // blank means "supplied nothing"
    expect(instance).toEqual({
      __kind: KIND,
      instructions: "Condense the findings on GLP-1 supply.",
      scraped_content: "…pages…",
      search_results: "…results…",
    });
  });
});
