/**
 * RC-B6 (expanded) — the actions the best AI apps offer, in the ONE registry,
 * for every source: every copy format, table → CSV / TSV / data table,
 * download as HTML / PDF, save as flashcard, and ask-in-chat. Each is either
 * present or ABSENT (never dead) by what the source and its host can do.
 */

import "../handlers";
import { getAction, resolveActions } from "../provider";
import { parseFirstMarkdownTable, tableToDelimited } from "../markdownTable";
import { chatContext, RICH_MESSAGE } from "../../test-utils/chatContext";
import type { RichDocumentActionContext } from "../../types";
import { noteIdentityContentSource } from "@/features/notes/richDocumentSource";

function noteContext(
  overrides: Partial<RichDocumentActionContext> = {},
): RichDocumentActionContext {
  const chat = chatContext("assistant");
  return {
    ...chat,
    source: noteIdentityContentSource("00000000-0000-4000-8000-000000000001", "s-1"),
    extensions: { type: "note", isOwner: true },
    callbacks: {},
    ...overrides,
  };
}

const ids = (ctx: RichDocumentActionContext) =>
  resolveActions(ctx).map((a) => a.id);

describe("markdown table helpers", () => {
  it("reads the first table, strips inline markdown, pads short rows", () => {
    const table = parseFirstMarkdownTable(
      "intro\n\n| **Tier** | Window |\n| --- | :---: |\n| Gold | 60 days |\n| Silver |\n",
    );
    expect(table).toEqual({
      headers: ["Tier", "Window"],
      rows: [
        ["Gold", "60 days"],
        ["Silver", ""],
      ],
    });
  });

  it("returns null when there is no table", () => {
    expect(parseFirstMarkdownTable("just | a pipe in prose")).toBeNull();
  });

  it("quotes CSV cells that need it; TSV flattens tabs", () => {
    const t = { headers: ["a", "b"], rows: [['x, "y"', "z\tw"]] };
    expect(tableToDelimited(t, ",")).toBe('a,b\n"x, ""y""",z\tw');
    expect(tableToDelimited(t, "\t")).toBe("a\tb\nx, \"y\"\tz w");
  });
});

