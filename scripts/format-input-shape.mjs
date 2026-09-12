/**
 * format-input-shape.mjs — THE INPUT RULE for the byte-size formatter.
 *
 * WHY A THIRD LANE EXISTS. `byte-size-shape.mjs` asks one question: "is a byte
 * count becoming a unit string HERE?" — arithmetic plus a unit label. The
 * collapse it drives deletes exactly that arithmetic and hands the number to
 * `formatFileSize`. Once the arithmetic is gone the shape lane is satisfied
 * FOREVER, whatever the number actually is, because nothing in the fleet ever
 * asked what ENTERS the owning export.
 *
 * THAT HOLE SHIPPED (matrx-frontend 738ea2ba55, 2026-09-11). Five research
 * surfaces measure a CHARACTER count — `char_count = len(content)` in aidream's
 * `research/scraper.py`, `result_length = len(summary_markdown)` in
 * `research/analysis.py`; Python `len()` on a string is characters. The collapse
 * pointed all five at `formatFileSize`, so a scrape of 1,258,291 characters told
 * the reader "1.2 MB captured". One of the deleted twins had at least carried
 * the disclosure — `// Approximate "chars ≈ bytes" for English text` — and the
 * collapse kept the conflation while deleting the sentence that admitted it,
 * now wearing the canonical formatter's authority. Any non-ASCII page makes the
 * number simply wrong, not approximate. A fourth adversarial review found it in
 * the REVERSE direction, which is the direction no lane was looking.
 *
 * WHAT THIS LANE ASKS. For every `formatFileSize(<arg>)` call: does `<arg>` name
 * a quantity that is NOT bytes?
 *
 *   1. A COUNT of things — an identifier or property whose segments include
 *      `char` / `chars` / `character(s)` / `word(s)` / `token(s)`:
 *      `char_count`, `charCount`, `totalChars`, `totalCharsScraped`,
 *      `word_count`, `tokens`. A count is rendered with `formatCount` from
 *      `@ai-matrx/kit/format` plus the word it counts ("1,258,291 chars"),
 *      never with a byte unit.
 *   2. A LENGTH — the segment `length` on anything that is not evidently a byte
 *      container, whether it is the JS property (`content.length`,
 *      `jsonString.length`, `text.length`) or a field name (`result_length`,
 *      `content_length`). A JavaScript string's `.length` is CHARACTERS and
 *      differs from its UTF-8 byte length for every non-ASCII character in it;
 *      an ARRAY's `.length` is items, which is not a byte count either.
 *
 *      `content_length` LOOKS like the HTTP header and is NOT, in this fleet:
 *      matrx-local's scrape tool sets it with `len(compiled)` over a joined
 *      string (app/tools/tools/network.py:975) and matrx-scraper's search does
 *      the same, printing it as "Total character count". The one place the real
 *      HTTP header reaches a formatter — matrx-frontend's `UrlProbeField` —
 *      now names its variable `contentLengthBytes`, which is how a genuine byte
 *      length declares itself here. That is the rule: the word "length" alone
 *      never proves bytes; the word "bytes" does.
 *   3. An ALREADY-SCALED figure — a segment `kb` / `mb` / `gb` / `tb` (or the
 *      `KiB` spellings) with no multiplication anywhere in the argument.
 *      `formatFileSize(disk_used_mb)` reads 40 GB as "40 MB"; the honest form
 *      multiplies first, as `sandbox-infra` does with `memory_used_kb * 1024`.
 *
 * THE BOUNDARY, WRITTEN DOWN, because a lane that fires on a real byte count is
 * a lane someone turns off. BYTE EVIDENCE IS CHECKED FIRST and silences the
 * whole rule for that call. It is any identifier segment in the argument from:
 * `byte` / `bytes` (so `size_bytes`, `byteLength`, `totalBytes`, `bytesLoaded`),
 * `buffer` / `buf`, `uint8` / `uint8array`, `arraybuffer`, `blob`, `size` (so
 * `file.size`, `blob.size`, `fileSize`, `sizeBytes`), and
 * `encode` / `encoder` / `encoded` (so `new TextEncoder().encode(text).length`
 * and `Buffer.byteLength(s, "utf8")`, which are the CORRECT way to get bytes out
 * of a string and must never be discouraged). So:
 *
 *   buffer.length            — bytes, silent
 *   bytes.length             — bytes, silent
 *   new Uint8Array(x).length — bytes, silent
 *   blob.size / file.size    — bytes, silent
 *   new TextEncoder().encode(text).length  — bytes, silent
 *   Buffer.byteLength(s, "utf8")           — bytes, silent
 *   text.length / content.length / html.length / markdown.length —  FIRES
 *   str.length / s.length / value.length / jsonString.length      —  FIRES
 *   result_length / content_length / charCount / totalChars       —  FIRES
 *
 * WHY A LENGTH FIRES ON A NAME THIS LANE DOES NOT RECOGNISE, rather than only on
 * a list of stringy names. A length reaching a byte formatter is a string length
 * or an array length, and neither is bytes, so the only correct one here is a
 * length ON a byte container — which the evidence set above names. A name-list
 * would have stayed silent on `stamped.length` (a build artifact's source text)
 * and on `result_length`, both live in matrx-frontend on the day this lane was
 * written. Fail loud on the unknown name; when it really is bytes, say so in the
 * name (`contentLengthBytes`, `byteLength`) — which is worth more to the next
 * reader than an allowlist entry nobody opens.
 *
 * WHAT IT DELIBERATELY DOES NOT SEE. A count that reaches the call through a
 * plain variable with no telling name (`formatFileSize(n)`, `formatFileSize(v)`)
 * — following that means type inference, and this file is a literal pattern over
 * one call expression. A count laundered through a helper
 * (`formatFileSize(total(items))`) for the same reason. The day one is found
 * live it gets collapsed and its spelling gets a fixture — not a parser.
 *
 * Exported as a module so `check-package-twins.mjs` can run it as a shape lane
 * and so the self-test can plant a call and prove it fails.
 */

