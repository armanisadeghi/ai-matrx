-- chair-step: rehearsal inverse of rca2k — puts back rca2j's discoverability keep-list in public.access_denied_context.
-- Inverse of migrations/rca2k_a_plain_member_gets_the_strangers_answer.sql (rehearsal only).

set local lock_timeout = '2s';

do $patch$
declare
  v_def text := pg_get_functiondef('public.access_denied_context(text,uuid)'::regprocedure);
  v_anchor text := $a$  -- RC-A2k (chair ruling 2026-09-26): A PLAIN MEMBER OF THE RECORD'S ORGANIZATION WHO CANNOT OPEN
  -- IT GETS THE STRANGER'S ANSWER. The full answer stays for the owner, anyone holding a level,
  -- anyone reading an ancestor, and the owners/admins of the organization that holds it.
  if v_uid is not null
     and v_level = 'none'
     and not v_is_owner
     and v_ancestor_json is null
     and not (v_attrs.o_org is not null and public.is_org_admin_for(v_uid, v_attrs.o_org)) then
$a$;
  v_repl text := $a$  -- RC-A2j: THE HIDDEN RECORD'S ANSWER IS THE MISSING ANSWER — for a member of its organization
  -- too. Only whoever may discover the row, or an owner/admin of the organization holding it (the
  -- org's own oversight: the Table transfer offer), keeps the full answer.
  if v_uid is not null
     and v_level = 'none'
     and not v_is_owner
     and (
           (v_ancestor_json is null
            and not (v_attrs.o_org is not null and iam.has_org_access_for(v_uid, v_attrs.o_org)))
        or not (iam.is_discoverable(v_uid, v_meta.token, p_id, 'viewer'::public.permission_level)
                or (v_attrs.o_org is not null and public.is_org_admin_for(v_uid, v_attrs.o_org)))
         ) then
$a$;
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'rca2k inverse: anchor occurs % time(s), expected 1', v_n;
  end if;
  execute replace(v_def, v_anchor, v_repl);
end
$patch$;
