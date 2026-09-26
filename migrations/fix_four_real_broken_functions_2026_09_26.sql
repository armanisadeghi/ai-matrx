-- based-on: public.update_canvas_comment_count() 78eecc3772eb048d11276b85480ed122eb024981f6699cd9dd23b24d1b8532cc
-- based-on: custom.booking_declare(uuid, uuid, text, jsonb, jsonb, jsonb, integer, uuid, uuid, uuid, text, uuid) e13b37204517a074fad3c93306f7295e227e32ba95b74e087673e881c1069e49
-- based-on: custom.inbound_mail_map(uuid, uuid, jsonb) dfb8d3a4ee51302ebe95cb354182f61a88ff85dc89410556703786f7eef200c4
-- based-on: public.org_preferences_set(uuid, jsonb) b13ce3635bf1950c5583580070fae5edf6f091be2810aa857b2622fc87d42fda
-- fix_four_real_broken_functions_2026_09_26.sql
--
-- The four genuine bugs left in audit.broken_functions after the classifier
-- stopped counting extension code and trigger transition tables
-- (audit_classifier_extension_owned_and_transition_tables.sql). Body-only edits:
-- every signature, owner, SECURITY mode and ACL is unchanged (CREATE OR REPLACE
-- keeps privileges; the two SECURITY DEFINER functions already carry their
-- platform.client_callable_door rows). Each edit is a literal substring replace
-- on the live body, and ASSERTS the exact number of occurrences it expected, so
-- a body that moved underneath this file is refused rather than half-edited.
--
-- 1. public.org_preferences_set — EVERY call failed 42703: aidream migration
--    1071 dropped iam.organization_preferences.auto_index_non_pdf but this RPC
--    still SET and returned it. Called by the org settings writes in
--    features/organizations/hooks/useOrgAutoRagPreference.ts. No code in either
--    repo reads the removed key.
-- 2. custom.inbound_mail_map — `text[] || … || '__sender'` parses the trailing
--    untyped literal as an ARRAY literal → 22P02; inbound_mail_land swallows it
--    and files the email as rejected. Called for nearly every inbound email.
-- 3. custom.booking_declare — same 22P02 class on `|| 'booked'` / `|| 'cancelled'`
--    (the earlier offenders in the same body were fixed 2026-09-21).
-- 4. public.update_canvas_comment_count — trigger on canvas.canvas_comments read
--    NEW/OLD.deleted; the column is deleted_at. Table has 0 rows, so the first
--    comment would have failed.

do $fix$
declare
  v_oid  regprocedure;
  v_def  text;
  v_old  text;
  v_new  text;
  v_n    integer;

  -- replace p_old with p_new in v_def, asserting exactly p_expect occurrences
begin
  ---------------------------------------------------------------- 1
  v_oid := 'public.org_preferences_set(uuid,jsonb)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);

  v_old := E'         auto_index_non_pdf = case when p_patch ? ''auto_index_non_pdf'' then (p_patch ->> ''auto_index_non_pdf'')::boolean else p.auto_index_non_pdf end,\n';
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'org_preferences_set: SET line found % times, expected 1', v_n; end if;
  v_def := replace(v_def, v_old, '');

  v_old := E'    ''auto_index_non_pdf'', v_row.auto_index_non_pdf,\n';
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'org_preferences_set: return key found % times, expected 1', v_n; end if;
  v_def := replace(v_def, v_old, '');

  if v_def ~ 'auto_index_non_pdf' then
    raise exception 'org_preferences_set: auto_index_non_pdf still present after edit';
  end if;
  execute v_def;

  ---------------------------------------------------------------- 2
  v_oid := 'custom.inbound_mail_map(uuid,uuid,jsonb)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);

  v_old := $s$|| '__sender';$s$; v_new := $s$|| '__sender'::text;$s$;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 2 then raise exception 'inbound_mail_map: __sender append found % times, expected 2', v_n; end if;
  v_def := replace(v_def, v_old, v_new);

  v_old := $s$|| '__body';$s$; v_new := $s$|| '__body'::text;$s$;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'inbound_mail_map: __body append found % times, expected 1', v_n; end if;
  v_def := replace(v_def, v_old, v_new);
  execute v_def;

  ---------------------------------------------------------------- 3
  v_oid := 'custom.booking_declare(uuid,uuid,text,jsonb,jsonb,jsonb,integer,uuid,uuid,uuid,text,uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);

  v_old := $s$v_missing := v_missing || 'booked';$s$; v_new := $s$v_missing := v_missing || 'booked'::text;$s$;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'booking_declare: booked append found % times, expected 1', v_n; end if;
  v_def := replace(v_def, v_old, v_new);

  v_old := $s$v_missing := v_missing || 'cancelled';$s$; v_new := $s$v_missing := v_missing || 'cancelled'::text;$s$;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'booking_declare: cancelled append found % times, expected 1', v_n; end if;
  v_def := replace(v_def, v_old, v_new);
  execute v_def;

  ---------------------------------------------------------------- 4
  v_oid := 'public.update_canvas_comment_count()'::regprocedure;
  v_def := pg_get_functiondef(v_oid);

  v_old := $s$TG_OP = 'INSERT' AND NEW.deleted = false THEN$s$;
  v_new := $s$TG_OP = 'INSERT' AND NEW.deleted_at IS NULL THEN$s$;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'update_canvas_comment_count: INSERT branch found % times, expected 1', v_n; end if;
  v_def := replace(v_def, v_old, v_new);

  v_old := $s$TG_OP = 'UPDATE' AND OLD.deleted = false AND NEW.deleted = true THEN$s$;
  v_new := $s$TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN$s$;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'update_canvas_comment_count: UPDATE branch found % times, expected 1', v_n; end if;
  v_def := replace(v_def, v_old, v_new);
  execute v_def;
end $fix$;

select audit.refresh();

-- Proof: none of the four is left with a `real` finding, and grants are intact.
do $assert$
declare v_left text;
begin
  select string_agg(distinct signature, ', ') into v_left
  from audit.broken_functions
  where severity = 'real'
    and signature in (
      'public.org_preferences_set(uuid,jsonb)',
      'custom.inbound_mail_map(uuid,uuid,jsonb)',
      'custom.booking_declare(uuid,uuid,text,jsonb,jsonb,jsonb,integer,uuid,uuid,uuid,text,uuid)',
      'public.update_canvas_comment_count()');
  if v_left is not null then
    raise exception 'still reported real after the fix: %', v_left;
  end if;

  if not has_function_privilege('authenticated', 'public.org_preferences_set(uuid,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'custom.booking_declare(uuid,uuid,text,jsonb,jsonb,jsonb,integer,uuid,uuid,uuid,text,uuid)', 'execute') then
    raise exception 'a client grant was lost on a replaced function';
  end if;
end $assert$;
