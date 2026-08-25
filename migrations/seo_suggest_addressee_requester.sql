-- =============================================================================
-- A DRAFT YOU ASKED FOR COMES BACK TO YOU  (KI-031, extending KI-034)
-- =============================================================================
-- KI-034 already ruled the principle: "An agent's proposal always goes to the
-- owner of the thing being changed. A person's own proposal goes to that
-- person, provided they may edit the site" — written because an agency
-- employee who corrected a keyword was told to approve it in a queue they
-- could not open.
--
-- KI-031 hit the case that ruling did not anticipate: a person presses "Draft
-- it from my site", an agent writes the draft, and because the row carries
-- agent provenance it is addressed to the SITE OWNER. The person who asked
-- watches nothing appear. Measured live 2026-08-25 on All Green Recycling: the
-- signed-in admin's queue stayed empty while the draft sat in another user's.
-- For a click-and-see-a-draft flow that is fatal, and it is the same defect
-- KI-034 fixed, one step removed.
--
-- So the tool layer may stamp `requestedBy` when a REAL PERSON initiated the
-- run in the product, and such a proposal is addressed to that person as long
-- as they may edit the site. `auth.uid()` is still what decides — the claim in
-- the payload only says "a human asked for this"; it can never redirect a row
-- to a third party, and it can never widen who may act on a site.
--
-- An autonomous run (a nightly sweep, a background classifier) carries no
-- `requestedBy` and still goes to the owner, unchanged.
--
-- Idempotent: CREATE OR REPLACE only. Safe to re-run.
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
-- =============================================================================

-- Patched in place off `pg_get_functiondef` rather than re-pasting a 200-line
-- body: this repo has many concurrent writers, and a full re-paste would
-- silently revert anyone else's edit to a different part of the same function.
do $do$
declare
  v_def text;
  v_new text;
  v_old_branch constant text :=
$snip$  v_addressee := CASE
    WHEN v_by_agent THEN v_site.created_by
    WHEN seo.fn_is_site_editor(p_site_id) THEN v_uid
    ELSE v_site.created_by
  END;$snip$;
  v_new_branch constant text :=
$snip$  -- KI-031: a draft a PERSON asked for in the product comes back to that
  -- person, provided they may edit the site. `auth.uid()` still decides who
  -- that is; `requestedBy` only asserts that a human initiated the run.
  v_addressee := CASE
    WHEN (COALESCE(p_provenance, '{}'::jsonb) ? 'requestedBy')
         AND seo.fn_is_site_editor(p_site_id) THEN v_uid
    WHEN v_by_agent THEN v_site.created_by
    WHEN seo.fn_is_site_editor(p_site_id) THEN v_uid
    ELSE v_site.created_by
  END;$snip$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'seo' and p.proname = 'keyword_meaning_suggest';
  if v_def is null then
    raise exception 'seo.keyword_meaning_suggest does not exist';
  end if;
  if position(v_new_branch in v_def) > 0 then
    raise notice 'requester addressing already present; nothing to do';
    return;
  end if;
  if position(v_old_branch in v_def) = 0 then
    raise exception 'seo.keyword_meaning_suggest addressee branch not found — '
      'the function changed shape; re-derive this patch instead of guessing';
  end if;
  v_new := replace(v_def, v_old_branch, v_new_branch);
  execute v_new;
end
$do$;
