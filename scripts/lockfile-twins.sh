#!/usr/bin/env bash
# lockfile-twins — a committed pnpm-lock.yaml that fails the Vercel postinstall never ships.
#
# WHY (2026-10-08, v0.4.3061, deployment dpl_DGstANHmCe1CyWUAAVpjFPynxQik): commit 31b02bc6b3
# adopted @ai-matrx/meet 0.11.29 by hand and committed a lockfile holding design-system 0.86.26
# (the app) AND 0.86.27 (meet's own `latest`), plus twins of diff/content-ir/realtime/print/
# records-ui. It reached origin/main through a plain pull + push, and release.sh merged it into
# the release tree untouched. Vercel's `pnpm install --frozen-lockfile` then ran the postinstall
# `node scripts/check-matrx-packages.mjs --duplicates`, which exits 1 on two versions of one
# @ai-matrx package — so every project failed install. Nothing before Vercel judged the COMMITTED
# lockfile: the postinstall on a dev machine also scans node_modules, and the release path
# only checked that the lockfile parses (check-lockfile-keys.py).
#
# WHAT IT DOES, against the lockfile in <tree-ish> (a commit or a tree, never the working folder):
#   1. extracts package.json, pnpm-lock.yaml and pnpm's config (workspace, .npmrc, .pnpmfile.cjs,
#      patches/) into a scratch folder with NO node_modules — the graph a fresh Vercel install
#      sees — and runs the exact postinstall check: check-matrx-packages.mjs --duplicates.
#   2. on twins, the remedy the check itself names, lockfile-only:
#      `pnpm update -r "@ai-matrx/*" --depth Infinity --lockfile-only --ignore-scripts`
#      (every @ai-matrx spec is `latest`, so this moves each package to ONE version, the newest),
#      then judges the result again AND confirms `pnpm install --frozen-lockfile` accepts it.
#   .pnpmfile.cjs is copied byte-for-byte (the lockfile pins its sha256) and the harness modules it
#   requires are stubbed: they guard the shared checkout's node_modules, which a scratch folder
#   does not have.
#
# USAGE  bash scripts/lockfile-twins.sh <tree-ish> --out <file>
# EXIT   0 clean (nothing written)
#        3 remedied: the corrected pnpm-lock.yaml is in <file>; stdout = the versions it moved
#        1 twins remain (or the remedy broke the lockfile): stderr = the check's own words
#        2 could not judge (no pnpm-lock.yaml / checker / node / pnpm in that tree) — a finding,
#          never a verdict
# Callers: scripts/release.sh (inside the release tree, before the release commit is built) and
# scripts/sync-main.py (HEAD, before every push). Guard: pnpm test:release-ship-path.
set -uo pipefail

TREE="${1:-}"
OUT=""
[[ "${2:-}" == "--out" ]] && OUT="${3:-}"
if [[ -z "$TREE" || -z "$OUT" ]]; then
    echo "usage: bash scripts/lockfile-twins.sh <tree-ish> --out <file>" >&2
    exit 2
fi
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "not inside a git repository" >&2; exit 2; }
CHECKER="${LOCKFILE_TWINS_CHECKER:-$REPO_ROOT/scripts/check-matrx-packages.mjs}"
git -C "$REPO_ROOT" cat-file -e "$TREE:pnpm-lock.yaml" 2>/dev/null || exit 0   # no pnpm lockfile: nothing to judge
command -v node >/dev/null 2>&1 || { echo "node is not installed" >&2; exit 2; }
[[ -f "$CHECKER" ]] || { echo "checker missing: $CHECKER" >&2; exit 2; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
for p in package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .pnpmfile.cjs; do
    git -C "$REPO_ROOT" cat-file -e "$TREE:$p" 2>/dev/null && git -C "$REPO_ROOT" cat-file -p "$TREE:$p" > "$WORK/$p"
done
if git -C "$REPO_ROOT" cat-file -e "$TREE:patches" 2>/dev/null; then
    git -C "$REPO_ROOT" archive "$TREE" -- patches | tar -x -C "$WORK"
fi
# Workspace members (pnpm-workspace.yaml `packages:`) carry importers in the lockfile.
git -C "$REPO_ROOT" ls-tree -r --name-only "$TREE" | grep -E '^packages/[^/]+/package\.json$' | while IFS= read -r p; do
    mkdir -p "$WORK/$(dirname "$p")"
    git -C "$REPO_ROOT" cat-file -p "$TREE:$p" > "$WORK/$p"
done
mkdir -p "$WORK/scripts/agent-harness"
echo "module.exports = { register() {} };" > "$WORK/scripts/agent-harness/restore-typecheck-entrypoints.cjs"
echo "module.exports = { run() {} };" > "$WORK/scripts/agent-harness/install-gate.cjs"

judge() { node "$CHECKER" --duplicates --root "$WORK" >"$WORK/.judge" 2>&1; }
if judge; then
    exit 0
fi
cp "$WORK/pnpm-lock.yaml" "$WORK/.before"
if ! command -v pnpm >/dev/null 2>&1; then
    cat "$WORK/.judge" >&2
    echo "pnpm is not installed, so the twins could not be remedied" >&2
    exit 1
fi
if ! (cd "$WORK" && MATRX_INSTALL_GATE_DISABLE=1 pnpm update -r "@ai-matrx/*" --depth Infinity \
        --lockfile-only --ignore-scripts) >"$WORK/.remedy" 2>&1; then
    cat "$WORK/.judge" >&2
    echo "the remedy (pnpm update -r \"@ai-matrx/*\" --depth Infinity --lockfile-only) failed:" >&2
    tail -15 "$WORK/.remedy" >&2
    exit 1
fi
if ! judge; then
    echo "twins remain after pnpm update -r \"@ai-matrx/*\" --depth Infinity:" >&2
    cat "$WORK/.judge" >&2
    exit 1
fi
if ! (cd "$WORK" && MATRX_INSTALL_GATE_DISABLE=1 pnpm install --frozen-lockfile --lockfile-only \
        --ignore-scripts) >"$WORK/.frozen" 2>&1; then
    echo "the remedied lockfile is refused by pnpm install --frozen-lockfile:" >&2
    tail -15 "$WORK/.frozen" >&2
    exit 1
fi
cp "$WORK/pnpm-lock.yaml" "$OUT"
# The versions it moved, for the finding: "@ai-matrx/x a,b -> c".
node - "$WORK/.before" "$WORK/pnpm-lock.yaml" <<'JS'
const fs = require('fs');
const re = /^  '?(@ai-matrx\/[a-z0-9._-]+)@(\d[^('":\s]*)'?:/gm;
const read = (f) => { const m = new Map(); for (const [, n, v] of fs.readFileSync(f, 'utf8').matchAll(re)) { if (!m.has(n)) m.set(n, new Set()); m.get(n).add(v); } return m; };
const a = read(process.argv[2]), b = read(process.argv[3]);
const moved = [];
for (const [n, vs] of b) { const before = [...(a.get(n) ?? [])].sort().join(','), after = [...vs].sort().join(','); if (before !== after) moved.push(`${n} ${before || '(new)'} -> ${after}`); }
console.log(moved.join('; ') || '(no version moved)');
JS
exit 3
