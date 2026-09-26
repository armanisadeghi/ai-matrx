#!/usr/bin/env node
/**
 * pnpm findings — meet a check's findings where you work (PLAN.md decision 8, C1, C2).
 *
 *   pnpm findings [paths…] [--check <id>]…
 *       Runs the converted checks (scripts/findings/registry.mjs) — only those whose watch paths
 *       match the given paths — and prints every NEW item touching those paths: check, key,
 *       file:line, title, then the fix hint and the exact accept command.
 *       Exit 1 when there is a new item in the given paths (or a check could not run), else 0.
 *       No paths = every converted check, every new item.
 *
 *   pnpm findings accept <check> <key> --reason "<why>" [--no-commit]
 *       Writes the key into THAT check's own allowlist/baseline (its adapter), re-runs the check to
 *       prove the item is now `known` and every other item kept its status, then commits exactly the
 *       allowlist file(s) with a message naming check, key and reason. Refuses: an empty reason, a
 *       check with no adapter, a key the check does not emit right now, a key already known, an
 *       allowlist file somebody else has uncommitted edits in.
 *
 * Item parsing and check execution are the release runner's (scripts/checks/run.mjs → items.mjs):
 * this tool adds no parser. aidream's twin: `uv run python scripts/findings.py`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { manifestRows, runRows } from "../checks/run.mjs";
import { FINDINGS_CHECKS, byId } from "./registry.mjs";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ACCEPT_CMD = "pnpm findings accept";

export const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function toRel(p, root) {
  const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
  return relative(root, abs).split("\\").join("/").replace(/\/+$/, "");
}

const isDir = (root, rel) => {
  try {
    return statSync(join(root, rel)).isDirectory();
  } catch {
    return false;
  }
};

/** Does a path (file or directory) touch this item? */
function touches(rel, dir, item) {
  const file = item.file ?? "";
  if (dir) return rel === "" || file === rel || file.startsWith(`${rel}/`) || item.item_key.includes(`${rel}/`);
  return file === rel || (!file && item.item_key.includes(rel));
}

/** The runner rows for the chosen checks. A registry id the runner does not know is a loud error. */
function rowsFor(checks, rows = manifestRows()) {
  return checks.map((c) => {
    const row = rows.find((r) => r.id === c.id);
    if (!row) throw new Error(`findings registry names ${c.id}, but scripts/checks/run.mjs --list has no such row`);
    return row;
  });
}

export async function collect({ paths = [], checkIds = [], root = REPO_ROOT, workers = 4, rows } = {}) {
  const rels = paths.map((p) => toRel(p, root));
  const dirs = new Set(rels.filter((r) => r === "" || isDir(root, r)));
  let checks = FINDINGS_CHECKS;
  if (checkIds.length) {
    const unknown = checkIds.filter((id) => !byId(id));
    if (unknown.length) throw new Error(`--check names no converted check: ${unknown.join(", ")} (see scripts/findings/registry.mjs)`);
    checks = checks.filter((c) => checkIds.includes(c.id));
  }
  if (rels.length) checks = checks.filter((c) => rels.some((r) => dirs.has(r) || c.watch.test(r)));
  if (!checks.length) return { ran: [], items: [], broken: [] };
  const findings = await runRows(rowsFor(checks, rows), { workers });
  const items = findings.filter((f) => f.item_key);
  const broken = findings.filter((f) => !f.item_key && / could not run: /.test(f.title));
  const inScope = rels.length ? items.filter((i) => rels.some((r) => touches(r, dirs.has(r), i))) : items;
  return { ran: checks.map((c) => c.id), items: inScope, broken };
}

export function renderItem(item) {
  const check = byId(item.check);
  const where = item.file ? `${item.file}${item.line != null ? `:${item.line}` : ""}` : "-";
  const lines = [`${item.check}  ${item.item_key}  ${where}  ${item.title}`, `    fix:    ${check?.fix ?? item.remedy}`];
  lines.push(
    check?.accept
      ? `    accept: ${ACCEPT_CMD} ${item.check} ${shellQuote(item.item_key)} --reason "<why this is fine>"`
      : `    accept: none — ${check?.noAccept ?? "no adapter"}`,
  );
  return lines.join("\n");
}

async function list(args) {
  const { ran, items, broken } = await collect(args);
  const fresh = items.filter((i) => i.ratchet !== "known");
  for (const item of fresh) process.stdout.write(`${renderItem(item)}\n`);
  for (const b of broken) process.stdout.write(`BROKEN  ${b.check}: ${b.title} (log: ${b.detail})\n`);
  const scope = args.paths.length ? ` in ${args.paths.length} path(s)` : "";
  const known = items.length - fresh.length;
  process.stdout.write(
    `findings: ${fresh.length} new${scope} (${ran.length} check${ran.length === 1 ? "" : "s"} run${ran.length ? `: ${ran.join(", ")}` : ""}; ${known} known debt not shown)${broken.length ? `; ${broken.length} check(s) could not run` : ""}\n`,
  );
  if (fresh.length) process.stdout.write("An open finding in files you touched is part of done: fix it, or accept it with a reason.\n");
  return fresh.length || broken.length ? 1 : 0;
}

const git = (root, ...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });

class Refusal extends Error {}

/** Runs the one check; returns Map(key → ratchet) of every item it emitted. */
async function itemStates(check, root, rows) {
  const findings = await runRows(rowsFor([check], rows), { workers: 1 });
  const broken = findings.find((f) => !f.item_key && / could not run: /.test(f.title));
  if (broken) throw new Refusal(`${check.id} could not run: ${broken.title} (log: ${broken.detail})`);
  return new Map(findings.filter((f) => f.item_key).map((f) => [f.item_key, f.ratchet]));
}

