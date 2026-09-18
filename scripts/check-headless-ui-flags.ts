#!/usr/bin/env npx tsx
/**
 * check:headless-ui-flags — a user-interface flag on a display mode that
 * renders nothing is a contradiction, and two of them silently delete runs.
 *
 * TWO SHAPES OF THE SAME DEFECT, both scanned here:
 *   1. `autoRun: false` on a headless mode (the original, measured victim
 *      below).
 *   2. Any INTERFACE-ONLY flag set true on a headless mode —
 *      `showPreExecutionGate`, `showVariablePanel`, `allowChat`. The gate is
 *      the dangerous one: it holds the run behind an overlay nobody can press.
 *      Ruled in on 2026-09-12 ("sweep them now") by the same laws that
 *      produced the autoRun repair — nothing fails silently, fix the class.
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
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = path.resolve(__dirname, "..");

/** Kept in lockstep with HEADLESS_DISPLAY_MODES. */
const HEADLESS_MODES = ["background"];

/** Kept in lockstep with INTERFACE_ONLY_LAUNCH_FLAGS. */
const INTERFACE_ONLY_FLAGS = [
  "showPreExecutionGate",
  "showVariablePanel",
  "allowChat",
];

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
  /** `autoRun` for the original shape, otherwise the interface-only flag. */
  flag: string;
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
  const interfaceFlagRes = INTERFACE_ONLY_FLAGS.map(
    (flag) => [flag, new RegExp(`${flag}\\s*:\\s*true\\b`)] as const,
  );

  for (const rel of sourceFiles()) {
    if (rel.includes("__tests__") || /\.test\.tsx?$/.test(rel)) continue;
    let text: string;
    try {
      text = readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      continue;
    }
    const anyFlagInFile =
      autoRunFalseRe.test(text) ||
      interfaceFlagRes.some(([, re]) => re.test(text));
    if (!modeRe.test(text) || !anyFlagInFile) continue;

    configRe.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = configRe.exec(text)) !== null) {
      const openIdx = text.indexOf("{", match.index);
      const body = literalBody(text, openIdx);
      if (!body) continue;
      if (!modeRe.test(body)) continue;

      const lineNo = text.slice(0, match.index).split("\n").length;
      const lines = text.split("\n");
      const from = Math.max(0, lineNo - 1 - SIBLING_LOOKBEHIND_LINES);
      const siblingWindow = lines.slice(from, lineNo).join("\n");
      const snippet = body.replace(/\s+/g, " ").slice(0, 120);

      // `callerExecutes: true` is the one lawful deferral, and it excuses
      // ONLY the autoRun shape — it is a claim about who sends the run, not a
      // licence to paint an interface on a mode that paints nothing.
      if (autoRunFalseRe.test(body) && !callerExecutesRe.test(siblingWindow)) {
        violations.push({ file: rel, line: lineNo, snippet, flag: "autoRun" });
      }
      for (const [flag, re] of interfaceFlagRes) {
        if (re.test(body)) {
          violations.push({ file: rel, line: lineNo, snippet, flag });
        }
      }
    }
  }
  return violations;
}

function main(): void {
  const violations = scan();
  if (violations.length === 0) {
    console.log(
      "✅ No user-interface flag is aimed at a headless display mode — no runs are being deleted by a UI flag.",
    );
    return;
  }

  console.error("\n🚨 A USER-INTERFACE FLAG ON A MODE THAT RENDERS NO INTERFACE\n");
  for (const v of violations) {
    console.error(`  ✗ ${v.file}:${v.line}  [${v.flag}]  ${v.snippet}`);
  }
  console.error(
    `\nA headless mode (${HEADLESS_MODES.join(", ")}) paints nothing — no component, no composer,\n` +
      "no button. Every flag below answers a question about what a PERSON sees, so on those\n" +
      "modes each one describes an interface that does not exist.\n\n" +
      "  autoRun: false            — reads as \"wait\", behaves as \"throw the run away\": there is\n" +
      "                              nobody to pause for and nothing that would ever send it.\n" +
      "  showPreExecutionGate:true — same deletion, different door: the launch returns early\n" +
      "                              behind a gate overlay nobody can ever press.\n" +
      "  showVariablePanel: true   — paints a panel on a surface that paints nothing.\n" +
      "  allowChat: true           — offers a composer that does not exist.\n\n" +
      "FIX: drop the flag (headless runs either way), or launch on a display mode that\n" +
      "actually paints something. For `autoRun` only, a caller that truly dispatches\n" +
      "`executeInstance` itself — because it seeds something the launch cannot carry —\n" +
      "declares `callerExecutes: true` on the launch options.\n\n" +
      "The launch thunk already ignores all of these at runtime and logs loudly; this check\n" +
      "exists so the config is caught where it is written.\n",
  );
  exitAfterDrain(1);
}

main();
