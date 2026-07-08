# Handoff — Sharing & Guest-Use, remaining work

**Date:** 2026-07-07
**Context:** The no-login sharing platform is built and live. This doc lists what remains, with enough detail to act cold. Read [`features/sharing/FEATURE.md`](../../features/sharing/FEATURE.md) (Change Log 2026-07-07) first.

---

## What's already DONE (so you don't rebuild it)

**Canonical no-login link sharing.** `platform.share_links` (token, resource_type, resource_id, permission_level, expires_at, max_uses, use_count, is_active) + anon RPC `resolve_share_token(token)` (default-deny **per-type column allowlist** `shareable_resource_registry.public_columns`; kill switch `is_link_shareable`). Public route `app/(public)/s/[token]/` renders any allowlisted resource (markdown / code / flashcard / content-aware generic) with a "Create your own" acquisition CTA. Owner RPCs: `create_share_link` / `list_share_links` / `revoke_share_link`. FE: `utils/permissions/shareLinks.ts` + `ShareLinkPanel` (in ShareModal's Public tab).

**Policy + admin control.** 27 user-content types enabled with safe allowlists (agents expose non-secret fields only; PII/secrets/internal excluded). Super-admin panel `/administration/sharing` (`admin_list_share_policies` / `admin_set_share_policy`) to toggle link-sharing + edit allowlists per type. `get_share_capabilities(type)` drives the owner UI (Public toggle / link panel show only where applicable).

**DM-on-share.** `shareWithUser` sends the recipient a DM with a clickable `EntityCard` (`resource_shared` message kind).

**Fork ("save a copy & use it") — the guest-takeover primitive.** Three SECURITY DEFINER RPCs, gated so you can only fork what was actually shared, assigning the copy to the caller's personal org:
- `fork_shared_conversation(id)` → copies conversation + messages + tool_calls (guest can continue chatting). Verified: guest-owned, 2 msgs copied, non-shared rejected.
- `fork_shared_flashcard_set(id)` → copies set + member cards + fc_detail + membership edges (guest studies + saves own progress via the existing study spine). Verified: 20 cards copied.
- `fork_shared_quiz(id)` → copies quiz with progress/results reset (guest takes it fresh). Verified.
FE: `forkSharedResource()` in `shareLinks.ts` + `ForkAndUseButton` on `/s/[token]` ("Continue this chat" / "Study these flashcards" / "Take this quiz"). Logged-out → `/sign-up?redirectTo=/s/[token]` (returns to finish the fork after signup = new-user acquisition).

> **Note:** these fork RPCs were applied **directly in Supabase** (no migration files, per the owner's instruction). They are NOT in `migrations/` or the `_schema_migrations` ledger. If you later formalize them, capture the bodies via `pg_get_functiondef`.

---

## REMAINING WORK

### 1. Agent run-as-guest (limited sharing — the "secret sauce stays hidden" model)
**Goal:** a shared agent (id + non-secret fields already in its allowlist: `name, description, agent_type, variable_definitions, category, tags`) is **runnable** by a logged-out visitor, WITHOUT exposing `messages`/`settings`/`tools`/`mcp_servers`/`model_id` (all correctly excluded from the anon view).
**Approach:** agents already have a public runner at `app/(public)/p/[slug]` via `get_aga_public_data` (agent APPS). Extend to a bare shared AGENT: a public run path that takes the agent id + a valid share link, fills the declared `variable_definitions`, and invokes the agent server-side (the Python backend holds the secret prompt/config — the client never sees it). The `/s/[token]` agent renderer should show the variable form + a "Run" button that streams results, never the definition internals.
**Files:** `features/agent-apps/components/AgentAppPublicRenderer.tsx` (reference), `features/public-chat/` (public streaming), the agent invocation path. A `run_shared_agent`-style server entry that authorizes by share token, not by user.

### 2. Agent apps as public, Google-indexed SEO pages
**Goal (owner's priority — SEO/traffic driver):** public agent-app pages should be **indexable** (drive organic traffic).
**Current state:** `/p/[slug]` renders published apps but the generic `/s/[token]` route is `robots: noindex` (link-shared, correctly private). Agent-app *public* pages are a different surface.
**Approach:** ensure `app/(public)/p/[slug]` sets `robots: index` for `status='published'` apps, add a `sitemap.ts` enumerating published apps, and rich OG/Twitter meta per app (title/tagline/preview_image_url — already columns). Decide the gate: index ALL published apps, or only `is_verified`/`is_featured` (owner question — default to published+verified to avoid spam indexing). Consider a `/discover` index page of public apps for internal linking.

### 3. Child-row inclusion + richer per-type public renderers
`resolve_share_token` returns only the single resource row (allowlisted columns). Types whose value is in their CHILDREN render thin today:
- **conversation** → needs its `chat.message` rows to show the thread read-only on `/s/[token]` (fork already copies them; the *view* doesn't show them). Add a token-authorized child read (messages, allowlisted fields) + a read-only chat renderer.
- **fc_set** → needs its member cards to show a study/preview on `/s/[token]` (currently shows set metadata only; fork copies the cards).
- **quiz** → a take-the-quiz UI for the fresh fork (questions without the answer key — `state` is excluded from the anon view; the fork resets progress).
- **canvas_item / transcript / code** → interactive canvas viewer, transcript player, syntax-highlighted code (generic markdown/code renderer is the current floor).
**Approach:** either (a) extend `resolve_share_token` to return a declared set of child rows per type (allowlisted), or (b) add per-type token-authorized child-read RPCs. Then per-type renderers in `app/(public)/s/[token]/SharedResourceView.tsx` (dispatch already exists — `renderBody`).

### 4. Fork flow polish — auto-fork after signup
Today: logged-out fork → `/sign-up?redirectTo=/s/[token]` → user returns and clicks again. Smoother: carry the fork intent through signup (e.g. `redirectTo=/s/[token]?fork=1`) and auto-run the fork on return. Minor UX; the current flow works.

### 5. Share-link management surface (owner)
`ShareLinkPanel` mints/lists/revokes links but there's no expiry / max-uses UI (the RPC supports `p_expires_at` / `p_max_uses`). Add optional "expires" + "view limit" controls to the panel for owners who want them.

### 6. Broaden safe allowlists as renderers land
Many types are `is_link_shareable=false` by default (see the admin panel). As you build a renderer for a type, enable it + set its `public_columns` via `admin_set_share_policy` (or the panel). The owner's stance: **nearly everything should be shareable** — the gate is per-type safety, not restriction.

### 7. Notes route must show shared items
- Currently the notes route does not provide a "Shared with me" list but it needs to. Notes that are shared must be first class citizens.
- Additionally, the system does not warn you or make any indication when you modify a note that is readonly for you. No indication that it's readyony and no error when you edit it and no error when you save. it makes you think everything is fine, except all of your work is thrown out and lost!!! That can never happen again!

---

## Open questions for the owner
1. **Agent-app SEO indexing** — index ALL published apps, or gate to verified/featured only?
2. **Priority order** — build order for the above (agent run-as-guest and the read-only chat/flashcard/quiz child views are the highest-leverage for the "guest uses it" story).
