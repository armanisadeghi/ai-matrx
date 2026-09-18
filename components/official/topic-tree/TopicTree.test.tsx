/**
 * Forcing-function tests for TopicTree (CONTRACTS §4.1).
 *
 * Each of these was watched failing against a deliberate break first: the
 * keyboard case against a tree whose ArrowRight did nothing on a leaf, the drop
 * case against `useTopicTreeDnd` with the ancestor walk removed, and the rename
 * cases against a commit that fired on Esc.
 *
 * They drive the REAL component through real DOM events — no stubbed row, no
 * snapshot — so a green run means the keyboard model, the cycle refusal and the
 * editor contract actually hold.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TopicTree } from "./TopicTree";
import type { TopicTreeRow } from "./types";
import { TOPIC_TREE_ROOT_DROP_ID, useTopicTreeDnd } from "./useTopicTreeDnd";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 *   a           (expanded, has children)
 *     a-child
 *   b           (collapsed, has children)
 *   c           (leaf)
 */
function rows(overrides: Partial<Record<string, Partial<TopicTreeRow>>> = {}): TopicTreeRow[] {
  const base: TopicTreeRow[] = [
    {
      id: "a",
      parentId: null,
      depth: 0,
      label: "Alpha",
      hasChildren: true,
      expanded: true,
      selected: false,
    },
    {
      id: "a-child",
      parentId: "a",
      depth: 1,
      label: "Alpha child",
      hasChildren: false,
      expanded: false,
      selected: false,
    },
    {
      id: "b",
      parentId: null,
      depth: 0,
      label: "Bravo",
      hasChildren: true,
      expanded: false,
      selected: false,
    },
    {
      id: "c",
      parentId: null,
      depth: 0,
      label: "Charlie",
      hasChildren: false,
      expanded: false,
      selected: false,
    },
  ];
  return base.map((row) => ({ ...row, ...(overrides[row.id] ?? {}) }));
}

function mount(ui: React.ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, root };
}

