import type { NoteOutlineItem } from "@/features/notes/utils/noteOutline";

export function visibleOutlineItems(
  outline: readonly NoteOutlineItem[],
  expanded: Readonly<Record<number, boolean>>,
): NoteOutlineItem[] {
  const ancestors: NoteOutlineItem[] = [];
  return outline.filter((item) => {
    while (ancestors.length && ancestors[ancestors.length - 1].level >= item.level) {
      ancestors.pop();
    }
    const visible = ancestors.every((ancestor) => expanded[ancestor.headingIndex] !== false);
    ancestors.push(item);
    return visible;
  });
}
