-- agent_change_impact_03_advance_batch_ledger.sql
-- I3 — THE BATCH PIN ADVANCE LEDGER + THE REVERT-WINDOW KNOB
-- (Agent Change Impact campaign, common-docs/projects/agent-change-impact/REGISTER.md,
-- rulings R8, R9, R10, R24, R29; the endpoint is aidream `POST /mandates/impact/advance`
-- and `POST /mandates/impact/revert`, aidream/services/agent_impact/advance.py).
--
-- WHAT THIS IS
-- ------------
-- One row per apply token per batch: what the batch was asked to do to that rung, what it
-- actually did, and why. R8 makes the batch per-row atomic — "advance these 25" must never
-- die on one row — so the result has to live per row, and R10 anchors per-batch REVERT on the
-- prior pin recorded here (`history.row_versions` already captures the pin on every
-- mandate/binding UPDATE, but it has no batch column to group a batch's rows by).
--
-- The chair searched every domain for a per-row batch-result primitive and found none (R29:
-- hr.recalculation_batch is a header, workflow.job a queue, commerce.*_batch commerce-bound),
-- so this table is SCOPED to this feature on purpose and NOT lifted into a platform
-- primitive — there is no second caller today. Named for later: when a second domain needs
-- per-row batch results, that is the moment to lift it.
--
-- SHAPE
-- -----
-- `ledger` variant: append-only, organization-scoped, no soft delete, no versioning, no
-- visibility. A revert never edits the advance row it undoes — it APPENDS a row with
-- action='revert' pointing back at it (`reverts_batch_id`, `reverts_row_id`), so the ledger
-- reads as history. `organization_id` is the rung's own organization — the mandate's HOME for a
-- default rung, the binding's `organization_id` for a binding rung — written explicitly by the
-- endpoint; `p_org_default => false` (no trigger ever chooses it). The actor is `created_by`,
-- stamped explicitly by the server (the pool has no auth.uid()).
--
-- `status`:
--   advanced  the pin moved to `new_pinned_version_id` (action='advance')
--   reverted  the pin moved back to `new_pinned_version_id` (action='revert')
--   refused   the write was NOT made because the row's live state disagreed with the token
--             (stale pin — R9; no target — R23; unknown row; target from another agent) or the
--             sanctioned writer refused it (containment, contract); `reason` says which
--   excluded  the row was never a candidate (user principal, tracks latest, not an agent
--             holder) and the batch says so by name (R17/R35); `reason` says which
--
-- THE PROVISIONER DEFECT MET ON THE WAY (2026-09-12, filed): `platform.create_entity_table`
-- computes `suppress_platform_admin_lane` as `(p_variant='restricted' OR p_data_class='private')`,
-- which is NULL — not false — when `p_data_class` is NULL, so every call that omits the class
-- fails with 23502 on `platform.entity_types`. The class is supplied explicitly here
-- ('organization', the same class every other org-scoped ledger carries).
--
-- DRY-RUN PROVEN on the live database 2026-09-12 inside a rolled-back block:
-- `iam.canonical_certify_ok('mandate','advance_batch_row','mandate_advance_batch_row') = true`,
-- non-PASS rows all SKIP (soft_delete, trg_stamp_actor, trg_version_capture, visibility,
-- sharing_token — every one the ledger variant's own declared skips).
--
-- Idempotent. Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The ledger table — ONLY through the provisioner (db-rules §0). It creates the base
--    columns, registers the entity type, applies canonical RLS and verifies in one call.
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  if to_regclass('mandate.advance_batch_row') is null then
    perform platform.create_entity_table(
      p_schema => 'mandate', p_table => 'advance_batch_row',
      p_token => 'mandate_advance_batch_row',
      p_label => 'Pin advance batch row',
      p_fields => ARRAY[
        'batch_id uuid NOT NULL',
        'batch_label text',
        $f$action text NOT NULL CHECK (action IN ('advance','revert'))$f$,
        'reverts_batch_id uuid',
        'reverts_row_id uuid',
        $f$holder_kind text NOT NULL CHECK (holder_kind IN ('mandate_default','binding'))$f$,
        'row_id uuid NOT NULL',
        'mandate_key text NOT NULL',
        'expected_pinned_version_id uuid',
        'target_version_id uuid',
        'prior_pinned_version_id uuid',
        'new_pinned_version_id uuid',
        $f$status text NOT NULL CHECK (status IN ('advanced','reverted','refused','excluded'))$f$,
        'reason text',
        'applied_at timestamptz'
      ],
      p_variant => 'ledger', p_versioned => false, p_soft_delete => false, p_visibility => 'none',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => null,
      p_data_class => 'organization', p_default_list_scope => 'organization');
  end if;
end $$;

comment on table mandate.advance_batch_row is
  'Per-row result ledger of the batch pin advance (Agent Change Impact I3). One row per apply '
  'token per batch; a revert appends a row pointing at the advance row it undoes. Written ONLY '
  'by aidream POST /mandates/impact/advance and /revert; never by a client.';

-- The reads the endpoints make: "rows of this batch" (revert), "rows about this rung"
-- (has it already been reverted?). Append-only, small, so plain btree indexes.
create index if not exists advance_batch_row_batch_idx
  on mandate.advance_batch_row (batch_id);
create index if not exists advance_batch_row_rung_idx
  on mandate.advance_batch_row (holder_kind, row_id);
create index if not exists advance_batch_row_reverts_idx
  on mandate.advance_batch_row (reverts_row_id)
  where reverts_row_id is not null;

-- A revert row must name the advance row it undoes; an advance row must not.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'advance_batch_row_revert_shape') then
    alter table mandate.advance_batch_row add constraint advance_batch_row_revert_shape check (
      (action = 'advance' and reverts_batch_id is null and reverts_row_id is null)
      or (action = 'revert' and reverts_batch_id is not null and reverts_row_id is not null)
    );
  end if;
end $$;

-- API-role grants (create_entity_table grants nothing to the PostgREST roles). The client
-- may READ its own organization's ledger rows through the canonical ledger RLS lane (the
-- standing table shows what a batch did); it may never write one — the two endpoints are
-- the only writers, and they run on the server pool.
grant select on mandate.advance_batch_row to authenticated;
grant select, insert on mandate.advance_batch_row to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The revert-window knob (I9). How long after a batch its rows may still be reverted
--    through the ledger. An ORG knob, never a constant: organizations decide. Starting value
--    72 hours — Stripe's reference window for reversing an automated change (the champion
--    named in discovery/B); read live through `scoped_knob_int('agent_impact',
--    'revert_window_hours', organization_id)`, per row, for the row's own organization.
--    Agent-set under blind approval (limits-are-knobs policy) by Claude Opus 5, 2026-09-12;
--    Arman has NOT reviewed it. Review due 2026-10-13, with the other agent_impact rows.
-- ─────────────────────────────────────────────────────────────────────────────
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   allowed_values, label, description, set_by, basis, review_due,
   overridable_by, override_direction, taxonomy_node_id)