/** The owning export whose INPUT this lane judges. */
const CALL_NAME = "formatFileSize";

/** `formatFileSize(` as a call, not as a word inside a longer identifier. */
const CALL_RE = new RegExp(String.raw`(?<![\w$])${CALL_NAME}\s*\(`, "g");

/**
 * Whole-line comments never call anything. The byte lane learned this the hard
 * way when it started reporting the prose that documents its own collapses —
 * and this file's own header quotes `formatFileSize(char_count)` several times.
 */
function isCommentLine(line) {
  return /^\s*(?:\/\/|\/\*|\*)/.test(line);
}

/**
 * The identifier SEGMENTS of an expression, lower-cased: `totalCharsScraped` →
 * total, chars, scraped; `char_count` → char, count; `blob.size` → blob, size.
 *
 * Segments rather than substrings, because substrings are how a word list gets
 * a reputation: `password` contains "word", `character` contains "char" (fine),
 * but `charter` would too. Splitting on camel-case and `_` asks whether the
 * author NAMED the quantity, which is the only evidence a literal rule has.
 */
function segmentsOf(expression) {
  const out = [];
  for (const identifier of expression.match(/[A-Za-z_$][\w$]*/g) ?? []) {
    for (const part of identifier.split(/[_$]+/)) {
      for (const piece of part.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)) {
        if (piece) out.push(piece.toLowerCase());
      }
    }
  }
  return out;
}

/**
 * Names that prove the argument IS bytes. Checked FIRST and silencing the whole
 * rule — see THE BOUNDARY in the header. `size` is here because every `size` in
 * the fleet that reaches a byte formatter is `Blob.size` / `File.size` / a
 * `size_bytes` column; `encode`/`encoder`/`encoded` are here because
 * `new TextEncoder().encode(text).length` is the CORRECT conversion and a guard
 * that flagged it would be teaching the wrong lesson.
 */
const BYTE_SEGMENTS = new Set([
  "byte",
  "bytes",
  "buffer",
  "buf",
  "uint8",
  "uint8array",
  "arraybuffer",
  "blob",
  "size",
  "encode",
  "encoder",
  "encoded",
  "bytelength",
]);

/** Names that prove the argument is a COUNT of things, not a measure of bytes. */
const COUNT_SEGMENTS = new Set([
  "char",
  "chars",
  "character",
  "characters",
  "word",
  "words",
  "token",
  "tokens",
]);

/** Names carrying a unit the formatter would then apply a SECOND time. */
const SCALED_SEGMENTS = new Set([
  "kb",
  "mb",
  "gb",
  "tb",
  "kib",
  "mib",
  "gib",
  "tib",
]);

/**
 * The argument expression of the call whose `(` sits at `open`, by paren
 * balance. Returns null for an unbalanced or absurdly long expression rather
 * than guessing — an unparsed call is reported by nobody, which is the honest
 * failure for a literal rule.
 */
