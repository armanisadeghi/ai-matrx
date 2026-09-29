-- access_ladder_t13_22b_link_rows_become_anyone_links.sql
--
-- T-13 step 2.2, part b of e (common-docs/projects/access-ladder/t13/PLAN.md).
-- Every record at visibility 'link' (live 2026-09-28: 37 communication.meet_meetings,
-- 1 users.profiles, 1 files.files) gets an active viewer Anyone link owned by the record's
-- owner, BEFORE any door stops reading 'link' (parts c-e), so no existing link closes.
-- Rows are left at 'link' (phase 3.3 maps link -> nothing; the column retires in phase 7).
-- Rollback: update platform.share_links set is_active = false
--             where metadata->>'t13_origin' = 'visibility_link';

do $$
declare r record; n int := 0;
begin
  for r in
    select 'meet_meeting'::text as rt, m.id, m.host_user_id as owner, m.organization_id as org
      from communication.meet_meetings m where m.visibility = 'link'::platform.visibility
    union all
    select 'user_profile', p.id, p.id, p.organization_id
      from users.profiles p where p.visibility = 'link'::platform.visibility
    union all
    select 'file', f.id, f.created_by, f.organization_id
      from files.files f where f.visibility = 'link'::platform.visibility
  loop
    perform platform.ensure_anyone_link(r.rt, r.id, r.owner, r.org,
      jsonb_build_object('t13_origin', 'visibility_link', 't13_step', '2.2'));
    n := n + 1;
  end loop;
  raise notice 'T-13 2.2b: % link rows now carry an active Anyone link', n;
end $$;
