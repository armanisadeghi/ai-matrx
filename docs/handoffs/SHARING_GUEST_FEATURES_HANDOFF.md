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
- Promotion on signup: email/password = in-place same-UUID (`lib/services/guest-promotion.ts`); OAuth = ownership transfer via `transfer_guest_data_to_user` SECURITY DEFINER RPC (`lib/services/guest-oauth-transfer.ts` + `migrations/guest_oauth_data_transfer.sql`). **CAVEAT (verified):** OAuth transfer walks `pg_constraint` and only re-owns columns with a real FK to `auth.users(id)` — a guest-written table whose owner column is a bare `uuid` with no FK is silently missed. `cx_agent_*`/`cx_code_edit_history`/`app.execution` carry real FKs (covered); the conversation thread `cx_conversation`/`cx_message` FK status is **live-DB-only** — verify before trusting a guest agent run survives OAuth signup. Email/password (same-UUID) has no such gap. `guest_executions` is intentionally re-linked (`converted_to_user_id`), not FK-transferred.

**Agent run paths (bare agents = `agent.definition`, legacy `agx_agent`; distinct from agent-APPS = `app.definition`).**
- Public system-agent chat: `app/(public)/p/chat/a/[id]/page.tsx` (`warmAgent(id)` server-side) → `ChatContainer` → deprecated `useAgentChat`. Wire body to `/ai/agents/{id}` sends only `user_input/variables/config_overrides/context` — **no secrets on the wire** (backend loads them by id). Guest-auth via `X-Fingerprint-ID`.
- Live `/chat` launcher: `launch-agent-execution.thunk.ts:426` calls `fetchAgentExecutionFull` → `supabase.rpc("agx_get_execution_full")` — **`LANGUAGE sql STABLE`, NOT SECURITY DEFINER** (`migrations/agx_config_normalization_matrx_actions_ui_gates.sql:186-197`). It returns `model_id/settings/tools/custom_tools` to the browser. Safe guest pattern already exists: the `baseSettings: {}` shortcut in `create-instance.thunk.ts:456-464` (let Python resolve settings from the id; never call `agx_get_execution_full`).

**Agent-app SEO surface (agent APPS, `app.definition`).**
- Public page `app/(public)/p/[slug]/page.tsx`: exports `generateMetadata` (OG + Twitter per app from `name/tagline/description/preview_image_url`, `:47-84`), gated `status='published' AND visibility='public'`. **No `robots` directive on the page.** Sitemap/robots infra DOES exist — `app/sitemap.xml/route.ts` + `app/robots.txt/route.ts` (both education-scoped today); extend, don't create. App body renderer is `dynamic(ssr:false)` (`AgentAppPublicRenderer.tsx:26-38`) → server HTML is head/metadata only.
- Columns on `app.definition`: `is_verified`, `is_featured`, `status (draft|published|archived|suspended)`, `visibility`, `is_public` — all exist.
- **Verify UI already exists per-app**: `features/agent-apps/components/AgentAppAdminActions.tsx` (Verify + Feature toggles, status setter) inside `app/(admin)/administration/agent-apps/edit/[id]/page.tsx`. Write path `lib/services/agent-apps-admin-service.ts#updateAgentAppAdmin` (`:318-342`) is a **direct RLS-gated `.update()` on `app.definition`** — no admin RPC. What's missing is a **review queue** (list of published-but-unverified apps), not the per-app toggle.

## Remaining work

> Scouting (2026-07-08) verified the model against live source in both repos. Net: the backend already runs any agent by id, the fork primitive already exists — most remaining work is a **read surface + guardrails + wiring**, plus two model-violations to close. Details below.

1. **Guest run (public capability).** Read surface + backend DONE; only the FE run route remains.
   - **DONE — public read surface.** `public.get_agent_public(p_agent_id)` (SECURITY DEFINER, `GRANT EXECUTE TO anon, authenticated`; `migrations/get_agent_public_rpc.sql`, ledger-recorded, types regenerated) returns ONLY `id, name, description, variable_definitions, context_slots, agent_type, category, tags`. Live-verified with the `anon` role: guest gets the non-secret payload; a direct anon read of `agent.definition` returns 0 rows (secrets never reach anon). Client primitive: `getAgentPublic()` in `lib/agents/publicAgent.ts` (isomorphic — pass an SSR client or default to the browser client).
   - **REMAINING — wire the guest run surface.** `/s/[token]` is NOT the run path (running needs no token). Build a public agent-run page (extend the `/p/chat/a/[id]` shell or a new `/p/a/[id]` "run this agent" route): read `getAgentPublic(id)`, render the variable form from `variableDefinitions`, and stream via `X-Fingerprint-ID` + the `baseSettings:{}` shortcut (`create-instance.thunk.ts:456-464`). MUST NOT call `agx_get_execution_full` (INVOKER → 0 rows for anon, and it carries secrets); Python resolves prompt/model/tools by id server-side.
   - **aidream backend already works — nothing to enable.** Verified: `POST /ai/agents/{id}` runs any agent by id for a fingerprint guest, secrets stay server-side (`agent_run.py:162` loads by id over service-role; client body carries only `user_input/variables/config_overrides` deltas). Running any agent by id is the intended public model. Optional hardening only, not a blocker: a guest run quota (cost) and ignoring body `tools`/`tools_replace` for `auth_type=='fingerprint'` (`models.py:44-49`) so a guest can't swap an agent's tool set.
   - **Funnel tie-in** already works for the `cx_agent_*` family (real FKs); confirm the conversation thread carries over (see promotion CAVEAT in Resources).

