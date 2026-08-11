import type { ManagedResource } from "@/features/agents/types/instance.types";
import type {
  MessagePart,
  PreFetchedUrl,
} from "@/types/python-generated/stream-events";
import { isMessagePart } from "@/types/python-generated/stream-events";
import {
  messagePartToUserInputPart,
  selectResourcePayloads,
  userInputPartToMessagePart,
} from "../instance-resources.selectors";

const CONVERSATION_ID = "conversation-projection-test";

const snapshot: PreFetchedUrl = {
  url: "https://example.com/snapshot",
  title: "Saved webpage",
  textContent: "Saved webpage text",
  charCount: 18,
  scrapedAt: "2026-08-11T20:57:26.175Z",
};

function readyResource(
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

describe("request/message attachment projection", () => {
  it("preserves every text part when projecting request parts into the optimistic message", () => {
    const messageParts = [
      { type: "text", text: "Typed in the composer" },
      { type: "text", text: "Voice Pad transcript" },
      { type: "input_webpage", urls: [snapshot] },
    ] satisfies MessagePart[];

    const requestParts = messageParts.map(messagePartToUserInputPart);
    const optimisticParts = requestParts.map(userInputPartToMessagePart);

    expect(
      requestParts
        .filter((part) => part.type === "text")
        .map((part) => part.text),
    ).toEqual(["Typed in the composer", "Voice Pad transcript"]);
    expect(
      optimisticParts
        .filter((part) => part.type === "text")
        .map((part) => part.text),
    ).toEqual(["Typed in the composer", "Voice Pad transcript"]);
    expect(optimisticParts[2]).toEqual({
      type: "input_webpage",
      urls: [snapshot],
    });
  });

  it("preserves inline media bytes as a visible optimistic data URL", () => {
    const optimistic = userInputPartToMessagePart({
      type: "media",
      kind: "image",
      base64_data: "YWJj",
      mime_type: "image/png",
    });

    expect(optimistic).toMatchObject({
      type: "media",
      kind: "image",
      url: "data:image/png;base64,YWJj",
    });
  });

  it("projects persisted media through a complete discriminated request member", () => {
    expect(
      messagePartToUserInputPart({
        type: "media",
        kind: "image",
        url: "https://cdn.example.com/image.png",
        mime_type: "image/png",
      }),
    ).toEqual({
      type: "media",
      kind: "image",
      url: "https://cdn.example.com/image.png",
      mime_type: "image/png",
    });
  });

  it("rejects persisted media without a locator at the generated boundary", () => {
    expect(isMessagePart({ type: "media", kind: "image" })).toBe(false);
  });
});

describe("outbound attachment validation", () => {
  const payloadSelector = selectResourcePayloads(CONVERSATION_ID);

  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [
      "webpage missing its snapshot text",
      readyResource("input_webpage", { url: snapshot.url }),
    ],
    [
      "document missing a file id, URL, or bytes",
      readyResource("document", { filename: "ghost.pdf" }),
    ],
    [
      "entity reference missing its id",
      readyResource("input_agent", { name: "No id" }),
    ],
    [
      "table reference with a guessed shape",
      readyResource("input_table", { table_id: "table-1" }),
    ],
    [
      "table cell with an empty row identity",
      readyResource("input_table", {
        type: "table_cell",
        table_id: "table-1",
        row_id: "",
        column_name: "status",
      }),
    ],
    [
      "list item with an empty item identity",
      readyResource("input_list", {
        type: "list_item",
        list_id: "list-1",
        item_id: "",
      }),
    ],
    [
      "data reference to a non-allowlisted table",
      readyResource("input_data", {
        ref_type: "db_record",
        table: "contacts",
        id: "contact-1",
      }),
    ],
    [
      "data query with an out-of-range limit",
      readyResource("input_data", {
        ref_type: "db_query",
        table: "notes",
        limit: 1001,
      }),
    ],
    [
      "data field reference with an empty field name",
      readyResource("input_data", {
        ref_type: "db_field",
        table: "notes",
        id: "note-1",
        field_name: "",
      }),
    ],
  ])("rejects a malformed %s instead of guessing", (_label, resource) => {
    expect(() =>
      payloadSelector.resultFunc({ [resource.resourceId]: resource }),
    ).toThrow(TypeError);
    expect(console.error).toHaveBeenCalledWith(
      "[instance-resources] Invalid ready resource payload",
      expect.objectContaining({
        resourceId: resource.resourceId,
        blockType: resource.blockType,
      }),
    );
  });

  it("recovers a legacy transcript-only audio draft as text", () => {
    const resource = readyResource("audio", {
      transcript: "Legacy Voice Pad words",
    });

    expect(
      payloadSelector.resultFunc({ [resource.resourceId]: resource }),
    ).toEqual([{ type: "text", text: "Legacy Voice Pad words" }]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "preserves an explicit editable=%s decision for a writable reference",
    (editable) => {
      const note = readyResource("input_notes", { id: "note-1" });
      note.options.editable = editable;

      expect(payloadSelector.resultFunc({ [note.resourceId]: note })).toEqual([
        expect.objectContaining({
          type: "input_notes",
          note_ids: ["note-1"],
          editable,
        }),
      ]);
    },
  );

  it("omits editable for a data reference with no write capability", () => {
    const data = readyResource("input_data", {
      refs: [{ ref_type: "db_record", table: "notes", id: "note-1" }],
    });
    data.options.editable = true;

    expect(payloadSelector.resultFunc({ [data.resourceId]: data })).toEqual([
      expect.not.objectContaining({ editable: expect.anything() }),
    ]);
  });
});
