import type { ManagedResource } from "@/features/agents/types/instance.types";
import type {
  MessagePart,
  PreFetchedUrl,
} from "@/types/python-generated/stream-events";
import type { ContextDrawerItem } from "../types";
import { readWebpageInputs } from "@/features/resource-manager/webpage/webpage-snapshot";
import { DEMO_WEBPAGE_SNAPSHOT } from "../../messages-display/user/userMessageChipsDemoData";

jest.mock("../registry", () => ({
  resolveContextItemDef: (blockType: string) => ({
    typeLabel: blockType.replace(/^input_/, ""),
    icon: () => null,
    themeKey: blockType,
    editable: blockType === "input_notes" || blockType === "input_task",
  }),
}));

import {
  isAttachmentMessagePart,
  normalizeMessagePart,
  normalizeResource,
} from "../normalize";

const CONVERSATION_ID = "conversation-attachment-tests";

const webpageSnapshot: PreFetchedUrl = {
  url: "https://example.com/article",
  title: "Exact submitted article",
  textContent: "The exact text selected before sending.",
  charCount: 39,
  scrapedAt: "2026-08-11T20:57:26.175Z",
};

function resource(
  blockType: ManagedResource["blockType"],
  source: unknown,
): ManagedResource {
  return {
    resourceId: `resource-${blockType}`,
    blockType,
    source,
    preview: null,
    status: "ready",
    errorMessage: null,
    userEdited: false,
    editedContent: null,
    options: {
      keepFresh: false,
      editable: false,
      convertToText: true,
      optionalContext: false,
    },
    finalPayload: null,
    sortOrder: 0,
  };
}

