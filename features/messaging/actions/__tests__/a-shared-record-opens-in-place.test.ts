/**
 * A record shared in a DM opens IN PLACE first (2026-10-03). The card's menu held
 * one row, "Open", which left the app for a new browser tab. Now: a Detail type
 * opens in the canvas (docked record-peek) or a window, a type with its own window
 * opens that window, and the page is the last choice.
 */
jest.mock("@ai-matrx/detail/react", () => ({ useOpenDetail: () => jest.fn() }));

import { sharedResourceActions } from "../messageActionSurfaces";

const run = (token: string, href: string | null) => {
  const openDetail = jest.fn(async () => "docked" as const);
  const openItem = jest.fn(() => true);
  const actions = sharedResourceActions({
    token,
    id: "11111111-1111-4111-8111-111111111111",
    title: "Q3 plan",
    href,
    openDetail: openDetail as never,
    openItem: openItem as never,
  });
  return { actions, openDetail, openItem };
};

describe("sharedResourceActions", () => {
  it("a Detail type offers the canvas, a window and the page — canvas first", () => {
    const { actions, openDetail } = run("project", "/projects/x");
    expect(actions.map((a) => a.label)).toEqual(["Open in canvas", "Open in window", "Open in new tab"]);
    actions[0]!.onSelect!();
    expect(openDetail).toHaveBeenCalledWith(expect.objectContaining({ type: "project", presentation: "docked" }));
  });

  it("a type with its own window opens that window, never a docked bare row", () => {
    const { actions, openItem } = run("note", "/notes/x");
    expect(actions.map((a) => a.label)).toEqual(["Open in window", "Open in new tab"]);
    actions[0]!.onSelect!();
    expect(openItem).toHaveBeenCalledWith("note", expect.any(String), expect.anything());
  });

  it("a type with only a page is one choice — the card draws it as a button, not a one-row menu", () => {
    expect(run("workflow", "/workflow-studio/x").actions.map((a) => a.label)).toEqual(["Open in new tab"]);
  });

  it("no in-place presentation and no page: no door at all", () => {
    expect(run("workflow", null).actions).toEqual([]);
  });
});
