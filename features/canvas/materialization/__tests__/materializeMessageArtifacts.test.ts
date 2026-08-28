const maybeSingle = jest.fn();
const eq = jest.fn(() => ({ maybeSingle }));
const select = jest.fn(() => ({ eq }));
const from = jest.fn(() => ({ select }));
const schema = jest.fn(() => ({ from }));
const materializeBlocks = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema, rpc: jest.fn() },
}));

jest.mock("../materializeBlocks", () => ({
  materializeBlocks,
}));

import { materializeMessageArtifacts } from "../materializeMessageArtifacts";

describe("materializeMessageArtifacts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    materializeBlocks.mockResolvedValue({
      materializedCount: 1,
      rewrittenContent: [],
      errors: [],
    });
  });

  it("materializes canonical persisted content when stream blocks target the wrong tool iteration", async () => {
    const canonicalContent = [
      { type: "tool_call", id: "call-owned-by-row", name: "lookup" },
      { type: "text", text: "<artifact>persisted</artifact>" },
    ];
    maybeSingle.mockResolvedValue({
      data: { content: canonicalContent },
      error: null,
    });

    await materializeMessageArtifacts({
      messageId: "message-1",
      conversationId: "conversation-1",
      content: [{ type: "text", text: "<artifact>wrong iteration</artifact>" }],
    });

    expect(schema).toHaveBeenCalledWith("chat");
    expect(from).toHaveBeenCalledWith("message");
    expect(eq).toHaveBeenCalledWith("id", "message-1");
    expect(materializeBlocks).toHaveBeenCalledWith(
      expect.objectContaining({ content: canonicalContent }),
    );
  });

  it("does not create canvas rows when canonical source content cannot be read", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "source unavailable" },
    });

    const result = await materializeMessageArtifacts({
      messageId: "message-1",
      conversationId: "conversation-1",
      content: [{ type: "text", text: "<artifact>untrusted</artifact>" }],
    });

    expect(materializeBlocks).not.toHaveBeenCalled();
    expect(result).toEqual({
      materializedCount: 0,
      rewrittenContent: null,
      errors: ["canonical source read failed: source unavailable"],
    });
  });

  it("treats an absent canonical row as a normal materialization abort", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await materializeMessageArtifacts({
      messageId: "rolled-back-message",
      conversationId: "conversation-1",
      content: [{ type: "text", text: "<artifact>untrusted</artifact>" }],
    });

    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(materializeBlocks).not.toHaveBeenCalled();
    expect(result).toEqual({
      materializedCount: 0,
      rewrittenContent: null,
      errors: [],
    });
  });
});
