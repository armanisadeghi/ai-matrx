-- =============================================================================
-- BUSINESS DISCOVERY STEP 6 PROPOSES OFFERINGS INTO THE ONE QUEUE  (KI-040)
-- =============================================================================
-- The Business Discovery Ladder reads a site cold and, in steps 4 and 5, names
-- the site's Offerings and proposes each one's worth in POINTS from the 100
-- baseline (KI-001; cutover ruling D9 keeps worth as points). Step 6
-- (`proposed_setup`, aidream `services/seo/business_discovery.py`) turns those
-- results into proposals a person accepts or rejects, one by one or all at
-- once — never a write.
--
-- An Offering is a new SHAPE of proposal, so `seo.keyword_meaning_suggest` —
-- the ONE ledger writer for keyword-system proposals — learns a fifth kind,
-- `offering`, and validates it:
--   name           required, trimmed
--   offeringKind   'product' | 'service' (the only kinds `web.brand_offering` holds)
--   valueAdd       a number of points, or null when step 5 did not value it
--   description, aliases   carried as proposed
--
-- Everything else is unchanged and shared with the other four kinds: the
-- addressee rule (KI-034 / KI-031 `requestedBy`), the payload-hash dedupe, and
-- the refusal to re-propose anything a human already decided. The mode-3
-- timeout applier (`seo.fn_autonomy_apply_timed_out`) replays stamps only and
-- leaves every other kind pending, so an offering can never auto-apply.
--
-- Approving an offering writes nothing until the brand-offering writers land
-- (brand-offerings cutover, step 6). The queue says so on the row.
--
-- Patched in place off `pg_get_functiondef` so a concurrent edit elsewhere in
-- this function is not reverted; the based-on line below makes `db:apply`
-- refuse the file if the body moved since it was written.
-- Idempotent: a re-run finds the patch already present and changes nothing.
-- SoR: common-docs/systems/marketing/seo/seo-keywords/REGISTER.md KI-040
-- =============================================================================

-- based-on: seo.keyword_meaning_suggest(uuid, jsonb, text, text, text, real, jsonb, jsonb) a8b7fda503b59d16da5499ac696036ac170e67e7cfa42e528b5e2fbd0ea438b6

do $do$
declare
  v_def text := pg_get_functiondef(
    'seo.keyword_meaning_suggest(uuid, jsonb, text, text, text, real, jsonb, jsonb)'::regprocedure
  );
  v_old_kinds constant text := $s$v_kind NOT IN ('matcher','worth','stamp','guideline_edit')$s$;
  v_new_kinds constant text := $s$v_kind NOT IN ('matcher','worth','stamp','guideline_edit','offering')$s$;
  v_old_msg constant text := $s$proposal must be matcher | worth | stamp | guideline_edit (got %)$s$;
  v_new_msg constant text := $s$proposal must be matcher | worth | stamp | guideline_edit | offering (got %)$s$;
  v_anchor constant text := $s$  v_hash   := md5(v_p::text);$s$;
  v_offering_branch constant text := $s$  -- KI-040 step 6: an Offering the Business Discovery Ladder proposes.
  IF v_kind = 'offering' THEN
    IF NULLIF(btrim(COALESCE(v_p ->> 'name','')),'') IS NULL THEN
      RAISE EXCEPTION 'seo_suggest_offering_name_required: name the offering';
    END IF;
    IF COALESCE(v_p ->> 'offeringKind','') NOT IN ('product','service') THEN
      RAISE EXCEPTION 'seo_suggest_offering_kind: an offering is a product or a service (got %)', COALESCE(v_p ->> 'offeringKind','null');
    END IF;
    IF (v_p ? 'valueAdd') AND jsonb_typeof(v_p -> 'valueAdd') NOT IN ('number','null') THEN
      RAISE EXCEPTION 'seo_suggest_offering_value: valueAdd is a number of points or null';
    END IF;
    v_p := v_p || jsonb_build_object('name', btrim(v_p ->> 'name'));
  END IF;

$s$;
begin
  if position(v_new_kinds in v_def) > 0 then
    raise notice 'seo.keyword_meaning_suggest already accepts offering proposals; nothing to do';
    return;
  end if;
  if position(v_old_kinds in v_def) = 0
     or position(v_old_msg in v_def) = 0
     or position(v_anchor in v_def) = 0 then
    raise exception 'seo.keyword_meaning_suggest no longer has the shape this patch was written against; regenerate it from pg_get_functiondef';
  end if;
  v_def := replace(v_def, v_old_kinds, v_new_kinds);
  v_def := replace(v_def, v_old_msg, v_new_msg);
  v_def := replace(v_def, v_anchor, v_offering_branch || v_anchor);
  execute v_def;
end
$do$;