2. **Fork-on-share.** The fork PRIMITIVE already exists — `agx_duplicate_agent(p_agent_id, p_as_system)` (`migrations/agx_duplicate_agent_preserve_system_type.sql`): SECURITY DEFINER, copies the full config, gated `check_resource_access('agx_agent', id, 'viewer') OR is_public`. A viewer+ share-holder can already fork. Remaining:
   - **The `OR is_public` clause** lets ANY authenticated user duplicate a public agent's FULL secrets (`messages/settings/model_id/tools`) — which reads as a conflict with "public = run-only, never see/fork." BUT it's also how "fork a builtin/system template into my workspace" works today (the migration comment calls that flow legitimate). Pending Arman's call (see Decisions): either builtins stay forkable-with-secrets (leave as-is), or forking requires a real secrets-share and a public duplicate copies only the non-secret shell.
   - **`/s/[token]` agent case** (`SharedResourceView.tsx#renderBody` falls to `GenericRenderer` today): render the builder-secrets view (below) + a Fork button calling `agx_duplicate_agent`. Add `agent` to `isForkable` + `forkSharedResource` (`utils/permissions/shareLinks.ts`); the deep-link target `/agents/{id}` is auth-gated, so a share-holder-guest needs a real authorized route.
   - **Read-only builder for a view-share** (silent-lost-work risk — same class we just fixed for notes). Verified: the builder (`AgentBuilderClient`/`Desktop`) has NO owner/readOnly gate — it renders whatever RLS lets `getAgent` (`lib/agents/data.ts:52-63`, `select("*")`) read, and it's an **autosave editor**. So a viewer-level share-holder already opens the full secrets builder AND every edit RLS-rejects silently. Add a `useAccess('agent', id)`-driven read-only builder mode (view-share = read + fork, edit-share = edit original + fork). `get_resource_access` already resolves agent access levels.

3. **Agent-app SEO — published + verified** (decision made). Infra partly exists — EXTEND, don't build.
   - **`app/sitemap.xml/route.ts` and `app/robots.txt/route.ts` already exist** (education-scoped). Extend `sitemap.xml` to enumerate `app.definition` where `status='published' AND is_verified=true AND visibility='public'`; note `robots.txt` currently `Disallow: /apps` (the `/p/` path is not disallowed).
   - Set `robots: { index: true }` in `p/[slug]` `generateMetadata` ONLY when `status='published' AND is_verified=true`, else `index:false`. `/s/[token]` stays `noindex`.
   - **SEO caveat:** app body is `dynamic(ssr:false)`, so indexable HTML is metadata-only. For real ranking value, SSR a text hero (name/tagline/description) into server HTML even though the interactive island stays client-only.
   - **Review queue** (Arman's condition): the per-app Verify toggle + write path + filtered fetch all exist (`AgentAppAdminActions`, `updateAgentAppAdmin`, `fetchAgentAppsAdmin` `is_verified/status` filters) — so this is a filtered list page + inline verify under `app/(admin)/administration/agent-apps/`, not new infra. Optional public `/discover` index for internal linking.

4. **Child-row inclusion + richer per-type public renderers.** `resolve_share_token` returns only the resource row; conversation (message thread), fc_set (member cards study/preview), quiz (take-quiz UI without answer key), canvas_item/transcript/code (interactive viewers) render thin. Either extend `resolve_share_token` with declared per-type child sets or add per-type token-authorized child-read RPCs; renderers dispatch in `SharedResourceView.tsx#renderBody`.

5. **Auto-fork after signup.** Carry fork intent through signup (`redirectTo=/s/[token]?fork=1`) and auto-run on return; today the user must click again.

6. **Share-link expiry / max-uses UI.** `ShareLinkPanel` doesn't expose `p_expires_at` / `p_max_uses` (RPC supports both).

7. **Broaden allowlists as renderers land.** Many types are `is_link_shareable=false`; as each renderer ships, enable + set `public_columns` via the admin panel.

## Decisions needed (Arman)

1. **Should a PUBLIC/builtin agent be forkable-with-secrets?** Situation: today any signed-in user can duplicate a public agent (system/builtin templates included) and the copy carries the full secret config (prompt, settings, model, tools) — that's how "fork a builtin into my workspace to customize it" works now (`agx_duplicate_agent`'s `OR is_public`). Your rule says public agents are run-only and can't be forked because you can't see their secrets. These conflict for builtins/templates specifically. Decide: (a) keep builtins forkable-with-secrets (templates are meant to be copied+customized — leave `agx_duplicate_agent` as-is); or (b) enforce the rule strictly — forking requires a secrets-share, and duplicating a public agent copies only the non-secret shell. Everything else in the fork model (share ⇒ fork) is unaffected either way.

## Done

- Canonical no-login link sharing + policy admin + DM-on-share + fork RPCs — see `features/sharing/FEATURE.md` 2026-07-07.
- Notes shared-with-me (desktop + mobile) + real read-only enforcement + loud lost-write protection (4 adversarial-review holes closed) — see `features/notes/FEATURE.md` 2026-07-07/08.
- Run/share/fork model for agents decided by Arman — encoded in Vision above (run = public, no fork; share = secrets + fork).
- Scouting pass (2026-07-08, both repos): backend run-by-id + secret-loading + fork primitive (`agx_duplicate_agent`) + builder-secrets-via-RLS already exist; remaining §1–2 is a read surface + guardrails + wiring + two model-violation fixes.
