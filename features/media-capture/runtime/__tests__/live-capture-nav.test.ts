/**
 * Guard classification for the live-capture navigation guard.
 *
 * This is the load-bearing half of the fix for the "click Notes mid-recording
 * and silently lose the video" defect: too permissive and it swallows clicks
 * it has no business touching; too strict and the recording still dies.
 */

import { interceptableHref } from "@/features/media-capture/runtime/live-capture-nav";

const LOC = {
  origin: "https://app.test",
  pathname: "/camera",
  href: "https://app.test/camera",
};

function anchor(attrs: Record<string, string>): HTMLAnchorElement {
  const a = document.createElement("a");
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  document.body.appendChild(a);
  return a;
}

function clickOn(
  el: Element,
  init: Partial<MouseEventInit> & { prevented?: boolean } = {},
): MouseEvent {
  const { prevented, ...rest } = init;
  const e = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...rest,
  });
  Object.defineProperty(e, "target", { value: el, configurable: true });
  if (prevented) e.preventDefault();
  return e;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("interceptableHref", () => {
  it("intercepts a plain left-click on an in-app link to another route", () => {
    const a = anchor({ href: "/notes" });
    expect(interceptableHref(clickOn(a), LOC)).toBe("/notes");
  });

  it("keeps the query and hash of the intercepted destination", () => {
    const a = anchor({ href: "/notes?tab=all#top" });
    expect(interceptableHref(clickOn(a), LOC)).toBe("/notes?tab=all#top");
  });

  it("intercepts a click on a child of the link (icon, label)", () => {
    const a = anchor({ href: "/agents" });
    const span = document.createElement("span");
    a.appendChild(span);
    expect(interceptableHref(clickOn(span), LOC)).toBe("/agents");
  });

  it.each([
    ["meta (new tab)", { metaKey: true }],
    ["ctrl (new tab)", { ctrlKey: true }],
    ["shift (new window)", { shiftKey: true }],
    ["alt (download)", { altKey: true }],
    ["middle button", { button: 1 }],
    ["already prevented", { prevented: true }],
  ])("leaves a %s click alone", (_label, init) => {
    const a = anchor({ href: "/notes" });
    expect(interceptableHref(clickOn(a, init), LOC)).toBeNull();
  });

  it("leaves target=_blank alone", () => {
    const a = anchor({ href: "/notes", target: "_blank" });
    expect(interceptableHref(clickOn(a), LOC)).toBeNull();
  });

  it("leaves download links alone", () => {
    const a = anchor({ href: "/files/x.mp4", download: "" });
    expect(interceptableHref(clickOn(a), LOC)).toBeNull();
  });

  it("leaves cross-origin links alone", () => {
    const a = anchor({ href: "https://elsewhere.test/docs" });
    expect(interceptableHref(clickOn(a), LOC)).toBeNull();
  });

  it("leaves same-path links alone (hash/query moves do not unmount)", () => {
    const a = anchor({ href: "/camera#help" });
    expect(interceptableHref(clickOn(a), LOC)).toBeNull();
  });

  it("leaves non-anchor clicks alone", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    expect(interceptableHref(clickOn(div), LOC)).toBeNull();
  });

  it("honours the [data-live-capture-allow-nav] opt-out", () => {
    const wrap = document.createElement("div");
    wrap.setAttribute("data-live-capture-allow-nav", "");
    const a = document.createElement("a");
    a.setAttribute("href", "/notes");
    wrap.appendChild(a);
    document.body.appendChild(wrap);
    expect(interceptableHref(clickOn(a), LOC)).toBeNull();
  });
});
