# KNOWN DEFECTS — AI Matrx Admin (frontend)

The ledger of known bugs and gaps on the frontend. Twin of aidream's `KNOWN_DEFECTS.md`.

**Rules**
- File only defects you can't fully fix in the moment, and only UNRELATED findings — a bug related to your current task gets **fixed**, not filed. Enough context to act cold: what, where, the fix.
- **When you fix one: collapse it to a one-line bullet in Resolved (title + date + commit/file pointer) — or delete it outright.** No histories, no verification narratives, no journeys. An entry earns lines only while it is open.
- Keep open entries compressed to load-bearing facts: what's broken, exact paths, the fix, who decides. A partially-fixed entry keeps only the open remainder.
- CLAUDE.md links here. Read both before touching files, media, or persistence.

---

## OPEN

### D31 — Anon-reachable SECURITY DEFINER RPCs trust caller-supplied p_user_id — CRITICAL hits FIXED 2026-07-07; broader audit OPEN
**Severity: was CRITICAL (unauthenticated decrypted-credential theft); confirmed hits closed, wider candidate set needs a SUPERVISED audit.** Class: a `public` SECURITY DEFINER RPC takes a caller-supplied `p_user_id`/`p_org_id`/email, filters ONLY on it with NO `auth.uid()` check, and is EXECUTE-granted to `anon`+PUBLIC. PostgREST exposes `public`, so any unauthenticated browser can call it with another user's id. Found 2026-07-07 by critical-path review.

**FIXED + live-verified (3 migrations, ledgered):**
- `get_mcp_credentials` returned **DECRYPTED MCP OAuth access/refresh tokens** to anon (the worst) → revoked anon+authenticated+public (server-admin-only caller). `migrations/definer_rpc_anon_grant_revoke.sql` also revoked anon+public on `get_conversations_for_user`, `get_dm_conversations_with_details`, `get_user_email_preferences` (also dropped authenticated — admin-only), `get_user_session_data`, `apply_usage_delta`, `cx_canvas_save_user_version`, `create_user_list`, `lookup_user_by_email`.
- `definer_rpc_self_guard_layer2.sql`: in-body `(auth.role()='service_role' OR p_user_id=auth.uid())` self-guards on the 5 still reachable by `authenticated` — verified all 5 cross-calls now 42501, self-calls pass.
- `definer_rpc_ssr_shell_anon_revoke.sql`: revoked anon on `get_ssr_shell_data` (live browser-auth self) + anon/authenticated on the DEAD `get_ssr_agent_shell_data`.

**OPEN residuals (supervise — some are guest-flow-sensitive):**
1. **Authenticated-cross-user on LANGUAGE-sql `get_ssr_shell_data`** (anon closed; an authenticated user can still pass another id → their is_admin/prefs/org memberships). Needs an in-body guard = plpgsql conversion of a per-page-load fn (blast radius = every page; test hard). Same for `apply_usage_delta` (anon closed; left un-guarded — no FE caller, possible trigger context).
2. **~35 more anon-granted `public` SECURITY DEFINER fns take a user/org id with no LITERAL auth check** — MIXED, audit each body. Many are SAFE via helper predicates (`iam.has_org_access`, `is_super_admin`, `mbr_*`/`org_admin_*` families). Check first (likely same hole): `get_dm_user_info`, `get_user_emails_by_ids`, `get_user_lists_summary`, `get_user_own_feedback`, `feedback_get_admin_info`, `check_prompt_app_drift`, `get_user_organizations`. **CAVEAT — do NOT blanket-revoke anon:** several are LEGITIMATELY anon (guest flows) — `check_upload_quota`/`get_usage_status`/`get_user_limits` (`p_is_guest`), `check_rate_limit` (public apps), `accept_organization_invitation`. Fix template: own-data fns get the `(auth.role()='service_role' OR <id>=auth.uid())` guard; org fns get `iam.has_org_access(p_org_id)`; revoke anon only where no guest path exists.

