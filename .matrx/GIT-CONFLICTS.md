# Git conflicts — goal: ZERO items

Written automatically by `sync-main` (scripts/sync-main.py) whenever it
syncs this repo with GitHub and hits something it cannot safely decide alone.

**Agents: your job is to make this file empty.**
1. Pick an item below and fix it.
2. DELETE its line. When a folder has no files left, delete the folder and its heading.
3. Never keep history here. A fixed item is deleted, never ticked or annotated.

Leftover check (finds any marker still in the repo, listed or not):
`python3 scripts/check-conflict-markers.py`

## Held files — real conflicts
GitHub's version of each file is live. Our local version waits in the `.held` file under
`_conflicts/`. Merge what is worth keeping into the live file, delete the `.held` file, delete
the line here.

### _conflicts/2026-09-24-113745/
- app/(admin)/administration/agents/agent-apps/apps/page.tsx
- components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts

## Docs and comments — both versions kept
Both versions sit in the file between marker lines. Keep the right text, delete the marker
lines, delete the line here.
