-- ui_surface_check_ledger — the per-surface ledger for THE UI SURFACE CHECKLIST
-- (.claude/skills/surface-check/CHECKLIST.md). Idempotent.
--
-- Why columns on ui.ui_surface (not a new table): ui_surface is a code-owned
-- MIRROR of the manifests (one row per surface, ~184 rows), the admin hub
-- /administration/ui/surfaces already lists it, and "which surface has never
-- been checked / is stalest" is a one-ORDER-BY question on this row. Manifest
-- sync upserts only its own columns, so these survive every sync; a row whose
-- manifest is deleted is a surface that no longer exists, and its ledger goes
-- with it (correct).
--
--   last_checked_at / last_checked_by  — when + who (agent/session id) last
--                                        completed the full checklist
--   last_check       (jsonb)           — {checklistVersion, commit, result,
--                                        sections:{S1..S18:{status,note}},
--                                        armanItems:[], notes}
--   check_claimed_at / check_claimed_by — in-flight claim so two agents never
--                                        take the same surface (expires 6h)
alter table ui.ui_surface
  add column if not exists last_checked_at  timestamptz,
  add column if not exists last_checked_by  text,
  add column if not exists last_check       jsonb,
  add column if not exists check_claimed_at timestamptz,
  add column if not exists check_claimed_by text;

comment on column ui.ui_surface.last_checked_at is
  'surface-check ledger: when the full UI surface checklist last completed on this surface (see .claude/skills/surface-check).';
comment on column ui.ui_surface.last_check is
  'surface-check ledger: {checklistVersion, commit, result, sections:{S#:{status,note}}, armanItems, notes}.';
comment on column ui.ui_surface.check_claimed_at is
  'surface-check ledger: in-flight claim (expires 6h); cleared when the check is logged.';

create index if not exists ui_surface_last_checked_idx
  on ui.ui_surface (last_checked_at nulls first);
