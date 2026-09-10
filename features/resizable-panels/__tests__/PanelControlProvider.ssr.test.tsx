/**
 * @jest-environment node
 */
/**
 * Claim C — the SERVER paint of a cookie-collapsed panel.
 *
 * SUT: PanelControlProvider's initial collapsed state as rendered by
 * react-dom/server (no DOM, no effects — exactly what the browser paints
 * before hydration). Break named: the provider starts with no collapsed
 * panels, so a layout cookie that holds the sidebar at 0% paints the "Hide"
 * (open) icon and a draggable Handle beside a shut column.
 */
import { renderToString } from "react-dom/server";
import type { Layout } from "react-resizable-panels";
import { TasksShapedShell } from "./TasksShapedShell";

const COOKIE_SIDEBAR_COLLAPSED: Layout = { sidebar: 0, list: 16, editor: 84 };

// Passed as a variable so this file still compiles against a provider that has
// no such prop — the red must be an assertion, not a type error.
const seed = { initialLayouts: [COOKIE_SIDEBAR_COLLAPSED] };

function serverPaint() {
  return renderToString(
    <TasksShapedShell defaultLayout={COOKIE_SIDEBAR_COLLAPSED} providerProps={seed} />,
  );
}

describe("server paint of a cookie-collapsed sidebar", () => {
  it("paints the sidebar toggle as collapsed ('Show sidebar')", () => {
    expect(serverPaint()).toContain("Show sidebar");
  });

  it("paints no draggable Handle beside the collapsed sidebar (only the list's Handle)", () => {
    expect(serverPaint().match(/role="separator"/g) ?? []).toHaveLength(1);
  });
});
