# KNOWN DEFECTS — AI Matrx Admin (frontend)

The running ledger of known bugs, gaps, and "must never happen again" classes of
failure on the frontend. Mirrors the backend's `KNOWN_DEFECTS.md` in aidream.

**Rules of this file**
- When you discover a defect you can't fully fix in the moment, add it here with
  enough context to act on it cold. A defect that lives only in a chat log is a
  defect that will recur.
- When you fix a defect, move it to **Resolved** with the commit/approach — don't
  delete it (the history is the institutional memory).
- Each entry: **what**, **why it happened**, **the fence(s) that prevent the
  class**, and **what's still open**.
- CLAUDE.md links here. Read both before touching files, media, or persistence.

---

## OPEN

### D3 — Agent Find Usages + Drift: prod re-verify + DM sender identity
**Severity: low — built and locally verified; two follow-ups.**

**What.** The Find Usages + Drift subsystem (see [`features/agents/FEATURE.md`](features/agents/FEATURE.md) → Find Usages & Drift) is live-verified against the shared DB locally (registry sync: 42 rows, 0 broken pins; weekly scan: 30 alert groups, dedup clean), but two items remain open:
1. **Prod deploy + aimatrx.com end-to-end re-verify.** The aidream side (startup registry sync, weekly `agent_drift_weekly_scan` cron, `/agent-usage/*` router, DM send) and the UI surfaces (both windows, `/reports/agent-drift`, the agents-page banner, DM action chips) were exercised locally / via stubs; the weekly cron's first real fire and an actual DM landing in a recipient's inbox need a production run.
2. **DM sender identity.** Drift DMs send from the platform operator's *personal* super-admin user (`4cf62e4e-…`, env-overridable via `MATRX_SYSTEM_DM_SENDER_USER_ID`). A dedicated "Matrx System" bot auth-user is the clean later swap — purely cosmetic (messages show a real human's name as sender until then).

**Fence.** The weekly scan fingerprint-dedups so a re-verify run can't double-notify; the registry sync writes only on real deployments (`strict_startup_gates`) so a laptop can't mark prod keys vanished. Broken code pins scream (`record_error` + red log) without crashing boot.

### D1 — Media durability: public/owned media must never be a signed, expiring URL
**Severity: high — silently breaks public pages days later.**

**What.** Generated podcast media (covers, audio, per-clip videos) was persisted
into `pc_episodes.image_url` / `audio_url` / `video_url` as **expiring signed S3
URLs** (`matrx-user-files.s3.amazonaws.com/…?X-Amz-Signature=…&Expires=…`). The
public episode page (`/podcast/[slug]`, viewed by anonymous users) renders these
directly, so once the signature expires the images/audio break — silently, days
after creation. Older episodes stored durable public-bucket / `cdn.matrxserver.com`
URLs and work fine; the new pipeline regressed.

**Why it happened (multiple mistakes, both sides).**
1. **Backend (root):** the media agents persist with the default
   `visibility="private"` (`packages/matrx-ai/.../providers/base_media.py:_persist_asset`),
   which yields a signed S3 URL. The orchestrator captures that URL string and
   `_persist_episode` (router `aidream/api/routers/podcast_generator.py`) writes it
   verbatim into `pc_episodes`. The *official video* already does it right
   (`visibility="public"` → permanent CDN) — proof the fix is a one-knob change.
2. **Frontend:** the public episode/show pages render media with **raw `<img>` /
   `<video>`** (`features/podcasts/components/player/PodcastEpisodePage.tsx`,
   `PodcastShowPage.tsx`, `PodcastGrid.tsx`) instead of the canonical
   `<InlineMediaRef>`, with hide-on-error and no fallback — so a broken URL just
   vanishes. This violated CLAUDE.md's "every file flow funnels through
   `@/features/files`" rule, and there was no lint rule enforcing it.

