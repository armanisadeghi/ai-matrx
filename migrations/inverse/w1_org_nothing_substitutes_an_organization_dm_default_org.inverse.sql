-- chair-step: re-installing the personal-org substitution trigger on communication.dm_conversations is the abort step for the 2026-09-19 ruling, not a pending half of the campaign; it re-opens a data-integrity class and runs only during an incident, named, with the chair awake
--
-- Inverse of w1_org_nothing_substitutes_an_organization_dm_default_org.sql.
--
-- Restores the personal-org substitution on `communication.dm_conversations`.
-- Running this re-opens the class the 2026-09-19 ruling closed: it should only
-- ever be used to unblock an incident, and never left in place.
--
-- 🚨 THIS IS A ROLLBACK, NOT A PENDING HALF OF THE CAMPAIGN. It sat in the
-- SWEPT `migrations/` directory, so `detect_applied.py` read it as a normal
-- migration whose objects are absent and listed it under
-- "🔴 MISSING — never applied", and two aidream releases carried that line as
-- pending work. It was never pending: its objects are absent BECAUSE its
-- forward half removed them. `apply_migrations.py` says where an unapplied
-- non-additive file belongs — "matrx-frontend: migrations/inverse/, not in the
-- swept migrations directory" — and that is where it now sits, beside the other
-- inverses, invisible to both non-recursive globs. Ledger identity is the
-- basename, so the move changes nothing the database recorded.
--
-- Verified live 2026-09-20 (db.matrxserver.com, read-only):
--   * forward half APPLIED — `public._schema_migrations` carries
--     matrx-frontend/w1_org_nothing_substitutes_an_organization_dm_default_org.sql
--     at 2026-09-20 02:57:21 UTC, named with --confirm-chair-step.
--   * `public.dm_default_org` and `trg_default_org`: 0 rows in pg_proc/pg_trigger.
--   * the other door is closed too — `public._stamp_org_default` and every
--     `_stamp_org_default` trigger: 0. The aidream half of the campaign landed,
--     so there is no remaining half for this file to be.
--   * nothing depends on the substitution: `communication.dm_conversations`
--     declares `organization_id NOT NULL`, holds 891 rows across 8
--     organizations, and 0 of them are org-less.
--
-- What applying it would do: it does not rewrite a single existing row, but it
-- re-installs a BEFORE INSERT trigger that would file any org-less DM into the
-- starter's personal workspace — 460 of the 523 live organizations are personal.
-- That is the data-integrity class the ruling closed, so it stays unapplied.

create or replace function public.dm_default_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT o.id INTO NEW.organization_id
      FROM iam.organizations o
     WHERE o.is_personal AND o.created_by = COALESCE(NEW.created_by, ( SELECT auth.uid()))
     LIMIT 1;
  END IF;
  RETURN NEW;
END $function$;

create trigger trg_default_org
  before insert on communication.dm_conversations
  for each row execute function public.dm_default_org();
