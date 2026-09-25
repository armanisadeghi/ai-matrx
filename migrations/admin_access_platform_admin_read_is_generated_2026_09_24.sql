-- admin_access_platform_admin_read_is_generated_2026_09_24
-- based-on: iam.generated_policy_names() a514b643f9d5ec48a3040510a6607eefac1b77603d22a890b42529702ff0e67f
-- based-on: iam._apply_rls_unchecked(text, text, text, text) 0dc25738d424d318a777f807c67263c66a22c8a6dd6b8b7636cf7bdd8d5aa165
-- based-on: iam.supersede_bespoke_policies(text, text, text[], text) 17f5ae8509c6da8b9efcf80d03fe7e7d3d7911a311533ee9cb0348d599dbe226
-- based-on: iam.verify_canonical(text, text, text, text) c8b153edb3d258372aa374fc341494d079a8640220d14f584eda54f0bd6dcae8
--
-- PLATFORM-ADMIN READ IS NEVER REMOVED — THE GENERATOR NOW EMITS IT, THE REMOVAL DOOR REFUSES IT,
-- AND THE CERTIFIER EXPECTS IT.
--
-- Ruling (Arman, 2026-09-23): "Make sure nothing you do takes away ANY access from the admin
-- routes, which are behind our admin system. That boundry can do whatever it wants." And on
-- 2026-09-24, after the DD-137b staff-door sweep left a platform admin reading "This conversation
-- is unavailable to your account" inside the aidream admin dashboard: the admin system is the
-- package built to mimic Supabase, and it keeps full read access. Law:
-- common-docs/policies/access-belongs-to-the-person.md §7 item 3.
--
-- On 2026-09-24 the chair restored the read DIRECTLY: a permissive
--   platform_admin_read  FOR SELECT TO authenticated USING ((select public.is_platform_admin()))
-- on every RLS-enabled table outside graveyard/system schemas. This file makes that restore
-- permanent against every machine that could take it away again:
--
--   1. iam.generated_policy_names() carries `platform_admin_read`, so iam.apply_rls owns it
--      (drops it and re-creates it on every regeneration) instead of treating it as bespoke.
--   2. iam._apply_rls_unchecked EMITS it on every table it regenerates, every variant, and it
--      IGNORES suppress_platform_admin_lane for this read. The flag still governs everything it
--      governed before: platform_admin_all / platform_admin_select, the leading staff arm inside
--      std_*, the super-admin arms, and every WRITE. Org admins still go through the audited
--      emergency door. Only the platform-admin READ is unconditional.
--   3. iam.supersede_bespoke_policies refuses to drop it, on every table, machinery included.
--   4. iam.verify_canonical stops counting it as a stray/bespoke/unwalled/non-parent door (it is
--      excluded from v_polnames and from the DD-165 wall and DD-175 component loops) and gains a
--      `platform_admin_read_present` check that FAILs where an RLS table lacks it.
--
-- Each body below is PATCHED in place from its live definition: every anchor must occur exactly
-- once or the whole file aborts, so a body that moved since the based-on hash was taken cannot be
-- half-patched. No policy is created or dropped by this file (the chair's restore already put the
-- policy everywhere), so it takes no supautils policy lock.

set local lock_timeout = '2s';

create or replace function iam.generated_policy_names()
 returns text[]
 language sql
 immutable
 set search_path to 'pg_catalog', 'public'
as $function$
  select array[
    'svc_all',            -- every variant
    'std_select',         -- every variant except restricted-without-visibility
    'std_insert',         -- personal / component / entity family
    'std_update',         -- personal / component / entity family
    'std_delete',         -- personal / component / entity family
    'platform_admin_all', -- every variant except personal, unless the token suppresses the lane
    'platform_admin_select', -- the FOR SELECT twin of platform_admin_all, in a doors-only schema:
                          -- platform staff keep the exact read they had and lose the write lane,
                          -- because in `platform`/`iam` a write is a door (DOORS-ONLY-4)
    'anon_status_gate',  -- declared anonymous_read_status: RESTRICTIVE, anon SELECT only
    'pub_read',           -- anon lane: entity/system/restricted with visibility, flagged components
    'ref_all_members_read', -- reference: the one read lane of a global catalogue, open to every member
    'platform_admin_read' -- ADMIN-ACCESS (Arman 2026-09-24): the platform-admin READ on EVERY table,
                          -- every variant, suppress_platform_admin_lane or not. Never removed.
  ]::text[]
$function$;

do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
  v_n int;
  -- (function, anchor, replacement)
  r record;
