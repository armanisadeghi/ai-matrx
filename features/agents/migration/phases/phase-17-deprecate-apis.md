# Phase 17 — Deprecate Prompt APIs

**Status:** not-started
**Owner:** _unassigned_
**Prerequisites:** Phase 16
**Unblocks:** Phase 18

## Delete
- `app/api/prompts/**`
- `app/api/prompt-apps/**`
- ~~`app/api/public/apps/**`~~ — **done `2026-08-11`** (both routes were dead; directory removed)
- `app/api/admin/prompt-builtins/**`
- `app/api/admin/prompt-shortcuts/**`
- `app/api/admin/shortcut-categories/**`
- `app/api/system-prompts/**`
- `app/api/recipes/[id]/convert-to-prompt/**`

## Verification
- grep across whole repo for import of any removed route — must be zero hits outside `features/agents/migration/`.

## Change log
| Date | Who | Change |
|---|---|---|
