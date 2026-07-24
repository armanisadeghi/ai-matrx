# Webhooks + Event Spine — Feature Architecture

**Status:** ✅ Outbound delivery live + verified end-to-end on the live DB, including org-wide fan-out, manual redeliver, latency capture, and the Python file-audit producers (D19 closed 2026-07-08). Transport 1 (Realtime) partially pending (see Roadmap).
**Last updated:** 2026-07-08.

The system that turns long-running server work and resource events into **push**, not polling. One canonical event ledger, fanned out to multiple transports.

## The model: one spine, N transports

```
  producers (run tables, file mutations, share/permission RPCs)
        │  write an event
        ▼
  platform.activity_log   ← THE SPINE (canonical event ledger)
        │   (id bigint, organization_id, entity_type, entity_id,
        │    action, actor_id, occurred_at, metadata)
        ├──► TRANSPORT 1 — Supabase Realtime (in-app push, kills polling)   [PENDING]
        └──► TRANSPORT 2 — Outbound webhooks (external systems)             [LIVE]
```

**Why a spine:** a producer writes its event **once**; every transport lights up. Long jobs (podcast/research/PDF/RAG, "hours of processing") stop being babysat by `setInterval`.

## Transport 2 — outbound webhooks (LIVE)

External systems (the Chrome extension, partner backends, user automations) register an HTTPS endpoint and get a signed POST when their events fire. **No app-server / no Python:** delivery runs entirely in Postgres.

- **Pipeline:** [migrations/files_webhook_dispatcher.sql](../../../migrations/files_webhook_dispatcher.sql). A `pg_cron` job (`files_webhook_tick`, every 30s) runs `files.webhook_dispatch()` then `files.webhook_reconcile()`:
  - **dispatch** — scan `platform.activity_log` past a watermark (`files.webhook_dispatch_state`), match active `files.webhooks`, sign the body (`files.webhook_sign` = HMAC-SHA256 via `pgcrypto`), POST via `pg_net`, record a `files.webhook_deliveries` row (one per `(webhook, event)` — unique-indexed, so dispatch is idempotent).
  - **reconcile** — join `net._http_response`, settle `delivered`/`failed`, set `http_status`, backoff `next_attempt_at`, bump `consecutive_failures`, **auto-disable** at `max_consecutive_failures`.
