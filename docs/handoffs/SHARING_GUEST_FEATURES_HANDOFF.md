---
status: active
updated: 2026-07-08
repos: [matrx-frontend, aidream]
---

# Sharing & Guest-Use — remaining work

## Vision — Arman's words

- On shareability: "**nearly everything should be shareable** — the gate is per-type safety, not restriction."
- **The run/share/fork rule for agents (verbatim — this is the load-bearing model):**
  - *Public (no share needed):* "The non-secret parts of all agents is public so it doesn't require sharing (id, name, description, variables, context slots, and the other things that don't include model, settings and messages or other secret stuff) — these are public so sharing is not required and that means you can 'use them' but you can never actually see them so you **CANNOT fork/duplicate** them."
  - *Shared:* "when I share my agent with you, I'm not sharing the ability to run it, I'm sharing all of the secrets with you so you can see it in the agent builder and **YES, you can fork it**. If you can see the secret stuff, you can copy them too."
  - *Edit access* → also forkable (superset of a view-share: see secrets + modify the original + fork).
  - **Corollary:** running is a PUBLIC capability of every agent (guests included) and never needs a share; a share/permission is the ONLY thing that reveals secrets (builder visibility) and thereby unlocks fork. `/s/[token]` for an agent is a **builder view + Fork**, NOT a run form.
- On agent-run-as-guest: guest run plugs into the existing guest-identity + guest→user promotion funnel (guest runs it, signs up, keeps the work). Arman: "essentially already there... make sure we didn't accidentally leave something out." Verified: partly — see Remaining §1.
- On agent-app SEO indexing (his stated traffic priority): index **published + verified only**, "as long as you also build a simple admin page where we can review them and easily verify them."

## Resources

- Read first: [`features/sharing/FEATURE.md`](../../features/sharing/FEATURE.md) (Change Log 2026-07-07) + [`features/notes/FEATURE.md`](../../features/notes/FEATURE.md) (2026-07-07/08 shared-notes entry) + [`features/agent-apps/FEATURE.md`](../../features/agent-apps/FEATURE.md) + [`features/agents/components/chat/FEATURE.md`](../../features/agents/components/chat/FEATURE.md).
- Test login: `/login` with `admin@admin.com` / `Password1234#`.

**Link sharing core.** `platform.share_links` + `resolve_share_token(p_token)` (anon SECURITY DEFINER, column-allowlisted via `platform.shareable_resource_registry.public_columns` — body `migrations/share_link_policy_and_admin.sql:92-134`). Owner RPCs `create_share_link`/`list_share_links`/`revoke_share_link`. FE `utils/permissions/shareLinks.ts` + `ShareLinkPanel`. Public route `app/(public)/s/[token]/page.tsx` → `SharedResourceView.tsx` (`renderBody` switch — cases: `note`/`content_template`/`code_file`/`fc_card`, else `GenericRenderer`). Admin policy: `/administration/sharing` (`admin_list_share_policies`/`admin_set_share_policy`); `get_share_capabilities(type)` drives owner UI.
- Agent share allowlist (already safe, `share_link_policy_and_admin.sql:59`): `id, name, description, agent_type, variable_definitions, category, tags, created_at, updated_at`. Excludes `messages/settings/model_id/tools/custom_tools/mcp_servers` — exactly the guest-run allowlist. Reachable ONLY via `resolve_share_token`.
- Fork RPCs (`fork_shared_conversation`/`fork_shared_flashcard_set`/`fork_shared_quiz`) applied **directly in Supabase — no migration files, per owner instruction**; `pg_get_functiondef` if formalizing. `isForkable` (`shareLinks.ts`) = `conversation | fc_set | quiz_sessions` only.
- Per-resource "shared with me" pattern: `get_notes_shared_with_me` (`migrations/get_notes_shared_with_me_rpc.sql`) — copy for other types.

