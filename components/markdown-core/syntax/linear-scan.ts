/**
 * Linear-time stand-ins for regexes on the markdown render hot path that
 * backtracked super-linearly (kind-never-raw round 11, F1 sweep). Each
 * function is EXACTLY the regex named in its doc (differentially fuzzed
 * against it) and runs in time linear in its input. Guard:
 * `components/markdown-core/__tests__/regex-linear-time.guard.test.ts`.
 */

const isSpaceTab = (ch: string | undefined) => ch === " " || ch === "\t";
/** Characters `.` never matches (JS line terminators). */
const isLineTerminator = (ch: string | undefined) =>
  ch === "\n" || ch === "\r" || ch === " " || ch === " ";
const ID_TEXT = /^[\w:.-]+$/;

/** Exactly `text.replace(/[ \t]+$/, "")`. */
export function trimTrailingSpaceTab(text: string): string {
  let end = text.length;
  while (end > 0 && isSpaceTab(text[end - 1])) end--;
  return end === text.length ? text : text.slice(0, end);
}

/**
 * Exactly `/[ \t]*\{#([\w:.-]+)\}[ \t]*$/.exec(text)` as `{ index, id }`: a
 * trailing `{#id}` attribute (an id never holds `{` or `}`, so it is the LAST
 * `{#`), its match starting at the spaces before it.
 */
export function trailingHeadingId(text: string): { index: number; id: string } | null {
  const body = trimTrailingSpaceTab(text);
  if (!body.endsWith("}")) return null;
  const open = body.lastIndexOf("{#");
  if (open === -1) return null;
  const id = body.slice(open + 2, -1);
  if (!ID_TEXT.test(id)) return null;
  let index = open;
  while (index > 0 && isSpaceTab(body[index - 1])) index--;
  return { index, id };
}

/** `#{1,6}` then one space/tab at the start of `line`: the head length, or -1. */
function atxHeadLength(line: string): number {
  let hashes = 0;
  while (line[hashes] === "#") hashes++;
  if (hashes < 1 || hashes > 6 || !isSpaceTab(line[hashes])) return -1;
  return hashes;
}

/**
 * Exactly `/^#{1,6}[ \t]+(.*?)[ \t]*\{#(sec:[\w:.-]+)\}[ \t]*$/.exec(line)` as
 * `[title, id]` (title = capture 1, the spaces around it excluded).
 */
export function sectionHeading(line: string): [string, string] | null {
  const hashes = atxHeadLength(line);
  if (hashes < 0) return null;
  const tail = trailingHeadingId(line);
  if (!tail || !tail.id.startsWith("sec:") || tail.id.length <= 4) return null;
  // `[ \t]+` (greedy) needs at least one space; it may run into the spaces before `{#`.
  let start = hashes;
  while (isSpaceTab(line[start])) start++;
  if (start === hashes) return null;
  const title = start >= tail.index ? "" : line.slice(start, tail.index);
  for (const ch of title) if (isLineTerminator(ch)) return null;
  return [title, tail.id];
}

/**
 * Exactly capture 1 of `/^(#{1,6}[ \t].*?)[ \t]*\{#[^}\n]*$/.exec(line)` — a
 * heading whose `{#id` attribute is still arriving — or null.
 */
export function unfinishedHeadingIdHead(line: string): string | null {
  const hashes = atxHeadLength(line);
  if (hashes < 0) return null;
  const minEnd = hashes + 1;
  // The `{#` must be followed by no `}` and no `\n` to the end.
  let lastStop = -1;
  for (let i = line.length - 1; i >= 0; i--) {
    if (line[i] === "}" || line[i] === "\n") {
      lastStop = i;
      break;
    }
  }
  const open = line.indexOf("{#", Math.max(lastStop + 1, minEnd));
  if (open === -1) return null;
  let end = open;
  while (end > minEnd && isSpaceTab(line[end - 1])) end--;
  for (let i = minEnd; i < end; i++) if (isLineTerminator(line[i])) return null;
  return line.slice(0, end);
}

