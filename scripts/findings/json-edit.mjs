/**
 * Append one value to a JSON array IN PLACE — every other byte of the file stays as it was
 * (hand-written allowlists carry comments-as-keys, blank lines and escapes a JSON.stringify
 * rewrite would churn). The result is re-parsed and proven equal to "the old document with
 * exactly this one value appended", or it throws; nothing half-written is ever returned.
 */
import { isDeepStrictEqual } from "node:util";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Index of the bracket that closes the one at `open`, skipping string contents. */
function matchBracket(text, open) {
  let depth = 0;
  let inString = false;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i += 1;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "[" || c === "{") depth += 1;
    else if (c === "]" || c === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error("unbalanced JSON");
}

/**
 * @param {string} text   the file's bytes
 * @param {string|null} key  a TOP-LEVEL key whose value is an array, or null for a root array
 * @param {unknown} value
 */
export function appendToJsonArray(text, key, value) {
  const before = JSON.parse(text);
  let open;
  if (key == null) {
    if (!Array.isArray(before)) throw new Error("root is not an array");
    open = text.indexOf("[");
  } else {
    if (!Array.isArray(before?.[key])) throw new Error(`top-level "${key}" is not an array`);
    const m = new RegExp(`"${escapeRe(key)}"\\s*:\\s*\\[`).exec(text);
    if (!m) throw new Error(`cannot find "${key}": [ in the file`);
    open = m.index + m[0].length - 1;
  }
  const close = matchBracket(text, open);
  const lineStart = text.lastIndexOf("\n", open) + 1;
  const baseIndent = text.slice(lineStart).match(/^[ \t]*/)[0];
  const itemIndent = `${baseIndent}  `;
  const rendered = JSON.stringify(value, null, 2).split("\n").join(`\n${itemIndent}`);
  const inner = text.slice(open + 1, close);
  let out;
  if (!inner.trim()) {
    out = `${text.slice(0, open + 1)}\n${itemIndent}${rendered}\n${baseIndent}${text.slice(close)}`;
  } else {
    const kept = inner.replace(/\s*$/, "");
    out = `${text.slice(0, open + 1)}${kept},\n${itemIndent}${rendered}${inner.slice(kept.length)}${text.slice(close)}`;
  }
  const after = JSON.parse(out);
  const expected = structuredClone(before);
  (key == null ? expected : expected[key]).push(value);
  if (!isDeepStrictEqual(after, expected)) throw new Error("in-place append changed more than the one entry");
  return out;
}
