-- THE PLATFORM APPROVAL QUEUE — the ONE column the existing store is missing.
--
-- NOT APPLIED BY THIS AGENT. The coordinator applies DB files
-- (`pnpm db:apply migrations/platform_approval_queue.sql`) and regenerates
-- `pnpm db-types`. Until then `features/approvals/` names this file as the
-- remedy on screen rather than showing a calm, empty queue (THE NO-SILENT-FAILURE LAW).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE RULING: NO NEW TABLE. `platform.assists` IS THE STORE.
-- ═══════════════════════════════════════════════════════════════════════════
-- Chair ruling, 2026-09-17 (plan attack on U-P4): the SEO value-system queue —
-- already the generic mechanism with a kind registry and a documented
-- "registering a kind" path — is LIFTED into `features/approvals/`, and its
-- store comes with it. Its rows are `platform.assists` (surface
-- `matrx-user/keyword-meaning-review`, decided through the assists service), so
-- the platform queue writes there too: one queue, one store, no queue number
-- four. An earlier draft of this file created `platform.approval_proposal`; it
-- was wrong and is not in this file.
--
-- What `platform.assists` already carries (verified live 2026-09-17, project
-- brsgrqvjdzwihsvnfqkf): the addressee (`user_id`), the subject
-- (`entity_type` + `entity_id`), the typed proposal (`action` jsonb — the
-- precedent is `apply_keyword_meaning`, which carries its whole proposal and
-- provenance there), `organization_id`, `status` +`decided_by` + `decided_at` +
-- `decision_note` + `result`, `dedupe_key`, `priority`, `evidence`,
-- `occurrences`, `first_seen_at`, `expires_at`, `suppressed_until`.
--
-- So the autonomy MODE, the proposer (agent / on-behalf-of / run) and the
-- would-be change all ride the typed `action` payload
-- (`features/assists/types.ts` → the `approval_proposal` variant) — no columns
-- needed, no producer fan-out, exactly how urgency rides `priority`.
--
-- ONE column is genuinely missing, and this file adds it:
--
--   `auto_apply_at` — mode 3 ("review with timeout": if nobody rules within the
--   window it applies ITSELF). Three reasons it cannot ride the payload:
--     1. `expires_at` is not it and must not be reused — expiring means STOP
--        SHOWING THIS; auto-applying means MAKE THE CHANGE. Overloading one
--        column with both meanings is how a proposal nobody read would quietly
--        become a sent email.
--     2. The sweep that applies timed-out proposals reads "every pending row
--        whose instant has passed" across all kinds. That is an indexed
--        range scan over a real column, not a jsonb probe.
--     3. HITL policy rule 4 — "mode 3's timeout must be visible before it
--        fires" — is only enforceable if the instant is a column a constraint
--        and a query can see.
--
-- Cost if this ruling is wrong (the store, not the column): the two new kinds'
-- reader/writer move to another table. `features/approvals/data.ts` is the only
-- module that touches the store; the queue engine, the registry and both item
-- bodies never name it.
--
-- Contract doc: `features/approvals/FEATURE.md`.
-- Policy: common-docs `/policies/human-in-the-loop-autonomy-modes.md`.
-- Plan: common-docs `/projects/google-native/PLAN.md` §5.5.
-- Store SoR: common-docs `/systems/platform/assists/FEATURE.md`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The column.
-- ─────────────────────────────────────────────────────────────────────────────
-- Additive and nullable: every existing row (and every assist that is not an
-- approval proposal) keeps its current meaning untouched — NULL is "no clock",
-- which is every mode except mode 3.
alter table platform.assists
  add column if not exists auto_apply_at timestamptz;

comment on column platform.assists.auto_apply_at is
  'Mode 3 only (human-in-the-loop autonomy modes): the instant this proposal applies itself if '
  'nobody rules. NULL for every other mode and for every assist that is not an approval proposal. '
  'It is NOT expires_at: expiring stops showing a chip, this one makes the change. The approval '
  'queue prints it on the row before it can fire (policy rule 4).';

