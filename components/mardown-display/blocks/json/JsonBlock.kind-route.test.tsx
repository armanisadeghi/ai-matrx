/**
 * C4 — the JSON code card never draws a SETTLED kind. Its content routes
 * through the one value door (`AnswerValueView` → `KindInstanceRender`); the
 * escaped-kind tripwire still fires; kindless JSON, a still-streaming buffer
 * and a deliberate kind-JSON surface (`allowConvertToShape={false}`) keep the
 * code card.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () =>
    function DynamicStub() {
      return React.createElement("div", { "data-testid": "dynamic-stub" });
    },
}));
jest.mock("@/features/overlays/openers/convertToShapeWindow", () => ({
  useOpenConvertToShapeWindow: () => jest.fn(),
}));
jest.mock("@/components/ui/tooltip", () => ({
  __esModule: true,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("span", null, children),
}));
jest.mock("@/features/canvas/materialization/CodeBlockWithContextAttach", () => ({
  __esModule: true,
  CodeBlockWithContextAttach: ({ code, showSource }: { code: string; showSource?: boolean }) =>
    React.createElement(
      "pre",
      { "data-code-card": "1", "data-show-source": showSource ? "yes" : "no" },
      code,
    ),
}));
jest.mock("@/features/content-ir/studio/components/KindInstanceRender", () => ({
  __esModule: true,
  default: ({ kind }: { kind: string }) =>
    React.createElement("div", { "data-kind-route": kind }),
}));
jest.mock("@ai-matrx/rich-content/kinds/react/KindEscapedNotice", () => ({
  __esModule: true,
  default: ({ rendered }: { rendered?: boolean }) =>
    React.createElement("div", {
      "data-escaped-notice": rendered ? "rendered" : "raw",
    }),
}));

import { JsonBlock } from "@ai-matrx/rich-content/display/blocks/json/JsonBlock";

const KIND = JSON.stringify(
  { __kind: "flashcard_set", title: "Cells", cards: [{ front: "A", back: "B" }] },
  null,
  2,
);
const KINDLESS = JSON.stringify({ name: "Ada", role: "Engineer" }, null, 2);

/** Mount, let the kind front door's lazy edge resolve, return the markup. */
async function html(node: React.ReactElement): Promise<string> {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(node));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const out = container.innerHTML;
  act(() => root.unmount());
  return out;
}

describe("JsonBlock settled kind route", () => {
  it("draws a settled kind as its kind, never the code card", async () => {
    const out = await html(<JsonBlock content={KIND} />);
    expect(out).toContain('data-kind-route="flashcard_set"');
    expect(out).not.toContain("data-code-card");
    expect(out).not.toContain("__kind");
    // The tripwire still runs — told the value is drawn, so it only names an
    // unregistered slug and reports a registered one.
    expect(out).toContain('data-escaped-notice="rendered"');
  });

  it("keeps kindless JSON as JSON", async () => {
    const out = await html(<JsonBlock content={KINDLESS} />);
    expect(out).toContain("data-code-card");
    expect(out).not.toContain("data-kind-route");
  });

  it("leaves a still-streaming buffer to the block router", async () => {
    const out = await html(<JsonBlock content={KIND} isStreamActive />);
    expect(out).not.toContain("data-kind-route");
  });

  it("keeps the code card where kind JSON is shown on purpose", async () => {
    const out = await html(<JsonBlock content={KIND} allowConvertToShape={false} />);
    expect(out).toContain("data-code-card");
    expect(out).not.toContain("data-kind-route");
  });

  // H4 (round 5): the card is whitelisted as a source view (`showSource`)
  // only when its content is genuinely kindless — so a regression that routes
  // a kind into the card is reported by the leak sentinel and the frame judge.
  it("whitelists kindless JSON as source", async () => {
    const out = await html(<JsonBlock content={KINDLESS} />);
    expect(out).toContain('data-show-source="yes"');
  });

  it("never whitelists a card holding a kind: settled broken kind JSON", async () => {
    const out = await html(<JsonBlock content={'{"__kind":"flashcard_set","cards":[{"front":'} />);
    expect(out).toContain("data-code-card");
    expect(out).toContain('data-show-source="no"');
  });

  it("never whitelists a card holding a kind: a streaming kind buffer", async () => {
    const out = await html(<JsonBlock content={KIND} isStreamActive />);
    expect(out).toContain('data-show-source="no"');
  });

  it("whitelists kind JSON on a deliberate kind-JSON surface", async () => {
    const out = await html(<JsonBlock content={KIND} allowConvertToShape={false} />);
    expect(out).toContain('data-show-source="yes"');
  });
});
