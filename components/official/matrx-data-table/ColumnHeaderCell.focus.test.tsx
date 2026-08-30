import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ColumnHeaderCell } from "./ColumnHeaderCell";
import type { ResolvedFilterKind } from "./infer-filter";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub;
HTMLElement.prototype.scrollIntoView = jest.fn();

describe("ColumnHeaderCell filter focus", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body
      .querySelectorAll("[data-radix-popper-content-wrapper]")
      .forEach((node) => node.remove());
  });

  it.each([
    ["text", "Contains…"],
    ["select", "Search options…"],
    ["number", "min"],
  ] as const)(
    "focuses the first %s filter input when opened",
    async (kind, placeholder) => {
      await act(async () => {
        root.render(
          <ColumnHeaderCell
            label="Name"
            labelText="Name"
            sortable
            isSorted={false}
            sortDirection="asc"
            onSortAsc={jest.fn()}
            onSortDesc={jest.fn()}
            onClearSort={jest.fn()}
            onHeaderSortClick={jest.fn()}
            filterKind={kind as ResolvedFilterKind}
            filterValue={undefined}
            onFilterChange={jest.fn()}
            selectOptions={[{ value: "alpha", label: "Alpha" }]}
          />,
        );
      });

      const trigger = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Sort or filter Name"]',
      );
      expect(trigger).not.toBeNull();

      await act(async () => trigger?.click());

      const input = document.body.querySelector<HTMLInputElement>(
        `input[placeholder="${placeholder}"]`,
      );
      expect(input).not.toBeNull();
      expect(document.activeElement).toBe(input);
    },
  );
});
