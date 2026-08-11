/**
 * Runs the repo's REAL ESLint config and turns the result into the lint-debt
 * report contract.
 *
 * WHY NOT A SECOND SET OF RULES. `scripts/dead-ends/scan.ts` implements its own
 * AST rules because it asks a question ESLint cannot (it reads the entity
 * registry). This scanner asks the opposite question — "what does our lint
 * config actually say about this tree?" — so re-implementing anything here
 * would create a second authority that can disagree with `npx eslint`. It
 * shells into the ESLint Node API instead, with the same config resolution the
 * CLI uses, so the number on the scoreboard is the number a human gets.
 *
 * ERRORS ONLY, deliberately. Warnings in this repo are the loud-but-advisory
 * doctrine rules (`matrx/no-bare-id-text`, `no-barrel-files`, …) which already
 * have their own scoreboards and would triple the snapshot for a campaign that
 * is not about them. `--quiet` is the CLI equivalent, and it is what the
 * baseline was measured with.
 */

import { ESLint } from "eslint";
import { relative, sep } from "node:path";
import { classOf, isReal, type LintDebtFinding } from "./types";
import { featureOf, routeOf } from "../dead-ends/scan";

/** Long ESLint messages (the compiler lints run to paragraphs) get cut here. */
const MESSAGE_MAX = 240;

export interface ScanResult {
  findings: LintDebtFinding[];
  filesScanned: number;
}

function toPosix(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join("/");
}

export async function scanRepo(root: string, targets: string[] = ["."]): Promise<ScanResult> {
  const eslint = new ESLint({ cwd: root, errorOnUnmatchedPattern: false });
  const results = await eslint.lintFiles(targets);

  const findings: LintDebtFinding[] = [];
  for (const result of results) {
    const file = toPosix(root, result.filePath);
    for (const message of result.messages) {
      // severity 2 = error. Warnings are out of scope — see the header.
      if (message.severity !== 2) continue;
      // A fatal parse error has no ruleId; it is a broken file, not lint debt,
      // and silently bucketing it as `(none)` would hide a genuinely broken
      // checkout inside a style backlog.
      const rule = message.ruleId ?? "(parse error)";
      // The compiler lints are multi-paragraph. Collapsed to one line so a
      // finding stays one row in the terminal AND one cell on the scoreboard;
      // the full text is always one `npx eslint <file>` away.
      const flat = message.message.replace(/\s+/g, " ").trim();
      findings.push({
        file,
        line: message.line ?? 0,
        column: message.column ?? 0,
        rule,
        feature: featureOf(file),
        route: routeOf(file),
        message: flat.length > MESSAGE_MAX ? `${flat.slice(0, MESSAGE_MAX - 1)}…` : flat,
      });
    }
  }

  findings.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
  );
  return { findings, filesScanned: results.length };
}

export { classOf, isReal };
