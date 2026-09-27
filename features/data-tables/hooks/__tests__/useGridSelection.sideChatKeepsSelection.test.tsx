/**
 * THE SIDE CHAT IS NOT "OFF THE TABLE" (merged-grid review 2, fix lane F).
 *
 * A person selects a cell, then opens the page's agents (the shell header's "Agents for this page")
 * or types in an agent window to ask about THAT cell. The older grid's click-away rule let go on
 * those presses, so the agent was told no cell was selected. The shell marks its agent launcher
 * `GRID_COMPANION_ATTR` and every host window is a floating layer (`data-matrx-floating-layer`);
 * a press on either keeps the selection. A press anywhere else (the page header) still lets go.
 */
import { renderHook } from "@/test-utils/renderHook";
import { useGridSelection } from "../useGridSelection";
import { GRID_COMPANION_ATTR } from "@/features/data-tables/grid-companion";

function makeHarness() {
  return renderHook(() =>
    useGridSelection({
      rowIds: ["r1", "r2"],
      fieldNames: ["customer", "quote"],
      editable: true,
      getCellText: () => "",
      onClearCells: () => {},
      onPasteText: () => {},
      onUndo: () => {},
      onRedo: () => {},
    }),
  );
}

function press(el: Element) {
  el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
}

describe("useGridSelection — the side chat keeps the selection", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("a press on the agent launcher or inside an agent window keeps the cell", async () => {
    const handle = await makeHarness();
    const launcher = document.createElement("span");
    launcher.setAttribute(GRID_COMPANION_ATTR, "");
    launcher.innerHTML = '<button type="button" aria-label="Agents for this page"></button>';
    const agentWindow = document.createElement("div");
    agentWindow.setAttribute("data-matrx-floating-layer", "");
    agentWindow.innerHTML = '<textarea aria-label="Message"></textarea>';
    document.body.append(launcher, agentWindow);

    await handle.act(() => handle.current.select({ rowId: "r2", fieldName: "quote" }));
    await handle.act(() => press(launcher.querySelector("button")!));
    expect(handle.current.selected).toEqual({ rowId: "r2", fieldName: "quote" });
    await handle.act(() => press(agentWindow.querySelector("textarea")!));
    expect(handle.current.selected).toEqual({ rowId: "r2", fieldName: "quote" });
  });

  it("a press on the page header still lets go", async () => {
    const handle = await makeHarness();
    const header = document.createElement("header");
    document.body.append(header);
    await handle.act(() => handle.current.select({ rowId: "r1", fieldName: "customer" }));
    await handle.act(() => press(header));
    expect(handle.current.selected).toBeNull();
  });
});
