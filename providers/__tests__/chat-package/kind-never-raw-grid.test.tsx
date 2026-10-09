/**
 * C4/C5 — the value grid, the structured floor and the JSON viewers never draw
 * a kind raw. Kind data in → the one value door (`AnswerValueView` →
 * `KindInstanceRender`), no `"__kind"` text in the DOM; kindless JSON in →
 * still drawn as data/JSON; a deliberate source view (`showSource`) keeps it.
 *
 * Only the kind router and the stream pipeline are stand-ins (each marks the
 * route taken); the grid, the floor and the viewers are real.
 */
import "@/__tests__/helpers/register-chat-host";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () =>
    jest.requireActual("@ai-matrx/rich-content/markdown-core/MarkdownCoreImpl").default,
}));
jest.mock("@/features/content-ir/studio/components/KindInstanceRender", () => ({
  __esModule: true,
  default: ({ kind }: { kind: string }) => <div data-kind-route={kind} />,
}));
jest.mock("@ai-matrx/chat/ui/markdown-stream/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => (
    <div
      data-markdown-stream="1"
      data-kind-fence={content.startsWith("```json") ? "1" : "0"}
    />
  ),
}));
const mockCaptureError = jest.fn();
jest.mock("@ai-matrx/chat/host/diagnostics", () => ({
  ...jest.requireActual("@ai-matrx/chat/host/diagnostics"),
  captureError: (input: unknown) => mockCaptureError(input),
}));
// The subject still reaches the app's Error Inspector through other host
// modules; both sinks share one mock so no capture escapes the assertions.
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: (input: unknown) => mockCaptureError(input),
}));

import { ResultValue } from "@ai-matrx/chat/tool-call-visualization/result-fields/ResultValue";
import { KeyValueGrid } from "@ai-matrx/chat/tool-call-visualization/result-fields/KeyValueGrid";
import { ResultJson } from "@ai-matrx/chat/tool-call-visualization/result-fields/ResultJson";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import { JsonTreeViewer } from "@/components/official/json-explorer/JsonTreeViewer";
import RawJsonExplorer from "@/components/official/json-explorer/RawJsonExplorer";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { JsonViewer } from "@/components/ui/JsonComponents/JsonViewerComponent";
import { resetKindAtRawRendererReports } from "@/features/content-ir/surfaces/report-kind-at-raw-renderer";

const TIMELINE = { __kind: "timeline", title: "History", events: [{ year: 1900 }] };

function reportedBy(component: string): boolean {
  return mockCaptureError.mock.calls.some(
    ([input]) =>
      (input as { source: string; message: string }).source === "content-ir" &&
      (input as { message: string }).message.startsWith(component),
  );
}