### D2 — Org/scope authorization boundary open (deferred to the pre-launch security overhaul)
**Severity: critical — multi-tenant compromise via raw supabase-js. Deferred by explicit decision (2026-06-10); build anything NEW with proper auth anyway.**
- **Role self-escalation (re-verified live 2026-07-07):** `iam.memberships` UPDATE `WITH CHECK` is `iam.has_org_access(organization_id)` only — any org member can set any membership row's `role`, including their own → `owner`. Fix: role-change guard trigger (or column-guarding policy) + DB-enforced ≥1-owner invariant. Parked because tightening role writes risks breaking invite-accept/role-management flows.
- Lower-tier residuals from the same audit: org create is non-atomic (orphan org row if the owner-member insert fails), last-owner removal is client-only TOCTOU, `transfer_organization_ownership` RPC exists but is never called, invite/resend API routes rely on RLS alone. Full prioritized audit: `~/.claude/plans/you-are-conducting-an-polymorphic-dragonfly.md`.
- Fence to build (the overhaul): protected-resources doctrine on org membership + ctx mutations — deny direct writes at RLS, one DEFINER RPC family with org-admin preambles + `REVOKE FROM anon` (model: `accept_organization_invitation`, `migrations/ctx_set_entity_scopes_auth.sql`).
- Already closed: org-takeover INSERT + membership disclosure (canonical RLS on `iam.memberships`), unauthenticated scope DEFINER RPCs (`migrations/scope_rpcs_org_membership_guard.sql`, `97fa489f9`).

### D30 — Guest promotion trusts a client-supplied fingerprint = anon-account takeover (deferred: security overhaul)
**Severity: medium — a known/observed FingerprintJS `visitorId` lets an attacker claim another visitor's anonymous account (its guest files/conversations/memory). Found 2026-07-07 by critical-path review.** `lib/services/guest-promotion.ts` (`promoteGuestToUser`, driven from `signUpAction`) authorizes SOLELY on the `fingerprint` in sign-up `formData`: it resolves `guest_executions.auth_user_id` by that fingerprint and sets email+password on the still-anonymous uid — with NO proof the caller holds that fingerprint's anon session. `looksLikeFingerprint` only rejects the guessable `temp_*` fallback; a real visitorId is accepted. **Fix belongs in the D2 overhaul (cross-repo):** bind the fingerprint to the current server-minted anon session/cookie (browser proves possession) before promoting — the browser never holds the anon session (Python mints it), so it needs aidream coordination. **Do NOT patch in isolation:** email/password promotion is the ONE working conversion path (OAuth is already lossy per the OAuth entry), and a wrong guard breaks it.

### D1 — Agent chat audio is still an expiring signed S3 URL (backend-gated)
**Severity: medium — plays today, breaks days later when the signature expires.** The media agent persists generated audio with the default `visibility="private"` (aidream `base_media._persist_asset`), so `/files/{id}/url` mints an expiring signed URL. `components/mardown-display/blocks/audio/AudioOutputBlockRenderer.tsx` renders via the file handler (`useFileSrc` from `file_id`, owner self-heal), but the URL should never surface. **Fix (aidream):** persist agent audio durable at the generation boundary the way podcasts do (`_persist_episode` → `make_urls_durable`) — do NOT flip the global private default (privacy regression). Optional follow-up: a pg_cron + pg_net healer draining `mtx_media_heal_queue` via a service-token aidream endpoint. Everything else from the 2026-06 media-durability campaign is done — fences live in CLAUDE.md "Media durability", `lib/media/signed-url.ts`, `lib/media/durability.ts`, the `mtx_public_media_url_guard` DB trigger, `<InlineMediaRef>` + `useRemintableSrc`, and the ESLint raw-`<img>`/`<video>` bans.

