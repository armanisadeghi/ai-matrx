#!/usr/bin/env npx tsx
/**
 * check:blocking-dialogs — THE NO-BLOCKING-LAYERS GUARD (register
 * common-docs/projects/ai-reachable-everywhere/REGISTER.md, ARE-008).
 *
 * Arman, 2026-09-23: a blocking settings dialog hid every AI door on the page
 * — "We should never have this happen." Since `@ai-matrx/design-system`
 * 0.38.0 a desktop `Dialog` is a non-blocking window unless the caller forces
 * `modal`. This guard keeps it that way. It fails on:
 *
 *   1. a `<Dialog …>` (or `<DialogPrimitive.Root …>`) that forces blocking —
 *      a bare `modal`, `modal={true}`, or `modal={<expression>}` — outside the
 *      allowlist. `modal={false}` is always fine. A yes/no confirmation is
 *      `ConfirmDialog` / `AlertDialog`, a different component, and never
 *      flagged.
 *   2. a file importing `@radix-ui/react-dialog` directly — a hand-built dialog
 *      silently skips the window default — outside the allowlist.
 *   3. a CONFIRMATION built on the ordinary Dialog: a `DialogTitle` that reads
 *      like one (Delete, Remove, Discard, Are you sure, Permanently, Revoke …).
 *      Since the Dialog became a non-blocking window, such a confirmation no
 *      longer blocks — found live on the data table's "Delete row?" on
 *      2026-09-23. A confirmation is `ConfirmDialog` / `AlertDialog`.
 *
 * Every allowlist entry carries a reason; an entry that no longer matches
 * anything fails too, so the list only shrinks.
 *
 *   pnpm check:blocking-dialogs             scan the repo
 *   pnpm check:blocking-dialogs --self-test prove the matcher catches planted violations
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "features", "lib", "hooks", "providers"];
const ALLOWLIST_PATH = "scripts/blocking-dialogs-allowlist.json";

type Allow = { file: string; kind: "forced-modal" | "direct-radix" | "confirmation-on-dialog"; reason: string };
type Finding = { file: string; line: number; kind: Allow["kind"]; text: string };

/** Opening tags of a Dialog root, possibly spanning lines. */
const DIALOG_OPEN_TAG = /<(Dialog|DialogPrimitive\.Root)(\s[^>]*?)?>/gs;
/** A `modal` prop that is not literally `{false}`. */
const FORCED_MODAL = /(^|\s)modal(?!\s*=\s*\{\s*false\s*\})(\s*=\s*\{[^}]*\}|\s*=\s*"[^"]*"|(?=[\s/>]|$))/;
const DIRECT_RADIX = /from\s+["']@radix-ui\/react-dialog["']/;
/** A DialogTitle whose text reads like a confirmation of an irreversible act. */
const CONFIRM_TITLE =
  /<DialogTitle\b[^>]*>[^<]*\b(Delete|Remove|Discard|Are you sure|Permanently|Revoke|Overwrite|Destroy|Erase)\b/;

export function findViolations(file: string, source: string): Finding[] {
  const findings: Finding[] = [];
  for (const match of source.matchAll(DIALOG_OPEN_TAG)) {
    const attrs = match[2] ?? "";
    if (FORCED_MODAL.test(attrs)) {
      const line = source.slice(0, match.index).split("\n").length;
      findings.push({ file, line, kind: "forced-modal", text: match[0].replace(/\s+/g, " ").slice(0, 120) });
    }
  }
  if (source.includes("<DialogContent")) {
    const title = source.match(CONFIRM_TITLE);
    if (title && title.index !== undefined) {
      const line = source.slice(0, title.index).split("\n").length;
      findings.push({ file, line, kind: "confirmation-on-dialog", text: title[0].slice(0, 120) });
    }
  }
  const radix = source.match(DIRECT_RADIX);
  if (radix && radix.index !== undefined) {
    const line = source.slice(0, radix.index).split("\n").length;
    findings.push({ file, line, kind: "direct-radix", text: radix[0] });
  }
  return findings;
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name) && !/\.(test|spec)\.tsx$/.test(name)) out.push(full);
  }
}

