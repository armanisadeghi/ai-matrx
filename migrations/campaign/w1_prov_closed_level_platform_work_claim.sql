-- target: branch
--
-- w1_prov_closed_level_platform_work_claim — LEVELLING, NOT A MIGRATION REPLAY.
--
-- Lane W1-PROV-CLOSED, 2026-09-17, BUILD-BOOK §36. Production gained
-- `platform._work_claim` DURING this lane's run — it is `V-CLOSE P1`'s durable claim
-- table, created on production today and carrying no ledger row this checkout can see —
-- so `pnpm check:branch-schema-drift` went from nine production-only objects to one while
-- the nine were being carried. `platform` carries no standing drift exception (§36), so the
-- table is carried rather than excused.
--
-- Its whole shape was READ out of PRODUCTION's own catalogue on 2026-09-17 inside
-- `begin transaction read only` — `pg_attribute` + `pg_attrdef` for the columns,
-- `pg_get_constraintdef` for the three constraints, `pg_get_indexdef` for the three
-- indexes, `pg_class` for the RLS flags and the ACL, `obj_description` for the comment —
-- and reproduced here. Measured there: RLS ENABLED, not forced; `relacl` NULL (no grant to
-- any role, which is what a machinery table holds); ZERO policies; ZERO non-internal
-- triggers; no `platform.entity_types` row. Production was read and never written.
--
-- THE INVERSE: `migrations/inverse/w1_prov_closed_level_platform_work_claim_down.sql`.

set lock_timeout = '2s';
set statement_timeout = '600s';

create table if not exists platform._work_claim (
  id          uuid        not null default gen_random_uuid(),
  scope       text        not null,
  claim_key   text        not null,
  state       text        not null,
  owner_task  text        not null,
  result_ref  text,
  detail      jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default clock_timestamp(),
  updated_at  timestamptz not null default clock_timestamp(),
  expires_at  timestamptz not null,
  constraint _work_claim_pkey primary key (id),
  constraint _work_claim_scope_key_unique unique (scope, claim_key),
  constraint _work_claim_state_check check (state = any (array['running'::text, 'done'::text, 'failed'::text]))
);

create index if not exists _work_claim_reclaimable_idx
  on platform._work_claim using btree (expires_at) where (state <> 'done'::text);

alter table platform._work_claim enable row level security;

comment on table platform._work_claim is
  'Durable claims on paid or non-idempotent work: one winner per (scope, claim_key) by ON CONFLICT DO NOTHING, with a lease so a crashed holder frees the key and a result_ref so the loser returns the winner''s work. Replaces session-scoped advisory locks, which are meaningless through the transaction-mode pooler (V-CLOSE P1, 2026-09-17). Concurrency machinery, not an entity or organization record; no direct user access.';
