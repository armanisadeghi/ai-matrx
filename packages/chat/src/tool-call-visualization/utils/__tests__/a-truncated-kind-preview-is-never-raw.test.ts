/**
 * A KIND IS NEVER DRAWN AS RAW JSON — the reloaded tool call (T2 of
 * features/content-ir/docs/KIND_NEVER_RAW_CHECKLIST.md, Arman 2026-09-30).
 *
 * A slim `cx_tool_call` row carries only `output_preview` — the first slice
 * of the output. When the output was a kind, that slice is unparseable kind
 * JSON, and the reloaded card drew it as text: `{"__kind":"flashcard_set","ti…`.
 * It must read as an honest state naming the kind; whole-JSON previews parse;
 * prose previews stay prose.
 *
 * RED BEFORE GREEN: before the fix `result` was the raw preview string.
 */
import type { CxToolCallRecord } from "../../../agents/redux/execution-system/observability/observability.slice";

import { persistedToolEntry } from "../cxToolCallToLifecycleEntry";

function row(over: Partial<CxToolCallRecord>): CxToolCallRecord {
  return {
    id: "row-1",
    conversationId: "c0nv0000-0000-4000-8000-000000000001",
    userRequestId: null,
    messageId: null,
    userId: "",
    callId: "toolu_flashcards",
    toolName: "study_tools",
    toolNameAsCalled: null,
    toolType: "local",
    iteration: 1,
    status: "completed",
    success: true,
    isError: false,
    errorType: null,
    errorMessage: null,
    arguments: { topic: "Cell biology" },
    output: null,
    outputChars: 4812,
    outputPreview: null,
    outputType: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    costUsd: null,
    durationMs: 900,
    startedAt: "2026-09-30T20:00:00.000Z",
    completedAt: "2026-09-30T20:00:01.000Z",
    parentCallId: null,
    retryCount: null,
    persistKey: null,
    filePath: null,
    executionEvents: null,
    metadata: null,
    createdAt: "2026-09-30T20:00:00.000Z",
    deletedAt: null,
    ...over,
  } as CxToolCallRecord;
}

function resultOf(preview: string): unknown {
  return persistedToolEntry({
    callId: "toolu_flashcards",
    record: row({ outputPreview: preview }),
  }).result;
}

describe("a reloaded call with only an output preview", () => {
  it("never hands truncated kind JSON to a renderer", () => {
    const result = resultOf(
      '{"__kind":"flashcard_set","title":"Cell biology","cards":[{"front":"Mito',
    );
    expect(typeof result).toBe("string");
    expect(result as string).not.toContain("__kind");
    expect(result).toBe("Flashcard set · full output not saved");
    expect((result as string).length).toBeLessThanOrEqual(60);
  });

  it("parses a preview that is whole JSON, so a kind keeps its value", () => {
    const result = resultOf('{"__kind":"flashcard_set","title":"Cell biology"}');
    expect(result).toEqual({ __kind: "flashcard_set", title: "Cell biology" });
  });

  it("keeps a prose preview as the text it is", () => {
    expect(resultOf("Found 12 matching patients")).toBe("Found 12 matching patients");
  });

  it("keeps a kindless truncated JSON preview as text", () => {
    const preview = '{"rows":[{"name":"Harbor Dental","city":"San';
    expect(resultOf(preview)).toBe(preview);
  });
});
