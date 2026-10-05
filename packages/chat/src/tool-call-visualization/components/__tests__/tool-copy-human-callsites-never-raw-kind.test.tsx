/**
 * Y7 (kind never raw): the tool INPUT copy and the generated-image copy hand
 * their `human` flavor through the shared human-copy helper — a value carrying
 * a kind copies as its markdown, never `JSON.stringify`. The `agent` flavor is
 * data and keeps `__kind`.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const copyProps: Array<{ label: string; human: () => string; agent: () => unknown }> = [];
jest.mock("@host/components/agent-copy/CopyButtons", () => ({
  CopyButtons: (props: { label: string; human: () => string; agent: () => unknown }) => {
    copyProps.push(props);
    return null;
  },
}));
jest.mock("../../result-fields/ResultMedia", () => ({ ResultMedia: () => null }));
jest.mock("../../registry/GenericRenderer", () => ({ GenericRenderer: () => null }));
jest.mock("../ToolConversationContext", () => ({ useToolConversationId: () => "conv-1" }));

import { InputView } from "../ToolTabBodies";
import { ImageGenerationResult } from "../../renderers/agent-call/ImageGenerationResult";

const KIND = { __kind: "checklist", title: "Packing", items: [{ text: "Passport" }] };

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  copyProps.length = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

test("tool arguments carrying a kind copy as markdown for a person, as data for an agent", () => {
  const entry = { callId: "c1", toolName: "save_list", arguments: { list: KIND, note: "x" } };
  act(() => root.render(<InputView entry={entry as never} />));
  const human = copyProps[0].human();
  expect(human).not.toContain("__kind");
  expect(human).toContain("Passport");
  expect(JSON.stringify(copyProps[0].agent())).toContain("__kind");
});

test("kindless tool arguments still copy as pretty JSON", () => {
  const entry = { callId: "c1", toolName: "t", arguments: { topic: "trip" } };
  act(() => root.render(<InputView entry={entry as never} />));
  expect(copyProps[0].human()).toBe(JSON.stringify({ topic: "trip" }, null, 2));
});

test("an image result carrying a kind copies as markdown for a person", () => {
  const result = { ...KIND, media: [{ file_id: "f-1", mime_type: "image/png" }] };
  const entry = { callId: "c2", toolName: "make_image", result, arguments: {} };
  act(() => root.render(<ImageGenerationResult {...({ entry } as unknown as React.ComponentProps<typeof ImageGenerationResult>)} />));
  const human = copyProps.find((p) => p.label === "Image")!.human();
  expect(human).not.toContain("__kind");
  expect(human).toContain("Passport");
});
