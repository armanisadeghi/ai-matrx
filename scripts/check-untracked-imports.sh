#!/usr/bin/env bash
# check-untracked-imports.sh — the COMMITTED tree must build, not just the laptop.
#
# Failure class this kills (v0.4.194, 2026-07-28): a session commits a rename
# (e.g. IngestFlowAnimation.tsx → IngestFlowAnimationImpl.tsx + a new front
# door) but the NEW file stays untracked. Every local gate passes — tsc and
# the dev server read the working tree, where the file exists — while main is
# broken, and the next release burns a 12-minute Vercel build on
# "Module not found". Vercel builds the commit, not the laptop.
#
# Check: for every untracked .ts/.tsx source file, if any TRACKED file imports
# it (alias @/ form or same-directory relative form), scream — the import will
# not resolve in the committed tree until the file is committed.
#
# Exit 1 on findings (the gates runner decides advisory vs strict).

set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
while IFS= read -r f; do
  case "$f" in
    *.ts|*.tsx) ;;
    *) continue ;;
  esac
  noext="${f%.*}"
  base="$(basename "$noext")"
  # Tracked importers of this module, alias form: @/<path-without-ext>
  hits="$(git grep -l --cached -e "from [\"']@/${noext}[\"']" -e "import([\"']@/${noext}[\"'])" -- '*.ts' '*.tsx' 2>/dev/null || true)"
  # Relative form from the same directory: ./<base>
  dir="$(dirname "$f")"
  rel_hits="$(git grep -l --cached -e "from [\"']\./${base}[\"']" -e "import([\"']\./${base}[\"'])" -- "${dir}/*.ts" "${dir}/*.tsx" 2>/dev/null || true)"
  all_hits="$(printf '%s\n%s\n' "$hits" "$rel_hits" | grep -v "^$" | grep -vFx "$f" | sort -u || true)"
  if [ -n "$all_hits" ]; then
    fail=1
    echo "UNTRACKED-IMPORT: '$f' is NOT committed, but these tracked files import it:"
    echo "$all_hits" | sed 's/^/    /'
  fi
done < <(git ls-files --others --exclude-standard)

if [ "$fail" -eq 1 ]; then
  echo ""
  echo "The committed tree will fail to build (Module not found) even though"
  echo "your working tree is fine. Commit the files above (yours or another"
  echo "session's half-landed rename) before releasing."
  exit 1
fi
echo "OK: no tracked file imports an untracked module."
