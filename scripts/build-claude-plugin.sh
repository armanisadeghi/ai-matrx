#!/usr/bin/env bash
# Rebuild the public Claude plugin + skill downloads served from aimatrx.com/claude/ (the
# "Bring your work" page links them). Source of truth: public/claude/plugins/ai-matrx/.
# Run after editing anything under it, and commit the zips with the change.
#   bash scripts/build-claude-plugin.sh
set -euo pipefail
cd "$(dirname "$0")/../public/claude"
rm -f ai-matrx-plugin.zip skills/*.zip
mkdir -p skills
(cd plugins/ai-matrx && zip -qrX ../../ai-matrx-plugin.zip . -x '*.DS_Store' '*__pycache__*')
for dir in plugins/ai-matrx/skills/*/; do
  name="$(basename "$dir")"
  (cd plugins/ai-matrx/skills && zip -qrX "../../../skills/$name.zip" "$name" -x '*.DS_Store' '*__pycache__*')
done
ls -1 ai-matrx-plugin.zip skills/*.zip
