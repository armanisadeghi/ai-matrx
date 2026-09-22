/**
 * POPOVER-ADOPT (2026-09-23): `sizing` and a pasted width class are mutually
 * exclusive on every `<PopoverContent>` caller in this repository.
 *
 * `@ai-matrx/design-system`'s `PopoverContent` composes its className through
 * `cn()` (tailwind-merge), so a caller's own `className="w-64 …"` silently
 * beats — or is silently beaten by — the `w-auto`/`min-w-*`/`max-w-*` tokens
 * that `sizing="content"` installs. Either way one of the two is dead code the
 * next reader cannot see, and the bug this whole census fixed (lane FIX-14: a
 * `w-64` cut a customer's name mid-word because the box, not the content,
 * decided the width) comes straight back.
 *
 * The package carries the same guard over its own source
 * (`aidream/apps/shared/design-system/src/popover-sizing-guard.test.tsx`);
 * this is its twin over every caller in matrx-frontend.
 *
 * POPOVER-EXPR (2026-09-23): the original guard only read a LITERAL
 * `className="..."` attribute. Sixteen callers carry their width inside an
 * EXPRESSION className instead — `cn("w-64 p-0", contentClassName)`,
 * multi-line `cn(...)` calls, template literals
 * (`` `flex ${X} w-96 ...` ``), and ternary arms
 * (`menuMode === "menu" ? "w-48 p-1" : "w-80 p-0"`) — and were invisible to
 * the regex entirely: no conflict detection, no unadopted listing. This
 * extension walks every string-literal PART of the expression (quoted
 * strings, single-quoted strings, and the static segments between a template
 * literal's `${...}` holes) the same way it always walked a literal
 * className, so a width token anywhere in the expression is found no matter
 * which of `cn()`/`clsx()`/a template literal/a ternary arm carries it. A
 * bare identifier (`width`, `contentClassName`) is never a literal and is
 * correctly never flagged — we can't know its runtime value statically, and
 * that is the caller's own knob, not a class this guard can see.
 *
 * Two things happen with what the scan finds:
 *  1. A width token paired with `sizing` on the SAME tag is still a hard
 *     failure — same defect as the literal case, now caught in expressions
 *     too.
 *  2. A width token with NO `sizing` and NO inline classification comment
 *     (`/* sizing: fixed — ... *\/`, the convention every already-classified
 *     "leave" caller carries) is an UNADOPTED caller: neither adopted nor
 *     explained. That is also a hard failure — every `PopoverContent` that
 *     carries a width token must say, in the source, why: `sizing="content"`
 *     because the content is unknown-length, or the one-line comment because
 *     the shape is fixed on purpose. A silent, unclassified caller is exactly
 *     the gap this census exists to close.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const REPO = join(__dirname, "..", "..");
const ROOTS = ["app", "features", "components", "lib"];

// One <PopoverContent ...> opening tag. JSX attribute values never contain a
// raw `>` in this codebase's callers (no `>` inside a string, template
// literal, or ternary arm that sets className), so this simple scan is safe.
const OPEN_TAG = /<PopoverContent\b[^>]*?\/?>/gs;
const WIDTH_TOKEN = /^(w-|min-w-|max-w-)/;
const LEAVE_COMMENT = /\/\*\s*sizing:\s*fixed\b/;

/** Every string-literal PART inside an arbitrary JS expression: quoted
 * strings, single-quoted strings, and the static segments of a template
 * literal (the parts between `${...}` holes). Interpolated expressions
 * themselves are never inspected — we only ever see literal text. */
