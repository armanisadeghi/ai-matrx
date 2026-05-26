/**
 * Pretty-but-compact JSON stringifier.
 *
 * Inspired by `json-stringify-pretty-compact`: keep the outer structure
 * indented for scannability, but collapse any sub-value whose one-line
 * form fits within `maxWidth` back onto a single line. The result reads
 * horizontally where possible without sacrificing top-level shape.
 *
 * Example output for a model definition:
 *
 *   {
 *     "controls": {
 *       "temperature": { "type": "number", "min": 0, "max": 1, "default": 1 },
 *       "top_p":       { "type": "number", "min": 0, "max": 1, "default": 1 },
 *       ...
 *     }
 *   }
 */
export interface CompactStringifyOptions {
  /** Wrap to multi-line when the single-line form exceeds this width. */
  maxWidth?: number;
  /** Spaces per indent level. */
  indent?: number;
}

export function stringifyCompact(
  value: unknown,
  options: CompactStringifyOptions = {},
): string {
  const maxWidth = options.maxWidth ?? 100;
  const indentSize = options.indent ?? 2;
  const pad = " ".repeat(indentSize);

  const render = (v: unknown, currentIndent: string): string => {
    // `JSON.stringify` returns `undefined` for functions/undefined; treat
    // those as `null` so the output remains valid JSON.
    const flat = JSON.stringify(v) ?? "null";
    if (flat.length <= Math.max(0, maxWidth - currentIndent.length)) {
      return prettifyFlat(flat);
    }

    if (Array.isArray(v)) {
      if (v.length === 0) return "[]";
      const nextIndent = currentIndent + pad;
      const items = v.map((item) => nextIndent + render(item, nextIndent));
      return "[\n" + items.join(",\n") + "\n" + currentIndent + "]";
    }

    if (v !== null && typeof v === "object") {
      const keys = Object.keys(v as Record<string, unknown>);
      if (keys.length === 0) return "{}";
      const nextIndent = currentIndent + pad;
      const items = keys.map((k) => {
        const valueStr = render((v as Record<string, unknown>)[k], nextIndent);
        return nextIndent + JSON.stringify(k) + ": " + valueStr;
      });
      return "{\n" + items.join(",\n") + "\n" + currentIndent + "}";
    }

    return flat;
  };

  return render(value, "");
}

/**
 * `JSON.stringify` emits no spaces after `:` or `,`. For single-line
 * fragments we re-insert them so the inline form matches the spacing the
 * multi-line form uses — but only outside of string literals.
 */
function prettifyFlat(flat: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i];
    out += ch;
    if (ch === '"') {
      // Count preceding backslashes to handle escaped quotes.
      let backslashes = 0;
      for (let j = i - 1; j >= 0 && flat[j] === "\\"; j--) backslashes++;
      if (backslashes % 2 === 0) inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === ":" || ch === ",") {
      const next = flat[i + 1];
      if (next !== undefined && next !== " ") out += " ";
    }
  }
  return out;
}
