/**
 * Live-data fidelity for the agent-input bridge (W3-A acceptance).
 *
 * fixtures/live-agent-variables.json holds 18 REAL variable definitions
 * pulled read-only from `agent.definition.variable_definitions` (2026-07-15),
 * spanning every live category: allowOther option sets, checkbox multi-select
 * option sets, closed option sets, media (youtube), bounded numbers,
 * picklist-bound (structured_list AND the legacy `picklist` key), scope-bound
 * (binding), plain textareas, and toggleValues toggles. (No slider variables
 * exist live — `number` covers the bounds path.)
 *
 * THE CONTRACT: variables → (fields, sidecar) → variables reproduces the
 * original with zero information loss except the DOCUMENTED normalizations:
 *   - legacy `customComponent.picklist` key → canonical `structured_list`
 *   - `customComponent.stash` (authoring residue) dropped
 *   - explicit `required: false` / `allowOther: false` → key omitted
 *   - empty-string helpText → omitted
 *   - a missing customComponent ≡ `{type:"textarea"}` (the system default)
 *   - customComponent beside a `binding` dropped (ignored by contract —
 *     the component is inherited from the bound context item)
 * Runtime-resolved picklist option sets remain the one recorded loss class.
 */

import {
  kindFieldsToVariableDefinitions,
  variableDefinitionsToKindFields,
} from "../convert/kind-variable-bridge";
import type {
  VariableCustomComponent,
  VariableDefinition,
} from "@/features/agents/types/agent-definition.types";
import fixtures from "./fixtures/live-agent-variables.json";

type Fixture = {
  category: string;
  agent_id: string;
  variable: VariableDefinition & {
    customComponent?: VariableCustomComponent & { stash?: unknown };
  };
};

const DOCS = fixtures as unknown as Fixture[];

/** The documented normalizations — see the module header. */
function normalize(v: VariableDefinition): Record<string, unknown> {
  const out: Record<string, unknown> = { name: v.name };
  if (v.required) out.required = true;
  if (typeof v.helpText === "string" && v.helpText !== "") {
    out.helpText = v.helpText;
  }
  out.defaultValue = v.defaultValue ?? "";
  if (v.binding) {
    out.binding = v.binding;
    return out; // customComponent is ignored/inherited when bound
  }
  const cc = v.customComponent;
  const norm: Record<string, unknown> = { type: cc?.type ?? "textarea" };
  if (cc) {
    if (cc.options && cc.options.length > 0) norm.options = cc.options;
    if (cc.allowOther) norm.allowOther = true;
    if (cc.toggleValues) norm.toggleValues = cc.toggleValues;
    if (cc.min !== undefined) norm.min = cc.min;
    if (cc.max !== undefined) norm.max = cc.max;
    if (cc.step !== undefined) norm.step = cc.step;
    const list = cc.structured_list ?? cc.picklist;
    if (list) norm.structured_list = list;
    // stash: authoring residue, dropped by contract.
  }
  out.customComponent = norm;
  return out;
}

describe("live agent variables round-trip (18 docs, all live categories)", () => {
  it("covers the acceptance categories", () => {
    const cats = new Set(DOCS.map((d) => d.category));
    for (const required of [
      "allow_other",
      "checkbox",
      "closed_options",
      "media",
      "number",
      "picklist",
      "scope_bound",
      "textarea",
      "toggle_values",
    ]) {
      expect(cats.has(required)).toBe(true);
    }
    expect(DOCS.length).toBeGreaterThanOrEqual(15);
  });

  it.each(DOCS.map((d) => [d.category, d.variable.name, d] as const))(
    "%s / %s reproduces through fields + sidecar",
    (_category, _name, doc) => {
      const original = doc.variable;
      const { fields, sidecar, losses } = variableDefinitionsToKindFields([
        original,
      ]);
      const back = kindFieldsToVariableDefinitions(
        { kind: "live_roundtrip", fields },
        { sidecar, sanitizeNames: false },
      );
      expect(back).toHaveLength(1);
      expect(normalize(back[0])).toStrictEqual(normalize(original));

      // The ONLY tolerated loss class on live data: picklist option sets
      // that resolve at run time (the binding itself is in the sidecar).
      for (const loss of losses) {
        expect(loss.reason).toContain("structured-list-bound");
      }
    },
  );

  it("category fidelity spot checks (structure channel)", () => {
    const byCat = (cat: string): Fixture[] =>
      DOCS.filter((d) => d.category === cat);

    for (const doc of byCat("allow_other")) {
      const { fields } = variableDefinitionsToKindFields([doc.variable]);
      const field = fields[doc.variable.name];
      expect(field).toMatchObject({
        type: "enum",
        values: doc.variable.customComponent?.options,
        open: true,
      });
    }
    for (const doc of byCat("checkbox")) {
      const { fields } = variableDefinitionsToKindFields([doc.variable]);
      expect(fields[doc.variable.name]).toMatchObject({
        type: "string[]",
        values: doc.variable.customComponent?.options,
      });
    }
    for (const doc of byCat("number")) {
      const { fields } = variableDefinitionsToKindFields([doc.variable]);
      expect(fields[doc.variable.name]).toMatchObject({
        type: "number",
        min: doc.variable.customComponent?.min,
        max: doc.variable.customComponent?.max,
      });
    }
    for (const doc of byCat("media")) {
      const { fields, sidecar } = variableDefinitionsToKindFields([
        doc.variable,
      ]);
      expect(fields[doc.variable.name]?.type).toBe("string");
      expect(sidecar[doc.variable.name]?.component).toBe(
        doc.variable.customComponent?.type,
      );
    }
    for (const doc of byCat("scope_bound")) {
      const { fields, sidecar } = variableDefinitionsToKindFields([
        doc.variable,
      ]);
      expect(fields[doc.variable.name]?.type).toBe("string");
      expect(sidecar[doc.variable.name]?.scopeBinding).toStrictEqual(
        doc.variable.binding,
      );
    }
    for (const doc of byCat("picklist")) {
      const { sidecar } = variableDefinitionsToKindFields([doc.variable]);
      const cc = doc.variable.customComponent;
      expect(sidecar[doc.variable.name]?.structuredList).toStrictEqual(
        cc?.structured_list ?? cc?.picklist,
      );
    }
    for (const doc of byCat("toggle_values")) {
      const { fields } = variableDefinitionsToKindFields([doc.variable]);
      expect(fields[doc.variable.name]).toMatchObject({
        type: "enum",
        values: doc.variable.customComponent?.toggleValues,
      });
    }
  });
});
