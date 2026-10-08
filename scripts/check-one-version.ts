#!/usr/bin/env npx tsx
/**
 * check:one-version — only ONE version of anything may exist (Arman, 2026-10-05), except variants
 * he explicitly approved.
 *
 * The registry (scripts/one-version/registry.ts) lists each canonical piece with a detector for a
 * second implementation. Offenders that existed when a piece was registered sit in
 * scripts/one-version/baseline.json — SHRINK-ONLY: a NEW offender fails, and so does a baseline entry
 * that no longer offends (delete it — that is the point). The baseline is a debt list read out on
 * every run, never an exemption; an exemption is an `approved` variant in the registry carrying
 * Arman's ruling date.
 *
 *   pnpm check:one-version              # advisory verdict; exit 1 on a new offender / stale entry
 *   pnpm check:one-version --census     # every current offender per piece (to refresh the baseline)
 *   pnpm check:one-version:self-test    # plants one violation per detector: RED, then GREEN
 */
import { execSync } from "node:child_process";
import { CHAT_PACKAGE_SRC, gitFiles } from "./lib/source-roots.cjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { emitItem, endItems } from "./checks/items.mjs";
import { exitAfterDrain } from "./lib/exit-after-drain";
import { PIECES, lineOf, type Piece, type SourceFile } from "./one-version/registry";

const ROOT = path.resolve(__dirname, "..");
const BASELINE_PATH = path.join(__dirname, "one-version", "baseline.json");

interface BaselineEntry {
  piece: string;
  file: string;
  reason: string;
}
interface Offender {
  piece: string;
  file: string;
  line: number;
  reason: string;
}

function stripComments(text: string): string {
  const blank = (chunk: string) => chunk.replace(/[^\n]/g, " ");
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead: string) => lead + " ".repeat(m.length - lead.length));
}

function matchesPath(file: string, p: string): boolean {
  return p.endsWith("/") ? file.startsWith(p) : file === p;
}

/** Every offender among `files`, canonical files and approved variants removed. */
export function findOffenders(files: SourceFile[], pieces: Piece[] = PIECES): Offender[] {
  const out: Offender[] = [];
  for (const piece of pieces) {
    for (const src of files) {
      if (!piece.scope(src.file)) continue;
      if (piece.canonical.some((p) => matchesPath(src.file, p))) continue;
      if (piece.approved.some((a) => matchesPath(src.file, a.path))) continue;
      const hits = piece.detect(src);
      if (hits.length > 0) out.push({ piece: piece.id, file: src.file, line: hits[0].line, reason: hits[0].reason });
    }
  }
  return out;
}

export interface Verdict {
  fresh: Offender[];
  stale: BaselineEntry[];
  known: Offender[];
}

export function judge(offenders: Offender[], baseline: BaselineEntry[]): Verdict {
  const key = (p: string, f: string) => `${p}|${f}`;
  const base = new Set(baseline.map((b) => key(b.piece, b.file)));
  const live = new Set(offenders.map((o) => key(o.piece, o.file)));
  return {
    fresh: offenders.filter((o) => !base.has(key(o.piece, o.file))),
    known: offenders.filter((o) => base.has(key(o.piece, o.file))),
    stale: baseline.filter((b) => !live.has(key(b.piece, b.file))),
  };
}

function loadFiles(): SourceFile[] {
  // The app's files and @ai-matrx/chat's source (the aidream checkout beside this repo, P27).
  const list = gitFiles(ROOT, [
    "ls-files", "--cached", "--others", "--exclude-standard", "--",
    "*.ts", "*.tsx", `${CHAT_PACKAGE_SRC}/**/*.ts`, `${CHAT_PACKAGE_SRC}/**/*.tsx`,
  ])
    .split("\n")
    .filter(Boolean);
  const files: SourceFile[] = [];
  for (const file of list) {
    let raw: string;
    try {
      raw = readFileSync(path.join(ROOT, file), "utf8");
    } catch {
      continue; // listed but deleted in the working tree
    }
    files.push({ file, raw, code: stripComments(raw) });
  }
  return files;
}

