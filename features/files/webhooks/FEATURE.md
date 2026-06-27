# Webhooks + Event Spine — Feature Architecture

**Status:** ✅ Outbound delivery live + verified end-to-end on the live DB. Transports beyond external HTTP + most event producers are **pending** (see Roadmap).
**Last updated:** 2026-06-26.

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
- **Matching (v1):** a webhook receives an event when `activity_log.actor_id = webhooks.owner_id` (+ optional `event_types` / `resource_types` allow-lists). "Notify me about my own events / my finished jobs." Needs **no** org/iam membership resolution — unambiguously authorized.
- **Signature header:** `X-Matrx-Signature: sha256=<hex>` (HMAC of the raw JSON body). Plus `X-Matrx-Event`, `X-Matrx-Webhook-Id`, `X-Matrx-Delivery-Event`.
- **FE:** owner-scoped CRUD is **direct against the `files` schema** (RLS `owner_id = auth.uid()`) via [service.ts](service.ts) + [filesDb()](../filesDb.ts) — no RPC, no Python. UI at `/files/webhooks` ([WebhooksManager.tsx](components/WebhooksManager.tsx)): register endpoint, pick events, toggle/rotate-secret/delete, delivery health.
- **Verified:** event → match → sign → `pg_net` POST → reconcile → HTTP 200, with postman-echo confirming the exact signature header arrived. (See KNOWN_DEFECTS D-webhooks for the browser-UI verification still pending.)

## Invariants

- **Producers write to `platform.activity_log` via `platform.log_activity(p_org, p_action, p_entity_type, p_entity_id, p_metadata)`** — never insert raw. The spine is the only event source; do not add a second outbox (the old `cld_events` is in `graveyard`).
- **A run-completion event must carry `actor_id` = the run's owner** — otherwise webhook matching (v1) can't deliver it.
- **Delivery secrets are shown once.** `webhooks.secret` is never surfaced in a list view after creation; rotate via `rotateWebhookSecret`.
- **One delivery per `(webhook_id, activity_log_id)`** — the unique index makes re-dispatch safe.

## Phase 1 — run-lifecycle producers (COMPLETE)

Run/job tables emit `run.completed` / `run.failed` to `activity_log` on a terminal status transition, with `actor_id` = the run owner (so owner webhooks match). [migrations/run_lifecycle_activity_events.sql](../../../migrations/run_lifecycle_activity_events.sql): a canonical 6-arg `platform.log_activity` overload (explicit actor — the base 5-arg stamps `auth.uid()`, NULL in a trigger) + one **generic** `platform.emit_run_lifecycle()` trigger that reads canonical fields from `to_jsonb(NEW)` by name — so it tolerates either owner column (`owner = coalesce(user_id, triggered_by)`) and any future run table.

- **Attached to 12 tables** (verified end-to-end for both owner shapes): `files.file_rag_jobs`, `public.kg_sweep_run`, `public.agent_run`, `public.pc_studio_runs`, `public.sch_run`, `public.scrape_cycle_run`, `scraper.crawl_runs`, `public.studio_runs`, `public.page_extraction_runs` (owner `triggered_by`), `public.page_extraction_page_runs`, `public.derive_runs`, `legal.ingest_runs` (owner `triggered_by`).
- **Add a new run table:** one line in the `do` block (`('schema','table')`) — no function change.
- **Not a producer:** `public.ai_runs` — its `status` is `active/archived/deleted` (record state, not job progress).
- **Caveat:** `organization_id` is nullable on most run tables (parents carry no org); existing rows are NULL → the trigger skips them (org-null guard). The app populates org on new runs going forward; events only fire once a run has an org.

## Roadmap (pending — see KNOWN_DEFECTS.md)
- **Transport 1 — Realtime kills in-app polling.** Convert the polling surfaces (podcast runs `useStudioRuns`/`useStudioRun`, `ai-runs` `useAiRunsList`/`useAiTasks`, RAG safety-net, project-init resolver) to Supabase Realtime on their run tables (the proven `features/scheduling/hooks/useRunStream.ts` pattern), deleting every `setInterval`/`refetchInterval`. Needs run tables added to the `supabase_realtime` publication + owner-read RLS. Generalize a single `useRunRealtime` hook rather than per-feature copies.
- **Webhook depth:** org-wide fan-out (deliver on any org member's action — needs iam membership), manual **redeliver** button + RPC, populate `actor_id` on the Python file-audit events (currently null → those events don't match owner webhooks), `latency_ms` capture, per-feature admin-map entry.

## Change log

- **2026-06-26** — Phase 1 **complete**: all 12 canonical run tables emit `run.completed`/`run.failed` (owner actor) via the generic `platform.emit_run_lifecycle()` trigger (`to_jsonb(NEW)`, owner = `coalesce(user_id, triggered_by)`) + a 6-arg `log_activity` overload. Both owner shapes verified end-to-end. `ai_runs` excluded (record-state status).
- **2026-06-26** — Built Transport 2 (DB-native outbound webhooks) on `platform.activity_log`; verified end-to-end live. Repointed `files.webhook_deliveries` off graveyarded `cld_events`. FE CRUD + `/files/webhooks` UI. Phase 1 (run-lifecycle producers) + Transport 1 (Realtime) documented as pending.