function literalPartsIn(expr: string): string[] {
  const parts: string[] = [];
  for (const m of expr.matchAll(/"([^"]*)"/g)) parts.push(m[1]);
  for (const m of expr.matchAll(/'([^']*)'/g)) parts.push(m[1]);
  for (const m of expr.matchAll(/`([^`]*)`/gs)) {
    parts.push(...m[1].split(/\$\{[^}]*\}/));
  }
  return parts;
}

/** Pulls the balanced `{...}` expression after `className=`, if the
 * attribute is an expression rather than a plain string literal. */
function classNameExpressionIn(tag: string): string | null {
  const attrStart = tag.search(/className\s*=\s*\{/);
  if (attrStart === -1) return null;
  const braceStart = tag.indexOf("{", attrStart);
  let depth = 0;
  for (let i = braceStart; i < tag.length; i++) {
    if (tag[i] === "{") depth++;
    else if (tag[i] === "}") {
      depth--;
      if (depth === 0) return tag.slice(braceStart + 1, i);
    }
  }
  return null; // unbalanced — OPEN_TAG should never produce this
}

function widthTokensIn(tag: string): string[] {
  const literalValue = /className\s*=\s*"([^"]*)"/.exec(tag)?.[1];
  const parts = literalValue !== undefined
    ? [literalValue]
    : literalPartsIn(classNameExpressionIn(tag) ?? "");
  const tokens: string[] = [];
  for (const part of parts) {
    tokens.push(...part.split(/\s+/).filter((c) => WIDTH_TOKEN.test(c)));
  }
  return tokens;
}

export function offendersIn(text: string, label: string): string[] {
  const offenders: string[] = [];
  for (const match of text.matchAll(OPEN_TAG)) {
    const tag = match[0];
    if (!/\bsizing\s*=/.test(tag)) continue;
    const widthTokens = widthTokensIn(tag);
    if (widthTokens.length === 0) continue;
    const line = text.slice(0, match.index).split("\n").length;
    offenders.push(`${label}:${line} — sizing + ${widthTokens.join(", ")}`);
  }
  return offenders;
}

/** Every `PopoverContent` carrying a width token with neither `sizing` nor
 * the one-line `/* sizing: fixed — ... *\/` leave comment — an unclassified,
 * unadopted caller. */
export function unadoptedIn(text: string, label: string): string[] {
  const unadopted: string[] = [];
  for (const match of text.matchAll(OPEN_TAG)) {
    const tag = match[0];
    if (/\bsizing\s*=/.test(tag)) continue;
    if (LEAVE_COMMENT.test(tag)) continue;
    const widthTokens = widthTokensIn(tag);
    if (widthTokens.length === 0) continue;
    const line = text.slice(0, match.index).split("\n").length;
    unadopted.push(`${label}:${line} — width ${widthTokens.join(", ")} with no sizing and no leave comment`);
  }
  return unadopted;
}

describe("PopoverContent sizing/width-class guard", () => {
  it("flags a caller that passes sizing AND a width class (red twin, literal className)", () => {
    const planted = `
      <PopoverContent sizing="content" align="start" className="w-64 p-1">
        <span>Northbay Commercial Solar — Marisol Okonkwo, Site Superintendent</span>
      </PopoverContent>
    `;
    expect(offendersIn(planted, "planted.tsx")).toEqual([
      "planted.tsx:2 — sizing + w-64",
    ]);
  });

  it("flags a caller whose width lives inside a cn() expression className (red twin)", () => {
    const planted = `
      <PopoverContent sizing="content" align="start" className={cn("w-64 p-0", contentClassName)}>
        <span>Northbay Commercial Solar</span>
      </PopoverContent>
    `;
    expect(offendersIn(planted, "planted.tsx")).toEqual([
      "planted.tsx:2 — sizing + w-64",
    ]);
  });

  it("flags a caller whose width lives inside a ternary className (red twin)", () => {
    const planted = `
      <PopoverContent sizing="content" className={menuMode === "menu" ? "w-48 p-1" : "w-80 p-0"}>
        <span>Body</span>
      </PopoverContent>
    `;
    expect(offendersIn(planted, "planted.tsx")).toEqual([
      "planted.tsx:2 — sizing + w-48, w-80",
    ]);
  });

  it("flags a caller whose width lives inside a template literal className (red twin)", () => {
    const planted = "\n      <PopoverContent sizing=\"content\" className={`flex ${HEIGHT} w-96 flex-col`}>\n        <span>Body</span>\n      </PopoverContent>\n    ";
    expect(offendersIn(planted, "planted.tsx")).toEqual([
      "planted.tsx:2 — sizing + w-96",
    ]);
  });

  it("never lets a real caller pass sizing AND a pasted width class, literal or expression", () => {
    const offenders: string[] = [];
    for (const rel of sourceFiles()) {
      offenders.push(...offendersIn(readFileSync(join(REPO, rel), "utf8"), rel));
    }
    if (offenders.length > 0) {
      throw new Error(
        `PopoverContent caller(s) pass both 'sizing' and a width class — tailwind-merge lets one silently win over the other:\n${offenders.join("\n")}`,
      );
    }
    expect(offenders).toEqual([]);
  });

  it("flags an unclassified caller: a width token with neither sizing nor a leave comment (red twin)", () => {
    const planted = `
      <PopoverContent align="start" className={cn("w-72 p-0", extra)}>
        <span>Body</span>
      </PopoverContent>
    `;
    expect(unadoptedIn(planted, "planted.tsx")).toEqual([
      "planted.tsx:2 — width w-72 with no sizing and no leave comment",
    ]);
  });

  it("never leaves a real caller unclassified: every width token carries sizing or a leave comment", () => {
    const unadopted: string[] = [];
    for (const rel of sourceFiles()) {
      unadopted.push(...unadoptedIn(readFileSync(join(REPO, rel), "utf8"), rel));
    }
    if (unadopted.length > 0) {
      throw new Error(
        `PopoverContent caller(s) carry a width token with no 'sizing' and no '/* sizing: fixed — ... */' comment explaining why:\n${unadopted.join("\n")}`,
      );
    }
    expect(unadopted).toEqual([]);
  });
});

function sourceFiles(): string[] {
  const out = execFileSync(
    "grep",
    ["-rl", "--include=*.tsx", "PopoverContent", ...ROOTS],
    { cwd: REPO, encoding: "utf8" },
  );
  return out.split("\n").filter(Boolean);
}
