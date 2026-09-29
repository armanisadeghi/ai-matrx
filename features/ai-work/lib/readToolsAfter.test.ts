import { normalizeProviderMessage, readToolsAfter } from "./providerConversationMessage";

describe("readToolsAfter — the kept shape of a tool call is its name", () => {
  it("reads the ordered names the bridge wrote", () => {
    expect(
      readToolsAfter({ coding_session_bridge: { tools_after: ["Bash", "Read", "Bash"] } }),
    ).toEqual(["Bash", "Read", "Bash"]);
  });

  it("answers an empty list for anything else, never a guess", () => {
    expect(readToolsAfter(null)).toEqual([]);
    expect(readToolsAfter({ coding_session_bridge: {} })).toEqual([]);
    expect(readToolsAfter({ coding_session_bridge: { tools_after: "Bash" } })).toEqual([]);
    expect(
      readToolsAfter({ coding_session_bridge: { tools_after: ["Edit", 3, "", null] } }),
    ).toEqual(["Edit"]);
  });

  it("rides on the normalized message, even when its content cannot be rendered", () => {
    const base = {
      id: "m1",
      conversation_id: "c1",
      role: "assistant",
      position: 1,
      status: "active",
      created_at: "2026-09-29T00:00:00Z",
      agent_id: null,
      metadata: { coding_session_bridge: { tools_after: ["Grep"] } },
    };
    expect(
      normalizeProviderMessage({ ...base, content: [{ type: "text", text: "hi" }] }).toolsAfter,
    ).toEqual(["Grep"]);
    expect(
      normalizeProviderMessage({ ...base, content: "not an array" as never }).toolsAfter,
    ).toEqual(["Grep"]);
  });
});
