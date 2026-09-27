-- chair-step: lane KERNEL-1294 (chair's brief, 2026-09-27, confirmed by the lane: the provisioner is down). TABLE CREATION IS REFUSED PLATFORM-WIDE since aidream 1294_kg_chunks_are_a_detail_of_their_source.sql (production 10:27:19Z) moved iam.has_access_for_base and re-recorded nothing: the provisioner's self-heal ran platform.kernel_equivalence_check(), got ok=false (1 gained: k:interview_session:session_internal:org_owner:admin recorded false, live true) and refused to re-record. FINDING: that answer was NOT moved by 1294. 1294's only kernel edit is the detail-branch resolver (platform.detail_parent_of), which interview_session never reaches (no detail declaration); reversing that one substitution on the live body reproduces 1294's based-on hash byte-exact (2a7ae3d8…). The answer was moved by access ladder T-8c08 (production 2026-09-26 20:26:11Z), which re-classed interview_session confidential -> organization BY RULING (common-docs/policies/access-ladder.md; common-docs/projects/access-ladder/table-review.md, approved Q-2, applied T-8): an Organization-class table has the organization-role lane, so an organization owner holds admin on an internal session of their own organization, the same answer code_repository already records. Proved on the clone (same kernel, fingerprint fb18…): with interview_session confidential the check answers ok; moving only its class to organization (rolled back) gives exactly this one gained answer. The expectation (recorded 19:51Z) predates T-8c08 and the fingerprint cannot see a registry move, so it lay latent until 1294 made the provisioner ask. THIS FILE: (1) refuses unless the live kernel is fb18…, interview_session is Organization-class with the org-role lane, and the check differs from the recording in exactly that one answer (nothing lost, nothing missing, nothing else gained); (2) bumps the fixture to v2 (same world, same questions: the one registry fact it asks through moved); (3) re-derives platform.kernel_equivalence_expected() from platform.kernel_equivalence_answers() (literal below = production's live answers, 340); (4) re-records iam.entity_read_kernel_expected() / iam.entity_read_kernel_members_expected() for the bodies 1294 left (member moved: iam.has_access_for_base); (5) writes the ruling to platform.kernel_fingerprint_record; (6) refuses itself unless the check then answers ok (340, 0 lost, 0 gained, 0 missing), the fingerprint matches and the provisioner preflight no longer names the read kernel. No kernel body and no tenant data change.
-- based-on: platform.kernel_equivalence_answers() 5e117251648e9c9d4efabc90d15d704deeabc3cd8163b7ea6b69915ae8ddc36e
-- based-on: platform.kernel_equivalence_expected() aa35af634fc9dc0fca07ca0e6b17ffb62c0b612f7cc7b71dd63de7f68a5c5a4d
-- based-on: iam.entity_read_kernel_expected() bdea772910e242730b3d488884ceda90b3a38717f98b9b0e978b66781b9e61ae
-- based-on: iam.entity_read_kernel_members_expected() 1797abb762cadda5f92a7a70112b95e729a3c4b1c06bc5b401dfc57f930ce448
-- lane: KERNEL-1294
-- INVERSE: migrations/inverse/kernel1294_an_organization_owner_administers_an_organization_level_interview_session_down.sql

-- 1. THE PREMISE, or nothing changes.
do $pre$
declare v_chk jsonb; v_d jsonb;
begin
  if iam.entity_read_kernel_fingerprint() is distinct from 'fb1827265e2917a924c99014c6e04829' then
    raise exception 'kernel1294: the live access-kernel fingerprint is % but this file was proved against fb1827265e2917a924c99014c6e04829 (the bodies aidream 1294 left); another lane moved a fingerprinted body — re-derive the file.', iam.entity_read_kernel_fingerprint();
  end if;
  if (select et.data_class::text from platform.entity_types et where et.token = 'interview_session' and et.is_active) is distinct from 'organization'
     or not coalesce((iam.class_lanes('interview_session')).org_role_lane, false) then
    raise exception 'kernel1294: the ruling rests on interview_session being Organization-class (access ladder T-8c08) with the organization-role lane; it is %, lanes %. Nothing re-recorded.',
      (select et.data_class from platform.entity_types et where et.token = 'interview_session'), to_jsonb(iam.class_lanes('interview_session'));
  end if;
  v_chk := platform.kernel_equivalence_check();
  v_d := coalesce(v_chk->'differed', '[]'::jsonb);
  if v_chk->>'error' is not null or (v_chk->>'lost')::int <> 0 or (v_chk->>'missing')::int <> 0 or (v_chk->>'gained')::int > 1
     or exists (select 1 from jsonb_array_elements_text(v_d) x where x not like 'k:interview_session:session_internal:org_owner:admin recorded false, live true') then
    raise exception 'kernel1294: the kernel answers differ from the recording in more than the one answer this ruling covers (k:interview_session:session_internal:org_owner:admin); nothing re-recorded. Check: %', v_chk - 'answers';
  end if;
  raise notice 'kernel1294: before — %', v_chk - 'read_lane';
end $pre$;

-- 2. THE FIXTURE, v2 (body identical but for the version line and its comment).
CREATE OR REPLACE FUNCTION platform.kernel_equivalence_answers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- v2 (lane KERNEL-1294, 2026-09-27): the fixture's interview_session is Organization-class since
  -- access ladder T-8c08 (2026-09-26 20:26Z). Same world, same questions; one recorded answer moved.
  c_version constant text := 'v2';
  c_org     constant uuid := 'f1ce0000-0000-4000-8000-0000000000d1';
  c_home    constant uuid := 'f1ce0000-0000-4000-8000-0000000000f0';
  c_people  constant text[] := array['author', 'org_owner', 'member', 'grantee', 'stranger'];
  c_names   constant text[] := array['Marisol Vega', 'Owen Pruitt', 'Keiko Tran', 'Rafael Duarte', 'Lena Holt'];
  c_ids     constant uuid[] := array['f1ce0000-0000-4000-8000-0000000000a1', 'f1ce0000-0000-4000-8000-0000000000a2',
                                     'f1ce0000-0000-4000-8000-0000000000a3', 'f1ce0000-0000-4000-8000-0000000000a4',
                                     'f1ce0000-0000-4000-8000-0000000000a5']::uuid[];
  c_levels  constant public.permission_level[] := array['viewer', 'commenter', 'editor', 'admin']::public.permission_level[];
  v_t0      timestamptz := clock_timestamp();
  v_ans     jsonb := '{}'::jsonb;
  v_things  jsonb := '[]'::jsonb;
  v_err     text;
  v_qual    text;
  v_b       boolean;
  v_set     uuid[];
  v_tbl     uuid;
  v_fields  jsonb := jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text'));
  i         integer;
  t         jsonb;
  lvl       public.permission_level;
begin
  -- Two callers never build the world at once (fixed ids); held to the caller's commit.
  perform pg_advisory_xact_lock(hashtext('platform.kernel_equivalence_fixture'));
  begin
    perform set_config('app.actor_system', 'kernel_equivalence_fixture', true);
    -- THE WORLD IS BUILT BY NOBODY (lane PROVISION-BATCH-FIX, 2026-09-26). The fixture used to
    -- inherit the CALLER's signed-in identity, so a provision run by a person (request.jwt.claims
    -- sub set, e.g. admin@admin.com) could never heal: inserting the fixture's people fired the
    -- signup-organization guard (42501)
    -- and the heal refused an equivalent kernel. Cleared here, inside the subtransaction, so the
    -- rollback below gives the caller its identity back untouched.
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    for i in 1 .. 5 loop
      insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
      values (c_ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              lower(replace(c_names[i], ' ', '.')) || '.kernel-fixture@aimatrx.com',
              jsonb_build_object('display_name', c_names[i]), now(), now());
    end loop;
    insert into iam.organizations (id, name, slug, abbreviation, created_by)
    values (c_org, 'Harbor Point Dental Studio', 'harbor-point-dental-kernel-fixture', 'HPD', c_ids[2]);
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
      (c_org, 'organization', c_org, c_ids[2], 'owner',  'active'),
      (c_org, 'organization', c_org, c_ids[1], 'member', 'active'),
      (c_org, 'organization', c_org, c_ids[3], 'member', 'active');

    insert into code.code_repositories (id, organization_id, name, created_by, visibility) values
      ('f1ce0000-0000-4000-8000-0000000000b1', c_org, 'patient-reminder-scripts', c_ids[1], 'internal'),
      ('f1ce0000-0000-4000-8000-0000000000b2', c_org, 'marisol-scratch-notes',    c_ids[1], 'personal'),
      ('f1ce0000-0000-4000-8000-0000000000b3', c_org, 'public-booking-widget',    c_ids[1], 'public'),
      ('f1ce0000-0000-4000-8000-0000000000b4', c_org, 'insurance-claim-exports',  c_ids[1], 'personal'),
      ('f1ce0000-0000-4000-8000-0000000000b5', c_org, 'front-desk-templates',     c_ids[1], 'internal');
    insert into interview.session (id, organization_id, created_by, visibility) values
      ('f1ce0000-0000-4000-8000-0000000000c1', c_org, c_ids[1], 'internal'),
      ('f1ce0000-0000-4000-8000-0000000000c2', c_org, c_ids[1], 'personal'),
      ('f1ce0000-0000-4000-8000-0000000000c3', c_org, c_ids[1], 'personal');
    insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by) values
      ('code_repository',   'f1ce0000-0000-4000-8000-0000000000b4', c_ids[4], 'viewer',    c_ids[1]),
      ('code_repository',   'f1ce0000-0000-4000-8000-0000000000b5', c_ids[4], 'editor',    c_ids[1]),
      ('interview_session', 'f1ce0000-0000-4000-8000-0000000000c3', c_ids[3], 'commenter', c_ids[1]);
    insert into platform.comments (id, organization_id, entity_type, entity_id, body, created_by) values
      ('f1ce0000-0000-4000-8000-0000000000e1', c_org, 'code_repository', 'f1ce0000-0000-4000-8000-0000000000b1',
       'Can we move the reminder send to 9am?', c_ids[3]),
      ('f1ce0000-0000-4000-8000-0000000000e2', c_org, 'code_repository', 'f1ce0000-0000-4000-8000-0000000000b4',
       'Claim export for Q3 looks right.', c_ids[4]);

    -- The record store: a home, an open Table and a "mine" Table (its record personal, its rows
    -- internal — the shape SHARE-LANE-2 walled the organization roles out of).
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
    values (c_home, c_org, '11111111-0000-4000-8000-000000000004', 'record', '{"name": "Front desk"}', c_ids[2]);
    v_tbl := custom.table_declare(c_org, jsonb_build_object(
      'name', 'Patient recall list', 'slug', 'kf_recall', 'label_singular', 'Patient', 'label_plural', 'Patients',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
      'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true, 'fields', v_fields,
      'title_field', 'title', 'parent_id', c_home::text));
    update custom.record set created_by = c_ids[1] where organization_id = c_org and id = v_tbl;
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
    values ('f1ce0000-0000-4000-8000-0000000000f1', c_org, v_tbl, 'record',
            '{"title": "Recall: Jonah Ellis, 6-month cleaning"}', c_ids[1]);
    v_tbl := custom.table_declare(c_org, jsonb_build_object(
      'name', 'My chairside notes', 'slug', 'kf_notes', 'label_singular', 'Note', 'label_plural', 'Notes',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
      'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true, 'fields', v_fields,
      'title_field', 'title', 'parent_id', c_home::text));
    update custom.record set created_by = c_ids[1], visibility = 'personal' where organization_id = c_org and id = v_tbl;
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
    values ('f1ce0000-0000-4000-8000-0000000000f2', c_org, v_tbl, 'record',
            '{"title": "Crown prep went long, book 90 min next time"}', c_ids[1]);

    v_things := '[
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_internal","id":"f1ce0000-0000-4000-8000-0000000000b1","sets":true},
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_personal","id":"f1ce0000-0000-4000-8000-0000000000b2","sets":true},
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_public","id":"f1ce0000-0000-4000-8000-0000000000b3","sets":true},
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_personal_shared_viewer","id":"f1ce0000-0000-4000-8000-0000000000b4","sets":true},
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_internal_shared_editor","id":"f1ce0000-0000-4000-8000-0000000000b5","sets":true},
      {"token":"interview_session","schema":"interview","table":"session","thing":"session_internal","id":"f1ce0000-0000-4000-8000-0000000000c1","sets":true},
      {"token":"interview_session","schema":"interview","table":"session","thing":"session_personal","id":"f1ce0000-0000-4000-8000-0000000000c2","sets":true},
      {"token":"interview_session","schema":"interview","table":"session","thing":"session_personal_shared_commenter","id":"f1ce0000-0000-4000-8000-0000000000c3","sets":true},
      {"token":"comment","schema":"platform","table":"comments","thing":"comment_on_internal_repo","id":"f1ce0000-0000-4000-8000-0000000000e1","sets":false},
      {"token":"comment","schema":"platform","table":"comments","thing":"comment_on_shared_personal_repo","id":"f1ce0000-0000-4000-8000-0000000000e2","sets":false},
      {"token":"record","schema":"custom","table":"record","thing":"row_of_an_open_table","id":"f1ce0000-0000-4000-8000-0000000000f1","sets":false},
      {"token":"record","schema":"custom","table":"record","thing":"row_of_a_mine_table","id":"f1ce0000-0000-4000-8000-0000000000f2","sets":false}
    ]'::jsonb;

    for t in select x from jsonb_array_elements(v_things) x loop
      select p.qual into v_qual from pg_policies p
       where p.schemaname = t->>'schema' and p.tablename = t->>'table' and p.policyname = 'std_select';
      for i in 1 .. 5 loop
        perform set_config('request.jwt.claims',
          json_build_object('sub', c_ids[i], 'role', 'authenticated')::text, true);
        foreach lvl in array c_levels loop
          v_ans := v_ans || jsonb_build_object(
            format('k:%s:%s:%s:%s', t->>'token', t->>'thing', c_people[i], lvl),
            iam.has_access_for(c_ids[i], t->>'token', (t->>'id')::uuid, lvl));
        end loop;
        if v_qual is null then
          v_b := null;
        else
          execute format('select exists (select 1 from %I.%I where id = $1 and (%s))', t->>'schema', t->>'table', v_qual)
            into v_b using (t->>'id')::uuid;
        end if;
        v_ans := v_ans || jsonb_build_object(format('p:%s:%s:%s', t->>'token', t->>'thing', c_people[i]), v_b);
        if (t->>'sets')::boolean then
          v_set := iam.accessible_entity_ids(t->>'token', 'viewer'::public.permission_level, 0, true);
          v_ans := v_ans || jsonb_build_object(format('s:%s:%s:%s', t->>'token', t->>'thing', c_people[i]),
                                               (t->>'id')::uuid = any (coalesce(v_set, '{}'::uuid[])));
        end if;
      end loop;
    end loop;

    -- Everything above is undone here, every time: the world never outlives the question.
    raise exception using errcode = 'KF000', message = 'kernel equivalence fixture rolled back';
  exception
    when sqlstate 'KF000' then null;
    when others then
      v_err := sqlstate || ': ' || sqlerrm;
  end;
  return jsonb_build_object('version', c_version, 'answers', v_ans, 'error', v_err,
                            'ms', round((extract(epoch from clock_timestamp() - v_t0) * 1000)::numeric, 1));
