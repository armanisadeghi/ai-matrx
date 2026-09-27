import type { NoteOutlineItem } from "@/features/notes/utils/noteOutline";

/** A document with one opening H1 uses that heading as its title. */
export function studyGuideOutlineTitle(outline: readonly NoteOutlineItem[], content = ""): NoteOutlineItem | null {
  const h1Items = outline.filter((item) => item.level === 1);
  const first = h1Items[0];
  if (h1Items.length !== 1 || outline[0] !== first) return null;
  if (first.charOffset === 0 || (content && !content.slice(0, first.charOffset).trim())) return first;
  return null;
}

/** Notes without a sole H1 still have a document title. Use it as a virtual
 * outline parent; -1 targets the reader's displayed title, not a Markdown H1. */
export function studyGuideOutlineDisplayTitle(outline: readonly NoteOutlineItem[], label: string, content = ""): NoteOutlineItem {
  return studyGuideOutlineTitle(outline, content) ?? {
    level: 0,
    text: label || "Untitled guide",
    charOffset: -1,
    headingIndex: -1,
  };
}

/** Commit to the document's Markdown heading hierarchy. The first section
 * level sets the top tier; no other text or shallower headings are promoted.
 * A top-level row must own deeper headings to become an outline branch. */
export function studyGuideOutlineItems(outline: readonly NoteOutlineItem[], content = ""): NoteOutlineItem[] {
  const title = studyGuideOutlineTitle(outline, content);
  const sections = outline.filter((item) => item !== title);
  if (!sections.length) return [];
  const rootLevel = sections[0].level;
  const eligible: NoteOutlineItem[] = [];
  let withinStyle = true;
  for (const item of sections) {
    if (item.level < rootLevel) {
      withinStyle = false;
    } else if (item.level === rootLevel) {
      withinStyle = true;
      eligible.push(item);
    } else if (withinStyle) {
      eligible.push(item);
    }
  }
  const roots = studyGuideOutlineTree(eligible);
  const branchIds = new Set(roots.filter((node) => node.children.length > 0).map((node) => node.item.headingIndex));
  if (!branchIds.size) return [];
  const included = new Set<number>();
  for (const root of roots) {
    if (!branchIds.has(root.item.headingIndex)) continue;
    const pending = [root];
    while (pending.length) {
      const node = pending.pop();
      if (!node) continue;
      included.add(node.item.headingIndex);
      pending.push(...node.children);
    }
  }
  return eligible.filter((item) => included.has(item.headingIndex));
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
