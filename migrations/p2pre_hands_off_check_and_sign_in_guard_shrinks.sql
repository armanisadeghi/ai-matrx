-- Phase 2 prerequisites (estate reduction, re-point auth.users links to iam.users), applied live 2026-09-28
-- by the P2-PRE executor. Mirrors of the live bodies.
--   iam.auth_users_hands_off()        md5(pg_get_functiondef) 720cd8a18a7de3451ad807691e698f88 (new)
--   platform._sign_in_table_guard()    md5(pg_get_functiondef) f154ed6ebd18cf47c5f8d4af1170adb6
--                                      (was 10c57ad7010c4e5fd58c8068713e993d; only step 0 added)
-- Plus, once: delete of the 10 dead baseline rows (list in
-- /Users/armanisadeghi/db-estate-backups/2026-09-28/phase2/P2-PRE/guard-proof.md). Event trigger stays ENABLE ALWAYS.
-- Plan: common-docs/projects/database-estate-reduction/CERTIFICATION-WAVES.md sections 8.2-1 and 8.2-3.

create function iam.auth_users_hands_off()
returns table (kind text, relation regclass, name text, con_oid oid)
language sql stable security invoker set search_path = pg_catalog
as $function$
  -- Everything outside GoTrue's own schema that still holds on to auth.users.
  -- Phase 3 end state: exactly two rows, fk iam.users users_id_fkey and trigger auth.users on_auth_user_mirror.
  select 'fk'::text, c.conrelid::regclass, c.conname::text, c.oid
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
   where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and n.nspname <> 'auth'
  union all
  select 'trigger'::text, t.tgrelid::regclass, t.tgname::text, t.oid
    from pg_trigger t
   where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal
  order by 1, 2, 3
$function$;
comment on function iam.auth_users_hands_off() is
  'Every foreign key into auth.users from outside schema auth, plus every non-internal trigger on auth.users. Phase 2 of the person-table move (common-docs projects/database-estate-reduction CERTIFICATION-WAVES.md section 8) ends when this returns only iam.users users_id_fkey and auth.users on_auth_user_mirror.';
revoke all on function iam.auth_users_hands_off() from public, anon, authenticated;
grant execute on function iam.auth_users_hands_off() to service_role;

CREATE OR REPLACE FUNCTION platform._sign_in_table_guard()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_users  oid := to_regclass('auth.users');
  v_anchor oid := to_regclass('iam.users');
  v_mirror oid := to_regprocedure('iam._mirror_sign_in_account()');
  v_bad text;
begin
  if v_users is null then return; end if;
  -- 0. The baseline shrinks with the old keys: a baseline row whose constraint is gone (a Phase 2 swap
  --    dropped it, or its column or table went) is deleted here, in the same transaction, so the allowlist
  --    never holds a dead OID. Rows another transaction holds are skipped, never waited on.
  delete from platform.sign_in_fk_legacy l
   where l.con_oid in (select d.con_oid from platform.sign_in_fk_legacy d
                        where not exists (select 1 from pg_constraint c where c.oid = d.con_oid)
                        for update skip locked);
  -- 1. Foreign keys into auth.users: iam.users' own, GoTrue's inside auth, the 2026-09-27 baseline
  --    (by constraint OID), and partition clones of a baseline constraint. Nothing else.
  select string_agg(format('%s (%I)', c.conrelid::regclass, c.conname), ', ' order by c.conname)
    into v_bad
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
   where c.contype = 'f' and c.confrelid = v_users
     and n.nspname <> 'auth'
     and c.conrelid is distinct from v_anchor
     and not exists (select 1 from platform.sign_in_fk_legacy l where l.con_oid = c.oid)
     and not (c.conparentid <> 0 and exists (select 1 from platform.sign_in_fk_legacy l where l.con_oid = c.conparentid));
  if v_bad is not null then
    raise exception 'sign-in table guard: new foreign key(s) into auth.users: %', v_bad
      using errcode = 'check_violation',
            detail = 'iam.users is the only table allowed a foreign key into auth.users; every lock on auth.users is a lock on sign-in. A rebuilt old reference (ALTER COLUMN TYPE, drop and re-add, a restored table) counts as new.',
            hint = 'Reference iam.users(id) instead — same ids, one row per sign-in account. Design: common-docs/projects/database-estate-reduction/PERSON-TABLE.md';
  end if;
  -- 2. auth.users carries exactly one trigger: on_auth_user_mirror -> iam._mirror_sign_in_account, enabled.
  select string_agg(format('%I -> %s', t.tgname, t.tgfoid::regproc), ', ' order by t.tgname) into v_bad
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = v_users and not t.tgisinternal
     and p.pronamespace <> 'auth'::regnamespace
     and not (t.tgname = 'on_auth_user_mirror' and t.tgfoid = v_mirror);
  if v_bad is not null then
    raise exception 'sign-in table guard: trigger(s) on auth.users other than on_auth_user_mirror: %', v_bad
      using errcode = 'check_violation',
            detail = 'auth.users carries exactly one trigger, which keeps iam.users in step. Sign-up side effects fire from iam.users.',
            hint = 'Put the trigger on iam.users (AFTER INSERT for sign-up; AFTER UPDATE for is_anonymous / email / phone changes).';
  end if;
  if v_mirror is not null and not exists (
       select 1 from pg_trigger t where t.tgrelid = v_users and t.tgname = 'on_auth_user_mirror'
          and t.tgfoid = v_mirror and t.tgenabled in ('O', 'A')) then
    raise exception 'sign-in table guard: on_auth_user_mirror is missing or disabled on auth.users'
      using errcode = 'check_violation',
            detail = 'Without it new sign-in accounts get no iam.users row, sign-up side effects stop, and every reference to the new account fails.',
            hint = 'Recreate: create trigger on_auth_user_mirror after insert or update of is_anonymous, email, phone on auth.users for each row execute function iam._mirror_sign_in_account();';
  end if;
  -- 3. No rewrite rules on auth.users.
  select string_agg(quote_ident(rw.rulename), ', ') into v_bad
    from pg_rewrite rw where rw.ev_class = v_users and rw.rulename <> '_RETURN';
  if v_bad is not null then
    raise exception 'sign-in table guard: rule(s) on auth.users: %', v_bad
      using errcode = 'check_violation', hint = 'Act on iam.users instead.';
  end if;
end;
$function$;

delete from platform.sign_in_fk_legacy l where not exists (select 1 from pg_constraint c where c.oid = l.con_oid);
