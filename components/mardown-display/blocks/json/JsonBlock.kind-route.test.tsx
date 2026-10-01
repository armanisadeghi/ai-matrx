/**
 * C4 — the JSON code card never draws a SETTLED kind. Its content routes
 * through the one value door (`AnswerValueView` → `KindInstanceRender`); the
 * escaped-kind tripwire still fires; kindless JSON, a still-streaming buffer
 * and a deliberate kind-JSON surface (`allowConvertToShape={false}`) keep the
 * code card.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
  CodeBlockWithContextAttach: ({ code }: { code: string }) =>
    React.createElement("pre", { "data-code-card": "1" }, code),
}));
jest.mock("@/features/content-ir/studio/components/KindInstanceRender", () => ({
  __esModule: true,
  default: ({ kind }: { kind: string }) =>
    React.createElement("div", { "data-kind-route": kind }),
}));
jest.mock("@/features/content-ir/react/KindEscapedNotice", () => ({
  __esModule: true,
  default: ({ rendered }: { rendered?: boolean }) =>
    React.createElement("div", {
      "data-escaped-notice": rendered ? "rendered" : "raw",
    }),
}));

import { JsonBlock } from "./JsonBlock";

const KIND = JSON.stringify(
  { __kind: "flashcard_set", title: "Cells", cards: [{ front: "A", back: "B" }] },
  null,
  2,
);
const KINDLESS = JSON.stringify({ name: "Ada", role: "Engineer" }, null, 2);

function html(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("JsonBlock settled kind route", () => {
  it("draws a settled kind as its kind, never the code card", () => {
    const out = html(<JsonBlock content={KIND} />);
    expect(out).toContain('data-kind-route="flashcard_set"');
    expect(out).not.toContain("data-code-card");
    expect(out).not.toContain("__kind");
    // The tripwire still runs — told the value is drawn, so it only names an
    // unregistered slug and reports a registered one.
    expect(out).toContain('data-escaped-notice="rendered"');
  });

  it("keeps kindless JSON as JSON", () => {
    const out = html(<JsonBlock content={KINDLESS} />);
    expect(out).toContain("data-code-card");
    expect(out).not.toContain("data-kind-route");
  });

  it("leaves a still-streaming buffer to the block router", () => {
    const out = html(<JsonBlock content={KIND} isStreamActive />);
    expect(out).not.toContain("data-kind-route");
  });

  it("keeps the code card where kind JSON is shown on purpose", () => {
    const out = html(<JsonBlock content={KIND} allowConvertToShape={false} />);
    expect(out).toContain("data-code-card");
    expect(out).not.toContain("data-kind-route");
  });
});
