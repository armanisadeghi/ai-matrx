-- RC-B11 — a stale comment edit answers 409 with the current text, never a request that hangs.
-- Found on localhost 2026-09-26 (two tabs as admin@admin.com): cmt_edit refused the stale save
-- with SQLSTATE 40001, which PostgREST treats as a serialization failure and RETRIES — the call
-- sat in pg_stat_activity and the Save button spun forever instead of showing "Someone changed
-- this comment". PT409 is PostgREST's own "answer HTTP 409" code and is never retried.
-- Same body otherwise; only the conflict errcode moves.
-- based-on: public.cmt_edit(uuid, text, integer) effd9a4c72ff9a413f6a104b414f62eddb4f37d42d1fb58877b4d56b54d1da44

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.cmt_edit(p_id uuid, p_body text, p_expected_version integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_version integer;
  v_current record;
begin
  -- RC-A2: authorship alone is not enough -- the author must still hold commenter on the record.
  update platform.comments c
     set body = p_body, updated_by = (select auth.uid()),
         edited_at = case when c.body is distinct from p_body then now() else c.edited_at end
   where c.id = p_id and c.deleted_at is null and c.created_by = (select auth.uid())
     and iam.has_access(c.entity_type, c.entity_id, 'commenter'::public.permission_level)
     and (p_expected_version is null or c.version = p_expected_version)
  returning c.version into v_version;
  if v_version is not null then
    return v_version;
  end if;
  -- RC-B11: say WHICH refusal. A version that moved is a conflict the person resolves, not a denial.
  -- PT409 (HTTP 409), never 40001: PostgREST retries 40001 as a serialization failure, so the
  -- refusal never reached the person (localhost 2026-09-26).
  select c.version, c.body into v_current from platform.comments c
   where c.id = p_id and c.deleted_at is null and c.created_by = (select auth.uid())
     and iam.has_access(c.entity_type, c.entity_id, 'commenter'::public.permission_level);
  if v_current.version is not null and p_expected_version is not null then
    raise exception 'cmt_edit: this comment changed since you started editing it'
      using errcode = 'PT409',
            detail = json_build_object('version', v_current.version, 'body', v_current.body)::text,
            hint = 'Show the current text, then save again against its version.';
  end if;
  raise exception 'cmt_edit: comment not found, or you may not edit it -- only its author may, while holding commenter on the record it is on'
    using errcode = '42501';
end $function$
;