function loadBaseline(): BaselineEntry[] {
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")).entries as BaselineEntry[];
}

function src(file: string, raw: string): SourceFile {
  return { file, raw, code: stripComments(raw) };
}

/** One planted violation per detector, in a path inside that piece's scope, tripping ONLY that piece. */
const RED: Record<string, SourceFile> = {
  "chat-input": src(
    "features/zz/RedChatBox.tsx",
    `export function RedChatBox() {
  const send = () => dispatch(smartExecute({ conversationId: "c" }));
  return <textarea onChange={() => {}} onBlur={send} />;
}`,
  ),
  "enter-to-send": src(
    "features/zz/RedEnter.tsx",
    `export function RedEnter() {
  const onKey = (e: KeyboardEvent) => { if (e.key === "Enter") dispatch(launchAgentExecution({ id: "a" })); };
  return <div onKeyDown={onKey} />;
}`,
  ),
  "paste-to-upload": src(
    "features/zz/RedPaste.tsx",
    `export function RedPaste() {
  const dz = useDropzone({ onDrop });
  return <div {...dz.getRootProps()} onPaste={handlePaste} />;
}`,
  ),
  "agent-variables": src(
    "features/zz/RedVars.tsx",
    `export function RedVars({ variableDefinitions }) {
  return <div>{variableDefinitions.map((v) => <input key={v.name} name={v.name} />)}</div>;
}`,
  ),
  "composer-chips": src(
    "../aidream/apps/shared/chat/src/agents/components/inputs/RedChip.tsx",
    `export const RedChip = () => <span className="inline-flex h-6 items-center rounded-full border px-2">x</span>;`,
  ),
  "context-chips": src(
    "features/zz/RedLens.tsx",
    `export function ContextLensBar() { return null; }`,
  ),
  "mac-detection": src(
    "../aidream/apps/shared/chat/src/zz/RedMac.ts",
    `export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);`,
  ),
};

/** Legitimate shapes that must stay clean. */
const GREEN: SourceFile[] = [
  src(
    "features/zz/GreenChat.tsx",
    `import { SmartAgentInput } from "@ai-matrx/chat";
export const G = () => <SmartAgentInput conversationId="c" />;`,
  ),
  src(
    "features/zz/GreenEnter.tsx",
    `export function G() {
  const onKey = (e) => { const i = composerKeyIntent(e, s); if (i === "send") dispatch(smartExecute({})); if (e.key === "Enter") {} };
  return <input onKeyDown={onKey} />;
}`,
  ),
  src(
    "features/zz/GreenPaste.tsx",
    `const dz = useDropzone({ onDrop, noPaste: true }); const el = <div onPaste={p} />;`,
  ),
  src("features/zz/GreenMac.ts", `import { isMacLike } from "@ai-matrx/chat/agents/hooks/useAgentUndoRedo"; export const m = isMacLike();`),
  src("features/zz/GreenComment.tsx", `// ContextLensBar was deleted\nexport const x = 1;`),
];

