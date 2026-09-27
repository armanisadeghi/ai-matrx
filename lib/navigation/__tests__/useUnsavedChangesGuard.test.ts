import { leavingDestination } from "../useUnsavedChangesGuard";

const here = new URL("https://aimatrx.com/chat/message-templates/abc?mode=edit");
const click = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};

describe("leavingDestination", () => {
  it("guards an in-app link to another page, keeping its query", () => {
    expect(
      leavingDestination({ href: "/chat/message-templates?q=x" }, here, click),
    ).toBe("/chat/message-templates?q=x");
  });

  it("lets a same-page mode switch through", () => {
    expect(
      leavingDestination({ href: "/chat/message-templates/abc" }, here, click),
    ).toBeNull();
  });

  it.each([
    ["new tab", { href: "/notes", target: "_blank" }, click],
    ["another origin", { href: "https://example.com/x" }, click],
    ["a download", { href: "/file.csv", hasDownload: true }, click],
    ["cmd-click", { href: "/notes" }, { ...click, metaKey: true }],
    ["middle click", { href: "/notes" }, { ...click, button: 1 }],
    ["already handled", { href: "/notes" }, { ...click, defaultPrevented: true }],
  ])("never intercepts %s", (_name, anchor, c) => {
    expect(leavingDestination(anchor, here, c)).toBeNull();
  });
});
