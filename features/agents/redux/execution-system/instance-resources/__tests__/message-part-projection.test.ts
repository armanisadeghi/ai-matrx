import type { ManagedResource } from "@/features/agents/types/instance.types";
import type {
  MessagePart,
  PreFetchedUrl,
} from "@/types/python-generated/stream-events";
import type { UserInputPart } from "@/features/agents/types/request.types";
import { isMessagePart } from "@/types/python-generated/stream-events";
import {
  messagePartToUserInputPart,
  selectResourceContextPayload,
  selectResourcePayloads,
  userInputPartToMessagePart,
} from "../instance-resources.selectors";
import instanceResourcesReducer, {
  addResource,
  clearSubmittedResources,
  initInstanceResources,
  markResourcesSubmitted,
  removeResource,
  setResourceStatus,
} from "../instance-resources.slice";

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
    const inlineRequestImage: Extract<
      UserInputPart,
      { type: "media"; kind: "image" }
    > = {
      type: "media",
      kind: "image",
      base64_data: "YWJj",
      mime_type: "image/png",
    };
    const optimistic = userInputPartToMessagePart(inlineRequestImage);

    expect(optimistic).toMatchObject({
      type: "media",
      kind: "image",
      url: "data:image/png;base64,YWJj",
    });
    expect(isMessagePart(optimistic)).toBe(true);
  });

  it("projects a file-id image with omitted optional fields into valid JSON state", () => {
    const optimistic = userInputPartToMessagePart({
      type: "media",
      kind: "image",
      file_id: "7f385f0f-86b0-4d46-b927-f24806b217f7",
    });

    expect(optimistic).toEqual({
      type: "media",
      kind: "image",
      file_id: "7f385f0f-86b0-4d46-b927-f24806b217f7",
    });
    expect(isMessagePart(optimistic)).toBe(true);
  });

  it.each([
    { type: "media", kind: "audio", file_id: "audio-file" },
    { type: "media", kind: "video", file_id: "video-file" },
    { type: "media", kind: "document", file_id: "document-file" },
    { type: "media", kind: "youtube", url: "https://youtu.be/example" },
    {
      type: "text",
      text: "Nested optional metadata",
      metadata: { title: "kept", omitted: undefined },
    },
  ] satisfies UserInputPart[])(
    "produces JSON-equivalent generated state for $type:$kind",
    (requestPart) => {
      const optimistic = userInputPartToMessagePart(requestPart);

      expect(optimistic).toEqual(JSON.parse(JSON.stringify(optimistic)));
      expect(isMessagePart(optimistic)).toBe(true);
    },
  );

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

describe("stored-file attachment lifecycle", () => {
  it("keeps the file reference through submission until durable inventory removes it", () => {
    let state = instanceResourcesReducer(
      undefined,
      initInstanceResources({ conversationId: CONVERSATION_ID }),
    );
    state = instanceResourcesReducer(
      state,
      addResource({
        conversationId: CONVERSATION_ID,
        resourceId: "stored-pdf",
        blockType: "processed_document",
        source: {
          kind: "file",
          file_id: "file-123",
          label: "Reference.pdf",
        },
      }),
    );
    state = instanceResourcesReducer(
      state,
      setResourceStatus({
        conversationId: CONVERSATION_ID,
        resourceId: "stored-pdf",
        status: "ready",
      }),
    );
    state = instanceResourcesReducer(
      state,
      markResourcesSubmitted(CONVERSATION_ID),
    );
    state = instanceResourcesReducer(
      state,
      clearSubmittedResources(CONVERSATION_ID),
    );

    expect(
      state.byConversationId[CONVERSATION_ID]?.["stored-pdf"],
    ).toBeDefined();

    state = instanceResourcesReducer(
      state,
      removeResource({
        conversationId: CONVERSATION_ID,
        resourceId: "stored-pdf",
      }),
    );

    expect(
      state.byConversationId[CONVERSATION_ID]?.["stored-pdf"],
    ).toBeUndefined();
    expect(state.submittedIds[CONVERSATION_ID]).toEqual([]);
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

describe("stored-file reference projection", () => {
  const contextSelector = selectResourceContextPayload(CONVERSATION_ID);

  it("keeps the automatic primary minimal so the server applies Clean -> Raw -> PDF", () => {
    const resource = readyResource("processed_document", {
      kind: "file",
      file_id: "7f385f0f-86b0-4d46-b927-f24806b217f7",
      label: "large.pdf",
    });

    expect(
      contextSelector.resultFunc({ [resource.resourceId]: resource }),
    ).toEqual({
      "attached_file_7f385f0f-86b0-4d46-b927-f24806b217f7": {
        __kind: "resource_ref",
        resource_type: "file",
        resource_id: "7f385f0f-86b0-4d46-b927-f24806b217f7",
      },
    });
  });

  it("keeps the primary override independent from inline/exclusion policy", () => {
    const resource = readyResource("processed_document", {
      kind: "file",
      file_id: "7f385f0f-86b0-4d46-b927-f24806b217f7",
    });
    resource.options.representation = "raw";
    resource.options.resourcePolicy = {
      promote: [{ representation: "clean", max_chars: 2000 }],
      exclude: ["rag"],
    };

    expect(
      contextSelector.resultFunc({ [resource.resourceId]: resource }),
    ).toEqual({
      "attached_file_7f385f0f-86b0-4d46-b927-f24806b217f7": {
        __kind: "resource_ref",
        resource_type: "file",
        resource_id: "7f385f0f-86b0-4d46-b927-f24806b217f7",
        representation: "raw",
        promote: [{ representation: "clean", max_chars: 2000 }],
        exclude: ["rag"],
      },
    });
  });

  it("stops shipping after durable inventory removes the provisional resource", () => {
    expect(contextSelector.resultFunc({})).toBeUndefined();
  });
});
