/**
 * @jest-environment jsdom
 *
 * The composer + menu's two dismissal/focus seams (PB-01…PB-04 real tests,
 * 2026-10-01). Measured in the browser: during the popper entrance the
 * content's top rows sat 28px below where they were drawn, so a click aimed at
 * a row landed on Radix's bare popper wrapper — OUTSIDE the dismissable layer —
 * and closed the menu ("+ opens only every second click"). And the cascade
 * focused "Back" while the picker's own search field received focus ~0.8 s
 * later, dropping the first typed characters.
 */
import { firstTextField, ignoreOwnWrapper } from "../ComposerMenu";

function popper() {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-radix-popper-content-wrapper", "");
  const content = document.createElement("div");
  wrapper.appendChild(content);
  document.body.appendChild(wrapper);
  return { wrapper, content };
}

describe("ignoreOwnWrapper", () => {
  it("keeps a pointer-down on the panel's own popper wrapper inside", () => {
    const { wrapper, content } = popper();
    const preventDefault = jest.fn();
    ignoreOwnWrapper({ target: wrapper, currentTarget: content, preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("still dismisses on a genuine outside pointer-down", () => {
    const { content } = popper();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const preventDefault = jest.fn();
    ignoreOwnWrapper({ target: outside, currentTarget: content, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("does not claim another popper's wrapper", () => {
    const mine = popper();
    const other = popper();
    const preventDefault = jest.fn();
    ignoreOwnWrapper({ target: other.wrapper, currentTarget: mine.content, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe("firstTextField", () => {
  it("finds the search box after a leading Back button", () => {
    const panel = document.createElement("div");
    panel.innerHTML = '<button>Back</button><input type="checkbox"/><input placeholder="Search files"/>';
    expect(firstTextField(panel)?.getAttribute("placeholder")).toBe("Search files");
  });

  it("returns null when the cascade has no text field", () => {
    const panel = document.createElement("div");
    panel.innerHTML = "<button>Chats</button><button>Notes</button>";
    expect(firstTextField(panel)).toBeNull();
  });
});
