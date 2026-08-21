-- FINISH THE CLASS — drop the last two illegal component `visibility` columns.
--
-- Sibling of `migrations/plan_node_components_drop_illegal_visibility.sql`
-- (2026-08-21, same day). That migration cleared `plan.node_artifact` and
-- `plan.node_step`, two of the FOUR stray-visibility components the db-rules
-- historical note counts. These are the other two. After this file, the class
-- is EMPTY — zero active components carry a `visibility` column.
--
-- THE RULE. db-rules §6d-1 THE COMPONENT OWNERSHIP LAW: a component has NO owner
-- column, NO own visibility, and its access IS its parent's.
-- `platform.create_entity_table` refuses `p_visibility <> 'none'` on a component
-- for exactly this reason — a component's access is already fully determined by
-- its parent, so a `visibility` column is a second competing authority.
--
-- ============================================================================
-- THE GATE NOW DEMANDS THIS — IT DID NOT THIS MORNING
-- ============================================================================
-- When the plan pair was cleared earlier today, `iam.verify_canonical` reported
-- `visibility PASS` on a component holding the illegal column, and both tokens
-- returned `canonical_certify_ok = true`. That gap was closed hours later by
-- `aidream/db/migrations/wf_036_verify_canonical_per_variant_base_contract.sql`,
-- and the check now says, in its own words:
--
--   visibility  WARN  "component carries a stray visibility column — its RLS
--                      lane never reads it (§6d-1/§6d-2); a second competing
--                      access authority, file the removal"
--
-- `iam.canonical_certify` counts WARN as a finding, so both tables below are
-- currently UNCERTIFIABLE and each fails on this and nothing else. This
-- migration is that WARN's instruction, executed.
--
-- ============================================================================
-- THE VARIANT IS CORRECT ON BOTH — CHECKED BEFORE THE DROP, NOT ASSUMED
-- ============================================================================
-- §6d-1's corollary is that a sub-row needing its own owner with independent
-- access is NOT a component, so dropping `visibility` off a mis-classified
-- entity would be the real defect. Verified live 2026-08-21:
--
--   crm.contact_candidate
--     composition parent: `party` via `party_id` (NOT NULL), noted in the
--     registry as "access derives from the party the candidate was found for".
--     A contact candidate is a proposed contact point discovered FOR a party;
--     it has no meaning and no audience apart from that party.
--   seo.backlink_change_event
--     TWO composition parents: `seo_backlink` via `backlink_id` and `web_site`
--     via `site_id` (both NOT NULL) — "the backlink it happened to" and "the
--     site whose profile it belongs to". A change event is an observation about
--     a backlink; nobody addresses one without the backlink or the site.
--
-- Both already carry canonical component policies — the parent-set form
-- (`party_id IN (SELECT unnest(iam.accessible_entity_ids('party', …)))`, and the
-- two-parent OR for the seo table) — and NEITHER mentions `created_by`. Neither
-- has a `pub_read` or any other anon policy, so the column has never been able
-- to expose a row to `anon`; dropping it removes no anon lane because none
-- exists.
--
-- ============================================================================
-- CONSUMER SWEEP — ZERO READERS (both repos + matrx-extend/matrx-local)
-- ============================================================================
-- Swept every reference to either table (~44 files), then `visibility` within
-- each hit. Everything that matched is one of three harmless things:
--
--   1. GENERATED surfaces — `db/models/crm.py`, `db/managers/crm/
--      contact_candidate.py`, `db/helpers/auto_config_crm.py`,
--      `packages/matrx-seo/matrx_seo/db/models_seo.py`,
--      `matrx-frontend/types/database.types.ts`. The
--      `load_/filter_contact_candidates_by_visibility` helpers exist only
--      because the column does and have ZERO call sites anywhere (grepped);
--      they disappear on the regen in this commit.
--   2. A DIFFERENT TABLE'S visibility. `services/seo/backlink_change_watch.py`
--      and `services/outcome_attribution/service.py` do write
--      `"visibility": "personal"` — on the ASSIST CHIP row they insert, which
--      merely REFERENCES `entity_type='seo_backlink_change_event'`. They never
--      write the change event's own column. Likewise
--      `features/crm/outcomes/lib.test.ts` builds an `OutcomeEventRow`
--      (`platform.outcome_event`), not either of these.
--   3. A DIFFERENT CONCEPT ENTIRELY — the ~20 `ai-visibility` hits are the SEO
--      AI-visibility feature (`seo.ai_visibility_panel` et al), unrelated to the
--      `platform.visibility` enum.
--
--   Not one behavioural consumer. Nothing branches on either column's value.
--
-- NO INFORMATION IS LOST. Live census before this ran: `crm.contact_candidate`
-- 0 rows; `seo.backlink_change_event` 3,942 rows, EVERY ONE `internal` — the
-- column default, never once overridden. The column holds one constant, so
-- dropping it destroys no distinction that was ever drawn.
--
-- `entity_types.default_visibility` goes NULL on both, matching what 151 of the
-- live components carry and what `create_entity_table(p_visibility => 'none')`
-- writes.
--
-- DRY-RUN FIRST. The whole migration was executed in a rolled-back transaction
-- on the session-mode pooler before this file was written: both tokens came out
-- `canonical_certify_ok = true` with `iam.canonical_certify` returning ZERO
-- findings, and both kept exactly their five policies (std_select/insert/update/
-- delete + svc_all, no pub_read, since there is no visibility column to gate
-- one). The assertions below re-prove that in the real transaction.
--
-- Idempotent: DROP COLUMN IF EXISTS + regenerate + assert.

BEGIN;

ALTER TABLE crm.contact_candidate      DROP COLUMN IF EXISTS visibility;
ALTER TABLE seo.backlink_change_event  DROP COLUMN IF EXISTS visibility;

UPDATE platform.entity_types
   SET default_visibility = NULL
 WHERE token IN ('crm_contact_candidate', 'seo_backlink_change_event');

SELECT iam.apply_rls('crm', 'contact_candidate',     'crm_contact_candidate',     'component');
SELECT iam.apply_rls('seo', 'backlink_change_event', 'seo_backlink_change_event', 'component');

DO $$
DECLARE
  r record;
  v_findings text;
  v_stray int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('crm','contact_candidate','crm_contact_candidate'),
      ('seo','backlink_change_event','seo_backlink_change_event')
    ) AS v(s,t,tok)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = r.s AND table_name = r.t
                  AND column_name = 'visibility') THEN
      RAISE EXCEPTION 'visibility column survived the drop on %.%', r.s, r.t;
    END IF;

    SELECT string_agg(status || ' ' || detail, '; ')
      INTO v_findings
      FROM iam.canonical_certify(r.s, r.t, r.tok);
    IF v_findings IS NOT NULL THEN
      RAISE EXCEPTION '% does not certify after the drop: %', r.tok, v_findings;
    END IF;
  END LOOP;

  -- THE CLASS IS CLOSED. Assert it globally, not just for these two, so this
  -- file fails loudly if a fifth stray-visibility component exists anywhere.
  SELECT count(*) INTO v_stray
    FROM platform.entity_types e
    JOIN information_schema.columns c
      ON c.table_schema = e.schema_name
     AND c.table_name = e.table_name
     AND c.column_name = 'visibility'
   WHERE e.rls_variant = 'component' AND e.is_active;

  IF v_stray <> 0 THEN
    RAISE EXCEPTION
      'expected ZERO active components carrying a visibility column, found % — §6d-1 class is not closed',
      v_stray;
  END IF;
END $$;

COMMIT;