end;
$function$;
revoke all on function platform.kernel_equivalence_answers() from public, anon, authenticated;

-- 3. THE RECORDING, re-derived from select platform.kernel_equivalence_answers() on production (v2,
-- 340 answers; the one that moved: k:interview_session:session_internal:org_owner:admin false -> true). Never edited by hand.
CREATE OR REPLACE FUNCTION platform.kernel_equivalence_expected()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT '{"answers": {"p:record:row_of_a_mine_table:author": true, "p:record:row_of_a_mine_table:member": true, "p:code_repository:repo_public:author": true, "p:code_repository:repo_public:member": true, "p:record:row_of_a_mine_table:grantee": false, "p:record:row_of_an_open_table:author": true, "p:record:row_of_an_open_table:member": true, "s:code_repository:repo_public:author": true, "s:code_repository:repo_public:member": true, "p:code_repository:repo_public:grantee": true, "p:record:row_of_a_mine_table:stranger": false, "p:record:row_of_an_open_table:grantee": false, "s:code_repository:repo_public:grantee": true, "p:code_repository:repo_internal:author": true, "p:code_repository:repo_internal:member": true, "p:code_repository:repo_personal:author": true, "p:code_repository:repo_personal:member": false, "p:code_repository:repo_public:stranger": true, "p:record:row_of_a_mine_table:org_owner": true, "p:record:row_of_an_open_table:stranger": false, "s:code_repository:repo_internal:author": true, "s:code_repository:repo_internal:member": true, "s:code_repository:repo_personal:author": true, "s:code_repository:repo_personal:member": false, "s:code_repository:repo_public:stranger": true, "p:code_repository:repo_internal:grantee": false, "p:code_repository:repo_personal:grantee": false, "p:code_repository:repo_public:org_owner": true, "p:record:row_of_an_open_table:org_owner": true, "s:code_repository:repo_internal:grantee": false, "s:code_repository:repo_personal:grantee": false, "s:code_repository:repo_public:org_owner": true, "p:code_repository:repo_internal:stranger": false, "p:code_repository:repo_personal:stranger": false, "s:code_repository:repo_internal:stranger": false, "s:code_repository:repo_personal:stranger": false, "k:record:row_of_a_mine_table:author:admin": true, "k:record:row_of_a_mine_table:member:admin": false, "p:code_repository:repo_internal:org_owner": true, "p:code_repository:repo_personal:org_owner": false, "p:comment:comment_on_internal_repo:author": true, "p:comment:comment_on_internal_repo:member": true, "s:code_repository:repo_internal:org_owner": true, "s:code_repository:repo_personal:org_owner": false, "k:code_repository:repo_public:author:admin": true, "k:code_repository:repo_public:member:admin": false, "k:record:row_of_a_mine_table:author:editor": true, "k:record:row_of_a_mine_table:author:viewer": true, "k:record:row_of_a_mine_table:grantee:admin": false, "k:record:row_of_a_mine_table:member:editor": false, "k:record:row_of_a_mine_table:member:viewer": false, "k:record:row_of_an_open_table:author:admin": true, "k:record:row_of_an_open_table:member:admin": false, "p:comment:comment_on_internal_repo:grantee": false, "k:code_repository:repo_public:author:editor": true, "k:code_repository:repo_public:author:viewer": true, "k:code_repository:repo_public:grantee:admin": false, "k:code_repository:repo_public:member:editor": true, "k:code_repository:repo_public:member:viewer": true, "k:record:row_of_a_mine_table:grantee:editor": false, "k:record:row_of_a_mine_table:grantee:viewer": false, "k:record:row_of_a_mine_table:stranger:admin": false, "k:record:row_of_an_open_table:author:editor": true, "k:record:row_of_an_open_table:author:viewer": true, "k:record:row_of_an_open_table:grantee:admin": false, "k:record:row_of_an_open_table:member:editor": false, "k:record:row_of_an_open_table:member:viewer": true, "p:comment:comment_on_internal_repo:stranger": false, "p:interview_session:session_internal:author": true, "p:interview_session:session_internal:member": true, "p:interview_session:session_personal:author": true, "p:interview_session:session_personal:member": false, "s:interview_session:session_internal:author": true, "s:interview_session:session_internal:member": true, "s:interview_session:session_personal:author": true, "s:interview_session:session_personal:member": false, "k:code_repository:repo_internal:author:admin": true, "k:code_repository:repo_internal:member:admin": false, "k:code_repository:repo_personal:author:admin": true, "k:code_repository:repo_personal:member:admin": false, "k:code_repository:repo_public:grantee:editor": false, "k:code_repository:repo_public:grantee:viewer": true, "k:code_repository:repo_public:stranger:admin": false, "k:record:row_of_a_mine_table:org_owner:admin": false, "k:record:row_of_a_mine_table:stranger:editor": false, "k:record:row_of_a_mine_table:stranger:viewer": false, "k:record:row_of_an_open_table:grantee:editor": false, "k:record:row_of_an_open_table:grantee:viewer": false, "k:record:row_of_an_open_table:stranger:admin": false, "p:comment:comment_on_internal_repo:org_owner": true, "p:interview_session:session_internal:grantee": false, "p:interview_session:session_personal:grantee": false, "s:interview_session:session_internal:grantee": false, "s:interview_session:session_personal:grantee": false, "k:code_repository:repo_internal:author:editor": true, "k:code_repository:repo_internal:author:viewer": true, "k:code_repository:repo_internal:grantee:admin": false, "k:code_repository:repo_internal:member:editor": true, "k:code_repository:repo_internal:member:viewer": true, "k:code_repository:repo_personal:author:editor": true, "k:code_repository:repo_personal:author:viewer": true, "k:code_repository:repo_personal:grantee:admin": false, "k:code_repository:repo_personal:member:editor": false, "k:code_repository:repo_personal:member:viewer": false, "k:code_repository:repo_public:org_owner:admin": true, "k:code_repository:repo_public:stranger:editor": false, "k:code_repository:repo_public:stranger:viewer": true, "k:record:row_of_a_mine_table:author:commenter": true, "k:record:row_of_a_mine_table:member:commenter": false, "k:record:row_of_a_mine_table:org_owner:editor": false, "k:record:row_of_a_mine_table:org_owner:viewer": false, "k:record:row_of_an_open_table:org_owner:admin": true, "k:record:row_of_an_open_table:stranger:editor": false, "k:record:row_of_an_open_table:stranger:viewer": false, "p:interview_session:session_internal:stranger": false, "p:interview_session:session_personal:stranger": false, "s:interview_session:session_internal:stranger": false, "s:interview_session:session_personal:stranger": false, "k:code_repository:repo_internal:grantee:editor": false, "k:code_repository:repo_internal:grantee:viewer": false, "k:code_repository:repo_internal:stranger:admin": false, "k:code_repository:repo_personal:grantee:editor": false, "k:code_repository:repo_personal:grantee:viewer": false, "k:code_repository:repo_personal:stranger:admin": false, "k:code_repository:repo_public:author:commenter": true, "k:code_repository:repo_public:member:commenter": true, "k:code_repository:repo_public:org_owner:editor": true, "k:code_repository:repo_public:org_owner:viewer": true, "k:record:row_of_a_mine_table:grantee:commenter": false, "k:record:row_of_an_open_table:author:commenter": true, "k:record:row_of_an_open_table:member:commenter": false, "k:record:row_of_an_open_table:org_owner:editor": true, "k:record:row_of_an_open_table:org_owner:viewer": true, "p:interview_session:session_internal:org_owner": true, "p:interview_session:session_personal:org_owner": false, "s:interview_session:session_internal:org_owner": true, "s:interview_session:session_personal:org_owner": false, "k:code_repository:repo_internal:org_owner:admin": true, "k:code_repository:repo_internal:stranger:editor": false, "k:code_repository:repo_internal:stranger:viewer": false, "k:code_repository:repo_personal:org_owner:admin": false, "k:code_repository:repo_personal:stranger:editor": false, "k:code_repository:repo_personal:stranger:viewer": false, "k:code_repository:repo_public:grantee:commenter": false, "k:comment:comment_on_internal_repo:author:admin": true, "k:comment:comment_on_internal_repo:member:admin": true, "k:record:row_of_a_mine_table:stranger:commenter": false, "k:record:row_of_an_open_table:grantee:commenter": false, "k:code_repository:repo_internal:author:commenter": true, "k:code_repository:repo_internal:member:commenter": true, "k:code_repository:repo_internal:org_owner:editor": true, "k:code_repository:repo_internal:org_owner:viewer": true, "k:code_repository:repo_personal:author:commenter": true, "k:code_repository:repo_personal:member:commenter": false, "k:code_repository:repo_personal:org_owner:editor": false, "k:code_repository:repo_personal:org_owner:viewer": false, "k:code_repository:repo_public:stranger:commenter": false, "k:comment:comment_on_internal_repo:author:editor": false, "k:comment:comment_on_internal_repo:author:viewer": true, "k:comment:comment_on_internal_repo:grantee:admin": false, "k:comment:comment_on_internal_repo:member:editor": true, "k:comment:comment_on_internal_repo:member:viewer": true, "k:record:row_of_a_mine_table:org_owner:commenter": false, "k:record:row_of_an_open_table:stranger:commenter": false, "p:comment:comment_on_shared_personal_repo:author": true, "p:comment:comment_on_shared_personal_repo:member": false, "k:code_repository:repo_internal:grantee:commenter": false, "k:code_repository:repo_personal:grantee:commenter": false, "k:code_repository:repo_public:org_owner:commenter": true, "k:comment:comment_on_internal_repo:grantee:editor": false, "k:comment:comment_on_internal_repo:grantee:viewer": false, "k:comment:comment_on_internal_repo:stranger:admin": false, "k:interview_session:session_internal:author:admin": true, "k:interview_session:session_internal:member:admin": false, "k:interview_session:session_personal:author:admin": true, "k:interview_session:session_personal:member:admin": false, "k:record:row_of_an_open_table:org_owner:commenter": true, "p:comment:comment_on_shared_personal_repo:grantee": true, "k:code_repository:repo_internal:stranger:commenter": false, "k:code_repository:repo_personal:stranger:commenter": false, "k:comment:comment_on_internal_repo:org_owner:admin": true, "k:comment:comment_on_internal_repo:stranger:editor": false, "k:comment:comment_on_internal_repo:stranger:viewer": false, "k:interview_session:session_internal:author:editor": true, "k:interview_session:session_internal:author:viewer": true, "k:interview_session:session_internal:grantee:admin": false, "k:interview_session:session_internal:member:editor": true, "k:interview_session:session_internal:member:viewer": true, "k:interview_session:session_personal:author:editor": true, "k:interview_session:session_personal:author:viewer": true, "k:interview_session:session_personal:grantee:admin": false, "k:interview_session:session_personal:member:editor": false, "k:interview_session:session_personal:member:viewer": false, "p:comment:comment_on_shared_personal_repo:stranger": false, "k:code_repository:repo_internal:org_owner:commenter": true, "k:code_repository:repo_personal:org_owner:commenter": false, "k:comment:comment_on_internal_repo:author:commenter": true, "k:comment:comment_on_internal_repo:member:commenter": true, "k:comment:comment_on_internal_repo:org_owner:editor": false, "k:comment:comment_on_internal_repo:org_owner:viewer": true, "k:interview_session:session_internal:grantee:editor": false, "k:interview_session:session_internal:grantee:viewer": false, "k:interview_session:session_internal:stranger:admin": false, "k:interview_session:session_personal:grantee:editor": false, "k:interview_session:session_personal:grantee:viewer": false, "k:interview_session:session_personal:stranger:admin": false, "p:comment:comment_on_shared_personal_repo:org_owner": false, "k:comment:comment_on_internal_repo:grantee:commenter": false, "k:interview_session:session_internal:org_owner:admin": true, "k:interview_session:session_internal:stranger:editor": false, "k:interview_session:session_internal:stranger:viewer": false, "k:interview_session:session_personal:org_owner:admin": false, "k:interview_session:session_personal:stranger:editor": false, "k:interview_session:session_personal:stranger:viewer": false, "p:code_repository:repo_internal_shared_editor:author": true, "p:code_repository:repo_internal_shared_editor:member": true, "p:code_repository:repo_personal_shared_viewer:author": true, "p:code_repository:repo_personal_shared_viewer:member": false, "s:code_repository:repo_internal_shared_editor:author": true, "s:code_repository:repo_internal_shared_editor:member": true, "s:code_repository:repo_personal_shared_viewer:author": true, "s:code_repository:repo_personal_shared_viewer:member": false, "k:comment:comment_on_internal_repo:stranger:commenter": false, "k:interview_session:session_internal:author:commenter": true, "k:interview_session:session_internal:member:commenter": true, "k:interview_session:session_internal:org_owner:editor": true, "k:interview_session:session_internal:org_owner:viewer": true, "k:interview_session:session_personal:author:commenter": true, "k:interview_session:session_personal:member:commenter": false, "k:interview_session:session_personal:org_owner:editor": false, "k:interview_session:session_personal:org_owner:viewer": false, "p:code_repository:repo_internal_shared_editor:grantee": true, "p:code_repository:repo_personal_shared_viewer:grantee": true, "s:code_repository:repo_internal_shared_editor:grantee": true, "s:code_repository:repo_personal_shared_viewer:grantee": true, "k:comment:comment_on_internal_repo:org_owner:commenter": true, "k:comment:comment_on_shared_personal_repo:author:admin": true, "k:comment:comment_on_shared_personal_repo:member:admin": false, "k:interview_session:session_internal:grantee:commenter": false, "k:interview_session:session_personal:grantee:commenter": false, "p:code_repository:repo_internal_shared_editor:stranger": false, "p:code_repository:repo_personal_shared_viewer:stranger": false, "s:code_repository:repo_internal_shared_editor:stranger": false, "s:code_repository:repo_personal_shared_viewer:stranger": false, "k:comment:comment_on_shared_personal_repo:author:editor": false, "k:comment:comment_on_shared_personal_repo:author:viewer": true, "k:comment:comment_on_shared_personal_repo:grantee:admin": false, "k:comment:comment_on_shared_personal_repo:member:editor": false, "k:comment:comment_on_shared_personal_repo:member:viewer": false, "k:interview_session:session_internal:stranger:commenter": false, "k:interview_session:session_personal:stranger:commenter": false, "p:code_repository:repo_internal_shared_editor:org_owner": true, "p:code_repository:repo_personal_shared_viewer:org_owner": false, "s:code_repository:repo_internal_shared_editor:org_owner": true, "s:code_repository:repo_personal_shared_viewer:org_owner": false, "k:comment:comment_on_shared_personal_repo:grantee:editor": false, "k:comment:comment_on_shared_personal_repo:grantee:viewer": true, "k:comment:comment_on_shared_personal_repo:stranger:admin": false, "k:interview_session:session_internal:org_owner:commenter": true, "k:interview_session:session_personal:org_owner:commenter": false, "k:comment:comment_on_shared_personal_repo:org_owner:admin": false, "k:comment:comment_on_shared_personal_repo:stranger:editor": false, "k:comment:comment_on_shared_personal_repo:stranger:viewer": false, "k:code_repository:repo_internal_shared_editor:author:admin": true, "k:code_repository:repo_internal_shared_editor:member:admin": false, "k:code_repository:repo_personal_shared_viewer:author:admin": true, "k:code_repository:repo_personal_shared_viewer:member:admin": false, "k:comment:comment_on_shared_personal_repo:author:commenter": true, "k:comment:comment_on_shared_personal_repo:member:commenter": false, "k:comment:comment_on_shared_personal_repo:org_owner:editor": false, "k:comment:comment_on_shared_personal_repo:org_owner:viewer": false, "k:code_repository:repo_internal_shared_editor:author:editor": true, "k:code_repository:repo_internal_shared_editor:author:viewer": true, "k:code_repository:repo_internal_shared_editor:grantee:admin": false, "k:code_repository:repo_internal_shared_editor:member:editor": true, "k:code_repository:repo_internal_shared_editor:member:viewer": true, "k:code_repository:repo_personal_shared_viewer:author:editor": true, "k:code_repository:repo_personal_shared_viewer:author:viewer": true, "k:code_repository:repo_personal_shared_viewer:grantee:admin": false, "k:code_repository:repo_personal_shared_viewer:member:editor": false, "k:code_repository:repo_personal_shared_viewer:member:viewer": false, "k:comment:comment_on_shared_personal_repo:grantee:commenter": false, "k:code_repository:repo_internal_shared_editor:grantee:editor": true, "k:code_repository:repo_internal_shared_editor:grantee:viewer": true, "k:code_repository:repo_internal_shared_editor:stranger:admin": false, "k:code_repository:repo_personal_shared_viewer:grantee:editor": false, "k:code_repository:repo_personal_shared_viewer:grantee:viewer": true, "k:code_repository:repo_personal_shared_viewer:stranger:admin": false, "k:comment:comment_on_shared_personal_repo:stranger:commenter": false, "p:interview_session:session_personal_shared_commenter:author": true, "p:interview_session:session_personal_shared_commenter:member": true, "s:interview_session:session_personal_shared_commenter:author": true, "s:interview_session:session_personal_shared_commenter:member": true, "k:code_repository:repo_internal_shared_editor:org_owner:admin": true, "k:code_repository:repo_internal_shared_editor:stranger:editor": false, "k:code_repository:repo_internal_shared_editor:stranger:viewer": false, "k:code_repository:repo_personal_shared_viewer:org_owner:admin": false, "k:code_repository:repo_personal_shared_viewer:stranger:editor": false, "k:code_repository:repo_personal_shared_viewer:stranger:viewer": false, "k:comment:comment_on_shared_personal_repo:org_owner:commenter": false, "p:interview_session:session_personal_shared_commenter:grantee": false, "s:interview_session:session_personal_shared_commenter:grantee": false, "k:code_repository:repo_internal_shared_editor:author:commenter": true, "k:code_repository:repo_internal_shared_editor:member:commenter": true, "k:code_repository:repo_internal_shared_editor:org_owner:editor": true, "k:code_repository:repo_internal_shared_editor:org_owner:viewer": true, "k:code_repository:repo_personal_shared_viewer:author:commenter": true, "k:code_repository:repo_personal_shared_viewer:member:commenter": false, "k:code_repository:repo_personal_shared_viewer:org_owner:editor": false, "k:code_repository:repo_personal_shared_viewer:org_owner:viewer": false, "p:interview_session:session_personal_shared_commenter:stranger": false, "s:interview_session:session_personal_shared_commenter:stranger": false, "k:code_repository:repo_internal_shared_editor:grantee:commenter": true, "k:code_repository:repo_personal_shared_viewer:grantee:commenter": false, "p:interview_session:session_personal_shared_commenter:org_owner": false, "s:interview_session:session_personal_shared_commenter:org_owner": false, "k:code_repository:repo_internal_shared_editor:stranger:commenter": false, "k:code_repository:repo_personal_shared_viewer:stranger:commenter": false, "k:code_repository:repo_internal_shared_editor:org_owner:commenter": true, "k:code_repository:repo_personal_shared_viewer:org_owner:commenter": false, "k:interview_session:session_personal_shared_commenter:author:admin": true, "k:interview_session:session_personal_shared_commenter:member:admin": false, "k:interview_session:session_personal_shared_commenter:author:editor": true, "k:interview_session:session_personal_shared_commenter:author:viewer": true, "k:interview_session:session_personal_shared_commenter:grantee:admin": false, "k:interview_session:session_personal_shared_commenter:member:editor": false, "k:interview_session:session_personal_shared_commenter:member:viewer": true, "k:interview_session:session_personal_shared_commenter:grantee:editor": false, "k:interview_session:session_personal_shared_commenter:grantee:viewer": false, "k:interview_session:session_personal_shared_commenter:stranger:admin": false, "k:interview_session:session_personal_shared_commenter:org_owner:admin": false, "k:interview_session:session_personal_shared_commenter:stranger:editor": false, "k:interview_session:session_personal_shared_commenter:stranger:viewer": false, "k:interview_session:session_personal_shared_commenter:author:commenter": true, "k:interview_session:session_personal_shared_commenter:member:commenter": true, "k:interview_session:session_personal_shared_commenter:org_owner:editor": false, "k:interview_session:session_personal_shared_commenter:org_owner:viewer": false, "k:interview_session:session_personal_shared_commenter:grantee:commenter": false, "k:interview_session:session_personal_shared_commenter:stranger:commenter": false, "k:interview_session:session_personal_shared_commenter:org_owner:commenter": false}, "version": "v2"}'::jsonb
$function$;
revoke all on function platform.kernel_equivalence_expected() from public, anon, authenticated;