describe("canonical attachment projection", () => {
  it("keeps the exact long webpage demo fixture internally consistent", () => {
    expect(DEMO_WEBPAGE_SNAPSHOT.textContent).toHaveLength(7941);
    expect(DEMO_WEBPAGE_SNAPSHOT.charCount).toBe(
      DEMO_WEBPAGE_SNAPSHOT.textContent.length,
    );
  });

  it("preserves the exact pre-submit webpage snapshot object", () => {
    const [item] = normalizeResource(
      resource("input_webpage", webpageSnapshot),
      CONVERSATION_ID,
    );

    expect(item).toMatchObject({
      origin: "resource",
      blockType: "input_webpage",
      title: webpageSnapshot.title,
      editable: false,
      raw: webpageSnapshot,
    });
    expect(item.refs.webpages).toEqual([webpageSnapshot]);
  });

  it("preserves a submitted PreFetchedUrl instead of narrowing it to a string", () => {
    const part: MessagePart = {
      type: "input_webpage",
      urls: [webpageSnapshot],
      convert_to_text: true,
      editable: true,
    };
    const [item] = normalizeMessagePart(part, 0, CONVERSATION_ID);

    expect(item).toMatchObject({
      origin: "block",
      blockType: "input_webpage",
      title: webpageSnapshot.title,
      editable: false,
      raw: webpageSnapshot,
    });
    expect(item.refs.webpages).toEqual([webpageSnapshot]);
  });

  it("rejects webpage snapshots whose optional fields violate the generated contract", () => {
    expect(
      readWebpageInputs({
        url: "https://example.com/article",
        textContent: "Saved text",
        title: 42,
      }),
    ).toEqual([]);

    expect(
      readWebpageInputs({
        url: "https://example.com/article",
        textContent: "Saved text",
        charCount: 1.2,
      }),
    ).toEqual([]);

    expect(
      readWebpageInputs({
        url: "https://example.com/article",
        textContent: "Saved text",
        charCount: -1,
      }),
    ).toEqual([]);
  });

  it("supports legacy string-only webpage attachments", () => {
    const url = "https://legacy.example.com/post";
    const [item] = normalizeMessagePart(
      { type: "input_webpage", urls: [url] },
      1,
      CONVERSATION_ID,
    );

    expect(item.title).toBe("legacy.example.com");
    expect(item.refs.webpages).toEqual([url]);
  });

  it.each([
    [
      {
        type: "input_notes",
        note_ids: [
          {
            mode: "snapshot",
            title: "Saved note",
            content: "Note snapshot body",
          },
        ],
      },
      "Saved note",
      "Note snapshot body",
    ],
    [
      {
        type: "input_task",
        task_ids: [
          {
            mode: "snapshot",
            title: "Saved task",
            value: "Task snapshot body",
          },
        ],
      },
      "Saved task",
      "Task snapshot body",
    ],
  ] satisfies [MessagePart, string, string][])(
    "keeps an attach-by-value $type snapshot visible without inventing a live id",
    (part, title, content) => {
      const [item] = normalizeMessagePart(part, 2, CONVERSATION_ID);

      expect(item).toMatchObject({
        title,
        editable: false,
        refs: {
          resourceSnapshot: { title, text: content },
        },
      });
      expect(item.refs.noteIds).toBeUndefined();
      expect(item.refs.taskIds).toBeUndefined();
    },
  );

  it.each([
    [
      "input_notes" as const,
      { id: "note-1", title: "Picker note" },
      (item: ContextDrawerItem) => item.refs.noteIds,
      "note-1",
    ],
    [
      "input_task" as const,
      { id: "task-1", title: "Picker task" },
      (item: ContextDrawerItem) => item.refs.taskIds,
      "task-1",
    ],
  ] satisfies Array<
    [
      "input_notes" | "input_task",
      { id: string; title: string },
      (item: ContextDrawerItem) => string[] | undefined,
      string,
    ]
  >)(
    "accepts the raw picker record used by %s",
    (blockType, source, readIds, expectedId) => {
      const [item] = normalizeResource(
        resource(blockType, source),
        CONVERSATION_ID,
      );

      expect(readIds(item)).toEqual([expectedId]);
      expect(item.origin).toBe("resource");
    },
  );

  it.each([
    [{ type: "input_agent", agent_ids: ["agent-1"] }, "agent", "agent-1"],
    [
      { type: "input_project", project_ids: ["project-1"] },
      "project",
      "project-1",
    ],
    [{ type: "input_agent_app", agent_app_ids: ["app-1"] }, "app", "app-1"],
    [
      { type: "input_transcript", transcript_ids: ["transcript-1"] },
      "transcript",
      "transcript-1",
    ],
    [
      {
        type: "input_transcript_session",
        transcript_session_ids: ["session-1"],
      },
      "studio_session",
      "session-1",
    ],
    [
      { type: "input_workbook", workbook_ids: ["workbook-1"] },
      "workbook",
      "workbook-1",
    ],
    [
      { type: "input_document", document_ids: ["document-1"] },
      "udt_document",
      "document-1",
    ],
  ] satisfies Array<[MessagePart, string, string]>)(
    "projects %o into the canonical %s entity door",
    (part, token, id) => {
      const items = normalizeMessagePart(part, 0, CONVERSATION_ID);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        origin: "block",
        editable: false,
        refs: { entityRefs: [{ token, id, name: null }] },
      });
    },
  );

  it("makes submitted notes and tasks immutable even when the wire editable flag is true", () => {
    const note = normalizeMessagePart(
      { type: "input_notes", note_ids: ["note-1"], editable: true },
      0,
      CONVERSATION_ID,
    )[0];
    const task = normalizeMessagePart(
      { type: "input_task", task_ids: ["task-1"], editable: true },
      1,
      CONVERSATION_ID,
    )[0];

    expect(note.editable).toBe(false);
    expect(task.editable).toBe(false);
    expect(note.origin).toBe("block");
    expect(task.origin).toBe("block");
  });

  it("flattens every table and list bookmark into a visible item", () => {
    const tableItems = normalizeMessagePart(
      {
        type: "input_table",
        bookmarks: [
          { type: "full_table", table_id: "table-1", table_name: "Customers" },
          {
            type: "table_row",
            table_id: "table-1",
            row_id: "row-9",
            table_name: "Customers",
          },
        ],
      },
      0,
      CONVERSATION_ID,
    );
    const listItems = normalizeMessagePart(
      {
        type: "input_list",
        bookmarks: [
          { type: "full_list", list_id: "list-1", list_name: "Launch" },
          {
            type: "list_item",
            list_id: "list-1",
            item_id: "item-4",
            list_name: "Launch",
          },
        ],
      },
      1,
      CONVERSATION_ID,
    );

    expect(tableItems).toHaveLength(2);
    expect(tableItems.map((item) => item.refs.bookmarks?.[0])).toEqual([
      expect.objectContaining({ type: "full_table", table_id: "table-1" }),
      expect.objectContaining({ type: "table_row", row_id: "row-9" }),
    ]);
    expect(listItems).toHaveLength(2);
    expect(listItems.map((item) => item.refs.bookmarks?.[0])).toEqual([
      expect.objectContaining({ type: "full_list", list_id: "list-1" }),
      expect.objectContaining({ type: "list_item", item_id: "item-4" }),
    ]);
  });

  it("rejects malformed draft bookmarks at the generated boundary", () => {
    expect(
      normalizeResource(
        resource("input_table", {
          type: "table_cell",
          table_id: "table-1",
          row_id: "",
          column_name: "status",
        }),
        CONVERSATION_ID,
      ),
    ).toEqual([]);
  });

  it("renders every valid generated data-reference variant", () => {
    const items = normalizeMessagePart(
      {
        type: "input_data",
        refs: [
          {
            ref_type: "db_record",
            table: "notes",
            id: "note-1",
            label: "Note row",
          },
          { ref_type: "db_query", table: "tasks", filter: { status: "open" } },
          {
            ref_type: "db_field",
            table: "projects",
            id: "project-1",
            field_name: "name",
          },
        ],
      },
      0,
      CONVERSATION_ID,
    );

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.refs.dataRefs?.[0]?.ref_type)).toEqual([
      "db_record",
      "db_query",
      "db_field",
    ]);
  });

  it("rejects a malformed draft data reference instead of inventing a drawer item", () => {
    expect(
      normalizeResource(
        resource("input_data", {
          refs: [{ ref_type: "db_record", table: "contacts", id: "contact-1" }],
        }),
        CONVERSATION_ID,
      ),
    ).toEqual([]);
  });

  it.each([
    [
      { type: "media", kind: "image", file_id: "image-1" },
      "image",
      "image-1",
      null,
    ],
    [
      {
        type: "media",
        kind: "audio",
        url: "https://cdn.example.com/audio.mp3",
      },
      "audio",
      null,
      "https://cdn.example.com/audio.mp3",
    ],
    [
      { type: "media", kind: "video", file_id: "video-1" },
      "video",
      "video-1",
      null,
    ],
    [
      {
        type: "media",
        kind: "document",
        url: "https://cdn.example.com/file.pdf",
      },
      "document",
      null,
      "https://cdn.example.com/file.pdf",
    ],
    [
      { type: "media", kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" },
      "youtube_video",
      null,
      "https://youtu.be/dQw4w9WgXcQ",
    ],
  ] satisfies Array<[MessagePart, string, string | null, string | null]>)(
    "projects %o into a visible %s attachment",
    (part, blockType, fileId, fileUrl) => {
      const items = normalizeMessagePart(part, 0, CONVERSATION_ID);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        blockType,
        refs: { fileId, fileUrl },
      });
    },
  );

  it("produces at least one visible item for every generated attachment variant", () => {
    const parts = [
      { type: "media", kind: "image", file_id: "image-1" },
      { type: "media", kind: "audio", file_id: "audio-1" },
      { type: "media", kind: "video", file_id: "video-1" },
      { type: "media", kind: "document", file_id: "document-1" },
      { type: "media", kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" },
      { type: "input_webpage", urls: [webpageSnapshot] },
      { type: "input_notes", note_ids: ["note-1"] },
      { type: "input_task", task_ids: ["task-1"] },
      { type: "input_agent", agent_ids: ["agent-1"] },
      { type: "input_project", project_ids: ["project-1"] },
      { type: "input_agent_app", agent_app_ids: ["app-1"] },
      { type: "input_transcript", transcript_ids: ["transcript-1"] },
      {
        type: "input_transcript_session",
        transcript_session_ids: ["session-1"],
      },
      { type: "input_workbook", workbook_ids: ["workbook-1"] },
      { type: "input_document", document_ids: ["document-1"] },
      {
        type: "input_table",
        bookmarks: [{ type: "full_table", table_id: "table-1" }],
      },
      {
        type: "input_list",
        bookmarks: [{ type: "full_list", list_id: "list-1" }],
      },
      {
        type: "input_data",
        refs: [{ ref_type: "db_query", table: "tasks" }],
      },
      {
        type: "input_context",
        context_id: "context-1",
        context_name: "Current context",
      },
    ] satisfies MessagePart[];

    for (const [index, part] of parts.entries()) {
      expect(isAttachmentMessagePart(part)).toBe(true);
      expect(
        normalizeMessagePart(part, index, CONVERSATION_ID).length,
      ).toBeGreaterThan(0);
    }
  });

  it("does not classify text, reasoning, tool, code, or search parts as attachments", () => {
    const nonAttachments = [
      { type: "text", text: "hello" },
      { type: "thinking", text: "private" },
      { type: "tool_call", call_id: "call-1", name: "search" },
      { type: "tool_result", call_id: "call-1" },
      { type: "code_exec", language: "ts", code: "const x = 1" },
      { type: "code_result", output: "1" },
      { type: "web_search", id: "search-1" },
    ] satisfies MessagePart[];

    expect(nonAttachments.every((part) => !isAttachmentMessagePart(part))).toBe(
      true,
    );
  });
});
