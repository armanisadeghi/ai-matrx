# Open Items — Prompts → Agents Migration

**Living document.** Anything pending that either of us needs to not-forget lives here. Close items by deleting them or moving to a phase doc. Don't let this file rot.

Last updated: 2026-04-21

---

## 🔴 Critical bugs (block testing)

- **Variables not applied at launch.** Shortcuts with `scope_mappings` + agent variable definitions don't actually receive their resolved values at execution time. Root cause is the shortcut↔options contract — being fixed in **Phase 3.5 (this cycle)**.
- **`apply_variables` semantics ambiguous.** Column is being read by the thunk but its meaning is inconsistent with how agents work. Dropped in Phase 3.5.
- **`show_variables` is derived UI state, stored in DB.** Will be removed and computed at runtime.

## 🟡 Design decisions blocking phases

| # | Decision | Phase | Owner |
|---|---|---|---|
| D1 | Quick actions: Option A / B / C (recommended: **B**, new `app_actions` table) | Phase 4 | user |
| D2 | Code-editor agent IDs — seed 3 agents or add shim in launcher | Phase 6 | user |
| D3 | Applets composite routing prefix `/p/[parent]/[child]` vs `/c/[slug]` | Phase 10 | user |
| D4 | Applets conversation TTL (forever / 1d / 7d / 30d) | Phase 10 | user |
| D5 | Applets publish-time validation — hard-error or soft-warn on unsatisfied child slots | Phase 10 | user |

## 🧪 Outstanding smoke tests

- [ ] `/ssr/context-menu/scenarios` — 5-panel exercise per the scenario page's "Expected behavior" list
- [ ] Launch `Quick Code Explanation` shortcut (id `863b28c4-bb94-400f-8e23-b6cf50486537`) from `/ssr/context-menu/lab`; verify variables + context_slots + pre-execution gate + bypass timer all fire correctly
- [ ] `/chat` — own/system agent picker, history, deep-link resume
- [ ] `/administration/system-agents` — admin CRUD end-to-end (renamed from `agent-shortcuts` on 2026-04-22)
- [ ] `/agents/shortcuts` — user CRUD end-to-end
- [ ] `/org/[slug]/shortcuts` — member sees read-only; owner/admin sees full CRUD
- [ ] `/administration/agent-apps` — admin table + feature/verify + rate-limit override

## ⏳ In-flight work

- **Phase 3.5** — Agent Execution Config bundle. DB schema + canonical type + slice/thunks + CRUD UI. See `phases/phase-03.5-agent-execution-config.md`. Currently: plan written, SQL drafted, awaiting user sign-off to run migration.

## 📦 Technical debt to clean up after Phase 3.5

- `as unknown as any` casts in:
  - `app/api/agent-context-menu/route.ts`
  - `app/api/public/agent-apps/[slug]/execute/route.ts`
  - `app/api/agent-apps/[id]/*`
  - `app/(public)/p/[slug]/page.tsx`
  - `lib/services/agent-apps-admin-service.ts`
- Phase 1 task 1.9 — full per-role RLS tests (currently only pre-flight)
- SSR notes menu still couples to `features/prompt-builtins` (flagged in `INVENTORY.md`)
- `features/cx-chat/` + `features/public-chat/` still import from `features/prompts/**` (types + 4 components; Phase 18 cleanup)
- `lib/redux/slices/aiChatSlice` — Phase 20 retirement

## ✅ Recently landed (for reference, don't act on these)

- Phases 0, 1 (code-complete), 2.1, 3, 5, 7 (partial), 8 (code-complete), 9, 10 (design), 11, 12, 13
- Context menu v2 with `addedContexts` / `excludedContexts` + per-placement `show/hide/disable`
- `text_before` / `text_after` enrichment at launch