### D3 — Agent Find Usages + Drift: never browser/prod-driven + DM sender identity
**Severity: low — data/RPC layer verified; backend deployed.** Open: (1) browser-drive the §5 checklist in [`docs/handoffs/agent-find-usages.md`](docs/handoffs/agent-find-usages.md) — DM *send* has never actually inserted a row; confirm the weekly cron fires. (2) Drift DMs send from a real super-admin user (env `MATRX_SYSTEM_DM_SENDER_USER_ID`) until a dedicated "Matrx System" bot auth-user exists — cosmetic.

### D7 — Scribe mobile: mic re-prompts (needs a device run) + cross-device recovery gap
**Severity: high — the "never lose audio" promise on mobile.** Capture is already IndexedDB-first and interruptions are loud (`features/audio/micStream.ts` `onended`/`onmute` + `subscribeMicInterruption`; `safety_id` persisted on `studio_recording_segments` + reconcile re-upload). Open: (1) real-phone verification that the 2026-06-14 hardening actually reduces iOS re-prompts (re-acquire after a hard track-end inherently re-prompts; only a device run confirms felt behavior); (2) cross-device recovery — upload chunks eagerly to `cld_files` so a recording captured on a phone that never finished uploading is recoverable off that device.

### D9 — Scribe: agent working-document edits apply all-at-once, not streamed
**Severity: low — UX only; aidream-gated (verified not implemented 2026-06-29).** `context_changed` carries no content, so the client re-reads the doc after the turn. Fix: aidream emits working-document deltas as a dedicated event type; FE applies them incrementally in `instance-working-document.thunks.ts`.

### D10 — Picklist `matrx` fence: BOUND scope-cell path not flipped (aidream-gated)
**Severity: low — FE is fully unified on the canonical FLAT reference; direct/override variables work end-to-end.** Open (all aidream):
1. Resolve a fence-valued BOUND scope cell — `scope_binding_resolution.py` reads only `entry.get("value")` / `_is_picklist_ref`; it must read `value_text` and guarantee `replace_variables` → `stage_reference_fences` ordering on the bound chain.
2. **`value_type` drift caveat for the reader:** legacy bound picklist items still carry `value_type='object'/'array'` while a re-saved fence lands in `value_text` — read the populated `value_*` column, never trust `value_type`. Decide back-compat decoder vs one-time backfill for existing `picklist_ref` rows (legacy rows already scream via FE `legacyTranslate.ts`).
3. After 1+2 hold end-to-end: retire the legacy `picklist_ref` path, then remove FE `@deprecated` `PicklistRefEnvelope`/`isPicklistRef` (`features/agents/types/agent-definition.types.ts`) and the `legacyTranslate.ts` seam.

### D12 — `selectContextPayload` drops entry-level `label`/`type` (deferred 2026-06-29)
**Severity: low — cosmetic; the model gets the content, only the manifest label is humanized.** The fix (wrap primitive values into rich form `{content, type, label}` in `features/agents/redux/execution-system/instance-context/instance-context.selectors.ts`) is deferred: it touches every agent's payload, and the safe wrap omits `max_inline_chars`, so wrapping LONG strings (transcripts) could silently flip inline-vs-deferred — needs backend confirmation first. Builders needing wire metadata use the rich-form dict workaround (`buildWorkingDocumentContextValue`, `sessionResourceContext`).

### D13 — TTS speaker routing via global `AudioContext` monkeypatch (accepted as-is 2026-06-29)
**Severity: low — Chromium-only, next-utterance granularity; the patch is guarded and screams on failure** ([`features/audio/audioOutputSink.ts`](features/audio/audioOutputSink.ts)). Parked unless TTS sink routing is reprioritized. Open slivers: owner's patch-vs-fork call (a ~140-line sink-aware `WebPlayer` fork removes the patch + gains mid-utterance re-routing); `MicDeviceMenu` caret missing on the dedicated scribe record button; fold `videoConference.defaultMicrophone/defaultSpeaker` into `userPreferences.audioDevices`; real-browser sanity pass with a non-default speaker.

