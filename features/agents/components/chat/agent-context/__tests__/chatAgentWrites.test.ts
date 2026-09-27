import {
  parseDeleteMessagesValue,
  parseMessageIdValue,
  parseUpdateMessagesValue,
  planInputDraftWrite,
  requireConfirmTrue,
  resolveEditAgainst,
  type ChatMessageSnapshot,
} from "../chatAgentWrites";
import {
  buildChatConversationRecord,
  buildChatTranscript,
  excerpt,
  type ChatTranscriptSourceRow,
} from "../chatTranscriptScope";

const MESSAGES: ChatMessageSnapshot[] = [
  { id: "u1", role: "user", text: "What is the capital of France?", streaming: false },
  { id: "a1", role: "assistant", text: "The capital of France is Paris. Paris is large.", streaming: false },
  { id: "s1", role: "system", text: "system note", streaming: false },
  { id: "a2", role: "assistant", text: "Writing…", streaming: true },
];

describe("update_messages", () => {
  it("accepts a whole-text edit and a patch in one list", () => {
    const plans = parseUpdateMessagesValue(
      [
        { message_id: "u1", text: "What is the capital of Spain?" },
        { message_id: "a1", patch: { old_str: "is large", new_str: "is lovely" } },
      ],
      MESSAGES,
    );
    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({ messageId: "u1", role: "user", next: "What is the capital of Spain?" });
    expect(plans[1].next).toBe("The capital of France is Paris. Paris is lovely.");
  });

  it("accepts { messages: [...] }", () => {
    const plans = parseUpdateMessagesValue(
      { messages: [{ message_id: "u1", text: "Hi" }] },
      MESSAGES,
    );
    expect(plans[0].messageId).toBe("u1");
  });

  it("reports every problem at once and changes nothing", () => {
    let message = "";
    try {
      parseUpdateMessagesValue(
        [
          { message_id: "a1", patch: { old_str: "Berlin", new_str: "Rome" } },
          { message_id: "nope", text: "x" },
          { message_id: "a1", patch: { old_str: "Paris", new_str: "Lyon" } },
          { message_id: "a2", text: "stop" },
          { message_id: "s1", text: "x" },
          { message_id: "u1" },
        ],
        MESSAGES,
      );
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/nothing was changed/);
    expect(message).toMatch(/6 problems/);
    expect(message).toMatch(/old_str did not resolve/); // missing
    expect(message).toMatch(/"nope" is not a message on this page/);
    expect(message).toMatch(/listed more than once/);
    expect(message).toMatch(/still being written/);
    expect(message).toMatch(/system message/);
    expect(message).toMatch(/exactly one of "text"/);
  });

  it("refuses an ambiguous old_str", () => {
    expect(() =>
      parseUpdateMessagesValue(
        [{ message_id: "a1", patch: { old_str: "Paris", new_str: "Lyon" } }],
        MESSAGES,
      ),
    ).toThrow(/exactly one place/);
  });

  it("refuses no-op and empty results", () => {
    expect(() =>
      parseUpdateMessagesValue([{ message_id: "u1", text: MESSAGES[0].text }], MESSAGES),
    ).toThrow(/identical/);
    expect(() =>
      parseUpdateMessagesValue(
        [{ message_id: "u1", patch: { old_str: MESSAGES[0].text, new_str: "" } }],
        MESSAGES,
      ),
    ).toThrow(/empty/);
  });

  it("refuses unknown keys and non-arrays", () => {
    expect(() => parseUpdateMessagesValue("hello", MESSAGES)).toThrow(/ARRAY/);
    expect(() =>
      parseUpdateMessagesValue([{ message_id: "u1", text: "x", role: "user" }], MESSAGES),
    ).toThrow(/does not accept role/);
  });

  it("re-applies a patch to the stored text at save time", () => {
    const [plan] = parseUpdateMessagesValue(
      [{ message_id: "a1", patch: { old_str: "is large", new_str: "is lovely" } }],
      MESSAGES,
    );
    expect(resolveEditAgainst(plan, "Intro.\n\nThe capital of France is Paris. Paris is large.")).toBe(
      "Intro.\n\nThe capital of France is Paris. Paris is lovely.",
    );
    expect(() => resolveEditAgainst(plan, "Completely different")).toThrow(/read it again/);
  });
});

