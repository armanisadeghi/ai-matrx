/**
 * THE CODE OF A SOURCE FILE, LINE FOR LINE — comments blanked, strings kept (lane OLD-READERS-REMOVAL,
 * 2026-10-01).
 *
 * WHY A LEXER AND NOT TWO REGEXES. Every guard that asks "does this file NAME X in code?" strips comments
 * first, and the old way — `/\/\*[\s\S]*?\*\//` then `//.*$` — reads a `/*` inside a STRING (a glob like
 * "**\/*.ts", a cron "*\/5", a path) as the start of a comment and blanks real code until the next `*\/`.
 * `utils/permissions/registry.ts` lost ~700 lines to it, so `tableName: "udt_datasets"` was invisible to
 * check:old-system-unreachable: a guard that cannot see is a false green. This walks the text once,
 * knowing strings (single, double, template with `${}` nesting), regex literals, and comments.
 *
 * Python: `#` comments (outside strings) and docstrings — a triple-quoted string opening a statement at
 * the top of a module or right after a line ending in `:` — are comments; any other string is code (SQL
 * lives in strings).
 *
 * Line count and line numbers are preserved exactly: every blanked character that is not a newline
 * becomes nothing, every newline stays.
 */

export function codeOnly(path: string, text: string): string {
  return /\.py$/.test(path) ? pythonCodeOnly(text) : scriptCodeOnly(text);
}

/** Characters after which a `/` starts a regex literal rather than a division. */
const REGEX_AFTER = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);
const REGEX_AFTER_WORDS = /(?:^|[^\w$])(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

function scriptCodeOnly(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  // A stack of template-literal brace depths: inside `${ … }` we are code again until the matching `}`.
  const templateDepth: number[] = [];
  let braceDepth = 0;
  let lastSignificant = "";
  let lastWordTail = "";
  const blank = (s: string) => s.replace(/[^\n]/g, "");
  while (i < n) {
    const c = text[i]!;
    const next = text[i + 1];
    // ── comments ──
    if (c === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      i = end < 0 ? n : end;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      out += blank(text.slice(i, stop));
      i = stop;
      continue;
    }
    // ── strings ──
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && text[j] !== c && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, Math.min(j + 1, n));
      i = j + 1;
      lastSignificant = c;
      lastWordTail = "";
      continue;
    }
    if (c === "`" || (c === "}" && templateDepth.length && templateDepth[templateDepth.length - 1] === braceDepth)) {
      // Opening a template, or returning into one from a `${ … }`.
      if (c === "}") templateDepth.pop();
      let j = i + 1;
      let reopened = false;
      while (j < n) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === "`") break;
        if (text[j] === "$" && text[j + 1] === "{") {
          templateDepth.push(braceDepth);
          j += 2;
          reopened = true;
          break;
        }
        j += 1;
      }
      out += text.slice(i, Math.min(reopened ? j : j + 1, n));
      i = reopened ? j : j + 1;
      lastSignificant = reopened ? "{" : "`";
      lastWordTail = "";
      continue;
    }
    // ── regex literals ──
    if (c === "/" && (REGEX_AFTER.has(lastSignificant) || REGEX_AFTER_WORDS.test(lastWordTail))) {
      let j = i + 1;
      let inClass = false;
      while (j < n && text[j] !== "\n") {
        const d = text[j]!;
        if (d === "\\") {
          j += 2;
          continue;
        }
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) break;
        j += 1;
      }
      if (j < n && text[j] === "/") {
        j += 1;
        while (j < n && /[a-z]/i.test(text[j]!)) j += 1;
        out += text.slice(i, j);
        i = j;
        lastSignificant = "/";
        lastWordTail = "";
        continue;
      }
    }
    // ── code ──
    if (c === "{") braceDepth += 1;
    else if (c === "}") braceDepth -= 1;
    out += c;
    if (!/\s/.test(c)) {
      lastSignificant = /[\w$]/.test(c) ? "w" : c;
      lastWordTail = /[\w$]/.test(c) ? (lastWordTail + c).slice(-12) : "";
    } else if (c === "\n" || c === " " || c === "\t") {
      // a word ends at whitespace; keep it for `return /x/` style checks
      if (lastWordTail) lastWordTail = lastWordTail.slice(-12);
    }
    i += 1;
  }
  return out;
}

