/**
 * CROSS-LANGUAGE parity for the agent-input bridge (§10d-C).
 *
 * The bridge now has two implementations — this one, and the Python forward
 * build `matrx_ai.agents.variable_kinds` that registers an agent's variable
 * contract as a real kind. Two implementations of one contract drift silently
 * unless something compares them on the SAME inputs, which is what this does:
 * `variable-kind-bridge.generated.json` is written by the REAL Python bridge
 * (aidream `scripts/generate_variable_kind_fixture.py`), and every case here
 * asserts these converters reproduce it exactly.
 *
 * A failure means the twins disagree. Fix the side that is wrong — then
 * regenerate the fixture and run BOTH suites; never edit the fixture by hand.
 *
 * (The Python-side gate is aidream
 * `packages/matrx-ai/tests/parity/test_variable_kind_fixture.py`, which
 * re-derives the fixture from the live bridge so a stale snapshot cannot keep
 * this suite green against yesterday's contract.)
 */

import {
  kindFieldsToVariableDefinitions,
  variableDefinitionsToKindFields,
} from "../convert/kind-variable-bridge";
import type { KindSchema } from "@ai-matrx/content-ir";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import fixture from "./variable-kind-bridge.generated.json";

type Case = {
  name: string;
  description: string;
  variables: VariableDefinition[];
  fields: KindSchema["fields"];
  sidecar: Record<string, Record<string, unknown>>;
  losses: { name: string; reason: string }[];
  variables_round_trip: VariableDefinition[];
  json_schema: Record<string, unknown>;
};

const CASES = (fixture as unknown as { cases: Case[] }).cases;

describe("agent-input bridge — Python/TS parity", () => {
  it("has cases (a truncated fixture must not pass silently)", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(19);
  });

  it.each(CASES.map((c) => [c.name, c] as const))(
    "%s — forward conversion matches the Python bridge",
    (_name, testCase) => {
      const result = variableDefinitionsToKindFields(testCase.variables);
      expect(result.fields).toEqual(testCase.fields);
      expect(result.sidecar).toEqual(testCase.sidecar);
      expect(result.losses).toEqual(testCase.losses);
    },
  );

  it.each(CASES.map((c) => [c.name, c] as const))(
    "%s — reverse conversion matches the Python bridge",
    (_name, testCase) => {
      const schema: KindSchema = {
        kind: `agent_input_${testCase.name}`,
        fields: testCase.fields,
      };
      const variables = kindFieldsToVariableDefinitions(schema, {
        sidecar: testCase.sidecar as never,
      });
      expect(variables).toEqual(testCase.variables_round_trip);
    },
  );
});
