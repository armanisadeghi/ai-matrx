# Tool Registry · Bundles

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/agents/agent-tools/STATE.md — read it before touching this feature in ANY repo. It carries the bundle model, the lister invariant, and the shared-lister exception.

Admin route `/administration/agents/bundles`.

## Entry points

- Page: [app/(admin)/administration/agents/bundles/page.tsx](../../../app/(admin)/administration/agents/bundles/page.tsx) → [BundlesAdminPage.tsx](./components/BundlesAdminPage.tsx)
- Service — the one primitive, reads + writes: [services/bundles.service.ts](./services/bundles.service.ts)
- Agent picker: [AgentBundlesPanel.tsx](../../agents/components/tools-management/AgentBundlesPanel.tsx) via [useAgentBundleOptions.ts](../../agents/components/tools-management/useAgentBundleOptions.ts)
- Runtime badges: [`../shared/toolRuntimes.service.ts`](../shared/toolRuntimes.service.ts) + `useToolRuntimes`

## Rules

1. **`listAgentBundleOptions()` is the canonical read for any bundle picker.** Callers add or
   remove `contributedToolIds` — which is always just `[lister_tool_id]`. Never add raw members.
   Persistence is identical to any tool: the UUID lands in `agx_agent.tools`. No agent-side
   special-casing.
2. **Reads stay client-side** (`tool.bundle` / member table have a public SELECT policy);
   **writes go through admin-gated API routes** under `app/api/admin/bundles/**` with the
   service client. Both tables are RLS read-only for users.
3. **Create only via `createBundleWithLister`** (the `create_bundle_with_lister` RPC). Never
   insert a bundle row directly — `lister_tool_id` is `NOT NULL` and the RPC is what wires it.
4. **Never expose a bundle NAME or a member `local_alias` as an editable field on an EXISTING
   row.** `updateBundle` patches only the bundle row, so a rename leaves agents calling the old
   `bundle:list_<name>`; an alias rename breaks call sites mid-run. Both are capability, not
   copy. `NAME_RE` lives in `bundlesVocabulary.ts` so the human validation, the agent-write
   check, and the surface manifest are one definition.
5. **Shared-lister bundles are excluded from the picker** (>1 bundle on one lister). Filter on
   that, not on a hardcoded list of the 14 browser bundles.
6. **Runtime badges are labeling only** — never block assignment on them (agents are
   surface-independent; the server gates at runtime), and render no badge on a failed read
   rather than breaking the picker.
7. **No hard-delete.** Bundles are FK targets via their member table; use the active toggle.
8. `confirm()` from `@/components/dialogs/confirm/ConfirmDialogHost` for destructive flows.
   No barrel files; direct imports. `tool.bundle.name` is UNIQUE — duplicates fail at save with
   a Postgres error surfaced via toast.
9. **Radix dialogs on this page set `onInteractOutside={preventDefault}`** — dismissing the
   stacked surface-write confirm counts as an outside interaction and would close the form,
   discarding the staged value.

## Not built

A standalone personal-bundle manager under `/bundles`; users consume bundles in the agent picker.

## Change Log

- **2026-08-25** — Cut to local mechanics by the `agent-tools` consolidation; the bundle model,
  the lister invariant, the shared-lister exception, and the decision history moved to the
  node's STATE.md and DECISIONS.md.
- **2026-08-21** — "Runs on" runtime labeling in the pickers (`shared/toolRuntimes.service.ts`
  + `useToolRuntimes`).
- **2026-08-12** — Console made agent-writable: `matrx-admin/bundles` surface with two
  ask-policy DRAFT targets, `new_bundle_draft` and `bundle_description`. Nothing saves.
- **2026-06-21** — Lister enforcement migration; Bundles category added to the agent tools
  manager.
- **2026-05-05** — Phase 3 shipped: initial admin bundle page + service.
