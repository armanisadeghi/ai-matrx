import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";

jest.mock("@/components/agent-copy/AiCopyMenu", () => ({
  AiCopyMenu: ({
    variants,
    size,
  }: {
    variants: Array<{ id: string; label: string; build: () => unknown }>;
    size: "xs" | "icon" | "sm";
  }) => (
    <div data-testid="ai-menu" data-size={size}>
      <button type="button" aria-label="Mock Copy for AI menu" />
      <ol data-testid="ai-variants">
        {variants.map((variant) => (
          <li key={variant.id}>{variant.label}</li>
        ))}
      </ol>
      <output data-testid="json-payload">
        {String(
          variants.find((variant) => variant.id === "json")?.build() ?? "",
        )}
      </output>
    </div>
  ),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("CopyButtons AI variants", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("can precisely label and place the faithful payload before derived variants", () => {
    act(() => {
      root.render(
        <CopyButtons
          label="Captured errors"
          human="errors"
          agent="faithful error payload"
          agentVariant={{ label: "Errors", position: "first" }}
          aiVariants={[
            {
              id: "errors-with-prompt",
              label: "Errors with prompt",
              build: () => "prompt plus faithful error payload",
            },
          ]}
        />,
      );
    });

    expect(
      [...container.querySelectorAll("[data-testid='ai-variants'] li")].map(
        (item) => item.textContent,
      ),
    ).toEqual(["Errors", "Errors with prompt"]);
  });

  it("renders exactly two icon-only top-level controls at header size", () => {
    act(() => {
      root.render(
        <CopyButtons
          size="sm"
          label="Plan tree"
          human="human tree"
          agent="agent tree"
        />,
      );
    });

    const buttons = [...container.querySelectorAll("button")];
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.textContent)).toEqual(["", ""]);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Copy Plan tree (human-readable)",
      "Copy Plan tree for AI agent",
    ]);
  });

  it("moves pretty-printed JSON into the AI dropdown without adding a third control", () => {
    act(() => {
      root.render(
        <CopyButtons
          size="sm"
          label="Plan tree"
          human="human tree"
          agent="agent tree"
          json={{ node: "pillar", depth: 1 }}
        />,
      );
    });

    expect(container.querySelectorAll("button")).toHaveLength(2);
    expect(
      container
        .querySelector("[data-testid='ai-menu']")
        ?.getAttribute("data-size"),
    ).toBe("sm");
    expect(
      [...container.querySelectorAll("[data-testid='ai-variants'] li")].map(
        (item) => item.textContent,
      ),
    ).toEqual(["JSON", "Everything"]);
    expect(
      container.querySelector("[data-testid='json-payload']")?.textContent,
    ).toBe('{\n  "node": "pillar",\n  "depth": 1\n}');
  });
});