begin
  for r in
    select * from (values
      -- 2. the generator emits the read on every table it regenerates
      (1, 'iam._apply_rls_unchecked(text,text,text,text)',
       E'      v_kept := array_append(v_kept, pol.polname);\n    end if;\n  end loop;\n',
       E'      v_kept := array_append(v_kept, pol.polname);\n    end if;\n  end loop;\n'
       || E'  -- ADMIN-ACCESS (Arman 2026-09-24; access-belongs-to-the-person.md §7 item 3): the platform-admin\n'
       || E'  -- READ lane is part of what this generator produces for EVERY table, every variant, and it\n'
       || E'  -- ignores suppress_platform_admin_lane on purpose — that flag keeps governing the staff WRITE\n'
       || E'  -- lanes, the std_* staff arm and the super-admin arms, never this read. It is in\n'
       || E'  -- iam.generated_policy_names(), so the loop above dropped any previous copy.\n'
       || E'  v_pol := v_pol || format(\n'
       || E'    ''create policy platform_admin_read on %s for select to authenticated using ((select public.is_platform_admin()))'',\n'
       || E'    v_tbl);\n'),
      -- 3. the removal door refuses it
      (2, 'iam.supersede_bespoke_policies(text,text,text[],text)',
       E'  foreach nm in array p_policy_names loop\n',
       E'  foreach nm in array p_policy_names loop\n'
       || E'    -- ADMIN-ACCESS (Arman 2026-09-24): platform-admin READ is never removed, on any table.\n'
       || E'    if nm = ''platform_admin_read'' then\n'
       || E'      raise exception\n'
       || E'        ''supersede_bespoke_policies: platform_admin_read is the platform-admin READ lane and is never removed (Arman, 2026-09-24; common-docs/policies/access-belongs-to-the-person.md §7 item 3). The admin system keeps full read access; org admins go through the audited emergency door. Nothing was dropped.'';\n'
       || E'    end if;\n'),
      -- 4a. the certifier does not count it among the table's policies ...
      (3, 'iam.verify_canonical(text,text,text,text)',
       E'SELECT array_agg(polname) INTO v_polnames FROM pg_policy WHERE polrelid=v_tbl;',
       E'SELECT array_agg(polname) INTO v_polnames FROM pg_policy WHERE polrelid=v_tbl AND polname <> ''platform_admin_read''; -- ADMIN-ACCESS 2026-09-24: judged by platform_admin_read_present, never as a stray'),
      -- 4b. ... nor as an unwalled staff arm (DD-165) ...
      (4, 'iam.verify_canonical(text,text,text,text)',
       E'WHERE p.polrelid = v_tbl AND p.polpermissive\n',
       E'WHERE p.polrelid = v_tbl AND p.polpermissive AND p.polname <> ''platform_admin_read''\n'),
      -- 4c. ... nor as a component door that skips the parent (DD-175) ...
      (5, 'iam.verify_canonical(text,text,text,text)',
       E'WHERE ro.rolname = ''service_role'')\n             ORDER BY pol.polname',
       E'WHERE ro.rolname = ''service_role'')\n               AND pol.polname <> ''platform_admin_read''\n             ORDER BY pol.polname'),
      -- 4d. ... and it FAILs a table that lacks it.
      (6, 'iam.verify_canonical(text,text,text,text)',
       E'  check_name:=''bespoke_policy_present'';\n',
       E'  -- ADMIN-ACCESS (Arman 2026-09-24): the platform-admin READ lane is expected on every RLS table.\n'
       || E'  check_name:=''platform_admin_read_present'';\n'
       || E'  IF v_relkind NOT IN (''r'',''p'') OR NOT COALESCE(v_rls,false) THEN status:=''SKIP''; detail:=''not an RLS table'';\n'
       || E'  ELSIF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=v_tbl AND polname=''platform_admin_read'' AND polcmd=''r'' AND polpermissive) THEN status:=''PASS''; detail:=NULL;\n'
       || E'  ELSE status:=''FAIL''; detail:=''no permissive platform_admin_read FOR SELECT policy — the admin system reads every table (Arman 2026-09-24); re-run iam.apply_rls or create it''; END IF;\n'
       || E'  RETURN NEXT;\n\n'
       || E'  check_name:=''bespoke_policy_present'';\n')
    ) as t(ord, fn, anchor, repl)
    order by ord
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> 1 then
      raise exception 'admin_access patch %: anchor occurs % time(s) in %, expected exactly 1 — the live body moved; nothing was changed', r.ord, v_n, r.fn;
    end if;
    execute replace(v_def, r.anchor, r.repl);
  end loop;
end
$patch$;
