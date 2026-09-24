-- RC-A2 (rich-content STORE-DESIGN §3.8 / P2) -- A COMMENT IS A DETAIL OF THE THING IT IS ON.
-- Reading one needs `viewer` on that thing; writing one needs `commenter` on it. Organization
-- membership alone buys neither.
--
-- THE USE CASE THIS SUITE NAMES (no fake test data): Ridgeline Physical Therapy, a
-- four-clinician outpatient practice. The owner keeps PRIVATE records inside the practice's
-- workspace -- her draft of the front-desk lead's annual review (a note), the lease-renewal
-- negotiation she has not told staff about (a task), and the landlord's contact record (a CRM
-- party). She leaves herself comments on each, and a comment quotes the thing it is about:
-- "the 3% raise in paragraph 2 is contingent on the scheduling-error rate". The front-desk
-- lead is a MEMBER of the same practice. Before RC-A2 she could read every one of those
-- comments -- platform.comments.std_select admitted any row marked `internal` to every member
-- of its organization, and public.cmt_list/cmt_add asked only iam.has_org_access -- so a
-- private record leaked through the comments on it. She could also add a comment to the
-- private review and soft-delete the owner's own comments (cmt_delete let any member delete).
--
-- Later the owner shares the review with the office manager at COMMENTER (she may discuss it,
-- not rewrite it), then narrows it to VIEWER (she may read the discussion, not add to it).
-- The office manager's seat is test@test.com; the owner's is admin@admin.com.
--
-- RED BEFORE / GREEN AFTER. Every clause records its failure instead of stopping, and the last
-- block raises with the whole list, so a run on the old code names every hole at once. It ends
-- in ROLLBACK and leaves nothing behind.
--
-- IT TAKES THE SEAT: every assertion about access runs as `authenticated` with the person's
-- own claims (set_config('role','authenticated')), because RLS and the doors read auth.uid().

\set suite 'rca2_comments_follow_the_parent.sql'
\set requires 'function:public.cmt_add|function:public.cmt_list|function:public.cmt_edit|function:public.cmt_delete|relation:platform.comments|relation:workbench.notes|relation:workspace.tasks|relation:crm.party|relation:iam.permissions'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

-- ════════════════ FIXTURE, AS THE SERVER ════════════════
do $$
declare
  c_owner  uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_member uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  v_org uuid; v_note uuid; v_task uuid; v_party uuid; v_missing_note uuid := gen_random_uuid();
begin
  perform set_config('app.actor_system', 'campaign.rca2_comments_follow_the_parent', true);
  perform set_config('rca2.fail', '', true);

  insert into iam.organizations (name, slug, abbreviation)
  values ('Ridgeline Physical Therapy (RC-A2 suite)', 'ridgeline-pt-rca2-' || substr(gen_random_uuid()::text,1,8), 'RPT')
  returning id into v_org;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_owner, 'owner', 'active'),
         (v_org, 'organization', v_org, c_member, 'member', 'active');

  insert into workbench.notes (organization_id, created_by, visibility, label, content)
  values (v_org, c_owner, 'personal', 'Front-desk lead — annual review draft',
          'Strong year. Proposed 3% raise, contingent on the scheduling-error rate staying under 2%.')
  returning id into v_note;
  insert into workspace.tasks (organization_id, created_by, visibility, title)
  values (v_org, c_owner, 'personal', 'Lease renewal — counter the landlord at 4.5%, walk away above 6%')
  returning id into v_task;
  insert into crm.party (organization_id, created_by, visibility, party_kind, display_name)
  values (v_org, c_owner, 'personal', 'person', 'Dale Whitcomb (landlord, Ridgeline Plaza)')
  returning id into v_party;

  perform set_config('rca2.org',   v_org::text,   true);
  perform set_config('rca2.note',  v_note::text,  true);
  perform set_config('rca2.task',  v_task::text,  true);
  perform set_config('rca2.party', v_party::text, true);
  if exists (select 1 from workbench.notes where id = v_missing_note) then
    raise exception 'FIXTURE: randomly chosen missing-note ID already exists';
  end if;
  perform set_config('rca2.missing_note', v_missing_note::text, true);

  -- Preconditions the whole suite rests on. A fixture that does not hold is not a finding.
  if (select created_by from workbench.notes where id = v_note) is distinct from c_owner
     or (select created_by from workspace.tasks where id = v_task) is distinct from c_owner
     or (select created_by from crm.party where id = v_party) is distinct from c_owner then
    raise exception 'FIXTURE: a private parent is not owned by the owner seat';
  end if;
  if not iam.has_org_access_for(c_member, v_org) then
    raise exception 'FIXTURE: the office manager is not a member of the practice';
  end if;
  if iam.has_access_for(c_member, 'note', v_note, 'viewer')
     or iam.has_access_for(c_member, 'task', v_task, 'viewer')
     or iam.has_access_for(c_member, 'party', v_party, 'viewer') then
    raise exception 'FIXTURE: the member can already see a private parent -- the suite cannot tell a comment leak from a parent leak';
  end if;
