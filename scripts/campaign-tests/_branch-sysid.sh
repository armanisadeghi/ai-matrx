#!/bin/sh
# Prints the REHEARSAL BRANCH's pg_control_system().system_identifier, read from the
# checked-in plan file — never typed into a suite. Called from _preamble.sql's backticks.
#
# A missing or unreadable file is a REFUSAL, not a fallback: it prints a sentinel the
# preamble names out loud, so a suite can never silently treat an unknown database as the
# branch. (LANE-PREAMBLE: "A missing or unreadable file is a refusal, not a fallback.")
set -u
# An explicit MATRX_BRANCH_REF is authoritative: if it is set and unreadable we refuse rather
# than quietly falling back to a checkout copy that may say something else.
if [ -n "${MATRX_BRANCH_REF:-}" ]; then
  v=$(sed -n 's/^[[:space:]]*system_identifier[[:space:]]*=[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$MATRX_BRANCH_REF" 2>/dev/null | head -1)
  if [ -n "${v:-}" ]; then printf '%s' "$v"; exit 0; fi
  printf 'BRANCH-REF-UNREADABLE'; exit 0
fi
for d in \
  "../common-docs/projects/data-doctrine-adoption/plan/BRANCH-REF" \
  "$(dirname "$0")/../../../common-docs/projects/data-doctrine-adoption/plan/BRANCH-REF" \
  "/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/plan/BRANCH-REF"
do
  [ -n "$d" ] && [ -r "$d" ] || continue
  v=$(sed -n 's/^[[:space:]]*system_identifier[[:space:]]*=[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$d" | head -1)
  if [ -n "${v:-}" ]; then printf '%s' "$v"; exit 0; fi
done
printf 'BRANCH-REF-UNREADABLE'
