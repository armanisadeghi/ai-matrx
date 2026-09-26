-- chair-step: inverse of rcstore_n_trash_is_the_owners_alone.sql. It removes only the RC-A1 trash narrowing from the current RC-A2h/AEI/read-lane-v2 bodies, re-records their kernel fingerprint, regenerates content.document, then drops the two RC-A1 helper declarations.
-- No based-on hash appears here deliberately: this inverse executes only after its paired up leg,
-- and every removal below is anchor-counted against that exact merged body. A stale or unrelated
-- body is refused before any replacement executes.
set local lock_timeout = '2s';

DO $undo$
DECLARE
  v_def text; v_n integer;
  v_trash_base constant text := $a$
  -- RC-A1 trash rule (platform.trash_hides).
  v_trash_del timestamptz; v_trash_owner uuid;$a$;
  v_trash_kernel constant text := $a$
    -- 🚨 RC-A1 (2026-09-25, chair ruling: Google Drive behaviour) — A TRASHED RECORD IS ITS
    -- OWNER'S ALONE. For a token that declares it (platform.trash_is_owner_only), a row in its
    -- owner's trash grants nothing to anyone else at any level and carries nothing to its
    -- containers; restore gives every lane back. ONE rule, platform.trash_hides, asked here, by
    -- iam.accessible_entity_ids (set-wise) and by iam.entity_read_expr (the table read policy).
    -- The platform admin lane reads through platform_admin_read and is untouched.
    if platform.trash_is_owner_only(v_type) then
      v_trash_del := null; v_trash_owner := null;
      execute format('select deleted_at, created_by from %I.%I where id = $1', v_schema, v_table)
        into v_trash_del, v_trash_owner using v_id;
      continue walk when platform.trash_hides(v_type, v_trash_del, v_trash_owner, v_uid);
    end if;
$a$;
  v_trash_set constant text := $a$
  -- 🚨 RC-A1 (2026-09-25): the kernel's trash rule, set-wise — a row in its owner's trash is in
  -- nobody else's set (platform.trash_hides; declared by platform.trash_is_owner_only).
  if platform.trash_is_owner_only(p_type) and coalesce(array_length(v_ids, 1), 0) > 0 then
    execute format('select coalesce(array_agg(t.id), ''{}'') from %s t where t.id = any($1) '
                   'and not platform.trash_hides($2, t.deleted_at, t.created_by, $3)', v_tbl)
      into v_more using v_ids, p_type, v_uid;
    v_ids := coalesce(v_more, '{}'::uuid[]);
  end if;
$a$;
  v_trash_expr constant text := $a$
  -- 🚨 RC-A1 (2026-09-25, chair ruling: Google Drive behaviour): for a token that declares it
  -- (platform.trash_is_owner_only) every arm above is ANDed with the kernel's trash rule, so a
  -- row in its owner's trash is read by its owner only. platform_admin_read is a separate
  -- policy and keeps reading every row.
  if platform.trash_is_owner_only(p_token) and v_owner_col is not null
     and exists (select 1 from information_schema.columns c
                  where c.table_schema = p_schema and c.table_name = p_table and c.column_name = 'deleted_at') then
    v_expr := format('(%s) and not platform.trash_hides(%L, deleted_at, %I, (select auth.uid()))',
                     v_expr, p_token, v_owner_col);
  end if;
$a$;
BEGIN
  v_def := pg_get_functiondef('iam.has_access_for_base(uuid,text,uuid,permission_level,boolean,text[])'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, v_trash_base, ''))) / length(v_trash_base);
  IF v_n <> 1 THEN RAISE EXCEPTION 'rcstore-n inverse: trash declaration occurs % time(s), expected 1', v_n; END IF;
  v_n := (length(v_def) - length(replace(v_def, v_trash_kernel, ''))) / length(v_trash_kernel);
  IF v_n <> 1 THEN RAISE EXCEPTION 'rcstore-n inverse: kernel trash guard occurs % time(s), expected 1', v_n; END IF;
  EXECUTE replace(replace(v_def, v_trash_base, ''), v_trash_kernel, '');
  v_def := pg_get_functiondef('iam.accessible_entity_ids(text,permission_level,integer,boolean)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, v_trash_set, ''))) / length(v_trash_set);
  IF v_n <> 1 THEN RAISE EXCEPTION 'rcstore-n inverse: set-form trash guard occurs % time(s), expected 1', v_n; END IF;
  EXECUTE replace(v_def, v_trash_set, '');
  v_def := pg_get_functiondef('iam.entity_read_expr(text,text,text,text)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, v_trash_expr, ''))) / length(v_trash_expr);
  IF v_n <> 1 THEN RAISE EXCEPTION 'rcstore-n inverse: read-expression trash guard occurs % time(s), expected 1', v_n; END IF;
  EXECUTE replace(v_def, v_trash_expr, '');
END
$undo$;

DO $rerecord$
DECLARE
  v_fp text := iam.entity_read_kernel_fingerprint();
  v_members jsonb := iam.entity_read_kernel_members_live();
  v_before jsonb := iam.entity_read_kernel_members_expected()->'members';
  v_added text[]; v_removed text[]; v_changed text[];
BEGIN
  SELECT coalesce(array_agg(k ORDER BY k), '{}'::text[]) INTO v_added FROM jsonb_object_keys(v_members) AS k WHERE NOT v_before ? k;
  SELECT coalesce(array_agg(k ORDER BY k), '{}'::text[]) INTO v_removed FROM jsonb_object_keys(v_before) AS k WHERE NOT v_members ? k;
  SELECT coalesce(array_agg(k ORDER BY k), '{}'::text[]) INTO v_changed FROM jsonb_object_keys(v_members) AS k WHERE v_before ? k AND (v_before->>k) IS DISTINCT FROM (v_members->>k);
  IF cardinality(v_added) <> 0 OR cardinality(v_removed) <> 0 OR v_changed <> ARRAY[
    'iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer, p_include_public boolean)',
    'iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean, p_path text[])'
  ] THEN RAISE EXCEPTION 'rcstore-n inverse: refusing unrelated kernel drift (added %, removed %, changed %)', v_added, v_removed, v_changed; END IF;
  EXECUTE 'CREATE' || ' OR REPLACE FUNCTION iam.entity_read_kernel_expected() RETURNS text LANGUAGE sql IMMUTABLE AS $f$ SELECT ' || quote_literal(v_fp) || '::text $f$';
  EXECUTE 'CREATE' || ' OR REPLACE FUNCTION iam.entity_read_kernel_members_expected() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$ SELECT ' || quote_literal(jsonb_build_object('fingerprint', v_fp, 'members', v_members)::text) || '::jsonb $f$';
  IF iam.entity_read_kernel_fingerprint() IS DISTINCT FROM iam.entity_read_kernel_expected()
     OR (iam.entity_read_kernel_members_expected()->'members') IS DISTINCT FROM iam.entity_read_kernel_members_live()
     OR (iam.entity_read_kernel_members_expected()->>'fingerprint') IS DISTINCT FROM iam.entity_read_kernel_expected()
  THEN RAISE EXCEPTION 'rcstore-n inverse: kernel fingerprint re-record did not match the live kernel'; END IF;
END
$rerecord$;

select iam.apply_rls('content', 'document', 'document', 'entity');
drop function platform.trash_hides(text, timestamptz, uuid, uuid);
drop function platform.trash_is_owner_only(text);