end $$;

-- ════════════════ 1 -- THE OWNER COMMENTS ON HER OWN PRIVATE RECORDS ════════════════
do $$
declare
  c_owner uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  r record; v_id uuid; v_n int; v_fail text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' or auth.uid() <> c_owner then
    raise exception '1: the owner seat was not taken (current_user=%, uid=%)', current_user, auth.uid();
  end if;
  for r in select * from (values
      ('note',  current_setting('rca2.note')::uuid,  'The 3% raise in paragraph 2 is contingent on the scheduling-error rate.'),
      ('task',  current_setting('rca2.task')::uuid,  'Counter at 4.5% first; landlord signalled 5% is his floor.'),
      ('party', current_setting('rca2.party')::uuid, 'Prefers phone after 4pm; do not email the counter-offer.')) t(typ, id, body)
  loop
    begin
      v_id := public.cmt_add(r.typ, r.id, r.body);
      perform set_config('rca2.c_' || r.typ, v_id::text, true);
      select count(*) into v_n from public.cmt_list(r.typ, r.id);
      if v_n <> 1 then v_fail := v_fail || format(' | 1:%s owner cmt_list saw %s, expected 1', r.typ, v_n); end if;
      select count(*) into v_n from platform.comments where id = v_id;
      if v_n <> 1 then v_fail := v_fail || format(' | 1:%s owner cannot read her own comment directly', r.typ); end if;
    exception when others then
      v_fail := v_fail || format(' | 1:%s owner cmt_add refused (%s %s)', r.typ, sqlstate, sqlerrm);
    end;
  end loop;
  perform set_config('rca2.fail', current_setting('rca2.fail') || v_fail, true);
end $$;
reset role;

