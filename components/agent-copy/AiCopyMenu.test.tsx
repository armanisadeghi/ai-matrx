import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AiCopyMenu } from "@/components/agent-copy/AiCopyMenu";

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
}));

jest.mock("@/components/agent-copy/AgentCopyGroomerHost", () => ({
  AgentCopyGroomerHost: ({
    open,
    config,
  }: {
    open: boolean;
    config: { label: string } | null;
  }) => (
    <div
      data-testid="groomer-host"
      data-open={String(open)}
      data-label={config?.label ?? ""}
    />
  ),
}));

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

  it("opens a caller-owned modal from a menu item instead of copying", () => {
    const onSelect = jest.fn();
    act(() => {
      root.render(
        <AiCopyMenu
          size="icon"
          label="Chunks"
          variants={[
            { id: "everything", label: "Everything", build: () => "payload" },
            { id: "customize", label: "Customize…", onSelect },
          ]}
        />,
      );
    });

    const customize = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Customize…"),
    );
    expect(customize).toBeDefined();
    act(() => customize?.click());
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("offers one Customize option and resolves the Groomer config on selection", () => {
    const getGroomerConfig = jest.fn(() => ({
      label: "Content plan",
      kind: "content-plan",
      location: "Content plan",
      description: "The visible content plan.",
      sections: [],
    }));

    act(() => {
      root.render(
        <AiCopyMenu
          size="sm"
          label="Content plan"
          variants={[
            {
              id: "everything",
              label: "Everything",
              build: () => "agent plan",
            },
          ]}
          groomer={getGroomerConfig}
        />,
      );
    });

    expect(getGroomerConfig).not.toHaveBeenCalled();
    const customize = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Customize…"),
    );
    expect(customize).toBeDefined();

    act(() => customize?.click());

    expect(getGroomerConfig).toHaveBeenCalledTimes(1);
    expect(
      container
        .querySelector("[data-testid='groomer-host']")
        ?.getAttribute("data-open"),
    ).toBe("true");
    expect(
      container
        .querySelector("[data-testid='groomer-host']")
        ?.getAttribute("data-label"),
    ).toBe("Content plan");
  });
});
