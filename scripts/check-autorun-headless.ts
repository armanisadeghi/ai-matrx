#!/usr/bin/env npx tsx
/**
 * check:autorun-headless — `autoRun: false` on a display mode that renders
 * nothing is a contradiction, and it silently deletes runs.
 *
 * 🚨 WHAT autoRun IS (Arman, 2026-08-25, after this class bit the app again):
 *
 *   "Auto Run is a user interface control that determines if the user
 *    interface will allow the user to interact prior to submitting or if the
 *    user interface will just let things go. If there is no user interface,
 *    it's impossible for autorun to have any impact at all because there is
 *    no ui."
 *
 * It answers exactly one question — does the interface stop and let the person
 * act before the request goes out — and it has NO authority over whether a run
 * happens. Click a button wired to an agent and that agent runs. Full stop.
 *
 * WHY THIS COMBINATION IS THE BUG. A headless mode (`HEADLESS_DISPLAY_MODES`
 * in `features/agents/utils/run-ui-utils.ts` — today: `background`) paints no
 * component, no composer, no button. `autoRun: false` there cannot mean "wait
 * for the user", because there is no user to wait for and nothing that would
 * ever send it afterwards. It means "never run", written as if it meant
 * "later". The launch thunk now refuses to obey it and runs anyway, screaming
 * — but a config that should never have been written is better caught where
 * it is written.
 *
 * Measured victim when this landed: `features/image-studio/hooks/
 * useImageStudio.ts` launched DESCRIBE with `{ autoRun: false, displayMode:
 * "background" }`, so that run never happened at all.
 *
 * `direct` is NOT headless and is deliberately not flagged: it means "no
 * overlay — the CALLER renders the interface", and callers do. `/chat`
 * (`features/cx-chat/hooks/useInstanceBootstrap.ts`) uses `direct` +
 * `autoRun: false` precisely so you can type before anything is sent.
 *
 * THE ONE LAWFUL FORM: a caller that will dispatch `executeInstance` itself,
 * because it must seed something the launch cannot carry (multi-part message
 * content — note that `runtime.userInput` and `runtime.variables` ARE seeded
 * before execution, so anything expressible there needs no deferral). Those
 * declare `callerExecutes: true` on the launch options, and this check treats
 * that declaration as the fix.
 *
 * HOW TO FIX A REAL ONE: drop `autoRun` (headless runs either way), or pass
 * `autoRun: true`. Only reach for `callerExecutes: true` if you genuinely
 * dispatch `executeInstance` yourself.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

/** Kept in lockstep with HEADLESS_DISPLAY_MODES. */
const HEADLESS_MODES = ["background"];

/**
 * How far above a `config:` literal to look for its sibling `callerExecutes`
 * declaration on the same launch-options object. It sits within a few lines in
 * practice; this is generous without reaching into a neighbouring call.
 */
const SIBLING_LOOKBEHIND_LINES = 30;

interface Violation {
  file: string;
  line: number;
  snippet: string;
}

function sourceFiles(): string[] {
  const out = execSync(
    `git ls-files '*.ts' '*.tsx' | grep -E '^(features|lib|app|components|hooks|utils)/'`,
    { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  return out.split("\n").filter(Boolean);
}

/**
 * Body of the object literal that starts at `openIdx` (the index of its `{`).
 * Brace-matched rather than line-windowed: the two keys must be in the SAME
 * config object to be the bug, and an unrelated `autoRun: false` a few lines
 * away in a neighbouring call is not a finding (it produced exactly that false
 * positive on the first run of this check).
 */
function literalBody(text: string, openIdx: number): string | null {
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
  }
  return null;
}

function scan(): Violation[] {
  const violations: Violation[] = [];
  const modeRe = new RegExp(
    `displayMode\\s*:\\s*["'\`](${HEADLESS_MODES.join("|")})["'\`]`,
  );
  const autoRunFalseRe = /autoRun\s*:\s*false\b/;
  const callerExecutesRe = /callerExecutes\s*:\s*true\b/;
  const configRe = /\bconfig\s*:\s*\{/g;

  for (const rel of sourceFiles()) {
    if (rel.includes("__tests__") || /\.test\.tsx?$/.test(rel)) continue;
    let text: string;
    try {
      text = readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      continue;
    }
    if (!modeRe.test(text) || !autoRunFalseRe.test(text)) continue;

    configRe.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = configRe.exec(text)) !== null) {
      const openIdx = text.indexOf("{", match.index);
      const body = literalBody(text, openIdx);
      if (!body) continue;
      if (!modeRe.test(body) || !autoRunFalseRe.test(body)) continue;

      const lineNo = text.slice(0, match.index).split("\n").length;
      const lines = text.split("\n");
      const from = Math.max(0, lineNo - 1 - SIBLING_LOOKBEHIND_LINES);
      const siblingWindow = lines.slice(from, lineNo).join("\n");
      if (callerExecutesRe.test(siblingWindow)) continue;

      violations.push({
        file: rel,
        line: lineNo,
        snippet: body.replace(/\s+/g, " ").slice(0, 120),
      });
    }
  }
  return violations;
}

function main(): void {
  const violations = scan();
  if (violations.length === 0) {
    console.log(
      "✅ autoRun is never paired with a headless display mode — no runs are being deleted by a UI flag.",
    );
    return;
  }

  console.error(
    "\n🚨 `autoRun: false` ON A MODE THAT RENDERS NO INTERFACE\n",
  );
  for (const v of violations) {
    console.error(`  ✗ ${v.file}:${v.line}  ${v.snippet}`);
  }
  console.error(
    "\nautoRun is a USER-INTERFACE control: it decides whether the interface pauses and\n" +
      "lets the person act before the request goes out. It has no say in whether a run\n" +
      `happens. A headless mode (${HEADLESS_MODES.join(", ")}) paints nothing — no component, no\n` +
      "composer, no button — so there is nobody to pause for and nothing that would ever\n" +
      "send it later. The flag reads as \"wait\" and behaves as \"throw the run away\".\n\n" +
      "FIX: drop `autoRun` (headless runs either way), or pass `autoRun: true`.\n" +
      "Only if you truly dispatch `executeInstance` yourself — because you seed something\n" +
      "the launch cannot carry — declare `callerExecutes: true` on the launch options.\n\n" +
      "The launch thunk already ignores this at runtime and logs loudly; this check exists\n" +
      "so the config is caught where it is written.\n",
  );
  process.exit(1);
}

main();
