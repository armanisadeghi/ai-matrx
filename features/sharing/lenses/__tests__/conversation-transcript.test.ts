/**
 * A shared AI chat shows its messages (access ladder T-19) — the reader of the
 * database's narrowed transcript. Red if the lens would render nothing for a
 * real payload, would show a non-CDN media URL, or would split one assistant
 * turn into many.
 */

import {
  firstUserText,
  readSharedConversation,
  toolStepLabel,
} from "../conversation-transcript";

const payload = {
  kind: "conversation_messages",
  total: 5,
  truncated: false,
  messages: [
    {
      id: "u1",
      role: "user",
      created_at: "2026-09-27T20:00:00Z",
      blocks: [
        { type: "text", text: "Add a Hydrotherapy Pool room to the treatment rooms table." },
        { type: "media", kind: "image", title: "floorplan.png", url: null },
      ],
    },
    { id: "a1", role: "assistant", blocks: [{ type: "tool", name: "records" }] },
    {
      id: "a2",
      role: "assistant",
      blocks: [
        { type: "text", text: "Found the table." },
        { type: "tool", name: "records" },
        { type: "tool", name: "records" },
      ],
    },
    {
      id: "a3",
      role: "assistant",
      blocks: [
        {
          type: "media",
          kind: "image",
          title: "evil",
          url: "https://attacker.example.com/pixel.png",
        },
        {
          type: "media",
          kind: "image",
          title: "chart",
          url: "https://cdn.matrxserver.com/org/file?v=1",
        },
      ],
    },
    // A message the projection emptied (e.g. only thinking) is dropped.
    { id: "a4", role: "assistant", blocks: [] },
  ],
};

describe("readSharedConversation", () => {
  it("returns null when the token carries no transcript", () => {
    expect(readSharedConversation({ children: null })).toBeNull();
    expect(readSharedConversation({ children: { kind: "other" } })).toBeNull();
  });

  it("groups consecutive assistant messages into ONE turn and folds repeated tool steps", () => {
    const t = readSharedConversation({ children: payload });
    expect(t).not.toBeNull();
    expect(t!.turns.map((x) => x.role)).toEqual(["user", "assistant"]);
    const assistant = t!.turns[1];
    expect(assistant.blocks[0]).toEqual({ type: "tool", name: "records", count: 1 });
    expect(assistant.blocks[1]).toEqual({ type: "text", text: "Found the table." });
    expect(assistant.blocks[2]).toEqual({ type: "tool", name: "records", count: 2 });
    expect(t!.total).toBe(5);
    expect(t!.truncated).toBe(false);
  });

  it("never renders a media URL that is not on the public CDN", () => {
    const t = readSharedConversation({ children: payload })!;
    const media = t.turns[1].blocks.filter((b) => b.type === "media");
    expect(media).toHaveLength(2);
    expect(media[0]).toMatchObject({ title: "evil", url: null });
    expect(media[1]).toMatchObject({
      title: "chart",
      url: "https://cdn.matrxserver.com/org/file?v=1",
    });
  });

  it("describes the chat by its opening question", () => {
    const t = readSharedConversation({ children: payload })!;
    expect(firstUserText(t)).toMatch(/^Add a Hydrotherapy Pool room/);
  });
});

describe("toolStepLabel", () => {
  it("reads a tool name as words", () => {
    expect(toolStepLabel("apply_surface_write")).toBe("Apply surface write");
    expect(toolStepLabel("webSearch")).toBe("Web search");
  });
});