-- ════════════════ 2 -- A MEMBER WITH NO GRANT: NOTHING READ, NOTHING WRITTEN ════════════════
do $$
declare
  c_member uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  r record; v_n int; v_fail text := ''; v_cid uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_member::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' or auth.uid() <> c_member then
    raise exception '2: the member seat was not taken';
  end if;
  for r in select * from (values
      ('note',  current_setting('rca2.note')::uuid),
      ('task',  current_setting('rca2.task')::uuid),
      ('party', current_setting('rca2.party')::uuid)) t(typ, id)
  loop
    v_cid := nullif(current_setting('rca2.c_' || r.typ, true), '')::uuid;
    -- 2a. The table itself (supabase-js .from('comments') reads through std_select).
    select count(*) into v_n from platform.comments where entity_type = r.typ and entity_id = r.id;
    if v_n <> 0 then v_fail := v_fail || format(' | 2a:%s member READ %s comment(s) on a private parent through the table', r.typ, v_n); end if;
    -- 2b. The read door.
    select count(*) into v_n from public.cmt_list(r.typ, r.id);
    if v_n <> 0 then v_fail := v_fail || format(' | 2b:%s member READ %s comment(s) through cmt_list', r.typ, v_n); end if;
    -- 2c. The write door.
    begin
      perform public.cmt_add(r.typ, r.id, 'Can we talk about this before Friday?');
      v_fail := v_fail || format(' | 2c:%s member ADDED a comment to a private parent', r.typ);
    exception when insufficient_privilege then null;
      when others then v_fail := v_fail || format(' | 2c:%s cmt_add refused with %s, expected 42501', r.typ, sqlstate);
    end;
    -- 2d. The delete door, aimed at the OWNER's comment.
    if v_cid is not null then
      begin
        perform public.cmt_delete(v_cid);
      exception when insufficient_privilege then null;
        when others then v_fail := v_fail || format(' | 2d:%s cmt_delete raised %s, expected 42501', r.typ, sqlstate);
      end;
      -- 2e. The resolve door.
      begin
        perform public.cmt_resolve(v_cid, true);
        v_fail := v_fail || format(' | 2e:%s member RESOLVED the owner''s comment', r.typ);
      exception when insufficient_privilege then null;
        when undefined_function then v_fail := v_fail || ' | 2e: public.cmt_resolve does not exist';
        when others then v_fail := v_fail || format(' | 2e:%s cmt_resolve raised %s, expected 42501', r.typ, sqlstate);
      end;
    end if;
  end loop;
  -- A missing note and an existing but private note both refuse at the same
  -- access check. A 23502 here would disclose that the other ID exists.
  begin
    perform public.cmt_add('note', current_setting('rca2.missing_note')::uuid,
                           'This ID has no note behind it.');
    v_fail := v_fail || ' | 2c:missing note accepted a comment';
  exception when insufficient_privilege then null;
    when others then v_fail := v_fail || format(' | 2c:missing note returned %s instead of 42501', sqlstate);
  end;
  perform set_config('rca2.fail', current_setting('rca2.fail') || v_fail, true);
end $$;
reset role;

-- 2f. As the server: the owner's comments survived the member's delete attempts.
do $$
declare v_n int;
begin
  select count(*) into v_n from platform.comments
   where id in (nullif(current_setting('rca2.c_note', true),'')::uuid,
                nullif(current_setting('rca2.c_task', true),'')::uuid,
                nullif(current_setting('rca2.c_party', true),'')::uuid)
     and deleted_at is not null;
  if v_n > 0 then
    perform set_config('rca2.fail', current_setting('rca2.fail') || format(' | 2f: the member SOFT-DELETED %s of the owner''s comments', v_n), true);
  end if;
  -- The owner shares the review with the office manager at COMMENTER.
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by)
  values ('note', current_setting('rca2.note')::uuid, '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'commenter',
          '87a6e699-3622-4869-8843-d0867456c0dd');
end $$;

-- ════════════════ 3 -- A COMMENTER-LEVEL GRANTEE READS AND ADDS, ON THAT RECORD ONLY ════════════════
do $$
declare
  c_member uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_note uuid := current_setting('rca2.note')::uuid;
  v_n int; v_fail text := ''; v_mine uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_member::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.cmt_list('note', v_note);
  if v_n <> 1 then v_fail := v_fail || format(' | 3a: commenter cmt_list saw %s, expected the owner''s 1', v_n); end if;
  select count(*) into v_n from platform.comments where entity_type = 'note' and entity_id = v_note;
  if v_n <> 1 then v_fail := v_fail || format(' | 3b: commenter direct read saw %s, expected 1', v_n); end if;
  begin
    v_mine := public.cmt_add('note', v_note, 'The error rate was 1.6% for Q3 — the raise holds.');
    perform set_config('rca2.c_mine', v_mine::text, true);
  exception when others then
    v_fail := v_fail || format(' | 3c: commenter cmt_add refused (%s %s)', sqlstate, sqlerrm);
  end;
  if v_mine is not null then
    begin
      perform public.cmt_edit(v_mine, 'The error rate was 1.6% for Q3 and 1.4% for Q4 — the raise holds.');
    exception when others then v_fail := v_fail || format(' | 3d: commenter could not edit her own comment (%s)', sqlstate);
    end;
  end if;
  begin
    perform public.cmt_resolve(current_setting('rca2.c_note')::uuid, true);
  exception when undefined_function then v_fail := v_fail || ' | 3e: public.cmt_resolve does not exist';
    when others then v_fail := v_fail || format(' | 3e: commenter could not resolve (%s %s)', sqlstate, sqlerrm);
  end;
  -- The grant is on the NOTE. The task stays closed.
  select count(*) into v_n from public.cmt_list('task', current_setting('rca2.task')::uuid);
  if v_n <> 0 then v_fail := v_fail || ' | 3f: a grant on the note opened the task''s comments'; end if;
  perform set_config('rca2.fail', current_setting('rca2.fail') || v_fail, true);
