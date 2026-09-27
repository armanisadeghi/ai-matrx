/** Search the visible text of a rendered document without changing its DOM. */
export interface RenderedFindOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

export function findRenderedTextMatches(text: string, query: string, options: RenderedFindOptions = {}): Array<[number, number]> {
  if (!query.trim()) return [];
  let expression: RegExp;
  try {
    const pattern = options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expression = new RegExp(pattern, options.caseSensitive ? "gu" : "giu");
  } catch {
    return [];
  }
  const matches: Array<[number, number]> = [];
  for (const match of text.matchAll(expression)) {
    if (!match[0] || match.index === undefined) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (options.wholeWord && (/\w/.test(text[start - 1] ?? "") || /\w/.test(text[end] ?? ""))) continue;
    matches.push([start, end]);
  }
  return matches;
}

const IGNORE_SELECTOR = "[data-find-ignore], button, [role='button'], [role='menu'], script, style, textarea, input, [aria-hidden='true']";

/** Ranges can cross inline formatting boundaries, such as a word split by <strong>. */
export function collectRenderedFindRanges(root: HTMLElement, query: string, options: RenderedFindOptions = {}): Range[] {
  if (!query.trim()) return [];
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      return parent && node.nodeValue && !parent.closest(IGNORE_SELECTOR) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  let previousBlock: Element | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // Inline formatting shares a searchable phrase. Separate paragraphs,
    // headings and list items cannot accidentally form one invented phrase.
    const block = node.parentElement?.closest("p,li,h1,h2,h3,h4,h5,h6,blockquote,pre,td,th,figcaption") ?? root;
    if (previousBlock && block !== previousBlock) text += "\n";
    previousBlock = block;
    nodes.push(node as Text);
    starts.push(text.length);
    text += (node as Text).nodeValue ?? "";
  }
  const locate = (offset: number, isEnd: boolean): [Text, number] | null => {
    let lo = 0;
    let hi = nodes.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const start = starts[mid];
      const length = nodes[mid].nodeValue?.length ?? 0;
      if (isEnd ? offset > start && offset <= start + length : offset >= start && offset < start + length) return [nodes[mid], offset - start];
      if (offset < start || (isEnd && offset === start)) hi = mid - 1;
      else lo = mid + 1;
    }
    return null;
  };
  return findRenderedTextMatches(text, query, options).flatMap(([start, end]) => {
    const from = locate(start, false);
    const to = locate(end, true);
    if (!from || !to) return [];
    const range = doc.createRange();
    range.setStart(from[0], from[1]);
    range.setEnd(to[0], to[1]);
    return [range];
  });
}