-- 4. THE FINGERPRINT, re-recorded for the bodies aidream 1294 left (the same two literal bodies the
-- provisioner's heal writes).
CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT 'fb1827265e2917a924c99014c6e04829'::text
$function$;
CREATE OR REPLACE FUNCTION iam.entity_read_kernel_members_expected()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT '{"members": {"files.is_crawl_artifact(p_file_id uuid)": "7eb586213cedff72ee4abb4dd60a0433", "iam.has_org_access_for(p_user_id uuid, p_org uuid)": "ca4adbe46e1778b5c2ef8bad18ee0d7a", "public.is_pack_curator(p_user uuid, p_pack_id uuid)": "5e6f2b3c9c4f0f9011655974ef1532b7", "public.is_org_admin_for(p_user_id uuid, p_org_id uuid)": "d130a594ece79535bc39f8da5abadc57", "files.crawl_site_conveys(p_user_id uuid, p_file_id uuid)": "5fadac4e0d1ad31e788cdb446422d8fc", "public._edu_can_read_via_assignment(p_type text, p_id uuid)": "d97bbb3323238c5b8afb88e3e6337434", "public.is_rulebook_curator(p_user uuid, p_rulebook_id uuid)": "b781c4c0210974d680f53a603cb723aa", "public.library_is_open(p_entity_type text, p_entity_id uuid)": "36c934bb956df459e334c15085aacd30", "public.user_can_read_data_store_via_grant(p_user uuid, p_store uuid)": "63b3fd7f798351c9c8e7517fcfedc3fc", "public._edu_can_read_via_assignment(p_user_id uuid, p_type text, p_id uuid)": "a0d7ac13ea23ec81b8eb15bbb87e3cbb", "public.user_can_read_via_library_grant(p_user uuid, p_type text, p_id uuid)": "a49b44fa2f0de5d3aecace9d950f49e4", "files.has_access_for(p_user_id uuid, p_file_id uuid, p_required permission_level)": "d324b5143d4172b0a6b8b8188930ff7b", "iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer)": "9fe155aa00093efd6fc9c89ab94b8479", "iam.has_access_for(p_user_id uuid, p_type text, p_id uuid, p_required permission_level)": "c7e2eec401c991f06be4bf28453548e5", "iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level)": "e37fdacb359b9a528d7aef6b2bfb5270", "iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer, p_include_public boolean)": "dc003f958ac5ff51e8aefab870d3cc41", "iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean)": "e6b147f6962003e0dc2c8b826ef4ee06", "public.has_permission_for(p_user_id uuid, p_resource_type text, p_resource_id uuid, p_required_permission permission_level)": "9dc1eecf01de31f4db0b0e07b1665a2b", "iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean, p_path text[])": "4899f64c34f0c6acf90aef5b84432b74", "platform.entity_row_access_attrs(p_schema text, p_table text, p_id uuid, OUT o_vis platform.visibility, OUT o_owner uuid, OUT o_org uuid, OUT o_found boolean)": "4cab0999cad6cee27fa4c6804d2f0955"}, "fingerprint": "fb1827265e2917a924c99014c6e04829"}'::jsonb
$function$;

-- 5. THE PROOF, and the ruling on the record.
do $post$
declare v_chk jsonb; v_pre jsonb;
begin
  v_chk := platform.kernel_equivalence_check();
  if not coalesce((v_chk->>'ok')::boolean, false) or (v_chk->>'answers')::int <> 340
     or (v_chk->>'lost')::int <> 0 or (v_chk->>'gained')::int <> 0 or (v_chk->>'missing')::int <> 0
     or v_chk->>'version' is distinct from 'v2' then
    raise exception 'kernel1294: after the re-derive the equivalence check still does not answer ok with 340 answers: %', v_chk - 'answers';
  end if;
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'kernel1294: re-recorded % but the live fingerprint reads %', iam.entity_read_kernel_expected(), iam.entity_read_kernel_fingerprint();
  end if;
  -- The preflight's read-kernel finding is gone (its session findings — statement_timeout, the
  -- age of this transaction — are about a provision riding in this file, not about the kernel).
  v_pre := platform.provision_preflight();
  if exists (select 1 from jsonb_array_elements(coalesce(v_pre->'findings', '[]'::jsonb)) f
              where f->>'rule_id' = 'preflight.read_kernel') then
    raise exception 'kernel1294: the provisioner preflight still names the read kernel after the re-record: %', v_pre;
  end if;
  insert into platform.kernel_fingerprint_record
    (fingerprint_from, fingerprint_to, members_changed, ruling, fixture_version, evidence, via, target)
  values ('e72704b5e1e9571de9970b91a7d7f0f1', 'fb1827265e2917a924c99014c6e04829',
          array['iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean, p_path text[])'],
          'KERNEL-1294 ruling (2026-09-27): NOT a regression of aidream 1294, and BY RULING. 1294 changed exactly one thing in iam.has_access_for_base: the detail branch now resolves its parent through platform.detail_parent_of (the pre-1294 body is the live body with that one substitution reversed, sha256 2a7ae3d8..., byte-exact); that branch runs only for a token platform.detail_parent_columns declares, and interview_session declares none. The answer that moved (k:interview_session:session_internal:org_owner:admin: recorded false, live true) was moved by access ladder T-8c08 (matrx-frontend access_ladder_t8c08_tables_move_to_their_level.sql, production 2026-09-26 20:26:11Z): it re-classed interview_session confidential -> organization, which turns on iam.class_lanes().org_role_lane, so an organization owner (an organization admin) holds admin on an internal session of their own organization, exactly as on code_repository (k:code_repository:repo_internal:org_owner:admin, recorded true). Law: common-docs/policies/access-ladder.md (Organization: every table starts here; Confidential only by Arman''s approval) and common-docs/projects/access-ladder/table-review.md (interview.session moves to Organization; approved Q-2, applied T-8). The expectation was recorded 2026-09-26 19:51Z, 35 minutes before T-8c08, and the fingerprint cannot see a registry move, so the stale expectation lay latent until 1294 moved the fingerprint and made the provisioner ask. Re-recorded: platform.kernel_equivalence_expected() re-derived from platform.kernel_equivalence_answers() (fixture v1 -> v2, 340 answers, 1 moved) and the fingerprint e72704b5e1e9571de9970b91a7d7f0f1 -> fb1827265e2917a924c99014c6e04829.',
          'v2',
          jsonb_build_object('after', v_chk - 'answers',
                             'moved_answer', jsonb_build_object('key', 'k:interview_session:session_internal:org_owner:admin', 'recorded', false, 'live', true),
                             'mover_of_the_answer', 'matrx-frontend/access_ladder_t8c08_tables_move_to_their_level.sql (production 2026-09-26 20:26:11Z)',
                             'mover_of_the_fingerprint', 'aidream/db/migrations/1294_kg_chunks_are_a_detail_of_their_source.sql (production 2026-09-27 10:27:19Z)',
                             'pre_1294_body_sha256', '2a7ae3d8d4029b9cae6a6344ceb6f95490b781215f661001f7888c65297d4bfe'),
          'campaign kernel1294_an_organization_owner_administers_an_organization_level_interview_session.sql / lane KERNEL-1294',
          'iam.has_access_for_base (aidream 1294) + platform.kernel_equivalence_expected (access ladder T-8c08)');
  raise notice 'kernel1294: after — %', v_chk - 'read_lane';
end $post$;