/** The first index ≥ `from` holding one of `chars`, memoized for growing `from`. */
function forwardFinder(text: string, chars: string): (from: number) => number {
  let askedFrom = -1;
  let answer = -1;
  return (from) => {
    if (askedFrom >= 0 && from >= askedFrom && (answer === -1 || answer >= from)) return answer;
    askedFrom = from;
    answer = -1;
    for (let i = from; i < text.length; i++) {
      if (chars.includes(text[i]!)) {
        answer = i;
        break;
      }
    }
    return answer;
  };
}

/**
 * Exactly `text.replace(/(!?)\[([^\]\n]*)\]\[([^\]\n]+)\]/g, fn)` (the
 * reference-style use `![alt][id]` / `[text][id]`), linear: every `[` of one
 * label run closes at the same `]`, so a failed run is skipped whole.
 */
export function replaceReferenceUses(
  text: string,
  fn: (whole: string, bang: string, label: string, id: string, offset: number) => string,
): string {
  if (!text.includes("][")) return text;
  const stop = forwardFinder(text, "]\n");
  let out = "";
  let copied = 0;
  let at = text.indexOf("[");
  while (at !== -1) {
    const labelEnd = stop(at + 1);
    if (labelEnd === -1) break;
    let matched = false;
    if (text[labelEnd] === "]" && text[labelEnd + 1] === "[") {
      const idEnd = stop(labelEnd + 2);
      if (idEnd > labelEnd + 2 && text[idEnd] === "]") {
        const start = at > copied && text[at - 1] === "!" ? at - 1 : at;
        const bang = start < at ? "!" : "";
        out +=
          text.slice(copied, start) +
          fn(text.slice(start, idEnd + 1), bang, text.slice(at + 1, labelEnd), text.slice(labelEnd + 2, idEnd), start);
        copied = idEnd + 1;
        matched = true;
      }
    }
    // A failed `[` fails for every `[` up to its label's end too.
    at = text.indexOf("[", matched ? copied : Math.max(at + 1, labelEnd));
  }
  return copied === 0 ? text : out + text.slice(copied);
}

/**
 * Exactly `/(?<!\])(!?)\[([^\]\n]*)\](\[[^\]\n]*)?$/.exec(text)` as
 * `{ index, whole, bang, label, reference }` — a closed `[text]` / `![alt]`
 * at the very end, optionally followed by an unfinished `[id`.
 */
export function trailingBracketedTail(
  text: string,
): { index: number; whole: string; bang: string; label: string; reference: string | undefined } | null {
  // The last `]` or `\n` before `end` (exclusive), or -1.
  const lastStop = (end: number) => {
    for (let i = end - 1; i >= 0; i--) if (text[i] === "]" || text[i] === "\n") return i;
    return -1;
  };
  let close: number;
  let reference: string | undefined;
  if (text.endsWith("]")) {
    close = text.length - 1;
  } else {
    // `(\[[^\]\n]*)?$`: the reference opens right after the label's `]`.
    const stop = lastStop(text.length);
    if (stop === -1 || text[stop] !== "]" || text[stop + 1] !== "[") return null;
    close = stop;
    reference = text.slice(stop + 1);
  }
  // The label holds no `]` / `\n` (a `[` is fine): the match starts at the
  // FIRST `[` (or `![`) after the previous stop whose left neighbour is no `]`.
  for (let x = lastStop(close) + 1; x < close; x++) {
    if (text[x - 1] === "]") continue;
    if (text[x] === "[") {
      return { index: x, whole: text.slice(x), bang: "", label: text.slice(x + 1, close), reference };
    }
    if (text[x] === "!" && text[x + 1] === "[" && x + 1 < close) {
      return { index: x, whole: text.slice(x), bang: "!", label: text.slice(x + 2, close), reference };
    }
  }
  return null;
}