export async function accept({ checkId, key, reason, commit = true, root = REPO_ROOT, rows, by } = {}) {
  if (!reason || !reason.trim()) throw new Refusal('refused: --reason "<why this is fine>" is required and cannot be empty');
  const check = byId(checkId);
  if (!check) throw new Refusal(`refused: ${checkId} is not a converted check (scripts/findings/registry.mjs lists them)`);
  if (!check.accept) throw new Refusal(`refused: ${checkId} has no accept adapter. ${check.noAccept}`);
  if (!key) throw new Refusal("refused: no key given");
  const files = check.accept.files;
  if (commit) {
    const dirty = git(root, "status", "--porcelain", "--", ...files).stdout.trim();
    if (dirty) throw new Refusal(`refused: ${files.join(", ")} already has uncommitted changes (someone else's work?):\n${dirty}\nCommit or resolve those first, or pass --no-commit.`);
  }

  const before = await itemStates(check, root, rows);
  if (!before.has(key)) {
    const near = [...before.keys()].filter((k) => k.includes(key.split("|").find((p) => p.includes("/")) ?? key)).slice(0, 3);
    throw new Refusal(`refused: ${checkId} does not emit ${JSON.stringify(key)} right now${near.length ? ` (did you mean: ${near.map((k) => JSON.stringify(k)).join(", ")}?)` : ""}`);
  }
  if (before.get(key) === "known") throw new Refusal(`refused: ${JSON.stringify(key)} is already known (covered by ${files[0]})`);

  const accepter = by ?? (git(root, "config", "user.name").stdout.trim() || "unknown");
  const date = new Date().toISOString().slice(0, 10);
  const saved = files.map((f) => [f, existsSync(join(root, f)) ? readFileSync(join(root, f)) : null]);
  const restore = () => {
    for (const [f, bytes] of saved) if (bytes) writeFileSync(join(root, f), bytes);
    const created = saved.filter(([, b]) => !b).map(([f]) => f);
    for (const f of created) spawnSync("rm", ["-f", join(root, f)]);
  };
  try {
    check.accept.apply({ key, reason: reason.trim(), by: accepter, date, root });
    const after = await itemStates(check, root, rows);
    if (after.get(key) !== "known") throw new Refusal(`the adapter wrote ${files[0]} but ${checkId} still reports ${JSON.stringify(key)} as ${after.get(key) ?? "absent"} — adapter bug; nothing kept`);
    const moved = [...new Set([...before.keys(), ...after.keys()])].filter((k) => k !== key && before.get(k) !== after.get(k));
    if (moved.length) throw new Refusal(`accepting ${JSON.stringify(key)} changed ${moved.length} other item(s) (first ${JSON.stringify(moved[0])}: ${before.get(moved[0])} → ${after.get(moved[0])}) — nothing kept`);
  } catch (error) {
    restore();
    throw error;
  }

  const message = `chore(findings): accept ${checkId} ${key.length > 80 ? `${key.slice(0, 79)}…` : key}\n\nCheck: ${checkId}\nKey: ${key}\nReason: ${reason.trim()}\nAccepted-by: ${accepter}\nDate: ${date}\n`;
  if (!commit) return { files, committed: null, message };
  return { ...commitOnly(root, files, message), message };
}

/**
 * Commit exactly these files — never anything else another session has staged in the shared
 * index (`git commit --only`). Returns the short SHA and the files that actually changed.
 */
export function commitOnly(root, files, message) {
  const changed = files.filter((f) => git(root, "status", "--porcelain", "--", f).stdout.trim());
  if (!changed.length) throw new Error(`nothing to commit in ${files.join(", ")}`);
  git(root, "add", "--", ...changed);
  const done = git(root, "commit", "--only", "-m", message, "--", ...changed);
  if (done.status !== 0) {
    throw new Error(`the allowlist is written and verified, but the commit failed:\n${done.stderr || done.stdout}`);
  }
  return { files: changed, committed: git(root, "rev-parse", "--short", "HEAD").stdout.trim() };
}

export function parseArgs(argv) {
  const out = { mode: "list", paths: [], checkIds: [], reason: null, commit: true, positional: [] };
  const rest = [...argv];
  if (rest[0] === "accept") {
    out.mode = "accept";
    rest.shift();
  }
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === "--check") out.checkIds.push(rest[++i]);
    else if (a === "--reason") out.reason = rest[++i] ?? "";
    else if (a.startsWith("--reason=")) out.reason = a.slice("--reason=".length);
    else if (a === "--no-commit") out.commit = false;
    else if (a === "-h" || a === "--help") out.mode = "help";
    else if (a === "--") continue;
    else out.positional.push(a);
  }
  if (out.mode === "list") out.paths = out.positional;
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.mode === "help") {
    process.stdout.write(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n\/\*\*\n|^ \* ?/gm, "") + "\n");
    return 0;
  }
  if (args.mode === "list") return list(args);
  const [checkId, key] = args.positional;
  try {
    const r = await accept({ checkId, key, reason: args.reason, commit: args.commit });
    process.stdout.write(`accepted: ${checkId} ${JSON.stringify(key)} is now known (re-run proved it; every other item unchanged)\n`);
    process.stdout.write(r.committed ? `committed ${r.committed}: ${r.files.join(", ")}\n` : `not committed (--no-commit): ${r.files.join(", ")}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`[findings] crashed: ${error.stack ?? error.message}\n`);
      process.exit(2);
    },
  );
}