### D14 — War Room: live recording doesn't survive a tab switch; agent reads only the active session's transcript
**Severity: medium — no data loss (mic singleton + chunk persistence survive), but the recording session tears down when the tile switches tabs, and non-active recordings are invisible to the thread agent.** Fences to build: a room-level media slice/controller owning the active recording across tab switches; `assistantContextBuilder` (or a war-room hydration thunk) binding EVERY `studio_session` assignment of a tile and emitting per-session transcript keys. Touch points: `features/transcription-cleanup/components/CleanupPad.tsx`, `features/audio/hooks/useChunkedRecordAndTranscribe.ts`, `features/transcript-studio/service/assistantContextBuilder.ts`, `features/war-room/components/tile/TileAgentPanel.tsx`, `features/war-room/service/warRoomAgentContext.ts`, `features/war-room/redux/thunks.ts`.

### D15 — War Room file access is client-delegated; generic platform primitives unbuilt
**Severity: low — works today via war-room-specific wiring.** Open (aidream): a generic server-side `file_read` tool (`file_id` → `processed_document_pages.{raw_text,cleaned_text}` under `acting_as_user`/RLS) so every agent reads file extractions disconnect-safe; a `source_ids`/`file_ids` filter on `RagSearchArgs` + `matrx_rag.search.search`. Then `war_room_read_file` becomes a thin alias or dies. Also: `rag_search` was added to the three War Room `agx_agent` rows by DB edit — re-add if personas are ever regenerated from code; arming `war_room_read_file` on room/master agents needs the per-file manifest plumbed into `MasterThreadEntry`.

### D19 — Event spine: webhook depth remainder
**Severity: medium.** Run-lifecycle producers (12 tables) + `useRunListRealtime` polling-kill are done — see [`features/files/webhooks/FEATURE.md`](features/files/webhooks/FEATURE.md). Open: org-wide fan-out (needs iam membership for arbitrary (user,org)); Python file-audit events (`audit_bridge.py`) write `actor_id = null` so they never match owner webhooks; manual redeliver button + RPC; `latency_ms` capture; per-feature admin-map entry; browser-verify `/files/webhooks`.

### D20 — Guest→user promotion: OAuth signup still orphans guest work
**Severity: medium — Google/GitHub/Apple signup loses every file/conversation the guest created; email/password is fully handled** (`lib/services/guest-promotion.ts` promotes the anon UUID in place). OAuth does `signInWithOAuth` → new UUID; the browser never holds the anon session (Python mints it from the fingerprint), so `linkIdentity` isn't directly available. Fix: (a) link the OAuth identity to the fingerprint's anon UUID server-side after callback, or (b) a one-time anon→new-UUID data transfer for OAuth only. OAuth forms don't carry `GuestFingerprintField`.

### D25 — Prompts-system deletion residuals
**Severity: low — intentional, temporary (prompts system replaced by agents, 2026-06-28).** Open:
- **Applet execution OFF:** `APPLET_EXECUTION_UNDER_CONSTRUCTION = true` in `features/applet/runner/AppletRunComponent.tsx` (subsystem kept fully wired + rendered; banner + toast on submit). To resurrect: flip the flag AND finish the recipe→agent rewire in `useAppletRecipeFastAPI` (`submitAppletAgentThunk` is currently undefined). Owner: applet rebuild.
- **`ModelSettingsDialog` stubbed** in `features/ai-models/components/DeprecatedModelsAudit.tsx` + `ModelUsageAudit.tsx` — "review settings" is a plain confirm. Fix: extract a shared callback `ModelSettings` component or wire an agentId.
Everything else closed — see Resolved (content-block menus, dead preloads, dead chains, dead ai_runs half).

### D29 — Working-document sync: accepted post-re-read design, two deferred gaps
**Severity: low — data-safe by design; accepted until aidream ships deltas (D9).** (1) Mid-typing invisibility: `useWorkingDocument`'s `editingRef` guard means an agent edit surfaces as a commit-time conflict, not a live merge — proper fix is a 3-way merge. (2) A non-primary attached doc only syncs via realtime while a mount subscribes its scope; agent edits reach it on next open (currently unreachable — agents only patch the current conversation's doc). `PatchDiffInline` applies patches for DISPLAY only — making it a slice writer would race the re-read and the version-guarded commit. Related design note: the `instanceWorkingDocument` slice holds ONE primary doc per `(conversation, kind)`; additional attached docs surface via `DocumentsWorkspace`, not the slice — multi-attach in the primary slot needs a `byKey[...]`→array redesign. Not a bug; don't assume it works.

