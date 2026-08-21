-- NO NULL ORG — transcripts studio lane (db-rules §2 "NO NULL ORG", owner
-- ruling 2026-08-21).
--
-- Four transcripts.studio_* tables were still minting NULL-org rows, and
-- `transcripts.studio_recording_chunks` was on the `known_null_org_writers`
-- allowlist in BOTH NO NULL ORG ratchets. The allowlist is a debt marker, not
-- a permission; this migration pays the debt for the whole lane and the entry
-- is removed in the same change.
--
-- Row census taken live before writing (real count(*), never reltuples —
-- db-rules §10):
--   studio_recording_chunks    85 NULL-org of 85   (100%)
--   studio_documents           56 NULL-org of 247
--   studio_session_settings    14 NULL-org
--   studio_recording_segments   5 NULL-org of 71
--
-- WHERE EACH ROW'S ORG COMES FROM
--   `studio_documents`, `studio_session_settings` and `studio_recording_segments`
--   are components of `transcripts.studio_sessions`, which already carries a
--   NOT NULL `organization_id`. Their org is the session's — resolved for
--   100% of the affected rows — so they get `platform.inherit_org_from_parent`
--   on the `session_id` FK, never a personal-org guess.
--
--   `studio_recording_chunks` is DIFFERENT and the difference is deliberate.
--   It is registered `rls_variant='entity'` (not a component), it has NO FK to
--   a session, and it never will: the journal is keyed on the recorder's
--   crash-safe `safety_id` because chunk 0 can land before the segments row
--   exists, and non-studio surfaces journal into it too (see the header of
--   `migrations/studio_recording_chunks.sql`). Verified live: 0 of the 85
--   NULL-org rows resolve to a session through `safety_id` — the parent path
--   is empty, so parent inheritance would have stamped nothing. What the table
--   does carry is `created_by uuid NOT NULL DEFAULT auth.uid()`, and all 85
--   rows resolve to their creator's existing personal organization. That is
--   the §2 answer for a root entity with an owner: `_stamp_org_default`.
--
-- Trigger ORDER matters (db-rules §10 — triggers fire alphabetically per
-- event): `_0_inherit_org` sorts before `_stamp_org_default`, so the parent's
-- org wins and the personal-org backstop only ever fires for a row whose
-- parent FK could not resolve. `_stamp_actor` ("_stamp_a") already sorts
-- before `_stamp_org_default` ("_stamp_o"), so `created_by` is populated
-- before the backstop reads it.
--
-- 🚨 The backfill, the triggers and the NOT NULL flips are ONE migration on
-- purpose (db-rules §2, live cost 2026-08-13): a NOT NULL without its backstop
-- turns every org-forgetting writer into a 23502.
--
-- RLS is unchanged. `studio_recording_chunks.std_insert` has an
-- `(organization_id IS NULL) OR iam.has_org_access(organization_id) …` WITH
-- CHECK; the NULL arm simply becomes unreachable. BEFORE-INSERT triggers run
-- before WITH CHECK is evaluated, so the stamped org is what the policy sees,
-- and a creator always has access to their own personal org.

BEGIN;

-- ── 1. Backfill ─────────────────────────────────────────────────────────────

UPDATE transcripts.studio_recording_segments g
   SET organization_id = s.organization_id
  FROM transcripts.studio_sessions s
 WHERE s.id = g.session_id
   AND g.organization_id IS NULL;

UPDATE transcripts.studio_documents d
   SET organization_id = s.organization_id
  FROM transcripts.studio_sessions s
 WHERE s.id = d.session_id
   AND d.organization_id IS NULL;

UPDATE transcripts.studio_session_settings t
   SET organization_id = s.organization_id
  FROM transcripts.studio_sessions s
 WHERE s.id = t.session_id
   AND t.organization_id IS NULL;

-- Chunks: the creator's EXISTING personal org. Deliberately a lookup, not
-- `ensure_personal_organization` — a backfill must never mint an organization
-- as a side effect. All 85 rows were verified resolvable before this ran; any
-- that somehow are not stay NULL and the NOT NULL below fails loudly rather
-- than mis-attributing them.
UPDATE transcripts.studio_recording_chunks c
   SET organization_id = o.id
  FROM iam.organizations o
 WHERE o.created_by = c.created_by
   AND o.is_personal IS TRUE
   AND c.organization_id IS NULL;

-- ── 2. Triggers (BEFORE the NOT NULL flip, same transaction) ────────────────

-- Parent-org inheritance for the three session components. Guards are
-- qualified by `tgrelid` — a name-only guard matches a same-named trigger on
-- ANY table and silently skips (db-rules §10).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'studio_recording_segments',
      'studio_documents',
      'studio_session_settings']) AS tbl
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
       WHERE tgrelid = format('transcripts.%I', r.tbl)::regclass
         AND tgname = '_0_inherit_org'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER _0_inherit_org BEFORE INSERT ON transcripts.%I '
        'FOR EACH ROW EXECUTE FUNCTION platform.inherit_org_from_parent('
        '''transcripts'', ''studio_sessions'', ''session_id'')', r.tbl);
    END IF;
  END LOOP;
END $$;

-- The §2 required backstop on all four. On the components it is the
-- second line of defence behind `_0_inherit_org`; on chunks it IS the
-- resolution path (owner -> personal org).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'studio_recording_segments',
      'studio_documents',
      'studio_session_settings',
      'studio_recording_chunks']) AS tbl
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
       WHERE tgrelid = format('transcripts.%I', r.tbl)::regclass
         AND tgname = '_stamp_org_default'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER _stamp_org_default BEFORE INSERT ON transcripts.%I '
        'FOR EACH ROW EXECUTE FUNCTION public._stamp_org_default()', r.tbl);
    END IF;
  END LOOP;
END $$;

-- ── 3. NO NULL ORG ──────────────────────────────────────────────────────────

ALTER TABLE transcripts.studio_recording_segments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE transcripts.studio_documents          ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE transcripts.studio_session_settings   ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE transcripts.studio_recording_chunks   ALTER COLUMN organization_id SET NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
