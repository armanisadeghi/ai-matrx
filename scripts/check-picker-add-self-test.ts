#!/usr/bin/env npx tsx
/**
 * check:picker-add:self-test — proves the P23 detector RED on the shapes the
 * law forbids and GREEN on the shapes it asks for.
 *
 * A guard you cannot demonstrate failing is not a guard (law 3). Until
 * 2026-09-18 `check:picker-add` shipped no self-test, so nothing proved that
 * the detector still catches the door-only picker it was written for — and it
 * did NOT catch a picker whose only P11 answer was a sentence (PNI-000 F4).
 *
 * Nothing here is manufactured where history can supply the real thing:
 *   • RED-1 is the REAL `ContextItemPicker.tsx` as it stood before the fix
 *     (`839d3c8a75^`) — the door-only cascade Arman ruled on;
 *   • GREEN-1 is the REAL shipped file at HEAD.
 * The other three are minimal fixtures for shapes no file in this repo has:
 * a caption with no write path, a P11 sentence with no alternative, a P11
 * sentence whose only alternative is a COMMENT, and a P11 control that pairs
 * its sentence with a live `lockedAction`.
 *
 * Each case is a throwaway repo root (the detector keys off `process.cwd()`),
 * so the real tree is never touched.
 *
 * Run: pnpm check:picker-add:self-test
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { exitAfterDrain } from "./lib/exit-after-drain";

const REPO_ROOT = resolve(__dirname, "..");
const DETECTOR = join(REPO_ROOT, "scripts/check-picker-custom-entry.ts");
const TSX = join(REPO_ROOT, "node_modules/tsx/dist/cli.mjs");
const PRE_FIX = "839d3c8a75^"; // the commit that fixed the cascade
const PICKER = "features/scope-system/components/ContextItemPicker.tsx";

/** Minimal shapes history cannot supply. Each is a real JSX picker body. */
const FIXTURES = {
  /** A caption and a new-tab door — the 2026-08-30 free pass. */
  doorCaption: `"use client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
export function TierPicker({ options }: { options: { id: string; label: string }[] }) {
  return (
    <Select>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
        ))}
        <Link href="/tiers" target="_blank" rel="noopener noreferrer">
          <Plus className="h-3 w-3" /> Add a tier
        </Link>
      </SelectContent>
    </Select>
  );
}
`,
  /** The P11 sentence alone — the hole PNI-000 F4 named. */
  p11SentenceOnly: `"use client";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
// This vocabulary is curated centrally.
export function ClassPicker({ options }: { options: { id: string; label: string }[] }) {
  return (
    <Select>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
`,
  /** A comment promising an alternative — PNI-000 re-verify 1's residual. */
  p11CommentOnly: `"use client";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
// This vocabulary is curated centrally.
// TODO: one day wire a lockedAction here so people can make their own.
export function ClassPicker({ options }: { options: { id: string; label: string }[] }) {
  return (
    <Select>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
`,
  /** The P11 shape the law asks for: the sentence PLUS a live alternative. */
  p11WithAlternative: `"use client";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
export function ClassPicker({
  options,
  bindScopeItem,
}: {
  options: { id: string; label: string }[];
  bindScopeItem: () => void;
}) {
  return (
    <Select>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
        ))}
      </SelectContent>
      <Note
        lockedNote="System items are platform truths curated centrally — every user gets the same set."
        lockedAction={{ label: "Need your own? Bind a Scope item instead", onSelect: bindScopeItem }}
      />
    </Select>
  );
}
`,
};

function rootWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "picker-add-selftest-"));
  for (const [rel, source] of Object.entries(files)) {
    const target = join(dir, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source, "utf-8");
  }
  return dir;
}

