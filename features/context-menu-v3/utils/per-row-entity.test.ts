import { CONTEXT_MENU_ENTITY_KEY, type ContextMenuEntityRef } from "../types";
import {
  mergeResolvedContextData,
  resolveEffectiveEntity,
} from "./per-row-entity";

const paneEntity: ContextMenuEntityRef = {
  type: "structured_list",
  id: "list-1",
  title: "The pane's list",
  resourceType: "structured_list",
};

const rowEntity: ContextMenuEntityRef = {
  type: "seo_keyword",
  id: "kw-9",
  title: "hard drive shredding",
};

describe("per-row entity (delegated context menus)", () => {
  it("keeps the menu-level entity when nothing was resolved", () => {
    expect(resolveEffectiveEntity(paneEntity, null)).toBe(paneEntity);
  });

  it("keeps the menu-level entity when the resolved context omits the key", () => {
    expect(resolveEffectiveEntity(paneEntity, { content: "row text" })).toBe(
      paneEntity,
    );
  });

  it("lets the right-clicked row's entity win", () => {
    expect(
      resolveEffectiveEntity(paneEntity, {
        content: "row text",
        [CONTEXT_MENU_ENTITY_KEY]: rowEntity,
      }),
    ).toBe(rowEntity);
  });

  it("supplies a row entity where the menu has none", () => {
    expect(
      resolveEffectiveEntity(undefined, {
        [CONTEXT_MENU_ENTITY_KEY]: rowEntity,
      }),
    ).toBe(rowEntity);
  });

  it("hides the entity actions when the row explicitly has no entity", () => {
    expect(
      resolveEffectiveEntity(paneEntity, {
        [CONTEXT_MENU_ENTITY_KEY]: null,
      }),
    ).toBeUndefined();
  });

  it("falls back (and screams) on a malformed per-row entity", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(
      resolveEffectiveEntity(paneEntity, {
        [CONTEXT_MENU_ENTITY_KEY]: { type: "seo_keyword" } as never,
      }),
    ).toBe(paneEntity);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("never leaks the reserved key into the value payload", () => {
    const merged = mergeResolvedContextData(
      { content: "", site_id: "site-1" },
      { content: "row text", [CONTEXT_MENU_ENTITY_KEY]: rowEntity },
    );
    expect(merged).toEqual({ content: "row text", site_id: "site-1" });
    expect(CONTEXT_MENU_ENTITY_KEY in merged).toBe(false);
  });
});
