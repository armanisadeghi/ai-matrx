/**
 * A variable bound to a Table is filled by the SERVER, every run. The run page
 * never sends a typed value for it — not even the "" that reopening a
 * conversation stamps back from `chat.conversation.variables` (the server
 * seeds the saved default there before the binding resolves). And when no
 * message carries its placeholder, the builder offers to place it.
 * Production A01, Compass Rate Desk, 2026-10-01.
 */

import { resolveVariablesForRequest } from "../resolve-variables-for-request";
import {
  unplacedBoundVariableNames,
  withBoundVariablePlaced,
} from "@/features/agents/utils/variable-binding";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import type { AgentDefinitionMessage } from "@/features/agents/types/agent-message-types";

const CARRIER_RATES: VariableDefinition = {
  name: "carrier_rates",
  defaultValue: "",
  binding: {
    kind: "merge_field",
    source: "record",
    semantic_type: "collection",
    table_id: "c21979aa-dc75-4e62-81fa-7b49277649db",
    missing: "absent",
    override_policy: "shown_locked",
  },
};
const DEFINITIONS: VariableDefinition[] = [
  { name: "dispatcher_initials", required: true, defaultValue: "" },
  CARRIER_RATES,
];

describe("the request body for a bound variable", () => {
  it("omits it when nothing was typed", () => {
    expect(
      resolveVariablesForRequest({
        definitions: DEFINITIONS,
        userValues: { dispatcher_initials: "RK" },
        scopeValues: {},
      }),
    ).toEqual({ dispatcher_initials: "RK" });
  });

  it("omits it when a reopened conversation stamped an empty value back", () => {
    const body = resolveVariablesForRequest({
      definitions: DEFINITIONS,
      userValues: { dispatcher_initials: "RK", carrier_rates: "" },
      scopeValues: {},
    });
    expect(body).not.toHaveProperty("carrier_rates");
    expect(body).toEqual({ dispatcher_initials: "RK" });
  });
});

const MESSAGES: AgentDefinitionMessage[] = [
  {
    role: "system",
    content: [{ type: "text", text: "You are the dispatch assistant ({{dispatcher_initials}})." }],
  },
  {
    role: "user",
    content: [{ type: "text", text: "Dispatcher on duty: {{dispatcher_initials}}." }],
  },
];

describe("placing a bound variable no message carries", () => {
  it("names the bound variable no message places, and only it", () => {
    expect(unplacedBoundVariableNames(DEFINITIONS, MESSAGES)).toEqual([
      "carrier_rates",
    ]);
  });

  it("appends the placeholder to the system prompt in one step, keeping the rest", () => {
    const placed = withBoundVariablePlaced(MESSAGES, "carrier_rates");
    expect(unplacedBoundVariableNames(DEFINITIONS, placed)).toEqual([]);
    const system = placed.find((m) => m.role === "system");
    const text = (system?.content[0] as { text: string }).text;
    expect(text.startsWith("You are the dispatch assistant ({{dispatcher_initials}}).")).toBe(true);
    expect(text.endsWith("{{carrier_rates}}")).toBe(true);
    expect(placed[1]).toEqual(MESSAGES[1]);
  });

  it("creates the system prompt when the agent has none", () => {
    const placed = withBoundVariablePlaced([MESSAGES[1]], "carrier_rates");
    expect(placed[0].role).toBe("system");
    expect(unplacedBoundVariableNames(DEFINITIONS, placed)).toEqual([]);
  });

  it("ignores a binding with no table chosen yet", () => {
    const draft: VariableDefinition = {
      ...CARRIER_RATES,
      binding: { ...(CARRIER_RATES.binding as object), table_id: "" } as VariableDefinition["binding"],
    };
    expect(unplacedBoundVariableNames([draft], MESSAGES)).toEqual([]);
  });
});
