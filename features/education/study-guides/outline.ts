import type { NoteOutlineItem } from "@/features/notes/utils/noteOutline";

/** A document with one H1 uses that heading as its title, not as a section. */
export function studyGuideOutlineTitle(outline: readonly NoteOutlineItem[]): NoteOutlineItem | null {
  const h1Items = outline.filter((item) => item.level === 1);
  return h1Items.length === 1 ? h1Items[0] : null;
}

/** Notes without a sole H1 still have a document title. Use it as a virtual
 * outline parent; -1 targets the reader's displayed title, not a Markdown H1. */
export function studyGuideOutlineDisplayTitle(outline: readonly NoteOutlineItem[], label: string): NoteOutlineItem {
  return studyGuideOutlineTitle(outline) ?? {
    level: 0,
    text: label || "Untitled guide",
    charOffset: -1,
    headingIndex: -1,
  };
}

/** Some generated notes contain source-page artifacts written as ATX headings.
 * Only structural extraction markers are excluded; uncertain headings remain. */
function isExtractionArtifact(item: NoteOutlineItem): boolean {
  const text = item.text;
  return /<page\s+number\s*=/i.test(text)
    || /^\|.+\|/.test(text)
    || /={4,}/.test(text)
    || /(^|\s-\s)[•▪]/.test(text)
    || /\(\d+\s+of\s+\d+\)\s*-/i.test(text)
    || /\.\.\.\s*-\s*Example\b.*\(\d+\s+of\s+\d+\)$/i.test(text);
}

export function studyGuideOutlineItems(outline: readonly NoteOutlineItem[]): NoteOutlineItem[] {
  const title = studyGuideOutlineTitle(outline);
  return outline.filter((item) => item !== title && !isExtractionArtifact(item));
}

/** Three visual tiers beneath the document title. No heading is orphaned. */
export function outlineIndentLevel(item: NoteOutlineItem, outline: readonly NoteOutlineItem[]): number {
  const rootLevel = Math.min(...outline.map((heading) => heading.level));
  return Math.min(3, Math.max(1, item.level - rootLevel + 1));
}

export interface StudyGuideOutlineNode {
  item: NoteOutlineItem;
  children: StudyGuideOutlineNode[];
}

/** The document title is the parent of every root returned here. Markdown
 * heading levels determine deeper parentage; skipped levels attach to the
 * nearest preceding lower-level heading rather than producing an orphan. */
export function studyGuideOutlineTree(outline: readonly NoteOutlineItem[]): StudyGuideOutlineNode[] {
  const roots: StudyGuideOutlineNode[] = [];
  const ancestors: StudyGuideOutlineNode[] = [];
  for (const item of outline) {
    while (ancestors.length && ancestors[ancestors.length - 1].item.level >= item.level) ancestors.pop();
    const node: StudyGuideOutlineNode = { item, children: [] };
    if (ancestors.length) ancestors[ancestors.length - 1].children.push(node);
    else roots.push(node);
    ancestors.push(node);
  }
  return roots;
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