values
  ('agent_impact', 'revert_window_hours', '72', '72', 'integer', 'hours', 1, 720, null,
   'Hours a batch pin advance stays revertible',
   'After a batch moves jobs to a newer agent version, this is how long the one-click revert stays open for that batch. Past it the ledger still shows what happened, but undoing it is a new deliberate change rather than a revert. Three days is long enough to notice a regression over a weekend.',
   'agent',
   'New with the batch pin advance (Agent Change Impact I3/I9); read live through scoped_knob_int in aidream/services/agent_impact/advance.py. 72h follows Stripe''s reversal window.',
   date '2026-10-13', '{organization}', 'any',
   (select taxonomy_node_id from platform.feature_knob where feature = 'agent_impact' and taxonomy_node_id is not null limit 1))
on conflict (feature, key) do update set
  default_value = excluded.default_value,
  label = excluded.label,
  description = excluded.description,
  basis = excluded.basis,
  overridable_by = excluded.overridable_by,
  taxonomy_node_id = coalesce(platform.feature_knob.taxonomy_node_id, excluded.taxonomy_node_id),
  value = case when platform.feature_knob.set_by = 'human' then platform.feature_knob.value else excluded.value end,
  review_due = case when platform.feature_knob.set_by = 'human' then platform.feature_knob.review_due else excluded.review_due end;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Proof, in the same transaction: certified canonical, knob registered.
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  if not iam.canonical_certify_ok('mandate', 'advance_batch_row', 'mandate_advance_batch_row') then
    raise exception 'mandate.advance_batch_row is not canonical: %',
      (select string_agg(check_name || ': ' || coalesce(detail, ''), '; ')
         from iam.verify_canonical('mandate', 'advance_batch_row', 'mandate_advance_batch_row')
        where status = 'FAIL');
  end if;
  if not exists (select 1 from platform.feature_knob where feature = 'agent_impact' and key = 'revert_window_hours') then
    raise exception 'agent_impact.revert_window_hours was not registered';
  end if;
end $$;
