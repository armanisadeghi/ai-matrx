// components/markdown-studio/lab/stream-chunks.ts
//
// THE chunker for simulated streams. One pure function that splits text the
// way a model stream might arrive, so every test surface (the Markdown Studio
// stream replay, the admin tester's JSON-extraction simulator) exercises the
// SAME chunk shapes. Extracted from components/admin/MarkdownTester.tsx
// (2026-09-23, RC-B1) — never re-implement a chunker beside this one.

export const CHUNK_STRATEGIES = [
  "random",
  "char-by-char",
  "word",
  "line",
  "mid-json",
] as const;

export type ChunkStrategy = (typeof CHUNK_STRATEGIES)[number];

export const CHUNK_STRATEGY_LABELS: Record<ChunkStrategy, string> = {
  random: "Random",
  "char-by-char": "Char-by-char",
  word: "Word",
  line: "Line",
  "mid-json": "Mid-JSON",
};

/** Strategies whose chunk size is governed by the min/max size range. */
export function strategyUsesSizeRange(strategy: ChunkStrategy): boolean {
  return strategy === "random" || strategy === "mid-json";
}

export interface StreamSimSettings {
  strategy: ChunkStrategy;
  /** Delay between chunks in milliseconds. 0 = as fast as the event loop allows. */
  delayMs: number;
  minChunkSize: number;
  maxChunkSize: number;
}

export const DEFAULT_STREAM_SIM_SETTINGS: StreamSimSettings = {
  strategy: "random",
  delayMs: 30,
  minChunkSize: 1,
  maxChunkSize: 40,
};

function randomSize(min: number, max: number, remaining: number): number {
  return Math.min(min + Math.floor(Math.random() * (max - min + 1)), remaining);
}

/** Split `text` into stream chunks. Concatenating the result returns `text` exactly
 *  (the `line` strategy appends the newline each line lost to the split, and drops
 *  the trailing one a final line never had). */
export function generateChunks(
  text: string,
  settings: Pick<StreamSimSettings, "strategy" | "minChunkSize" | "maxChunkSize">,
): string[] {
  const { strategy, minChunkSize, maxChunkSize } = settings;
  const chunks: string[] = [];

  switch (strategy) {
    case "char-by-char":
      for (const ch of text) chunks.push(ch);
      break;

    case "word":
      // Leading whitespace is its own chunk so the join stays byte-identical.
      for (const match of text.matchAll(/(\s+|\S+\s*)/g)) chunks.push(match[0]);
      break;

    case "line": {
      const lines = text.split("\n");
      lines.forEach((line, idx) =>
        chunks.push(idx < lines.length - 1 ? `${line}\n` : line),
      );
      if (chunks.length > 0 && chunks[chunks.length - 1] === "") chunks.pop();
      break;
    }

    case "mid-json": {
      // Deliberately split right through JSON structures.
      let i = 0;
      while (i < text.length) {
        const remaining = text.length - i;
        const targets = [
          text.indexOf("{", i),
          text.indexOf("[", i),
          text.indexOf('"', i),
        ].filter((t) => t > i && t < i + maxChunkSize);
        const size =
          targets.length > 0
            ? Math.min(...targets) - i + 1
            : randomSize(minChunkSize, maxChunkSize, remaining);
        chunks.push(text.slice(i, i + size));
        i += size;
      }
      break;
    }

    case "random":
    default: {
      let i = 0;
      while (i < text.length) {
        const size = randomSize(minChunkSize, maxChunkSize, text.length - i);
        chunks.push(text.slice(i, i + size));
        i += size;
      }
      break;
    }
  }

  return chunks;
}
