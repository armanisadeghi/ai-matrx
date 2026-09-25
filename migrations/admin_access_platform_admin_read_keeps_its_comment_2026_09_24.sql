-- admin_access_platform_admin_read_keeps_its_comment_2026_09_24
-- based-on: iam._apply_rls_unchecked(text, text, text, text) c3d08d627645e915f090d4292e25446373ef8b803c12c0db3716ca9231788c52
-- based-on: iam.supersede_bespoke_policies(text, text, text[], text) 54a45a0c439bb044631e946ebaca941add6bd3b3e88f495174cd2b6d164ad871
-- based-on: iam.verify_canonical(text, text, text, text) ebafa3764e6e17c5730fbdab6f0f5ce26b2167c4d80db419cb6f2763bc2a9216
--
-- Law: common-docs/policies/our-own-admin-database-access.md (Arman, 2026-09-24).
--
-- Follow-up to admin_access_platform_admin_read_is_generated_2026_09_24.sql. The chair put a
-- do-not-remove COMMENT on every platform_admin_read policy. iam.apply_rls drops and re-creates the
-- policy on every regeneration, and a re-created policy has no comment — so the generator now emits
-- the same comment right after the create, and the two refusal/certifier sentences cite the law.
-- Function bodies only: no policy is created or dropped here.

set local lock_timeout = '2s';

do $patch$
declare
  v_def text;
  v_n int;
  r record;
  c_comment constant text :=
    'OUR OWN ADMIN DATABASE ACCESS - NEVER REMOVE, NARROW OR SUPERSEDE. This is how Arman and platform admins read every row through the admin system (aidream dashboard, admin.app.matrxserver.com, the Supabase-style table browser). Law: common-docs/policies/our-own-admin-database-access.md (Arman, 2026-09-24).';
begin
  for r in
    select * from (values
      (1, 'iam._apply_rls_unchecked(text,text,text,text)',
       E'''create policy platform_admin_read on %s for select to authenticated using ((select public.is_platform_admin()))'',\n    v_tbl);\n',
       E'''create policy platform_admin_read on %s for select to authenticated using ((select public.is_platform_admin()))'',\n    v_tbl);\n'
       || E'  -- The do-not-remove comment travels with the policy (common-docs/policies/our-own-admin-database-access.md).\n'
       || E'  v_pol := v_pol || format(''comment on policy platform_admin_read on %s is %L'', v_tbl,\n'
       || E'    ' || quote_literal(c_comment) || E');\n'),
      (2, 'iam.supersede_bespoke_policies(text,text,text[],text)',
       E'(Arman, 2026-09-24; common-docs/policies/access-belongs-to-the-person.md §7 item 3)',
       E'(Arman, 2026-09-24; common-docs/policies/our-own-admin-database-access.md and access-belongs-to-the-person.md §7 item 3)'),
      (3, 'iam.verify_canonical(text,text,text,text)',
       E'the admin system reads every table (Arman 2026-09-24); re-run',
       E'the admin system reads every table (Arman 2026-09-24; common-docs/policies/our-own-admin-database-access.md); re-run')
    ) as t(ord, fn, anchor, repl)
    order by ord
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> 1 then
      raise exception 'admin_access comment patch %: anchor occurs % time(s) in %, expected exactly 1 — nothing was changed', r.ord, v_n, r.fn;
    end if;
    execute replace(v_def, r.anchor, r.repl);
  end loop;
end
$patch$;
