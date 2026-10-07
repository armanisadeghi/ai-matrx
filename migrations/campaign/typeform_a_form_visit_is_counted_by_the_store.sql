-- chair-step: it CREATES one table, `custom.anon_form_visit` (one row per visit to a public form, keyed by the sha256 of a per-visit key the page holds in memory: viewed, started, the questions reached, completed), with row security ON and no grants, and REGISTERS it in the same transaction as a `machinery` entity type (`anon_form_visit`), because a table is registered at birth. Nothing is replaced, dropped, granted or revoked; no existing row is touched. Apply BEFORE typeform_a_form_routes_scores_and_counts_itself.sql. The inverse is `migrations/inverse/typeform_a_form_visit_is_counted_by_the_store_down.sql`.
-- lane: TYPEFORM-DUP
-- lock: custom,platform
--
-- LANE TYPEFORM-DUP, results: views and starts counted honestly, through a store door, with no
-- cookie and no third-party tracker. Written only by custom.form_visit and custom.form_submit;
-- read only by custom.form_results.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

create table custom.anon_form_visit (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null,
  form_id         uuid        not null,
  visit_hash      text        not null,
  viewed_at       timestamptz not null default now(),
  started_at      timestamptz,
  last_field_key  text,
  reached         jsonb       not null default '[]'::jsonb,
  completed_at    timestamptz,
  submission_id   uuid,
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint anon_form_visit_reached_is_a_list check (jsonb_typeof(reached) = 'array')
);
create unique index anon_form_visit_form_id_visit_hash_idx on custom.anon_form_visit (form_id, visit_hash);
create index anon_form_visit_organization_id_form_id_idx on custom.anon_form_visit (organization_id, form_id);
alter table custom.anon_form_visit enable row level security;
insert into platform.entity_types (token, schema_name, table_name, label, audit_class, audit_class_reason, table_ref)
values ('anon_form_visit', 'custom', 'anon_form_visit', 'Form visit', 'machinery',
        'TYPEFORM-DUP: visit counters behind a public form. Written only by custom.form_visit and custom.form_submit, read only by custom.form_results; no app or person reads the table itself. Row security on, no grants.',
        'custom.anon_form_visit'::regclass);

comment on table custom.anon_form_visit is
  'TYPEFORM-DUP (2026-10-07): one row per visit to a public form — viewed, started, the questions reached, completed. Written only by custom.form_visit and custom.form_submit; read only by custom.form_results. Keyed by the sha256 of a per-visit key the page holds in memory: no cookie, no third-party tracker, nothing that links two visits.';
