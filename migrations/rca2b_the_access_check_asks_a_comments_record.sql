-- rca2b_the_access_check_asks_a_comments_record
-- based-on: iam.has_access_for_base(uuid, text, uuid, permission_level, boolean, text[]) 8103c7a557dbdfd7aa77fe396fe2064825398ea38d97c0baf220142f2d6c7b3d
-- based-on: iam.accessible_entity_ids(text, permission_level, integer, boolean) d6e86f86eab095f306cbde9165db0c73a4b33dcb12a1dc3ba88fba935afab4ac
-- based-on: public.cmt_add(text, uuid, text, uuid, uuid) 80b8435586172e7a5b92c83432aaf715ce53ede14abc7a521706142e3216ed03
-- based-on: iam._apply_rls_unchecked(text, text, text, text) 35417f8b37c06f0338cc2c80e14911310bf2747745eb022e4515e1766776f0ba
--
-- RC-A2, round 2 (rich-content STORE-DESIGN §3.8; register row RC-A2; findings F1–F4 of
-- common-docs/projects/rich-content-unification/evidence/verify-RC-A2.md).
--
-- THE DEFECT, measured live 2026-09-25 (rolled back): asked about a comment ITSELF (token
-- `comment`), iam.has_access never looked at the record the comment is on. The generator's detail
-- lane (rca2_comments_follow_the_parent.sql) taught the TABLE policy to ask the parent, but the
-- KERNEL still resolved `comment` like any organization-class entity — from the comment row's own
-- `visibility` ('internal' on every row) and organization membership. So a plain member who cannot
-- open a colleague's personal note held viewer, commenter AND editor on the comments written on
-- it, and every door that takes (token, id) handed that over: version_list / version_snapshot
-- returned the comment's text and version_restore rewrote it. 22 of 28 live comments were
-- readable that way by 3–4 members each. The set form (iam.accessible_entity_ids) listed the same
-- ids. F3: cmt_add('comment', <id>) filed a comment ON a comment. F4: the table's read policy did
-- not hide soft-deleted comments, so the table and the realtime feed still carried deleted text.
--
-- THE CLASS FIX. A `detail` (platform.entity_types.rls_variant = 'detail') names its record with
-- (entity_type, entity_id), and its access IS that record's, everywhere the kernel is asked:
--   viewer / commenter — the same level on the record;
--   editor             — the author, still holding commenter on the record (edit, restore);
--   admin              — the author as above, or admin on the record (delete — cmt_delete's rule);
--   a soft-deleted detail answers to its author only; a detail never sits on a detail.
-- No own-visibility lane, no organization lane, no grant on the comment itself, no library lane:
-- the record's own resolution already carries every lane it has (DD-136's wall, inherited).
--   1. iam.has_access_for_base — the kernel learns the detail branch.
--   2. iam.accessible_entity_ids — the set form asks the kernel per row for a detail, so the two
--      forms cannot disagree (one answer, one place).
--   3. public.cmt_add — a comment on a comment is refused by type, before any lookup (no oracle).
--   4. iam._apply_rls_unchecked — the detail read lane hides soft-deleted rows from everyone but
--      their author (the realtime feed is authorized by the same policy), and the table is
--      regenerated through the generator. platform_admin_read is untouched: the generator emits it
--      exactly as before, so the admin app still reads every row, deleted ones included.
-- Every door that takes (token, id) — version_*, entity_titles, entity_soft_delete/undelete,
-- get_resource_access, set_entity_scopes, may_manage_sharing — asks the kernel, so each is fixed
-- by item 1 and proven by the suite below; the ues_* doors store only the caller's own ids.
--
-- Forcing suite: aidream db/tests/test_rca2b_comment_follows_its_record.py
--   (RCA2B_BEFORE=1 = today's bodies, red; default = with this file, green; RCA2B_WITH_RCB11=1 =
--   the queued RC-B11 doors on top, still green).
-- Inverse (rule 27 rehearsal only — it restores the leak): migrations/inverse/rca2b_the_access_check_asks_a_comments_record_down.sql

set local lock_timeout = '2s';

do $patch$
declare
  v_def text;
  v_n int;
  r record;
