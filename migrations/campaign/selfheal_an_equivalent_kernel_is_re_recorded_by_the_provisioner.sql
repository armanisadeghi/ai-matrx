-- chair-step: lane PROVISIONER-SELF-HEAL (chair's ruling, 2026-09-25). A STALE ACCESS-KERNEL FINGERPRINT NO LONGER STOPS TABLE CREATION BLINDLY. platform.provision / provision_batch refused every spec whenever iam.entity_read_kernel_fingerprint() moved without a re-record: 20:38–21:04Z (SHARE-LANE-2) and 21:51–22:48Z (rca2b, from outside the program), 83 minutes of refused table creation on production in one day; KERNEL-TAILS made the refusal a logged row, not a recovery. Now, when stale-kernel is the preflight's ONLY finding, the provisioner runs the kernel's own equivalence self-check in the same call: platform.kernel_equivalence_check() builds a fixed, versioned fixture (Harbor Point Dental Studio: 5 people, 12 things across code_repository / interview_session / comment / record) inside a subtransaction it always rolls back, asks 340 questions (iam.has_access_for at all four levels, the DEPLOYED std_select policy text per person — the read lane, per table — and iam.accessible_entity_ids), and compares them with the answers recorded here (platform.kernel_equivalence_expected, v1, identical on the clone and production; ~1.2 s on production). Identical -> the provisioner re-records iam.entity_read_kernel_expected() and iam.entity_read_kernel_members_expected() itself (the same literal bodies a campaign file writes), writes a platform.kernel_fingerprint_record row (the changed members and the ruling "auto re-recorded after equivalence passed") and ONE ops.system_error row of kind kernel_fingerprint_auto_rerecorded, warns, adds `kernel_fingerprint` to its answer, and provisions. Not identical (lost, gained, missing, or the fixture could not be built) -> the logged provisioner_fingerprint_stale refusal as before, now carrying the equivalence evidence and a remedy that says so. Any other preflight finding alongside it -> no heal, the old path. REPLACES platform.provision, platform.provision_batch (the preflight branch, one declaration, the success answers wrapped) and platform._provisioner_refuses_a_stale_kernel (the evidence). NEW: the record table, the four functions. No kernel body and no fingerprint changes here (asserted at the end). Proof: scripts/campaign-tests/selfheal_green.sql. Nightly report: scripts/night/kernel-fingerprint-auto-rerecords.sh (from clone-catchup.sh). No data write.
-- based-on: iam.entity_read_kernel_expected() 87bf06d772e53a32f08fc606b85bb85b6e321646096958f3d9bab0ba13c93ac0
-- based-on: iam.entity_read_kernel_members_expected() a06316d224e78f2836e727a16d768000f0e388b376c5b70235dc317353129c43
-- based-on: platform._provisioner_refuses_a_stale_kernel(jsonb, jsonb, text, uuid, text) d450f0145151f7c3b7d913ace1d99f9ce9bab3d7bed5c49eb46d8bfdc6e69803
-- based-on: platform.provision(jsonb, text, uuid, text) 3a468e88ab4719af022ec75d5d1a35c52b6235bdad6cc13af48e396e8077895b
-- based-on: platform.provision_batch(jsonb, text, uuid, text) 9b2f368b4ec0ab02a575294e4706f0c18b1e603cfea7d739fbd8622813804c37
-- lane: PROVISIONER-SELF-HEAL
-- INVERSE: migrations/inverse/selfheal_an_equivalent_kernel_is_re_recorded_by_the_provisioner_down.sql
set local lock_timeout = '30s';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. THE RECORD OF EVERY RE-RECORDING THE PROVISIONER MAKES ITSELF. One row per automatic
--    re-record: the fingerprint it moved from and to, the kernel members whose bodies changed,
--    the ruling it acted under, and the equivalence evidence it acted on. History: never updated
--    after the row that wrote it, never deleted. Machinery, not a person's data: RLS on, no
--    policy, no client grant; read by the nightly (scripts/night/kernel-fingerprint-auto-rerecords.sh)
--    and by an operator as postgres.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists platform.kernel_fingerprint_record (
  id                uuid primary key default gen_random_uuid(),
  recorded_at       timestamptz not null default now(),
  fingerprint_from  text,
  fingerprint_to    text not null,
  members_changed   text[] not null default '{}'::text[],
  ruling            text not null,
  fixture_version   text,
  evidence          jsonb not null default '{}'::jsonb,
  via               text not null,
  target            text,
  system_error_id   uuid,
  session_role      text not null default current_user
);
comment on table platform.kernel_fingerprint_record is
  'lane PROVISIONER-SELF-HEAL (2026-09-25, chair''s ruling): one row per access-kernel fingerprint the provisioner re-recorded ITSELF after the kernel equivalence self-check (platform.kernel_equivalence_check) answered identically on the fixed fixture. Written only by platform._provisioner_heals_a_stale_kernel; each row has a twin ops.system_error row of kind kernel_fingerprint_auto_rerecorded. Reported nightly by scripts/night/kernel-fingerprint-auto-rerecords.sh.';
alter table platform.kernel_fingerprint_record enable row level security;
revoke all on table platform.kernel_fingerprint_record from public, anon, authenticated;
create index if not exists kernel_fingerprint_record_recorded_at on platform.kernel_fingerprint_record (recorded_at desc);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE FIXED FIXTURE, AND THE KERNEL'S ANSWERS ON IT.
--    A small, versioned world that exists only inside a SUBTRANSACTION this function always rolls
--    back: nothing it builds survives the call and it reads no tenant's data. Harbor Point Dental
--    Studio, five people and twelve things:
--      author     Marisol Vega   plain member; made everything below
--      org_owner  Owen Pruitt    the organization's owner
--      member     Keiko Tran     plain member
--      grantee    Rafael Duarte  outside consultant, not a member; named on two repositories
--      stranger   Lena Holt      no relation to anything here
--    code_repository (organization class): internal, personal, public, personal shared to the
--      grantee at viewer, internal shared to the grantee at editor
--    interview_session (confidential class): internal, personal, personal shared to the member at
--      commenter
--    comment (detail, RC-A2b): one on the internal repository by the member, one on the shared
--      personal repository by the grantee
--    record (the record store, SHARE-LANE-2): a row of an open Table, a row of a "mine" Table
--    Three questions per (person, thing):
--      k:<token>:<thing>:<person>:<level>  iam.has_access_for at viewer/commenter/editor/admin
--      p:<token>:<thing>:<person>          the DEPLOYED std_select policy text, as that person
--                                          (the read lane iam.entity_read_expr mirrors)
--      s:<token>:<thing>:<person>          iam.accessible_entity_ids(token, viewer, 0, true)
--                                          (for the two tokens whose policy reads it)
--    Bump c_version whenever the world changes, and re-derive platform.kernel_equivalence_expected().
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.kernel_equivalence_answers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_version constant text := 'v1';
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

-- THE RECORDING: what the kernel answered on the fixture when this file was proved (clone and
-- production identical, 340 answers, 1180.5 ms on production). Two p: answers differ from the
-- kernel ON PURPOSE and are recorded as they stand: custom.record's std_select text still carries
-- an owner/admin arm at `internal` (SHARE-LANE-2 "left behind"), unreachable by a client because
-- authenticated holds no SELECT on custom.record — p:record:row_of_a_mine_table:org_owner and :member.
CREATE OR REPLACE FUNCTION platform.kernel_equivalence_expected()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT '{"version": "v1", "answers": {"k:code_repository:repo_internal:author:admin": true, "k:code_repository:repo_internal:author:commenter": true, "k:code_repository:repo_internal:author:editor": true, "k:code_repository:repo_internal:author:viewer": true, "k:code_repository:repo_internal:grantee:admin": false, "k:code_repository:repo_internal:grantee:commenter": false, "k:code_repository:repo_internal:grantee:editor": false, "k:code_repository:repo_internal:grantee:viewer": false, "k:code_repository:repo_internal:member:admin": false, "k:code_repository:repo_internal:member:commenter": true, "k:code_repository:repo_internal:member:editor": true, "k:code_repository:repo_internal:member:viewer": true, "k:code_repository:repo_internal:org_owner:admin": true, "k:code_repository:repo_internal:org_owner:commenter": true, "k:code_repository:repo_internal:org_owner:editor": true, "k:code_repository:repo_internal:org_owner:viewer": true, "k:code_repository:repo_internal:stranger:admin": false, "k:code_repository:repo_internal:stranger:commenter": false, "k:code_repository:repo_internal:stranger:editor": false, "k:code_repository:repo_internal:stranger:viewer": false, "k:code_repository:repo_internal_shared_editor:author:admin": true, "k:code_repository:repo_internal_shared_editor:author:commenter": true, "k:code_repository:repo_internal_shared_editor:author:editor": true, "k:code_repository:repo_internal_shared_editor:author:viewer": true, "k:code_repository:repo_internal_shared_editor:grantee:admin": false, "k:code_repository:repo_internal_shared_editor:grantee:commenter": true, "k:code_repository:repo_internal_shared_editor:grantee:editor": true, "k:code_repository:repo_internal_shared_editor:grantee:viewer": true, "k:code_repository:repo_internal_shared_editor:member:admin": false, "k:code_repository:repo_internal_shared_editor:member:commenter": true, "k:code_repository:repo_internal_shared_editor:member:editor": true, "k:code_repository:repo_internal_shared_editor:member:viewer": true, "k:code_repository:repo_internal_shared_editor:org_owner:admin": true, "k:code_repository:repo_internal_shared_editor:org_owner:commenter": true, "k:code_repository:repo_internal_shared_editor:org_owner:editor": true, "k:code_repository:repo_internal_shared_editor:org_owner:viewer": true, "k:code_repository:repo_internal_shared_editor:stranger:admin": false, "k:code_repository:repo_internal_shared_editor:stranger:commenter": false, "k:code_repository:repo_internal_shared_editor:stranger:editor": false, "k:code_repository:repo_internal_shared_editor:stranger:viewer": false, "k:code_repository:repo_personal:author:admin": true, "k:code_repository:repo_personal:author:commenter": true, "k:code_repository:repo_personal:author:editor": true, "k:code_repository:repo_personal:author:viewer": true, "k:code_repository:repo_personal:grantee:admin": false, "k:code_repository:repo_personal:grantee:commenter": false, "k:code_repository:repo_personal:grantee:editor": false, "k:code_repository:repo_personal:grantee:viewer": false, "k:code_repository:repo_personal:member:admin": false, "k:code_repository:repo_personal:member:commenter": false, "k:code_repository:repo_personal:member:editor": false, "k:code_repository:repo_personal:member:viewer": false, "k:code_repository:repo_personal:org_owner:admin": false, "k:code_repository:repo_personal:org_owner:commenter": false, "k:code_repository:repo_personal:org_owner:editor": false, "k:code_repository:repo_personal:org_owner:viewer": false, "k:code_repository:repo_personal:stranger:admin": false, "k:code_repository:repo_personal:stranger:commenter": false, "k:code_repository:repo_personal:stranger:editor": false, "k:code_repository:repo_personal:stranger:viewer": false, "k:code_repository:repo_personal_shared_viewer:author:admin": true, "k:code_repository:repo_personal_shared_viewer:author:commenter": true, "k:code_repository:repo_personal_shared_viewer:author:editor": true, "k:code_repository:repo_personal_shared_viewer:author:viewer": true, "k:code_repository:repo_personal_shared_viewer:grantee:admin": false, "k:code_repository:repo_personal_shared_viewer:grantee:commenter": false, "k:code_repository:repo_personal_shared_viewer:grantee:editor": false, "k:code_repository:repo_personal_shared_viewer:grantee:viewer": true, "k:code_repository:repo_personal_shared_viewer:member:admin": false, "k:code_repository:repo_personal_shared_viewer:member:commenter": false, "k:code_repository:repo_personal_shared_viewer:member:editor": false, "k:code_repository:repo_personal_shared_viewer:member:viewer": false, "k:code_repository:repo_personal_shared_viewer:org_owner:admin": false, "k:code_repository:repo_personal_shared_viewer:org_owner:commenter": false, "k:code_repository:repo_personal_shared_viewer:org_owner:editor": false, "k:code_repository:repo_personal_shared_viewer:org_owner:viewer": false, "k:code_repository:repo_personal_shared_viewer:stranger:admin": false, "k:code_repository:repo_personal_shared_viewer:stranger:commenter": false, "k:code_repository:repo_personal_shared_viewer:stranger:editor": false, "k:code_repository:repo_personal_shared_viewer:stranger:viewer": false, "k:code_repository:repo_public:author:admin": true, "k:code_repository:repo_public:author:commenter": true, "k:code_repository:repo_public:author:editor": true, "k:code_repository:repo_public:author:viewer": true, "k:code_repository:repo_public:grantee:admin": false, "k:code_repository:repo_public:grantee:commenter": false, "k:code_repository:repo_public:grantee:editor": false, "k:code_repository:repo_public:grantee:viewer": true, "k:code_repository:repo_public:member:admin": false, "k:code_repository:repo_public:member:commenter": true, "k:code_repository:repo_public:member:editor": true, "k:code_repository:repo_public:member:viewer": true, "k:code_repository:repo_public:org_owner:admin": true, "k:code_repository:repo_public:org_owner:commenter": true, "k:code_repository:repo_public:org_owner:editor": true, "k:code_repository:repo_public:org_owner:viewer": true, "k:code_repository:repo_public:stranger:admin": false, "k:code_repository:repo_public:stranger:commenter": false, "k:code_repository:repo_public:stranger:editor": false, "k:code_repository:repo_public:stranger:viewer": true, "k:comment:comment_on_internal_repo:author:admin": true, "k:comment:comment_on_internal_repo:author:commenter": true, "k:comment:comment_on_internal_repo:author:editor": false, "k:comment:comment_on_internal_repo:author:viewer": true, "k:comment:comment_on_internal_repo:grantee:admin": false, "k:comment:comment_on_internal_repo:grantee:commenter": false, "k:comment:comment_on_internal_repo:grantee:editor": false, "k:comment:comment_on_internal_repo:grantee:viewer": false, "k:comment:comment_on_internal_repo:member:admin": true, "k:comment:comment_on_internal_repo:member:commenter": true, "k:comment:comment_on_internal_repo:member:editor": true, "k:comment:comment_on_internal_repo:member:viewer": true, "k:comment:comment_on_internal_repo:org_owner:admin": true, "k:comment:comment_on_internal_repo:org_owner:commenter": true, "k:comment:comment_on_internal_repo:org_owner:editor": false, "k:comment:comment_on_internal_repo:org_owner:viewer": true, "k:comment:comment_on_internal_repo:stranger:admin": false, "k:comment:comment_on_internal_repo:stranger:commenter": false, "k:comment:comment_on_internal_repo:stranger:editor": false, "k:comment:comment_on_internal_repo:stranger:viewer": false, "k:comment:comment_on_shared_personal_repo:author:admin": true, "k:comment:comment_on_shared_personal_repo:author:commenter": true, "k:comment:comment_on_shared_personal_repo:author:editor": false, "k:comment:comment_on_shared_personal_repo:author:viewer": true, "k:comment:comment_on_shared_personal_repo:grantee:admin": false, "k:comment:comment_on_shared_personal_repo:grantee:commenter": false, "k:comment:comment_on_shared_personal_repo:grantee:editor": false, "k:comment:comment_on_shared_personal_repo:grantee:viewer": true, "k:comment:comment_on_shared_personal_repo:member:admin": false, "k:comment:comment_on_shared_personal_repo:member:commenter": false, "k:comment:comment_on_shared_personal_repo:member:editor": false, "k:comment:comment_on_shared_personal_repo:member:viewer": false, "k:comment:comment_on_shared_personal_repo:org_owner:admin": false, "k:comment:comment_on_shared_personal_repo:org_owner:commenter": false, "k:comment:comment_on_shared_personal_repo:org_owner:editor": false, "k:comment:comment_on_shared_personal_repo:org_owner:viewer": false, "k:comment:comment_on_shared_personal_repo:stranger:admin": false, "k:comment:comment_on_shared_personal_repo:stranger:commenter": false, "k:comment:comment_on_shared_personal_repo:stranger:editor": false, "k:comment:comment_on_shared_personal_repo:stranger:viewer": false, "k:interview_session:session_internal:author:admin": true, "k:interview_session:session_internal:author:commenter": true, "k:interview_session:session_internal:author:editor": true, "k:interview_session:session_internal:author:viewer": true, "k:interview_session:session_internal:grantee:admin": false, "k:interview_session:session_internal:grantee:commenter": false, "k:interview_session:session_internal:grantee:editor": false, "k:interview_session:session_internal:grantee:viewer": false, "k:interview_session:session_internal:member:admin": false, "k:interview_session:session_internal:member:commenter": true, "k:interview_session:session_internal:member:editor": true, "k:interview_session:session_internal:member:viewer": true, "k:interview_session:session_internal:org_owner:admin": false, "k:interview_session:session_internal:org_owner:commenter": true, "k:interview_session:session_internal:org_owner:editor": true, "k:interview_session:session_internal:org_owner:viewer": true, "k:interview_session:session_internal:stranger:admin": false, "k:interview_session:session_internal:stranger:commenter": false, "k:interview_session:session_internal:stranger:editor": false, "k:interview_session:session_internal:stranger:viewer": false, "k:interview_session:session_personal:author:admin": true, "k:interview_session:session_personal:author:commenter": true, "k:interview_session:session_personal:author:editor": true, "k:interview_session:session_personal:author:viewer": true, "k:interview_session:session_personal:grantee:admin": false, "k:interview_session:session_personal:grantee:commenter": false, "k:interview_session:session_personal:grantee:editor": false, "k:interview_session:session_personal:grantee:viewer": false, "k:interview_session:session_personal:member:admin": false, "k:interview_session:session_personal:member:commenter": false, "k:interview_session:session_personal:member:editor": false, "k:interview_session:session_personal:member:viewer": false, "k:interview_session:session_personal:org_owner:admin": false, "k:interview_session:session_personal:org_owner:commenter": false, "k:interview_session:session_personal:org_owner:editor": false, "k:interview_session:session_personal:org_owner:viewer": false, "k:interview_session:session_personal:stranger:admin": false, "k:interview_session:session_personal:stranger:commenter": false, "k:interview_session:session_personal:stranger:editor": false, "k:interview_session:session_personal:stranger:viewer": false, "k:interview_session:session_personal_shared_commenter:author:admin": true, "k:interview_session:session_personal_shared_commenter:author:commenter": true, "k:interview_session:session_personal_shared_commenter:author:editor": true, "k:interview_session:session_personal_shared_commenter:author:viewer": true, "k:interview_session:session_personal_shared_commenter:grantee:admin": false, "k:interview_session:session_personal_shared_commenter:grantee:commenter": false, "k:interview_session:session_personal_shared_commenter:grantee:editor": false, "k:interview_session:session_personal_shared_commenter:grantee:viewer": false, "k:interview_session:session_personal_shared_commenter:member:admin": false, "k:interview_session:session_personal_shared_commenter:member:commenter": true, "k:interview_session:session_personal_shared_commenter:member:editor": false, "k:interview_session:session_personal_shared_commenter:member:viewer": true, "k:interview_session:session_personal_shared_commenter:org_owner:admin": false, "k:interview_session:session_personal_shared_commenter:org_owner:commenter": false, "k:interview_session:session_personal_shared_commenter:org_owner:editor": false, "k:interview_session:session_personal_shared_commenter:org_owner:viewer": false, "k:interview_session:session_personal_shared_commenter:stranger:admin": false, "k:interview_session:session_personal_shared_commenter:stranger:commenter": false, "k:interview_session:session_personal_shared_commenter:stranger:editor": false, "k:interview_session:session_personal_shared_commenter:stranger:viewer": false, "k:record:row_of_a_mine_table:author:admin": true, "k:record:row_of_a_mine_table:author:commenter": true, "k:record:row_of_a_mine_table:author:editor": true, "k:record:row_of_a_mine_table:author:viewer": true, "k:record:row_of_a_mine_table:grantee:admin": false, "k:record:row_of_a_mine_table:grantee:commenter": false, "k:record:row_of_a_mine_table:grantee:editor": false, "k:record:row_of_a_mine_table:grantee:viewer": false, "k:record:row_of_a_mine_table:member:admin": false, "k:record:row_of_a_mine_table:member:commenter": false, "k:record:row_of_a_mine_table:member:editor": false, "k:record:row_of_a_mine_table:member:viewer": false, "k:record:row_of_a_mine_table:org_owner:admin": false, "k:record:row_of_a_mine_table:org_owner:commenter": false, "k:record:row_of_a_mine_table:org_owner:editor": false, "k:record:row_of_a_mine_table:org_owner:viewer": false, "k:record:row_of_a_mine_table:stranger:admin": false, "k:record:row_of_a_mine_table:stranger:commenter": false, "k:record:row_of_a_mine_table:stranger:editor": false, "k:record:row_of_a_mine_table:stranger:viewer": false, "k:record:row_of_an_open_table:author:admin": true, "k:record:row_of_an_open_table:author:commenter": true, "k:record:row_of_an_open_table:author:editor": true, "k:record:row_of_an_open_table:author:viewer": true, "k:record:row_of_an_open_table:grantee:admin": false, "k:record:row_of_an_open_table:grantee:commenter": false, "k:record:row_of_an_open_table:grantee:editor": false, "k:record:row_of_an_open_table:grantee:viewer": false, "k:record:row_of_an_open_table:member:admin": false, "k:record:row_of_an_open_table:member:commenter": false, "k:record:row_of_an_open_table:member:editor": false, "k:record:row_of_an_open_table:member:viewer": true, "k:record:row_of_an_open_table:org_owner:admin": true, "k:record:row_of_an_open_table:org_owner:commenter": true, "k:record:row_of_an_open_table:org_owner:editor": true, "k:record:row_of_an_open_table:org_owner:viewer": true, "k:record:row_of_an_open_table:stranger:admin": false, "k:record:row_of_an_open_table:stranger:commenter": false, "k:record:row_of_an_open_table:stranger:editor": false, "k:record:row_of_an_open_table:stranger:viewer": false, "p:code_repository:repo_internal:author": true, "p:code_repository:repo_internal:grantee": false, "p:code_repository:repo_internal:member": true, "p:code_repository:repo_internal:org_owner": true, "p:code_repository:repo_internal:stranger": false, "p:code_repository:repo_internal_shared_editor:author": true, "p:code_repository:repo_internal_shared_editor:grantee": true, "p:code_repository:repo_internal_shared_editor:member": true, "p:code_repository:repo_internal_shared_editor:org_owner": true, "p:code_repository:repo_internal_shared_editor:stranger": false, "p:code_repository:repo_personal:author": true, "p:code_repository:repo_personal:grantee": false, "p:code_repository:repo_personal:member": false, "p:code_repository:repo_personal:org_owner": false, "p:code_repository:repo_personal:stranger": false, "p:code_repository:repo_personal_shared_viewer:author": true, "p:code_repository:repo_personal_shared_viewer:grantee": true, "p:code_repository:repo_personal_shared_viewer:member": false, "p:code_repository:repo_personal_shared_viewer:org_owner": false, "p:code_repository:repo_personal_shared_viewer:stranger": false, "p:code_repository:repo_public:author": true, "p:code_repository:repo_public:grantee": true, "p:code_repository:repo_public:member": true, "p:code_repository:repo_public:org_owner": true, "p:code_repository:repo_public:stranger": true, "p:comment:comment_on_internal_repo:author": true, "p:comment:comment_on_internal_repo:grantee": false, "p:comment:comment_on_internal_repo:member": true, "p:comment:comment_on_internal_repo:org_owner": true, "p:comment:comment_on_internal_repo:stranger": false, "p:comment:comment_on_shared_personal_repo:author": true, "p:comment:comment_on_shared_personal_repo:grantee": true, "p:comment:comment_on_shared_personal_repo:member": false, "p:comment:comment_on_shared_personal_repo:org_owner": false, "p:comment:comment_on_shared_personal_repo:stranger": false, "p:interview_session:session_internal:author": true, "p:interview_session:session_internal:grantee": false, "p:interview_session:session_internal:member": true, "p:interview_session:session_internal:org_owner": true, "p:interview_session:session_internal:stranger": false, "p:interview_session:session_personal:author": true, "p:interview_session:session_personal:grantee": false, "p:interview_session:session_personal:member": false, "p:interview_session:session_personal:org_owner": false, "p:interview_session:session_personal:stranger": false, "p:interview_session:session_personal_shared_commenter:author": true, "p:interview_session:session_personal_shared_commenter:grantee": false, "p:interview_session:session_personal_shared_commenter:member": true, "p:interview_session:session_personal_shared_commenter:org_owner": false, "p:interview_session:session_personal_shared_commenter:stranger": false, "p:record:row_of_a_mine_table:author": true, "p:record:row_of_a_mine_table:grantee": false, "p:record:row_of_a_mine_table:member": true, "p:record:row_of_a_mine_table:org_owner": true, "p:record:row_of_a_mine_table:stranger": false, "p:record:row_of_an_open_table:author": true, "p:record:row_of_an_open_table:grantee": false, "p:record:row_of_an_open_table:member": true, "p:record:row_of_an_open_table:org_owner": true, "p:record:row_of_an_open_table:stranger": false, "s:code_repository:repo_internal:author": true, "s:code_repository:repo_internal:grantee": false, "s:code_repository:repo_internal:member": true, "s:code_repository:repo_internal:org_owner": true, "s:code_repository:repo_internal:stranger": false, "s:code_repository:repo_internal_shared_editor:author": true, "s:code_repository:repo_internal_shared_editor:grantee": true, "s:code_repository:repo_internal_shared_editor:member": true, "s:code_repository:repo_internal_shared_editor:org_owner": true, "s:code_repository:repo_internal_shared_editor:stranger": false, "s:code_repository:repo_personal:author": true, "s:code_repository:repo_personal:grantee": false, "s:code_repository:repo_personal:member": false, "s:code_repository:repo_personal:org_owner": false, "s:code_repository:repo_personal:stranger": false, "s:code_repository:repo_personal_shared_viewer:author": true, "s:code_repository:repo_personal_shared_viewer:grantee": true, "s:code_repository:repo_personal_shared_viewer:member": false, "s:code_repository:repo_personal_shared_viewer:org_owner": false, "s:code_repository:repo_personal_shared_viewer:stranger": false, "s:code_repository:repo_public:author": true, "s:code_repository:repo_public:grantee": true, "s:code_repository:repo_public:member": true, "s:code_repository:repo_public:org_owner": true, "s:code_repository:repo_public:stranger": true, "s:interview_session:session_internal:author": true, "s:interview_session:session_internal:grantee": false, "s:interview_session:session_internal:member": true, "s:interview_session:session_internal:org_owner": true, "s:interview_session:session_internal:stranger": false, "s:interview_session:session_personal:author": true, "s:interview_session:session_personal:grantee": false, "s:interview_session:session_personal:member": false, "s:interview_session:session_personal:org_owner": false, "s:interview_session:session_personal:stranger": false, "s:interview_session:session_personal_shared_commenter:author": true, "s:interview_session:session_personal_shared_commenter:grantee": false, "s:interview_session:session_personal_shared_commenter:member": true, "s:interview_session:session_personal_shared_commenter:org_owner": false, "s:interview_session:session_personal_shared_commenter:stranger": false}}'::jsonb
$function$;
revoke all on function platform.kernel_equivalence_expected() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE CHECK: the live answers against the recorded ones (platform.kernel_equivalence_expected,
--    written below from the answers this kernel gave when this file was proved).
--      lost    recorded true,  live not true  -> an access denial
--      gained  recorded false, live true      -> a leak (a planted arm that opens a stranger)
--      missing a key on one side only          -> the fixture and the recording disagree on shape
--    ok only when all three are 0, the versions agree and the fixture built.
--    read_lane is the table-level view (N tables identical, 0 lost, 0 gained) of the p: answers.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.kernel_equivalence_check()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_live   jsonb := platform.kernel_equivalence_answers();
  v_exp    jsonb := platform.kernel_equivalence_expected();
  v_la     jsonb := coalesce(v_live->'answers', '{}'::jsonb);
  v_ea     jsonb := coalesce(v_exp->'answers', '{}'::jsonb);
  v_lost   text[]; v_gained text[]; v_missing text[];
  v_tables jsonb;
  v_ok     boolean;
begin
  select coalesce(array_agg(k order by k) filter (where (v_ea->>k)::boolean is true  and (v_la->>k)::boolean is not true and v_la ? k), '{}'),
         coalesce(array_agg(k order by k) filter (where (v_ea->>k)::boolean is false and (v_la->>k)::boolean is true), '{}'),
         coalesce(array_agg(k order by k) filter (where not (v_la ? k) or not (v_ea ? k)), '{}')
    into v_lost, v_gained, v_missing
    from (select jsonb_object_keys(v_ea) k union select jsonb_object_keys(v_la)) keys;

  select coalesce(jsonb_object_agg(tok, jsonb_build_object('compared', n, 'lost', l, 'gained', g)), '{}'::jsonb)
    into v_tables
    from (select split_part(k, ':', 2) tok, count(*) n,
                 count(*) filter (where k = any (v_lost)) l,
                 count(*) filter (where k = any (v_gained)) g
            from jsonb_object_keys(v_ea) k where k like 'p:%' group by 1) s;

  v_ok := v_live->>'error' is null
          and (v_live->>'version') is not distinct from (v_exp->>'version')
          and cardinality(v_lost) = 0 and cardinality(v_gained) = 0 and cardinality(v_missing) = 0
          and v_ea <> '{}'::jsonb;

  return jsonb_build_object(
    'ok', v_ok,
    'version', v_live->>'version', 'recorded_version', v_exp->>'version',
    'ms', v_live->'ms', 'error', v_live->>'error',
    'answers', (select count(*) from jsonb_object_keys(v_la)),
    'lost', cardinality(v_lost), 'gained', cardinality(v_gained), 'missing', cardinality(v_missing),
    'read_lane', jsonb_build_object(
      'tables', (select count(*) from jsonb_object_keys(v_tables)),
      'identical', (select count(*) from jsonb_each(v_tables) e where (e.value->>'lost')::int = 0 and (e.value->>'gained')::int = 0),
      'by_table', v_tables),
    'levels', jsonb_build_object(
      'answers', (select count(*) from jsonb_object_keys(v_la) k where k like 'k:%'),
      'lost', (select count(*) from unnest(v_lost) k where k like 'k:%'),
      'gained', (select count(*) from unnest(v_gained) k where k like 'k:%')),
    'differed', to_jsonb((select array_agg(x) from (
        select k || ' recorded ' || coalesce(v_ea->>k, 'absent') || ', live ' || coalesce(v_la->>k, 'absent') x
          from unnest(v_lost || v_gained || v_missing) k limit 20) d)));
end;
$function$;
revoke all on function platform.kernel_equivalence_check() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE HEAL. Called by platform.provision / provision_batch ONLY when the preflight's one and
--    only finding is preflight.read_kernel. Serialized; re-reads the fingerprint after the lock
--    (another transaction may have re-recorded while this one waited). Runs the equivalence check;
--    on ok it re-records iam.entity_read_kernel_expected() and iam.entity_read_kernel_members_expected()
--    exactly the way a campaign file does by hand (a literal body), writes the record row and ONE
--    ops.system_error row of kind kernel_fingerprint_auto_rerecorded, warns, and returns healed.
--    On a failed check it writes nothing and returns healed false with the evidence; the caller
--    refuses with the logged provisioner_fingerprint_stale row, as before.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform._provisioner_heals_a_stale_kernel(p_spec jsonb, p_pre jsonb, p_applied_via text, p_org_id uuid, p_lane text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  c_ruling  constant text := 'auto re-recorded after equivalence passed';
  v_fp_from text;
  v_fp_to   text;
  v_live    jsonb;
  v_rec     jsonb;
  v_moved   text[];
  v_check   jsonb;
  v_target  text;
  v_org     uuid;
  v_uid     uuid := auth.uid();
  v_msg     text;
  v_rid     uuid;
  v_eid     uuid;
  v_out     jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('platform.kernel_fingerprint_rerecord'));
  v_fp_from := iam.entity_read_kernel_expected();
  v_fp_to   := iam.entity_read_kernel_fingerprint();
  if v_fp_to is not distinct from v_fp_from then
    return jsonb_build_object('healed', true, 'already', true, 'fingerprint', v_fp_to);
  end if;

  v_check := platform.kernel_equivalence_check();
  if not coalesce((v_check->>'ok')::boolean, false) then
    return jsonb_build_object('healed', false, 'equivalence', v_check);
  end if;

  v_live := iam.entity_read_kernel_members_live();
  v_rec  := coalesce(iam.entity_read_kernel_members_expected()->'members', '{}'::jsonb);
  select coalesce(array_agg(k order by k), '{}'::text[]) into v_moved from (
    select k || case when v_rec ? k then '' else ' (added)' end as k
      from jsonb_object_keys(v_live) k where (v_rec->>k) is distinct from (v_live->>k)
    union
    select k || ' (removed)' from jsonb_object_keys(v_rec) k where not v_live ? k
  ) s;

  -- The same two bodies a campaign file writes by hand (kerneltails_the_kernel_fingerprint_names_the_comment_ruling.sql).
  execute format($ddl$CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $f$
  SELECT %L::text
$f$$ddl$, v_fp_to);
  execute format($ddl$CREATE OR REPLACE FUNCTION iam.entity_read_kernel_members_expected()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $f$
  SELECT %L::jsonb
$f$$ddl$, jsonb_build_object('fingerprint', v_fp_to, 'members', v_live)::text);

  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'platform._provisioner_heals_a_stale_kernel: re-recorded % but the live fingerprint now reads %.',
      iam.entity_read_kernel_expected(), iam.entity_read_kernel_fingerprint();
  end if;

  v_target := case
    when jsonb_typeof(p_spec->'tables') = 'array' then
      format('a batch of %s table(s) (%s)', jsonb_array_length(p_spec->'tables'),
             (select string_agg(coalesce(t->>'schema', '?') || '.' || coalesce(t->>'table', '?'), ', ')
                from jsonb_array_elements(p_spec->'tables') t))
    else coalesce(p_spec->>'schema', '?') || '.' || coalesce(p_spec->>'table', '?') end;
  v_org := coalesce(p_org_id, (select so.organization_id from iam.system_orgs so where so.key = 'system'));

  insert into platform.kernel_fingerprint_record
    (fingerprint_from, fingerprint_to, members_changed, ruling, fixture_version, evidence, via, target)
  values (v_fp_from, v_fp_to, v_moved, c_ruling, v_check->>'version', v_check,
          coalesce(p_applied_via, '?') || ' / lane ' || coalesce(p_lane, '?'), v_target)
  returning id into v_rid;

  v_msg := format(
    'The access kernel''s recorded fingerprint was stale when the provisioner was asked for %s (token %s, via %s, lane %s): '
    'the live kernel bodies hash to %s, the recorded value was %s. Changed: %s. '
    'The kernel equivalence self-check ran on its fixed fixture (%s, %s answers, %s ms): %s of %s tables identical on the read lane, '
    '0 lost, 0 gained, every access level identical. So the provisioner re-recorded the fingerprint itself (%s; platform.kernel_fingerprint_record %s) and provisioned.',
    v_target, coalesce(p_spec->>'token', '(none)'), coalesce(p_applied_via, '?'), coalesce(p_lane, '?'),
    v_fp_to, v_fp_from,
    case when cardinality(v_moved) = 0 then 'no member named (only the expectation moved)' else array_to_string(v_moved, ', ') end,
    v_check->>'version', v_check->>'answers', v_check->>'ms',
    v_check->'read_lane'->>'identical', v_check->'read_lane'->>'tables',
    c_ruling, v_rid);

  insert into ops.system_error (kind, error_type, error_text, source_app, source_feature, route,
                                organization_id, user_id, created_by, context)
  values ('kernel_fingerprint_auto_rerecorded', 'preflight.read_kernel',
          v_msg || ' Look at it: the file that changed these bodies re-recorded nothing. If the change was by ruling, '
                || 'nothing is owed but refreshing aidream db/entity_read_kernel_members.json; if it was not meant to change '
                || 'the kernel at all, find it with pnpm db:body-drift and say so to its lane.',
          'database', 'provisioning', 'platform.provision',
          v_org, v_uid, v_uid,
          jsonb_build_object('target', v_target, 'token', p_spec->>'token', 'applied_via', p_applied_via,
                             'lane', p_lane, 'organization_id', p_org_id,
                             'fingerprint_from', v_fp_from, 'fingerprint_to', v_fp_to,
                             'moved', to_jsonb(v_moved), 'ruling', c_ruling, 'record_id', v_rid,
                             'equivalence', v_check, 'session_role', current_user))
  returning id into v_eid;
  update platform.kernel_fingerprint_record set system_error_id = v_eid where id = v_rid;

  raise warning '%', v_msg;

  v_out := jsonb_build_object('healed', true, 'already', false, 'auto_rerecorded', true,
                              'ruling', c_ruling, 'fingerprint_from', v_fp_from, 'fingerprint_to', v_fp_to,
                              'moved', to_jsonb(v_moved), 'record_id', v_rid, 'system_error_id', v_eid,
                              'equivalence', jsonb_build_object('version', v_check->'version', 'answers', v_check->'answers',
                                                                'ms', v_check->'ms', 'read_lane_tables', v_check->'read_lane'->'tables',
                                                                'read_lane_identical', v_check->'read_lane'->'identical',
                                                                'lost', v_check->'lost', 'gained', v_check->'gained'));
  -- The provision answer carries it (platform._provision_says_the_kernel_was_rerecorded).
  perform set_config('matrx.kernel_rerecorded', v_out::text, true);
  return v_out;
end;
$function$;
revoke all on function platform._provisioner_heals_a_stale_kernel(jsonb, jsonb, text, uuid, text) from public, anon, authenticated;

-- 5. The provision answer names a re-record made in THIS transaction; otherwise it is untouched.
CREATE OR REPLACE FUNCTION platform._provision_says_the_kernel_was_rerecorded(p_answer jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case when coalesce(current_setting('matrx.kernel_rerecorded', true), '') = '' then p_answer
              else p_answer || jsonb_build_object('kernel_fingerprint', current_setting('matrx.kernel_rerecorded', true)::jsonb) end
$function$;
revoke all on function platform._provision_says_the_kernel_was_rerecorded(jsonb) from public, anon, authenticated;

-- 6. The logged refusal names the failed equivalence evidence.
CREATE OR REPLACE FUNCTION platform._provisioner_refuses_a_stale_kernel(p_spec jsonb, p_pre jsonb, p_applied_via text, p_org_id uuid, p_lane text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_live     jsonb := iam.entity_read_kernel_members_live();
  v_snap     jsonb := iam.entity_read_kernel_members_expected();
  v_rec      jsonb := coalesce(v_snap->'members', '{}'::jsonb);
  v_fp_live  text  := iam.entity_read_kernel_fingerprint();
  v_fp_rec   text  := iam.entity_read_kernel_expected();
  v_moved    text[];
  v_target   text;
  v_org      uuid;
  v_uid      uuid := auth.uid();
  v_msg      text;
  v_remedy   text;
  v_id       uuid;
begin
  select coalesce(array_agg(k order by k), '{}'::text[]) into v_moved from (
    select k || case when v_rec ? k then '' else ' (added)' end as k
      from jsonb_object_keys(v_live) k where (v_rec->>k) is distinct from (v_live->>k)
    union
    select k || ' (removed)' from jsonb_object_keys(v_rec) k where not v_live ? k
  ) s;

  v_target := case
    when jsonb_typeof(p_spec->'tables') = 'array' then
      format('a batch of %s table(s) (%s)', jsonb_array_length(p_spec->'tables'),
             (select string_agg(coalesce(t->>'schema', '?') || '.' || coalesce(t->>'table', '?'), ', ')
                from jsonb_array_elements(p_spec->'tables') t))
    else coalesce(p_spec->>'schema', '?') || '.' || coalesce(p_spec->>'table', '?') end;

  v_org := coalesce(p_org_id,
                    (select so.organization_id from iam.system_orgs so where so.key = 'system'));

  v_msg := format(
    'The provisioner refused %s (token %s, via %s, lane %s): the access kernel''s recorded fingerprint is stale. '
    'The live kernel bodies hash to %s; iam.entity_read_kernel_expected() records %s. '
    'Moved since the recorded member snapshot%s: %s. Nothing was written.',
    v_target, coalesce(p_spec->>'token', '(none)'), coalesce(p_applied_via, '?'), coalesce(p_lane, '?'),
    v_fp_live, v_fp_rec,
    case when (v_snap->>'fingerprint') is distinct from v_fp_rec
         then format(' (which belongs to fingerprint %s, not the recorded %s)', coalesce(v_snap->>'fingerprint', 'none'), v_fp_rec)
         else '' end,
    case when cardinality(v_moved) = 0 then 'none named — the snapshot matches the live bodies, so the expectation itself is what moved'
         else array_to_string(v_moved, ', ') end);

  v_remedy :=
    'A campaign file that changes a fingerprinted body re-records in the SAME file: prove the read lane with aidream '
    'uv run python scripts/_verify_entity_read_equivalence.py (0 lost), then replace iam.entity_read_kernel_expected() '
    'with the live iam.entity_read_kernel_fingerprint() and iam.entity_read_kernel_members_expected() with '
    'jsonb_build_object(''fingerprint'', <that value>, ''members'', iam.entity_read_kernel_members_live()), refresh aidream '
    'db/entity_read_kernel_members.json, run pnpm check:store-doors-decide and select platform.provision_selfcheck(false), '
    'then call platform.provision again with the same spec. Worked example: matrx-frontend '
    'migrations/campaign/kerneltails_the_kernel_fingerprint_names_the_comment_ruling.sql.';

  -- lane PROVISIONER-SELF-HEAL (2026-09-25): the provisioner tried to re-record the fingerprint
  -- itself first, and the kernel's equivalence self-check did NOT answer identically on its
  -- fixed fixture. So this is a real change in what the kernel answers, and a person decides.
  if p_pre ? 'equivalence' then
    v_msg := v_msg || format(
      ' The kernel equivalence self-check ran first (fixture %s, %s answers, %s ms) and did NOT answer identically: '
      '%s lost, %s gained, %s missing%s%s. So the fingerprint was NOT re-recorded automatically.',
      coalesce(p_pre->'equivalence'->>'version', '?'), coalesce(p_pre->'equivalence'->>'answers', '?'),
      coalesce(p_pre->'equivalence'->>'ms', '?'), coalesce(p_pre->'equivalence'->>'lost', '?'),
      coalesce(p_pre->'equivalence'->>'gained', '?'), coalesce(p_pre->'equivalence'->>'missing', '?'),
      coalesce('; the fixture could not be built: ' || (p_pre->'equivalence'->>'error'), ''),
      case when jsonb_typeof(p_pre->'equivalence'->'differed') = 'array'
           then '; first: ' || (select string_agg(x, '; ') from jsonb_array_elements_text(p_pre->'equivalence'->'differed') x)
           else '' end);
    v_remedy := 'The kernel no longer answers what it answered when its fingerprint was recorded, so this needs a person. '
      || 'If the change is BY RULING: ' || v_remedy
      || ' In the SAME file re-derive platform.kernel_equivalence_expected() from select platform.kernel_equivalence_answers() '
      || '(bump the fixture version if the world changed). If it is NOT by ruling, restore the body the row names.';
  end if;

  insert into ops.system_error (kind, error_type, error_text, source_app, source_feature, route,
                                organization_id, user_id, created_by, context)
  values ('provisioner_fingerprint_stale', 'preflight.read_kernel', v_msg || ' Remedy: ' || v_remedy,
          'database', 'provisioning', 'platform.provision',
          v_org, v_uid, v_uid,
          jsonb_build_object('target', v_target, 'token', p_spec->>'token', 'applied_via', p_applied_via,
                             'lane', p_lane, 'organization_id', p_org_id,
                             'fingerprint_live', v_fp_live, 'fingerprint_recorded', v_fp_rec,
                             'snapshot_fingerprint', v_snap->>'fingerprint',
                             'moved', to_jsonb(v_moved), 'findings', p_pre->'findings',
                             'equivalence', p_pre->'equivalence',
                             'session_role', current_user, 'remedy', v_remedy))
  returning id into v_id;

  raise warning '%', v_msg using hint = v_remedy;

  return jsonb_build_object(
    'ok', false, 'refused', true, 'rule_id', 'preflight.read_kernel',
    'kind', 'provisioner_fingerprint_stale', 'token', p_spec->>'token',
    'message', v_msg, 'hint', v_remedy, 'moved', to_jsonb(v_moved),
    'findings', p_pre->'findings', 'equivalence', p_pre->'equivalence', 'system_error_id', v_id);
end;
$function$;

-- 7. platform.provision: the branch, the declaration, and the answer.
CREATE OR REPLACE FUNCTION platform.provision(p_spec jsonb, p_applied_via text DEFAULT 'supabase_mcp'::text, p_org_id uuid DEFAULT NULL::uuid, p_lane text DEFAULT 'full'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_pre      jsonb;
  v_heal     jsonb;   -- PROVISIONER-SELF-HEAL
  v_res      jsonb;
  n          jsonb;
  v_cur      record;
  v_hash     text;
  v_schema   text;
  v_table    text;
  v_token    text;
  v_variant  text;
  v_rel      text;
  v_cols     text;
  v_item     jsonb;
  v_txt      text;
  v_target   text;
  v_frag     text;
  v_soft     boolean;
  v_vis      text;
  v_cat      boolean;
  v_class    text;
  v_created  jsonb[] := '{}'::jsonb[];
  v_certify  jsonb[] := '{}'::jsonb[];
  v_refuse   text[]  := '{}'::text[];
  v_grants   text[]  := '{}'::text[];
  v_argf     jsonb[] := '{}'::jsonb[];
  v_refs     text[]  := '{}'::text[];
  v_idx      jsonb   := '[]'::jsonb;
  v_actor    uuid;
  v_role     text;
  v_part     jsonb;
  v_pkey     text;
  v_pcount   integer;
  v_ix       integer;
  v_client_exposed boolean;
  v_exposure_viol  text;
  r          record;
  v_dfk      jsonb[] := '{}'::jsonb[];
  v_lead     text[]  := '{}'::text[];
  v_od       text;
  v_defer_base boolean;   -- 2026-09-21: the base-contract FKs leave this transaction
begin
  -- ---- a batch: several tables in ONE call (next-build item 2) -----------
  -- `tables[]` is the whole declaration. platform.provision_batch orders the members,
  -- creates the batch's types, calls THIS function once per table with the batch's
  -- tokens visible, then adds the foreign keys that could not exist yet (forward and
  -- self references) and the edges between batch tables. One transaction; a refusal
  -- anywhere leaves nothing.
  if jsonb_typeof(p_spec->'tables') = 'array' then
    return platform.provision_batch(p_spec, p_applied_via, p_org_id, p_lane);
  end if;

  -- ---- ONE PROVISIONING RUN AT A TIME, AND IT YIELDS (2026-09-21) --------
  -- pg_try_advisory_xact_lock, never the blocking form: a builder that waits on another
  -- builder waits while holding its own locks, which is how one slow build became a
  -- 22-session queue with sign-in in it. A second run is refused with 55P03, which lane
  -- B's service already retries. Re-entrant: provision_batch calls this function once per
  -- member inside the same transaction and re-taking the lock succeeds.
  perform platform.provision_run_claim('provision');

  -- ---- preflight -------------------------------------------------------
  v_pre := platform.provision_preflight();
  if not (v_pre->>'ok')::boolean then
    -- A STALE KERNEL FINGERPRINT IS REFUSED WITH A LOGGED ROW (lane KERNEL-TAILS, 2026-09-25).
    -- A raise here rolls back everything the caller's transaction did, so a refusal left no
    -- trace: SHARE-LANE-2's file refused every spec for 26 minutes and rca2b's for 57, and
    -- nobody saw either until a lane ran check:store-doors-decide. Nothing has been written yet
    -- at this point (the run claim is an advisory lock), so this branch writes ONE
    -- ops.system_error row (kind provisioner_fingerprint_stale, naming the moved body and the
    -- remedy), warns, and RETURNS the refusal — ok false, refused true — instead of raising.
    --
    -- 🚨 AND A STALE FINGERPRINT HEALS ITSELF WHEN THE KERNEL STILL ANSWERS THE SAME (lane
    -- PROVISIONER-SELF-HEAL, 2026-09-25, chair's ruling). The fingerprint exists so no table is
    -- provisioned against an UNKNOWN kernel; it was never meant to stop table creation because a
    -- file forgot a bookkeeping line (83 minutes on production on 2026-09-25, twice, once from
    -- outside the program). When stale-kernel is the ONLY finding, the kernel's own equivalence
    -- self-check runs here, in this call, on its fixed fixture (platform.kernel_equivalence_check,
    -- about a second): identical -> the fingerprint is re-recorded with a
    -- platform.kernel_fingerprint_record row and ONE ops.system_error row of kind
    -- kernel_fingerprint_auto_rerecorded, and provisioning continues; not identical -> the logged
    -- refusal below, with the evidence in the row.
    if exists (select 1 from jsonb_array_elements(v_pre->'findings') x
                where x->>'rule_id' = 'preflight.read_kernel') then
      if jsonb_array_length(v_pre->'findings') = 1 then
        v_heal := platform._provisioner_heals_a_stale_kernel(p_spec, v_pre, p_applied_via, p_org_id, p_lane);
        if coalesce((v_heal->>'healed')::boolean, false) then
          v_pre := platform.provision_preflight();
        else
          v_pre := v_pre || jsonb_build_object('equivalence', v_heal->'equivalence');
        end if;
      end if;
      if exists (select 1 from jsonb_array_elements(v_pre->'findings') x
                  where x->>'rule_id' = 'preflight.read_kernel') then
        return platform._provisioner_refuses_a_stale_kernel(p_spec, v_pre, p_applied_via, p_org_id, p_lane);
      end if;
    end if;
    if not (v_pre->>'ok')::boolean then
    raise exception 'provision: PREFLIGHT REFUSED (% problem(s)). Nothing was written.%',
      jsonb_array_length(v_pre->'findings'),
      (select string_agg(E'\n\n' || (x->>'message'), '') from jsonb_array_elements(v_pre->'findings') x)
      using errcode = 'check_violation',
            hint = 'The enforcement chain this path rests on is not intact. Fix the named condition and call platform.provision again; nothing was written, so there is nothing to undo.';
    end if;
  end if;

  -- ---- validate, inside THIS transaction (PLAN §3.2 — no plan fingerprint) ----
  v_res   := platform.provision_validate(p_spec, p_lane, p_org_id);
  n       := v_res->'normalized_spec';
  v_hash  := v_res->>'spec_hash';
  v_token := p_spec->>'token';

  -- ---- unchanged / changed --------------------------------------------
  if v_token is not null then
    -- 🚨 THE DECLARATION IS HISTORY; THE CATALOGUE IS STATE. `platform.provision_spec` is
    -- append-only by design — a trigger refuses a DELETE with "the applied declaration IS the
    -- record" — so a token whose relation has since been torn down STILL has a current row in
    -- this view. Without the existence test below, provision() answered `unchanged` for a
    -- table that does not exist, or refused it as "a DIFFERENT declaration", and that token
    -- could never be rebuilt. It made rule 27's down-then-up loop impossible for every
    -- provisioned table, which is how it was found. When the relation is gone the stored
    -- declaration is a record of what once stood there; provision() creates, so it proceeds
    -- and appends a new row beside the old one.
    select * into v_cur from platform.v_provision_spec_current c
     where c.token = v_token
       and to_regclass(format('%I.%I', c.spec->>'schema', c.spec->>'table')) is not null;
    if found then
      -- Lane B may only see its OWN declarations. Another organization's token answers
      -- exactly like any taken token, so neither existence nor the hash leaks.
      if p_lane = 'restricted' and v_cur.owner_org_id is distinct from p_org_id then
        raise exception '%', (platform.provision_finding('identity.token.taken', 'token', null, v_token))->>'message'
          using errcode = 'check_violation';
      end if;
      if v_cur.spec_hash = v_hash then
        return platform._provision_says_the_kernel_was_rerecorded(jsonb_build_object('ok', true, 'unchanged', true, 'token', v_token,
                 'spec_hash', v_hash, 'plan', '[]'::jsonb, 'created', '[]'::jsonb,
                 'certify', '[]'::jsonb,
                 'detail', format('%s already carries this exact declaration (applied %s). Nothing was written.',
                                  v_token, v_cur.applied_at)));
      end if;
      raise exception 'provision: % already carries a DIFFERENT declaration. provision() creates, it never alters. Changed: %',
        v_token,
        coalesce((select string_agg(k, ', ' order by k)
                    from (select key k from jsonb_each(n)
                          union select key from jsonb_each(v_cur.spec)) x
                   where (n->x.k) is distinct from (v_cur.spec->x.k)), '(no key-level difference — only the hash)')
        using errcode = 'check_violation',
              hint = (select otherwise from platform.provision_rule_message where rule_id = 'evolve.changed_spec');
    end if;
  end if;

  -- ---- findings: ONE error, and nothing written ------------------------
  if not (v_res->>'ok')::boolean then
    raise exception 'provision: % finding(s); call platform.provision_validate(<spec>) for the list. Nothing was written.',
      jsonb_array_length(v_res->'findings')
      using errcode = 'check_violation',
            hint = format('The rules that refused: %s',
                     (select string_agg(x->>'rule_id', ', ') from jsonb_array_elements(v_res->'findings') x));
  end if;

  v_schema  := n->>'schema';
  v_table   := n->>'table';
  v_variant := n->>'rls_variant';
  v_rel     := format('%I.%I', v_schema, v_table);
  v_soft    := (n->>'soft_delete')::boolean;
  v_vis     := n->'access'->>'visibility';
  v_cat     := (n->>'category')::boolean;
  v_class   := n->'access'->>'data_class';

  -- 🚨 THE SCHEMA'S DECLARED EXPOSURE, READ ONCE, HONOURED BY EVERY GRANT BELOW.
  -- `platform.schema_client_exposure` is the declaration; a schema with no row keeps the
  -- platform's historical answer (exposed), so an existing spec's result is unchanged.
  v_client_exposed := platform.schema_is_client_exposed(v_schema);

  perform set_config('matrx.provisioner', '1', true);
  perform platform.provision_marker_set(true);   -- wave 3: the proof the guards actually read

  -- ---- types[] ---------------------------------------------------------
  for v_item in select value from jsonb_array_elements(n->'types') loop
    if to_regtype(format('%I.%I', v_schema, v_item->>'name')) is not null
       and (platform.provision_batch_context()->'types' ? format('%s.%s', v_schema, v_item->>'name')) then
      continue;   -- created by platform.provision_batch before this member ran
    end if;
    execute format('create type %I.%I as enum (%s)', v_schema, v_item->>'name',
             (select string_agg(quote_literal(l), ', ')
                from jsonb_array_elements_text(v_item->'labels') l));
    v_created := v_created || jsonb_build_object('type', format('%s.%s', v_schema, v_item->>'name'));
  end loop;

  -- ---- the table -------------------------------------------------------
  -- PARTITIONED OR NOT, THIS IS THE SAME BUILDER. When the spec declares no partition the
  -- emitted DDL is byte-for-byte what it has always been; `v_part` is null, `v_pkey` is
  -- null, and every branch below collapses to the empty string.
  v_part := case when jsonb_typeof(n->'partition') = 'object' then n->'partition' else null end;
  if v_part is null then
    v_cols := 'id uuid primary key default gen_random_uuid()';
  else
    -- PostgreSQL refuses a unique constraint on a partitioned table that does not contain
    -- the partition key, so `id` stops being the whole key and becomes its tail.
    v_pcount := (v_part->>'count')::integer;
    v_pkey   := (select string_agg(format('%I', c), ', ')
                   from jsonb_array_elements_text(v_part->'key') c);
    v_cols   := 'id uuid not null default gen_random_uuid()';
  end if;
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    v_frag := format('%I %s', v_item->>'name', to_regtype(v_item->>'type')::text);
    if v_item ? 'generated' then
      v_frag := v_frag || format(' generated always as (%s) stored', v_item->'generated'->>'expression');
    else
      if coalesce((v_item->>'not_null')::boolean, false) then v_frag := v_frag || ' not null'; end if;
      if v_item ? 'default' and jsonb_typeof(v_item->'default') <> 'null' then
        v_frag := v_frag || format(' default %s', v_item->'default' #>> '{}');
      end if;
    end if;
    if v_item ? 'references' then
      v_target := v_item->'references'->>'target';
      v_od := case lower(v_item->'references'->>'on_delete')
                when 'cascade' then 'cascade' when 'restrict' then 'restrict'
                when 'set_null' then 'set null' else 'no action' end;
      v_target := coalesce(
        (select format('%I.%I', e.schema_name, e.table_name) from platform.entity_types e where e.token = v_target),
        platform.provision_batch_token_rel(v_target),
        case when v_target = v_token then v_rel end,
        to_regclass(v_target)::text);
      if to_regclass(v_target) is not null then
        v_frag := v_frag || format(' references %s(id) on delete %s', v_target, v_od);
      else
        -- G3/G13: the table itself (a tree), or a batch member not built yet. The
        -- constraint is added the moment its target exists; the column is born now.
        v_dfk := v_dfk || jsonb_build_object('column', v_item->>'name', 'target', v_target, 'on_delete', v_od);
      end if;
    end if;
    if v_item ? 'check' then
      v_frag := v_frag || format(' check (%s)', v_item->>'check');
    end if;
    v_cols := v_cols || ', ' || v_frag;
  end loop;

  -- 🚨 THE FRONT DOOR IS NOT HELD WHILE THE TABLE IS BUILT (incident 2026-09-21).
  -- `references auth.users` inside CREATE TABLE takes SHARE ROW EXCLUSIVE on auth.users and
  -- holds it to COMMIT — measured at 298,560 ms with 22 sessions queued behind it, GoTrue's
  -- sign-in read among them. In deferred mode the columns are born bare and the three
  -- foreign keys are added afterwards, each in its own short transaction, by
  -- platform.provision_attach_base_contract / _validate_base_contract. The debt is written
  -- down below and the result document carries the remedy: nothing about the gap is silent.
  v_defer_base := platform.provision_defer_base_fks();
  if v_defer_base then
    v_cols := v_cols || ', organization_id uuid not null';
    v_cols := v_cols || ', created_by uuid';
    v_cols := v_cols || ', updated_by uuid';
  else
    v_cols := v_cols || ', organization_id uuid not null references iam.organizations(id)';
    v_cols := v_cols || ', created_by uuid references auth.users(id)';
    v_cols := v_cols || ', updated_by uuid references auth.users(id)';
  end if;
  v_cols := v_cols || ', created_at timestamptz not null default now()';
  v_cols := v_cols || ', updated_at timestamptz not null default now()';
  if v_soft then v_cols := v_cols || ', deleted_at timestamptz'; end if;
  v_cols := v_cols || ', version integer not null default 1';
  v_cols := v_cols || ', metadata jsonb not null default ''{}''::jsonb';
  -- REC-40 / REC-60: the one field-value column, emitted by the builder, immediately after
  -- `metadata` so the platform-wide column is never confused with a table's own domain
  -- columns. The spec key already existed and the platform's answer is still `false`; what
  -- changes is that answering `true` now EMITS something instead of being recorded and
  -- ignored.
  if coalesce((n->>'custom_fields')::boolean, false) then
    v_cols := v_cols || ', custom_fields jsonb not null default ''{}''::jsonb';
  end if;
  if v_vis is not null then
    v_cols := v_cols || format(', visibility platform.visibility not null default %L::platform.visibility', v_vis);
  end if;
  if v_cat then v_cols := v_cols || ', category_id uuid references platform.categories(id)'; end if;
  for v_item in select value from jsonb_array_elements(n->'checks') loop
    v_cols := v_cols || format(', constraint %I check (%s)', v_item->>'name', v_item->>'expression');
  end loop;

  if v_part is not null then
    v_cols := v_cols || format(', constraint %I primary key (%s, id)',
                left(format('%s_pkey', v_table), 63), v_pkey);
  end if;

  execute format('create table %s (%s)%s', v_rel, v_cols,
    case when v_part is null then '' else format(' partition by hash (%s)', v_pkey) end);
  v_created := v_created || jsonb_build_object('table', format('%s.%s', v_schema, v_table));

  -- 🚨 THE REVOKE IS NOT BELT-AND-BRACES. 20 schemas carry ALTER DEFAULT PRIVILEGES
  -- rows that grant every NEW relation automatically — crm gives authenticated=arwd
  -- and service_role=arwd AT `CREATE TABLE`. iam.apply_table_grants (inside apply_rls)
  -- then grants what the variant actually earns.
  execute format('revoke all on table %s from public, anon, authenticated, service_role', v_rel);

  -- ---- the children, in THIS transaction --------------------------------
  -- They are created here, before the indexes and the triggers, so that every partitioned
  -- index and every row trigger the builder attaches to the parent propagates to all of
  -- them at birth rather than being a thing somebody has to remember for child seventeen.
  -- The guard exempts a partition child of a registered parent, and inside provision() the
  -- marker exempts both — Doctrine: partitions are their parent.
  if v_part is not null then
    for v_ix in 0 .. v_pcount - 1 loop
      execute format('create table %I.%I partition of %s for values with (modulus %s, remainder %s)',
                     v_schema, format('%s_p%s', v_table, lpad(v_ix::text, 2, '0')), v_rel, v_pcount, v_ix);
      execute format('revoke all on table %I.%I from public, anon, authenticated, service_role',
                     v_schema, format('%s_p%s', v_table, lpad(v_ix::text, 2, '0')));
    end loop;
    v_created := v_created || jsonb_build_object('partitions',
      format('%s hash partition(s) of %s on (%s), %s.%s_p00 … %s.%s_p%s',
             v_pcount, v_rel, v_pkey, v_schema, v_table, v_schema, v_table,
             lpad((v_pcount - 1)::text, 2, '0')));
  end if;

  -- ---- the foreign keys that could not be inline ------------------------
  -- A self reference can be added now (the table exists). A reference to a batch member
  -- that is not built yet is handed to platform.provision_batch, which adds it once every
  -- member exists. The covering index is created in the index block below either way.
  foreach v_item in array v_dfk loop
    if to_regclass(v_item->>'target') is not null then
      execute format('alter table %s add constraint %I foreign key (%I) references %s(id) on delete %s',
                     v_rel, left(format('%s_%s_fkey', v_table, v_item->>'column'), 63),
                     v_item->>'column', v_item->>'target', v_item->>'on_delete');
      v_created := v_created || jsonb_build_object('foreign_key',
        format('%s.%s -> %s (self reference)', v_rel, v_item->>'column', v_item->>'target'));
    elsif platform.provision_batch_context() ? 'batch_id' then
      perform platform.provision_batch_defer('fks', v_item || jsonb_build_object('relation', v_rel, 'table', v_table));
      v_created := v_created || jsonb_build_object('foreign_key_deferred',
        format('%s.%s -> %s (added by the batch once %s exists)', v_rel, v_item->>'column', v_item->>'target', v_item->>'target'));
    else
      raise exception 'provision: %.% references %, which does not exist and is not declared in this call', v_rel, v_item->>'column', v_item->>'target'
        using errcode = 'check_violation';
    end if;
  end loop;

  -- ---- comments (the cheapest machine-readable intent we have) ----------
  execute format('comment on table %s is %L', v_rel, n->>'description');
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if v_item ? 'description' then
      execute format('comment on column %s.%I is %L', v_rel, v_item->>'name', v_item->>'description');
    end if;
  end loop;

  -- ---- indexes ---------------------------------------------------------
  -- EVERY FK gets a covering index, base columns organization_id and created_by included
  -- (they are columns the BUILDER emits, so the rule lives here and not in the
  -- declaration). NEVER updated_by: P3-05 measured 0 of 4,917 statements filtering on it
  -- and the platform's own FK-index batch excludes it by rule (G6). A declared index that
  -- LEADS with an FK column is that column's covering index, so the automatic one is not
  -- emitted beside it — which is how a partial FK index is declared (G5).
  select coalesce(array_agg(x.value->'columns'->>0), '{}'::text[]) into v_lead
    from jsonb_array_elements(n->'indexes') x
   where jsonb_typeof(x.value->'columns') = 'array' and jsonb_array_length(x.value->'columns') > 0;
  v_lead := v_lead || coalesce(array(select x.value->>'name' from jsonb_array_elements(n->'fields') x
                                      where coalesce((x.value->>'unique')::boolean, false)), '{}'::text[]);
  foreach v_txt in array array['organization_id','created_by'] loop
    if not (v_txt = any (v_lead)) then
      execute format('create index on %s (%I)', v_rel, v_txt);
    end if;
  end loop;
  if v_cat and not ('category_id' = any (v_lead)) then execute format('create index on %s (category_id)', v_rel); end if;
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if v_item ? 'references' and coalesce((v_item->>'index')::boolean, true)
       and not ((v_item->>'name') = any (v_lead)) then
      execute format('create index on %s (%I)', v_rel, v_item->>'name');
    end if;
    if coalesce((v_item->>'unique')::boolean, false) then
      v_idx := v_idx || jsonb_build_array(jsonb_build_object(
        'columns', jsonb_build_array(v_item->>'name'), 'unique', true,
        'where', case when v_soft then 'deleted_at IS NULL' else null end));
    end if;
    if (n->>'gin_jsonb')::boolean and lower(coalesce(v_item->>'type','')) = 'jsonb' then
      execute format('create index on %s using gin (%I)', v_rel, v_item->>'name');
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(n->'indexes' || v_idx) loop
    execute format('create %s index on %s using %s (%s)%s',
      case when coalesce((v_item->>'unique')::boolean, false) then 'unique' else '' end,
      v_rel, coalesce(v_item->>'method','btree'),
      -- G4: `expression` is the parenthesised index expression, verbatim (lane A only —
      -- the validator refuses it on lane B by name); otherwise the quoted column list.
      coalesce(nullif(btrim(v_item->>'expression'), ''),
               (select string_agg(format('%I', c), ', ') from jsonb_array_elements_text(v_item->'columns') c)),
      case when v_item->>'where' is not null then format(' where %s', v_item->>'where') else '' end);
  end loop;

  -- ---- REGISTER (before the triggers: the admission trigger on this INSERT
  --      attaches _stamp_actor_tier itself — B-77) ------------------------
  insert into platform.entity_types(
    token, schema_name, table_name, label, origin, is_versioned, has_soft_delete,
    is_component, is_listed, default_visibility, rls_variant, table_ref, is_active,
    data_class, default_list_scope, suppress_platform_admin_lane, category,
    title_column, content_role, relation_kind, projects_token, audit_class, audit_class_reason,
    client_read_only, reference_pickable, agent_writable, agent_write_notes, confirmation_enabled,
    client_excluded_columns, component_anon_read_via_public_parent, taxonomy_node_id,
    base_tier, is_module, default_members_can_add, default_needs_approval, default_scopeable,
    default_auto_ingest, allow_preview, reference_candidate_predicates, governed_columns,
    retention_owner_column, user_artifact_kind, reference_category,
    lifecycle_enlisted, lifecycle_hot_days, version_store, data_class_reason,
    type, custom_fields_enabled)
  values (
    v_token, v_schema, v_table, n->>'label', n->>'origin',
    (n->>'versioned')::boolean, v_soft,
    (v_variant = 'component'), (n->>'is_listed')::boolean,
    nullif(v_vis,'')::platform.visibility, v_variant, v_rel::regclass, true,
    v_class::platform.data_class,
    (n->'access'->>'default_list_scope')::platform.list_scope,
    -- §3.1 derivation two: a private or confidential token closes the platform-admin
    -- lane. A detail's class is its parent's and is resolved below, once parents exist.
    coalesce(v_variant = 'restricted' or v_class in ('private', 'confidential'), false),
    n->>'category_label',
    n->>'title_column', n->>'content_role', n->>'relation_kind', n->>'projects_token',
    n->>'audit_class', n->>'audit_class_reason',
    (n->>'client_read_only')::boolean, (n->>'reference_pickable')::boolean,
    (n->>'agent_writable')::boolean, n->>'agent_write_notes', (n->>'confirmation_enabled')::boolean,
    nullif(array(select jsonb_array_elements_text(n->'client_excluded_columns')), '{}'),
    coalesce((n->>'component_anon_read_via_public_parent')::boolean, false),
    (n->>'taxonomy_node_id')::uuid,
    (n->>'base_tier')::smallint, (n->>'is_module')::boolean,
    (n->>'default_members_can_add')::boolean, (n->>'default_needs_approval')::boolean,
    (n->>'default_scopeable')::boolean, (n->>'default_auto_ingest')::boolean,
    (n->>'allow_preview')::boolean, n->'reference_candidate_predicates',
    case when jsonb_typeof(n->'governed_columns') = 'array'
         then array(select jsonb_array_elements_text(n->'governed_columns')) end,
    n->>'retention_owner_column', n->>'user_artifact_kind', n->>'reference_category',
    coalesce((n->'lifecycle'->>'enlisted')::boolean, false),
    (n->'lifecycle'->>'hot_days')::integer,
    n->>'version_store', n->'access'->>'data_class_reason',
    n->>'type', (n->>'type') in ('entity', 'detail'));
  v_created := v_created || jsonb_build_object('entity_type', v_token);

  -- ---- parents ---------------------------------------------------------
  for v_txt in select value #>> '{}' from jsonb_array_elements(n->'parents') loop
    insert into platform.entity_relationships(child_type, parent_type, fk_column, kind)
    values (v_token, btrim(split_part(v_txt, ':', 1)), btrim(split_part(v_txt, ':', 2)), 'composition');
  end loop;

  -- A detail (and a ledger) is judged on its RESOLVED class (DD-137b10): under a
  -- private or confidential parent the platform-staff lane is closed on it too.
  if v_variant in ('component', 'ledger')
     and (iam.class_lanes(v_token)).resolved_class::text in ('private', 'confidential') then
    update platform.entity_types set suppress_platform_admin_lane = true where token = v_token;
  end if;

  -- ---- triggers --------------------------------------------------------
  execute format('create trigger _stamp_actor before insert or update on %s for each row execute function platform._stamp_actor()', v_rel);
  -- B-77: the entity_types admission trigger may already have attached this one.
  -- The test is BY FUNCTION, never by name (DD-173).
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = v_rel::regclass and not t.tgisinternal
                    and t.tgfoid = 'platform._stamp_actor_tier()'::regprocedure) then
    execute format('create trigger _stamp_actor_tier before insert or update on %s for each row execute function platform._stamp_actor_tier()', v_rel);
  end if;
  execute format('create trigger _touch_row before insert or update on %s for each row execute function platform._touch_row()', v_rel);
  execute format('create trigger _metadata_guard before insert or update of metadata on %s for each row execute function platform._metadata_guard(%L)', v_rel, v_token);
  if (n->>'versioned')::boolean then
    execute format('create trigger _version_capture after insert or delete or update on %s for each row execute function platform._version_capture(%L)', v_rel, v_token);
  end if;

  -- The ONE shared tenancy trigger, per declared nullable FK into a tenant table.
  for v_item in select value from jsonb_array_elements(n->'fields') loop
    if coalesce((v_item->>'tenancy_check')::boolean, false) then
      v_target := v_item->'references'->>'target';
      v_target := coalesce(
        (select format('%I.%I', e.schema_name, e.table_name) from platform.entity_types e where e.token = v_target),
        platform.provision_batch_token_rel(v_target),
        case when v_target = v_token then v_rel end,
        to_regclass(v_target)::text);
      execute format(
        'create trigger %I before insert or update of %I on %s for each row execute function platform.assert_same_org(%L, %L)',
        left(format('_same_org_%s', v_item->>'name'), 63), v_item->>'name', v_rel,
        v_item->>'name', v_target);
    end if;
  end loop;

  perform platform.sync_association_gc_triggers(v_token);

  -- ---- the single write door, DECLARED BEFORE THE GRANTS ARE GENERATED ---
  -- 🚨 THE CLASS FIX, NOT THE INSTANCE. iam.apply_table_grants issues
  -- `grant select, insert, update, delete … to authenticated` for every non-ledger variant,
  -- so a REVOKE issued AFTER apply_rls lasts exactly until the next regeneration — the
  -- failure that function's own DD-248 comment describes in as many words. The register it
  -- already reads is where a one-write-door table says so, so the generator itself issues
  -- the narrow grant and every regeneration keeps it.
  if n->>'write_door' = 'single' then
    insert into platform.stamped_write_table(
      schema_name, table_name, stamp_column, rls_variant, declared_by, reason)
    values (v_schema, v_table, 'created_by', v_variant, format('platform.provision(%s)', v_token),
            format('write_door = single. `authenticated` holds no direct INSERT, UPDATE or DELETE on %s; the only write path is %s, declared in platform.client_callable_door in this same transaction. iam.apply_table_grants reads THIS register (DD-248), so the narrow grant is what the generator issues rather than something revoked behind its back — which would last only until the next regeneration.',
                   v_rel,
                   coalesce((select string_agg(format('%s.%s', v_schema, x.value->>'name'), ', ')
                               from jsonb_array_elements(n->'functions') x), '(none declared)')))
    on conflict (schema_name, table_name) do nothing;
    v_created := v_created || jsonb_build_object('write_door', format('single: %s', v_rel));
  end if;

  -- ---- RLS -------------------------------------------------------------
  perform iam.apply_rls(v_schema, v_table, v_token, v_variant);

  -- A policy on the PARENT is not consulted when a partition is addressed DIRECTLY, and
  -- ENABLE ROW LEVEL SECURITY does not cascade. "Unreachable" must never depend on which
  -- relation name a caller happens to type, so every child carries RLS enabled with no
  -- policy of its own, which denies every non-owner outright.
  if v_part is not null then
    for v_ix in 0 .. v_pcount - 1 loop
      execute format('alter table %I.%I enable row level security',
                     v_schema, format('%s_p%s', v_table, lpad(v_ix::text, 2, '0')));
      execute format('revoke all on table %I.%I from public, anon, authenticated, service_role',
                     v_schema, format('%s_p%s', v_table, lpad(v_ix::text, 2, '0')));
    end loop;
  end if;

  -- ---- realtime (G10: was accepted and discarded) -----------------------
  -- `true` adds the table to the supabase_realtime publication, under its RLS.
  if coalesce((n->>'realtime')::boolean, false) then
    execute format('alter publication supabase_realtime add table %s', v_rel);
    v_created := v_created || jsonb_build_object('realtime', format('supabase_realtime carries %s', v_rel));
  end if;

  -- ---- association types -----------------------------------------------
  -- An edge naming a batch member that is not registered yet is handed to the batch,
  -- which writes it once every member exists.
  for v_item in select value from jsonb_array_elements(n->'association_types') loop
    if (platform.provision_batch_context() ? 'batch_id')
       and (not exists (select 1 from platform.entity_types e where e.token = v_item->>'source_type')
            or not exists (select 1 from platform.entity_types e where e.token = v_item->>'target_type')) then
      perform platform.provision_batch_defer('edges', v_item);
      v_created := v_created || jsonb_build_object('association_type_deferred',
        format('%s -> %s (written by the batch once both tokens exist)', v_item->>'source_type', v_item->>'target_type'));
      continue;
    end if;
    insert into platform.association_types(source_type, target_type, label, container_side, conveys_max, notes)
    values (v_item->>'source_type', v_item->>'target_type', v_item->>'label',
            coalesce(v_item->>'container_side','none'),
            coalesce(v_item->>'conveys_max','editor')::public.permission_level, v_item->>'notes')
    on conflict (source_type, target_type) do nothing;
  end loop;

  -- ---- knobs (SAME transaction: knob_resolve raises on a missing knob) ---
  for v_item in select value from jsonb_array_elements(n->'knobs') loop
    insert into platform.feature_knob(feature, key, value, default_value, value_type, unit,
      min_value, max_value, allowed_values, label, description, set_by, overridable_by,
      override_direction, propagation, taxonomy_node_id)
    values (v_item->>'feature', v_item->>'key', v_item->'value',
            coalesce(v_item->'default_value', v_item->'value'), v_item->>'value_type',
            v_item->>'unit', (v_item->>'min_value')::numeric, (v_item->>'max_value')::numeric,
            v_item->'allowed_values', v_item->>'label', v_item->>'description',
            coalesce(v_item->>'set_by','agent'),
            coalesce(array(select jsonb_array_elements_text(v_item->'overridable_by')), '{}'::text[]),
            coalesce(v_item->>'override_direction','any'), coalesce(v_item->>'propagation','next_load'),
            (v_item->>'taxonomy_node_id')::uuid)
    on conflict (feature, key) do nothing;
    v_created := v_created || jsonb_build_object('knob', format('%s/%s', v_item->>'feature', v_item->>'key'));
  end loop;

  -- ---- views -----------------------------------------------------------
  for v_item in select value from jsonb_array_elements(n->'views') loop
    execute format('create view %I.%I with (security_invoker = %s) as %s',
      v_schema, v_item->>'name',
      case when coalesce((v_item->>'security_invoker')::boolean, true) then 'true' else 'false' end,
      v_item->>'definition');
    -- A view in a CLOSED schema is a relation like any other: the schema's default ACL is the
    -- source of a new relation's grants (20 schemas carry one), so it is revoked by name here
    -- rather than left to whatever the schema happens to declare.
    if not v_client_exposed then
      execute format('revoke all on %I.%I from public, anon, authenticated, service_role',
                     v_schema, v_item->>'name');
    end if;
    v_created := v_created || jsonb_build_object('view', format('%s.%s', v_schema, v_item->>'name'));

    -- G9: `registered_as_projection` was checked and then nothing was written. The view is
    -- registered the way agent_card and workflow_card are: relation_kind = 'projection',
    -- projects_token naming the table it projects, audit_class = 'machinery' with the
    -- declared reason. The declared primary key must be columns the view actually has —
    -- db/generate.py hard-fails for EVERY schema on a registered view with a bad key.
    if coalesce((v_item->>'registered_as_projection')::boolean, false) then
      for v_txt in select jsonb_array_elements_text(v_item->'primary_key') loop
        if not exists (select 1 from pg_attribute a
                        where a.attrelid = to_regclass(format('%I.%I', v_schema, v_item->>'name'))
                          and a.attname = v_txt and a.attnum > 0 and not a.attisdropped) then
          raise exception '%', (platform.provision_finding('views.projection.primary_key.unknown',
                   format('views[%s].primary_key', v_item->>'name'), null,
                   format('%s is not a column of %s.%s', v_txt, v_schema, v_item->>'name')))->>'message'
            using errcode = 'check_violation';
        end if;
      end loop;
      insert into platform.entity_types(
        token, schema_name, table_name, label, origin, is_component, rls_variant,
        relation_kind, projects_token, audit_class, audit_class_reason, is_versioned,
        has_soft_delete, is_listed, is_active, taxonomy_node_id, category, type, custom_fields_enabled)
      values (v_item->>'token', v_schema, v_item->>'name', v_item->>'label', 'standard', true, 'component',
              'projection', coalesce(v_item->>'projects_token', v_token), 'machinery',
              format('Projection: %s.%s is a view over %s (%s). It owns no rows — it exists to carry the %s permission scope. %s',
                     v_schema, v_item->>'name', v_rel, v_token, v_item->>'token', v_item->>'reason'),
              false, false, false, true, (n->>'taxonomy_node_id')::uuid, n->>'category_label', 'system', false);
      v_created := v_created || jsonb_build_object('projection', format('%s (%s.%s, key %s)', v_item->>'token', v_schema, v_item->>'name', v_item->'primary_key'::text));
    end if;
  end loop;

  -- ---- functions -------------------------------------------------------
  -- An entry WITH a body is created (lane A only — the validator refuses a body on
  -- lane B). An entry WITHOUT one declares a door for a function that already exists.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    if v_item ? 'body' then
      execute format('create function %I.%I(%s) returns %s language %s %s set search_path to %L as $provision_body$%s$provision_body$',
        v_schema, v_item->>'name', coalesce(v_item->>'args',''), v_item->>'returns',
        coalesce(v_item->>'language','plpgsql'),
        case when lower(coalesce(v_item->>'security','invoker')) = 'definer' then 'security definer' else 'security invoker' end,
        coalesce(v_item->>'search_path','pg_catalog'), v_item->>'body');
      -- PostgreSQL grants EXECUTE on a new function to PUBLIC implicitly (proacl stays NULL),
      -- so a function born in a CLOSED schema is callable by every client role unless this
      -- revoke is issued. Measured on the rehearsal branch 2026-09-17: four functions in
      -- schema `custom` read `proacl IS NULL`, which is PUBLIC=EXECUTE.
      if not v_client_exposed then
        execute format('revoke all on function %I.%I(%s) from public, anon, authenticated, service_role',
                       v_schema, v_item->>'name', coalesce(v_item->>'args',''));
      end if;
      v_created := v_created || jsonb_build_object('function', format('%s.%s', v_schema, v_item->>'name'));
    end if;
  end loop;

  -- ---- per-argument check, against the CATALOGUE (lessons ledger 23 + 27) ----
  -- The validator checked the text the spec wrote; this checks what exists, so a
  -- spec whose `args` text disagrees with its body, or a lane-B door on an existing
  -- function, cannot slip past.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid, pg_get_function_arguments(p.oid) as args into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;
    if not found then
      v_argf := v_argf || platform.provision_finding('functions.not_found',
                 format('functions[%s].name', v_item->>'name'), null,
                 format('%s.%s does not exist', v_schema, v_item->>'name'));
    else
      v_argf := v_argf || platform.provision_arg_check_findings(v_item->>'name', r.args, v_item->'arg_checks');
    end if;
  end loop;
  if cardinality(v_argf) > 0 then
    raise exception 'provision: % function argument finding(s). Nothing was written.%',
      cardinality(v_argf),
      (select string_agg(E'\n\n' || (x->>'message'), '') from unnest(v_argf) x)
      using errcode = 'check_violation',
            hint = (select otherwise from platform.provision_rule_message where rule_id = 'functions.arg_checks.missing');
  end if;

  -- ---- sharing ---------------------------------------------------------
  if jsonb_typeof(n->'sharing') = 'object' then
    insert into platform.shareable_resource_registry(
      resource_type, schema_name, table_name, id_column, owner_column, display_label,
      url_path_template, is_link_shareable, is_scopeable, public_columns, content_role,
      organization_id, visibility)
    values (v_token, v_schema, v_table, 'id',
            coalesce(n->'sharing'->>'owner_column','created_by'),
            n->'sharing'->>'display_label', n->'sharing'->>'url_path_template',
            coalesce((n->'sharing'->>'is_link_shareable')::boolean, false),
            coalesce((n->'sharing'->>'is_scopeable')::boolean, false),
            nullif(array(select jsonb_array_elements_text(n->'sharing'->'public_columns')), '{}'),
            n->>'content_role',
            coalesce(p_org_id, public.system_org_id('system')),
            coalesce(nullif(v_vis,'')::platform.visibility, 'internal'::platform.visibility));
    v_created := v_created || jsonb_build_object('shareable_resource', v_token);
  end if;

  -- ---- DOORS, then GRANTS. In that order, always. -----------------------
  -- Lessons ledger 1 and 24: an undeclared grant is silently stripped, and a
  -- guard-log revoke row means the grant preceded the door — 51 times out of 86.
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid, pg_get_function_identity_arguments(p.oid) ia, platform.door_argtypes(p.proargtypes) at,
           pg_get_function_arguments(p.oid) fa
      into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;

    if exists (select 1 from platform.client_callable_door c
                where c.schema_name = v_schema and c.function_name = v_item->>'name'
                  and c.identity_argtypes = r.at) then
      raise exception '%', (platform.provision_finding('functions.door_exists',
               format('functions[%s].name', v_item->>'name'), null,
               format('%s.%s(%s)', v_schema, v_item->>'name', r.ia)))->>'message'
        using errcode = 'check_violation';
    end if;

    -- 0796: the per-argument rules are STORED, not validated and thrown away (G15).
    insert into platform.client_callable_door(
      schema_name, function_name, identity_args, identity_argtypes, reason,
      argument_rules, contract_probe,
      anonymous_callers, anonymous_purpose, signed_in_callers, non_client_lane, declared_by)
    values (v_schema, v_item->>'name', r.ia, r.at, v_item->>'reason',
            platform.door_rules_normalize(r.fa, v_item->'arg_checks'),
            case when jsonb_typeof(v_item->'contract_probe') = 'object' then v_item->'contract_probe' end,
            (v_item->>'client_access') = 'anonymous',
            case when (v_item->>'client_access') = 'anonymous' then v_item->>'anonymous_purpose' end,
            (v_item->>'client_access') in ('anonymous','signed_in'),
            case when (v_item->>'client_access') = 'server_only' then v_item->>'non_client_lane' end,
            format('platform.provision(%s)', v_token));
    v_created := v_created || jsonb_build_object('door', format('%s.%s(%s)', v_schema, v_item->>'name', r.ia));
    v_refs := v_refs || format('%s.%s(%s)', v_schema, v_item->>'name', r.ia);

    -- Collected, not issued: every GRANT goes last, as ONE block. Each GRANT fires a
    -- DB-wide re-sweep of ~2,000 DEFINER functions (ATTACK #8).
    -- The DOOR ROW is written whatever the schema's exposure is — it is the declaration of
    -- what this function is FOR, and it is what `iam.apply_table_grants`, the door census and
    -- switch-checklist step 3 all read. The GRANT is the access, and a CLOSED schema gets none.
    if not v_client_exposed then
      if (v_item->>'client_access') in ('signed_in','anonymous') then
        raise notice
          'provision: door %.%(%) is declared % and its platform.client_callable_door row was written, but schema % is declared CLOSED in platform.schema_client_exposure — the EXECUTE grant was NOT issued. Opening the schema (platform.schema_client_exposure.client_exposed = true) and re-running the provisioner issues it.',
          v_schema, v_item->>'name', r.ia, v_item->>'client_access', v_schema;
      end if;
      v_grants := v_grants || format('revoke all on function %I.%I(%s) from public, anon, authenticated, service_role',
                                     v_schema, v_item->>'name', r.ia);
    elsif (v_item->>'client_access') = 'signed_in' then
      v_grants := v_grants || format('grant execute on function %I.%I(%s) to authenticated',
                                     v_schema, v_item->>'name', r.ia);
    elsif (v_item->>'client_access') = 'anonymous' then
      v_grants := v_grants || format('grant execute on function %I.%I(%s) to anon, authenticated',
                                     v_schema, v_item->>'name', r.ia);
    end if;
  end loop;

  foreach v_txt in array v_grants loop
    execute v_txt;
  end loop;

  -- ---- the door proof (PLAN §4.5): what exists matches what was declared ----
  for v_item in select value from jsonb_array_elements(n->'functions') loop
    select p.oid into r
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = v_schema and p.proname = v_item->>'name'
     order by p.oid desc limit 1;
    -- The door proof compares the catalogue to what was DECLARED **and what the schema's
    -- exposure allows** — in a closed schema the expected answer for both roles is false, and
    -- a proof that still expected the declaration would refuse every provision into one.
    if (has_function_privilege('authenticated', r.oid, 'EXECUTE')
          is distinct from (v_client_exposed and (v_item->>'client_access') in ('signed_in','anonymous')))
       or (has_function_privilege('anon', r.oid, 'EXECUTE')
          is distinct from (v_client_exposed and (v_item->>'client_access') = 'anonymous')) then
      raise exception '%', (platform.provision_finding('doors.proof_failed',
               format('functions[%s].client_access', v_item->>'name'), null,
               format('declared %s (schema client-exposed = %s); observed authenticated EXECUTE = %s, anon EXECUTE = %s',
                      v_item->>'client_access', v_client_exposed,
                      has_function_privilege('authenticated', r.oid, 'EXECUTE'),
                      has_function_privilege('anon', r.oid, 'EXECUTE'))))->>'message'
        using errcode = 'check_violation';
    end if;
  end loop;

  -- ---- the write-door proof: the narrow grant, OBSERVED -----------------
  -- Same shape as the door proof above, and for the same reason: the declaration is worth
  -- nothing unless the catalogue agrees with it at the end of the transaction.
  if n->>'write_door' = 'single' then
    if has_table_privilege('authenticated', v_rel::regclass, 'INSERT')
       or has_table_privilege('authenticated', v_rel::regclass, 'UPDATE')
       or has_table_privilege('authenticated', v_rel::regclass, 'DELETE') then
      raise exception '%', (platform.provision_finding('write_door.proof_failed', 'write_door', null,
               format('authenticated still holds INSERT=%s UPDATE=%s DELETE=%s on %s',
                      has_table_privilege('authenticated', v_rel::regclass, 'INSERT'),
                      has_table_privilege('authenticated', v_rel::regclass, 'UPDATE'),
                      has_table_privilege('authenticated', v_rel::regclass, 'DELETE'), v_rel)))->>'message'
        using errcode = 'check_violation';
    end if;
  end if;

  -- The guard revoked PUBLIC's default EXECUTE on every DEFINER function created above
  -- and logged it, BEFORE its door could exist (a door row cannot precede the function
  -- it names, and a both-flags-false door that precedes it makes the guard refuse the
  -- CREATE). The door now declares the decision, so the row is acknowledged with that
  -- reason — only rows this transaction produced, only for the functions just doored.
  update platform.ddl_guard_log l
     set acknowledged_at = now(),
         acknowledged_by = format('platform.provision(%s)', v_token),
         ack_reason = format('The birth revoke of PUBLIC''s default EXECUTE was correct; platform.provision(%s) declared this function''s door in the same transaction (lessons ledger 24).', v_token)
   where l.acknowledged_at is null
     and l.rule = 'definer_client_grant_revoked'
     and l.occurred_at >= now()
     and l.object_ref = any (v_refs);

  -- ---- certification ---------------------------------------------------
  -- canonical_certify reports every WARN and FAIL under category `conformance`; the
  -- CHECK NAME is the prefix of `detail`. Refuse on every FAIL and every WARN except
  -- the three legacy-column WARNs (§3.1); INFO (the snapshot row) is ignored.
  for r in select * from iam.canonical_certify(v_schema, v_table, v_token) loop
    -- THE THREE BASE-CONTRACT CHECKS ARE OWED, NOT FAILED (2026-09-21). In deferred
    -- mode the foreign keys are added by platform.provision_attach_base_contract in the
    -- next transaction, on purpose, so verify_canonical is RIGHT that they are absent and
    -- wrong to call it a defect here. They are recorded as `PENDING` in the certify
    -- document, the debt register carries the relation, and
    -- platform.provision_validate_base_contract re-runs the full certification once they
    -- are validated — which is the moment this table is actually certified. Deferral does
    -- not excuse the check; it moves it to where the answer is true.
    if v_defer_base
       and r.status = 'FAIL'
       and split_part(coalesce(r.detail, ''), ':', 1) in ('base_org_fk','base_created_by_fk','base_updated_by_fk') then
      -- ONE row, and it says PENDING. Recording the FAIL as well would put a sentence in
      -- the certify document that contradicts the one beside it.
      v_certify := v_certify || jsonb_build_object('category', r.category, 'status', 'PENDING',
        'detail', coalesce(r.detail,'') || ' — deferred to platform.provision_attach_base_contract, settled in its own short transaction');
    else
      v_certify := v_certify || jsonb_build_object('category', r.category, 'status', r.status, 'detail', r.detail);
    end if;
    if not v_defer_base or r.status <> 'FAIL'
       or split_part(coalesce(r.detail, ''), ':', 1) not in ('base_org_fk','base_created_by_fk','base_updated_by_fk') then
     if r.status = 'FAIL'
       or (r.status = 'WARN'
           and split_part(coalesce(r.detail, ''), ':', 1) not in ('legacy_owner_col','legacy_is_public','legacy_is_deleted')) then
      v_refuse := v_refuse || format('%s [%s]: %s', r.category, r.status, coalesce(r.detail,''));
     end if;
    end if;
  end loop;
  if cardinality(v_refuse) > 0 then
    raise exception 'provision: % refused certification. Nothing was written.%',
      format('%s.%s', v_schema, v_table),
      E'\n  - ' || array_to_string(v_refuse, E'\n  - ')
      using errcode = 'check_violation',
            hint = (select otherwise from platform.provision_rule_message where rule_id = 'certify.refused');
  end if;

  -- ---- THE CLOSED-SCHEMA PROOF, FROM THE CATALOGUE ----------------------
  -- Same shape and same reason as the door proof and the write-door proof above: a rule the
  -- generator followed is worth nothing unless the catalogue agrees with it at the end of the
  -- transaction. For a schema declared CLOSED this asserts the whole of §6.3's fact two —
  -- schema USAGE, every relation and column ACL, every default-privilege row and every
  -- function's EXECUTE reachability, for PUBLIC, anon, authenticated and service_role — so a
  -- future grant added anywhere in this function, or by a trigger it fires, or standing in the
  -- schema from before, refuses the provision instead of quietly reopening the store.
  if not v_client_exposed then
    select string_agg(format('%s %s: %s', v.kind, v.object_name, v.detail), E'\n  - ' order by v.kind, v.object_name)
      into v_exposure_viol
      from platform.schema_exposure_violations(v_schema) v;
    if v_exposure_viol is not null then
      raise exception
        'provision: schema % is declared CLOSED to client roles in platform.schema_client_exposure, and it is NOT closed after this transaction. Nothing was written.%',
        v_schema, E'\n  - ' || v_exposure_viol
        using errcode = 'check_violation',
              hint = format('Close the schema and re-run: revoke all on schema %I from public, anon, authenticated, service_role; revoke all on all tables in schema %I from public, anon, authenticated, service_role; revoke all on all functions in schema %I from public, anon, authenticated, service_role; alter default privileges in schema %I revoke all on tables from public, anon, authenticated, service_role; (same for functions and sequences). To open it instead, set platform.schema_client_exposure.client_exposed = true for %L with a reason.',
                           v_schema, v_schema, v_schema, v_schema, v_schema);
    end if;
  end if;

  -- ---- capture, inside THIS transaction (PLAN §3.3) ---------------------
  -- WHO ACTUALLY ASKED. Lane B arrives as `SET LOCAL ROLE matrx_provisioner` and
  -- then this SECURITY DEFINER, so current_user and session_user BOTH say `postgres`
  -- and neither can tell the lanes apart. The GUC `role` and the verified JWT survive
  -- the DEFINER switch; p_lane is the lane the caller entered through.
  v_actor := auth.uid();
  v_role  := nullif(current_setting('role', true), 'none');

  insert into platform.provision_spec(
    token, spec, spec_hash, type, origin, owner_org_id, verb, result,
    applied_by, applied_via, artifacts_status,
    applied_lane, applied_actor, applied_role, batch_id)
  values (v_token, n, v_hash, n->>'type', n->>'origin', p_org_id,
          case when p_lane = 'restricted' then 'provision_restricted' else 'provision' end,
          jsonb_build_object('created', coalesce(to_jsonb(v_created), '[]'::jsonb),
                             'certify', coalesce(to_jsonb(v_certify), '[]'::jsonb)),
          coalesce(v_actor::text, v_role, session_user), p_applied_via, 'pending',
          case when p_lane = 'restricted' then 'restricted' else 'full' end,
          v_actor, coalesce(v_role, session_user),
          nullif(platform.provision_batch_context()->>'batch_id', '')::uuid);

  -- ---- the base-contract debt, written INSIDE this transaction ----------
  -- If this insert does not happen the deferral never happened either: the register and
  -- the CREATE TABLE commit together or not at all, so there is no state in which a table
  -- exists with bare base columns and nothing saying so.
  if v_defer_base then
    insert into platform.provision_base_contract_pending (relation, token, detail)
    values (v_rel, v_token,
            jsonb_build_object('schema', v_schema, 'table', v_table, 'lane', p_lane,
                               'applied_via', p_applied_via))
    on conflict (relation) do update set
      token = excluded.token, deferred_at = now(),
      attached_at = null, validated_at = null, detail = excluded.detail;
    v_created := v_created || jsonb_build_object('base_contract_deferred',
      format('%s: organization_id -> iam.organizations, created_by / updated_by -> auth.users are added by platform.provision_attach_base_contract in their own short transaction', v_rel));
  end if;

  perform set_config('matrx.provisioner', '0', true);
  perform platform.provision_marker_set(false);

  return platform._provision_says_the_kernel_was_rerecorded(jsonb_build_object(
    'ok', true, 'unchanged', false, 'token', v_token, 'spec_hash', v_hash,
    'plan', v_res->'plan',
    'created', coalesce(to_jsonb(v_created), '[]'::jsonb),
    'certify', coalesce(to_jsonb(v_certify), '[]'::jsonb),
    -- NULL, not false, while the base contract is pending: this table has not been
    -- certified YET, and `false` would read as "this table is wrong". The remedy below is
    -- the two statements that make it true.
    'canonical_certify_ok', case when v_defer_base then null
                                 else iam.canonical_certify_ok(v_schema, v_table, v_token) end,
    'base_contract', case when v_defer_base then jsonb_build_object(
        'status', 'pending_attach',
        'relation', v_rel,
        'why', 'The base-contract foreign keys point at auth.users and iam.organizations. Creating them inside this transaction would have held SHARE ROW EXCLUSIVE on both for the length of the build (2026-09-21: 298s, 22 sessions queued, sign-in included).',
        'remedy', format('begin; select platform.provision_attach_base_contract(%L); commit;  begin; select platform.provision_validate_base_contract(%L); commit;', v_rel, v_rel))
      else jsonb_build_object('status', 'inline') end,
    'artifacts_status', 'pending',
    'note', 'The repo projection, ORM models and frontend types are produced by db/provision_pull.py in the deploy train (PLAN §3.3), within one cycle. `pending` is by design for that window.'));
end;
$function$;

-- 8. platform.provision_batch: the same.
CREATE OR REPLACE FUNCTION platform.provision_batch(p_spec jsonb, p_applied_via text DEFAULT 'supabase_mcp'::text, p_org_id uuid DEFAULT NULL::uuid, p_lane text DEFAULT 'full'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_pre      jsonb;
  v_heal     jsonb;   -- PROVISIONER-SELF-HEAL
  v_res      jsonb;
  v_ctx      jsonb;
  v_batch_id uuid := gen_random_uuid();
  v_order    text[];
  v_key      text;
  v_tbl      jsonb;
  v_r        jsonb;
  v_item     jsonb;
  v_def      jsonb;
  v_schema   text;
  v_results  jsonb[] := '{}'::jsonb[];
  v_created  jsonb[] := '{}'::jsonb[];
  v_refuse   text[]  := '{}'::text[];
  v_unchanged boolean := true;
  v_unch     text[]  := '{}'::text[];
  v_i        integer;
  r          record;
begin
  if platform.provision_batch_context() ? 'batch_id' then
    raise exception 'provision: a batch is already being built in this transaction (%). A batch never nests.',
      platform.provision_batch_context()->>'batch_id'
      using errcode = 'check_violation';
  end if;

  -- ---- preflight (the same refusal platform.provision makes, made once for the batch) ----
  v_pre := platform.provision_preflight();
  if not (v_pre->>'ok')::boolean then
    -- A STALE KERNEL FINGERPRINT IS REFUSED WITH A LOGGED ROW (lane KERNEL-TAILS, 2026-09-25).
    -- A raise here rolls back everything the caller's transaction did, so a refusal left no
    -- trace: SHARE-LANE-2's file refused every spec for 26 minutes and rca2b's for 57, and
    -- nobody saw either until a lane ran check:store-doors-decide. Nothing has been written yet
    -- at this point (the run claim is an advisory lock), so this branch writes ONE
    -- ops.system_error row (kind provisioner_fingerprint_stale, naming the moved body and the
    -- remedy), warns, and RETURNS the refusal — ok false, refused true — instead of raising.
    --
    -- 🚨 AND A STALE FINGERPRINT HEALS ITSELF WHEN THE KERNEL STILL ANSWERS THE SAME (lane
    -- PROVISIONER-SELF-HEAL, 2026-09-25, chair's ruling). The fingerprint exists so no table is
    -- provisioned against an UNKNOWN kernel; it was never meant to stop table creation because a
    -- file forgot a bookkeeping line (83 minutes on production on 2026-09-25, twice, once from
    -- outside the program). When stale-kernel is the ONLY finding, the kernel's own equivalence
    -- self-check runs here, in this call, on its fixed fixture (platform.kernel_equivalence_check,
    -- about a second): identical -> the fingerprint is re-recorded with a
    -- platform.kernel_fingerprint_record row and ONE ops.system_error row of kind
    -- kernel_fingerprint_auto_rerecorded, and provisioning continues; not identical -> the logged
    -- refusal below, with the evidence in the row.
    if exists (select 1 from jsonb_array_elements(v_pre->'findings') x
                where x->>'rule_id' = 'preflight.read_kernel') then
      if jsonb_array_length(v_pre->'findings') = 1 then
        v_heal := platform._provisioner_heals_a_stale_kernel(p_spec, v_pre, p_applied_via, p_org_id, p_lane);
        if coalesce((v_heal->>'healed')::boolean, false) then
          v_pre := platform.provision_preflight();
        else
          v_pre := v_pre || jsonb_build_object('equivalence', v_heal->'equivalence');
        end if;
      end if;
      if exists (select 1 from jsonb_array_elements(v_pre->'findings') x
                  where x->>'rule_id' = 'preflight.read_kernel') then
        return platform._provisioner_refuses_a_stale_kernel(p_spec, v_pre, p_applied_via, p_org_id, p_lane);
      end if;
    end if;
    if not (v_pre->>'ok')::boolean then
    raise exception 'provision: PREFLIGHT REFUSED (% problem(s)). Nothing was written.%',
      jsonb_array_length(v_pre->'findings'),
      (select string_agg(E'\n\n' || (x->>'message'), '') from jsonb_array_elements(v_pre->'findings') x)
      using errcode = 'check_violation',
            hint = 'The enforcement chain this path rests on is not intact. Fix the named condition and call platform.provision again; nothing was written, so there is nothing to undo.';
    end if;
  end if;

  -- ---- validate the whole batch, inside THIS transaction ---------------------------
  v_res := platform.provision_validate(p_spec, p_lane, p_org_id);

  -- A member whose token ALREADY carries this exact declaration (same normalized hash,
  -- relation still standing) is `unchanged`, exactly as platform.provision answers for one
  -- table — and for such a member the validator's "already exists" findings are the
  -- expected state, not a refusal. Every other finding refuses the whole batch.
  v_unch := array(
    select t.value->>'token'
      from jsonb_array_elements(v_res->'normalized_spec'->'tables') t
     where t.value->>'token' is not null
       and exists (select 1 from platform.v_provision_spec_current c
                    where c.token = t.value->>'token'
                      and c.spec_hash = md5(t.value::text)
                      and to_regclass(format('%I.%I', c.spec->>'schema', c.spec->>'table')) is not null));
  if exists (select 1 from jsonb_array_elements(coalesce(v_res->'findings', '[]'::jsonb)) x
              where not ((x->>'table') = any (v_unch)
                         and x->>'rule_id' in ('identity.token.taken', 'views.projection.token.taken', 'types.name.taken'))) then
    raise exception 'provision: % finding(s) across % table(s); call platform.provision_validate(<spec>) for the list. Nothing was written.',
      jsonb_array_length(v_res->'findings'), jsonb_array_length(p_spec->'tables')
      using errcode = 'check_violation',
            hint = format('The rules that refused: %s',
                     (select string_agg(distinct x->>'rule_id', ', ') from jsonb_array_elements(v_res->'findings') x));
  end if;
  v_ctx   := (v_res->'normalized_spec'->'batch_context') || jsonb_build_object('batch_id', v_batch_id);
  v_order := array(select jsonb_array_elements_text(v_res->'normalized_spec'->'batch_order'));

  perform set_config('matrx.provision_batch', v_ctx::text, true);
  perform set_config('matrx.provision_batch_deferred', '{"fks": [], "edges": []}', true);

  -- ---- every member's types, first, so a member may use a type another declares ------
  -- The marker is raised only around the DDL THIS function emits: every member call raises
  -- and lowers its own, and platform.provision_preflight refuses to start under a raised one
  -- (two provisioning runs must never interleave their DDL).
  perform set_config('matrx.provisioner', '1', true);
  perform platform.provision_marker_set(true);
  for v_tbl in select value from jsonb_array_elements(p_spec->'tables') loop
    v_schema := v_tbl->>'schema';
    for v_item in select value from jsonb_array_elements(coalesce(v_tbl->'types', '[]'::jsonb)) loop
      if to_regtype(format('%I.%I', v_schema, v_item->>'name')) is null then
        execute format('create type %I.%I as enum (%s)', v_schema, v_item->>'name',
                 (select string_agg(quote_literal(l), ', ') from jsonb_array_elements_text(v_item->'labels') l));
        v_created := v_created || jsonb_build_object('type', format('%s.%s', v_schema, v_item->>'name'));
      end if;
    end loop;
  end loop;

  perform set_config('matrx.provisioner', '0', true);
  perform platform.provision_marker_set(false);

  -- ---- every member, in dependency order, through the ONE builder --------------------
  foreach v_key in array v_order loop
    select t.value into v_tbl
      from jsonb_array_elements(p_spec->'tables') with ordinality t(value, ord)
     where coalesce(t.value->>'token', format('#%s', t.ord - 1)) = v_key;
    v_r := platform.provision(v_tbl, p_applied_via, p_org_id, p_lane);
    v_unchanged := v_unchanged and coalesce((v_r->>'unchanged')::boolean, false);
    v_results := v_results || jsonb_build_object(
      'token', v_key, 'unchanged', coalesce((v_r->>'unchanged')::boolean, false),
      'spec_hash', v_r->>'spec_hash', 'created', v_r->'created', 'certify', v_r->'certify',
      'canonical_certify_ok', v_r->'canonical_certify_ok');
  end loop;

  -- ---- the constraints and edges that had to wait for every member ------------------
  perform set_config('matrx.provisioner', '1', true);
  perform platform.provision_marker_set(true);
  v_def := coalesce(nullif(current_setting('matrx.provision_batch_deferred', true), '')::jsonb,
                    '{"fks": [], "edges": []}'::jsonb);
  for v_item in select value from jsonb_array_elements(coalesce(v_def->'fks', '[]'::jsonb)) loop
    if to_regclass(v_item->>'target') is null then
      raise exception 'provision: %.% references %, which this batch did not build. Nothing was written.',
        v_item->>'relation', v_item->>'column', v_item->>'target'
        using errcode = 'check_violation';
    end if;
    execute format('alter table %s add constraint %I foreign key (%I) references %s(id) on delete %s',
                   v_item->>'relation', left(format('%s_%s_fkey', v_item->>'table', v_item->>'column'), 63),
                   v_item->>'column', v_item->>'target', v_item->>'on_delete');
    v_created := v_created || jsonb_build_object('foreign_key',
      format('%s.%s -> %s (added after the batch built %s)', v_item->>'relation', v_item->>'column', v_item->>'target', v_item->>'target'));
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(v_def->'edges', '[]'::jsonb)) loop
    insert into platform.association_types(source_type, target_type, label, container_side, conveys_max, notes)
    values (v_item->>'source_type', v_item->>'target_type', v_item->>'label',
            coalesce(v_item->>'container_side','none'),
            coalesce(v_item->>'conveys_max','editor')::public.permission_level, v_item->>'notes')
    on conflict (source_type, target_type) do nothing;
    v_created := v_created || jsonb_build_object('association_type',
      format('%s -> %s', v_item->>'source_type', v_item->>'target_type'));
  end loop;

  -- ---- certification, AGAIN, after the constraints each member was waiting for -------
  for v_i in 1 .. cardinality(v_results) loop
    if (v_results[v_i]->>'unchanged')::boolean then continue; end if;
    v_key := v_results[v_i]->>'token';
    for r in select * from iam.canonical_certify(v_ctx->'tokens'->v_key->>'schema', v_ctx->'tokens'->v_key->>'table', v_key) loop
      if r.status = 'FAIL'
         or (r.status = 'WARN'
             and split_part(coalesce(r.detail, ''), ':', 1) not in ('legacy_owner_col','legacy_is_public','legacy_is_deleted')) then
        v_refuse := v_refuse || format('%s %s [%s]: %s', v_key, r.category, r.status, coalesce(r.detail,''));
      end if;
    end loop;
    v_results[v_i] := v_results[v_i] || jsonb_build_object('canonical_certify_ok',
      iam.canonical_certify_ok(v_ctx->'tokens'->v_key->>'schema', v_ctx->'tokens'->v_key->>'table', v_key));
  end loop;
  if cardinality(v_refuse) > 0 then
    raise exception 'provision: the batch refused certification after its deferred constraints. Nothing was written.%',
      E'\n  - ' || array_to_string(v_refuse, E'\n  - ')
      using errcode = 'check_violation',
            hint = (select otherwise from platform.provision_rule_message where rule_id = 'certify.refused');
  end if;

  perform set_config('matrx.provision_batch', '', true);
  perform set_config('matrx.provision_batch_deferred', '', true);
  perform set_config('matrx.provisioner', '0', true);
  perform platform.provision_marker_set(false);

  return platform._provision_says_the_kernel_was_rerecorded(jsonb_build_object(
    'ok', true, 'batch', true, 'batch_id', v_batch_id, 'unchanged', v_unchanged,
    'spec_hash', v_res->>'spec_hash',
    'order', to_jsonb(v_order),
    'tables', coalesce(to_jsonb(v_results), '[]'::jsonb),
    'created', coalesce(to_jsonb(v_created), '[]'::jsonb),
    'plan', v_res->'plan',
    'artifacts_status', 'pending',
    'note', 'Every member''s capture row carries this batch_id. The repo projection, ORM models and frontend types are produced by db/provision_pull.py in the deploy train (PLAN §3.3), within one cycle. `pending` is by design for that window.'));
end;
$function$;

-- The kernel this file was proved against, and the check passes on it.
do $g$
declare c jsonb;
begin
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'selfheal: the live access-kernel fingerprint (%) is not the recorded one (%); this file records nothing and must land on a matched kernel.',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  end if;
  if not ((platform.provision_preflight())->>'ok')::boolean then
    raise exception 'selfheal: the provisioner preflight refuses: %', platform.provision_preflight();
  end if;
  c := platform.kernel_equivalence_check();
  if not coalesce((c->>'ok')::boolean, false) then
    raise exception 'selfheal: the kernel equivalence check does not pass on the kernel this file was proved against: %', c - 'read_lane';
  end if;
  raise notice 'selfheal: equivalence ok — % answers, % of % tables identical, % ms', c->>'answers',
    c->'read_lane'->>'identical', c->'read_lane'->>'tables', c->>'ms';
end $g$;