- **Matching:** a webhook receives an event when (v1) `activity_log.actor_id = webhooks.owner_id` ("my own events / my finished jobs"), **or** (v2, org-wide fan-out) the webhook has `organization_id` set and the event's `organization_id` matches or the event's actor is any member of that org (`iam.is_org_member(user, org)` — the arbitrary-pair sibling of `iam.has_org_access`). Both subject to the optional `event_types` / `resource_types` allow-lists. **Org scoping is guarded twice:** write-time (`files.webhook_org_guard` trigger — you can only scope to an org you belong to) and delivery-time (owner must STILL be a member, so leaving an org silences the webhook). All in [migrations/webhook_depth_remainder.sql](../../../migrations/webhook_depth_remainder.sql).
- **Manual redeliver:** `files.webhook_redeliver(delivery_id)` — SECURITY DEFINER, owner-checked via `auth.uid()`; re-signs the canonical payload and re-posts, flipping the row back to `pending` (attempt+1, ignores the automatic retry cap — it's a human). Test pings (null `activity_log_id`) are not redeliverable — use Send test. FE: refresh icon on each settled delivery row.
- **Latency:** `webhook_deliveries.dispatched_at` is stamped at every `pg_net` post (dispatch / retry / test / redeliver); reconcile settles `latency_ms = net._http_response.created - dispatched_at`. Shown on the delivery row.
- **Python file-audit producers (aidream):** `FileService` mutations (visibility change, permission grant/revoke, soft/hard delete, restore) fire `fire_audit_event()` (matrx-utils `cloud_sync/events`) → the host bridge (`aidream/api/utils/audit_bridge.py`) persists via the **6-arg** `platform.log_activity` with the acting user as explicit `p_actor` (the 5-arg overload stamps `auth.uid()` = NULL under service role, which is why these events never matched owner webhooks — and before 2026-07-08 nothing fired the producer at all, and `service_role` lacked EXECUTE). Org-less files resolve to the actor's personal org (`ensure_personal_organization`) since `activity_log.organization_id` is NOT NULL.
- **Signature header:** `X-Matrx-Signature: sha256=<hex>` (HMAC of the raw JSON body). Plus `X-Matrx-Event`, `X-Matrx-Webhook-Id`, `X-Matrx-Delivery-Event`.
- **Hardening (adversarial review, 2026-06-27):** **SSRF** — `files.is_safe_webhook_url` + `webhook_url_guard` trigger reject non-https / localhost / RFC1918 / link-local / metadata / internal targets at write time; the dispatcher skips unsafe URLs too (DNS-rebinding of a public name → private IP is the documented residual). **Retry** — `webhook_reconcile` re-sends eligible failures (backoff, max 6 attempts) and times out pg_net-GC'd pendings. **Watermark race** — dispatch lags 5s on `occurred_at` so slow-committing events aren't skipped. **Signature** — signed over the exact jsonb `pg_net` serializes (verified: recomputed HMAC over the received body matches). **Actor forgery** — `EXECUTE` on `platform.log_activity` revoked from `authenticated`/`anon` (only definer triggers write the ledger).
- **FE:** owner-scoped CRUD is **direct against the `files` schema** (RLS `owner_id = auth.uid()`) via [service.ts](service.ts) + [filesDb()](../filesDb.ts) — no RPC, no Python. The signing **secret is returned ONLY at create/rotate** (never on list reads). UI at `/files/webhooks` ([WebhooksManager.tsx](components/WebhooksManager.tsx)), reachable from the **Files sidebar → Webhooks**: register endpoint, pick events, toggle/rotate-secret/delete, **Send test** (`files.webhook_send_test` RPC — one-click signed ping), delivery health.
- **Visibility:** admin **Events** viewer at `/administration/reporting/events` ([page](../../../app/(admin)/administration/reporting/events/page.tsx)) reads `platform.activity_log` via the `admin_recent_activity` RPC (`is_super_admin` gated) — watch run.*/webhook.*/file.* events arrive while testing.
- **Verified:** event → match → sign → `pg_net` POST → reconcile → HTTP 200, with postman-echo confirming the exact signature header arrived. (See FOUND_DEFECTS D-webhooks for the browser-UI verification still pending.)

## Invariants

- **Producers write to `platform.activity_log` via `platform.log_activity(p_org, p_action, p_entity_type, p_entity_id, p_metadata)`** — never insert raw. The spine is the only event source; do not add a second outbox (the old `cld_events` is in `graveyard`).
- **A run-completion event must carry `actor_id` = the run's owner** — otherwise webhook matching (v1) can't deliver it.
- **Delivery secrets are shown once.** `webhooks.secret` is never surfaced in a list view after creation; rotate via `rotateWebhookSecret`.
- **One delivery per `(webhook_id, activity_log_id)`** — the unique index makes re-dispatch safe.

## Phase 1 — run-lifecycle producers (COMPLETE)

Run/job tables emit `run.completed` / `run.failed` to `activity_log` on a terminal status transition, with `actor_id` = the run owner (so owner webhooks match). [migrations/run_lifecycle_activity_events.sql](../../../migrations/run_lifecycle_activity_events.sql): a canonical 6-arg `platform.log_activity` overload (explicit actor — the base 5-arg stamps `auth.uid()`, NULL in a trigger) + one **generic** `platform.emit_run_lifecycle()` trigger that reads canonical fields from `to_jsonb(NEW)` by name — so it tolerates either owner column (`owner = coalesce(user_id, triggered_by)`) and any future run table.

- **Attached to 12 tables** (verified end-to-end for both owner shapes): `files.file_rag_jobs`, `public.kg_sweep_run`, `public.agent_run`, `public.pc_studio_runs`, `public.sch_run`, `public.scrape_cycle_run`, `scraper.crawl_runs`, `public.studio_runs`, `public.page_extraction_runs` (owner `triggered_by`), `public.page_extraction_page_runs`, `public.derive_runs`, `legal.ingest_runs` (owner `triggered_by`).
- **Add a new run table:** one line in each `do` block (`('schema','table','<owner_col>')`) — no function change.
- **Not a producer:** `public.ai_runs` — its `status` is `active/archived/deleted` (record state, not job progress).
- **`organization_id` is REQUIRED (NOT NULL) on all 12** (`migrations/run_org_required.sql`): backfilled from the owner's personal org (`ensure_personal_organization`), ownerless rows → the Matrx System org. A DB-edge `platform.stamp_run_org()` BEFORE INSERT trigger fills org when an insert leaves it NULL (owner's personal org, else system org), so the app's explicit org always wins and NOT NULL can never break an insert. Every run now has an org → every terminal transition emits.

