import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";

jest.mock("@/components/agent-copy/AiCopyMenu", () => ({
  AiCopyMenu: ({
    variants,
    size,
    groomer,
    exportConfig,
    appearance,
  }: {
    variants: Array<{ id: string; label: string; build: () => unknown }>;
    size: "xs" | "icon" | "sm";
    groomer?: () => unknown;
    exportConfig?: { items: Array<{ id: string; label: string }> };
    appearance?: string;
  }) => (
    <div
      data-testid="ai-menu"
      data-size={size}
      data-has-groomer={String(groomer !== undefined)}
      data-export-count={String(exportConfig?.items.length ?? 0)}
      data-appearance={appearance}
    >
      <button type="button" aria-label="Mock unified copy menu" />
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
      <ol data-testid="export-items">
        {exportConfig?.items.map((item) => (
          <li key={item.id}>{item.label}</li>
        ))}
      </ol>
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
    ).toEqual(["Copy", "Errors", "Errors with prompt"]);
  });

  it("renders one icon-only top-level control at header size", () => {
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
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe("");
    expect(buttons[0]?.getAttribute("aria-label")).toBe(
      "Mock unified copy menu",
    );
    expect(
      [...container.querySelectorAll("[data-testid='ai-variants'] li")].map(
        (item) => item.textContent,
      ),
    ).toEqual(["Copy", "Copy for AI"]);
  });

  it("orders Copy, Copy JSON, and Copy for AI behind one control", () => {
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

    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(
      container
        .querySelector("[data-testid='ai-menu']")
        ?.getAttribute("data-size"),
    ).toBe("sm");
    expect(
      [...container.querySelectorAll("[data-testid='ai-variants'] li")].map(
        (item) => item.textContent,
      ),
    ).toEqual(["Copy", "Copy JSON", "Copy for AI"]);
    expect(
      container.querySelector("[data-testid='json-payload']")?.textContent,
    ).toBe('{\n  "node": "pillar",\n  "depth": 1\n}');
  });

  it("folds Copy, Copy-for-AI, and Export into one menu", () => {
    act(() => {
      root.render(
        <CopyButtons
          size="icon"
          label="Integrations"
          human="human list"
          agent="agent list"
          aiVariants={[{ id: "brief", label: "Brief", build: () => "brief" }]}
          export={{
            items: [
              {
                id: "json",
                label: "JSON",
                build: () => ({
                  content: "{}",
                  extension: "json",
                  mime: "application/json",
                }),
              },
            ],
          }}
        />,
      );
    });

    expect(container.querySelector("[data-copy-action-group]")).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(
      container
        .querySelector("[data-testid='ai-menu']")
        ?.getAttribute("data-export-count"),
    ).toBe("1");
    expect(
      [...container.querySelectorAll("[data-testid='ai-variants'] li")].map(
        (item) => item.textContent,
      ),
    ).toEqual(["Copy", "Copy for AI", "Brief"]);
  });

  it("hides Export without bringing back a second icon", () => {
    act(() => {
      root.render(
        <CopyButtons
          size="xs"
          label="Integration DeepWiki"
          human="human card"
          agent="agent card"
          hide={["export"]}
          export={{
            items: [
              {
                id: "json",
                label: "JSON",
                build: () => ({
                  content: "{}",
                  extension: "json",
                  mime: "application/json",
                }),
              },
            ],
          }}
        />,
      );
    });

    expect(container.querySelector("[data-copy-action-group]")).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(
      container
        .querySelector("[data-testid='ai-menu']")
        ?.getAttribute("data-export-count"),
    ).toBe("0");
  });

  it("passes bare chrome through to the one canonical trigger", () => {
    act(() => {
      root.render(
        <CopyButtons
          appearance="bare"
          size="xs"
          label="CRM activity"
          human="readable activity"
          agent="agent activity"
        />,
      );
    });

    expect(
      container
        .querySelector("[data-testid='ai-menu']")
        ?.getAttribute("data-appearance"),
    ).toBe("bare");
  });

  it("opens a caller-owned modal from an AI menu item instead of copying", () => {
    const onSelect = jest.fn();
    act(() => {
      root.render(
        <CopyButtons
          label="Chunks"
          human="human"
          agent="agent"
          aiVariants={[
            {
              id: "customize",
              label: "Customize…",
              onSelect,
            },
          ]}
        />,
      );
    });

    expect(
      [...container.querySelectorAll("[data-testid='ai-variants'] li")].map(
        (item) => item.textContent,
      ),
    ).toEqual(["Copy", "Copy for AI", "Customize…"]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("folds a whole-page Groomer into the same AI control", () => {
    act(() => {
      root.render(
        <CopyButtons
          size="sm"
          label="Content plan"
          human="human plan"
          agent="agent plan"
          groomer={() => ({
            label: "Content plan",
            kind: "content-plan",
            location: "Content plan",
            description: "The visible content plan.",
            sections: [],
          })}
        />,
      );
    });

    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(
      container
        .querySelector("[data-testid='ai-menu']")
        ?.getAttribute("data-has-groomer"),
    ).toBe("true");
  });
});
