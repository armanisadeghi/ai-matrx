-- chair-step: DOORS-ONLY-5 inverse — UNTEACHES the opt-in anonymous read lane.
--
-- It takes `platform.categories` back off the lane, puts `iam.class_lanes` back to
-- `r.anon_lane := v_class = 'public'`, removes the anonymous grant arm from
-- `iam.apply_table_grants`, and restores the R12 hint's "Three legal fixes" wording. The three
-- registry columns are left in place: dropping a column is destructive and they are inert once
-- nothing reads them.
--
-- 🚨 RUNNING THIS DOES NOT BY ITSELF TAKE THE ANONYMOUS READ AWAY. The thirteen column grants on
-- `platform.categories` are live ACLs; this file does not revoke them (deliberately — see the
-- forward file's note on the four OTHER live anonymous lanes a blanket revoke would reach). What
-- it DOES restore is the state in which `iam.apply_rls` REFUSES `platform.categories` again,
-- because its class emits no anonymous lane while its grant and its rows both say yes. That
-- refusal is the pre-ruling state and it is the point of this inverse.
--
-- Each patch reads the LIVE body and asserts its anchors, so the same bytes work on a database
-- whose generator differs, and a body somebody has since changed refuses rather than being
-- silently overwritten from a stale copy (db-rules line 491).

set local lock_timeout = '2s';

update platform.entity_types
   set client_anonymous_public_read = false,
       client_anonymous_public_read_reason = null,
       client_anonymous_excluded_columns = null
 where schema_name = 'platform' and table_name = 'categories';

do $patch$
declare
  v_src text := pg_get_functiondef('iam.class_lanes'::regproc);
  v_new text;
begin
  if position('client_anonymous_public_read' in v_src) = 0 then
    raise notice 'iam.class_lanes does not carry the opt-in lane — nothing to unteach.';
    return;
  end if;
  v_new := replace(v_src,
    'select et.data_class, et.rls_variant, true, coalesce(et.client_anonymous_public_read, false) into v_class, v_variant, v_found, v_anon_optin',
    'select et.data_class, et.rls_variant, true into v_class, v_variant, v_found');
  v_new := regexp_replace(v_new,
    '  -- 🚨 THE OPT-IN ANONYMOUS LANE.*?r\.anon_lane           := v_class = ''public'' or coalesce\(v_anon_optin, false\);',
    '  r.anon_lane           := v_class = ''public'';', 'ns');
  v_new := replace(v_new, E'  v_anon_optin boolean;\n', '');
  if position('v_anon_optin' in v_new) > 0 then
    raise exception 'iam.class_lanes inverse: v_anon_optin survived the unteach — refusing to install a body that references an undeclared variable.'
      using errcode = '22023';
  end if;
  execute v_new;
  raise notice 'iam.class_lanes: the opt-in anonymous lane is unteached.';
end
$patch$;

do $patch$
declare
  v_src text := pg_get_functiondef('iam.apply_table_grants'::regproc);
  v_new text;
begin
  if position('client_anonymous_public_read' in v_src) = 0 then
    raise notice 'iam.apply_table_grants does not carry the anonymous grant arm — nothing to unteach.';
    return;
  end if;
  -- POSITION-BASED, NOT A REGEX. The forward patch inserted a block between a marker comment and
  -- the `service_role` anchor; cutting between those two positions removes exactly what it added
  -- whatever the whitespace looks like, and a regex that nearly matches is how a half-removed
  -- body gets installed. (The first draft of this file used one and it did not match.)
  declare
    v_start int := position('  -- 🚨 THE OPT-IN ANONYMOUS READ LANE''S KEY' in v_src);
    v_anchor constant text := '  -- service_role is the server''s bypass lane and always needs full reach.';
    v_end int;
  begin
    v_end := position(v_anchor in v_src);
    if v_start = 0 or v_end = 0 or v_end <= v_start then
      raise exception 'iam.apply_table_grants inverse: could not locate the block to remove (start %, anchor %) — the body has moved.', v_start, v_end
        using errcode = '22023';
    end if;
    v_new := left(v_src, v_start - 1) || substr(v_src, v_end);
  end;
  if position('client_anonymous_public_read' in v_new) > 0 then
    raise exception 'iam.apply_table_grants inverse: the anonymous grant arm did not come out cleanly — refusing to install a half-removed body.'
      using errcode = '22023';
  end if;
  execute v_new;
  raise notice 'iam.apply_table_grants: the opt-in anonymous grant is unteached.';
end
$patch$;

do $patch$
declare
  v_src text := pg_get_functiondef('iam.apply_rls'::regproc);
  v_new text;
begin
  if position('FOUR legal fixes' in v_src) = 0 then
    raise notice 'iam.apply_rls does not name the fourth fix — nothing to unteach.';
    return;
  end if;
  v_new := regexp_replace(v_src,
    'HINT = ''FOUR legal fixes\. \(0\).*?\(chair ruling 2026-09-22\)\. ',
    'HINT = ''Three legal fixes. ', 'ns');
  if position('FOUR legal fixes' in v_new) > 0 then
    raise exception 'iam.apply_rls inverse: the fourth-fix hint did not come out cleanly.'
      using errcode = '22023';
  end if;
  execute v_new;
  raise notice 'iam.apply_rls: the R12 hint is back to three.';
end
$patch$;
