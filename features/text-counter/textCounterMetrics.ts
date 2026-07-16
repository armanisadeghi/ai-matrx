export interface TextCounterMetrics {
  characters: number;
  graphemes: number;
  charactersWithoutWhitespace: number;
  bytes: number;
  words: number;
  uniqueWords: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  averageWordLength: number;
  averageSentenceLength: number;
  readingMinutes: number;
  speakingMinutes: number;
  keywordDensity: Array<{ word: string; count: number; percentage: number }>;
}

const STOP_WORDS = new Set(
  "a an and are as at be been being but by can could did do does for from had has have he her here hers herself him himself his how i if in into is it its itself just me more most my myself no not of on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves".split(
    " ",
  ),
);

const READING_WORDS_PER_MINUTE = 225;
const SPEAKING_WORDS_PER_MINUTE = 150;

function getSegments(text: string, granularity: "word" | "sentence") {
  if (typeof Intl.Segmenter !== "undefined") {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity }).segment(text),
    );
  }

  return granularity === "word"
    ? text.split(/\s+/).filter(Boolean).map((segment) => ({ segment, isWordLike: true }))
    : text.split(/[.!?]+/).filter((segment) => segment.trim()).map((segment) => ({ segment }));
}

/**
 * Browser-local, Unicode-aware measurements for the Character Counter.
 * `Intl.Segmenter` avoids treating emoji sequences and non-Latin scripts as
 * a sequence of unrelated code units; the fallback remains useful in older
 * browsers.
 */
export function computeTextCounterMetrics(text: string): TextCounterMetrics {
  const wordSegments = getSegments(text, "word").filter(
    (segment) => "isWordLike" in segment && segment.isWordLike,
  );
  const words = wordSegments.map((segment) => segment.segment);
  const normalizedWords = words
    .map((word) => word.toLocaleLowerCase().replace(/^\p{P}+|\p{P}+$/gu, ""))
    .filter(Boolean);
  const frequencies = new Map<string, number>();
  for (const word of normalizedWords) {
    if (!STOP_WORDS.has(word) && word.length > 1) {
      frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
    }
  }

  const sentences = getSegments(text, "sentence").filter((segment) =>
    segment.segment.trim(),
  );
  const graphemes =
    typeof Intl.Segmenter !== "undefined"
      ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text))
          .length
      : Array.from(text).length;
  const charactersWithoutWhitespace = text.replace(/\s/gu, "").length;
  const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

  return {
    characters: text.length,
    graphemes,
    charactersWithoutWhitespace,
    bytes: encoder ? encoder.encode(text).length : text.length,
    words: words.length,
    uniqueWords: new Set(normalizedWords).size,
    sentences: sentences.length,
    paragraphs: text.trim()
      ? text.split(/\n\s*\n/).filter((paragraph) => paragraph.trim()).length
      : 0,
    lines: text.length ? text.split("\n").length : 0,
    averageWordLength: words.length
      ? words.reduce((sum, word) => sum + Array.from(word).length, 0) / words.length
      : 0,
    averageSentenceLength: sentences.length ? words.length / sentences.length : 0,
    readingMinutes: words.length / READING_WORDS_PER_MINUTE,
    speakingMinutes: words.length / SPEAKING_WORDS_PER_MINUTE,
    keywordDensity: Array.from(frequencies, ([word, count]) => ({
      word,
      count,
      percentage: words.length ? (count / words.length) * 100 : 0,
    }))
      .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
      .slice(0, 10),
  };
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0 min";
  if (minutes < 1) return "< 1 min";
  return `${Math.ceil(minutes)} min`;
}

export function normalizeCounterText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n[\t ]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\t ]{2,}/g, " ")
    .trim();
}
