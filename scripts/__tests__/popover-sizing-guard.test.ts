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
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const REPO = join(__dirname, "..", "..");
const ROOTS = ["app", "features", "components", "lib"];

// One <PopoverContent ...> opening tag. JSX attribute values never contain a
// raw `>`, so this simple scan is safe.
const OPEN_TAG = /<PopoverContent\b[^>]*?\/?>/gs;
const WIDTH_TOKEN = /^(w-|min-w-|max-w-)/;

function sourceFiles(): string[] {
  const out = execFileSync(
    "grep",
    ["-rl", "--include=*.tsx", "PopoverContent", ...ROOTS],
    { cwd: REPO, encoding: "utf8" },
  );
  return out.split("\n").filter(Boolean);
}

function widthTokensIn(tag: string): string[] {
  const classValue = /className\s*=\s*"([^"]*)"/.exec(tag)?.[1];
  if (!classValue) return [];
  return classValue.split(/\s+/).filter((c) => WIDTH_TOKEN.test(c));
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

describe("PopoverContent sizing/width-class guard", () => {
  it("flags a caller that passes sizing AND a width class (red twin)", () => {
    const planted = `
      <PopoverContent sizing="content" align="start" className="w-64 p-1">
        <span>Northbay Commercial Solar — Marisol Okonkwo, Site Superintendent</span>
      </PopoverContent>
    `;
    expect(offendersIn(planted, "planted.tsx")).toEqual([
      "planted.tsx:2 — sizing + w-64",
    ]);
  });

  it("never lets a real caller pass sizing AND a pasted width class", () => {
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
});
