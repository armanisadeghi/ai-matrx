-- rca2d_history_denied_context_and_recents_follow_access
-- based-on: public.version_list(text, uuid, integer, integer) 618d5937c59a5996ce3464893342edfd5284e1c120ab02627b4849b91ad86f48
-- based-on: public.version_snapshot(text, uuid, integer) 5660aa6d1673073efcc3a7067f48b0f428fa902435652221e784c6a3011c3866
-- based-on: public.access_denied_context(text, uuid) ad5cd571be125957542c898a234787e6a1c264dd1ca307417148ebfb9030ee30
-- based-on: public.ues_set(text, uuid, boolean, boolean, boolean) 7fd3168e8a84514e03318bd0f2fd4551992a0f523d31178c3367e134e610ffa9
-- based-on: public.ues_touch(text, uuid) 0b5c06409e89b07df906bafd4c016726549427abba7ec49927b2d85ff45e8a98
-- based-on: public.ues_list(text) 74208d70cf5ce2336044ab2dbf032cb72679245eb9f0085298a03fd796bbd412
-- based-on: public.ues_get_bulk(text, uuid[]) f20dd40d286ca58ac0c60c7ab00c4c8932728f587af890cbbff2cb5afd49e1e5
--
-- RC-A2 residuals R1–R3 (register row RC-A2; chair rulings after the independent re-verify,
-- common-docs/projects/rich-content-unification/evidence/verify-RC-A2-independent-2026-09-25.md).
-- Function bodies only — no table, policy or lock-taking DDL.
--
-- R1 — EARLIER REVISIONS OF A COMMENT ARE FOR ITS AUTHOR AND THE RECORD'S ADMINS (chair ruling,
--      Google Docs behaviour). public.version_list / version_snapshot asked `viewer` for every
--      token, so anyone who could read a record read every earlier revision of every comment on
--      it — including text an author had edited away. For a detail token (rls_variant='detail')
--      the history doors now ask `admin`, which the kernel answers for a detail as "the author,
--      still holding commenter on the record, or admin on the record". Every other token: unchanged.
-- R2 — THE ACCESS-DENIED ANSWER FOLLOWS WHERE ACCESS COMES FROM. public.access_denied_context on a
--      comment answered about the COMMENT: its author, its organization and a "Request access" on a
--      row whose access only ever comes from its record. A detail is now answered exactly as its
--      record is (the same no-enumeration rule the record already gets), marked `via` the detail
--      token. And a row that points at a record the caller cannot open (platform.reference_gate_
--      columns: War Room threads and rooms, which copy the project's name) is answered at
--      `kind_only`: no title, no owner, no organization.
-- R3 — FAVOURITES, PINS AND RECENTS FOLLOW ACCESS. public.ues_set / ues_touch accepted any id, and
--      ues_list / ues_get_bulk handed back ids of records the caller can no longer open. A
--      registered token is now refused (42501) unless the caller can view the record, and the
--      reads leave out rows the caller cannot view. Unregistered tokens (navigation items, `nav`)
--      name no record and are unchanged.
-- Forcing suite: aidream db/tests/test_rca2d_comment_residuals.py (RCA2D_BEFORE=1 = red).

set local lock_timeout = '2s';

do $patch$
declare
  v_def text;
  v_n int;
  r record;
begin
  for r in
    select * from (values
      (1, 'public.version_list(text,uuid,integer,integer)',
$a$  IF NOT iam.has_access(p_token,p_id,'viewer') THEN RAISE EXCEPTION 'access denied'; END IF;
$a$,
$a$  -- 🚨 RC-A2d (R1): earlier revisions of a DETAIL (a comment) are for its author and the record's
  -- admins; a viewer of the record sees only the current text (cmt_list). The kernel answers
  -- `admin` on a detail as "author with commenter on the record, or admin on the record".
  IF NOT iam.has_access(p_token,p_id,
       (CASE WHEN EXISTS (SELECT 1 FROM platform.entity_types WHERE token=p_token AND rls_variant='detail')
             THEN 'admin' ELSE 'viewer' END)::public.permission_level)
  THEN RAISE EXCEPTION 'access denied'; END IF;
$a$),
      (2, 'public.version_snapshot(text,uuid,integer)',
$a$  IF NOT iam.has_access(p_token,p_id,'viewer') THEN RAISE EXCEPTION 'access denied'; END IF;
$a$,
$a$  -- 🚨 RC-A2d (R1): see public.version_list — a detail's earlier text is for its author and the
  -- record's admins only.
  IF NOT iam.has_access(p_token,p_id,
       (CASE WHEN EXISTS (SELECT 1 FROM platform.entity_types WHERE token=p_token AND rls_variant='detail')
             THEN 'admin' ELSE 'viewer' END)::public.permission_level)
  THEN RAISE EXCEPTION 'access denied'; END IF;
$a$),
      (3, 'public.access_denied_context(text,uuid)',
$a$  if not coalesce(v_attrs.o_found, false) then
    return jsonb_build_object(
      'exists', false, 'deleted', false, 'level', 'none', 'disclosure', 'none',
      'entity', jsonb_build_object('token', v_meta.token, 'label', v_meta.label)
    );
  end if;
$a$,
$a$  if not coalesce(v_attrs.o_found, false) then
    return jsonb_build_object(
      'exists', false, 'deleted', false, 'level', 'none', 'disclosure', 'none',
      'entity', jsonb_build_object('token', v_meta.token, 'label', v_meta.label)
    );
  end if;

  -- 🚨 RC-A2d (R2): A DETAIL IS ANSWERED AS ITS RECORD. A comment's access only ever comes from
  -- the record it is on, so its author, its organization and a "Request access" on the comment
  -- itself would each be a false or leaking answer. The caller gets exactly the answer the record
  -- gets under the platform's no-enumeration rule, marked `via` the detail token.
  if exists (select 1 from platform.entity_types et
              where et.token = v_meta.token and et.rls_variant = 'detail') then
    execute format('select entity_type, entity_id from %I.%I where id = $1',
                   v_meta.schema_name, v_meta.table_name)
      into v_parent_type, v_parent_id using p_id;
    if v_parent_type is null or v_parent_id is null then
      return jsonb_build_object(
        'exists', false, 'deleted', false, 'level', 'none', 'disclosure', 'none',
        'entity', jsonb_build_object('token', v_meta.token, 'label', v_meta.label));
    end if;
    return public.access_denied_context(v_parent_type, v_parent_id)
           || jsonb_build_object('via', jsonb_build_object('token', v_meta.token));
  end if;
$a$),
      (4, 'public.access_denied_context(text,uuid)',
$a$  else
    v_disclosure := 'full';
  end if;
$a$,
$a$  else
    v_disclosure := 'full';
  end if;

  -- 🚨 RC-A2d (R2): a row that points at a record (platform.reference_gate_columns — a War Room
  -- thread or room, which copies the project's name as its title) is answered at kind_only when
  -- the caller cannot open that record: no title, no owner, no organization.
  if v_disclosure = 'full' and v_uid is not null then
    select g[1], g[2] into v_cur_type, v_fk
      from (select platform.reference_gate_columns(v_meta.token) as g) x;
    if v_fk is not null then
      execute format('select %I::text, %I from %I.%I where id = $1',
                     v_cur_type, v_fk, v_meta.schema_name, v_meta.table_name)
        into v_parent_type, v_parent_id using p_id;
      if v_parent_type is not null and v_parent_id is not null
         and not iam.has_access(v_parent_type, v_parent_id, 'viewer'::public.permission_level) then
        v_disclosure := 'kind_only';
      end if;
    end if;
    v_cur_type := null; v_fk := null; v_parent_type := null; v_parent_id := null;
  end if;
$a$),
      (5, 'public.ues_set(text,uuid,boolean,boolean,boolean)',
$a$  if v_uid is null then raise exception 'ues_set: not authenticated' using errcode='42501'; end if;
$a$,
$a$  if v_uid is null then raise exception 'ues_set: not authenticated' using errcode='42501'; end if;
  -- 🚨 RC-A2d (R3): a favourite, pin or hidden mark is on a record the caller can open. An
  -- unregistered token (a navigation item) names no record and is not asked.
  if exists (select 1 from platform.entity_types et where et.token = p_entity_type)
     and not iam.has_access(p_entity_type, p_entity_id, 'viewer'::public.permission_level) then
    raise exception 'ues_set: you cannot open this % — it cannot be a favourite, pin or hidden item', p_entity_type
      using errcode = '42501';
  end if;
$a$),
      (6, 'public.ues_touch(text,uuid)',
$a$  if v_uid is null then return; end if;
$a$,
$a$  if v_uid is null then return; end if;
  -- 🚨 RC-A2d (R3): "recently opened" is only ever a record the caller can open.
  if exists (select 1 from platform.entity_types et where et.token = p_entity_type)
     and not iam.has_access(p_entity_type, p_entity_id, 'viewer'::public.permission_level) then
    raise exception 'ues_touch: you cannot open this %', p_entity_type using errcode = '42501';
  end if;
$a$),
      (7, 'public.ues_list(text)',
$a$   where user_id = (select auth.uid())
$a$,
$a$   where user_id = (select auth.uid())
     -- RC-A2d (R3): never hand back a record the caller can no longer open.
     and (not exists (select 1 from platform.entity_types et where et.token = platform.user_entity_state.entity_type)
          or iam.has_access(platform.user_entity_state.entity_type, platform.user_entity_state.entity_id,
                            'viewer'::public.permission_level))
$a$),
      (8, 'public.ues_get_bulk(text,uuid[])',
$a$     and entity_id = any(coalesce(p_entity_ids,'{}'::uuid[]));$a$,
$a$     and entity_id = any(coalesce(p_entity_ids,'{}'::uuid[]))
     -- RC-A2d (R3): never hand back a record the caller can no longer open.
     and (not exists (select 1 from platform.entity_types et where et.token = p_entity_type)
          or iam.has_access(p_entity_type, platform.user_entity_state.entity_id,
                            'viewer'::public.permission_level));$a$)
    ) as t(ord, fn, anchor, repl)
    order by ord
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> 1 then
      raise exception 'rca2d patch %: anchor occurs % time(s) in %, expected exactly 1 — nothing was changed', r.ord, v_n, r.fn;
    end if;
    execute replace(v_def, r.anchor, r.repl);
  end loop;
end
$patch$;
