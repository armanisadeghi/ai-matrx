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

/**
 * The main-axis size a panel's server-rendered inline style gives it. The
 * library writes flex-grow = layout % for a panel it has a layout entry for,
 * and flex-basis = defaultSize (no flex-grow) for one it does not.
 */
function serverPanelSize(
  html: string,
  panelId: string,
): { grow: string | null; basis: string | null } {
  const tag = html.match(
    new RegExp(`<div(?=[^>]*\\bdata-panel="true")(?=[^>]*\\bid="${panelId}")[^>]*>`),
  )?.[0];
  const style = tag?.match(/style="([^"]*)"/)?.[1];
  if (!style) throw new Error(`panel "${panelId}" has no server-rendered style`);
  const decl = Object.fromEntries(
    style
      .split(";")
      .filter(Boolean)
      .map((d) => [d.slice(0, d.indexOf(":")), d.slice(d.indexOf(":") + 1)]),
  );
  return { grow: decl["flex-grow"] ?? null, basis: decl["flex-basis"] ?? null };
}

/**
 * Break named: the library treats a saved 0 as a missing layout entry on the
 * server and falls back to flex-basis: defaultSize, so a cookie-collapsed
 * column paints OPEN at its defaultSize and snaps shut after hydration.
 */
describe("server paint of a cookie-collapsed column's WIDTH", () => {
  it.each<[string, Layout, Record<"sidebar" | "list", ReturnType<typeof serverPanelSize>>]>([
    [
      "sidebar",
      { sidebar: 0, list: 16, editor: 84 },
      { sidebar: { grow: null, basis: "0%" }, list: { grow: "16", basis: "0" } },
    ],
    [
      "list",
      { sidebar: 20, list: 0, editor: 80 },
      { sidebar: { grow: "20", basis: "0" }, list: { grow: null, basis: "0%" } },
    ],
  ])("paints the cookie-collapsed %s at 0 width and the open column at its cookie size", (_name, cookie, expected) => {
    const html = renderToString(
      <TasksShapedShell defaultLayout={cookie} providerProps={{ initialLayouts: [cookie] }} />,
    );
    expect({
      sidebar: serverPanelSize(html, "sidebar"),
      list: serverPanelSize(html, "list"),
    }).toEqual(expected);
  });
});

describe("server paint of a cookie-collapsed sidebar", () => {
  it("paints the sidebar toggle as collapsed ('Show sidebar')", () => {
    expect(serverPaint()).toContain("Show sidebar");
  });

  it("paints no draggable Handle beside the collapsed sidebar (only the list's Handle)", () => {
    expect(serverPaint().match(/role="separator"/g) ?? []).toHaveLength(1);
  });
});