describe("delete_messages", () => {
  it("accepts ids and objects", () => {
    const out = parseDeleteMessagesValue(["u1", { message_id: "a1" }], MESSAGES);
    expect(out.map((m) => m.id)).toEqual(["u1", "a1"]);
  });
  it("reports unknown and streaming together", () => {
    expect(() => parseDeleteMessagesValue(["zz", "a2"], MESSAGES)).toThrow(/2 problems/);
  });
});

describe("input_draft", () => {
  it("replaces, appends and patches", () => {
    expect(planInputDraftWrite({ text: "new" }, "old")).toBe("new");
    expect(planInputDraftWrite({ text: "more", mode: "append" }, "old")).toBe("old\nmore");
    expect(
      planInputDraftWrite({ patch: { old_str: "Franse", new_str: "France" } }, "Tell me about Franse"),
    ).toBe("Tell me about France");
  });
  it("refuses a patch on an empty draft, a missing anchor, and a bad mode", () => {
    expect(() => planInputDraftWrite({ patch: { old_str: "a", new_str: "b" } }, "")).toThrow(/empty/);
    expect(() => planInputDraftWrite({ patch: { old_str: "zzz", new_str: "b" } }, "abc")).toThrow(/did not resolve/);
    expect(() => planInputDraftWrite({ text: "x", mode: "prepend" }, "")).toThrow(/mode/);
    expect(() => planInputDraftWrite({ text: "x", patch: { old_str: "a", new_str: "b" } }, "a")).toThrow(/not both/);
  });
});

describe("action values", () => {
  it("reads a message id", () => {
    expect(parseMessageIdValue("fork_conversation", { message_id: " a1 " })).toBe("a1");
    expect(parseMessageIdValue("fork_conversation", "a1")).toBe("a1");
    expect(() => parseMessageIdValue("fork_conversation", {})).toThrow(/message_id/);
  });
  it("requires true", () => {
    expect(() => requireConfirmTrue("send_draft", true)).not.toThrow();
    expect(() => requireConfirmTrue("send_draft", false)).toThrow(/true/);
  });
});

describe("transcript", () => {
  const rows: ChatTranscriptSourceRow[] = [
    { id: "u1", role: "user", text: "Search the web", createdAt: "t1", status: "active", content: [{ type: "text", text: "Search the web" }] },
    {
      id: "a1",
      role: "assistant",
      text: "Here is what I found",
      createdAt: "t2",
      status: "edited",
      content: [
        { type: "tool_call", call_id: "c1", name: "web_search", arguments: { query: "x".repeat(500) } },
        { type: "tool_call", call_id: "c2", name: "read_page", arguments: { url: "https://a" } },
        { type: "text", text: "Here is what I found" },
      ],
    },
    { id: "t1", role: "tool", text: "", createdAt: "t3", status: "active", content: [{ type: "tool_result", call_id: "c2", is_error: true }] },
    { id: "gone", role: "user", text: "deleted", deletedAt: "t4", content: [] },
    { id: "a2", role: "assistant", text: "", clientStatus: "streaming", content: [] },
  ];
  const lookup = (id: string) =>
    id === "c1" ? { toolName: "web_search", status: "completed", arguments: { query: "cats" }, output: "result ".repeat(100) } : undefined;

  it("folds tool stubs onto the calling message and excerpts payloads", () => {
    const t = buildChatTranscript(rows, lookup);
    expect(t.map((m) => m.id)).toEqual(["u1", "a1", "a2"]);
    const [c1, c2] = t[1].tool_calls;
    expect(c1).toMatchObject({ id: "c1", name: "web_search", status: "completed", arguments_excerpt: '{"query":"cats"}' });
    expect(c1.result_excerpt.length).toBeLessThanOrEqual(300);
    expect(c1.result_excerpt.endsWith("…")).toBe(true);
    expect(c2).toMatchObject({ id: "c2", name: "read_page", status: "error" });
    expect(t[1].edited).toBe(true);
    expect(t[2].streaming).toBe(true);
    expect(t[0].streaming).toBeUndefined();
  });

  it("builds the conversation record", () => {
    const t = buildChatTranscript(rows, lookup);
    expect(
      buildChatConversationRecord({ id: "c", title: null, transcript: t, isStreaming: true, hasOlderMessages: true }),
    ).toEqual({
      id: "c",
      title: "",
      agent_id: null,
      agent_name: null,
      model: null,
      status: null,
      is_streaming: true,
      message_count: 3,
      older_messages_not_loaded: true,
    });
  });

  it("excerpts to one line", () => {
    expect(excerpt("a\n\nb")).toBe("a b");
    expect(excerpt(null)).toBe("");
  });
});
