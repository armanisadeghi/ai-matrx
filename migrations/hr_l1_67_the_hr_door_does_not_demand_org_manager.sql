-- hr_l1_67 — A PLAIN HR ADMIN CAN HIRE SOMEBODY WHO ALREADY HAS A LOGIN.
--
-- RECORD of a live change applied on 2026-08-29.
--
-- 🚨 THE DEFECT. `public.hr_employee_create` completes access for a login-bearing hire by calling
-- `public.mbr_add` UNCONDITIONALLY (hr_l1_57, Arman's 2026-08-28 carry-the-login-over ruling).
-- `mbr_add` raises `membership manager role required` (42501) for any caller who is not an org
-- owner/admin — and it raises it BEFORE its own idempotent short-circuit
-- (`if v_target_id is not null then return v_target_id`), so it fired even when the membership
-- ALREADY EXISTED and there was nothing to write. Every login-bearing hire this door admits is a
-- link to an existing member (the `link_without_membership` guard above refuses anything else) or
-- a rehire of one, so the call was almost always a no-op that raised.
--
-- The result: the carry-login-over flow worked ONLY for an org-admin caller. An ordinary HR admin
-- holding every HR capability got a raw 42501 with no sentence — the same class of failure as the
-- 23502 that hr_l1_43 fixed, and worse, because the refusal names a privilege that has nothing to
-- do with hiring.
--
-- 🚨 THE FIX IS THE LAYERING THIS PROGRAM ALREADY USES, NOT A WIDER GRANT. The ACT is authorized
-- at the top of this door by `hr._l1_write_gate(v_org, 'identity.write', ...)`. The membership
-- write is PART of that act, so the door performs it under its own definer authority — the same
-- pattern every other cross-schema HR write uses — and audits it as the HR act it is. HR admins
-- are NOT given org-manager rights, and who may hire is not widened by one person: the gate above
-- is untouched, so a caller without `identity.write` is still refused before any of this runs.
--
-- Cheapest and clearly right first: if the membership row already exists, WRITE NOTHING. The
-- membership's STATUS is not this door's to move either — the employment INSERT a few lines above
-- fires `employment_membership_sync` → `hr.sync_membership_to_employment`, which is the ONE
-- lifecycle owner and which restores a departed member on rehire (continued_access_06 / 07).
-- A second writer flipping status here is exactly the drift that law exists to prevent.
--
-- 🚨 SURGICAL, NOT A REWRITE. `hr_employee_create` is the product of a dozen rulings; retyping it
-- is how they get silently lost. This migration takes the LIVE definition, replaces exactly three
-- substrings, asserts each landed, and re-creates it. Re-running is a no-op.

do $patch$
declare
  v_def text;
  v_old_decl  text := '  v_enrolled integer := 0;';
  v_new_decl  text := '  v_enrolled integer := 0; v_membership jsonb := ''{}''::jsonb;';
  v_old_block text;
  v_new_block text;
  v_old_ret   text := '''enrolled_pay_period_rows'', v_enrolled,';
  v_new_ret   text := '''enrolled_pay_period_rows'', v_enrolled,' || E'\n    ''membership'', v_membership,';
begin
  v_old_block :=
    '  declare v_login uuid;' || E'\n' ||
    '  begin' || E'\n' ||
    '    select login_user_id into v_login from hr.employee where id = v_employee;' || E'\n' ||
    '    if v_login is not null then' || E'\n' ||
    '      perform public.mbr_add(''organization'', v_org, v_login, v_org,' || E'\n' ||
    '                             ''member'', ''active'',' || E'\n' ||
    '                             jsonb_build_object(''granted_by'', ''hr_employee_create'',' || E'\n' ||
    '                                               ''reason'', ''link_at_create_completes_access''));' || E'\n' ||
    '      perform hr.derive_grants_bulk(ARRAY[v_employment]::uuid[]);' || E'\n' ||
    '    end if;' || E'\n' ||
    '  end;';

  v_new_block :=
    '  declare v_login uuid; v_mbr uuid; v_mbr_action text := ''none'';' || E'\n' ||
    '  begin' || E'\n' ||
    '    select login_user_id into v_login from hr.employee where id = v_employee;' || E'\n' ||
    '    if v_login is not null then' || E'\n' ||
    '      -- 🚨 THIS DOOR DOES NOT DEMAND A SECOND, UNRELATED PRIVILEGE FROM ITS CALLER (hr_l1_67).' || E'\n' ||
    '      -- The shared membership helper this used to call raises 42501 ''membership manager role' || E'\n' ||
    '      -- required'' for any caller who is not an org owner/admin, BEFORE its own short-circuit — so' || E'\n' ||
    '      -- it fired even when the membership already existed and nothing was to be written. That' || E'\n' ||
    '      -- made Arman''s carry-the-login-over ruling reachable only by an org admin; a plain HR' || E'\n' ||
    '      -- admin holding every HR capability got a raw 42501 naming a privilege that has nothing' || E'\n' ||
    '      -- to do with hiring. The ACT is authorized above by hr._l1_write_gate(''identity.write'');' || E'\n' ||
    '      -- the membership write is part of that act and is performed under this door''s own' || E'\n' ||
    '      -- definer authority, audited as the HR act. HR admins get no org-manager rights.' || E'\n' ||
    '      select m.id into v_mbr from iam.memberships m' || E'\n' ||
    '       where m.container_type = ''organization'' and m.container_id = v_org' || E'\n' ||
    '         and m.user_id = v_login and m.deleted_at is null;' || E'\n' ||
    '      if v_mbr is not null then' || E'\n' ||
    '        -- Nothing to write, and the STATUS is not this door''s to move: the employment INSERT' || E'\n' ||
    '        -- above already ran hr.sync_membership_to_employment through employment_membership_sync,' || E'\n' ||
    '        -- which is the one lifecycle owner and restores a departed member on rehire' || E'\n' ||
    '        -- (continued_access_06 / 07). A second writer here is how the two would disagree.' || E'\n' ||
    '        v_mbr_action := ''existing'';' || E'\n' ||
    '      else' || E'\n' ||
    '        insert into iam.memberships (container_type, container_id, user_id, organization_id,' || E'\n' ||
    '                                     role, status, metadata, created_by)' || E'\n' ||
    '        values (''organization'', v_org, v_login, v_org, ''member'', ''active'',' || E'\n' ||
    '                jsonb_build_object(''granted_by'', ''hr_employee_create'',' || E'\n' ||
    '                                   ''reason'', ''link_at_create_completes_access'',' || E'\n' ||
    '                                   ''hr_act'', ''hire'', ''hr_employee_id'', v_employee),' || E'\n' ||
    '                v_uid)' || E'\n' ||
    '        on conflict (container_type, container_id, user_id)' || E'\n' ||
    '        do update set status = ''active'', deleted_at = null,' || E'\n' ||
    '                      updated_by = v_uid, updated_at = now()' || E'\n' ||
    '        returning id into v_mbr;' || E'\n' ||
    '        v_mbr_action := ''created'';' || E'\n' ||
    '        perform hr._l1_write_audit(v_org, ''iam_membership'', ''write'', ARRAY[v_mbr],' || E'\n' ||
    '                                   v_employment, ''hire'');' || E'\n' ||
    '      end if;' || E'\n' ||
    '      perform hr.derive_grants_bulk(ARRAY[v_employment]::uuid[]);' || E'\n' ||
    '    end if;' || E'\n' ||
    '    v_membership := jsonb_build_object(''membership_id'', v_mbr, ''action'', v_mbr_action);' || E'\n' ||
    '  end;';

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employee_create';
  if v_def is null then
    raise exception 'hr_l1_67: public.hr_employee_create is missing';
  end if;

  if position('THIS DOOR DOES NOT DEMAND A SECOND, UNRELATED PRIVILEGE' in v_def) > 0 then
    raise notice 'hr_l1_67: already applied — the door no longer routes through mbr_add';
    return;
  end if;

  if position(v_old_block in v_def) = 0 then
    raise exception 'hr_l1_67: the link-completion block has changed shape; refusing to patch blind';
  end if;
  if position(v_old_decl in v_def) = 0 then
    raise exception 'hr_l1_67: the declare anchor has changed shape; refusing to patch blind';
  end if;
  if position(v_old_ret in v_def) = 0 then
    raise exception 'hr_l1_67: the ack anchor has changed shape; refusing to patch blind';
  end if;

  v_def := replace(v_def, v_old_block, v_new_block);
  v_def := replace(v_def, v_old_decl,  v_new_decl);
  v_def := replace(v_def, v_old_ret,   v_new_ret);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employee_create';

  if position('mbr_add' in v_def) > 0 then
    raise exception 'hr_l1_67: mbr_add is still called from the hire door';
  end if;
  if position('v_membership := jsonb_build_object' in v_def) = 0
     or position('''membership'', v_membership,' in v_def) = 0 then
    raise exception 'hr_l1_67: the membership result did not land in the ack';
  end if;
  -- everything else must still be there: three replacements, not a rewrite
  if position('link_without_membership' in v_def) = 0
     or position('rehire_required' in v_def) = 0
     or position('A position needs a location' in v_def) = 0
     or position('A position needs a department' in v_def) = 0
     or position('LINK-AT-CREATE COMPLETES ACCESS' in v_def) = 0
     or position('hr.derive_grants_bulk(ARRAY[v_employment]::uuid[])' in v_def) = 0
     or position('''active'', ''departed''' in v_def) = 0
     or position('hr.employee_directory_status(v_employee, current_date)' in v_def) = 0 then
    raise exception 'hr_l1_67: the patched body lost machinery it must keep';
  end if;
  raise notice 'hr_l1_67: a plain HR admin can hire a person who already signs in here';
end
$patch$;

-- ── THE PIN hr_l1_57 LEFT BEHIND, AMENDED WITH ITS ORIGINAL REASON PRESERVED ─────────────
-- hr_l1_57's contract required the literal `public.mbr_add('organization', v_org, v_login` in the
-- body. That token asserted the RULING (linking an existing member-with-login at create completes
-- access in the same act); it named mbr_add only because mbr_add was how it was done that day.
-- The ruling is unchanged and still enforced — the membership is still ensured and grants are
-- still derived through hr.derive_grants_bulk. What changed is that the write no longer re-asks
-- the human caller for an org-manager role they do not need. The clause is retargeted at the
-- ruling's real machinery and BANS a return to mbr_add from this door.
update hr.function_contract
   set must_contain = array['A position needs a location',
                            'A position needs a department',
                            'link_without_membership',
                            'LINK-AT-CREATE COMPLETES ACCESS',
                            'hr.derive_grants_bulk(ARRAY[v_employment]::uuid[])',
                            'insert into iam.memberships'],
       must_not_contain = array['mbr_add'],
       reason = reason || ' AMENDED by hr_l1_67 (2026-08-29): the clause required the literal '
             || 'public.mbr_add(...) call. mbr_add raises 42501 "membership manager role required" '
             || 'BEFORE its idempotent short-circuit, so a plain HR admin — who holds identity.write '
             || 'and every HR capability but is not an org manager — could not complete ANY '
             || 'login-bearing hire, including one where the membership already existed and nothing '
             || 'was written. The ruling it pinned is unchanged and still enforced by the retargeted '
             || 'tokens; mbr_add is now BANNED from this door so the 42501 cannot return.'
 where schema_name = 'public' and function_name = 'hr_employee_create'
   and home_migration = 'hr_l1_57_link_at_create_completes_access.sql'
   and 'mbr_add' <> all(coalesce(must_not_contain, array[]::text[]));

-- The new rule, pinned in its own right.
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
select 'public','hr_employee_create','hr_l1_67_the_hr_door_does_not_demand_org_manager.sql',
       array['hr._l1_write_gate(v_org, ''identity.write''',
             'THIS DOOR DOES NOT DEMAND A SECOND, UNRELATED PRIVILEGE'],
       array['mbr_add'],
       'An HR door authorizes the ACT once, at the top, on an HR capability. A cross-schema write '
       || 'performed AS PART of that authorized act must not re-demand a second, unrelated privilege '
       || 'from the human caller. public.mbr_add demands an org owner/admin role and raises 42501 '
       || 'before its own idempotent short-circuit, which locked every plain HR admin out of hiring '
       || 'anybody who already has a login. The membership row is ensured under this door''s own '
       || 'definer authority; its STATUS stays owned by hr.sync_membership_to_employment.', true
where not exists (select 1 from hr.function_contract c
                   where c.schema_name = 'public' and c.function_name = 'hr_employee_create'
                     and c.home_migration = 'hr_l1_67_the_hr_door_does_not_demand_org_manager.sql');

do $chk$
declare v_broken int;
begin
  select count(*) into v_broken from hr.function_contracts_broken()
   where qname = 'public.hr_employee_create';
  if v_broken > 0 then
    raise exception 'hr_l1_67: % contract clause(s) broken on hr_employee_create', v_broken;
  end if;
  if not exists (select 1 from information_schema.routine_privileges
                  where routine_name = 'hr_employee_create' and grantee = 'authenticated'
                    and privilege_type = 'EXECUTE') then
    raise exception 'hr_l1_67: authenticated lost EXECUTE on the create door';
  end if;
end
$chk$;