## Transport 1 — Realtime kills in-app polling (STARTED)

Generic primitive: [`hooks/useRunListRealtime.ts`](../../../hooks/useRunListRealtime.ts) — subscribe to owner-scoped INSERT/UPDATE on any run table in the `supabase_realtime` publication, debounced `onChange` refetch. One hook for every "my runs" list (no per-feature channel copies).

- **Live:** podcast runs (`useStudioRuns`) — 15s `setInterval` deleted, now Realtime on `agent_run` (added to the publication; owner RLS `user_id = auth.uid()`). Verified end-to-end: an authenticated owner subscription receives an `agent_run` change.
- **Pending:** `useStudioRun` (detail-page poll — detached-disconnect fallback during streaming; lower priority), RAG safety-net (`useFileRagStatus`, already Realtime-primary), `useResolveCreatedProject`. **Blocked:** the AI-runs list (`useAiRunsList`) — `ai_runs` is graveyarded (`graveyard.ai_runs`) and mid-migration; convert once it resettles on its canonical table.

## Roadmap (pending — see FOUND_DEFECTS.md)
- Transport 1 remainder: `useStudioRun` detail-page poll, `useResolveCreatedProject`, AI-runs list (blocked on `ai_runs` resettling). The webhook-depth remainder (D19) is closed — org fan-out, redeliver, latency, Python actors, admin map all shipped 2026-07-08.

## Change log

- **2026-07-08** — D19 closed (`migrations/webhook_depth_remainder.sql` + aidream `eaa28dade`): (1) org-wide fan-out — `webhooks.organization_id` + `iam.is_org_member(user,org)` matching, write-time `webhook_org_guard` + delivery-time membership recheck, FE org-wide toggle; (2) manual redeliver — `files.webhook_redeliver` RPC (owner-checked) + per-delivery button; (3) `latency_ms` — `dispatched_at` stamped at every post, settled by reconcile; (4) Python file-audit events — producers wired into `FileService` mutations (they never fired before), 6-arg `log_activity` with explicit `p_actor`, `service_role` EXECUTE grant, personal-org fallback; (5) Files admin map at `/files/admin`. Verified live end-to-end: service-role emit → dispatch matched both owner + org branches → postman-echo 200 + latency; redeliver attempt=2 delivered; non-owner redeliver and non-member org scoping both rejected.
- **2026-06-27** — Adversarial-review hardening (SSRF guard, retry, watermark lag, sign==send, log_activity revoke, stamp_run_org assert) + visibility/testability: `/administration/reporting/events` viewer, `Send test` button (`webhook_send_test`), Files-sidebar Webhooks link, secret excluded from list reads. User test guide: `docs/NEW_FEATURES_TEST_GUIDE.md`.
- **2026-06-26** — Transport 1 started: generic `hooks/useRunListRealtime.ts` + `agent_run` added to `supabase_realtime`; podcast runs list (`useStudioRuns`) off its 15s poll onto Realtime (verified live). `ai_runs` list blocked (graveyarded).
- **2026-06-26** — `organization_id` made REQUIRED on all 12 run tables (`migrations/run_org_required.sql`): backfilled from owner's personal org (ownerless → Matrx System org) + `platform.stamp_run_org()` insert-default trigger + NOT NULL. Verified: 0 NULLs, both owned/ownerless insert paths stamp correctly.
- **2026-06-26** — Phase 1 **complete**: all 12 canonical run tables emit `run.completed`/`run.failed` (owner actor) via the generic `platform.emit_run_lifecycle()` trigger (`to_jsonb(NEW)`, owner = `coalesce(user_id, triggered_by)`) + a 6-arg `log_activity` overload. Both owner shapes verified end-to-end. `ai_runs` excluded (record-state status).
- **2026-06-26** — Built Transport 2 (DB-native outbound webhooks) on `platform.activity_log`; verified end-to-end live. Repointed `files.webhook_deliveries` off graveyarded `cld_events`. FE CRUD + `/files/webhooks` UI. Phase 1 (run-lifecycle producers) + Transport 1 (Realtime) documented as pending.