function selfTest(): number {
  const cases: { name: string; src: string; expect: number }[] = [
    { name: "bare modal", src: `<Dialog open modal onOpenChange={x}>`, expect: 1 },
    { name: "modal={true}", src: `<Dialog modal={true} open>`, expect: 1 },
    { name: "modal={isX}", src: `<Dialog\n  open={o}\n  modal={isPhone}\n>`, expect: 1 },
    { name: "Radix root", src: `<DialogPrimitive.Root modal>`, expect: 1 },
    { name: "direct radix import", src: `import * as D from "@radix-ui/react-dialog";`, expect: 1 },
    { name: "modal={false} is fine", src: `<Dialog modal={false} open>`, expect: 0 },
    { name: "no modal is fine", src: `<Dialog open onOpenChange={x}>`, expect: 0 },
    { name: "DialogContent is not a root", src: `<DialogContent modal>`, expect: 0 },
    { name: "AlertDialog is a confirmation", src: `<AlertDialog open>`, expect: 0 },
    {
      name: "a confirmation on the ordinary Dialog",
      src: `<Dialog open><DialogContent><DialogTitle>Delete this row?</DialogTitle></DialogContent></Dialog>`,
      expect: 1,
    },
    {
      name: "an ordinary titled dialog is fine",
      src: `<Dialog open><DialogContent><DialogTitle>Column settings</DialogTitle></DialogContent></Dialog>`,
      expect: 0,
    },
    {
      name: "a confirmation on AlertDialog is fine",
      src: `<AlertDialog open><AlertDialogContent><AlertDialogTitle>Delete this row?</AlertDialogTitle></AlertDialogContent></AlertDialog>`,
      expect: 0,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = findViolations("fixture.tsx", c.src).length;
    const ok = got === c.expect;
    if (!ok) failed += 1;
    console.log(`${ok ? "ok  " : "FAIL"} ${c.name} (expected ${c.expect}, got ${got})`);
  }
  if (failed) {
    console.error(`self-test: ${failed} case(s) wrong — the guard would not catch what it claims to`);
    return 1;
  }
  console.log("self-test: the matcher catches every planted violation and passes every allowed form");
  return 0;
}

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();
  const allow: Allow[] = JSON.parse(readFileSync(join(ROOT, ALLOWLIST_PATH), "utf8")).entries ?? [];
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), files);
  const findings = files.flatMap((f) => findViolations(relative(ROOT, f), readFileSync(f, "utf8")));
  const used = new Set<string>();
  const offending = findings.filter((f) => {
    const hit = allow.find((a) => a.file === f.file && a.kind === f.kind);
    if (hit) used.add(`${hit.file}::${hit.kind}`);
    return !hit;
  });
  const stale = allow.filter((a) => !used.has(`${a.file}::${a.kind}`));
  for (const f of offending) {
    console.error(
      `${f.file}:${f.line}  ${
        f.kind === "forced-modal"
          ? "forces a BLOCKING dialog"
          : f.kind === "direct-radix"
            ? "builds a dialog straight on Radix"
            : "is a CONFIRMATION built on the non-blocking Dialog — use ConfirmDialog / AlertDialog"
      } — ${f.text}`,
    );
  }
  for (const a of stale) console.error(`${ALLOWLIST_PATH}: stale entry ${a.file} (${a.kind}) — delete it`);
  if (offending.length || stale.length) {
    console.error(
      `\ncheck:blocking-dialogs FAILED. A desktop dialog must not block the page (register ARE-008): drop \`modal\`, ` +
        `use ConfirmDialog for a yes/no confirmation, or build on @ai-matrx/design-system Dialog. ` +
        `A genuine exception goes in ${ALLOWLIST_PATH} with its reason.`,
    );
    return 1;
  }
  console.log(`check:blocking-dialogs OK — ${files.length} files, ${allow.length} allowlisted with reasons.`);
  return 0;
}

process.exit(main());