function pythonCodeOnly(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  // Whether the next string opens a statement where a docstring may stand: start of file, or the first
  // token after a line that ended in `:`.
  let lineStart = true;
  let prevCodeLine = "";
  let currentLine = "";
  const blank = (s: string) => s.replace(/[^\n]/g, "");
  while (i < n) {
    const c = text[i]!;
    if (c === "#") {
      const end = text.indexOf("\n", i);
      i = end < 0 ? n : end;
      continue;
    }
    const prefix = text.slice(i).match(/^[rRbBuUfF]{0,2}("""|'''|"|')/);
    const prevChar = i > 0 ? text[i - 1]! : "";
    if (prefix && !/\w/.test(prevChar)) {
      const q = prefix[1]!;
      const startQuote = i + prefix[0].length - q.length;
      let j = startQuote + q.length;
      while (j < n) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text.startsWith(q, j)) break;
        if (q.length === 1 && text[j] === "\n") break;
        j += 1;
      }
      const stop = Math.min(j + q.length, n);
      const literal = text.slice(i, stop);
      const isDoc = q.length === 3 && lineStart && (prevCodeLine === "" || /:\s*$/.test(prevCodeLine));
      out += isDoc ? blank(literal) : literal;
      if (!isDoc) currentLine += literal;
      lineStart = false;
      i = stop;
      continue;
    }
    out += c;
    if (c === "\n") {
      if (currentLine.trim()) prevCodeLine = currentLine.trim();
      currentLine = "";
      lineStart = true;
    } else {
      currentLine += c;
      if (!/\s/.test(c)) lineStart = false;
    }
    i += 1;
  }
  return out;
}

/** Proves the lexer on the shapes that defeated the regexes. Returns the failures (empty = green). */
export function codeOnlySelfTest(): string[] {
  const fails: string[] = [];
  const expect = (name: string, ok: boolean) => {
    if (!ok) fails.push(name);
  };
  const ts = codeOnly(
    "a.ts",
    [
      'const glob = "src/**/*.ts";',
      'const t = "udt_datasets";',
      "// udt_dataset_rows in a comment",
      "/* block",
      "   udt_structured_lists */",
      "const re = /a\\/*b/g; const after = 'udt_dataset_fields';",
      "const tpl = `x ${ { a: 1 }.a } /* not a comment */ y`; const z = \"after_template\";",
      'const url = "https://example.test//x"; const k = "kept";',
      "const d = 4 / 2; /* c */ const e = 'udt_structured_list_items';",
    ].join("\n"),
  );
  const lines = ts.split("\n");
  expect("a glob string does not open a comment", lines[1]!.includes("udt_datasets"));
  expect("a line comment is blank", !lines[2]!.includes("udt_dataset_rows"));
  expect("a block comment is blank and keeps its lines", lines.length === 9 && !lines[4]!.includes("udt_structured_lists"));
  expect("a regex literal does not open a comment", lines[5]!.includes("udt_dataset_fields"));
  expect("a template literal is a string", lines[6]!.includes("/* not a comment */") && lines[6]!.includes("after_template"));
  expect("a URL's // is not a comment", lines[7]!.includes("kept"));
  expect("division then a comment", lines[8]!.includes("udt_structured_list_items") && !lines[8]!.includes("/* c */"));
  const py = codeOnly(
    "a.py",
    [
      '"""Module docstring udt_datasets."""',
      "def f():",
      '    """Docstring udt_dataset_rows."""',
      '    sql = """select * from udt_dataset_fields"""',
      '    s = "a # not a comment udt_structured_lists"  # a comment udt_structured_list_items',
      "    return UdtDatasets",
    ].join("\n"),
  );
  const pl = py.split("\n");
  expect("python module docstring blank", !pl[0]!.includes("udt_datasets") && pl.length === 6);
  expect("python function docstring blank", !pl[2]!.includes("udt_dataset_rows"));
  expect("python SQL string kept", pl[3]!.includes("udt_dataset_fields"));
  expect("python # inside a string kept, # comment blank", pl[4]!.includes("udt_structured_lists") && !pl[4]!.includes("udt_structured_list_items"));
  expect("python code kept", pl[5]!.includes("UdtDatasets"));
  return fails;
}