end $$;
reset role;

-- As the server: the resolve landed, and the owner narrows the share to VIEWER.
do $$
begin
  if not exists (select 1 from platform.comments
                  where id = current_setting('rca2.c_note')::uuid
                    and (to_jsonb(comments) ->> 'resolved_at') is not null
                    and (to_jsonb(comments) ->> 'resolved_by') = '4060701e-706a-4c76-b3ca-0bbc69fa5a14') then
    perform set_config('rca2.fail', current_setting('rca2.fail') || ' | 3g: the resolve did not record resolved_at/resolved_by', true);
  end if;
  update iam.permissions set permission_level = 'viewer'
   where resource_type = 'note' and resource_id = current_setting('rca2.note')::uuid
     and granted_to_user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
end $$;

-- ════════════════ 4 -- A VIEWER READS THE DISCUSSION AND CANNOT ADD TO IT ════════════════
do $$
declare
  c_member uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_note uuid := current_setting('rca2.note')::uuid;
  v_mine uuid := nullif(current_setting('rca2.c_mine', true), '')::uuid;
  v_n int; v_fail text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_member::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.cmt_list('note', v_note);
  if v_n < 1 then v_fail := v_fail || ' | 4a: a viewer cannot read the comments on a record she may view'; end if;
  begin
    perform public.cmt_add('note', v_note, 'Adding one more thought.');
    v_fail := v_fail || ' | 4b: a VIEWER added a comment';
  exception when insufficient_privilege then null;
    when others then v_fail := v_fail || format(' | 4b: viewer cmt_add raised %s, expected 42501', sqlstate);
  end;
  if v_mine is not null then
    begin
      perform public.cmt_edit(v_mine, 'rewritten by a viewer');
      v_fail := v_fail || ' | 4c: a VIEWER edited a comment (even her own: editing needs commenter)';
    exception when insufficient_privilege then null;
      when others then v_fail := v_fail || format(' | 4c: viewer cmt_edit raised %s, expected 42501', sqlstate);
    end;
  end if;
  begin
    perform public.cmt_resolve(current_setting('rca2.c_note')::uuid, false);
    v_fail := v_fail || ' | 4d: a VIEWER re-opened a thread';
  exception when insufficient_privilege then null;
    when undefined_function then v_fail := v_fail || ' | 4d: public.cmt_resolve does not exist';
    when others then v_fail := v_fail || format(' | 4d: viewer cmt_resolve raised %s, expected 42501', sqlstate);
  end;
  perform set_config('rca2.fail', current_setting('rca2.fail') || v_fail, true);
end $$;
reset role;

-- ════════════════ VERDICT ════════════════
do $$
begin
  if current_setting('rca2.fail') <> '' then
    raise exception 'RC-A2 RED:%', current_setting('rca2.fail');
  end if;
  raise notice 'RC-A2 GREEN: owner reads+adds; member with no grant reads nothing, adds nothing, deletes nothing, resolves nothing on note/task/party; commenter reads+adds+edits+resolves on the shared note only; viewer reads, cannot add, edit or resolve.';
end $$;

rollback;
