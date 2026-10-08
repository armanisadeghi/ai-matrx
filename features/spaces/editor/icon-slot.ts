// features/spaces/editor/icon-slot.ts — which DOM mutations ProseMirror must not read back from a callout.

/** True when a DOM mutation is inside the callout's React-owned icon slot (ProseMirror must not read it back). */
export function ignoresIconSlotMutation(dom: HTMLElement, mutation: { type: string; target: Node }): boolean {
  if (mutation.type === "selection") return false;
  const slot = dom.querySelector(".spaces-callout-icon");
  return !!slot && slot.contains(mutation.target);
}

