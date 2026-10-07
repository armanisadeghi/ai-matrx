/** @jest-environment jsdom */
/**
 * A TOOL'S WHOLE RESULT IS AN ANSWER — a kind result takes the value door.
 *
 * `scope_system` returns `{ __kind: "scope_system_result", … }`. The generic
 * tool card and the full results tab handed that straight to `ResultValue`,
 * which drew it as its kind but filed the caller in the Error Inspector
 * (production, /notes, 2026-10-01 08:52Z). Every tool-call renderer now draws
 * `entry.result` through `ToolResultValue`: kind → `AnswerValueView` (the
 * kind's own component), anything else → the value grid.
 *
 * RED BEFORE GREEN: before the fix both renders reported `ResultValue`, and the
 * census found `<ResultValue value={entry.result}` in the renderers.
 */
import "@/__tests__/helpers/register-chat-host";
import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
import fs from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ToolLifecycleEntry } from "@ai-matrx/chat/agents/types/request.types";

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

registerChatUi({ CopyButtons: () => null });
jest.mock("@ai-matrx/media/react", () => ({ InlineMediaRef: () => null }));
const mockCaptureError = jest.fn();
jest.mock("@ai-matrx/chat/host/diagnostics", () => ({
  ...jest.requireActual("@ai-matrx/chat/host/diagnostics"),
  captureError: (input: unknown) => mockCaptureError(input),
}));
// The subject still reaches the app's Error Inspector through other host
// modules; both sinks share one mock so no capture escapes the assertions.


import { GenericRenderer } from "@ai-matrx/chat/tool-call-visualization/registry/GenericRenderer";
import { OutputView } from "@ai-matrx/chat/tool-call-visualization/components/ToolTabBodies";
import { resetKindAtRawRendererReports } from "@/features/content-ir/surfaces/report-kind-at-raw-renderer";

const SCOPE_RESULT = {
  __kind: "scope_system_result",
  context:
    "# Organization scopes\n- Client: Harbor Point Property Management\n- Region: Orange County",
  organization_id: "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f",
};

function entry(result: unknown): ToolLifecycleEntry {
  return {
    callId: "call_scope_1",
    toolName: "scope_system",
    displayName: "scope_system",
    status: "completed",
    arguments: { action: "overview" },
    startedAt: "2026-10-01T08:52:10Z",
    completedAt: "2026-10-01T08:52:12Z",
    latestMessage: null,
    latestData: null,
    result,
    resultPreview: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: [],
  };
}

function reportedRaw(): boolean {
  return mockCaptureError.mock.calls.some(
    ([input]) => (input as { source?: string }).source === "content-ir",
  );
}

describe("a kind tool result renders through the value door", () => {
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

  it("the generic tool card routes scope_system_result to its kind, reporting nothing", async () => {
    await render(<GenericRenderer entry={entry(SCOPE_RESULT)} />);
    expect(routes()).toEqual(["scope_system_result"]);
    expect(reportedRaw()).toBe(false);
    expect(container.textContent).not.toContain("__kind");
  });

  it("the full results tab routes it the same way", async () => {
    await render(<OutputView entry={entry(SCOPE_RESULT)} />);
    expect(routes()).toEqual(["scope_system_result"]);
    expect(reportedRaw()).toBe(false);
  });

  it("a kindless result still renders as data", async () => {
    await render(
      <GenericRenderer entry={entry({ applied: 2, organization_id: "884d1ce8" })} />,
    );
    expect(routes()).toEqual([]);
    expect(container.textContent).toContain("2");
    expect(reportedRaw()).toBe(false);
  });
});

describe("census: no tool-call renderer hands a whole result to the value grid", () => {
  const ROOT = path.resolve(__dirname, "../../../../aidream/apps/shared/chat/src/tool-call-visualization");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, name.name);
      if (name.isDirectory()) {
        if (name.name !== "__tests__") walk(full);
      } else if (/\.tsx?$/.test(name.name)) files.push(full);
    }
  };
  walk(ROOT);

  it("every `entry.result` reaches ResultValue only through ToolResultValue", () => {
    const offenders = files
      .filter((file) =>
        /<ResultValue\s+value=\{entry\.result\}/.test(fs.readFileSync(file, "utf8")),
      )
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
