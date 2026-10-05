/**
 * Every item type reads well at far zoom and says its state.
 *
 * SUT: `BoardItemType.accent` / `.status` across `BOARD_ITEM_TYPES`, the
 * accent tokens in `components/board-accents.css`, and `OverviewCard` /
 * `StatusChip` (`components/TileFace.tsx`).
 * Breaks it catches: a type added with no colour (its far-zoom card falls back
 * to grey — the compiler requires the field, this pins it to a real token);
 * an accent with no light or no dark value (the card goes colourless in one
 * theme); a type that neither reports its status nor says why it has none; a
 * card that drops the type name, icon or title.
 */
import { readFileSync } from "fs";
import { join } from "path";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BOARD_ITEM_TYPES } from "../items/catalog";
import { BOARD_ACCENTS } from "../items/types";
import { OverviewCard, StatusChip } from "../components/TileFace";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(ui: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}
const textOf = (el: Element) => el.textContent ?? "";

const css = readFileSync(join(__dirname, "../components/board-accents.css"), "utf8");
const block = (selector: string) => {
  const m = css.match(new RegExp(`(^|\\n)${selector.replace(".", "\\.")} \\{([^}]*)\\}`));
  return m ? m[2] : "";
};

it.each(BOARD_ITEM_TYPES.map((t) => [t.key, t]))("%s has a board colour", (_key, type) => {
  expect(BOARD_ACCENTS).toContain(type.accent);
});

it.each(BOARD_ACCENTS.map((a) => [a]))("accent %s is defined for light and dark", (accent) => {
  expect(block(":root")).toContain(`--board-accent-${accent}:`);
  expect(block(".dark")).toContain(`--board-accent-${accent}:`);
});

it.each(BOARD_ITEM_TYPES.map((t) => [t.key, t]))("%s reports its status or says why it has none", (_key, type) => {
  if ("useStatus" in type.status) expect(typeof type.status.useStatus).toBe("function");
  else expect(type.status.none.trim().length).toBeGreaterThan(10);
});

it("the types that have a live state report it", () => {
  const reporting = BOARD_ITEM_TYPES.filter((t) => "useStatus" in t.status).map((t) => t.key);
  expect(reporting).toEqual(expect.arrayContaining(["chat", "note", "file", "task", "meeting", "workflow-run"]));
});

it.each(BOARD_ITEM_TYPES.map((t) => [t.key, t]))("%s far-zoom card shows its type, icon and title", (_key, type) => {
  const title = `Quarterly plan for ${type.label}`;
  const { container, unmount } = render(
    <div style={{ position: "relative", width: 640, height: 480 }}>
      <OverviewCard
        title={title}
        typeLabel={type.label}
        icon={type.icon}
        accent={type.accent}
        from={{ kind: "static", value: { status: "idle", progress: null } }}
        status={<StatusChip variant="face" status={{ tone: "active", label: "In progress" }} />}
      />
    </div>,
  );
  const face = container.querySelector<HTMLElement>("[data-board-overview]")!;
  expect(face).not.toBeNull();
  expect(face.style.getPropertyValue("--tile-accent")).toBe(`var(--board-accent-${type.accent})`);
  expect(textOf(face.querySelector(".board-face-kind")!)).toBe(type.label);
  expect(textOf(face.querySelector(".board-face-title")!)).toBe(title);
  expect(face.querySelector(".board-face-kind svg")).not.toBeNull();
  expect(textOf(face.querySelector("[data-board-status]")!)).toBe("In progress");
  unmount();
});

it("a danger status reads in the destructive tone; the selected card carries the ring hook", () => {
  const { container } = render(
    <OverviewCard
      title="Launch checklist"
      typeLabel="Task"
      accent="orange"
      selected
      from={{ kind: "static", value: { status: "idle", progress: null } }}
      status={<StatusChip variant="face" status={{ tone: "danger", label: "Overdue" }} />}
    />,
  );
  expect(container.querySelector("[data-board-overview]")!.hasAttribute("data-selected")).toBe(true);
  const chip = container.querySelector("[data-board-status='danger']")!;
  expect(chip.className).toContain("text-destructive");
  expect(chip.textContent).toBe("Overdue");
});