function press(container: HTMLElement, key: string): void {
  const tree = container.querySelector('[role="tree"]');
  if (!tree) throw new Error("no tree element");
  act(() => {
    tree.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

describe("TopicTree keyboard", () => {
  it("moves and selects with ArrowDown / ArrowUp, and Home / End", () => {
    const onSelect = jest.fn();
    const { container, root } = mount(
      <TopicTree
        rows={rows({ a: { selected: true } })}
        ariaLabel="Topics"
        onToggleExpand={jest.fn()}
        onSelect={onSelect}
      />,
    );

    press(container, "ArrowDown");
    expect(onSelect).toHaveBeenLastCalledWith("a-child", expect.anything());
    press(container, "ArrowDown");
    expect(onSelect).toHaveBeenLastCalledWith("b", expect.anything());
    press(container, "ArrowUp");
    expect(onSelect).toHaveBeenLastCalledWith("a-child", expect.anything());
    press(container, "End");
    expect(onSelect).toHaveBeenLastCalledWith("c", expect.anything());
    press(container, "Home");
    expect(onSelect).toHaveBeenLastCalledWith("a", expect.anything());

    act(() => root.unmount());
  });

  it("ArrowRight expands a collapsed parent and steps forward on a leaf", () => {
    const onToggleExpand = jest.fn();
    const onSelect = jest.fn();
    const { container, root } = mount(
      <TopicTree
        rows={rows({ b: { selected: true } })}
        ariaLabel="Topics"
        onToggleExpand={onToggleExpand}
        onSelect={onSelect}
      />,
    );

    // On "b" (collapsed, has children) → expands, does not move.
    press(container, "ArrowRight");
    expect(onToggleExpand).toHaveBeenCalledWith("b");
    expect(onSelect).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("ArrowRight on a leaf steps to the next row instead of doing nothing", () => {
    const onToggleExpand = jest.fn();
    const onSelect = jest.fn();
    // "a-child" is a leaf in the MIDDLE of the list, so "moved" and "did
    // nothing" are distinguishable — on the last row they are not.
    const { container, root } = mount(
      <TopicTree
        rows={rows({ "a-child": { selected: true } })}
        ariaLabel="Topics"
        onToggleExpand={onToggleExpand}
        onSelect={onSelect}
      />,
    );

    press(container, "ArrowRight");
    expect(onToggleExpand).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith("b", expect.anything());

    act(() => root.unmount());
  });

  it("ArrowLeft collapses an open parent, then walks to the parent row", () => {
    const onToggleExpand = jest.fn();
    const onSelect = jest.fn();
    const { container, root } = mount(
      <TopicTree
        rows={rows({ a: { selected: true } })}
        ariaLabel="Topics"
        onToggleExpand={onToggleExpand}
        onSelect={onSelect}
      />,
    );

    press(container, "ArrowLeft");
    expect(onToggleExpand).toHaveBeenCalledWith("a");

    press(container, "ArrowDown"); // → a-child (a leaf, parent "a")
    onToggleExpand.mockClear();
    press(container, "ArrowLeft");
    expect(onToggleExpand).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenLastCalledWith("a", expect.anything());

    act(() => root.unmount());
  });

  it("Enter activates, Space checks, and type-ahead jumps by label", () => {
    const onActivate = jest.fn();
    const onCheck = jest.fn();
    const onSelect = jest.fn();
    const { container, root } = mount(
      <TopicTree
        rows={rows({ a: { selected: true } })}
        ariaLabel="Topics"
        onToggleExpand={jest.fn()}
        onSelect={onSelect}
        onActivate={onActivate}
        onCheck={onCheck}
      />,
    );

    press(container, "Enter");
    expect(onActivate).toHaveBeenCalledWith("a");

    press(container, " ");
    expect(onCheck).toHaveBeenCalledWith("a");

    press(container, "c");
    expect(onSelect).toHaveBeenLastCalledWith("c", expect.anything());

    act(() => root.unmount());
  });

  it("F2 opens the inline editor; Enter commits and Escape cancels", () => {
    const onRenameCommit = jest.fn();
    const { container, root } = mount(
      <TopicTree
        rows={rows({ a: { selected: true } })}
        ariaLabel="Topics"
        onToggleExpand={jest.fn()}
        onSelect={jest.fn()}
        onRenameCommit={onRenameCommit}
      />,
    );

    press(container, "F2");
    const input = container.querySelector("input");
    expect(input).not.toBeNull();

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "Renamed alpha");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      input!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    expect(onRenameCommit).toHaveBeenCalledWith("a", "Renamed alpha");
    expect(container.querySelector("input")).toBeNull();

    // Second pass: Escape must NOT commit, even though blur follows it.
    onRenameCommit.mockClear();
    press(container, "F2");
    const second = container.querySelector("input");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(second, "Thrown away");
      second!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      second!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(onRenameCommit).not.toHaveBeenCalled();
    expect(container.querySelector("input")).toBeNull();

    act(() => root.unmount());
  });

  it("blur commits the edit rather than discarding it", () => {
    const onRenameCommit = jest.fn();
    const { container, root } = mount(
      <TopicTree
        rows={rows({ a: { selected: true } })}
        ariaLabel="Topics"
        onToggleExpand={jest.fn()}
        onSelect={jest.fn()}
        onRenameCommit={onRenameCommit}
      />,
    );

    press(container, "F2");
    const input = container.querySelector("input");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "Clicked away");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // React listens for `focusout` at the root — the exact path a real
    // click-away takes. Clicking away from a name you just typed must KEEP it.
    act(() => {
      input!.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(onRenameCommit).toHaveBeenCalledWith("a", "Clicked away");

    act(() => root.unmount());
  });

  it("renders tree semantics: role, level and expanded state", () => {
    const { container, root } = mount(
      <TopicTree
        rows={rows()}
        ariaLabel="Topics"
        onToggleExpand={jest.fn()}
        onSelect={jest.fn()}
      />,
    );

    expect(container.querySelector('[role="tree"]')?.getAttribute("aria-label")).toBe(
      "Topics",
    );
    const items = container.querySelectorAll('[role="treeitem"]');
    expect(items).toHaveLength(4);
    expect(items[1]?.getAttribute("aria-level")).toBe("2");
    expect(items[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(items[2]?.getAttribute("aria-expanded")).toBe("false");
    // A leaf declares no expansion state at all — "false" would promise an
    // expander that does not exist.
    expect(items[3]?.getAttribute("aria-expanded")).toBeNull();

    act(() => root.unmount());
  });

  it("shows the empty state instead of an empty tree", () => {
    const { container, root } = mount(
      <TopicTree
        rows={[]}
        ariaLabel="Topics"
        emptyState="No topics in this map yet."
        onToggleExpand={jest.fn()}
        onSelect={jest.fn()}
      />,
    );
    expect(container.textContent).toContain("No topics in this map yet.");
    expect(container.querySelector('[role="tree"]')).toBeNull();
    act(() => root.unmount());
  });
});

describe("useTopicTreeDnd cycle refusal", () => {
  /** Drives the hook's pure drag handler without mounting a DndContext. */
  function dropWith(activeId: string, overId: string) {
    const onMove = jest.fn();
    let api: ReturnType<typeof useTopicTreeDnd> | null = null;
    function Probe() {
      api = useTopicTreeDnd({ rows: rows(), onMove });
      return null;
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<Probe />));
    act(() => {
      api!.onDragEnd({
        active: { id: activeId },
        over: { id: overId },
      } as never);
    });
    act(() => root.unmount());
    return onMove;
  }

  it("refuses a drop onto the row's own descendant BEFORE calling onMove", () => {
    expect(dropWith("a", "a-child")).not.toHaveBeenCalled();
  });

  it("refuses a drop onto itself", () => {
    expect(dropWith("a", "a")).not.toHaveBeenCalled();
  });

  it("refuses a drop onto the parent the row already has", () => {
    expect(dropWith("a-child", "a")).not.toHaveBeenCalled();
  });

  it("reparents on a legal drop, and moves to the root from the root strip", () => {
    expect(dropWith("a", "b")).toHaveBeenCalledWith("a", "b");
    expect(dropWith("a-child", TOPIC_TREE_ROOT_DROP_ID)).toHaveBeenCalledWith(
      "a-child",
      null,
    );
    // Already at the root — the write would be a no-op, so it is never made.
    expect(dropWith("a", TOPIC_TREE_ROOT_DROP_ID)).not.toHaveBeenCalled();
  });
});