**The fences (defense in depth).**
| Layer | Status | Mechanism |
|---|---|---|
| 1. Server persists media PUBLIC at generation | **DONE (backend, pending deploy)** | `aidream/api/routers/podcast_generator.py` `_persist_episode` now runs every media URL through `aidream/services/media_durability.py#make_urls_durable(owner_user_id=...)` **before** writing `pc_episodes` — flipping each private file to public (`SyncEngine.change_visibility_async`) and minting its CDN URL. Deliberately scoped to the podcast persist boundary so the **global** media default (`base_media._persist_asset`) stays `private` — flipping that would make every AI image/audio/video on the platform public (a privacy regression). The official composed video is already public → passes through unchanged. |
| 2. DB-edge guard | **DONE + ROLLED OUT** | `migrations/mtx_public_media_url_guard.sql` — registry (`mtx_public_url_guard`) + generic trigger that, on any write of a non-durable URL to a registered column, RAISES a loud WARNING and queues a heal job (`mtx_media_heal_queue`). Reusable for any table/column. Non-blocking. `migrations/mtx_public_media_url_guard_rollout.sql` (2026-06-08) made the trigger **array-aware** (`text[]` columns checked element-by-element) and registered every other public-read media column: `pc_shows.{image_url,og_image_url,thumbnail_url}`, `aga_apps.{preview_image_url,favicon_url}`, `shared_canvas_items.thumbnail_url`, `site_metadata.{logo_url,default_share_image_url}`, `custom_app_configs.image_url`, `custom_applet_configs.image_url`, `wf_template.preview_image_url`, `pc_studio_runs.{audio_url,selected_cover_url,image_urls[],video_urls[]}`. Existing non-durable rows backfilled (incl. 2 studio-run array rows). 9 tables guarded total. |
| 3. Frontend classifier + loud logger | **DONE** | `lib/media/durability.ts` — `classifyMediaUrl` / `isDurableMediaUrl` (twin of the DB classifier) + `reportMediaDurabilityViolation()` which screams in the console when an expiring URL reaches a render/store path (so the defect can't be ignored). |
| 4. Canonical render component re-mints | **DONE (podcasts)** | `<InlineMediaRef>` now extended with ambient/preview video flags (`autoPlay`/`loop`/`muted`/`playsInline`/`controls`/`preload`), so it covers background video — no more raw `<video>`. Every podcast display surface migrated: show hero, episode hero (metadata + ambient video), grid backdrop, studio `AssetCard` (image + video). **Authed** studio uses `podcastMediaRef()` (file_id → re-mint, durable for owners); **public/anonymous** pages pass the durable URL string directly (anonymous CANNOT re-mint a file_id, so they rely on layer 1/2/heal for durability) and get the informative error fallback instead of a silently-vanishing cover. Justified exception: `PodcastAudioPlayer`'s headless `<audio>` (custom transport) stays raw + documented. |
| 5. Heal the backlog | **TOOL BUILT — run pending authorization** | The existing leaked rows are healed server-side (works cross-user, unlike a per-owner frontend drain — the 5 broken episodes span 2 users). `aidream/scripts/flip_files_public.py` (a thin CLI over `media_durability.flip_file_to_public`) flips a batch of file_ids to public + reports CDN URLs; the `pc_episodes` rewrite + `mtx_media_heal_queue` mark-healed is then applied via SQL. Dry-run verified (16 files for the 5 episodes all resolve, all `private`, 0 errors). Running the real flip mutates 2 real users' production media, so it needs an explicit go-ahead. The same primitive is what generation-time layer 1 uses, so the classifier never drifts. |

**What's still open.**
- **Agent chat audio (`audio_output` / `media_block(kind=audio)`) is served as a raw
  signed S3 URL.** Same root as podcasts: the media agent persists the generated
  `.wav` with the default `visibility="private"`, so the backend `/files/{id}/url`
  endpoint mints `matrx-user-files.s3.amazonaws.com/…?AWSAccessKeyId=…&Signature=…&Expires=…`.
  The new `components/mardown-display/blocks/audio/AudioOutputBlockRenderer.tsx`
  renders correctly via the file handler (`useFileSrc` from `file_id`) and the URL
  plays/downloads/copies, but it is still expiring + S3 — so it WILL break when the
  signature expires and the link should never be surfaced to users. **Fix is backend:**
  persist agent audio public (or proxy via an our-domain durable URL) the same way
  podcast layer 1 flips visibility. Frontend logs the resolved shape via
  `console.log("[audio-block] resolved", …)` (no longer a `console.error` overlay,
  since this is a tracked backend gap). When the backend serves durable URLs this
  note can close.
- **Run the heal on the 5-episode backlog** — `aidream/scripts/flip_files_public.py`
  is built + dry-run-verified; the real flip (16 files, 2 users) needs an explicit
  go-ahead because it mutates production media. After the flip, rewrite each
  `pc_episodes` media column to the CDN URL and mark the matching
  `mtx_media_heal_queue` rows `healed`.
- **Deploy the backend** so layer 1 (generation-time durability) goes live. Until
  then, newly generated episodes keep getting queued by the guard (but the guard +
  heal tool catch them).
- **A pg_cron + pg_net automated healer** (the fully-hands-off version): a cron job
  drains `mtx_media_heal_queue` by calling a small aidream "flip file + rewrite
  column" endpoint (wrap `flip_files_public.py`'s logic in a service-token route).
  This makes the heal continuous instead of a manual run.
- **`pc_studio_runs` array columns** (`image_urls[]`, `video_urls[]`) — 1 run is
  queued. These are internal generation records (not the public-facing break), so
  lower priority; the same primitive heals them, just element-by-element.
- **Public pages still use raw `<img>`** — DONE for podcasts. Remaining sweep:
  agent-app `appImageUrl` renders (`features/applet/home/**`, `Banner.tsx`) and the
  `/p/[slug]` public app surfaces — their source columns are already guarded
  (`aga_apps.preview_image_url`), so this is render-polish, not a durability gap.
  (Not covered by the podcast ESLint fence — a future fence could extend to these.)

**Fences that fully landed (2026-06-08).**
- **Lint enforcement** — DONE. `eslint.config.mjs` bans raw `<img>`/`<video>` in
  `features/podcasts/**` (`no-restricted-syntax`), pointing at `<InlineMediaRef>`.
  Verified: fires on a raw `<img>`, clean on the migrated pages. The headless
  `<audio>` transport in `PodcastAudioPlayer` is the one documented exception.
- **Server root fix** — wired (layer 1 above), pending deploy.
- **Heal tooling** — `aidream/services/media_durability.py` (shared classifier +
  `flip_file_to_public` / `make_url(s)_durable`) consumed by BOTH the generation
  path and the heal CLI, so the durable-vs-expiring classifier can never drift
  across the generation fix, the heal tool, the frontend (`lib/media/durability.ts`),
  and the DB guard (`mtx_is_durable_media_url`).

---

### D2 — Org/scope authorization boundary is open (deferred to the pre-launch security overhaul)
**Severity: critical — full multi-tenant compromise via raw supabase-js. Deferred by explicit decision (2026-06-10): app is not live; features first, dedicated security overhaul next week. Build anything NEW with proper auth anyway.**

**What.** The browser talks to Supabase directly with the user's JWT, so RLS + RPC bodies are the only write-authorization boundary — and they are open in five independent ways (all live-verified against `txzxabzwovsujtloxrus`):
1. **Org takeover.** `organization_members` INSERT policy is `WITH CHECK (true)` — any authenticated user can insert themselves as `owner` of ANY org, then passes every `EXISTS(member where role in owner/admin)` check repo-wide. No guarding trigger.
2. **Role self-escalation.** `organization_members` UPDATE has `with_check = null` with `qual: user_id = auth.uid() OR admin` — a plain member can set their own row to `owner`.
3. **Unauthenticated DEFINER RPCs.** `create_scope`, `update_scope`, `delete_scope`, `create_scope_type` perform **zero** caller checks and EXECUTE is granted to PUBLIC/anon — cross-org write/delete needing only a target UUID. `delete_scope_type` CASCADEs items → every cell + every scope of the type (irrecoverable data loss, blast radius reported only *after* deletion). (`set_entity_scopes` was fixed 2026-06-10 — `migrations/ctx_set_entity_scopes_auth.sql` is the membership-check + `REVOKE FROM anon` pattern to replicate.)
4. **Membership-graph disclosure.** `organization_members` SELECT is `qual = true` for `public` — full user↔org↔role enumeration across all orgs.
5. **Spoofable identity in `set_context_value`.** `acting_user_id` payload fallback applies when `auth.uid()` is NULL (anon path). `set_scope_context_value` (the live cell-write RPC) has NO in-function check at all.

**Why it happened.** Policies were widened to make direct client inserts work (e.g. invitation accept used to insert `organization_members` directly), and the DEFINER RPC family shipped without auth preambles.

**The fence (to build in the overhaul).** Apply the `protected-resources` doctrine to org membership + ctx mutations: deny direct writes at RLS, one DEFINER RPC family with `is_org_member`/`is_org_admin` preambles + `REVOKE FROM anon` (model: `accept_organization_invitation`, `set_context_value`'s membership check, and `ctx_set_entity_scopes_auth.sql`), DB-enforced ≥1-owner invariant, and a role-change guard trigger.

**What's still open.** All of items 1–5 except the `set_entity_scopes` fix. Also from the same audit, lower-tier: org create is non-atomic (orphan org row if the owner-member insert fails — burned slug, invisible org), last-owner removal is a client-only TOCTOU (org can reach zero owners), `transfer_organization_ownership` RPC exists but is never called, and the invite/resend API routes rely solely on RLS instead of checking `auth_is_org_admin` in code. Full prioritized audit: `~/.claude/plans/you-are-conducting-an-polymorphic-dragonfly.md`.

---

### D3 — PDF reversible-redaction keys: client-only custody until KMS escrow lands
**Severity: medium — browser data loss = permanently unrecoverable redacted text.**

**What.** Reversible-redaction session keys live ONLY in the redacting browser's
IndexedDB (`features/file-analysis/redact/session-keys.ts`); `redaction_mapping`
holds ciphertext+nonce. Clearing browser data / switching devices makes those
spans cryptographically unrecoverable. The org-recovery model exists
(`pdf_redaction_key_escrow`, applied 2026-06-11) but its WRITE PATH is
intentionally unwired: keys must be KMS-wrapped (security team's interface),
and storing raw keys server-side would silently weaken the custody model.
Mitigation today: MaskDialog's KeyHandoff acknowledgment + destructive-mode
ConfirmDialog. **Close by:** wiring wrap/unwrap once the KMS interface exists.

### D5 — Foreign user-scoped shortcut-category LABELS visible to everyone (empty groups)
**Severity: low — name disclosure + menu noise, no item leak. Fold into the D2 security overhaul.**

**What.** `shortcut_categories` carries a legacy permissive policy
`shortcut_categories_select_any USING (true)`, so every user can read every
category row — including other users' personal category labels (e.g. "School",
"Learn Coding"). After the `agx_context_menu_view` security_invoker fix
(2026-06-12, `migrations/agx_context_menu_view_security_invoker.sql`) the
*items* inside foreign categories are correctly filtered by RLS, so these
categories render as empty groups in the unified context menu.

**Why it happened.** The permissive policy predates the scoped
`shortcut_categories_read` policy and was never retired; policies OR together.

**The fence.** Drop `shortcut_categories_select_any` during the security
overhaul (the scoped read policy already covers global + own + member-org).
Check first whether any admin UI legitimately depends on listing all
categories — if so, that path moves to a super-admin RPC.

**What's still open.** The policy drop itself.

### D4 — PDF W5 scale items pending (500-page client-normal band)
**Severity: medium — degraded UX on large docs, no data risk.**

**What.** Remaining from the 2026-06-11 PDF consolidation (plan
`~/.claude/plans/feature-deep-dive-audit-rustling-hare.md`):
PdfStudioReader mounts all page blocks (no virtualization); render-all/split
build ZIPs in memory server-side (bounded but unstreamed); AI clean/extract
on >200pp runs as a held request instead of the resumable per-page job model
(Operational Default: resume from last clean page preserving overlap).
Also open: reading-order viewer tab; verify aidream variant pipeline renders
PDF page-1 grid thumbnails.

### D5 — Mermaid render block is web-only (other surfaces + chat-scoped agents pending)
**Severity: low — feature works fully on web; gaps are reach, not correctness.**

**What's deferred (by design, this build).**
1. **Extension / desktop / mobile renderers.** The server-side block pipeline
   already emits typed `mermaid` blocks (aidream `block_detector.py`
   `SPECIAL_CODE_LANGUAGES` + `mermaid_parser.py`), but those clients don't
   consume server-processed blocks yet, so they have no mermaid renderer. Tracked
   by the `is_active=false` rows in `skl_render_components` (chrome-extension /
   desktop / mobile). When a client switches to server-side processing, flip its
   row active and add the renderer — the contract is already there.
2. **`skl_resources` are not agent-reachable.** `skill_get` returns the skill
   body only (aidream `tools/implementations/skill.py`), so the per-diagram-type
   syntax reference lives inside the `mermaid-diagrams` skill body, not as
   resource rows. Revisit if/when resources get an injection path.
3. **Chat right-click surfaces assistant-message agents, not mermaid-scoped
   ones.** `MarkdownContextMenuProvider` is one instance per conversation with a
   single `surfaceName` (`matrx-user/assistant-message`); per-block surface
   switching doesn't exist. So right-clicking a mermaid block passes the diagram
   DSL as context (`data-block-source` → `diagram_source`) to whatever agent the
   user picks, but mermaid-*scoped* agents live in the workbench AI rail (reached
   via the block's Edit button), not the chat right-click menu. The captured
   round-trip ("edit and send back into the artifact") is the workbench by
   design — the chat menu is discovery + data hand-off. Per-block-type menu
   filtering is the documented v2 (dynamic-contexts extension of
   `useUnifiedAgentContextMenu`).

**Also noted (pre-existing, surfaced by this build):** `PREFERENCE_MODULE_KEYS`
in `userPreferencesSlice.ts` omits `sandbox` / `transcription` /
`agentConnections` — those modules never persist via partialize. The new
`mermaid` module WAS added (it persists); the older three are an unrelated gap
left untouched.

**The fence.** Each item is a clean one-step unlock (flip a row + add a renderer;
add a resource injection path; build dynamic-context menu filtering) — none block
the web feature.

## RESOLVED

_(none yet — move D-entries here as their fences fully land.)_
