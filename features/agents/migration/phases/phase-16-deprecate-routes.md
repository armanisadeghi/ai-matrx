# Phase 16 — Deprecate Prompt Routes

**Status:** not-started
**Owner:** _unassigned_
**Prerequisites:** Phase 14 green
**Unblocks:** Phase 17

## Delete
- `app/(authenticated)/ai/prompts/**`
- `app/(authenticated)/prompt-apps/**`
- `app/(authenticated)/org/[slug]/prompts/**`, `.../prompt-apps/**`
- `app/(authenticated)/(admin-auth)/administration/prompt-builtins/**`
- `app/(authenticated)/(admin-auth)/administration/prompt-apps/**`
- `app/(authenticated)/(admin-auth)/administration/shortcut-categories/**` (migrated to agent-shortcuts admin)
- `app/(dev)/demos/prompts/**`
- `app/(public)/p/fast/[slug]/**`, `p/demo/[slug]/**`, `p/fast-test/[slug]/**` (keep `/p/[slug]` redirecting to agent-apps)
- `app/(authenticated)/layout-tests/prompt-input/**`

## Also
- Redirect-map from old prompt URLs to agent equivalents, 301.

## Change log
| Date | Who | Change |
|---|---|---|
