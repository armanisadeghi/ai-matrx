-- draft: rc-a2-deep asking for access follows the not-found split; remove when rehearsed + suite green on the clone
-- based-on: public.access_denied_context(text, uuid) 4620ac95abf36db57858123e54e3dc0d98b70bf6a2c5a9188087b8ef63d14244
-- based-on: public.access_request_create(text, uuid, text, text) cb619bad5729f7f13f4b99c2c38b5956a9e9892843b7a8ec4632ae2054b3389e
-- based-on: public.access_request_blind(text, uuid, text, text) d563801d9a7645a00a1f931ddec34695e6fc7eb1a3478e1f78d5a03b7559c2a7
-- based-on: public.access_request_list(text) 9897261d4d17a24c8991ed4a49260bfe88b0552be7b9ce8a5be71bbb658a29df
--
-- RC-A2 round 5 (register row RC-A2; verify round 5, common-docs 0a18426ce, P1 + the chair's
-- refinement). ASKING FOR ACCESS TELLS A PERSON NO MORE THAN THE NOT-FOUND PAGE.
--
-- P1: public.access_request_create answered a plain member or a stranger with the record's title,
-- the owners' display names and the kind ("recipients", "entity_title") — and "That task no longer
-- exists" for a random id, an existence oracle. On a comment id it returned the parent note's title.
-- The chair's refinement: an organization's owner/admin keeps the full answer only for records the
-- ORGANIZATION holds — never a member's PERSONAL record (access is personal).
--
-- ONE split, two doors. public.access_denied_context is the split. Whoever it answers with the
-- missing-id answer may only ask BLIND: public.access_request_create hands them to
-- public.access_request_blind, which files the request and tells the owner when the record is real,
-- and says the same sentence either way. Everyone the split keeps (owner, a level holder, an
-- ancestor reader, the owners/admins of the ORGANIZATION holding a non-personal record) gets the
-- request answer as before. The filing half moves to public._access_request_file (no client EXECUTE
-- — the DDL guards close a new SECURITY DEFINER function with no door row), which both doors call.
-- The requester's "sent" list shows a request only while the split lets her know of the record:
-- a random id leaves no row, so a listed row would confirm the id.
-- Census of request/share/invite functions (RC-A2 register row): access_request_withdraw/report/
-- decide take a request id; inv_* / portal_invite / table_share_outside_invite / hr_employee_invite
-- need the container's admin or the record's full access, or a secret token — none names a record
-- to someone the split hides it from.
-- Forcing suite: aidream db/tests/test_rca2m_asking_for_access_follows_the_same_split.py.
-- Inverse (rehearsal only): migrations/inverse/rca2m_asking_for_access_follows_the_same_split_down.sql

set local lock_timeout = '2s';

-- ── the filing half: today's access_request_create body, renamed, recursing into itself ────────
do $file$
declare
  v_def text := pg_get_functiondef('public.access_request_create(text,uuid,text,text)'::regprocedure);
  v_n int;
  r record;
begin
  for r in
    select * from (values
      (1, 'CREATE OR REPLACE FUNCTION public.access_request_create(', 'CREATE OR REPLACE FUNCTION public._access_request_file('),
      (2, 'return public.access_request_create(v_parent_type, v_parent_id, p_level, p_message)',
          'return public._access_request_file(v_parent_type, v_parent_id, p_level, p_message)')
    ) as t(ord, anchor, repl)
    order by ord
  loop
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> 1 then
      raise exception 'rca2m file %: anchor occurs % time(s), expected 1 — nothing was changed', r.ord, v_n;
    end if;
    v_def := replace(v_def, r.anchor, r.repl);
  end loop;
  execute v_def;
end
$file$;

comment on function public._access_request_file(text, uuid, text, text) is
  'RC-A2m: files an access request with no disclosure gate. Called only by public.access_request_create (after the not-found split) and public.access_request_blind. Never a client door.';

-- ── the door: the split first ─────────────────────────────────────────────────────────────────
create or replace function public.access_request_create(p_resource_type text, p_resource_id uuid,
                                                        p_level text default 'viewer'::text,
                                                        p_message text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'platform', 'iam'
as $fn$
declare
  v_ctx jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to request access.' using errcode = '42501';
  end if;
  -- RC-A2m: the not-found page's split decides what the asker may learn. Missing-id answer →
  -- the blind ask (same sentence for a real and a random id); otherwise the request answer.
  v_ctx := public.access_denied_context(p_resource_type, p_resource_id);
  if coalesce((v_ctx ->> 'unresolvable')::boolean, false) then
    raise exception 'We could not identify what you are asking for.' using errcode = '22023';
  end if;
  if (v_ctx ->> 'exists') is distinct from 'true' then
    return public.access_request_blind(p_resource_type, p_resource_id, p_message, null);
  end if;
  return public._access_request_file(p_resource_type, p_resource_id, p_level, p_message);
end;
$fn$;

-- ── the blind ask files through the filing half; the split refines; the sent list follows it ───
do $patch$
declare
  v_def text;
  v_n int;
  r record;
  v_fn text := null;
begin
  for r in
    select * from (values
      (1, 'public.access_denied_context(text,uuid)',
       $a$     and not (v_attrs.o_org is not null and public.is_org_admin_for(v_uid, v_attrs.o_org)) then
$a$,
       $a$     -- RC-A2m (chair refinement): the organization's owners/admins keep the full answer only for
     -- records the ORGANIZATION holds — never a member's PERSONAL record (access is personal).
     and not (v_attrs.o_org is not null
              and v_attrs.o_vis is distinct from 'personal'::platform.visibility
              and public.is_org_admin_for(v_uid, v_attrs.o_org)) then
$a$),
      (2, 'public.access_request_blind(text,uuid,text,text)',
       $a$public.access_request_create(v_meta.token, p_id, 'viewer', v_note)$a$,
       $a$public._access_request_file(v_meta.token, p_id, 'viewer', v_note)$a$),
      (3, 'public.access_request_list(text)',
       $a$      where ar.created_by = v_uid and ar.deleted_at is null
$a$,
       $a$      where ar.created_by = v_uid and ar.deleted_at is null
        -- RC-A2m: a request is listed only while the not-found split lets the asker know of the record
        and (ar.request_kind = 'setting'
             or (public.access_denied_context(ar.resource_type, ar.resource_id) ->> 'exists') = 'true')
$a$)
    ) as t(ord, fn, anchor, repl)
    order by ord
  loop
    if v_fn is distinct from r.fn then
      if v_fn is not null then execute v_def; end if;
      v_fn := r.fn;
      v_def := pg_get_functiondef(r.fn::regprocedure);
    end if;
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> 1 then
      raise exception 'rca2m patch %: anchor occurs % time(s) in %, expected 1 — nothing was changed', r.ord, v_n, r.fn;
    end if;
    v_def := replace(v_def, r.anchor, r.repl);
  end loop;
  execute v_def;
end
$patch$;
