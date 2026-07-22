import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () =>
    function DynamicStub() {
      return React.createElement("div", { "data-testid": "dynamic-stub" });
    },
}));

jest.mock("@/components/ui/tooltip", () => ({
  __esModule: true,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("span", null, children),
}));

jest.mock(
  "@/features/canvas/materialization/CodeBlockWithContextAttach",
  () => ({
    __esModule: true,
    CodeBlockWithContextAttach: ({
      headerLeftSlot,
    }: {
      headerLeftSlot?: React.ReactNode;
    }) => React.createElement("div", null, headerLeftSlot),
  }),
);

import { JsonBlock } from "./JsonBlock";

function renderJsonBlock(content: string): HTMLElement {
  document.body.innerHTML = renderToStaticMarkup(
    <JsonBlock content={content} isStreamActive />,
  );
  return document.body;
}

describe("JsonBlock canonical streaming toolbar", () => {
  it("keeps every JSON capability available when streaming content is valid", () => {
    const root = renderJsonBlock(
      JSON.stringify({ rows: [{ name: "Ada", role: "Engineer" }] }, null, 2),
    );

    for (const label of ["Code", "Tree", "Table", "Path"]) {
      const button = root.querySelector<HTMLButtonElement>(
        `[aria-label="${label} view"]`,
      );
      expect(button).not.toBeNull();
      expect(button?.disabled).toBe(false);
      expect(button?.textContent).toBe("");
    }

    const compact = root.querySelector<HTMLButtonElement>(
      '[aria-label="Compact JSON"]',
    );
    expect(compact).not.toBeNull();
    expect(compact?.disabled).toBe(false);
  });

  it("keeps the same toolbar mounted while streaming JSON is incomplete", () => {
    const root = renderJsonBlock('{"rows": [{"name": "Ada"');

    expect(
      root.querySelector<HTMLButtonElement>('[aria-label="Code view"]')
        ?.disabled,
    ).toBe(false);

    for (const label of ["Tree", "Table", "Path"]) {
      expect(
        root.querySelector<HTMLButtonElement>(`[aria-label="${label} view"]`)
          ?.disabled,
      ).toBe(true);
    }

    expect(
      root.querySelector<HTMLButtonElement>('[aria-label="Compact JSON"]')
        ?.disabled,
    ).toBe(true);
  });
});
