import type { NoteOutlineItem } from "@/features/notes/utils/noteOutline";

/** A document with one H1 uses that heading as its title, not as a section. */
export function studyGuideOutlineItems(outline: readonly NoteOutlineItem[]): NoteOutlineItem[] {
  const h1Items = outline.filter((item) => item.level === 1);
  return h1Items.length === 1 ? outline.filter((item) => item !== h1Items[0]) : [...outline];
}

/** Show at most three visual tiers, relative to the first outline heading level. */
export function outlineIndentLevel(item: NoteOutlineItem, outline: readonly NoteOutlineItem[]): number {
  const rootLevel = Math.min(...outline.map((heading) => heading.level));
  return Math.min(2, Math.max(0, item.level - rootLevel));
}

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

/** Root sections form one accordion; nested heading state stays independent. */
export function initialOutlineExpansion(outline: readonly NoteOutlineItem[]): Record<number, boolean> {
  const rootLevel = Math.min(...outline.map((item) => item.level));
  const roots = outline.filter((item) => item.level === rootLevel);
  return Object.fromEntries(roots.map((item, index) => [item.headingIndex, index === 0]));
}

export function toggleOutlineSection(
  outline: readonly NoteOutlineItem[],
  expanded: Readonly<Record<number, boolean>>,
  headingIndex: number,
): Record<number, boolean> {
  const next = { ...expanded };
  const opening = expanded[headingIndex] === false;
  const rootLevel = Math.min(...outline.map((item) => item.level));
  if (opening && outline.find((item) => item.headingIndex === headingIndex)?.level === rootLevel) {
    for (const item of outline) {
      if (item.level === rootLevel) next[item.headingIndex] = false;
    }
  }
  next[headingIndex] = opening;
  return next;
}