begin
  for r in
    select * from (values
      -- 1a. the kernel's per-node locals
      (1, 'iam.has_access_for_base(uuid,text,uuid,permission_level,boolean,text[])',
       E'  v_type text; v_id uuid; v_pub boolean; v_key text;\n',
       E'  v_type text; v_id uuid; v_pub boolean; v_key text;\n'
       || E'  -- RC-A2b: a detail answers to the record it is on (see the branch below).\n'
       || E'  v_variant text; v_detail jsonb; v_detail_type text; v_detail_id uuid; v_detail_author uuid;\n'),
      -- 1b. the kernel's detail branch, right after the node's registry row is read
      (2, 'iam.has_access_for_base(uuid,text,uuid,permission_level,boolean,text[])',
       E'    select et.schema_name, et.table_name into v_schema, v_table\n'
       || E'    from platform.entity_types et where et.token = v_type and et.is_active;\n'
       || E'    continue walk when v_schema is null;\n',
       E'    select et.schema_name, et.table_name, et.rls_variant into v_schema, v_table, v_variant\n'
       || E'    from platform.entity_types et where et.token = v_type and et.is_active;\n'
       || E'    continue walk when v_schema is null;\n'
       || E'    -- 🚨 RC-A2b (2026-09-25) — A DETAIL ANSWERS TO THE RECORD IT IS ON, AND TO NOTHING ELSE.\n'
       || E'    -- A `detail` (platform.comments) names its record with (entity_type, entity_id). Until this\n'
       || E'    -- branch the kernel resolved a detail''s OWN token like any organization-class entity: from\n'
       || E'    -- the row''s own visibility (''internal'' on every comment) plus organization membership, so a\n'
       || E'    -- plain member who could not open a colleague''s personal note held viewer, commenter AND\n'
       || E'    -- editor on its comments, and version_list / version_snapshot / version_restore(''comment'', …)\n'
       || E'    -- read and rewrote them (verify-RC-A2 F1/F2; 22 of 28 live comments exposed). The table\n'
       || E'    -- policy already asked the record; now every door that asks about the comment does too.\n'
       || E'    --   viewer / commenter  the same level on the record\n'
       || E'    --   editor              the author, still holding commenter on the record\n'
       || E'    --   admin               the author as above, or admin on the record (cmt_delete''s rule)\n'
       || E'    -- A soft-deleted detail answers to its author only; a detail never sits on a detail (a\n'
       || E'    -- reply goes through the record''s thread). No lane below this branch is consulted: no own\n'
       || E'    -- visibility, no organization lane, no grant on the comment itself — the record''s own\n'
       || E'    -- resolution already carries every lane it has. Guard: aidream\n'
       || E'    -- db/tests/test_rca2b_comment_follows_its_record.py.\n'
       || E'    if v_variant = ''detail'' then\n'
       || E'      v_detail := null;\n'
       || E'      execute format(''select to_jsonb(t) from %I.%I t where t.id = $1'', v_schema, v_table)\n'
       || E'        into v_detail using v_id;\n'
       || E'      continue walk when v_detail is null;\n'
       || E'      v_detail_type := v_detail ->> ''entity_type'';\n'
       || E'      v_detail_id := (v_detail ->> ''entity_id'')::uuid;\n'
       || E'      v_detail_author := (v_detail ->> ''created_by'')::uuid;\n'
       || E'      continue walk when v_detail_type is null or v_detail_id is null;\n'
       || E'      continue walk when exists (select 1 from platform.entity_types pet\n'
       || E'                                  where pet.token = v_detail_type and pet.rls_variant = ''detail'');\n'
       || E'      continue walk when v_detail ->> ''deleted_at'' is not null\n'
       || E'                     and v_detail_author is distinct from v_uid;\n'
       || E'      if p_required <= ''commenter''::public.permission_level then\n'
       || E'        if iam.has_access_for(v_uid, v_detail_type, v_detail_id, p_required) then return true; end if;\n'
       || E'      else\n'
       || E'        if v_detail_author = v_uid\n'
       || E'           and iam.has_access_for(v_uid, v_detail_type, v_detail_id, ''commenter''::public.permission_level)\n'
       || E'        then return true; end if;\n'
       || E'        if p_required >= ''admin''::public.permission_level\n'
       || E'           and iam.has_access_for(v_uid, v_detail_type, v_detail_id, ''admin''::public.permission_level)\n'
       || E'        then return true; end if;\n'
       || E'      end if;\n'
       || E'      continue walk;\n'
       || E'    end if;\n'),
      -- 2. the set form asks the kernel, per row, for a detail
      (3, 'iam.accessible_entity_ids(text,permission_level,integer,boolean)',
       E'  if v_schema is null then return ''{}''::uuid[]; end if;\n',
       E'  if v_schema is null then return ''{}''::uuid[]; end if;\n'
       || E'  -- 🚨 RC-A2b (2026-09-25) — A DETAIL''S SET IS WHAT THE KERNEL SAYS, ROW BY ROW. The trusted\n'
       || E'  -- arms below read a row''s own visibility and organization, which is exactly the answer a\n'
       || E'  -- detail (platform.comments) must never get: it listed comments on colleagues'' personal notes\n'
       || E'  -- to every member. A detail''s access is its record''s, which only the kernel resolves, so the\n'
       || E'  -- set form asks it per row and cannot disagree with it. Cost: one kernel call per detail row;\n'
       || E'  -- every client read of a detail goes through a door already filtered to one record.\n'
       || E'  if exists (select 1 from platform.entity_types et\n'
       || E'              where et.token = p_type and et.is_active and et.rls_variant = ''detail'') then\n'
       || E'    execute format(''select coalesce(array_agg(t.id), ''''{}'''') from %I.%I t ''\n'
       || E'                   ''where iam.has_access_for_base($1, $2, t.id, $3, $4)'', v_schema, v_table)\n'
       || E'      into v_ids using v_uid, p_type, p_required, p_include_public;\n'
       || E'    return coalesce(v_ids, ''{}''::uuid[]);\n'
       || E'  end if;\n'),
      -- 3. a comment is never the record a comment is on (F3)
      (4, 'public.cmt_add(text,uuid,text,uuid,uuid)',
       E'begin\n  -- Deny before resolving organization or looking up the row.',
       E'begin\n'
       || E'  -- 🚨 RC-A2b (2026-09-25): a comment is never the record a comment is on. A reply goes through\n'
       || E'  -- the record''s own thread (p_parent_id). Refused by TYPE, before any lookup, so it confirms\n'
       || E'  -- nothing about any id (verify-RC-A2 F3).\n'
       || E'  if exists (select 1 from platform.entity_types et\n'
       || E'              where et.token = p_entity_type and et.rls_variant = ''detail'') then\n'
       || E'    raise exception ''cmt_add: a comment cannot be filed on a % — reply in its thread instead: cmt_add(<the record type>, <the record id>, body, p_parent_id => <the comment id>)'',\n'
       || E'      p_entity_type using errcode = ''22023'';\n'
       || E'  end if;\n'
       || E'  -- Deny before resolving organization or looking up the row.'),
      -- 4. the generator: a detail's read lane hides soft-deleted rows from everyone but the author (F4)
      (5, 'iam._apply_rls_unchecked(text,text,text,text)',
       E'''create policy std_select on %s for select to authenticated using (iam.has_access(entity_type, entity_id, ''''viewer''''::public.permission_level))'',\n      v_tbl);',
       E'case when exists (select 1 from information_schema.columns\n'
       || E'                    where table_schema=p_schema and table_name=p_table and column_name=''deleted_at'')\n'
       || E'      -- 🚨 RC-A2b (2026-09-25): a soft-deleted detail is read by its author only. The realtime\n'
       || E'      -- feed is authorized by this same policy, so it stops carrying deleted text too\n'
       || E'      -- (verify-RC-A2 F4). platform_admin_read, emitted above for every table, still reads it.\n'
       || E'      then ''create policy std_select on %s for select to authenticated using (iam.has_access(entity_type, entity_id, ''''viewer''''::public.permission_level) and not (deleted_at is not null and created_by is distinct from (select auth.uid())))''\n'
       || E'      else ''create policy std_select on %s for select to authenticated using (iam.has_access(entity_type, entity_id, ''''viewer''''::public.permission_level))'' end,\n'
       || E'      v_tbl);')
    ) as t(ord, fn, anchor, repl)
    order by ord
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> 1 then
      raise exception 'rca2b patch %: anchor occurs % time(s) in %, expected exactly 1 — nothing was changed', r.ord, v_n, r.fn;
    end if;
    execute replace(v_def, r.anchor, r.repl);
  end loop;
end
$patch$;

-- Regenerate platform.comments through the generator (no hand-written policy). Its bespoke
-- door-only refusals (comments_client_*_refused) are preserved by the generator, and
-- platform_admin_read is re-emitted with its do-not-remove comment.
select iam.apply_rls('platform', 'comments', 'comment', 'detail');
