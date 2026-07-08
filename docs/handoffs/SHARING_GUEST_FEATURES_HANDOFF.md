---
status: active
updated: 2026-07-08
repos: [matrx-frontend]
---

# Sharing & Guest-Use — remaining work

## Vision — Arman's words

- On shareability: "**nearly everything should be shareable** — the gate is per-type safety, not restriction."
- On agent sharing: the "secret sauce stays hidden" model — a shared agent must be runnable without exposing `messages`/`settings`/`tools`/`mcp_servers`/`model_id`.
- Agent apps as public SEO pages are the owner's stated traffic priority.

## Resources

- Read first: [`features/sharing/FEATURE.md`](../../features/sharing/FEATURE.md) (Change Log 2026-07-07) + [`features/notes/FEATURE.md`](../../features/notes/FEATURE.md) (2026-07-07 shared-notes entry).
- Core plumbing: `platform.share_links` + `resolve_share_token` (anon, column-allowlisted via `shareable_resource_registry.public_columns`), owner RPCs `create_share_link`/`list_share_links`/`revoke_share_link`, FE `utils/permissions/shareLinks.ts` + `ShareLinkPanel`, public route `app/(public)/s/[token]/`.
- Admin: `/administration/sharing` (`admin_list_share_policies` / `admin_set_share_policy`); `get_share_capabilities(type)` drives owner UI.
- Fork RPCs (`fork_shared_conversation` / `fork_shared_flashcard_set` / `fork_shared_quiz`) were applied **directly in Supabase — no migration files, per owner instruction**; capture bodies via `pg_get_functiondef` if formalizing.
- Per-resource "shared with me" pattern: `get_notes_shared_with_me` (migration `migrations/get_notes_shared_with_me_rpc.sql`) — copy for other types.
- Test login: `/login` with `admin@admin.com` / `Password1234#`.

## Remaining work

1. **Agent run-as-guest.** A shared agent (allowlist: `name, description, agent_type, variable_definitions, category, tags`) must be runnable logged-out without exposing internals. Extend the agent-app public runner pattern (`app/(public)/p/[slug]` via `get_aga_public_data`, `features/agent-apps/components/AgentAppPublicRenderer.tsx`, `features/public-chat/`) to bare shared agents: a `run_shared_agent`-style server entry authorized by share token; `/s/[token]` agent renderer = variable form + Run button streaming results.
2. **Agent apps as Google-indexed SEO pages.** `/p/[slug]` should set `robots: index` for `status='published'`, add `sitemap.ts` enumerating published apps, rich OG/Twitter meta (`title/tagline/preview_image_url` columns exist), consider a `/discover` index page. `/s/[token]` stays `noindex`. Gate (all published vs verified/featured) = owner decision below.
3. **Child-row inclusion + richer per-type public renderers.** `resolve_share_token` returns only the resource row; conversation (messages thread), fc_set (member cards study/preview), quiz (take-quiz UI without answer key), canvas_item/transcript/code (interactive viewers) render thin. Either extend `resolve_share_token` with declared per-type child sets or add per-type token-authorized child-read RPCs; renderers dispatch in `app/(public)/s/[token]/SharedResourceView.tsx` (`renderBody`).
4. **Auto-fork after signup.** Carry fork intent through signup (`redirectTo=/s/[token]?fork=1`) and auto-run on return; today the user must click again.
5. **Share-link expiry / max-uses UI.** `ShareLinkPanel` doesn't expose `p_expires_at` / `p_max_uses` (RPC supports both).
6. **Broaden allowlists as renderers land.** Many types are `is_link_shareable=false`; as each renderer ships, enable + set `public_columns` via the admin panel.

## Done

- Canonical no-login link sharing + policy admin + DM-on-share + fork RPCs — see `features/sharing/FEATURE.md` 2026-07-07.
- Notes shared-with-me (desktop + mobile) + real read-only enforcement (incl. `MatrxSplit readOnly`) + loud lost-write protection — see `features/notes/FEATURE.md` 2026-07-07/08.

## Decisions needed (Arman)

1. **Agent-app SEO gate.** Situation: public agent-app pages at `/p/[slug]` will become Google-indexable; indexing every `published` app risks spam/low-quality pages in the index. Decide: index ALL published apps, or only `is_verified`/`is_featured` ones (default proposal: published+verified).
2. **Build order.** Situation: remaining items are independent; agent run-as-guest and the read-only chat/flashcard/quiz child views are the highest-leverage for the "guest uses it" story. Decide: priority order for items 1–3.