function fileAt(commitish: string, path: string): string {
  return execFileSync("git", ["show", `${commitish}:${path}`], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** Runs the real detector against a throwaway root; returns the flagged paths. */
function flaggedIn(root: string): string[] {
  let stdout = "";
  try {
    stdout = execFileSync(process.execPath, [TSX, DETECTOR], {
      cwd: root,
      encoding: "utf-8",
    });
  } catch (err) {
    const e = err as { stdout?: string };
    stdout = e.stdout ?? "";
  }
  return stdout
    .split("\n")
    .filter((l) => l.trimStart().startsWith("•"))
    .map((l) => l.replace(/^\s*•\s*/, "").replace(/\s*\(\d+ items?\)\s*$/, ""));
}

const failures: string[] = [];
const check = (label: string, ok: boolean, detail?: string) => {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(label);
  }
};

console.log("\n  check:picker-add self-test\n");

const roots: string[] = [];
try {
  // ── RED 1 — the real door-only cascade, before the fix
  const redReal = rootWith({ [PICKER]: fileAt(PRE_FIX, PICKER) });
  roots.push(redReal);
  const redRealFlags = flaggedIn(redReal);
  check(
    `RED: the real pre-fix ${PICKER} (${PRE_FIX}) is flagged`,
    redRealFlags.includes(PICKER),
    `flagged: ${JSON.stringify(redRealFlags)}`,
  );

  // ── RED 2 — a caption on a door, no write path anywhere in the file
  const redCaption = rootWith({
    "features/fixtures/TierPicker.tsx": FIXTURES.doorCaption,
  });
  roots.push(redCaption);
  check(
    "RED: a caption-only picker (new-tab door + '+ Add a tier') is flagged",
    flaggedIn(redCaption).includes("features/fixtures/TierPicker.tsx"),
  );

  // ── RED 3 — the PNI-000 F4 hole: the P11 sentence with no alternative
  const redP11 = rootWith({
    "features/fixtures/ClassPicker.tsx": FIXTURES.p11SentenceOnly,
  });
  roots.push(redP11);
  check(
    "RED: a P11 sentence with no lockedAction/override is flagged (PNI-000 F4)",
    flaggedIn(redP11).includes("features/fixtures/ClassPicker.tsx"),
  );

  // ── RED 4 — a comment is not an affordance: "TODO … lockedAction" is prose
  const redComment = rootWith({
    "features/fixtures/ClassPicker.tsx": FIXTURES.p11CommentOnly,
  });
  roots.push(redComment);
  check(
    "RED: a commented-out promise of a lockedAction is flagged (re-verify 1 residual)",
    flaggedIn(redComment).includes("features/fixtures/ClassPicker.tsx"),
  );

  // ── GREEN 1 — the real shipped file: every level creates in place
  const greenReal = rootWith({ [PICKER]: fileAt("HEAD", PICKER) });
  roots.push(greenReal);
  const greenRealFlags = flaggedIn(greenReal);
  check(
    `GREEN: the shipped ${PICKER} (CreatablePicker at every level) is clean`,
    greenRealFlags.length === 0,
    `flagged: ${JSON.stringify(greenRealFlags)}`,
  );

  // ── GREEN 2 — P11 done right: the sentence AND the live alternative
  const greenP11 = rootWith({
    "features/fixtures/ClassPicker.tsx": FIXTURES.p11WithAlternative,
  });
  roots.push(greenP11);
  const greenP11Flags = flaggedIn(greenP11);
  check(
    "GREEN: a P11 control carrying lockedNote + lockedAction is clean",
    greenP11Flags.length === 0,
    `flagged: ${JSON.stringify(greenP11Flags)}`,
  );
} finally {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
}

console.log("");
if (failures.length > 0) {
  console.error(
    `  check:picker-add:self-test FAILED — ${failures.length} case(s): ${failures.join("; ")}\n`,
  );
  exitAfterDrain(1);
}
console.log(
  "  ✓ check:picker-add:self-test — the detector is RED on the door-only, caption-only, P11-sentence-only and commented-promise shapes, GREEN on the creatable and P11-with-alternative shapes.\n",
);
exitAfterDrain(0);