function selfTest(): boolean {
  const failures: string[] = [];
  for (const piece of PIECES) {
    const red = RED[piece.id];
    if (!red) {
      failures.push(`${piece.id}: registered piece has no RED fixture — a detector nobody has watched fail`);
      continue;
    }
    const hit = findOffenders([red]);
    const ids = [...new Set(hit.map((h) => h.piece))];
    if (!ids.includes(piece.id)) failures.push(`RED ${piece.id}: planted violation was NOT caught`);
    else if (ids.length > 1) failures.push(`RED ${piece.id}: fixture also tripped ${ids.filter((i) => i !== piece.id).join(", ")} — a fake proof`);
  }
  for (const g of GREEN) {
    const hit = findOffenders([g]);
    if (hit.length > 0) failures.push(`GREEN ${g.file}: legitimate code flagged as ${hit.map((h) => h.piece).join(", ")}`);
  }
  // Canonical files and approved variants are excused.
  const canonicalCopy = { ...RED["chat-input"], file: "../aidream/apps/shared/chat/src/agents/components/inputs/smart-input/Zz.tsx" };
  if (findOffenders([canonicalCopy]).length > 0) failures.push("canonical directory was not excused");
  const approved: Piece = {
    ...PIECES[0],
    approved: [{ path: RED["chat-input"].file, reason: "self-test", ruling: "2026-10-05" }],
  };
  if (findOffenders([RED["chat-input"]], [approved]).length > 0) failures.push("an approved variant was still reported");

  // Baseline ratchet: new offender fails, stale entry fails, covered offender passes.
  const off = findOffenders(Object.values(RED));
  const covered = off.map((o) => ({ piece: o.piece, file: o.file, reason: "known duplicate, decision pending" }));
  if (judge(off, covered).fresh.length !== 0 || judge(off, covered).stale.length !== 0) failures.push("baseline covering every offender is not clean");
  if (judge(off, covered.slice(1)).fresh.length !== 1) failures.push("a NEW offender (not in baseline) was not reported");
  const stale = [...covered, { piece: "chat-input", file: "features/zz/Gone.tsx", reason: "x" }];
  if (judge(off, stale).stale.length !== 1) failures.push("a stale baseline entry was not reported");

  // GREEN on the real tree with the real baseline.
  const real = judge(findOffenders(loadFiles()), loadBaseline());
  if (real.fresh.length || real.stale.length) failures.push(`real tree not clean: ${real.fresh.length} new, ${real.stale.length} stale`);

  if (failures.length) {
    console.error("check:one-version SELF-TEST FAILED:\n" + failures.map((f) => "  - " + f).join("\n"));
    return false;
  }
  console.log(`check:one-version self-test OK — ${PIECES.length} detectors RED on their plant and caught by nothing else, ${GREEN.length} green shapes clean, ratchet proven both ways, real tree GREEN.`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    exitAfterDrain(selfTest() ? 0 : 1);
  }
  const offenders = findOffenders(loadFiles());
  if (args.includes("--census")) {
    for (const o of offenders) console.log(`${o.piece}\t${o.file}:${o.line}\t${o.reason}`);
    console.log(`\n${offenders.length} offender(s)`);
    exitAfterDrain(0);
  }
  const baseline = loadBaseline();
  const { fresh, known, stale } = judge(offenders, baseline);
  for (const o of fresh) {
    console.error(`NEW second version [${o.piece}] ${o.file}:${o.line} — ${o.reason}`);
    emitItem({ key: `${o.piece}|${o.file}`, status: "new", unit: o.piece, title: o.reason, file: o.file, line: o.line, rule: o.piece });
  }
  for (const o of known) {
    emitItem({ key: `${o.piece}|${o.file}`, status: "known", basis: "debt", unit: o.piece, title: o.reason, file: o.file, line: o.line, rule: o.piece });
  }
  for (const b of stale) {
    console.error(`STALE baseline entry [${b.piece}] ${b.file} no longer offends — delete it from scripts/one-version/baseline.json`);
    emitItem({ key: `stale|${b.piece}|${b.file}`, status: "new", unit: b.piece, title: "stale baseline entry", file: b.file, rule: "stale-baseline" });
  }
  endItems();
  const per = PIECES.map((p) => `${p.id}=${known.filter((k) => k.piece === p.id).length}`).join(" ");
  console.log(`check:one-version: ${fresh.length} new, ${stale.length} stale, ${known.length} known duplicates (shrink-only) — ${per}`);
  exitAfterDrain(fresh.length || stale.length ? 1 : 0);
}

void lineOf;
main();
