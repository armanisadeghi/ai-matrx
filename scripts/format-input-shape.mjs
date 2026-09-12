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
 * THAT HOLE SHIPPED TWICE.
 *   1. matrx-frontend 738ea2ba55 (2026-09-11): five research surfaces measure a
 *      CHARACTER count (`char_count = len(content)` in aidream's scraper) and
 *      the collapse pointed all five at `formatFileSize`, so a scrape of
 *      1,258,291 characters told the reader "1.2 MB captured".
 *   2. matrx-extend 1abbf6f (found by the fifth adversarial review, 2026-09-12):
 *      `next-data.ts` stored `size: node.textContent.length` — UTF-16 code
 *      units — and rendered `formatFileSize(size)` as "__NEXT_DATA__ (12.7 KB)".
 *      The first version of THIS lane passed it, because its silencer checked
 *      NAMES first: the word `size` anywhere in the argument proved bytes. The
 *      same review showed two more bypasses: `formatFileSize(text.length ||
 *      file.size)` (any byte word ANYWHERE silenced the whole call) and
 *      `const n = text.length; formatFileSize(n)` (an intermediate binding).
 *
 * THE RULE, v2 — NAME ALONE NEVER PROVES BYTES. For every `formatFileSize(<arg>)`:
 *
 *   A. BYTE CONVERSIONS ARE RECOGNISED FIRST, BY SHAPE, and replaced by an opaque
 *      byte token: `new TextEncoder().encode(s).length`, `encoder.encode(s)`,
 *      `Buffer.byteLength(s, "utf8")`, `new Blob([...]).size`,
 *      `new Uint8Array(x).length`, and the decoded size of base64 text
 *      `b64.length * 3 / 4` (receiver named `b64`/`base64`; matrx-local's Tauri
 *      fetch browser). These are the CORRECT way to get bytes out of
 *      text and must never be discouraged — including when the text inside them
 *      is `node.textContent`.
 *
 *   B. THE ARGUMENT IS SPLIT INTO THE OPERANDS THAT CAN BECOME ITS VALUE, and
 *      each is judged alone: `a || b`, `a ?? b`, `a && b`, `a + b`, `a - b`,
 *      both branches of a ternary (never its condition), every argument of
 *      `Math.max/min`, and through `Number()`/`parseInt`/`Math.round`/`as T`/`!`
 *      wrappers. ONE non-byte operand fires the call — `text.length || file.size`
 *      is a character count on every non-empty text.
 *
 *   C. EACH OPERAND'S BINDINGS IN THIS FILE ARE FOLLOWED (two hops) BEFORE ITS
 *      NAME IS TRUSTED. If the operand is an identifier or a property, every
 *      in-file `const x =` / `let x =` / `x =` / `x +=` / object-literal key
 *      `x:` of its ROOT name is read, and the call fires if any of them derives
 *      from: `.length` of a non-byte receiver, `textContent` / `innerText` /
 *      `innerHTML` / `outerHTML` / `JSON.stringify`, or an index difference
 *      (`i - start`, `end - begin`, `m.index`, `indexOf(...)`). A bound
 *      identifier is followed one hop further. WHATEVER IT IS NAMED: this is
 *      what catches `size: node.textContent.length`.
 *      A binding's RHS is judged only for those DERIVATIONS, never for name
 *      words: `const totalBytes = status?.content_length` (the Tauri updater's
 *      HTTP Content-Length) is not a derivation, and the declared name says bytes.
 *
 *   D. ONLY THEN IS THE OPERAND'S ROOT JUDGED — its LAST property or identifier,
 *      or the callee of a call — never a word merely CONTAINED in it:
 *        - already-scaled (`kb`/`mb`/`gb`/`tb`, KiB spellings) and not multiplied
 *          in this operand → FIRES (the unit would be applied twice);
 *        - `.length` → FIRES unless the receiver's last segment is a byte
 *          container (`bytes`, `buffer`, `buf`, `blob`, `encoded`, `uint8…`,
 *          `arraybuffer`) or the receiver is bound in-file from one;
 *        - last segment a byte word (`size`, `bytes`, `byteLength`, `buffer`…),
 *          and step C found nothing → bytes, silent (`file.size`, `blob.size`,
 *          `r.size_bytes`, `contentLengthBytes`, `gbToBytes(x)`);
 *        - any count segment (`char(s)`, `character(s)`, `word(s)`, `token(s)`)
 *          → FIRES;
 *        - any other byte segment (`bytesLoaded`, `bytes_downloaded`,
 *          `sizeBefore`) → bytes, silent;
 *        - a `length` segment (`result_length`, `content_length`) → FIRES. The
 *          word "length" alone never proves bytes; say "bytes" in the name;
 *        - anything else (`value`, `n`, `status.downloaded`) → silent.
 *
 * THE BOUNDARY, WRITTEN DOWN, because a lane that fires on a real byte count is
 * a lane someone turns off, and a lane that silently passes a character count
 * is decoration.
 *
 *   SEES: literal operands in the call; in-file bindings of each operand's root
 *   NAME, two hops; byte conversions by shape.
 *
 *   DOES NOT SEE, deliberately:
 *   - CROSS-FILE BINDINGS. `formatFileSize(entry.size)` where `entry` arrives
 *     from another module (a probe, an API response, a prop) is judged by the
 *     root name `size` alone. Following it means resolving imports and types —
 *     a TypeScript program, not a literal rule — and the producer side is
 *     covered differently: a producer that stores `.length` into a size-named
 *     field IN ITS OWN FILE is caught at its own call site only if it also
 *     formats there. The honest mitigation is the name: a producer measuring
 *     bytes names the field `sizeBytes` and measures with TextEncoder, and the
 *     sweep that found next-data.ts is how the cross-file residue gets audited.
 *     Stopping at the file is a CHOICE: it keeps the rule a 10ms regex pass that
 *     runs in seven roots on every gate, and every extra hop adds a false
 *     positive from an unrelated binding of a common name.
 *   - NAME COLLISIONS INSIDE ONE FILE are followed, not scoped. Two unrelated
 *     `size:` keys in one file are read as one name; a character-count binding
 *     anywhere in the file fires every `formatFileSize(size)` in it. That errs
 *     loud, which is the right direction, and renaming the byte one `sizeBytes`
 *     is the fix that also helps the next reader.
 *   - HELPERS: `formatFileSize(total(items))` is judged by the callee's name only.
 *   - MULTI-LINE BINDINGS are read while the next line continues the expression
 *     (starts with `.`, `?`, `:` or a binary operator, or the line ends on one);
 *     any other line break ends the RHS. (A multi-line `const bytes = chunks`
 *     `.filter(...).reduce(...)` in matrx-frontend's check-bundle-size.ts was
 *     the false positive that taught this.)
 *
 * Exported as a module so `check-package-twins.mjs` can run it as a shape lane
 * and so the self-test can plant a call and prove it fails.
 */

/** The owning export whose INPUT this lane judges. */
const CALL_NAME = "formatFileSize";

/** `formatFileSize(` as a call, not as a word inside a longer identifier. */
const CALL_RE = new RegExp(String.raw`(?<![\w$])${CALL_NAME}\s*\(`, "g");

/** Whole-line comments never call or bind anything. */
function isCommentLine(line) {
  return /^\s*(?:\/\/|\/\*|\*)/.test(line);
}

/**
 * The identifier SEGMENTS of a name, lower-cased: `totalCharsScraped` → total,
 * chars, scraped; `char_count` → char, count. Segments rather than substrings:
 * `password` is not `word`.
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

/** A ROOT whose last segment is one of these is a byte quantity (after step C). */
const BYTE_SEGMENTS = new Set([
  "byte",
  "bytes",
  "bytelength",
  "size",
  "buffer",
  "buf",
  "blob",
]);

/** A `.length` RECEIVER whose last segment is one of these holds bytes. */
const BYTE_CONTAINER_SEGMENTS = new Set([
  "bytes",
  "buffer",
  "buf",
  "blob",
  "encoded",
  "uint8",
  "u8",
  "arraybuffer",
  "uint8array",
]);

/** Names that prove the operand is a COUNT of things, not a measure of bytes. */
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
const SCALED_SEGMENTS = new Set(["kb", "mb", "gb", "tb", "kib", "mib", "gib", "tib"]);

/** Last segments that name a POSITION in text, whose difference is a character span. */
const INDEX_SEGMENTS = new Set(["i", "j", "k", "idx", "index", "pos", "position", "cursor"]);
const SPAN_END_SEGMENTS = new Set(["start", "begin", "end"]);

/** Text APIs whose values are strings of characters. */
const TEXT_SOURCE_RE = /\b(?:textContent|innerText|innerHTML|outerHTML)\b|\bJSON\s*\.\s*stringify\b/;

/** The opaque token a recognised byte conversion is replaced with. */
const BYTES_TOKEN = "__BYTES__";

/**
 * The argument expression of the call whose `(` sits at `open`, by paren
 * balance. Returns null for an unbalanced or absurdly long expression.
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

/** Index just past the bracket matching the one at `open`, or -1. */
function closeOf(text, open) {
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const want = [];
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (pairs[c]) want.push(pairs[c]);
    else if (c === ")" || c === "]" || c === "}") {
      if (want.pop() !== c) return -1;
      if (want.length === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Top-level split points of `text` for the given operator matcher. Skips
 * strings and anything inside brackets. `matchAt(text, i)` returns the operator
 * length at `i` or 0.
 */
function splitTop(text, matchAt) {
  const parts = [];
  const ops = [];
  let depth = 0;
  let quote = null;
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (depth === 0) {
      const len = matchAt(text, i);
      if (len > 0) {
        parts.push(text.slice(last, i));
        ops.push(text.slice(i, i + len));
        last = i + len;
        i += len - 1;
      }
    }
  }
  parts.push(text.slice(last));
  return { parts, ops };
}

/** Everything before the first top-level comma — the `bytes` parameter alone. */
function firstArgument(argumentText) {
  return splitTop(argumentText, (t, i) => (t[i] === "," ? 1 : 0)).parts[0];
}

/**
 * STEP A: replace every recognised byte conversion with BYTES_TOKEN, so the
 * text inside it (`node.textContent`) is never judged as a character source.
 */
export function neutralizeByteConversions(expression) {
  const openers = [
    // new TextEncoder().encode(x)  /  encoder.encode(x)  /  this.encoder.encode(x)
    { re: /(?:new\s+TextEncoder\s*\(\s*\)|(?<![\w$.])(?:[A-Za-z_$][\w$.]*)?[Ee]ncoder)\s*\.\s*encode\s*\($/, suffix: /^\s*\.\s*(?:length|byteLength)\b/ },
    { re: /Buffer\s*\.\s*byteLength\s*\($/, suffix: null },
    { re: /new\s+Blob\s*\($/, suffix: /^\s*\.\s*size\b/ },
    { re: /new\s+(?:Uint8Array|ArrayBuffer)\s*\($/, suffix: /^\s*\.\s*(?:length|byteLength)\b/ },
  ];
  // The decoded size of base64 text: `b64.length * 3 / 4` (ASCII alphabet, 4 chars → 3 bytes).
  let text = expression.replace(
    /\(?\s*[A-Za-z_$][\w$.?]*(?:b64|B64|base64|Base64)\s*\??\.\s*length\s*\*\s*3\s*\)?\s*\/\s*4\b/g,
    BYTES_TOKEN,
  );
  for (let guard = 0; guard < 50; guard++) {
    let replaced = false;
    for (let i = 0; i < text.length && !replaced; i++) {
      if (text[i] !== "(") continue;
      const head = text.slice(0, i + 1);
      for (const { re, suffix } of openers) {
        const m = re.exec(head);
        if (!m) continue;
        const end = closeOf(text, i);
        if (end < 0) continue;
        const rest = text.slice(end);
        const sm = suffix ? suffix.exec(rest) : null;
        const stop = end + (sm ? sm[0].length : 0);
        text = text.slice(0, m.index) + BYTES_TOKEN + text.slice(stop);
        replaced = true;
        break;
      }
    }
    if (!replaced) break;
  }
  return text;
}

/** Strip wrappers that do not change what the value measures. */
function unwrap(expression) {
  let e = expression.trim();
  for (let guard = 0; guard < 20; guard++) {
    const before = e;
    e = e.replace(/\s+as\s+[\w$.<>[\]| ]+$/, "").trim();
    e = e.replace(/!+$/, "").trim();
    if (e.startsWith("(") && closeOf(e, 0) === e.length) e = e.slice(1, -1).trim();
    const wrapper = /^(?:Number|parseInt|parseFloat|Math\s*\.\s*(?:round|floor|ceil|abs|trunc))\s*\(/.exec(e);
    if (wrapper && closeOf(e, wrapper[0].length - 1) === e.length) {
      e = firstArgument(e.slice(wrapper[0].length, -1)).trim();
    }
    if (e === before) break;
  }
  return e;
}

const isLiteral = (e) =>
  /^-?[\d_.]+(?:e\d+)?$/i.test(e) ||
  /^(?:null|undefined|true|false)$/.test(e) ||
  /^(['"`]).*\1$/s.test(e) ||
  e === BYTES_TOKEN ||
  e === "";

/** The operator matchers for the split steps. */
const LOGICAL = (t, i) => (t.startsWith("||", i) || t.startsWith("??", i) || t.startsWith("&&", i) ? 2 : 0);
const ADDITIVE = (t, i) => {
  if (t[i] !== "+" && t[i] !== "-") return 0;
  if (t[i + 1] === t[i] || t[i + 1] === "=") return 0;
  const prev = t.slice(0, i).trimEnd();
  // binary only: something operand-like precedes it
  return /[\w$)\]]$/.test(prev) && !/\be$/i.test(prev.slice(-2)) ? 1 : 0;
};
const MULTIPLICATIVE = (t, i) => (t[i] === "*" ? (t[i + 1] === "*" ? 2 : 1) : t[i] === "/" ? 1 : 0);

/** The ternary `cond ? a : b` at top level → [a, b], or null. */
function ternaryBranches(e) {
  const q = splitTop(e, (t, i) => (t[i] === "?" && t[i + 1] !== "." && t[i + 1] !== "?" && t[i - 1] !== "?" ? 1 : 0));
  if (q.parts.length < 2) return null;
  const rest = q.parts.slice(1).join("?");
  const c = splitTop(rest, (t, i) => (t[i] === ":" ? 1 : 0));
  if (c.parts.length < 2) return null;
  return [c.parts[0], c.parts.slice(1).join(":")];
}

/** The ROOT of an atomic operand: its last property / identifier name, and whether it is a call. */
function rootOf(e) {
  const call = /([A-Za-z_$][\w$]*)\s*(?:<[^()]*>)?\s*\((?:[^()]|\([^()]*\))*\)\s*$/.exec(e);
  if (call && call.index + call[0].length === e.length && !/\.\s*length\s*$/.test(e)) {
    return { name: call[1], call: true };
  }
  const name = /([A-Za-z_$][\w$]*)\s*$/.exec(e);
  return name ? { name: name[1], call: false } : null;
}

/** Only an identifier or a property chain can be FOLLOWED to a binding. */
const isFollowable = (e) => /^[A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*)*$/.test(e);

/**
 * Every in-file binding of `name`: `const/let/var name =`, `name =`, `name +=`,
 * and an object-literal key `name:` directly after `{`, `,` or a line start.
 * Returns [{ line, rhs }]. Comment lines are blanked by the caller.
 */
function bindingsOf(name, ctx) {
  const cacheKey = `b:${name}`;
  if (ctx.cache.has(cacheKey)) return ctx.cache.get(cacheKey);
  const esc = name.replace(/\$/g, "\\$");
  const res = [
    new RegExp(String.raw`(?:const|let|var)\s+${esc}\s*(?::[^=;\n]+)?=(?![=>])`, "g"),
    new RegExp(String.raw`(?<![\w$])${esc}\s*(?:\+|-|\|\||\?\?)?=(?![=>])`, "g"),
    new RegExp(String.raw`(?:^|[{,])\s*${esc}\s*:(?!:)`, "gm"),
  ];
  const out = [];
  const seen = new Set();
  for (const re of res) {
    let m;
    while ((m = re.exec(ctx.text)) !== null) {
      const start = m.index + m[0].length;
      if (seen.has(start)) continue;
      seen.add(start);
      // RHS: to the first top-level `,` `;` or newline, or an unmatched closer.
      let depth = 0;
      let quote = null;
      let end = start;
      for (; end < ctx.text.length; end++) {
        const c = ctx.text[end];
        if (quote) {
          if (c === "\\") end += 1;
          else if (c === quote) quote = null;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") quote = c;
        else if (c === "(" || c === "[" || c === "{") depth += 1;
        else if (c === ")" || c === "]" || c === "}") {
          if (depth === 0) break;
          depth -= 1;
        } else if (depth === 0 && (c === "," || c === ";")) break;
        else if (depth === 0 && c === "\n") {
          // A chained or continued expression (`chunks\n  .filter(...)`) goes on.
          const sofar = ctx.text.slice(start, end).trim();
          const next = /^\s*(\S)(\S?)/.exec(ctx.text.slice(end + 1));
          const continues =
            (next && (/[.?:+*/|&-]/.test(next[1]) && !(next[1] === "/" && /[/*]/.test(next[2])))) ||
            /(?:[=+*/|&?:(-]|\.)$/.test(sofar);
          if (!continues) break;
        }
      }
      const rhs = ctx.text.slice(start, end).trim();
      if (!rhs) continue;
      out.push({ line: ctx.text.slice(0, m.index).split("\n").length, rhs });
    }
  }
  ctx.cache.set(cacheKey, out);
  return out;
}

/** Is a `.length` receiver a byte container — by its name, or by its in-file binding? */
function isByteReceiver(receiver, ctx, hops) {
  const r = unwrap(receiver);
  if (r === BYTES_TOKEN) return true;
  const segs = segmentsOf(r.match(/([A-Za-z_$][\w$]*)\s*$/)?.[1] ?? "");
  if (segs.length > 0 && BYTE_CONTAINER_SEGMENTS.has(segs[segs.length - 1])) return true;
  if (segs.some((s) => s === "uint8" || s === "arraybuffer")) return true;
  if (hops > 0 && isFollowable(r)) {
    const root = rootOf(r);
    const binds = root ? bindingsOf(root.name, ctx) : [];
    if (
      binds.length > 0 &&
      binds.every((b) => /Uint8Array|ArrayBuffer|arrayBuffer\s*\(|Buffer\s*\.\s*(?:from|alloc|concat)|__BYTES__/.test(neutralizeByteConversions(b.rhs)))
    ) {
      return true;
    }
  }
  return false;
}

/** The value-position operands of an expression, split through every step-B operator. */
function operandsOf(expression) {
  const out = [];
  const visit = (raw, scaledOk) => {
    const e = unwrap(raw);
    if (isLiteral(e)) return;
    const branches = ternaryBranches(e);
    if (branches) {
      for (const b of branches) visit(b, scaledOk);
      return;
    }
    const logical = splitTop(e, LOGICAL);
    if (logical.parts.length > 1) {
      for (const p of logical.parts) visit(p, scaledOk);
      return;
    }
    const additive = splitTop(e, ADDITIVE);
    if (additive.parts.length > 1) {
      out.push({ kind: "additive", parts: additive.parts.map(unwrap), ops: additive.ops, text: e });
      for (const p of additive.parts) visit(p, scaledOk);
      return;
    }
    const mult = splitTop(e, MULTIPLICATIVE);
    if (mult.parts.length > 1) {
      const multiplied = mult.ops.some((o) => o === "*" || o === "**");
      for (const p of mult.parts) visit(p, scaledOk || multiplied);
      return;
    }
    const minmax = /^Math\s*\.\s*(?:max|min)\s*\(/.exec(e);
    if (minmax && closeOf(e, minmax[0].length - 1) === e.length) {
      for (const p of splitTop(e.slice(minmax[0].length, -1), (t, i) => (t[i] === "," ? 1 : 0)).parts) {
        visit(p, scaledOk);
      }
      return;
    }
    out.push({ kind: "atom", text: e, scaledOk });
  };
  visit(expression, false);
  return out;
}

/** An index difference: `i - start`, `end - begin`, `m.index`, `indexOf(...)`. */
function indexDifference(op) {
  if (op.kind !== "additive" || !op.ops.includes("-")) return null;
  const lastSeg = (p) => {
    const segs = segmentsOf(p.match(/([A-Za-z_$][\w$]*)\s*$/)?.[1] ?? "");
    return segs[segs.length - 1] ?? "";
  };
  const positional = op.parts.filter(
    (p) => INDEX_SEGMENTS.has(lastSeg(p)) || /\bindexOf\s*\(|\blastIndex\b|\.\s*index\b/.test(p),
  );
  const spans = op.parts.filter((p) => SPAN_END_SEGMENTS.has(lastSeg(p)));
  if (positional.length > 0 && positional.length + spans.length >= 2) return op.text;
  if (spans.length >= 2) return op.text;
  return null;
}

/**
 * STEP C, the derivation check: does this expression (a binding RHS) derive
 * from characters? Returns a reason or null. Names are NOT judged here.
 */
function derivationOf(expression, ctx, hops) {
  const text = neutralizeByteConversions(expression);
  for (const op of operandsOf(text)) {
    if (op.kind === "additive") {
      const span = indexDifference(op);
      if (span) return `an INDEX DIFFERENCE (\`${span}\`) — a span of characters, not bytes`;
      continue;
    }
    const e = op.text;
    const lengthOf = /^(.*?)\s*\??\.\s*length$/s.exec(e);
    if (lengthOf && !isByteReceiver(lengthOf[1], ctx, hops)) {
      return `the \`.length\` of \`${lengthOf[1].trim()}\` — characters or items, not bytes`;
    }
    if (TEXT_SOURCE_RE.test(e)) return `text (\`${e}\`) — characters, not bytes`;
    if (hops > 0 && isFollowable(e)) {
      const found = followBindings(e, ctx, hops - 1);
      if (found) return found;
    }
  }
  return null;
}

/** Follow the in-file bindings of an operand's root name; the first derivation found wins. */
function followBindings(operand, ctx, hops) {
  const root = rootOf(operand);
  if (!root || root.call) return null;
  const key = `f:${root.name}:${hops}`;
  if (ctx.cache.has(key)) return ctx.cache.get(key);
  ctx.cache.set(key, null); // cycle guard
  let found = null;
  for (const b of bindingsOf(root.name, ctx)) {
    const why = derivationOf(b.rhs, ctx, hops);
    if (why) {
      found = `\`${root.name}\` is bound at line ${b.line} from \`${b.rhs}\`: ${why}`;
      break;
    }
  }
  ctx.cache.set(key, found);
  return found;
}

/** STEPS B–D for one call's first argument. Returns a reason or null. */
function judgeArgument(argument, ctx) {
  const text = neutralizeByteConversions(argument);
  for (const op of operandsOf(text)) {
    if (op.kind === "additive") {
      const span = indexDifference(op);
      if (span) return `an INDEX DIFFERENCE (\`${span}\`) — a span of characters, not bytes`;
      continue;
    }
    const e = op.text;
    // D — `.length`: judged by its receiver, never by a byte word elsewhere.
    const lengthOf = /^(.*?)\s*\??\.\s*length$/s.exec(e);
    if (lengthOf) {
      if (isByteReceiver(lengthOf[1], ctx, 2)) continue;
      return (
        `a LENGTH (\`${e}\`) — a string's is CHARACTERS and an array's is items; ` +
        'convert with new TextEncoder().encode(s).length / Buffer.byteLength(s, "utf8"), ' +
        "or render a count with formatCount"
      );
    }
    if (TEXT_SOURCE_RE.test(e)) return `text (\`${e}\`) — characters, not bytes`;
    // C — bindings before names.
    if (isFollowable(e)) {
      const bound = followBindings(e, ctx, 1);
      if (bound) return `a CHARACTER-derived value: ${bound}`;
    }
    // D — the root name.
    const root = rootOf(e);
    if (!root) continue;
    const segs = segmentsOf(root.name);
    const lastSeg = segs[segs.length - 1];
    const scaled = segs.find((s) => SCALED_SEGMENTS.has(s));
    if (scaled && !op.scaledOk && !(root.call && BYTE_SEGMENTS.has(lastSeg))) {
      return `ALREADY IN ${scaled.toUpperCase()} (\`${e}\`) — multiply up to bytes first, or the unit is applied twice`;
    }
    if (BYTE_SEGMENTS.has(lastSeg)) continue;
    const counted = segs.find((s) => COUNT_SEGMENTS.has(s));
    if (counted) {
      return `a COUNT (\`${counted}\` in \`${e}\`) — render it with formatCount plus the word it counts`;
    }
    if (segs.some((s) => BYTE_SEGMENTS.has(s))) continue;
    if (segs.includes("length")) {
      return (
        `a LENGTH-named value (\`${e}\`) — the word "length" alone never proves bytes ` +
        "(this fleet's `content_length` / `result_length` are character counts); " +
        "if it really is bytes, say so in the name (`contentLengthBytes`)"
      );
    }
  }
  return null;
}

/**
 * Non-byte quantities entering `formatFileSize` in one file's source.
 * Returns [{ line, text }] — one per offending call.
 */
export function formatInputShapeIn(source) {
  const lines = source.split("\n");
  const ctx = {
    text: lines.map((l) => (isCommentLine(l) ? "" : l)).join("\n"),
    cache: new Map(),
  };
  const out = [];
  const re = new RegExp(CALL_RE.source, "g");
  let match;
  while ((match = re.exec(source)) !== null) {
    const open = re.lastIndex - 1;
    const lineIndex = source.slice(0, match.index).split("\n").length - 1;
    if (isCommentLine(lines[lineIndex])) continue;
    const whole = argumentAt(source, open);
    if (whole === null) continue;
    const why = judgeArgument(firstArgument(whole), ctx);
    if (why === null) continue;
    out.push({ line: lineIndex + 1, text: `${lines[lineIndex].trim()}   ← ${why}` });
  }
  return out;
}

/**
 * Proves the rule can fail — on the EXACT lines two reviews found, and on each
 * bypass of v1 — and that every genuine byte spelling, including real live call
 * sites a reviewer confirmed as bytes, stays silent.
 *
 * Every broken leg is collected, never the first, and every message names its
 * leg in brackets, so a mutation to one leg prints that leg's sentence.
 */
export function selfTestFormatInputShape() {
  const failures = [];
  const fail = (why) => failures.push(why);
  const fires = (src) => formatInputShapeIn(src).length > 0;

  // ── [count] THE ORIGINAL LINE (matrx-frontend ScrapeStageView.tsx:242 at 738ea2ba55).
  if (!fires("            {formatFileSize(totalChars)} captured")) {
    fail("[count] the ORIGINAL live line `{formatFileSize(totalChars)} captured` was NOT reported");
  }
  for (const line of [
    "    ? formatFileSize(item.metadata.char_count)",
    "        extras.push(formatFileSize(data.char_count));",
    "          derived.totalCharsScraped > 0 ? `(${formatFileSize(derived.totalCharsScraped)})` : null",
    "  <span>{formatFileSize(doc.word_count)}</span>",
    "  <span>{formatFileSize(usage.totalTokens)}</span>",
  ]) {
    if (!fires(line)) fail(`[count] a live count was NOT reported: ${line.trim()}`);
  }
  // ── [length-name] a field NAMED length that is not declared bytes.
  for (const line of [
    "    ? formatFileSize(item.metadata.result_length)",
    "                {formatFileSize(result.meta.content_length)} content",
  ]) {
    if (!fires(line)) fail(`[length-name] a length-named field was NOT reported: ${line.trim()}`);
  }
  // ── [length] the JS `.length` of a non-byte receiver.
  for (const line of [
    "                    {formatFileSize(effectiveContent.length)}",
    "          Raw JSON ({formatFileSize(jsonString.length)})",
    "        `✓ blob-sw.js (${formatFileSize(stamped.length)}) → ${OUT}`,",
  ]) {
    if (!fires(line)) fail(`[length] a string .length was NOT reported: ${line.trim()}`);
  }
  // ── [root-evidence] a byte word that is NOT the root must not silence the call.
  for (const line of [
    "formatFileSize(fileSizeLabel.length);",
    "formatFileSize(bytesText.length);",
    "formatFileSize(blob.size.toString().length);",
  ]) {
    if (!fires(line)) fail(`[root-evidence] a byte word CONTAINED in a non-byte root silenced the call: ${line}`);
  }
  // ── [compound] v1 BYPASS 2: judged per operand; any non-byte operand fires.
  for (const line of [
    "formatFileSize(text.length || file.size);",
    "formatFileSize(file.size ?? text.length);",
    "formatFileSize(hasFile ? file.size : html.length);",
    "formatFileSize(blob.size + markdown.length);",
    "formatFileSize(Math.max(file.size, content.length));",
  ]) {
    if (!fires(line)) fail(`[compound] a non-byte operand hidden beside a byte one was NOT reported: ${line}`);
  }
  // ── [binding] v1 BYPASS 1 and 3: bindings are followed before names are trusted.
  const bindingCases = [
    ["const n = text.length;", "formatFileSize(n);"],
    ["const size = node.textContent.length;", "formatFileSize(size);"],
    ["let total = 0;", "total += (b.textContent ?? '').length;", "formatFileSize(total);"],
    ["const t = html.length;", "const bytes = t;", "formatFileSize(bytes);"],
    ["const sizeBytes = JSON.stringify(payload).length;", "formatFileSize(sizeBytes);"],
  ];
  for (const lines of bindingCases) {
    if (!fires(lines.join("\n"))) {
      fail(`[binding] a character count reaching the call through a binding was NOT reported: ${lines.join(" ")}`);
    }
  }
  // ── [index-difference] a span of script text measured by positions.
  if (!fires(["const size = i - start;", "formatFileSize(size);"].join("\n"))) {
    fail("[index-difference] `const size = i - start` reaching formatFileSize was NOT reported");
  }
  // ── [live-next-data] THE FIFTH REVIEW'S LIVE MISS, recovered verbatim from
  // matrx-extend src/lib/data-pattern/modes/next-data.ts at 1abbf6f (the lines
  // that produce `size` and the line that formats it).
  const nextDataAt1abbf6f = [
    "    const found: { source: string; size: number }[] = [];",
    "        found.push({ source: id, size: node.textContent.length });",
    "          total += (b.textContent ?? '').length;",
    "        found.push({ source: `bpr-guid (LinkedIn) ×${parsedCount}`, size: total });",
    "            const size = i - start;",
    "        const { source, size } = entry as { source?: unknown; size?: unknown };",
    "        return typeof size === 'number' ? `${name} (${formatFileSize(size)})` : name;",
  ].join("\n");
  if (!fires(nextDataAt1abbf6f)) {
    fail("[live-next-data] matrx-extend next-data.ts at 1abbf6f (`size: node.textContent.length` → formatFileSize(size)) was NOT reported");
  }
  // …and the SAME file after the producer fix is silent.
  const nextDataFixed = [
    "    const found: { source: string; sizeBytes: number }[] = [];",
    "        found.push({ source: id, sizeBytes: new TextEncoder().encode(node.textContent).length });",
    "          totalBytes += new TextEncoder().encode(b.textContent ?? '').length;",
    "        found.push({ source: `bpr-guid (LinkedIn) ×${parsedCount}`, sizeBytes: totalBytes });",
    "            const spanBytes = new TextEncoder().encode(txt.slice(start, i)).length;",
    "        const { source, sizeBytes } = entry as { source?: unknown; sizeBytes?: unknown };",
    "        return typeof sizeBytes === 'number' ? `${name} (${formatFileSize(sizeBytes)})` : name;",
  ].join("\n");
  if (fires(nextDataFixed)) {
    fail(`[negative] the FIXED next-data.ts producer (TextEncoder bytes) was reported: ${formatInputShapeIn(nextDataFixed)[0]?.text}`);
  }
  // …and in the spelling the live fix actually uses: ONE encoder, reused.
  const nextDataLiveFix = [
    "    const encoder = new TextEncoder();",
    "        found.push({ source: id, sizeBytes: encoder.encode(node.textContent).length });",
    "          totalBytes += encoder.encode(b.textContent ?? '').length;",
    "            const spanBytes = encoder.encode(txt.slice(start, i)).length;",
    "        return typeof sizeBytes === 'number' ? `${name} (${formatFileSize(sizeBytes)})` : name;",
  ].join("\n");
  if (fires(nextDataLiveFix)) {
    fail(`[negative] the live next-data.ts fix (a reused \`encoder.encode(...)\`) was reported: ${formatInputShapeIn(nextDataLiveFix)[0]?.text}`);
  }
  // ── [scaled] a unit in the name and no multiplication.
  if (!fires("formatFileSize(disk_used_mb);")) fail("[scaled] an already-scaled `disk_used_mb` was NOT reported");
  if (fires("formatFileSize(disk_used_mb * 1024 * 1024);")) {
    fail("[scaled] a correctly multiplied `disk_used_mb * 1024 * 1024` was reported");
  }
  // ── [negative] genuine bytes, silent. A false positive is how a guard gets turned off.
  const negatives = [
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
    "const p = formatFileSize(file.size ?? 0);",
    "const q = formatFileSize(new Blob([JSON.stringify(doc)]).size);",
    "formatFileSize(charBytes);",
    "formatFileSize(passwordCount);",
    // Content-Length header parsed as bytes.
    ['const contentLengthBytes = Number(res.headers.get("content-length"));', "formatFileSize(contentLengthBytes);"].join("\n"),
    // Uint8Array bound, then its length.
    ["const data = new Uint8Array(await res.arrayBuffer());", "formatFileSize(data.length);"].join("\n"),
    // matrx-local UpdateBanner.tsx: the Tauri updater's HTTP content length.
    ["  const totalBytes = status?.content_length;", "                {formatFileSize(totalBytes)}"].join("\n"),
    // matrx-local ModelPicker.tsx: a GB figure converted by a named helper.
    "              {formatFileSize(gbToBytes(model.download_size_gb))}",
    "                        ? formatFileSize(encoder.download_size_gb * 1024 ** 3)",
    // THE REAL LIVE SITES the fifth review confirmed as bytes, verbatim.
    // matrx-frontend FileOperationResultBlock.tsx (counters prefixed "bytes").
    [
      '              counter.key.startsWith("bytes")',
      "                ? formatFileSize(counter.count as number)",
      "            label={`${formatFileSize(sizeBefore)} → ${formatFileSize(sizeAfter)}`}",
      "          <StateChip label={formatFileSize(size)} />",
    ].join("\n"),
    // matrx-frontend PlanUsagePanel.tsx (`_bytes` capabilities).
    ['  if (capability.endsWith("_bytes")) {', "    return formatFileSize(value);"].join("\n"),
    // matrx-frontend TelemetrySurface.tsx (`unit === "bytes"`).
    '  if (m.unit === "bytes") return formatFileSize(m.value);',
    // matrx-frontend catalogs/resolver.ts (`size_bytes`).
    [
      "      const size = outcome.result.files[0]?.size_bytes ?? null;",
      '          size !== null ? ` (${formatFileSize(size)})` : ""',
    ].join("\n"),
    // matrx-frontend FsInline.tsx (stat sizes).
    [
      "                {formatFileSize(e.size)}",
      '        sub={[path, size !== null ? formatFileSize(size) : null, truncated ? "truncated" : null]',
    ].join("\n"),
    // matrx-local TauriFetchBrowser.tsx: the decoded size of a base64 body.
    [
      "      byteCount: Math.round((result.body_b64.length * 3) / 4),",
      "            HTTP {page.status} · {formatFileSize(page.byteCount)}",
    ].join("\n"),
    // matrx-frontend scripts/check-bundle-size.ts: a MULTI-LINE chained binding
    // whose first line is a bare identifier also used as an item count.
    [
      "    const chunks = key ? (manifest[key] ?? []) : [];",
      "    const bytes = chunks",
      '      .filter((c) => c.endsWith(".js"))',
      "      .reduce((acc, c) => acc + sizeOf(c), 0);",
      "    reports.push({ route: label, chunks: chunks.length, bytes });",
      "  `${formatFileSize(r.bytes)}`",
    ].join("\n"),
    // matrx-frontend lib/field-formats/registry.ts:428 (a field declared bytes).
    ["      const n = toNumber(v);", "      return n === null ? null : formatFileSize(n);"].join("\n"),
  ];
  for (const src of negatives) {
    const hit = formatInputShapeIn(src);
    if (hit.length !== 0) fail(`[negative] a genuine BYTE argument was reported: ${hit[0].text}`);
  }
  // ── [comment] prose explaining the defect is not a call and binds nothing.
  const prose = [
    "/**",
    " * The collapse pointed five surfaces at formatFileSize(char_count), and",
    " * size: node.textContent.length was the next miss.",
    " */",
    "formatFileSize(size);",
  ].join("\n");
  if (fires(prose)) fail("[comment] a comment block explaining this very defect was reported or bound");
  // ── [impostor] a different function ending in the export's name.
  for (const impostor of ["_formatFileSize(text.length);", "$formatFileSize(text.length);", "safeformatFileSize(content.length);"]) {
    if (fires(impostor)) fail(`[impostor] a different function was read as the export: ${impostor}`);
  }
  // ── [line] a multi-line call reported once at the call's own line.
  const found = formatInputShapeIn(["const label = formatFileSize(", "  item.metadata.char_count,", ");"].join("\n"));
  if (found.length !== 1 || found[0].line !== 1) {
    fail(`[line] a multi-line call was not reported once at its own line (got ${found.length} at line ${found[0]?.line})`);
  }
  // ── [adopted] the fix this lane asks for is silent.
  if (fires(['import { formatCount } from "@ai-matrx/kit/format";', "const label = `${formatCount(totalChars)} chars captured`;"].join("\n"))) {
    fail("[adopted] the ADOPTED `formatCount(totalChars)` form was reported");
  }
  return failures.length > 0 ? { ok: false, why: failures.join("\n      ⋅ ") } : { ok: true };
}
