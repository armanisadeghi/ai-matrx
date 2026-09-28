/**
 * A shared AI chat shows its messages (access ladder T-19) — the reader of the
 * database's narrowed transcript. Red if the lens would render nothing for a
 * real payload, would show a non-CDN media URL, or would split one assistant
 * turn into many.
 */

import {
  firstUserText,
  readSharedConversation,
  sharedToolEntry,
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
    {
      id: "a1",
      role: "assistant",
      blocks: [
        {
          type: "tool",
          call_id: "c1",
          name: "records",
          status: "completed",
          arguments: { table: "treatment_rooms" },
          output: '{"rows":[{"name":"Sauna"}]}',
        },
      ],
    },
    {
      id: "a2",
      role: "assistant",
      blocks: [
        { type: "text", text: "Found the table." },
        { type: "tool", call_id: "c2", name: "records", status: "completed", output: "added" },
        {
          type: "tool",
          call_id: "c3",
          name: "credential_login",
          status: "completed",
          withheld: true,
          // A withheld step never carries these; the reader drops them anyway.
          arguments: { password: "x" },
          output: "session cookie",
        },
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

  it("groups consecutive assistant messages into ONE turn and runs consecutive tool steps together", () => {
    const t = readSharedConversation({ children: payload });
    expect(t).not.toBeNull();
    expect(t!.turns.map((x) => x.role)).toEqual(["user", "assistant"]);
    const assistant = t!.turns[1];
    expect(assistant.blocks.map((b) => b.type)).toEqual(["tools", "text", "tools", "media", "media"]);
    const first = assistant.blocks[0];
    const run = assistant.blocks[2];
    if (first.type !== "tools" || run.type !== "tools") throw new Error("shape");
    expect(first.tools.map((x) => x.callId)).toEqual(["c1"]);
    expect(first.tools[0].output).toEqual({ rows: [{ name: "Sauna" }] });
    expect(run.tools.map((x) => x.callId)).toEqual(["c2", "c3"]);
    expect(t!.total).toBe(5);
    expect(t!.truncated).toBe(false);
  });

  it("a withheld tool step carries no arguments and no output, whatever arrived", () => {
    const t = readSharedConversation({ children: payload })!;
    const run = t.turns[1].blocks[2];
    if (run.type !== "tools") throw new Error("shape");
    const login = run.tools[1];
    expect(login.withheld).toBe(true);
    expect(login.arguments).toEqual({});
    expect(login.output).toBeNull();
    const entry = sharedToolEntry(login);
    expect(entry.arguments).toEqual({});
    expect(entry.result).toBeNull();
  });

  it("builds the chat's own tool-card entry from a shared step", () => {
    const t = readSharedConversation({ children: payload })!;
    const first = t.turns[1].blocks[0];
    if (first.type !== "tools") throw new Error("shape");
    expect(sharedToolEntry(first.tools[0])).toMatchObject({
      callId: "c1",
      toolName: "records",
      status: "completed",
      arguments: { table: "treatment_rooms" },
      result: { rows: [{ name: "Sauna" }] },
      events: [],
    });
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

describe("attachments and structured blocks", () => {
  it("keeps a file id only when it is a uuid, and reads decision / speech blocks", () => {
    const t = readSharedConversation({
      children: {
        kind: "conversation_messages",
        messages: [
          {
            id: "u",
            role: "user",
            blocks: [
              { type: "media", kind: "file", file_id: "11111111-1111-1111-1111-111111111111", size_bytes: 2048 },
              { type: "media", kind: "file", file_id: "../../etc/passwd" },
              { type: "decision_questions", payload: { questions: [] } },
              { type: "speech_script", payload: { turns: [] } },
              { type: "decision_answers", payload: "not-an-object" },
            ],
          },
        ],
      },
    })!;
    const blocks = t.turns[0].blocks;
    expect(blocks.map((b) => b.type)).toEqual(["media", "media", "decision_questions", "speech_script"]);
    expect(blocks[0]).toMatchObject({ fileId: "11111111-1111-1111-1111-111111111111", sizeBytes: 2048 });
    expect(blocks[1]).toMatchObject({ fileId: null });
  });
});
