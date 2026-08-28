import { renderToString } from "react-dom/server";
import { ContextMenuHubClient } from "./ContextMenuHubClient";
import { CONTEXT_MENU_PAGES } from "../_registry";

describe("ContextMenuHubClient server boundary", () => {
  it("renders the registry hub on the server", () => {
    const html = renderToString(
      <ContextMenuHubClient pages={CONTEXT_MENU_PAGES} />,
    );

    expect(html).toContain("Context Menu v3 — Testing Suite");
    expect(html).toContain("/demos/context-menu/layouts");
  });
});
