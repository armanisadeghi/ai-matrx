/**
 * ProTextarea's embedded agent actions run by MANDATE, and the host's items
 * travel as the job's offered values — never as a raw agent id, never folded
 * into the person's message (THE USER-INPUT LAW).
 */
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import {
  PRO_TEXTAREA_AGENT_ACTIONS,
  PRO_TEXTAREA_HELP_DEFAULT_MANDATE_KEY,
  proTextareaRunValues,
} from "./proTextareaAgentActions";
import type { SessionContextItem } from "@/features/transcript-studio/types";

const item = (key: string, value: string): SessionContextItem => ({
  id: key,
  key,
  label: key,
  value,
});

describe("ProTextarea agent actions resolve by mandate", () => {
  it("Help with this… starts on the general mandate, never on an agent id", () => {
    const help = PRO_TEXTAREA_AGENT_ACTIONS.help;
    expect(help.resolveDefaultAgentId({})).toBeNull();
    expect(help.resolveDefaultMandateKey({})).toBe(
      MANDATE_KEYS.chat__default_new_chat,
    );
    expect(PRO_TEXTAREA_HELP_DEFAULT_MANDATE_KEY).toBe(
      MANDATE_KEYS.chat__default_new_chat,
    );
  });

  it("a host's own help job wins over the general one", () => {
    expect(
      PRO_TEXTAREA_AGENT_ACTIONS.help.resolveDefaultMandateKey({
        helpMandateKey: MANDATE_KEYS.data__formula_writing,
      }),
    ).toBe(MANDATE_KEYS.data__formula_writing);
  });

  it("Custom Agent waits for the person unless the host preselects a job", () => {
    const custom = PRO_TEXTAREA_AGENT_ACTIONS.customAgent;
    expect(custom.resolveDefaultAgentId({})).toBeNull();
    expect(custom.resolveDefaultMandateKey({})).toBeNull();
    expect(
      custom.resolveDefaultMandateKey({
        customAgentMandateKey: MANDATE_KEYS.data__formula_writing,
      }),
    ).toBe(MANDATE_KEYS.data__formula_writing);
  });
});

describe("proTextareaRunValues", () => {
  const items = [
    item("formula_columns", "{Price}, {Quantity}"),
    item("formula_current", ""),
    item("  ", "orphan value"),
  ];

  it("by mandate, items are the job's offered values AND context; blanks are dropped", () => {
    expect(proTextareaRunValues(items, true)).toEqual({
      variables: { formula_columns: "{Price}, {Quantity}" },
      context: { formula_columns: "{Price}, {Quantity}" },
    });
  });

  it("by an agent the person chose, items ride context only", () => {
    expect(proTextareaRunValues(items, false)).toEqual({
      context: { formula_columns: "{Price}, {Quantity}" },
    });
  });

  it("nothing held means nothing sent — and never user input", () => {
    const none = proTextareaRunValues([], true);
    expect(none).toEqual({});
    expect("userInput" in proTextareaRunValues(items, true)).toBe(false);
  });
});

describe("every text field gets the AI powers by default (RC-B6)", () => {
  it("turns Clean up, Help with this and Custom agent ON unless a host opts out", () => {
    const { isProTextareaAgentActionEnabled } = jest.requireActual(
      "./proTextareaAgentActions",
    ) as typeof import("./proTextareaAgentActions");
    for (const id of ["cleanup", "help", "customAgent"] as const) {
      expect(isProTextareaAgentActionEnabled(id, {})).toBe(true);
    }
    expect(
      isProTextareaAgentActionEnabled("help", { enableHelpWithThis: false }),
    ).toBe(false);
    expect(
      isProTextareaAgentActionEnabled("customAgent", { enableCustomAgent: false }),
    ).toBe(false);
  });
});
