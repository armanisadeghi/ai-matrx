export const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "what",
  "when",
  "where",
  "which",
  "who",
  "with",
]);

const WORD_PATTERN = /\p{L}[\p{L}\p{N}'-]*/gu;

interface WordToken {
  value: string;
  start: number;
  end: number;
}

export interface QueryHighlightSegment {
  text: string;
  highlighted: boolean;
  /** Number of adjacent query terms matched by this segment. */
  wordCount: number;
  /** Longest match found anywhere in this text. */
  maxWordCount: number;
}

function tokenize(value: string): WordToken[] {
  return Array.from(value.matchAll(WORD_PATTERN), (match) => ({
    value: match[0].toLocaleLowerCase(),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export function getHighlightTerms(query: string): string[] {
  return [
    ...new Set(
      tokenize(query)
        .map((token) => token.value)
        .filter((word) => !STOP_WORDS.has(word)),
    ),
  ];
}

interface TokenMatch {
  start: number;
  end: number;
  wordCount: number;
}

function claimMatch(
  matches: TokenMatch[],
  occupied: boolean[],
  textTokens: WordToken[],
  textStart: number,
  wordCount: number,
) {
  const textEnd = textStart + wordCount;
  occupied.fill(true, textStart, textEnd);
  matches.push({
    start: textTokens[textStart].start,
    end: textTokens[textEnd - 1].end,
    wordCount,
  });
}

/**
 * Finds non-overlapping query-word chains in `text`, longest-first.
 *
 * Exact query phrases are claimed first, including their internal stop words.
 * A second pass recognizes adjacent meaningful query terms in any order, so a
 * query containing "guidelines … pain" treats "pain guidelines" as a two-word
 * chain. The unordered pass observes query word frequency and never lets a
 * standalone stop word create or extend a chain.
 */
export function getQueryHighlightSegments(
  text: string,
  query: string,
): QueryHighlightSegment[] {
  const textTokens = tokenize(text);
  const queryTokens = tokenize(query);

  if (textTokens.length === 0 || queryTokens.length === 0) {
    return [{ text, highlighted: false, wordCount: 0, maxWordCount: 0 }];
  }

  const occupied = Array.from({ length: textTokens.length }, () => false);
  const matches: TokenMatch[] = [];

  for (let wordCount = queryTokens.length; wordCount >= 2; wordCount -= 1) {
    for (
      let queryStart = 0;
      queryStart + wordCount <= queryTokens.length;
      queryStart += 1
    ) {
      const queryPhrase = queryTokens.slice(queryStart, queryStart + wordCount);
      if (queryPhrase.every((token) => STOP_WORDS.has(token.value))) continue;

      for (
        let textStart = 0;
        textStart + wordCount <= textTokens.length;
        textStart += 1
      ) {
        const textEnd = textStart + wordCount;
        if (occupied.slice(textStart, textEnd).some(Boolean)) continue;

        const isExactMatch = queryPhrase.every(
          (queryToken, offset) =>
            queryToken.value === textTokens[textStart + offset]?.value,
        );
        if (!isExactMatch) continue;

        claimMatch(matches, occupied, textTokens, textStart, wordCount);
      }
    }
  }

  const meaningfulQueryTokens = queryTokens.filter(
    (token) => !STOP_WORDS.has(token.value),
  );
  const queryTermCounts = new Map<string, number>();
  for (const token of meaningfulQueryTokens) {
    queryTermCounts.set(
      token.value,
      (queryTermCounts.get(token.value) ?? 0) + 1,
    );
  }

  for (
    let wordCount = Math.min(meaningfulQueryTokens.length, textTokens.length);
    wordCount >= 1;
    wordCount -= 1
  ) {
    for (
      let textStart = 0;
      textStart + wordCount <= textTokens.length;
      textStart += 1
    ) {
      const textEnd = textStart + wordCount;
      if (occupied.slice(textStart, textEnd).some(Boolean)) continue;

      const candidateCounts = new Map<string, number>();
      let isQueryTermChain = true;
      for (const token of textTokens.slice(textStart, textEnd)) {
        if (STOP_WORDS.has(token.value) || !queryTermCounts.has(token.value)) {
          isQueryTermChain = false;
          break;
        }
        const nextCount = (candidateCounts.get(token.value) ?? 0) + 1;
        if (nextCount > (queryTermCounts.get(token.value) ?? 0)) {
          isQueryTermChain = false;
          break;
        }
        candidateCounts.set(token.value, nextCount);
      }
      if (!isQueryTermChain) continue;

      claimMatch(matches, occupied, textTokens, textStart, wordCount);
    }
  }

  if (matches.length === 0) {
    return [{ text, highlighted: false, wordCount: 0, maxWordCount: 0 }];
  }

  matches.sort((left, right) => left.start - right.start);
  const maxWordCount = Math.max(...matches.map((match) => match.wordCount));
  const segments: QueryHighlightSegment[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (cursor < match.start) {
      segments.push({
        text: text.slice(cursor, match.start),
        highlighted: false,
        wordCount: 0,
        maxWordCount,
      });
    }
    segments.push({
      text: text.slice(match.start, match.end),
      highlighted: true,
      wordCount: match.wordCount,
      maxWordCount,
    });
    cursor = match.end;
  }

  if (cursor < text.length) {
    segments.push({
      text: text.slice(cursor),
      highlighted: false,
      wordCount: 0,
      maxWordCount,
    });
  }

  return segments;
}