describe("a kind is never drawn raw by the value grid or a JSON viewer", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    mockCaptureError.mockClear();
    resetKindAtRawRendererReports();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async (node: React.ReactElement) => {
    await act(async () => root.render(node));
  };
  const routes = () =>
    [...container.querySelectorAll("[data-kind-route]")].map((n) =>
      n.getAttribute("data-kind-route"),
    );

  it("ResultValue: a kind handed to the grid routes to its kind and files the caller", async () => {
    await render(<ResultValue value={TIMELINE} density="full" />);
    expect(routes()).toEqual(["timeline"]);
    expect(container.textContent).not.toContain('"__kind"');
    expect(reportedBy("ResultValue")).toBe(true);
  });

  it("ResultValue: a nested kind routes at any depth, even past the inline JSON-tree cap", async () => {
    const value = { a: { b: { c: { d: { report: TIMELINE } } } } };
    await render(<ResultValue value={value} density="inline" />);
    expect(routes()).toEqual(["timeline"]);
    expect(container.textContent).not.toContain('"__kind"');
    expect(reportedBy("ResultValue")).toBe(false);
  });

  it("ResultValue: a list of kinds renders each as its kind, never a table", async () => {
    await render(<ResultValue value={[TIMELINE, { ...TIMELINE, title: "Two" }]} density="full" />);
    expect(routes()).toEqual(["timeline", "timeline"]);
    expect(container.querySelector("table")).toBeNull();
  });

  it("ResultValue: a string that is kind JSON goes to the stream pipeline fenced", async () => {
    await render(<ResultValue value={{ answer: JSON.stringify(TIMELINE) }} density="full" />);
    const stream = container.querySelector("[data-markdown-stream]");
    expect(stream?.getAttribute("data-kind-fence")).toBe("1");
    expect(container.textContent).not.toContain('"__kind"');
  });

  // V3: prose before the kind used to make the string "plain text", drawn
  // raw in a <p whitespace-pre-wrap>.
  it.each([
    ["full, multi-line", "full", `Generated the set:\n${JSON.stringify(TIMELINE)}`],
    ["inline, multi-line", "inline", `Generated the set:\n${JSON.stringify(TIMELINE)}`],
    ["full, one short line", "full", 'Done: {"__kind":"timeline","events":[]}'],
    ["inline, one short line", "inline", 'Done: {"__kind":"timeline","events":[]}'],
  ] as const)(
    "ResultValue: a string with prose before a kind (%s) goes to the pipeline, never raw",
    async (_label, density, text) => {
      await render(<ResultValue value={text} density={density} />);
      expect(container.querySelector("[data-markdown-stream]")).not.toBeNull();
      expect(container.textContent).not.toContain('"__kind"');
    },
  );

  it("ResultValue: a kind inside an inline code span stays as written (quoted source)", async () => {
    await render(<ResultValue value={'Use `{"__kind":"timeline"}` to route it.'} density="full" />);
    expect(container.querySelector("[data-markdown-stream]")).toBeNull();
    expect(container.textContent).toContain('"__kind"');
  });

  it("KeyValueGrid: an object carrying its own kind is not a field list", async () => {
    await render(<KeyValueGrid value={TIMELINE} density="full" />);
    expect(routes()).toEqual(["timeline"]);
    expect(reportedBy("KeyValueGrid")).toBe(true);
  });

  it("StructuredValueView: a nested kind routes to its component instead of being stripped", async () => {
    await render(<StructuredValueView value={{ heading: "Doc", section: TIMELINE }} />);
    expect(routes()).toEqual(["timeline"]);
    expect(container.textContent).toContain("Doc");
    expect(container.textContent).not.toContain('"__kind"');
  });

  it("StructuredValueView: as the floor for its own root kind it renders the fields (no loop)", async () => {
    await render(<StructuredValueView value={TIMELINE} kind="timeline" />);
    expect(routes()).toEqual([]);
    expect(container.textContent).toContain("History");
    expect(container.textContent).not.toContain('"__kind"');
  });

  it.each([
    ["ResultJson", (show: boolean) => <ResultJson data={TIMELINE} showSource={show} />],
    ["JsonInspector", (show: boolean) => <JsonInspector data={TIMELINE} showSource={show} />],
    ["JsonTreeViewer", (show: boolean) => <JsonTreeViewer data={TIMELINE} showSource={show} />],
    ["RawJsonExplorer", (show: boolean) => <RawJsonExplorer pageData={TIMELINE} showSource={show} />],
    ["JsonViewer", (show: boolean) => <JsonViewer data={TIMELINE} showSource={show} initialExpanded />],
  ])("%s: kind data renders as its kind; showSource keeps the source", async (name, view) => {
    await render(view(false));
    expect(routes()).toEqual(["timeline"]);
    expect(container.textContent).not.toContain("__kind");
    expect(reportedBy(name)).toBe(true);

    await render(view(true));
    expect(routes()).toEqual([]);
    expect(container.textContent).toContain("__kind");
  });

  it.each([
    ["ResultValue", () => <ResultValue value={{ name: "Ada Lovelace" }} density="full" />],
    ["ResultJson", () => <ResultJson data={{ name: "Ada Lovelace" }} />],
    ["JsonTreeViewer", () => <JsonTreeViewer data={{ name: "Ada Lovelace" }} />],
    ["JsonViewer", () => <JsonViewer data={{ name: "Ada Lovelace" }} initialExpanded />],
  ])("%s: kindless JSON is still drawn as data", async (_name, view) => {
    await render(view());
    expect(routes()).toEqual([]);
    expect(container.textContent).toContain("Ada Lovelace");
    expect(
      mockCaptureError.mock.calls.some(
        ([input]) => (input as { source: string }).source === "content-ir",
      ),
    ).toBe(false);
  });
});
