/**
 * The trained Agent Structure Builder answers with a create-agent directive
 * envelope; the generator must read the agent inside it (2026-09-26: bound as
 * the Mandate Holder of `mandates.holder_draft`, its answer extracted to
 * "Untitled Agent / You are a helpful AI assistant.").
 */
import {
  extractAgentConfig,
  extractAgentName,
} from "../agent-config-extractor";

const item = {
  __kind: "agent_definition",
  name: "Call Recap Writer",
  description: "Writes a recap of a client call.",
  messages: [
    { role: "system", content: [{ type: "text", text: "You write call recaps." }] },
    { role: "user", content: [{ type: "text", text: "Notes: {{notes}}" }] },
  ],
  variable_definitions: [{ name: "notes", defaultValue: "" }],
};

describe("extractAgentConfig — the builder's directive envelope", () => {
  it("reads the agent from the envelope's first item", () => {
    const config = extractAgentConfig({
      __kind: "directive_v1_action_create_agent_definition",
      items: [item],
    });
    expect(config?.name).toBe("Call Recap Writer");
    expect(config?.systemMessage).toBe("You write call recaps.");
    expect(config?.userMessage).toBe("Notes: {{notes}}");
    expect(extractAgentName({ __kind: "directive_v1_action_create_agent_definition", items: [item] })).toBe(
      "Call Recap Writer",
    );
  });

  it("still reads a bare agent unchanged", () => {
    expect(extractAgentConfig(item)?.name).toBe("Call Recap Writer");
  });
});
