-- platform.assists — absorb the capabilities the two bespoke suggestion systems
-- already had (THE ABSORB-THEN-COLLAPSE METHOD, Arman 2026-08-09).
--
-- Source systems and what each contributed:
--   web.finding (SEO audit register)
--     · first_detected_at / last_detected_at / first_result_id / last_result_id
--       → an assist keeps the date it was FIRST noticed across re-notices, and
--         counts how many times it has recurred.
--     · status='resolved' + resolved_at, written by the analyzer when the
--       condition stops reproducing → an assist can close because the thing
--       went away, with nobody deciding anything. Without this, a chip for a
--       vanished condition sits pending forever and the only exits are "accept
--       something that no longer applies" or "dismiss forever".
--   features/kg-suggestions (KG proposal ledgers)
--     · decision_note → why the user deferred/rejected, rendered when the row
--       resurfaces so a decision explains itself.
--     · is_starred / viewed_at → triage flag + unseen dot in the manager.
--     · source_kind/source_id/context_snippet + the source-preview panel
--       → `evidence`: WHAT the system actually saw and WHERE, so a proposal can
--         show its receipt instead of asking for blind trust.
--
-- Idempotent. Applied + ledger-recorded via aidream
-- `python db/apply_migrations.py --source matrx-frontend`.

begin;

alter table platform.assists
  add column if not exists evidence jsonb,
  add column if not exists first_seen_at timestamptz,
  add column if not exists occurrences integer not null default 1,
  add column if not exists resolved_at timestamptz,
  add column if not exists decision_note text,
  add column if not exists is_starred boolean not null default false,
  add column if not exists viewed_at timestamptz;

comment on column platform.assists.evidence is
  'What the system actually saw, as a typed jsonb payload the card renders: {kind, ref?, snippet?, href?, items?}. The receipt BEHIND the claim — absorbed from kg-suggestions (context_snippet + source preview) and web.finding (first/last analysis result).';
comment on column platform.assists.first_seen_at is
  'When this dedupe_key was FIRST noticed. A re-notice refreshes title/body but never moves this — web.finding.first_detected_at generalised.';
comment on column platform.assists.occurrences is
  'How many times the producer has re-noticed this exact thing. 1 = seen once.';
comment on column platform.assists.resolved_at is
  'Set with status=resolved when the condition stopped reproducing. Nobody decided; it simply went away.';
comment on column platform.assists.decision_note is
  'The user''s own words at decision time. Written only when supplied — a later plain decide never clears it.';

-- Backfill first_seen_at for rows that predate the column, so "first noticed"
-- is never blank on live data.
update platform.assists
   set first_seen_at = created_at
 where first_seen_at is null;

-- `resolved` joins the vocabulary. Every existing value stays legal — this
-- widens the check, it never narrows it.
alter table platform.assists drop constraint if exists assists_status_check;
alter table platform.assists add constraint assists_status_check
  check (status = any (array[
    'pending'::text,
    'accepted'::text,
    'dismissed'::text,
    'expired'::text,
    'superseded'::text,
    'resolved'::text
  ]));

-- `resolved` and its timestamp are inseparable, the same pact
-- `finding_resolution_valid` enforces on web.finding: a resolved row that
-- cannot say WHEN is a row nobody can audit.
alter table platform.assists drop constraint if exists assists_resolution_valid;
alter table platform.assists add constraint assists_resolution_valid
  check ((status = 'resolved') = (resolved_at is not null));

-- The manager sorts by starred + unseen inside one user's rows.
create index if not exists assists_user_triage_idx
  on platform.assists (user_id, is_starred desc, created_at desc)
  where deleted_at is null;

commit;
