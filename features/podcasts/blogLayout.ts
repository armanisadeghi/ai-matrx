// features/podcasts/blogLayout.ts
//
// Pure helpers for laying out the public blog article (PodcastBlogPage).
// Kept framework-free so they're trivially testable and reusable.

/**
 * Split an article's markdown into two halves at the block boundary nearest
 * its character midpoint, so a caller can render something (an embedded player,
 * a media block) BETWEEN them without ever cutting through a paragraph, list,
 * or fenced code block.
 *
 * Rules that keep each half independently valid markdown:
 *   - Splits only ever fall on a blank-line block boundary.
 *   - Fenced code blocks (``` / ~~~) are treated as one atomic block, so a
 *     split can never land inside one.
 *   - Short content (< MIN_SPLIT_CHARS) or too-few blocks returns
 *     `{ before: md, after: "" }` — the caller then renders the insert AFTER
 *     the body rather than forcing an awkward mid-split on a tiny article.
 */
const MIN_SPLIT_CHARS = 600;
const MIN_BLOCKS = 3;

export function splitMarkdownForEmbed(md: string | null | undefined): {
  before: string;
  after: string;
} {
  const text = (md ?? "").trim();
  if (text.length < MIN_SPLIT_CHARS) return { before: text, after: "" };

  // Tokenize into top-level blocks separated by blank lines, keeping fenced
  // code blocks intact (a fence is atomic even if it contains blank lines).
  const lines = text.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;

  const flush = () => {
    if (current.length) {
      blocks.push(current.join("\n"));
      current = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trimStart();
    const fenceMatch = /^(```|~~~)/.exec(trimmed);

    if (fence) {
      current.push(line);
      if (fenceMatch && trimmed.startsWith(fence)) {
        fence = null;
        flush(); // the code block is its own atomic block
      }
      continue;
    }
    if (fenceMatch) {
      flush(); // start the code block as a fresh block
      current.push(line);
      fence = fenceMatch[1];
      continue;
    }
    if (line.trim() === "") {
      flush();
    } else {
      current.push(line);
    }
  }
  flush();

  if (blocks.length < MIN_BLOCKS) return { before: text, after: "" };

  // Pick the boundary (before block i) whose cumulative length is closest to
  // the middle. Never the very first or very last boundary.
  const total = text.length;
  let bestSplit = -1;
  let bestDelta = Number.POSITIVE_INFINITY;
  let acc = 0;
  for (let i = 0; i < blocks.length - 1; i++) {
    acc += blocks[i].length + 2; // account for the "\n\n" join
    const delta = Math.abs(acc - total / 2);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestSplit = i + 1;
    }
  }
  if (bestSplit <= 0) return { before: text, after: "" };

  return {
    before: blocks.slice(0, bestSplit).join("\n\n"),
    after: blocks.slice(bestSplit).join("\n\n"),
  };
}
