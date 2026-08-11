import type { ManagedResource } from "@/features/agents/types/instance.types";
import type {
  MessagePart,
  PreFetchedUrl,
} from "@/types/python-generated/stream-events";
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
    ["webpage missing its snapshot text", readyResource("input_webpage", { url: snapshot.url })],
    ["document missing a file id, URL, or bytes", readyResource("document", { filename: "ghost.pdf" })],
    ["entity reference missing its id", readyResource("input_agent", { name: "No id" })],
    ["table reference with a guessed shape", readyResource("input_table", { table_id: "table-1" })],
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

    expect(payloadSelector.resultFunc({ [resource.resourceId]: resource })).toEqual([
      { type: "text", text: "Legacy Voice Pad words" },
    ]);
    expect(console.error).not.toHaveBeenCalled();
  });
});
