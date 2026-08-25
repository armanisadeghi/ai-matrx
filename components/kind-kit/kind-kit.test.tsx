/**
 * kind-kit contract tests — the README promises, pinned.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SortableList } from "@/components/kind-kit/SortableList";
import { KindPanelGrid } from "@/components/kind-kit/KindPanelGrid";
import { KindPanel } from "@/components/kind-kit/KindPanel";
import { KindHeaderBar } from "@/components/kind-kit/KindHeaderBar";
import {
  StreamingSkeleton,
  streamList,
  streamText,
  useStreamingValue,
} from "@/components/kind-kit/StreamingSkeleton";
import { KeywordChip, TagList } from "@/components/kind-kit/TagList";
import {
  ALLOWED_IMPORTS_CONFIG,
  buildComponentScope,
  getDefaultImportsForKindComponents,
} from "@/features/agent-apps/utils/allowed-imports";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const KIT_PATHS = [
  "@/components/kind-kit/SortableList",
  "@/components/kind-kit/KindPanelGrid",
  "@/components/kind-kit/KindPanel",
  "@/components/kind-kit/KindHeaderBar",
  "@/components/kind-kit/StreamingSkeleton",
  "@/components/kind-kit/TagList",
];

function click(el: Element | null) {
  if (!el) throw new Error("element missing");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("kind-kit", () => {
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

  it("is on the compiler allowlist with explicit named exports, and in the kind-component default scope", () => {
    const paths = ALLOWED_IMPORTS_CONFIG.map((c) => c.path);
    for (const p of KIT_PATHS) expect(paths).toContain(p);
    const defaults = getDefaultImportsForKindComponents();
    for (const p of KIT_PATHS) expect(defaults).toContain(p);
    const scope = buildComponentScope(KIT_PATHS);
    expect(scope.SortableList).toBe(SortableList);
    expect(scope.KindPanelGrid).toBe(KindPanelGrid);
    expect(scope.KindPanel).toBe(KindPanel);
    expect(scope.KindHeaderBar).toBe(KindHeaderBar);
    expect(scope.StreamingSkeleton).toBe(StreamingSkeleton);
    expect(scope.useStreamingValue).toBe(useStreamingValue);
    expect(scope.streamList).toBe(streamList);
    expect(scope.streamText).toBe(streamText);
    expect(scope.KeywordChip).toBe(KeywordChip);
    expect(scope.TagList).toBe(TagList);
  });

  it("KeywordChip accepts both component and already-created element icons", () => {
    const TestIcon = ({ className }: { className?: string }) => (
      <svg data-testid="chip-icon" className={className} />
    );
    act(() => {
      root.render(
        <div>
          <KeywordChip label="component" icon={TestIcon} />
          <KeywordChip
            label="element"
            icon={<TestIcon className="authored-icon" />}
          />
        </div>,
      );
    });
    const icons = container.querySelectorAll('[data-testid="chip-icon"]');
    expect(icons).toHaveLength(2);
    expect(icons[1]?.getAttribute("class")).toContain("authored-icon");
  });

  it("SortableList reorders via the arrow fallback and removes via onRemove", () => {
    const onReorder = jest.fn();
    const onRemove = jest.fn();
    act(() => {
      root.render(
        <SortableList
          items={["a", "b", "c"]}
          onReorder={onReorder}
          onRemove={onRemove}
        />,
      );
    });
    const rows = container.querySelectorAll("li");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("a");
    // first row: "Move up" disabled, "Move down" moves a below b
    const up0 = rows[0]?.querySelector<HTMLButtonElement>(
      '[aria-label="Move up"]',
    );
    expect(up0?.disabled).toBe(true);
    click(rows[0]!.querySelector('[aria-label="Move down"]'));
    expect(onReorder).toHaveBeenCalledWith(["b", "a", "c"]);
    click(rows[2]!.querySelector('[aria-label="Remove"]'));
    expect(onRemove).toHaveBeenCalledWith("c", 2);
    // rows carry the displacement transition (the drag UX is CSS-translate based)
    expect(rows[0]?.className).toContain("transition-transform");
  });

  it("SortableList drop commits the pointer-derived landing slot", () => {
    const onReorder = jest.fn();
    act(() => {
      root.render(
        <SortableList
          items={[
            { id: "x", label: "X" },
            { id: "y", label: "Y" },
            { id: "z", label: "Z" },
          ]}
          onReorder={onReorder}
        />,
      );
    });
    const list = container.querySelector("ul")!;
    const rows = [...container.querySelectorAll("li")];
    // jsdom has no layout: give rows a fake vertical ruler (40px each, 4px gap).
    rows.forEach((li, i) => {
      li.getBoundingClientRect = () =>
        ({
          top: i * 44,
          bottom: i * 44 + 40,
          height: 40,
          left: 0,
          right: 100,
          width: 100,
          x: 0,
          y: i * 44,
          toJSON: () => ({}),
        }) as DOMRect;
    });
    list.getBoundingClientRect = () =>
      ({
        top: 0,
        bottom: 132,
        height: 132,
        left: 0,
        right: 100,
        width: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const dataTransfer = {
      effectAllowed: "",
      dropEffect: "",
      setData: jest.fn(),
    };
    const fire = (
      el: Element,
      type: string,
      init: Record<string, unknown> = {},
    ) =>
      act(() => {
        const ev = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(ev, { dataTransfer, ...init });
        el.dispatchEvent(ev);
      });

    // arm the handle of row 0, start the drag, hover the last slot, drop
    act(() => {
      rows[0]!
        .querySelector('[aria-label="Drag to reorder"]')!
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    fire(rows[0]!, "dragstart");
    fire(list, "dragover", { clientY: 100 }); // inside row 2's slot (88..128)
    // placeholder styling on the dragged row, displacement on the passed rows
    expect(container.querySelectorAll("li")[0]?.className).toContain(
      "border-dashed",
    );
    expect(
      (container.querySelectorAll("li")[1] as HTMLElement).style.transform,
    ).toContain("translate3d(0, -44px");
    fire(list, "drop");
    expect(onReorder).toHaveBeenCalledWith([
      { id: "y", label: "Y" },
      { id: "z", label: "Z" },
      { id: "x", label: "X" },
    ]);
  });

  it("KindPanel: title wraps, subline is its own full-width line, footer is pinned with mt-auto, menu absorbs controls", () => {
    act(() => {
      root.render(
        <KindPanel
          title="Child keywords"
          count={4}
          subline="Narrower phrases the page could fully answer."
          menuItems={[{ label: "Clear", onSelect: () => undefined }]}
          footer={<span data-testid="footer">add row</span>}
        >
          <span>body</span>
        </KindPanel>,
      );
    });
    const h3 = container.querySelector("h3")!;
    expect(h3.className).toContain("break-words");
    expect(h3.className).not.toContain("truncate");
    const header = container.querySelector("header")!;
    // the subline is NOT inside the header row
    expect(header.textContent).not.toContain("Narrower phrases");
    expect(container.textContent).toContain("Narrower phrases");
    const footer = container.querySelector(
      "[data-testid='footer']",
    )!.parentElement!;
    expect(footer.className).toContain("mt-auto");
    expect(
      container.querySelector('[aria-label="More actions"]'),
    ).not.toBeNull();
    expect(container.querySelector("section")!.className).toContain("flex-col");
  });

  it("KindPanelGrid is auto-fit with a min column width (never more columns than fit)", () => {
    act(() => {
      root.render(
        <KindPanelGrid minColumnWidth={300} maxColumns={3}>
          <div>a</div>
          <div>b</div>
        </KindPanelGrid>,
      );
    });
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toContain(
      "repeat(auto-fit, minmax(",
    );
    expect(grid.style.gridTemplateColumns).toContain("300px");
    expect(grid.style.gridTemplateColumns).toContain("/ 3");
    expect(grid.className).toContain("items-stretch");
  });

  it("KindHeaderBar renders title, stats and the copy bar", () => {
    act(() => {
      root.render(
        <KindHeaderBar
          title="project management software"
          stats={[{ label: "keywords", value: 12 }]}
          streaming
          copy={{ label: "Research", human: "x", json: { a: 1 } }}
        />,
      );
    });
    expect(container.textContent).toContain("project management software");
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("keywords");
    expect(container.textContent).toContain("Streaming");
    expect(container.querySelectorAll("button").length).toBeGreaterThan(0);
  });

  it("kind-kit icon slots accept component references and already-created elements", () => {
    function TestIcon({ className }: { className?: string }) {
      return <svg data-testid="component-icon" className={className} />;
    }
    act(() => {
      root.render(
        <div>
          <KindHeaderBar
            title="QME report"
            icon={
              <svg data-testid="header-element-icon" className="authored" />
            }
            stats={[
              { label: "component", value: 1, icon: TestIcon },
              {
                label: "element",
                value: 2,
                icon: (
                  <svg data-testid="stat-element-icon" className="authored" />
                ),
              },
            ]}
          />
          <KindPanel title="Component panel" icon={TestIcon} />
          <KindPanel
            title="Element panel"
            icon={<svg data-testid="panel-element-icon" className="authored" />}
          />
        </div>,
      );
    });
    expect(
      container.querySelector('[data-testid="header-element-icon"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="stat-element-icon"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="panel-element-icon"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('[data-testid="component-icon"]'),
    ).toHaveLength(2);
    expect(
      container
        .querySelector('[data-testid="stat-element-icon"]')
        ?.getAttribute("class"),
    ).toContain("text-muted-foreground");
    expect(
      container
        .querySelector('[data-testid="panel-element-icon"]')
        ?.getAttribute("class"),
    ).toContain("text-primary");
    expect(
      container
        .querySelector('[data-testid="panel-element-icon"]')
        ?.getAttribute("class"),
    ).toContain("authored");
  });

  it("unwraps module-wrapped icon components and rejects invalid objects", () => {
    function WrappedIcon({ className }: { className?: string }) {
      return <svg data-testid="wrapped-icon" className={className} />;
    }
    const moduleWrappedIcon = { default: WrappedIcon };
    const invalidIcon = { name: "not-a-component" };

    expect(() => {
      act(() => {
        root.render(
          <KindHeaderBar
            title="Coverage audit"
            stats={[
              {
                label: "wrapped",
                value: 1,
                icon: moduleWrappedIcon as unknown as React.ComponentType<{
                  className?: string;
                }>,
              },
              {
                label: "invalid",
                value: 2,
                icon: invalidIcon as unknown as React.ComponentType<{
                  className?: string;
                }>,
              },
            ]}
          />,
        );
      });
    }).not.toThrow();
    expect(
      container.querySelector('[data-testid="wrapped-icon"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("invalid");
  });

  it("TagList: chips wrap (never truncate), add/remove/edit/toggle wire through", () => {
    const onAdd = jest.fn();
    const onRemove = jest.fn();
    const onToggle = jest.fn();
    act(() => {
      root.render(
        <TagList
          items={["alpha", { label: "beta long phrase", meta: 3 }]}
          selected={["alpha"]}
          onToggle={onToggle}
          onRemove={onRemove}
          onEdit={() => undefined}
          onAdd={onAdd}
          addPlaceholder="Add keyword…"
        />,
      );
    });
    const chips = [...container.querySelectorAll("span.rounded-full")];
    expect(chips[0]?.className).toContain("max-w-full");
    expect(chips[0]?.querySelector(".break-words")).not.toBeNull();
    expect(container.textContent).not.toContain("…beta");
    click(container.querySelector('[aria-label="Deselect alpha"]'));
    expect(onToggle).toHaveBeenCalledWith("alpha", false);
    click(container.querySelector('[aria-label="Remove beta long phrase"]'));
    expect(onRemove).toHaveBeenCalledWith("beta long phrase", 1);
    expect(container.querySelector('[aria-label="Edit alpha"]')).not.toBeNull();
    // add: button → input → Enter
    click(
      [...container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Add keyword"),
      )!,
    );
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Add keyword…"]',
    )!;
    expect(input).not.toBeNull();
  });

  it("streaming helpers tolerate absent fields; useStreamingValue is sticky", () => {
    expect(streamList(undefined)).toEqual([]);
    expect(streamList([1, 2])).toEqual([1, 2]);
    expect(streamText(undefined, "fallback")).toBe("fallback");
    expect(streamText("", "fallback")).toBe("fallback");
    expect(streamText("ok")).toBe("ok");

    const seen: Array<{ value: string; arrived: boolean }> = [];
    function Probe({ v }: { v: string | undefined }) {
      const r = useStreamingValue(v, "—");
      seen.push(r);
      return <span>{r.value}</span>;
    }
    act(() => root.render(<Probe v={undefined} />));
    expect(container.textContent).toBe("—");
    act(() => root.render(<Probe v="hello" />));
    expect(container.textContent).toBe("hello");
    act(() => root.render(<Probe v={undefined} />)); // field dropped mid-stream
    expect(container.textContent).toBe("hello");
    expect(seen.at(-1)?.arrived).toBe(true);
  });

  it("StreamingSkeleton renders each layout without data", () => {
    for (const layout of ["list", "cards", "table", "text"] as const) {
      act(() => root.render(<StreamingSkeleton layout={layout} rows={2} />));
      expect(container.querySelector("[role='status']")).not.toBeNull();
      expect(
        container.querySelectorAll(".animate-pulse").length,
      ).toBeGreaterThan(0);
    }
  });
});