function argumentAt(source, open) {
  let depth = 0;
  for (let i = open; i < source.length && i < open + 2000; i++) {
    const c = source[i];
    if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

/** Everything before the first top-level comma — the `bytes` parameter alone. */
function firstArgument(argumentText) {
  let depth = 0;
  for (let i = 0; i < argumentText.length; i++) {
    const c = argumentText[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (c === "," && depth === 0) return argumentText.slice(0, i);
  }
  return argumentText;
}

/**
 * Non-byte quantities entering `formatFileSize` in one file's source.
 * Returns [{ line, text }] — one per offending call.
 */
export function formatInputShapeIn(source) {
  const lines = source.split("\n");
  const out = [];
  CALL_RE.lastIndex = 0;
  let match;
  while ((match = CALL_RE.exec(source)) !== null) {
    const open = CALL_RE.lastIndex - 1;
    const lineIndex = source.slice(0, match.index).split("\n").length - 1;
    if (isCommentLine(lines[lineIndex])) continue;
    const whole = argumentAt(source, open);
    if (whole === null) continue;
    const argument = firstArgument(whole);
    const segments = new Set(segmentsOf(argument));

    // BYTE EVIDENCE WINS, always and first. See THE BOUNDARY in the header.
    if ([...segments].some((s) => BYTE_SEGMENTS.has(s))) continue;

    const counted = [...segments].filter((s) => COUNT_SEGMENTS.has(s));
    const scaled = [...segments].filter((s) => SCALED_SEGMENTS.has(s));
    let why = null;
    if (counted.length > 0) {
      why = `a COUNT (\`${counted[0]}\`) — render it with formatCount plus the word it counts`;
    } else if (segments.has("length")) {
      why =
        "a LENGTH — a string's is CHARACTERS and an array's is items, neither " +
        "of which is bytes; render a count with formatCount, or convert with " +
        'new TextEncoder().encode(s).length / Buffer.byteLength(s, "utf8"). If ' +
        "it really is bytes (an HTTP Content-Length), say so in the name";
    } else if (scaled.length > 0 && !argument.includes("*")) {
      why = `ALREADY IN ${scaled[0].toUpperCase()} — multiply up to bytes first, or the unit is applied twice`;
    }
    if (why === null) continue;
    out.push({
      line: lineIndex + 1,
      text: `${lines[lineIndex].trim()}   ← ${why}`,
    });
  }
  return out;
}

/**
 * Proves the rule can fail, on the EXACT line the fourth review found, and that
 * every byte-container spelling stays silent.
 *
 * Every broken leg is collected, never the first — the same reason the byte
 * lane collects: this rule's legs share a call-finder, so a mutation to the
 * finder and a mutation to a leg would otherwise print the same sentence.
 */
export function selfTestFormatInputShape() {
  const failures = [];
  const fail = (why) => failures.push(why);

  // THE ORIGINAL LINE, recovered verbatim from git (matrx-frontend
  // ScrapeStageView.tsx:242 at 738ea2ba55). This is the finding this lane
  // exists for; if it ever stops firing, the lane is decoration.
  const originalLine = "            {formatFileSize(totalChars)} captured";
  if (formatInputShapeIn(originalLine).length === 0) {
    fail(
      "the ORIGINAL live line `{formatFileSize(totalChars)} captured` was NOT " +
        "reported — the count leg is down",
    );
  }
  // …and its siblings from the same collapse, in their real spellings.
  const liveSiblings = [
    "    ? formatFileSize(item.metadata.char_count)",
    "        extras.push(formatFileSize(data.char_count));",
    "          derived.totalCharsScraped > 0 ? `(${formatFileSize(derived.totalCharsScraped)})` : null",
    "    ? formatFileSize(item.metadata.result_length)",
    "                    {formatFileSize(effectiveContent.length)}",
    "          Raw JSON ({formatFileSize(jsonString.length)})",
    "                {formatFileSize(result.meta.content_length)} content",
    "        `✓ blob-sw.js (${formatFileSize(stamped.length)}) → ${OUT}`,",
  ];
  for (const line of liveSiblings) {
    if (formatInputShapeIn(line).length === 0) {
      fail(`a live non-byte call was NOT reported: ${line.trim()}`);
    }
  }
  // A word/token count is the same defect under a different noun.
  for (const line of [
    "  <span>{formatFileSize(doc.word_count)}</span>",
    "  <span>{formatFileSize(usage.totalTokens)}</span>",
  ]) {
    if (formatInputShapeIn(line).length === 0) {
      fail(`a word/token count was NOT reported: ${line.trim()}`);
    }
  }
  // THE NEGATIVE FIXTURES — every byte container, silent. A false positive here
  // is how a guard gets switched off, so these are as load-bearing as the
  // positives above.
  const byteContainers = [
    "const a = formatFileSize(buffer.length);",
    "const b = formatFileSize(bytes.length);",
    "const c = formatFileSize(new Uint8Array(payload).length);",
    "const d = formatFileSize(blob.size);",
    "const e = formatFileSize(file.size);",
    "const f = formatFileSize(result.blob.size);",
    "const g = formatFileSize(new TextEncoder().encode(text).length);",
    'const h = formatFileSize(Buffer.byteLength(stamped, "utf8"));',
    "const i = formatFileSize(attachment.size_bytes);",
    "const j = formatFileSize(m.fileSize);",
    "const k = formatFileSize(metrics.accumulatedTextBytes);",
    "const l = formatFileSize(node.byteLength);",
    'const m2 = formatFileSize(attachment.file_size, { fallback: "" });',
    "const n = formatFileSize(sys.memory_used_kb * 1024);",
    "const o = formatFileSize(Number(contentLengthBytes));",
    "const p = formatFileSize(node.byteLength);",
  ];
  for (const line of byteContainers) {
    if (formatInputShapeIn(line).length !== 0) {
      fail(`a genuine BYTE argument was reported: ${line.trim()}`);
    }
  }
  // …and the byte evidence must WIN over the count words, not merely coexist:
  // `encode(text)` contains no count word, but `charBytes` contains both.
  if (formatInputShapeIn("formatFileSize(charBytes);").length !== 0) {
    fail("byte evidence stopped winning over a count word (`charBytes`)");
  }
  // …and a name that merely CONTAINS a count word as a substring is not a
  // count: `password` is not `word`, which is what segment splitting buys.
  if (formatInputShapeIn("formatFileSize(passwordCount);").length !== 0) {
    fail("`password` was read as a WORD count — segment splitting is broken");
  }
  // THE ALREADY-SCALED LEG: a unit in the name and no multiplication.
  if (formatInputShapeIn("formatFileSize(disk_used_mb);").length === 0) {
    fail("an already-scaled `disk_used_mb` was NOT reported");
  }
  // …and the same figure multiplied up IS the honest form.
  if (formatInputShapeIn("formatFileSize(disk_used_mb * 1024 * 1024);").length !== 0) {
    fail("a correctly multiplied `disk_used_mb * 1024 * 1024` was reported");
  }
  // A WHOLE-LINE COMMENT is not a call — this file's own header quotes the
  // offending spelling a dozen times, and so will every doc that explains it.
  const prose = [
    "/**",
    " * The collapse pointed five surfaces at formatFileSize(char_count), so a",
    " * scrape of 1,258,291 characters read `1.2 MB captured`.",
    " */",
  ].join("\n");
  if (formatInputShapeIn(prose).length !== 0) {
    fail("a comment block explaining this very defect was reported as a call");
  }
  // A DIFFERENT function whose name merely ENDS in this one is not this call —
  // the underscore-prefixed private wrapper is the spelling that actually
  // occurs, and it is what the `(?<![\w$])` lookbehind exists for. (A
  // camel-cased `myFormatFileSize` would prove nothing: the capital F means it
  // never matched in the first place.)
  for (const impostor of [
    "_formatFileSize(text.length);",
    "$formatFileSize(text.length);",
    "const x = 1; safeformatFileSize(content.length);",
  ]) {
    if (formatInputShapeIn(impostor).length !== 0) {
      fail(`a different function ending in the export's name was read as it: ${impostor}`);
    }
  }
  // The line number must be the CALL's line, including in a multi-line call —
  // a finding pointing at the wrong line sends the next reader to innocent code.
  const multiline = [
    "const label = formatFileSize(",
    "  item.metadata.char_count,",
    ");",
  ].join("\n");
  const found = formatInputShapeIn(multiline);
  if (found.length !== 1 || found[0].line !== 1) {
    fail(
      "a multi-line call was not reported once at the line of the call itself " +
        `(got ${found.length} finding(s) at line ${found[0]?.line})`,
    );
  }
  // An ADOPTED count call site — the fix this lane asks for — is silent.
  const adopted = [
    'import { formatCount } from "@ai-matrx/kit/format";',
    "const label = `${formatCount(totalChars)} chars captured`;",
  ].join("\n");
  if (formatInputShapeIn(adopted).length !== 0) {
    fail("the ADOPTED `formatCount(totalChars)` form was reported");
  }
  return failures.length > 0
    ? { ok: false, why: failures.join("\n      ⋅ ") }
    : { ok: true };
}
