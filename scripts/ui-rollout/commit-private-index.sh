#!/usr/bin/env bash
# Commit ONLY the button-door codemod's own hunks in a shared, dirty checkout.
#
# The codemod is re-run on each file's HEAD blob (never the working copy, which
# may carry other sessions' uncommitted edits); the results go into a PRIVATE
# index built from HEAD and are committed from there. Other sessions' work is
# never staged. Afterwards the shared index entries of the committed paths move
# to the new blobs, but only where nobody had staged something else.
#
#   scripts/ui-rollout/commit-private-index.sh "<message>" [extra files to commit as-is...]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
msg="$1"; shift
extra=("$@")
tmp="$(mktemp -d)"
files="$tmp/files.txt"
git diff --name-only HEAD -- '*.tsx' > "$files"
# shellcheck disable=SC2046
node scripts/ui-rollout/button-door-codemod.mjs --head-index "$tmp/index-info" $(cat "$files") >/dev/null
old_head="$(git rev-parse HEAD)"
export GIT_INDEX_FILE="$tmp/index"
git read-tree "$old_head"
git update-index --index-info < "$tmp/index-info"
for f in "${extra[@]}"; do
  sha="$(git hash-object -w -- "$f")"
  git update-index --add --cacheinfo "100644,$sha,$f"
done
if git diff --cached --quiet "$old_head"; then echo "nothing to commit"; exit 0; fi
git diff --cached --name-only "$old_head" > "$tmp/committed"
# HEAD moved under us (another session committed): never commit a tree that would revert it.
[ "$(git rev-parse HEAD)" = "$old_head" ] || { echo "HEAD moved; re-run"; exit 75; }
git commit -q -m "$msg"
unset GIT_INDEX_FILE
# shared index: move each committed path to its new blob unless someone staged it
while IFS= read -r p; do
  old="$(git rev-parse -q --verify "$old_head:$p" 2>/dev/null || true)"
  cur="$(git ls-files -s -- "$p" | awk '{print $2}')"
  new="$(git rev-parse "HEAD:$p")"
  if [ -z "$cur" ] || [ "$cur" = "$old" ]; then git update-index --add --cacheinfo "100644,$new,$p"; fi
done < "$tmp/committed"
echo "committed $(wc -l < "$tmp/committed" | tr -d ' ') files: $(git log -1 --format='%h %s')"
