import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";

jest.mock("@/components/agent-copy/AiCopyMenu", () => ({
  AiCopyMenu: ({
    variants,
  }: {
    variants: Array<{ id: string; label: string }>;
  }) => (
    <ol data-testid="ai-variants">
      {variants.map((variant) => (
        <li key={variant.id}>{variant.label}</li>
      ))}
    </ol>
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
});
