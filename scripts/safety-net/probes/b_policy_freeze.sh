#!/bin/zsh
# LANE SAFETY-NET-B (2026-10-01) — C10: the one watched-window file (TABLE-API-1's personal-key policy) freezes
# sign-in under 100 ms. Rule 27 on the CLONE through the sanctioned runner (up → inverse → up, each leg executed, the
# freeze measured as the span from the first policy statement to commit), then the measured number is judged.
#   cd matrx-frontend && zsh scripts/safety-net/probes/b_policy_freeze.sh [budget_ms]
# Never production: --target clone only. Exit 0 = measured under budget; 1 = over, or not measured.
set -o pipefail
BUDGET=${1:-100}
FILE=migrations/campaign/tableapi1_a_personal_keys_row_is_its_persons_alone.sql
OUT=${SN_OUT:-/tmp}
LOG="$OUT/b-policy-freeze.log"
pnpm -s db:rehearse "$FILE" --target clone --source campaign --lane SAFETY-NET-B 2>&1 | tee "$LOG" >/dev/null
RC=$?
MS=$(sed -E 's/\x1b\[[0-9;]*m//g' "$LOG" | grep -Eo 'policy-DDL freeze measured [0-9]+ ms' | grep -Eo '[0-9]+' | sort -n | tail -1)
if [[ -z "$MS" ]]; then
  echo "C10 FAIL: db:rehearse exited $RC and printed no policy-DDL freeze measurement (see $LOG)"; tail -15 "$LOG"; exit 1
fi
if (( MS < BUDGET )); then
  echo "C10 PASS: sign-in freeze ${MS} ms (budget ${BUDGET} ms; db:rehearse exit $RC)"; exit 0
fi
echo "C10 FAIL: sign-in freeze ${MS} ms is over the ${BUDGET} ms budget"; exit 1