-- The sweep's read: pending rows whose clock has passed, across every kind.
-- (This file creates NO schedule — see the known gap in features/approvals/FEATURE.md.
-- An automated sweep needs Arman's approval by name and interval first.)
--
-- A PLAIN `create index`, not CONCURRENTLY, by measurement rather than habit:
-- `platform.assists` held 577 rows live on 2026-09-17, so this builds in
-- milliseconds. CONCURRENTLY needs autocommit, which `pnpm db:apply` refuses by
-- name, and splitting this file across two runners to protect a 577-row table
-- would be the larger risk. Re-measure before adding another index here.
create index if not exists assists_auto_apply_due_idx
  on platform.assists (auto_apply_at)
  where status = 'pending' and auto_apply_at is not null and deleted_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Assertions — this file proves what it claims rather than assuming it.
-- ─────────────────────────────────────────────────────────────────────────────
do $verify$
declare
  v_type text;
  v_notnull boolean;
begin
  select format_type(a.atttypid, a.atttypmod), a.attnotnull
    into v_type, v_notnull
    from pg_attribute a
   where a.attrelid = 'platform.assists'::regclass
     and a.attname = 'auto_apply_at' and a.attnum > 0 and not a.attisdropped;

  if v_type is null then
    raise exception 'platform.assists.auto_apply_at was not added.';
  end if;
  if v_type <> 'timestamp with time zone' then
    raise exception 'platform.assists.auto_apply_at must be timestamptz, is %.', v_type;
  end if;
  -- NOT NULL here would mean "every assist ever written now claims a clock".
  if v_notnull then
    raise exception 'platform.assists.auto_apply_at must stay nullable — NULL is "no clock".';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'platform' and tablename = 'assists'
       and indexname = 'assists_auto_apply_due_idx'
  ) then
    raise exception 'assists_auto_apply_due_idx is missing — the mode-3 sweep would table-scan.';
  end if;

  raise notice 'platform.assists.auto_apply_at: added, nullable, indexed for the mode-3 sweep.';
end;
$verify$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The producer policy for the `approval.` source prefix.
-- ─────────────────────────────────────────────────────────────────────────────
-- `platform.assist_admission_decision` refuses an UNREGISTERED source outright
-- ('unregistered_source'), so without this row every client-side proposal into
-- the queue would be silently refused. Mirrors the shape of the existing rows
-- (verified live 2026-09-17): same owning organization, internal visibility,
-- prefix match.
--
-- 🚨 TWO THINGS THIS ROW DOES NOT FIX, both filed as gaps in
-- `features/approvals/FEATURE.md` § Known gaps:
--   * `presentation_enabled` stays FALSE on purpose. These rows are NOT chips:
--     their reviewer is the queue, and an approval granted from a collapsed
--     chip with the review body off screen would defeat the review.
--   * The admission function also refuses on `user_quiet` (quiet hours) and on
--     `pending_budget_reached`. Quiet hours must never swallow a proposal a
--     person has to decide; the budget must never drop the 501st. Until the
--     admission function exempts approvals, the client writer surfaces the
--     refusal to its caller, whose contract is then "do NOT perform the change"
--     — loud, never a silent drop. `max_pending_per_user` is set high (500, not
--     the register's default 3) so the budget is not the thing that bites first.
insert into platform.assist_producer_policy
  (source_pattern, match_kind, display_name, feature_key, disposition,
   audit_status, production_enabled, presentation_enabled, cost_class,
   max_pending_per_user, max_presented_per_cycle, rationale,
   organization_id, visibility)
select 'approval.', 'prefix', 'Platform approval queue', 'approvals', 'task',
       'migrating', true, false, 'free',
       500, 0,
       'Every proposal waiting in THE ONE approval queue (features/approvals/, human-in-the-loop '
       'policy rule 5). Not a chip: presentation stays off because the decision needs the kind''s '
       'review body on screen, and the queue is the only reader. The pending ceiling is high '
       'because dropping an approval a person must decide is the failure this queue exists to '
       'prevent, not a budget to enforce.',
       '39c38960-d30c-4840-b0c1-c9960de95582', 'internal'
 where not exists (
   select 1 from platform.assist_producer_policy
    where source_pattern = 'approval.' and match_kind = 'prefix'
 );

do $verify$
begin
  if not exists (
    select 1 from platform.assist_producer_policy
     where source_pattern = 'approval.' and match_kind = 'prefix'
       and production_enabled and not presentation_enabled
  ) then
    raise exception 'The approval. producer policy is missing (or presentation was switched on).';
  end if;
  raise notice 'approval. producer policy: production on, presentation off.';
end;
$verify$;
