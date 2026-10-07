/**
 * THE + IS TINTED ONLY BY WHAT WAS ADDED (Arman, 2026-10-07: "I don't know how
 * the + button become blue"). A new chat on Custom, with an organization
 * chosen, already counts as "customized", so the + sat blue on every fresh
 * chat. And the Chat Options window's section list was centred buttons.
 *
 * RED before: the trigger's tone read `rc.isCustomized`; the window's tabs
 * were `<Button>`s (centred content), not start-aligned rows.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

it("the + trigger's tint follows only the added count", () => {
  const menu = readFileSync(join(__dirname, "../RunControlsMenu.tsx"), "utf8");
  const tone = menu.match(/tone=\{([^}]*)\}/)?.[1] ?? "";
  expect(tone).toContain("rc.addedCount > 0");
  expect(tone).not.toContain("isCustomized");
});

it("the Chat Options window lists its sections as start-aligned rows", () => {
  const win = readFileSync(join(__dirname, "../../../../../window-panels/windows/agents/RunControlsWindow.tsx"), "utf8");
  const nav = win.slice(win.indexOf("<nav"), win.indexOf("</nav>"));
  expect(nav).toContain("<Tile");
  expect(nav).not.toContain("<Button");
});
