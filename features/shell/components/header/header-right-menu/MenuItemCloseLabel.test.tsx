import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MenuCheckboxIdProvider, MenuItemCloseLabel } from "./menuCheckboxId";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MenuItemCloseLabel", () => {
  it("closes the menu when a button item inside it is clicked", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = "test-menu";
    box.checked = true;
    document.body.appendChild(box);
    const root = createRoot(host);
    act(() =>
      root.render(
        <MenuCheckboxIdProvider id="test-menu">
          <MenuItemCloseLabel>
            <button type="button">Submit Feedback</button>
          </MenuItemCloseLabel>
        </MenuCheckboxIdProvider>,
      ),
    );
    act(() => host.querySelector("button")!.click());
    expect(box.checked).toBe(false);
    act(() => root.unmount());
    host.remove();
    box.remove();
  });
});
