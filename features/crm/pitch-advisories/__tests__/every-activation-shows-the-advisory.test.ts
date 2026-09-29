/**
 * EVERY PATH THAT ACTIVATES AN OUTREACH LIST SHOWS THE PITCH ADVISORY FIRST.
 *
 * Activating a list starts its cadence — every member gets the first step — so it is a
 * send of the whole list. On 2026-09-29 an acceptance walk found "Start outreach list" on
 * the list detail page flipping the list to active with no advisory, while "Activate" on
 * the board showed one: two doors, one gate. The class fix: the ONE activation write is
 * `activateOutreachList`, and the ONE caller of it is `ActivateOutreachListDialog`, which
 * renders the advisory above its (always-live) confirm button. `setOutreachListStatus`
 * refuses "active" at run time, and nothing else may write `status` on `crm.outreach_list`.
 *
 * This scans every tracked source file, so a NEW activation path fails here by name.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const DIALOG = "features/crm/pitch-advisories/ActivateOutreachListDialog.tsx";
const SERVICE = "features/crm/outreach-lists/service.ts";

function sourceFiles(): string[] {
  // Every tracked file that names an outreach list at all (untracked files are included
  // too, so a new path fails before its first commit).
  return execSync(
    "git grep -l --untracked -E 'outreach_list|OutreachList' -- '*.ts' '*.tsx'",
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.includes("__tests__/") && !/\.test\.tsx?$/.test(f))
    .filter((f) => !f.startsWith("types/"));
}

function read(relative: string): string {
  try {
    return readFileSync(join(REPO_ROOT, relative), "utf8");
  } catch {
    return ""; // deleted-but-tracked in a busy shared checkout
  }
}

const files = sourceFiles();

test("the only caller of activateOutreachList is the advisory dialog", () => {
  const callers = files.filter(
    (f) => f !== SERVICE && /\bactivateOutreachList\s*\(/.test(read(f)),
  );
  expect(callers).toEqual([DIALOG]);
});

test("nothing sets an outreach list active through the generic status setter", () => {
  // (The service itself names "active" only to exclude it from the setter's type.)
  const offenders = files.filter(
    (f) => f !== SERVICE && /setOutreachListStatus\s*\([^)]*["']active["']/.test(read(f)),
  );
  expect(offenders).toEqual([]);
});

test("no file other than the list service writes crm.outreach_list status directly", () => {
  const offenders = files.filter((f) => {
    if (f === SERVICE) return false;
    const src = read(f);
    return /from\(\s*["']outreach_list["']\s*\)\s*\.update\(/.test(src.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \./g, "."));
  });
  expect(offenders).toEqual([]);
});

test("the advisory dialog renders the pitch advisory for the list it activates", () => {
  const src = read(DIALOG);
  expect(src).toMatch(/<PitchAdvisoryConfirmDialog/);
  expect(src).toMatch(/surface:\s*["']list_send["']/);
  expect(src).toMatch(/outreach_list_id:\s*list\.id/);
});
