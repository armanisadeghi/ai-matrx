import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AiCopyMenu } from "@/components/agent-copy/AiCopyMenu";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("AiCopyMenu chrome", () => {
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

  it("keeps the sm single action icon-only", () => {
    act(() => {
      root.render(
        <AiCopyMenu
          size="sm"
          label="Plan tree"
          variants={[
            {
              id: "everything",
              label: "Everything",
              build: () => "agent tree",
            },
          ]}
        />,
      );
    });

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("");
    expect(button?.getAttribute("aria-label")).toBe("Copy Plan tree for AI");
  });
});
