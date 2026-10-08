/**
 * <RichContent level="full"> carries the engine's host hooks to the chat
 * pipeline unchanged — an in-block edit reaches the host's save, and the
 * analyzer / message identity props are not dropped. The agent builder's Read
 * view and the full-screen editor's Preview rely on this.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const seen: Record<string, unknown>[] = [];
jest.mock("@ai-matrx/chat/ui/markdown-stream/MarkdownStream", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    seen.push(props);
    return <div data-testid="stream" />;
  },
}));
jest.mock("next/dynamic", () => () => () => null);

import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";

test("onContentChange, messageId, analysisData, conversationId and the display flags reach the pipeline; an edit reaches the host", () => {
  const save = jest.fn();
  const analysis = { kind: "probe" };
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() =>
    root.render(
      <RichContent
        level="full"
        imagePolicy="other"
        source={'```json\n{"a":1}\n```'}
        onContentChange={save}
        messageId="m1"
        conversationId="c1"
        analysisData={analysis}
        allowFullScreenEditor={false}
        hideCopyButton
        applyLocalEdits={false}
      />,
    ),
  );
  const props = seen[seen.length - 1];
  expect(props.content).toBe('```json\n{"a":1}\n```');
  expect(props.messageId).toBe("m1");
  expect(props.conversationId).toBe("c1");
  expect(props.analysisData).toBe(analysis);
  expect(props.allowFullScreenEditor).toBe(false);
  expect(props.hideCopyButton).toBe(true);
  expect(props.applyLocalEdits).toBe(false);
  // The pipeline reports an in-block edit; the host's save receives it as given.
  (props.onContentChange as (a: string, b: string) => void)('```json\n{\n  "a": 1\n}\n```', "old");
  expect(save).toHaveBeenCalledWith('```json\n{\n  "a": 1\n}\n```', "old");
  act(() => root.unmount());
});
