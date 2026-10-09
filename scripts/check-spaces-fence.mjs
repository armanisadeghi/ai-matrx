#!/usr/bin/env node
// scripts/check-spaces-fence.mjs — THE SPACES FENCE (Arman, 2026-10-05).
//
// Spaces is built clean beside everything we have, by a dedicated builder lane that copies Notion
// exactly "without anything that touches things we already have". This guard makes that a rule the
// system enforces, not a promise:
//
//   1. every commit whose subject starts with `spaces:` or `spaces(` touches ONLY the fence;
//   2. no file outside the fence imports from it (nothing we already have may come to depend on it
//      before the one switch-over);
//   3. no scratch file is tracked inside the fence: a `*.tmp.*` file (a walk's throwaway probe) is never
//      committed (round 27: 35 `*.tmp.mjs` probes had piled up in features/spaces/__tests__/walk/).
//
// A `spaces:` commit may also touch this guard itself (the builder lane is asked to tighten it).
//
// The fence: features/spaces/** and app/(core)/spaces/**. The owner session's own connection work
// (storage, data sources, AI wiring) is committed under other prefixes and is not judged here.
//
//   node scripts/check-spaces-fence.mjs              # judge history since the fence was laid
//   node scripts/check-spaces-fence.mjs --self-test  # prove both checks can fail, then pass
//
// SoR: common-docs/systems/content/spaces/STATE.md § The fence.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FENCE = [/^features\/spaces\//, /^app\/\(core\)\/spaces\//];
const FENCE_LAID = "2026-10-05";
const SUBJECT = /^spaces[:(]/;
// The ONE door out of the fence before the switch-over (owner, 2026-10-05): the record-page body slot of
// @ai-matrx/records-ui renders a row's body Space through this entry. Add an entry only by owner decision.
// The public web page of a published Space (`app/(link)/site/[slug]`, Notion Publish — phase 6, owner brief
// 2026-10-07): the read-only page and the read of its one door.
const ENTRY_POINTS = [/features\/spaces\/embed\/RecordBodySpace["'/]/, /features\/spaces\/embed\/useSpaceBuild["'/]/, /features\/spaces\/state\/templates["'/]/, /features\/spaces\/sidebar\/TemplateGalleryShell["'/]/, /features\/spaces\/public\/(?:PublicSpace|public-view)["'/]/, /features\/spaces\/spaces\.css["']/];
const IMPORT_INTO_FENCE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'](?:@\/features\/spaces(?:\/|["'])|[./]+(?:[^"']*\/)?features\/spaces(?:\/|["']))/;

export function insideFence(path) {
  return FENCE.some((re) => re.test(path));
}

const SELF = "scripts/check-spaces-fence.mjs";
// The stored block format and its live schema (lib/spaces-blocks/**): a `spaces:` commit may change it by owner
// brief (rounds 31-32, 2026-10-07: "Changes to lib/spaces-blocks ... are allowed this round"), so the format and the
// editor that writes it land in step. Nothing else outside the fence is opened.
// Adopting a package the Spaces change uses (owner, 2026-10-07): package.json + pnpm-lock.yaml may ride a
// `spaces:` commit, so the import and the version that carries it land together (never import before install).
const OWNER_OPENED = [/^lib\/spaces-blocks\//, /^package\.json$/, /^pnpm-lock\.yaml$/];
const SCRATCH = /(?:^|\/)[^/]*\.tmp\.[^/]+$/;

/** Tracked paths → violations for scratch (`*.tmp.*`) files inside the fence. */
export function judgeTracked(paths) {
  return paths.filter((p) => insideFence(p) && SCRATCH.test(p)).map((p) => `${p} is a scratch file (*.tmp.*) tracked inside the fence — git rm it`);
}

/** Commits: [{ sha, subject, files[] }] → violations for `spaces:` commits that leave the fence. */
export function judgeCommits(commits) {
  const out = [];
  for (const c of commits) {
    if (!SUBJECT.test(c.subject)) continue;
    for (const f of c.files) if (!insideFence(f) && f !== SELF && !OWNER_OPENED.some((re) => re.test(f))) out.push(`${c.sha.slice(0, 10)} "${c.subject}" touches ${f}`);
  }
  return out;
}

/** Files: [{ path, source }] → violations for files outside the fence importing from it. */
export function judgeImports(files) {
  const out = [];
  for (const f of files) {
    if (insideFence(f.path)) continue;
    const line = f.source.split("\n").findIndex((l) => IMPORT_INTO_FENCE.test(l) && !ENTRY_POINTS.some((re) => re.test(l)));
    if (line >= 0) out.push(`${f.path}:${line + 1} imports from the Spaces fence`);
  }
  return out;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function liveCommits() {
  const log = git(["log", `--since=${FENCE_LAID}`, "--format=%H%x09%s"]).trim();
  if (!log) return [];
  return log
    .split("\n")
    .map((row) => {
      const [sha, ...rest] = row.split("\t");
      return { sha, subject: rest.join("\t") };
    })
    .filter((c) => SUBJECT.test(c.subject))
    .map((c) => ({ ...c, files: git(["show", "--name-only", "--format=", c.sha]).trim().split("\n").filter(Boolean) }));
}

function liveFiles() {
  return git(["ls-files", "*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs"])
    .trim()
    .split("\n")
    // A test outside the fence may exercise Spaces (e.g. a platform iframe-isolation test covering Spaces
    // embeds): tests are not app code, so they never couple the app to the fence (owner, 2026-10-08).
    .filter((p) => p && !insideFence(p) && !p.startsWith("node_modules/") && p !== "scripts/check-spaces-fence.mjs" && !/(^|\/)__tests__\/|\.test\.[jt]sx?$/.test(p))
    .map((path) => {
      try {
        return { path, source: readFileSync(path, "utf8") };
      } catch {
        return { path, source: "" };
      }
    });
}

function selfTest() {
  const failures = [];
  const expect = (name, got, wantCount) => {
    if (got.length !== wantCount) failures.push(`${name}: expected ${wantCount} violation(s), got ${got.length} ${JSON.stringify(got)}`);
  };
  expect("planted commit leaves the fence", judgeCommits([{ sha: "a".repeat(40), subject: "spaces: columns", files: ["features/spaces/blocks/Columns.tsx", "features/notes/NoteEditor.tsx"] }]), 1);
  expect("route commit inside the fence", judgeCommits([{ sha: "b".repeat(40), subject: "spaces(sidebar): tree", files: ["app/(core)/spaces/page.tsx", "features/spaces/sidebar/Tree.tsx"] }]), 0);
  expect("non-spaces commit is not judged", judgeCommits([{ sha: "c".repeat(40), subject: "fix(notes): save", files: ["features/notes/x.ts"] }]), 0);
  expect("alias import from outside", judgeImports([{ path: "features/notes/a.tsx", source: 'import { X } from "@/features/spaces/blocks";' }]), 1);
  expect("relative import from outside", judgeImports([{ path: "components/b.tsx", source: 'const m = await import("../features/spaces/editor");' }]), 1);
  expect("import inside the fence", judgeImports([{ path: "features/spaces/a.tsx", source: 'import { X } from "@/features/spaces/blocks";' }]), 0);
  expect("the named entry point may be imported", judgeImports([{ path: "features/data-tables/records-ui-host/recordsUiHost.tsx", source: 'import { RecordBodySpace } from "@/features/spaces/embed/RecordBodySpace";' }]), 0);
  expect("a sibling of the entry point may not", judgeImports([{ path: "features/data-tables/x.tsx", source: 'import { useRowBodySpace } from "@/features/spaces/embed/useRowBody";' }]), 1);
  expect("look-alike name is not the fence", judgeImports([{ path: "features/notes/c.tsx", source: 'import { Y } from "@/features/spaces-old/z";' }]), 0);
  expect("a spaces: commit may tighten the guard itself", judgeCommits([{ sha: "d".repeat(40), subject: "spaces: guard", files: ["scripts/check-spaces-fence.mjs", "features/spaces/a.ts"] }]), 0);
  expect("tracked scratch probe inside the fence", judgeTracked(["features/spaces/__tests__/walk/probe.tmp.mjs", "app/(core)/spaces/x.tmp.ts"]), 2);
  expect("real walk and scratch-looking names outside the fence pass", judgeTracked(["features/spaces/__tests__/walk/lib.mjs", "features/spaces/tmp/notes.ts", "scripts/.cls-probe.tmp.mjs"]), 0);
  if (failures.length) {
    console.error(`check:spaces-fence self-test FAILED\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log("check:spaces-fence self-test passed (12 cases: planted violations fail, clean cases pass)");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const tracked = git(["ls-files", "features/spaces", "app/(core)/spaces"]).trim().split("\n").filter(Boolean);
  const violations = [...judgeCommits(liveCommits()), ...judgeImports(liveFiles()), ...judgeTracked(tracked)];
  if (violations.length) {
    console.error(`check:spaces-fence FAILED — the Spaces builder left its fence:\n  ${violations.join("\n  ")}`);
    process.exit(1);
  }
  console.log("check:spaces-fence passed — Spaces commits stay inside the fence, nothing outside imports it, no scratch file is tracked in it");
}
