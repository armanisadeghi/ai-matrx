/** Scrolls only the tab strip enough to reveal its selected tab. */
export function revealActiveEditorTab(
  list: HTMLElement,
  activeId: string,
): void {
  const tab = Array.from(list.querySelectorAll<HTMLElement>("[data-tab-id]")).find(
    (candidate) => candidate.dataset.tabId === activeId,
  );
  if (!tab) return;
  const listBox = list.getBoundingClientRect();
  const tabBox = tab.getBoundingClientRect();
  if (tabBox.left < listBox.left) {
    list.scrollBy({ left: tabBox.left - listBox.left, behavior: "smooth" });
  } else if (tabBox.right > listBox.right) {
    list.scrollBy({ left: tabBox.right - listBox.right, behavior: "smooth" });
  }
}