**Guest identity + promotion funnel** (the "more to this").
- Anon visitors are identified by **browser fingerprint**, not an anon Supabase key: `X-Fingerprint-ID` header (`hooks/useApiAuth.ts:63-75`, `lib/services/fingerprint-service.ts`; live-chat twin `resolve-base-url.ts:147-151`). Python guest registry (aidream `_guest_registry_impl.py`) mints an anon identity per fingerprint; rows land in `public.guest_executions`. Guest quota: `lib/services/guest-limit-service.ts`.
- Promotion on signup: email/password = in-place same-UUID (`lib/services/guest-promotion.ts`); OAuth = ownership transfer via `transfer_guest_data_to_user` SECURITY DEFINER RPC (`lib/services/guest-oauth-transfer.ts` + `migrations/guest_oauth_data_transfer.sql`, auto-discovers every FK to `auth.users`). Both fail-open.

**Agent run paths (bare agents = `agent.definition`, legacy `agx_agent`; distinct from agent-APPS = `app.definition`).**
- Public system-agent chat: `app/(public)/p/chat/a/[id]/page.tsx` (`warmAgent(id)` server-side) → `ChatContainer` → deprecated `useAgentChat`. Wire body to `/ai/agents/{id}` sends only `user_input/variables/config_overrides/context` — **no secrets on the wire** (backend loads them by id). Guest-auth via `X-Fingerprint-ID`.
- Live `/chat` launcher: `launch-agent-execution.thunk.ts:426` calls `fetchAgentExecutionFull` → `supabase.rpc("agx_get_execution_full")` — **`LANGUAGE sql STABLE`, NOT SECURITY DEFINER** (`migrations/agx_config_normalization_matrx_actions_ui_gates.sql:186-197`). It returns `model_id/settings/tools/custom_tools` to the browser. Safe guest pattern already exists: the `baseSettings: {}` shortcut in `create-instance.thunk.ts:456-464` (let Python resolve settings from the id; never call `agx_get_execution_full`).

**Agent-app SEO surface (agent APPS, `app.definition`).**
- Public page `app/(public)/p/[slug]/page.tsx`: exports `generateMetadata` (OG + Twitter per app from `name/tagline/description/preview_image_url`, `:47-84`), gated `status='published' AND visibility='public'`. **No `robots` directive anywhere; no `app/robots.ts`; no `app/sitemap.ts`; no `/discover` index.** App body renderer is `dynamic(ssr:false)` (`AgentAppPublicRenderer.tsx:26-38`) → server HTML is head/metadata only.
- Columns on `app.definition`: `is_verified`, `is_featured`, `status (draft|published|archived|suspended)`, `visibility`, `is_public` — all exist.
- **Verify UI already exists per-app**: `features/agent-apps/components/AgentAppAdminActions.tsx` (Verify + Feature toggles, status setter) inside `app/(admin)/administration/agent-apps/edit/[id]/page.tsx`. Write path `lib/services/agent-apps-admin-service.ts#updateAgentAppAdmin` (`:318-342`) is a **direct RLS-gated `.update()` on `app.definition`** — no admin RPC. What's missing is a **review queue** (list of published-but-unverified apps), not the per-app toggle.

## Remaining work

