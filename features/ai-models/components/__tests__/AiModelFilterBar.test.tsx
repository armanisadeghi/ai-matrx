import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import AiModelFilterBar from "../AiModelFilterBar";
import type { TabState } from "../../hooks/useTabUrlState";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function tabState(q: string): TabState {
  return {
    id: "all",
    label: "All Models",
    q,
    sort: "common_name",
    dir: "asc",
    page: 1,
    perPage: 25,
    filters: { is_deprecated: false },
  };
}

describe("AiModelFilterBar search focus", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  it("exposes the registry title as the page heading", () => {
    act(() =>
      root.render(
        <AiModelFilterBar
          tabState={tabState("")}
          totalCount={0}
          filteredCount={0}
          models={[]}
          onUpdateQ={() => undefined}
          onUpdateFilters={() => undefined}
          onClearAll={() => undefined}
          onCreate={() => undefined}
          onRefresh={() => undefined}
        />,
      ),
    );

    expect(container.querySelector("h1")?.textContent).toBe("AI Models");
  });

  it("keeps the focused draft and cursor owner during a URL-state refresh", () => {
    const onUpdateQ = jest.fn();
    const renderFilter = (q: string) => (
      <AiModelFilterBar
        tabState={tabState(q)}
        totalCount={0}
        filteredCount={0}
        models={[]}
        onUpdateQ={onUpdateQ}
        onUpdateFilters={() => undefined}
        onClearAll={() => undefined}
        onCreate={() => undefined}
        onRefresh={() => undefined}
      />
    );

    act(() => root.render(renderFilter("")));
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search AI models"]',
    );
    expect(input).not.toBeNull();
    if (!input) return;

    act(() => {
      input.focus();
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(input, "claude");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() => root.render(renderFilter("c")));

    expect(input.value).toBe("claude");
    expect(document.activeElement).toBe(input);
  });
});
