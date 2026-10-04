import { boardOwnsKey, isTyping } from "../engine/key-target";
import { isAccidentalScroll } from "../engine/native-scroll";

function tileWithBody(): { tile: HTMLElement; body: HTMLElement } {
  const tile = document.createElement("div");
  tile.setAttribute("data-board-tile", "file:1");
  const body = document.createElement("div");
  body.setAttribute("data-board-body", "");
  tile.appendChild(body);
  document.body.appendChild(tile);
  return { tile, body };
}

describe("which keys are the board's", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps the shared typing guard", () => {
    expect(isTyping(document.createElement("textarea"))).toBe(true);
  });

  it("owns a key on the page or on the tile itself", () => {
    const { tile } = tileWithBody();
    expect(boardOwnsKey(document.body)).toBe(true);
    expect(boardOwnsKey(tile)).toBe(true);
    expect(boardOwnsKey(null)).toBe(true);
  });

  it("never owns a key inside tile content: a grid cell, an editor, a textbox", () => {
    const { body } = tileWithBody();
    const cell = document.createElement("div");
    cell.setAttribute("role", "gridcell");
    cell.tabIndex = 0;
    body.appendChild(cell);
    expect(boardOwnsKey(cell)).toBe(false);
    const monaco = document.createElement("div");
    Object.defineProperty(monaco, "editContext", { value: {} });
    body.appendChild(monaco);
    expect(boardOwnsKey(monaco)).toBe(false);
    const box = document.createElement("div");
    box.setAttribute("role", "textbox");
    document.body.appendChild(box); // a textbox anywhere, even outside a tile
    expect(boardOwnsKey(box)).toBe(false);
  });

  it("does not own a key inside a focused (full-screen) card either", () => {
    const card = document.createElement("div");
    card.setAttribute("data-board-card", "file:1");
    const body = document.createElement("div");
    body.setAttribute("data-board-body", "");
    const cell = document.createElement("button");
    body.appendChild(cell);
    card.appendChild(body);
    document.body.appendChild(card);
    expect(boardOwnsKey(cell)).toBe(false);
  });
});

describe("the board never scrolls natively", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function board() {
    const pane = document.createElement("div");
    pane.style.overflow = "hidden";
    const root = document.createElement("div");
    root.style.overflow = "hidden";
    const card = document.createElement("div");
    card.setAttribute("data-board-card", "t");
    card.style.overflow = "hidden";
    const grid = document.createElement("div");
    grid.style.overflow = "auto";
    card.appendChild(grid);
    root.appendChild(card);
    pane.appendChild(root);
    document.body.appendChild(pane);
    return { pane, root, card, grid };
  }

  it("a scroll of the board root, a clipped ancestor, or a tile card is an accident", () => {
    const { pane, root, card } = board();
    expect(isAccidentalScroll(root, root)).toBe(true);
    expect(isAccidentalScroll(pane, root)).toBe(true);
    expect(isAccidentalScroll(card, root)).toBe(true);
  });

  it("content that scrolls for real, and a scrollable page, are left alone", () => {
    const { root, grid } = board();
    expect(isAccidentalScroll(grid, root)).toBe(false);
    const page = document.createElement("div");
    page.style.overflow = "auto";
    page.appendChild(root.parentElement as HTMLElement);
    document.body.appendChild(page);
    expect(isAccidentalScroll(page, root)).toBe(false);
  });
});