1. **Guest run (public capability) + fork-on-share** (highest-leverage). Two separable pieces, per the run/share/fork rule above.

   **1A — Public run of ANY agent (no share).**
   - **Verify/build the public non-secret read surface.** The rule says id/name/description/`variable_definitions`/`context_slots`/type/category/tags are public for *every* agent. The run path currently reads them via `agx_get_execution_full` — `LANGUAGE sql STABLE`, RLS-gated, and it also returns `model_id/settings/tools/custom_tools` (`migrations/agx_config_normalization_matrx_actions_ui_gates.sql:186-197`). That's fine for a share-holder but WRONG for public/guest. Need a public read that returns ONLY the non-secret columns (SECURITY DEFINER RPC or a column-scoped RLS policy). **Confirm current anon state first** (does anon get the public fields today? almost certainly not).
   - **Guest run must NEVER call `agx_get_execution_full`.** Use the `baseSettings: {}` shortcut (`create-instance.thunk.ts:456-464`): empty `config_overrides`, Python resolves prompt/model/tools from the agent id server-side. Ensure `X-Fingerprint-ID` is populated (`useApiAuth`).
   - **Backend run-by-id for anon (aidream).** `/ai/agents/{id}` authorizes by JWT/fingerprint. Since running is public, Python must run any agent by id for an anon fingerprint (subject to guest quota, `guest-limit-service.ts`) — no token needed. Confirm this works today or add it.
   - **Funnel tie-in:** a guest run writes `guest_executions`; promotion RPCs carry it to the account on signup. Confirm the run lands there so the conversation survives signup (the acquisition payoff).

   **1B — `/s/[token]` agent = builder view + Fork (secrets), NOT a run form.**
   - Add an `agent` case to `SharedResourceView.tsx#renderBody` (today it falls to `GenericRenderer`). It should open the agent in the **builder** (read-only for a view-share, editable for an edit-share) using the share/permission to authorize secret delivery, plus a **Fork** button.
   - Build `fork_shared_agent` (mirror the other fork RPCs — applied directly in Supabase per owner instruction), gated on the caller holding a share/permission that conveys secrets (view or edit). Add `agent` to `isForkable` + `forkSharedResource` (`utils/permissions/shareLinks.ts`) once it exists. Public-only users must NOT be able to fork.
   - Table identity: confirm `utils/permissions/registry.ts` `agent` → `agent.definition` is the same physical table the run path reads as `agx_agent`.

2. **Agent-app SEO — published + verified** (decision made). 
   - Set `robots: { index: true }` in `generateMetadata` ONLY when `status='published' AND is_verified=true`; `robots: { index: false }` otherwise. `/s/[token]` stays `noindex`.
   - Add `app/sitemap.ts` enumerating `app.definition` where `status='published' AND is_verified=true AND visibility='public'` (pattern: `features/education/publishing/sitemap.ts`).
   - **SEO caveat:** the app body is `ssr:false`, so indexable HTML is metadata-only. For real ranking value, SSR a text hero (name/tagline/description) into the server HTML even though the interactive island stays client-only.
   - **Build the review queue** (Arman's condition): a simple admin page listing published-but-unverified apps with inline Verify — the per-app toggle already exists (`AgentAppAdminActions`), so this is a filtered list (`fetchAgentAppsAdmin` already supports `is_verified/status` filters) + a batch/inline verify action, added under `app/(admin)/administration/agent-apps/`. Optional public `/discover` index for internal linking.

3. **Child-row inclusion + richer per-type public renderers.** `resolve_share_token` returns only the resource row; conversation (message thread), fc_set (member cards study/preview), quiz (take-quiz UI without answer key), canvas_item/transcript/code (interactive viewers) render thin. Either extend `resolve_share_token` with declared per-type child sets or add per-type token-authorized child-read RPCs; renderers dispatch in `SharedResourceView.tsx#renderBody`.

4. **Auto-fork after signup.** Carry fork intent through signup (`redirectTo=/s/[token]?fork=1`) and auto-run on return; today the user must click again.

5. **Share-link expiry / max-uses UI.** `ShareLinkPanel` doesn't expose `p_expires_at` / `p_max_uses` (RPC supports both).

6. **Broaden allowlists as renderers land.** Many types are `is_link_shareable=false`; as each renderer ships, enable + set `public_columns` via the admin panel.

## Done

- Canonical no-login link sharing + policy admin + DM-on-share + fork RPCs — see `features/sharing/FEATURE.md` 2026-07-07.
- Notes shared-with-me (desktop + mobile) + real read-only enforcement + loud lost-write protection (4 adversarial-review holes closed) — see `features/notes/FEATURE.md` 2026-07-07/08.
- Run/share/fork model for agents decided by Arman — encoded in Vision above (run = public, no fork; share = secrets + fork).
