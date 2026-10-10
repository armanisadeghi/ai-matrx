/**
 * @jest-environment node
 *
 * EVERY UPDATE OF AN EXISTING RECORD CARRIES THE VERSION THE PERSON SAW — THE CENSUS (lane 10 VWF).
 *
 * The store's update doors (`record_update`, `record_update_adding_choices`, `record_change_many`,
 * `pipeline_move`, `pipeline_move_many`, and the restore doors `value_restore` / `record_restore_version`)
 * are last-write-wins when handed no version: a screen that forgets it silently overwrites a
 * colleague. So in matrx-frontend those doors are called in ONE place, `lib/records/record-versions.ts`,
 * whose write doors refuse an unread version. Anywhere else:
 *   · a records-client method call (`.recordUpdate(`, `.recordChangeMany(`, ...) is RED;
 *   · a door called by name (`rpc("record_update", ...)`, a grid door) is RED unless the call names
 *     `p_expected_version` with something other than `null`.
 * The few known-open places are listed below WITH THEIR OWNER and an exact count, so a new one in
 * the same file is still red.
 *
 * Red proof without touching the tree: `CENSUS_REV=<commit> jest <this file>` scans that commit's
 * files through `git show` (2026-10-02: the commit before lane VWF is red on 16 calls in 7 files).
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const THE_ONE_PLACE = "lib/records/record-versions.ts";

const METHODS = ["recordUpdate", "recordUpdateAddingChoices", "recordChangeMany", "pipelineMove", "pipelineMoveMany", "valueRestore", "restoreVersion"];
const DOORS = ["record_update", "record_update_adding_choices", "record_change_many", "pipeline_move", "pipeline_move_many", "value_restore", "record_restore_version"];

/** Receivers that are not the record store (a file's own version history). */
const NOT_THE_STORE = [/\bVersions\.restoreVersion\(/, /\bactions\.restoreVersion\(/];

/**
 * KNOWN OPEN, each with its owner and its exact count. A count that goes DOWN is green (fixed); a
 * count that goes UP is red.
 */
const OPEN: Record<string, { count: number; owner: string }> = {
  "features/content-ir/records/kind-record-service.ts": { count: 1, owner: "SUITE-ROOTS-3 triage — the kind record write has no seen version at the call; the kind editor must hold it" },
  "features/rich-document/annotations/storeRecordLink.ts": { count: 1, owner: "SUITE-ROOTS-3 triage — record_update rpc for a link; the annotation must carry the version it read" },
  "features/spaces/data/page-database-live-proof.ts": { count: 1, owner: "SUITE-ROOTS-3 triage — a live-proof script that edits a row on purpose through a second client" },
  "features/spaces/editor/button-block.tsx": { count: 1, owner: "SUITE-ROOTS-3 triage — the button's batch of changes; the block must hold each row's seen version" },
  "features/data-tables/data-source/record-store.ts": {
    count: 4,
    owner:
      "lane 10 — the TABLE's own record (row label, name/description, default sort, a just-declared table's description): live custom.record_headers does not answer Tables yet; needs the package's readTableVersionNow (revisions) + resend-on-winning-version",
  },
};

export type Finding = { file: string; line: number; text: string };

/** The census of one tree: every update-door call that does not carry a version. */
export function census(files: ReadonlyMap<string, string>): Finding[] {
  const out: Finding[] = [];
  const methodRe = new RegExp(`\\.(${METHODS.join("|")})\\(`);
  const doorRe = new RegExp(`["'](${DOORS.join("|")})["']`);
  for (const [file, text] of files) {
    if (file === THE_ONE_PLACE) continue;
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      if (methodRe.test(line) && !NOT_THE_STORE.some((re) => re.test(line))) {
        out.push({ file, line: i + 1, text: trimmed });
        return;
      }
      // A door called by name: `rpc("record_update", {...})` or a grid door `callGridDoor(home, "record_update...", {...})`.
      if (doorRe.test(line) && /(rpc|callGridDoor|Door)\s*(<[^>]*>)?\(/.test(line + (lines[i - 1] ?? ""))) {
        const call = lines.slice(i, i + 12).join("\n");
        const named = /p_expected_version\s*:\s*([^,\n}]+)/.exec(call);
        if (!named || /^null\b/.test(named[1]!.trim())) out.push({ file, line: i + 1, text: trimmed });
      }
    });
  }
  return out;
}

function sourceFilesAt(rev: string | undefined): Map<string, string> {
  const mention = "record_|recordUpdate|recordChangeMany|pipelineMove|valueRestore|restoreVersion";
  const listed = rev
    ? execFileSync("git", ["grep", "-l", "-E", mention, rev, "--", "*.ts", "*.tsx"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 })
        .split("\n")
        .map((line) => line.replace(`${rev}:`, ""))
        .join("\n")
    : execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
  const files = new Map<string, string>();
  for (const file of listed.split("\n")) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    if (/(^|\/)(node_modules|__tests__|\.next)\//.test(file) || /\.(test|spec)\.tsx?$/.test(file)) continue;
    if (file.startsWith("scripts/") || file.startsWith("packages/")) continue; // operator scripts and the chat package's stream events
    let text: string;
    try {
      text = rev
        ? execFileSync("git", ["show", `${rev}:${file}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 })
        : readFileSync(join(ROOT, file), "utf8");
    } catch {
      continue;
    }
    if (!/record_|recordUpdate|recordChangeMany|pipelineMove|valueRestore|restoreVersion/.test(text)) continue;
    files.set(file, text);
  }
  return files;
}

describe("every update of a record in matrx-frontend carries the version the person saw", () => {
  it("the tree has no update-door call outside the one place, beyond the owned open list", () => {
    const findings = census(sourceFilesAt(process.env.CENSUS_REV));
    const byFile = new Map<string, Finding[]>();
    for (const f of findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);
    const red: string[] = [];
    for (const [file, found] of byFile) {
      const open = OPEN[file];
      if (open && found.length <= open.count) continue;
      for (const f of found) red.push(`${f.file}:${f.line}  ${f.text}`);
    }
    expect(red).toEqual([]);
  });

  it("a planted versionless update is red; the same update through the one place is green", () => {
    const planted = new Map([
      ["features/planted/a.ts", "const r = await client.recordUpdate({ record_id: id, patch });"],
      ["features/planted/b.ts", 'await doors.rpc("record_update", {\n  p_record_id: id,\n  p_patch: patch,\n  p_expected_version: null,\n});'],
      ["features/planted/c.ts", 'await doors.rpc("record_change_many", {\n  p_table_id: t,\n  p_changes: changes,\n});'],
    ]);
    expect(census(planted).map((f) => f.file)).toEqual(["features/planted/a.ts", "features/planted/b.ts", "features/planted/c.ts"]);
    const fixed = new Map([
      ["features/planted/a.ts", "const r = await updateRecordAt(client, { record_id: id, patch, version: seen });"],
      ["features/planted/b.ts", 'await doors.rpc("record_update", {\n  p_record_id: id,\n  p_patch: patch,\n  p_expected_version: args.expectedVersion,\n});'],
    ]);
    expect(census(fixed)).toEqual([]);
  });
});