describe("the expanded action set", () => {
  const EVERY_SOURCE = [
    "copy-markdown",
    "copy-plain-text",
    "copy-rich-text",
    "copy-html-source",
    "download-html",
    "download-pdf",
    "download-docx",
    "save-as-file",
  ];

  it.each(EVERY_SOURCE)("%s is registered and offered on a note and a chat turn", (id) => {
    expect(getAction(id)).toBeDefined();
    expect(ids(noteContext())).toContain(id);
    expect(ids(chatContext("assistant"))).toContain(id);
  });

  it("offers the table actions only when the content has a table", () => {
    const withTable = ids(chatContext("assistant"));
    expect(withTable).toEqual(
      expect.arrayContaining(["copy-table-csv", "copy-table-tsv", "save-table-as-data"]),
    );
    const noTable = ids(chatContext("assistant", { content: "No table here." }));
    expect(noTable).not.toContain("copy-table-csv");
    expect(noTable).not.toContain("save-table-as-data");
  });

  it("copy-table-csv puts the CSV of the first table on the clipboard", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await getAction("copy-table-csv")!.run(chatContext("assistant"));
    expect(writeText).toHaveBeenCalledWith("Tier,Window\nGold,60 days");
  });

  it("host-owned dialogs are absent without a host, present with one", () => {
    const bare = ids(noteContext());
    expect(bare).not.toContain("save-as-flashcard");
    expect(bare).not.toContain("save-table-as-data");
    const hosted = ids(
      noteContext({
        content: RICH_MESSAGE,
        callbacks: { onRequestFlashcard: jest.fn(), onRequestSaveTable: jest.fn() },
      }),
    );
    expect(hosted).toEqual(expect.arrayContaining(["save-as-flashcard", "save-table-as-data"]));
  });

  it("save-table-as-data hands the parsed table to the host", () => {
    const onRequestSaveTable = jest.fn();
    const ctx = chatContext("assistant", {
      callbacks: { ...chatContext("assistant").callbacks, onRequestSaveTable },
    });
    void getAction("save-table-as-data")!.run(ctx);
    expect(onRequestSaveTable).toHaveBeenCalledWith({
      headers: ["Tier", "Window"],
      rows: [["Gold", "60 days"]],
    });
  });

  it("ask-in-chat is offered only where a conversation exists, and quotes as CONTEXT", () => {
    expect(ids(noteContext())).not.toContain("quote-into-chat");
    const dispatch = jest.fn();
    const ctx = chatContext("assistant", {
      dispatch,
      getState: (() => ({
        instanceContext: { byConversationId: {} },
        conversations: { byConversationId: {} },
        messages: { byConversationId: {} },
        activeRequests: { byRequestId: {} },
      })) as never,
    });
    expect(ids(ctx)).toEqual(expect.arrayContaining(["ask-followup", "quote-into-chat"]));
    void getAction("quote-into-chat")!.run(ctx);
    const action = dispatch.mock.calls[0][0];
    // THE USER-INPUT LAW: a context entry on the conversation, never composer text.
    expect(action.type).toMatch(/setContextEntries$/);
    expect(action.payload.conversationId).toBe("conv-1");
    expect(action.payload.entries[0].key).toBe("quoted_passages");
    expect(action.payload.entries[0].value[0].text).toBe(RICH_MESSAGE);
  });

  it("a text field's AI powers are registry actions, absent unless the host can apply", () => {
    expect(ids(noteContext())).not.toContain("text-cleanup");
    const onRequestTextAgentAction = jest.fn();
    const ctx = noteContext({ callbacks: { onRequestTextAgentAction } });
    expect(ids(ctx)).toEqual(
      expect.arrayContaining(["text-cleanup", "text-help", "text-custom-agent"]),
    );
    void getAction("text-cleanup")!.run(ctx);
    expect(onRequestTextAgentAction).toHaveBeenCalledWith("cleanup", ctx);
  });

  it("text taken OUT of its home never carries the storage envelope", async () => {
    const stored =
      'Here:\n\n<artifact type="table" id="a1" version="1" title="Table 1">\n| Day | Dinner |\n|---|---|\n| Mon | Chili |\n</artifact>\n';
    const onRequestFlashcard = jest.fn();
    const dispatch = jest.fn();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const base = chatContext("assistant");
    const ctx = chatContext("assistant", {
      content: stored,
      dispatch,
      callbacks: { ...base.callbacks, onRequestFlashcard },
    });
    void getAction("save-as-flashcard")!.run(ctx);
    expect(onRequestFlashcard.mock.calls[0][0]).not.toContain("<artifact");
    expect(onRequestFlashcard.mock.calls[0][0]).toContain("| Mon | Chili |");

    void getAction("save-to-task")!.run(ctx);
    const seed = dispatch.mock.calls.at(-1)?.[0]?.payload;
    expect(seed.prePopulate.description).not.toContain("<artifact");

    await getAction("copy-plain-text")!.run(ctx);
    const plain = writeText.mock.calls.at(-1)?.[0] as string;
    expect(plain).not.toContain("<artifact");
    expect(plain).not.toContain("|");
    expect(plain).toContain("Mon\tChili");
  });
});

describe("thumbs rate outputs, never your own words (RC-B6 round 2)", () => {
  it("an assistant answer can be rated", () => {
    expect(ids(chatContext("assistant"))).toEqual(expect.arrayContaining(["thumbs-up", "thumbs-down"]));
  });
  it("your own chat message cannot", () => {
    const own = ids(chatContext("user"));
    expect(own).not.toContain("thumbs-up");
    expect(own).not.toContain("thumbs-down");
  });
  it("a note you own cannot; someone else's shared note can", () => {
    expect(ids(noteContext())).not.toContain("thumbs-up");
    expect(ids(noteContext({ extensions: { type: "note", isOwner: false } }))).toContain("thumbs-up");
  });
});
