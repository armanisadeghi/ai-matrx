// The ONE reader of a code fence's info string — the text after the opening
// backticks. Shared by the static splitter (content-splitter-core) and the
// live stream accumulator so a reloaded message and a streaming one agree.
//
// Accepted conventions (the ones authors and models actually write — MDX,
// rehype-pretty-code, Docusaurus, GitHub):
//   ```ts                               language only
//   ```ts title="app/page.tsx"          filename title (also title='…', filename="…")
//   ```ts:app/page.tsx                  language:filename
//   ```ts {1,3-5}                       highlighted lines (also glued: ts{1,3-5})
//   ```ts showLineNumbers               line numbers on (showLineNumbers{10} = start at 10)
// Anything else in the info string is ignored, never an error.

/** Where a code block carries its raw fence meta (block.metadata / stream block data). */
export const FENCE_META_KEY = "fenceMeta";

export interface FenceInfo {
  /** The language token alone (`ts`), or undefined for a bare fence. */
  language?: string;
  /** Everything after the language, verbatim; undefined when empty. */
  meta?: string;
}

export interface FenceMeta {
  /** A filename or caption shown in the code block header. */
  title?: string;
  /** 1-based line numbers to highlight, ascending, deduplicated. */
  highlightLines: number[];
  /** Explicit line-number request (`showLineNumbers`). */
  showLineNumbers?: boolean;
  /** First line number when numbering starts somewhere other than 1. */
  startLine?: number;
}

/** Split `ts:app.tsx {1,3} title="x"` into the language token and its meta. */
export function splitFenceInfo(info: string): FenceInfo {
  const trimmed = info.trim();
  if (!trimmed) return {};
  const firstSpace = trimmed.search(/\s/);
  let token = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
  let rest = firstSpace === -1 ? "" : trimmed.slice(firstSpace).trim();

  // Glued forms: ts{1,3}  ·  ts:app.tsx  ·  ts:app.tsx{2}
  const braceAt = token.indexOf("{");
  if (braceAt > 0) {
    rest = `${token.slice(braceAt)} ${rest}`.trim();
    token = token.slice(0, braceAt);
  }
  const colonAt = token.indexOf(":");
  if (colonAt > 0 && colonAt < token.length - 1) {
    const filename = token.slice(colonAt + 1);
    rest = `title="${filename}" ${rest}`.trim();
    token = token.slice(0, colonAt);
  }
  // A leading brace means no language: ```{1,2}
  if (token.startsWith("{")) {
    rest = `${token} ${rest}`.trim();
    token = "";
  }
  return {
    language: token || undefined,
    meta: rest || undefined,
  };
}

const TITLE_RE = /(?:^|\s)(?:title|filename|file)=(?:"([^"]*)"|'([^']*)'|(\S+))/i;
const RANGES_RE = /(?:^|\s)\{([\d\s,-]+)\}/;
const LINE_NUMBERS_RE = /(?:^|\s)showLineNumbers(?:\{(\d+)\})?(?=\s|$)/;

/** Upper bound on highlighted lines, so `{1-99999999}` cannot allocate a huge array. */
const MAX_HIGHLIGHT_LINES = 10_000;

/** Parse a fence's meta string (from splitFenceInfo) into render options. */
export function parseFenceMeta(meta: string | undefined | null): FenceMeta {
  const result: FenceMeta = { highlightLines: [] };
  if (!meta) return result;

  const title = TITLE_RE.exec(meta);
  if (title) {
    const value = (title[1] ?? title[2] ?? title[3] ?? "").trim();
    if (value) result.title = value;
  }

  const ranges = RANGES_RE.exec(meta);
  if (ranges) result.highlightLines = parseLineRanges(ranges[1]);

  const lineNumbers = LINE_NUMBERS_RE.exec(meta);
  if (lineNumbers) {
    result.showLineNumbers = true;
    if (lineNumbers[1]) {
      const start = Number.parseInt(lineNumbers[1], 10);
      if (Number.isFinite(start) && start > 0) result.startLine = start;
    }
  }
  return result;
}

/** `1,3-5, 9` → [1, 3, 4, 5, 9]. Malformed parts are skipped. */
export function parseLineRanges(spec: string): number[] {
  const lines = new Set<number>();
  for (const part of spec.split(",")) {
    const piece = part.trim();
    if (!piece) continue;
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(piece);
    if (range) {
      const from = Number.parseInt(range[1], 10);
      const to = Number.parseInt(range[2], 10);
      if (from < 1 || to < from) continue;
      for (let n = from; n <= to && lines.size < MAX_HIGHLIGHT_LINES; n += 1) {
        lines.add(n);
      }
      continue;
    }
    if (/^\d+$/.test(piece)) {
      const n = Number.parseInt(piece, 10);
      if (n >= 1) lines.add(n);
    }
  }
  return [...lines].sort((a, b) => a - b);
}
