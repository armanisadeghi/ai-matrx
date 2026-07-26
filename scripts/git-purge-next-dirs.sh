#!/usr/bin/env bash
# Delete all .next* build dirs from disk. If git was ever tracking any of them,
# drop them from the index, commit, then push — remote HEAD stops serving them.
#
# Prevention is .gitignore (.next*/). This is recovery + local cleanup only.
#
# Usage:
#   pnpm git:purge-next
#   pnpm git:purge-next --push    # also push the removal commit
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DO_PUSH=false
[[ "${1:-}" == "--push" ]] && DO_PUSH=true

echo "Deleting local .next* directories..."
rm -rf .next*

TRACKED="$(git ls-files '.next*' || true)"
if [[ -z "$TRACKED" ]]; then
  echo "Git: nothing under .next* is tracked (.gitignore is doing its job)."
  exit 0
fi

echo "Git: removing tracked .next* paths from the index..."
git rm -r --cached -- .next*

git commit -m "$(cat <<'EOF'
chore: remove .next* build output from git

Build artifacts belong on disk only — .gitignore (.next*/) prevents re-add.
EOF
)"

echo "Committed. Remote still has these paths until you push."
if $DO_PUSH; then
  git push
  echo "Pushed — remote no longer tracks .next* at HEAD."
else
  echo "Run: git push   (or: pnpm git:purge-next --push)"
fi
