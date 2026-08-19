import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";

jest.mock("@/components/agent-copy/AiCopyMenu", () => ({
  AiCopyMenu: ({
    variants,
    size,
    groomer,
  }: {
    variants: Array<{ id: string; label: string; build: () => unknown }>;
    size: "xs" | "icon" | "sm";
    groomer?: () => unknown;
  }) => (
    <div
      data-testid="ai-menu"
      data-size={size}
      data-has-groomer={String(groomer !== undefined)}
    >
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

  it("renders Copy, Copy-for-AI, and Export as one even-width group", () => {
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

    expect(container.querySelector("[data-copy-action-group]")).not.toBeNull();
    const buttons = [
      ...container.querySelectorAll("[data-copy-action-group] button"),
    ];
    expect(buttons).toHaveLength(3);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Copy Integrations (human-readable)",
      "Mock Copy for AI menu",
      "Export Integrations",
    ]);
  });

  it("hides Export and still groups the remaining Copy + AI pair", () => {
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

    expect(container.querySelector("[data-copy-action-group]")).not.toBeNull();
    const buttons = [
      ...container.querySelectorAll("[data-copy-action-group] button"),
    ];
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Copy Integration DeepWiki (human-readable)",
      "Copy Integration DeepWiki for AI agent",
    ]);
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
    ).toEqual(["Customize…", "Everything"]);
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

    expect(container.querySelectorAll("button")).toHaveLength(2);
    expect(
      container
        .querySelector("[data-testid='ai-menu']")
        ?.getAttribute("data-has-groomer"),
    ).toBe("true");
  });
});