### D31 — PDF reversible-redaction keys: client-only custody until KMS escrow lands *(formerly the second "D3")*
**Severity: medium — clearing browser data / switching devices makes redacted spans cryptographically unrecoverable.** Keys live only in IndexedDB (`features/file-analysis/redact/session-keys.ts`); `redaction_mapping` holds ciphertext+nonce. `pdf_redaction_key_escrow` exists but its write path is deliberately unwired: keys must be KMS-wrapped (security team's interface) — storing raw keys server-side would weaken the custody model. Mitigation: MaskDialog KeyHandoff acknowledgment + destructive-mode ConfirmDialog. Close by wiring wrap/unwrap once the KMS interface exists.

### D32 — PDF 500-page scale items *(formerly the second "D4")*
**Severity: medium — degraded UX on large docs, no data risk.** From the 2026-06-11 consolidation (plan `~/.claude/plans/feature-deep-dive-audit-rustling-hare.md`): PdfStudioReader mounts all page blocks (no virtualization); render-all/split build ZIPs in memory server-side (bounded but unstreamed); AI clean/extract on >200pp runs as a held request instead of the resumable per-page job model. Also open: reading-order viewer tab; verify the aidream variant pipeline renders PDF page-1 grid thumbnails.

### D33 — html-preview save-back + content-actions `onSave` latent gaps *(the open tail of R1)*
**Severity: low, latent.** `rich-document/export.ts` html-preview save-back works for chat messages only — the `htmlPreview` overlay isn't callback-aware (only `fullScreenEditor` is), so note/non-chat sources can't save back. And `ContentActionBar`/`contentActionRegistry`'s editable `onSave` path is wired to raw-Redux-data — no live consumer passes `onSave` today (read-only-safe), but it will silently fail the day one does.

---

## RESOLVED

One line per fix — title, date, pointer. History lives in git.

- **D34** — `pnpm dev` fatal (`opengraph-image.tsx` under `learn/[...slug]` — metadata-image conventions can't live in a catch-all): moved to `app/(core)/education/learn/og/[...slug]/route.tsx` + `generateMetadata` reference (2026-07-07, `9461f3b52`).
- **D28** — `study_record_attempt` rejected NULL `result` (`item_mastery.struggle_flag` NOT NULL): live RPC has the ungraded early-branch + `coalesce(...,false)`, verified live 2026-07-07; client `source_kind='set'` halves landed earlier (`b9bab8309`).
- **D27** — phantom association tokens (2026-07-07): `normalizeEntityToken()` chokepoint in `features/scopes/service/associationGuards.ts` (`cx_message→message`, `cx_conversation→conversation`, `user_file→file`, `agent_app→app`, `chat_block→message`; loud on hit), applied before `checkToken` in every `associationsService` method; `get_task_associations` reads canonical tokens (`migrations/get_task_associations_canonical_*.sql`); zero phantom rows in data; `blocks` bucket intentionally `[]` — do not resurrect `chat_block`.
- **D26** — working-document legacy litter (2026-07-02): `conversation_id`/`user_id` dropped from `workbench.working_documents`, `chat.conversation_documents` graveyarded (`migrations/working_document_canonicalize_step3_drop_legacy.sql`); FE row-type trimmed 2026-07-07.
- **D25-menus** — content-block insertion restored on all 4 surfaces via v3 `EditableContextMenu`; dead `DeferredShellData` preloads + `getSSRAgentShellData` deleted (2026-07-07).
- **D22** — auth open-redirect + spoofable `x-forwarded-host` (2026-07-07): `safeRelativePath` + `safeForwardedHost` in `utils/auth/safe-redirect.ts` at every sink; PII logs dev-gated.
- **D30** — shareable-resource TS mirror regenerated from `platform.shareable_resource_registry` (2026-07-07): token-vs-physical-table split + `resolveResourceToken()`; org-shared-count bug fixed; 4 legacy grant rows backfilled (`migrations/permissions_legacy_resource_type_backfill.sql`). 12 no-`visibility`-column tables fail `make_resource_public` gracefully — not real share surfaces.
- **R3** — soft-delete/restore broken app-wide by `deleted_at` in authenticated RLS (2026-07-04): `iam.apply_rls` v2 gates `deleted_at` ONLY on anon `pub_read` (`migrations/iam_apply_rls_v2_soft_delete_select_fix.sql`, self-verifying). **Standing rule:** authenticated RLS = authorization only; readers filter `deleted_at` themselves — [`docs/db_changes/CANONICAL_DATABASE_SYSTEM.md`](docs/db_changes/CANONICAL_DATABASE_SYSTEM.md) §4/§6. Caveat: a reader that forgets the filter sees soft-deleted rows it has access to (never cross-tenant).
- **D16** — composer draft false-alarm scream + non-unified send (2026-07-02, `a3dfe59d2`): `clearComposerIfUnsubmitted` at all four clear sites + `conversationLifecycle` anti-orphan guard in `smartExecute`. Live-browser pass never run.
- **D11** — per-turn context chips (2026-06-29): read `chat.message.model_context` (FE freezes `metadata.context_snapshot` at submit as fallback). **Standing rule:** historical record components read frozen per-record snapshots, never live slices. Future scope: [`features/agents/docs/CONTEXT_RECORD_SPEC.md`](features/agents/docs/CONTEXT_RECORD_SPEC.md).
- **D8** — item-presentation detailSources (2026-06-29, `6769af0c6`): `message` → `chat.message` + 4 stale schemas repointed; `session` left seed-only BY DECISION (ambiguous canonical source — code comment on the entry).
- **D24** — no-op `contentHistory` overlay deleted end-to-end (2026-06-29, `594498a5e`); the live twin is `EditHistoryDialog`.
- **D23** — task-attachments data loss: orphaned `TaskDetails` variant replaced with canonical `<TaskAttachmentsPanel>` (2026-06-29, `c4a639ca9`).
- **D21** — dead AI-Runs feature (graveyarded `ai_runs`) deleted (2026-06-29, `b4092df3b`); live `ai_tasks` half kept — belongs to the D25 applet rebuild.
- **D6b** — duplicate tool-viz `dynamic/` code-runner deleted, leaves relocated (2026-06-29, `d05096766`).
- **D18** — `files.share_links`/`file_versions` owner SELECT RLS gap + `SingleFileShell` error swallow (2026-06-27).
- **D17** — `userPreferencesSlice` module lists: `sandbox`/`transcription`/`agentConnections` added to partialize/rehydrate/reset (2026-06-27).
- **D6a** — window geometry restore keyed by slug, not overlayId, in `WindowPersistenceManager.tsx` (2026-06-27).
- **D5a** — permissive `shortcut_categories` SELECT policy dropped (2026-06-27, `migrations/shortcut_categories_drop_permissive_select.sql`).
- **R2** — the 11 severed overlay callbacks were all dead: props/openers/`resourcePickerWindow` branch deleted (2026-06-14).
- **R1** — chat Edit/resubmit severed `onSave` + two missing RPCs (2026-06-14, `migrations/cx_message_soft_delete_and_truncate.sql`): `fullScreenEditor` callback-aware with loud fallback; fork-position bug fixed. Open tail → D33. Bug class documented in [`features/overlays/FEATURE.md`](features/overlays/FEATURE.md).
- **D5b (mermaid reach)** — removed from this ledger: not a defect. Extension/desktop/mobile renderers + `skl_resources` injection + per-block menu filtering are roadmap, tracked by the `is_active=false` rows in `skl_render_components` and the feature docs.
