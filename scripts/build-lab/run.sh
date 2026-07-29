#!/bin/bash
# build-lab/run.sh — run a production-build experiment LOCALLY in an isolated
# worktree. No Vercel push, no contact with your working tree. Measures wall
# time, compile time, and peak RSS, and appends every run to a results ledger
# so experiments accumulate into a comparable table.
#
# Usage:
#   bash scripts/build-lab/run.sh <label> [--ref <git-ref>] [--profile slim|full|core|user] [--keep]
#   bash scripts/build-lab/run.sh --results          # print the ledger
#
#   <label>     names the run in the ledger (e.g. "baseline-216", "no-store-edge")
#   --ref       git ref to build (default: origin/main). Uncommitted ideas: commit
#               to a scratch branch first, or --keep a worktree and edit it, then
#               rerun with the same label (worktree is reused if present).
#   --profile   MATRX_PROFILE for the build (default: slim — what production runs)
#   --keep      don't remove the worktree afterward (for iterating by hand)
#
# Protocol notes (learned 2026-07-28):
#   • Peak RSS is the trustworthy metric; single-run compile time carries
#     ±1.5-2min noise. Never attribute a win/loss on time alone — rerun, or
#     use RSS + the graph report (pnpm lab:graph) for deterministic signals.
#   • Run experiments SEQUENTIALLY. Parallel builds contend and corrupt timing.
set -euo pipefail

LAB="${MATRX_BUILD_LAB:-$HOME/.cache/matrx-build-lab}"
LEDGER="$LAB/results.tsv"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$LAB"

if [[ "${1:-}" == "--results" ]]; then
  echo -e "WHEN\tLABEL\tREF\tPROFILE\tEXIT\tCOMPILE\tPEAK_RSS_GB\tWALL"
  [[ -f "$LEDGER" ]] && cat "$LEDGER"
  exit 0
fi

LABEL="${1:?usage: run.sh <label> [--ref ref] [--profile slim] [--keep] | --results}"; shift
REF="origin/main"; PROFILE="slim"; KEEP=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    *) echo "unknown arg $1"; exit 2 ;;
  esac
done

WT="$LAB/wt-$LABEL"
cd "$REPO"
git fetch origin main --quiet || true
if [[ -d "$WT" ]]; then
  echo "[lab] reusing existing worktree $WT (edit-and-rerun mode; --ref ignored)"
else
  git worktree add "$WT" "$REF" >/dev/null
  echo "[lab] worktree $WT @ $(git -C "$WT" rev-parse --short HEAD)"
fi
[[ -f "$REPO/.env.local" ]] && cp "$REPO/.env.local" "$WT/"

cd "$WT"
echo "[lab] pnpm install…"
pnpm install --frozen-lockfile --prefer-offline >"$LAB/$LABEL-install.log" 2>&1

echo "[lab] building (MATRX_PROFILE=$PROFILE)… logs: $LAB/$LABEL-build.log"
T0=$(date +%s)
set +e
MATRX_PROFILE="$PROFILE" /usr/bin/time -l pnpm build >"$LAB/$LABEL-build.log" 2>"$LAB/$LABEL-time.log"
CODE=$?
set -e
T1=$(date +%s)
WALL="$(( (T1 - T0) / 60 ))m$(( (T1 - T0) % 60 ))s"
COMPILE="$(grep -oE 'Compiled successfully in [0-9.]+(min|s)' "$LAB/$LABEL-build.log" | tail -1 | sed 's/Compiled successfully in //')"
RSS_BYTES="$(grep -E 'maximum resident' "$LAB/$LABEL-time.log" | grep -oE '[0-9]+' | head -1)"
RSS_GB="$(awk -v b="${RSS_BYTES:-0}" 'BEGIN{printf "%.1f", b/1073741824}')"

echo -e "$(date '+%m-%d %H:%M')\t$LABEL\t$(git -C "$WT" rev-parse --short HEAD)\t$PROFILE\t$CODE\t${COMPILE:-FAILED}\t$RSS_GB\t$WALL" >>"$LEDGER"

echo
echo "[lab] ━━ RESULT: $LABEL — exit=$CODE compile=${COMPILE:-FAILED} peakRSS=${RSS_GB}GB wall=$WALL"
[[ $CODE -ne 0 ]] && tail -15 "$LAB/$LABEL-build.log"
echo "[lab] ━━ Ledger:"
bash "$REPO/scripts/build-lab/run.sh" --results

if [[ $KEEP -eq 0 ]]; then
  cd "$REPO" && git worktree remove --force "$WT"
  echo "[lab] worktree removed (use --keep to iterate by hand)"
else
  echo "[lab] worktree kept at $WT"
fi
exit $CODE
