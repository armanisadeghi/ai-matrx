/** @jest-environment jsdom */
import { claimLoadFocus } from "../engine/claim-load-focus";

function mount() {
  document.body.innerHTML = '<div id="board" tabindex="-1"></div><textarea id="composer"></textarea>';
  return {
    board: document.getElementById("board") as HTMLElement,
    composer: document.getElementById("composer") as HTMLTextAreaElement,
  };
}

describe("claimLoadFocus: the board owns the keyboard on load", () => {
  it("takes focus from a composer that already has it", () => {
    const { board, composer } = mount();
    composer.focus();
    const stop = claimLoadFocus(board);
    expect(document.activeElement).toBe(board);
    stop();
  });

  it("hands focus back when the composer autofocuses a beat later", () => {
    const { board, composer } = mount();
    const stop = claimLoadFocus(board);
    composer.focus();
    expect(document.activeElement).toBe(board);
    stop();
  });

  it("lets the person choose after their first press", () => {
    const { board, composer } = mount();
    const stop = claimLoadFocus(board);
    document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    composer.focus();
    expect(document.activeElement).toBe(composer);
    stop();
  });

  it("never takes focus from a field inside the board", () => {
    const { board } = mount();
    const inner = document.createElement("textarea");
    board.appendChild(inner);
    const stop = claimLoadFocus(board);
    inner.focus();
    expect(document.activeElement).toBe(inner);
    stop();
  });
});
