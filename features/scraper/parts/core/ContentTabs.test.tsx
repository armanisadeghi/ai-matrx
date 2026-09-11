import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Tabs } from "@/components/ui/tabs";
import ContentTabs from "./ContentTabs";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("ContentTabs", () => {
  it("keeps every wide-strip tab reachable and every phone control touch-sized", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <Tabs value="pretty" onValueChange={jest.fn()}>
          <ContentTabs activeTab="pretty" setActiveTab={jest.fn()} />
        </Tabs>,
      );
    });

    const tabList = container.querySelector<HTMLElement>('[role="tablist"]');
    const tabs = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ];
    const scrollButtons = [
      ...container.querySelectorAll<HTMLButtonElement>(
        'button[aria-label^="Scroll "]',
      ),
    ];

    expect(tabList).not.toBeNull();
    expect(tabList?.classList).toContain("justify-start");
    expect(tabs).toHaveLength(17);
    expect(tabs.map((tab) => tab.textContent)).toEqual(
      expect.arrayContaining([
        "Pretty",
        "Reader",
        "Content",
        "Fact-Check",
        "Keywords",
      ]),
    );
    expect(tabs.every((tab) => tab.classList.contains("min-h-11"))).toBe(true);
    expect(scrollButtons).toHaveLength(2);
    expect(
      scrollButtons.every(
        (button) =>
          button.classList.contains("h-11") &&
          button.classList.contains("w-11"),
      ),
    ).toBe(true);

    act(() => root.unmount());
  });
});
