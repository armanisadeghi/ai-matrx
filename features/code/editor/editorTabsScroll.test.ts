import { revealActiveEditorTab } from "./editorTabsScroll";

describe("revealActiveEditorTab", () => {
  it("scrolls only the strip when the selected tab is clipped", () => {
    const list = document.createElement("div");
    const tab = document.createElement("div");
    tab.dataset.tabId = "sandbox:one:/home/agent/session.json";
    list.append(tab);
    Object.defineProperty(list, "getBoundingClientRect", { value: () => ({ left: 100, right: 300 }) });
    Object.defineProperty(tab, "getBoundingClientRect", { value: () => ({ left: 280, right: 380 }) });
    const scrollBy = jest.fn();
    Object.defineProperty(list, "scrollBy", { value: scrollBy });

    revealActiveEditorTab(list, tab.dataset.tabId!);

    expect(scrollBy).toHaveBeenCalledWith({ left: 80, behavior: "smooth" });
  });
});
