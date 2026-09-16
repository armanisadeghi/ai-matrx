-- ============================================================================
-- THE SEEDED GATE CORPUS — the test population for the unified-data switch gate
-- (THE PLAN v4 §6.2, the sixteen access arms of §7.2, acceptance test 1 of §4.14)
--
-- WHAT THIS IS. A reproducible, idempotent population that exercises, BY
-- CONSTRUCTION, every arm of the live `iam.has_access_for_base` and every shape
-- §6.2 names. Every (principal, record, level) pair it builds is written into
-- `corpus.corpus_manifest` with the answer the corpus INTENDS, and the arm that
-- is supposed to produce it. `verify.sql` then asks the live functions and
-- reports every disagreement. A disagreement is either a corpus bug or a
-- finding; the report says which, it is never passed over.
--
-- WHERE IT MAY RUN. The rehearsal branch ONLY. `run.ts` proves that from the
-- connected server's own `pg_control_system()` against `plan/BRANCH-REF`, and
-- this file refuses PRODUCTION by the same number (section 0).
--
-- REQUIRES. The live schema AND the restored graph — `restore-graph.ts`
-- (BUILD-BOOK `W0-DATA`) runs FIRST and this file seeds ON TOP of it. Section 0
-- asserts that, because a corpus seeded beside an empty graph measures nothing
-- the gate later diffs. The registry rows the kernel reads (`entity_types`,
-- `entity_relationships`, `association_types`, `membership_grant`,
-- `shareable_resource_registry`) come from the restore for every token
-- production owns; this file adds ONLY its own `corpus%` tokens, and adds a
-- shared token (`scope`, `rulebook`, `seo_starter_pack`) only when the restore
-- did not bring one — marked as corpus-owned so the teardown can tell.
-- ============================================================================

begin;

-- Provenance: an automated write must name the system making it (platform._stamp_actor_tier).
set local app.actor_system = 'gate-corpus-seed';

-- ---------------------------------------------------------------------------
-- 0. Refuse PRODUCTION — by the server's own identity, never by how empty it is.
--
-- THE OLD GUARD REFUSED THE STATE WAVE ZERO CREATES. It demanded that
-- `iam.organizations` and `auth.users` hold nothing but corpus rows — the exact
-- state `W0-DATA`'s restore destroys — so `W0-CORPUS`, whose own entry condition
-- is "`W0-DATA` reports DONE", refused itself at lane 3 of 47. Measured on the
-- rehearsal branch 2026-09-16, the guard's own two expressions: 422 organizations,
-- 478 users, and the file raised.
--
-- What has to be refused is PRODUCTION, and the one identity a client reads from
-- the connected SERVER rather than from its own arguments is
-- `pg_control_system().system_identifier` — the same judgment
-- `scripts/lib/migration-target.ts` and `aidream/db/migration_target.py` make,
-- from the same number: `parent_system_identifier` in `plan/BRANCH-REF`.
-- ---------------------------------------------------------------------------
do $$
declare v_sysid text; v_graph bigint; v_registry bigint;
begin
  select system_identifier::text into v_sysid from pg_control_system();
  -- plan/BRANCH-REF: parent_system_identifier = 7642734024280108049 (production).
  if v_sysid = '7642734024280108049' then
    raise exception
      'REFUSED: this is PRODUCTION (pg_control_system().system_identifier %). The gate corpus '
      'seeds the rehearsal branch only. Nothing was written.', v_sysid;
  end if;

  -- The corpus seeds ON TOP OF the real graph, never beside an empty one.
  select count(*) into v_graph from platform.reachability
   where container_type not like 'corpus%' and item_type not like 'corpus%';
  select count(*) into v_registry from platform.entity_types where token not like 'corpus%';
  if v_graph = 0 or v_registry = 0 then
    raise exception
      'REFUSED: the restored graph is not here — % non-corpus platform.reachability rows, '
      '% non-corpus platform.entity_types rows. REMEDY: run W0-DATA first '
      '(npx tsx scripts/gate-corpus/restore-graph.ts), then re-run this. A corpus seeded '
      'beside an empty graph measures nothing the switch gate later diffs.', v_graph, v_registry;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Tear down the previous run (idempotency), newest dependency first.
--
-- 🚨 EVERY statement here is keyed on an IDENTIFIER THE CORPUS OWNS — an id
-- prefix it coined, or a `corpus%` token. None is keyed on a TYPE. `scope`,
-- `rulebook` and `seo_starter_pack` are PRODUCTION's tokens, and the type-keyed
-- deletes this file used to carry would have taken, out of the copy the gate
-- diffs against (measured on the branch 2026-09-16): 3 `platform.entity_types`
-- rows, 183 `platform.reachability` rows and 2
-- `platform.shareable_resource_registry` rows. A corpus run must leave the
-- restored graph bit-for-bit as `W0-DATA` left it.
-- ---------------------------------------------------------------------------
drop schema if exists corpus cascade;
create schema corpus;

delete from platform.reachability
 where container_type like 'corpus%' or item_type like 'corpus%';
delete from platform.associations where id::text like 'd0000000-%';
delete from platform.association_types where source_type like 'corpus%' or target_type like 'corpus%';
delete from platform.entity_relationships where child_type like 'corpus%' or parent_type like 'corpus%';
delete from platform.entity_grants where id::text like 'e0000000-%';
delete from iam.permissions where id::text like 'f0000000-%';
delete from iam.memberships where id::text like '90000000-%';
delete from iam.industry_curators where user_id::text like 'a0000000-0000-4000-8000-%';
delete from iam.system_orgs where key like 'corpus_%';
delete from admin.admins where user_id::text like 'a0000000-0000-4000-8000-%';
delete from admin.admin_audit_log where target_user_id::text like 'a0000000-0000-4000-8000-%';
delete from platform.rulebook where id::text like 'b0000000-%';
delete from seo.starter_pack where id::text like 'b0000000-%';
delete from platform.shareable_resource_registry where resource_type like 'corpus%'
   or metadata->>'gate_corpus' = 'true';
delete from platform.entity_types where token like 'corpus%'
   or id::text like 'c5000000-%';
delete from iam.org_industries where organization_id::text like 'c0000000-%';
delete from iam.industries where id::text like 'c0000000-0000-4000-8000-0000000000f%';
delete from iam.organizations where id::text like 'c0000000-%';
delete from auth.users where id::text like 'a0000000-0000-4000-8000-%';

-- ---------------------------------------------------------------------------
-- 2. Principals. Fifteen people, one per access story, plus the one shared on
--    nothing (§6.2: "a principal shared on none").
-- ---------------------------------------------------------------------------
create table corpus.corpus_principal (
  id uuid primary key,
  name text not null unique,
  story text not null
);

insert into corpus.corpus_principal (id, name, story) values
 ('a0000000-0000-4000-8000-000000000001','owner',         'owns the Home Table record (arm 5)'),
 ('a0000000-0000-4000-8000-000000000002','grantee_viewer','direct grant at viewer (arm 10)'),
 ('a0000000-0000-4000-8000-000000000003','grantee_editor','direct grant at editor (arm 10)'),
 ('a0000000-0000-4000-8000-000000000004','grantee_admin', 'direct grant at admin (arm 10)'),
 ('a0000000-0000-4000-8000-000000000005','org_admin',     'admin of the corpus organization (arms 6, 14)'),
 ('a0000000-0000-4000-8000-000000000006','org_member',    'plain member of the corpus organization (arm 15)'),
 ('a0000000-0000-4000-8000-000000000007','super_admin',   'platform super admin (arm 9)'),
 ('a0000000-0000-4000-8000-000000000008','curator',       'industry curator (arms 3, 4)'),
 ('a0000000-0000-4000-8000-000000000009','library_org',   'member of the organization a library grant names (arm 1)'),
 ('a0000000-0000-4000-8000-00000000000a','outsider',      'signed in, in no organization (arms 2, 7, 8)'),
 ('a0000000-0000-4000-8000-00000000000b','record_member', 'membership ON the record itself (arm 11)'),
 ('a0000000-0000-4000-8000-00000000000c','scope_member',  'member of the scope a record is assigned to (arm 12)'),
 ('a0000000-0000-4000-8000-00000000000d','container_grantee','granted on containers, reaches items through them (arm 13)'),
 ('a0000000-0000-4000-8000-00000000000e','nobody',        'shared on none of it — every answer must be false');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at, is_sso_user, is_anonymous)
select '00000000-0000-0000-0000-000000000000', p.id, 'authenticated', 'authenticated',
       p.name || '@corpus.invalid', now(), now(), false, false
from corpus.corpus_principal p;

-- ---------------------------------------------------------------------------
-- 3. Organizations and industries.
-- ---------------------------------------------------------------------------
insert into iam.organizations (id, name, slug, is_system, abbreviation, metadata, created_at)
values
 ('c0000000-0000-4000-8000-000000000001','Corpus Org','corpus-org',false,'CRP','{}'::jsonb, now()),
 ('c0000000-0000-4000-8000-000000000002','Library Org','corpus-library-org',false,'LIB','{}'::jsonb, now()),
 ('c0000000-0000-4000-8000-000000000003','Corpus System Org','corpus-system-org',true,'SYS','{}'::jsonb, now());

insert into iam.industries (id, slug, name, facet, is_active, sort_order, metadata, created_at, updated_at,
                            organization_id, version, visibility)
values ('c0000000-0000-4000-8000-0000000000f1','corpus-industry','Corpus Industry','domain',true,1,'{}'::jsonb,
        now(), now(), 'c0000000-0000-4000-8000-000000000001', 1, 'internal');

insert into iam.org_industries (organization_id, industry_id, is_primary, created_at)
values ('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-0000000000f1', true, now());

insert into iam.system_orgs (key, organization_id, description, created_at, global_readable)
values ('corpus_global','c0000000-0000-4000-8000-000000000003','corpus system org', now(), true);

-- The audit row this insert writes is attributed by bootstrap.sql's default.
insert into admin.admins (user_id, created_at, level, permissions, metadata)
values ('a0000000-0000-4000-8000-000000000007', now(), 'super_admin', '{}'::jsonb, '{}'::jsonb);

insert into iam.industry_curators (user_id, industry_id, created_at, organization_id, updated_at, version, metadata)
values ('a0000000-0000-4000-8000-000000000008','c0000000-0000-4000-8000-0000000000f1', now(),
        'c0000000-0000-4000-8000-000000000001', now(), 1, '{}'::jsonb);

-- Organization memberships (the `iam.organization_member` VIEW reads these).
insert into iam.memberships (id, organization_id, container_type, container_id, user_id, role, status,
                             created_at, updated_at, version, metadata)
values
 ('90000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','organization',
  'c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000005','admin','active', now(), now(), 1, '{}'::jsonb),
 ('90000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','organization',
  'c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000006','member','active', now(), now(), 1, '{}'::jsonb),
 ('90000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000002','organization',
  'c0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000009','member','active', now(), now(), 1, '{}'::jsonb);

-- The membership→level table the kernel joins (arm 11). Live shape, re-stated
-- because the branch carries no data.
insert into iam.membership_grant (container_type, member_role, confers) values
 ('*','owner','admin'), ('*','admin','admin'), ('*','editor','editor'),
 ('*','member','viewer'), ('*','viewer','viewer')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. The corpus Tables. Nine of them, each shaped for a job §6.2 names.
--    `corpus_detail` deliberately carries NO visibility column: that is what a
--    `detail` Table is in the live kernel (db-rules §6d-1), and it is what makes
--    arm 16 the only way in.
-- ---------------------------------------------------------------------------
create table corpus.corpus_home_a   (id uuid primary key, title text not null, visibility platform.visibility not null default 'personal', created_by uuid, organization_id uuid);
create table corpus.corpus_home_b   (id uuid primary key, title text not null, visibility platform.visibility not null default 'personal', created_by uuid, organization_id uuid);
create table corpus.corpus_item     (id uuid primary key, title text not null, visibility platform.visibility not null default 'personal', created_by uuid, organization_id uuid);
create table corpus.corpus_note     (id uuid primary key, title text not null, visibility platform.visibility not null default 'personal', created_by uuid, organization_id uuid);
create table corpus.corpus_loop_a   (id uuid primary key, title text not null, visibility platform.visibility not null default 'personal', created_by uuid, organization_id uuid);
create table corpus.corpus_loop_b   (id uuid primary key, title text not null, visibility platform.visibility not null default 'personal', created_by uuid, organization_id uuid);
create table corpus.corpus_private  (id uuid primary key, title text not null, visibility platform.visibility not null default 'personal', created_by uuid, organization_id uuid);
create table corpus.corpus_public   (id uuid primary key, title text not null, visibility platform.visibility not null default 'personal', created_by uuid, organization_id uuid);
create table corpus.corpus_scope    (id uuid primary key, title text not null, visibility platform.visibility not null default 'personal', created_by uuid, organization_id uuid);
create table corpus.corpus_detail   (id uuid primary key, title text not null, home_id uuid not null references corpus.corpus_home_a(id), created_by uuid, organization_id uuid);

-- Registry rows. `data_class` decides which lanes exist at all (DD-137b), so it
-- is the knob the arm-6/14/15 stories are built on.
insert into platform.entity_types
  (token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active,
   default_visibility, is_listed, is_component, is_module, default_members_can_add,
   default_needs_approval, default_scopeable, default_auto_ingest, rls_variant, reference_pickable,
   agent_writable, allow_preview, version_store, audit_class, reference_candidate_predicates,
   lifecycle_enlisted, relation_kind, suppress_platform_admin_lane,
   component_anon_read_via_public_parent, id, confirmation_enabled, data_class, default_list_scope, client_read_only, origin)
values
 ('corpus_home_a','corpus','corpus_home_a','Corpus Home A',1,false,false,true,'personal',true,false,false,true,false,true,false,'entity',true,true,true,'history','entity','{}'::jsonb,false,'table',false,false, gen_random_uuid(), false,'organization','organization',false,'standard'),
 ('corpus_home_b','corpus','corpus_home_b','Corpus Home B',1,false,false,true,'personal',true,false,false,true,false,true,false,'entity',true,true,true,'history','entity','{}'::jsonb,false,'table',false,false, gen_random_uuid(), false,'organization','organization',false,'standard'),
 ('corpus_item','corpus','corpus_item','Corpus Item',1,false,false,true,'personal',true,false,false,true,false,true,false,'entity',true,true,true,'history','entity','{}'::jsonb,false,'table',false,false, gen_random_uuid(), false,'organization','organization',false,'standard'),
 ('corpus_note','corpus','corpus_note','Corpus Note',1,false,false,true,'personal',true,false,false,true,false,true,false,'entity',true,true,true,'history','entity','{}'::jsonb,false,'table',false,false, gen_random_uuid(), false,'organization','organization',false,'standard'),
 ('corpus_loop_a','corpus','corpus_loop_a','Corpus Loop A',1,false,false,true,'personal',true,false,false,true,false,true,false,'entity',true,true,true,'history','entity','{}'::jsonb,false,'table',false,false, gen_random_uuid(), false,'organization','organization',false,'standard'),
 ('corpus_loop_b','corpus','corpus_loop_b','Corpus Loop B',1,false,false,true,'personal',true,false,false,true,false,true,false,'entity',true,true,true,'history','entity','{}'::jsonb,false,'table',false,false, gen_random_uuid(), false,'organization','organization',false,'standard'),
 ('corpus_private','corpus','corpus_private','Corpus Private',1,false,false,true,'personal',true,false,false,true,false,true,false,'entity',true,true,true,'history','entity','{}'::jsonb,false,'table',false,false, gen_random_uuid(), false,'private','organization',false,'standard'),
 ('corpus_public','corpus','corpus_public','Corpus Public',1,false,false,true,'public',true,false,false,true,false,true,false,'entity',true,true,true,'history','entity','{}'::jsonb,false,'table',false,false, gen_random_uuid(), false,'public','organization',false,'standard'),
 ('corpus_detail','corpus','corpus_detail','Corpus Detail',1,false,false,true,'personal',true,true,false,true,false,true,false,'component',true,true,true,'history','entity','{}'::jsonb,false,'table',false,false, gen_random_uuid(), false,null,null,false,'standard');

-- THE THREE TOKENS PRODUCTION OWNS. `scope` (arm 12), `rulebook` (arm 4) and
-- `seo_starter_pack` (arm 3) are named by the LIVE kernel itself — `public.
-- _edu_can_read_via_assignment` matches `target_type = 'scope'` as a literal and
-- `iam.has_access_for_base` branches on the other two by name — so the corpus
-- cannot rename them. On a restored branch they are ALREADY HERE, as production's
-- own rows (`scope` -> `context.scopes`, `rulebook` -> `platform.rulebook`,
-- `seo_starter_pack` -> `seo.starter_pack`), and production's row is the one the
-- rehearsal has to measure. So: insert only what the restore did not bring, under
-- an id the teardown recognises, and never overwrite.
insert into platform.entity_types
  (token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active,
   default_visibility, is_listed, is_component, is_module, default_members_can_add,
   default_needs_approval, default_scopeable, default_auto_ingest, rls_variant, reference_pickable,
   agent_writable, allow_preview, version_store, audit_class, reference_candidate_predicates,
   lifecycle_enlisted, relation_kind, suppress_platform_admin_lane,
   component_anon_read_via_public_parent, id, confirmation_enabled, data_class, default_list_scope, client_read_only, origin)
values
 ('scope','corpus','corpus_scope','Corpus Scope',1,false,false,true,'personal',true,false,false,true,false,true,false,'entity',true,true,true,'history','entity','{}'::jsonb,false,'table',false,false,'c5000000-0000-4000-8000-000000000001', false,'organization','organization',false,'standard'),
 ('rulebook','platform','rulebook','Rulebook',1,false,true,true,'internal',true,false,false,true,false,true,false,'entity',true,true,true,'history','entity','{}'::jsonb,false,'table',false,false,'c5000000-0000-4000-8000-000000000002', false,'organization','organization',false,'standard'),
 ('seo_starter_pack','seo','starter_pack','SEO Starter Pack',1,false,true,true,'internal',true,false,false,true,false,true,false,'entity',true,true,true,'history','entity','{}'::jsonb,false,'table',false,false,'c5000000-0000-4000-8000-000000000003', false,'organization','organization',false,'standard')
on conflict do nothing;

-- The sharing registry (db-rules §6c): a token may not be a grant's
-- `resource_type` until it is registered here, so every Table the corpus shares
-- on gets a row.
insert into platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, display_label,
   url_path_template, rls_uses_has_permission, is_active, organization_id, metadata,
   version, visibility)
select et.token, et.schema_name, et.table_name, 'id', 'created_by', et.label,
       '/corpus/' || et.token || '/{id}', true, true,
       'c0000000-0000-4000-8000-000000000001',
       -- Corpus-owned, so the teardown deletes it by that mark rather than by its
       -- type: the three shared tokens' rows, when the restore brought them, are
       -- production's and this file never writes or removes them.
       jsonb_build_object('gate_corpus', true), 1, 'internal'
from platform.entity_types et
where et.token in ('corpus_home_a','corpus_home_b','corpus_item','corpus_note','corpus_loop_a',
                   'corpus_loop_b','corpus_private','corpus_public','corpus_detail','scope',
                   'rulebook','seo_starter_pack')
on conflict do nothing;

-- The FK parent chain (arm 16). `corpus_detail` is a composition child of
-- `corpus_home_a`; nothing is ever shared on it directly.
insert into platform.entity_relationships (child_type, parent_type, fk_column, kind, note)
values ('corpus_detail','corpus_home_a','home_id','composition','arm 16 — the detail Table with no direct share');

-- ---------------------------------------------------------------------------
-- 5. The association types. Every scope-side value the live view understands is
--    exercised: container_side 'target', 'source' and 'none', at conveys_max
--    viewer, editor and admin.
-- ---------------------------------------------------------------------------
insert into platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes, created_at, updated_at) values
 ('corpus_item','corpus_home_a',   null,'target','viewer',true,'AT1 carrying, container is the target (Home A)', now(), now()),
 ('corpus_home_b','corpus_item',   null,'source','editor',true,'AT2 carrying, container is the SOURCE (Home B) — the second Home', now(), now()),
 ('corpus_note','corpus_item',     null,'target','viewer',true,'AT3 carrying — makes the two-hop composition Home A > Item > Note', now(), now()),
 ('corpus_note','corpus_home_b',   null,'none',  'viewer',true,'AT4 conveys nothing — the note relates without carrying', now(), now()),
 ('corpus_note','corpus_loop_a',   null,'none',  'viewer',true,'AT5 conveys nothing', now(), now()),
 ('corpus_loop_a','corpus_loop_b', null,'target','editor',true,'AT6 carrying, half of the loop', now(), now()),
 ('corpus_loop_b','corpus_loop_a', null,'target','editor',true,'AT7 carrying, the other half — the loop', now(), now()),
 ('corpus_private','corpus_home_a',null,'target','admin', true,'AT8 carrying at ADMIN — the top of the ladder', now(), now()),
 ('corpus_item','scope',           null,'none',  'viewer',true,'AT9 assignment, conveys nothing (arm 12 must not borrow arm 13)', now(), now());

-- DD-263: the two halves of the loop are the ONLY relation types on the platform that are ALLOWED
-- to close one. Since DD-263 `platform.enforce_no_carrying_cycle` refuses a carrying cycle at the
-- write door unless the relation type declares it, and this corpus exists precisely to ask what the
-- kernel answers INSIDE a loop — so the loop is declared, deliberately, here and nowhere else.
update platform.association_types
   set allows_loops = true
 where source_type in ('corpus_loop_a','corpus_loop_b')
   and target_type in ('corpus_loop_a','corpus_loop_b');

-- ---------------------------------------------------------------------------
-- 6. The records.
--    DD-171 governs half of this file: containment never carries a `personal`
--    row, so every record meant to be REACHED through a container is
--    `internal`, and every record meant to stand alone is `personal`.
-- ---------------------------------------------------------------------------
insert into corpus.corpus_home_a (id, title, visibility, created_by, organization_id) values
 ('b0000000-0000-4000-8000-000000000001','Home A','personal','a0000000-0000-4000-8000-000000000001', null);
insert into corpus.corpus_home_b (id, title, visibility, created_by, organization_id) values
 ('b0000000-0000-4000-8000-000000000002','Home B','personal','a0000000-0000-4000-8000-000000000001', null);

insert into corpus.corpus_item (id, title, visibility, created_by, organization_id) values
 ('b0000000-0000-4000-8000-000000000003','Item — library grant to an organization','personal', null, null),
 ('b0000000-0000-4000-8000-000000000004','Item — open library (industry audience)','personal', null, null),
 ('b0000000-0000-4000-8000-000000000005','Item — the direct-grant ladder','personal', null, null),
 ('b0000000-0000-4000-8000-00000000000a','Item — two Homes','internal', null, null),
 ('b0000000-0000-4000-8000-00000000000b','Item — in the global-readable system organization','internal', null,'c0000000-0000-4000-8000-000000000003'),
 ('b0000000-0000-4000-8000-00000000000d','Item — the organization lanes','internal', null,'c0000000-0000-4000-8000-000000000001'),
 ('b0000000-0000-4000-8000-00000000000e','Item — membership on the record itself','personal', null, null),
 ('b0000000-0000-4000-8000-00000000000f','Item — assigned to a scope','personal', null, null),
 ('b0000000-0000-4000-8000-000000000010','Item — reached only through Home A','internal', null, null);

insert into corpus.corpus_note (id, title, visibility, created_by, organization_id) values
 ('b0000000-0000-4000-8000-000000000006','The note related to three records of three Tables','internal', null, null);
insert into corpus.corpus_detail (id, title, home_id, created_by, organization_id) values
 ('b0000000-0000-4000-8000-000000000007','Detail — no direct share, ever','b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-00000000000a', null);
insert into corpus.corpus_loop_a (id, title, visibility, created_by, organization_id) values
 ('b0000000-0000-4000-8000-000000000008','Loop A','internal', null, null);
insert into corpus.corpus_loop_b (id, title, visibility, created_by, organization_id) values
 ('b0000000-0000-4000-8000-000000000009','Loop B','internal', null, null);
insert into corpus.corpus_public (id, title, visibility, created_by, organization_id) values
 ('b0000000-0000-4000-8000-00000000000c','Public record','public', null, null);
insert into corpus.corpus_private (id, title, visibility, created_by, organization_id) values
 ('b0000000-0000-4000-8000-000000000011','Private-class record in the corpus organization','internal', null,'c0000000-0000-4000-8000-000000000001');
insert into corpus.corpus_scope (id, title, visibility, created_by, organization_id) values
 ('b0000000-0000-4000-8000-000000000012','The scope a record is assigned to','internal', null,'c0000000-0000-4000-8000-000000000001');

insert into platform.rulebook (id, name, slug, description, source, sections, rules, version, status,
                               organization_id, visibility, created_by, created_at, updated_at, metadata, industry_id)
values ('b0000000-0000-4000-8000-000000000013','Corpus Rulebook','corpus-rulebook','',
        '{}'::jsonb,'[]'::jsonb,'[]'::jsonb,1,'draft','c0000000-0000-4000-8000-000000000001','personal',
        'a0000000-0000-4000-8000-000000000001', now(), now(), '{}'::jsonb,'c0000000-0000-4000-8000-0000000000f1');

insert into seo.starter_pack (id, slug, name, industry, status, geo_model, source_corpus, organization_id,
                              created_by, created_at, updated_at, version, metadata, visibility, industry_id, pack_version)
values ('b0000000-0000-4000-8000-000000000014','corpus-pack','Corpus Starter Pack','corpus','draft','national',
        '{}'::jsonb,'c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
        now(), now(), 1, '{}'::jsonb,'personal','c0000000-0000-4000-8000-0000000000f1', 1);

-- ---------------------------------------------------------------------------
-- 7. The relations. Every shape §6.2 asks for, built from the types above.
-- ---------------------------------------------------------------------------
insert into platform.associations (id, source_type, source_id, target_type, target_id, organization_id, label, metadata, created_by, created_at, role) values
 -- Home A contains the item that is reached only through it (AT1, viewer)
 ('d0000000-0000-4000-8000-000000000001','corpus_item','b0000000-0000-4000-8000-000000000010','corpus_home_a','b0000000-0000-4000-8000-000000000001', null, null, '{}'::jsonb, null, now(), 'filed'),
 -- The two-Homes record: Home A holds it (AT1, viewer) and Home B holds it (AT2, editor)
 ('d0000000-0000-4000-8000-000000000002','corpus_item','b0000000-0000-4000-8000-00000000000a','corpus_home_a','b0000000-0000-4000-8000-000000000001', null, null, '{}'::jsonb, null, now(), 'filed'),
 ('d0000000-0000-4000-8000-000000000003','corpus_home_b','b0000000-0000-4000-8000-000000000002','corpus_item','b0000000-0000-4000-8000-00000000000a', null, null, '{}'::jsonb, null, now(), 'holds'),
 -- The note, related to three records of three Tables. One relation carries
 -- (AT3) and makes the two-hop composition; two convey nothing (AT4, AT5).
 ('d0000000-0000-4000-8000-000000000004','corpus_note','b0000000-0000-4000-8000-000000000006','corpus_item','b0000000-0000-4000-8000-000000000010', null, null, '{}'::jsonb, null, now(), 'filed'),
 ('d0000000-0000-4000-8000-000000000005','corpus_note','b0000000-0000-4000-8000-000000000006','corpus_home_b','b0000000-0000-4000-8000-000000000002', null, null, '{}'::jsonb, null, now(), 'mentions'),
 ('d0000000-0000-4000-8000-000000000006','corpus_note','b0000000-0000-4000-8000-000000000006','corpus_loop_a','b0000000-0000-4000-8000-000000000008', null, null, '{}'::jsonb, null, now(), 'mentions'),
 -- The carrying loop
 ('d0000000-0000-4000-8000-000000000007','corpus_loop_a','b0000000-0000-4000-8000-000000000008','corpus_loop_b','b0000000-0000-4000-8000-000000000009', null, null, '{}'::jsonb, null, now(), 'loops'),
 ('d0000000-0000-4000-8000-000000000008','corpus_loop_b','b0000000-0000-4000-8000-000000000009','corpus_loop_a','b0000000-0000-4000-8000-000000000008', null, null, '{}'::jsonb, null, now(), 'loops'),
 -- The admin-conveying relation (top of the ladder, AT8)
 ('d0000000-0000-4000-8000-000000000009','corpus_private','b0000000-0000-4000-8000-000000000011','corpus_home_a','b0000000-0000-4000-8000-000000000001', null, null, '{}'::jsonb, null, now(), 'filed'),
 -- The education assignment (arm 12). AT9 conveys nothing, so this arm cannot
 -- borrow arm 13's answer.
 ('d0000000-0000-4000-8000-00000000000a','corpus_item','b0000000-0000-4000-8000-00000000000f','scope','b0000000-0000-4000-8000-000000000012', null, null, '{}'::jsonb, null, now(), 'assignment');

-- ---------------------------------------------------------------------------
-- 8. The grants, memberships and library rows — one per arm.
-- ---------------------------------------------------------------------------
-- arm 1 — library grant to an organization
insert into platform.entity_grants (id, entity_type, entity_id, audience, industry_id, organization_id, granted_by, created_at) values
 ('e0000000-0000-4000-8000-000000000001','corpus_item','b0000000-0000-4000-8000-000000000003','organization', null,'c0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001', now()),
-- arm 2 — the Open Library: an industry audience nobody has to belong to
 ('e0000000-0000-4000-8000-000000000002','corpus_item','b0000000-0000-4000-8000-000000000004','industry','c0000000-0000-4000-8000-0000000000f1', null,'a0000000-0000-4000-8000-000000000001', now());

-- arm 10 — the direct-grant ladder, one grant per rung
insert into iam.permissions (id, resource_type, resource_id, granted_to_user_id, permission_level, created_at, created_by, status) values
 ('f0000000-0000-4000-8000-000000000001','corpus_item','b0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000002','viewer', now(),'a0000000-0000-4000-8000-000000000001','active'),
 ('f0000000-0000-4000-8000-000000000002','corpus_item','b0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000003','editor', now(),'a0000000-0000-4000-8000-000000000001','active'),
 ('f0000000-0000-4000-8000-000000000003','corpus_item','b0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000004','admin',  now(),'a0000000-0000-4000-8000-000000000001','active'),
-- arm 13 — the container grants the item is reached through
 ('f0000000-0000-4000-8000-000000000004','corpus_home_a','b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-00000000000d','admin', now(),'a0000000-0000-4000-8000-000000000001','active'),
 ('f0000000-0000-4000-8000-000000000005','corpus_home_b','b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-00000000000d','admin', now(),'a0000000-0000-4000-8000-000000000001','active'),
 ('f0000000-0000-4000-8000-000000000006','corpus_loop_a','b0000000-0000-4000-8000-000000000008','a0000000-0000-4000-8000-00000000000d','admin', now(),'a0000000-0000-4000-8000-000000000001','active');

-- arm 11 — a membership on the record itself; arm 12 — a membership on the scope
insert into iam.memberships (id, organization_id, container_type, container_id, user_id, role, status, created_at, updated_at, version, metadata) values
 ('90000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000001','corpus_item','b0000000-0000-4000-8000-00000000000e','a0000000-0000-4000-8000-00000000000b','editor','active', now(), now(), 1, '{}'::jsonb),
 ('90000000-0000-4000-8000-000000000005','c0000000-0000-4000-8000-000000000001','scope','b0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-00000000000c','member','active', now(), now(), 1, '{}'::jsonb);

-- ---------------------------------------------------------------------------
-- 9. Build the pair cache from the edges the relations just made.
-- ---------------------------------------------------------------------------
-- ONLY the corpus's own containers (`b0000000-%`). The restored cache holds
-- production's 6,773 rows and `platform.reachability_drift()` reads 0 over them;
-- re-deriving the whole branch would drag ~6,000 containers of production's graph
-- through this file and make the corpus's own population unreadable.
insert into platform.reachability (container_type, container_id, item_type, item_id, depth, max_level, refreshed_at)
select c.container_type, c.container_id, d.item_type, d.item_id, d.depth, d.max_level, now()
from (select distinct ce.container_type, ce.container_id from platform.containment_edges ce
       where ce.container_id::text like 'b0000000-%') c
cross join lateral platform.derive_reachability(c.container_type, c.container_id) d
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 10. The manifest — the corpus's OWN answer for every pair it built. This is
--     the thing the live functions are measured against; it is written by hand,
--     from the construction above, never from the functions.
-- ---------------------------------------------------------------------------
create table corpus.corpus_manifest (
  arm            int  not null,
  arm_name       text not null,
  shape          text not null,
  principal      uuid not null references corpus.corpus_principal(id),
  principal_name text not null,
  record_type    text not null,
  record_id      uuid not null,
  required       permission_level not null,
  include_public boolean not null default true,
  expected       boolean not null,
  expected_level text,                        -- the highest rung the corpus intends
  why            text not null,
  primary key (principal, record_type, record_id, required, include_public)
);

insert into corpus.corpus_manifest
 (arm, arm_name, shape, principal, principal_name, record_type, record_id, required, include_public, expected, expected_level, why) values
-- arm 1 — library grant (viewer only, by the arm's own guard)
 (1,'library grant','library', 'a0000000-0000-4000-8000-000000000009','library_org','corpus_item','b0000000-0000-4000-8000-000000000003','viewer',true, true,'viewer','the grant names their organization'),
 (1,'library grant','library', 'a0000000-0000-4000-8000-000000000009','library_org','corpus_item','b0000000-0000-4000-8000-000000000003','editor',true, false,'viewer','the arm is viewer-only'),
 (1,'library grant','library', 'a0000000-0000-4000-8000-00000000000a','outsider',   'corpus_item','b0000000-0000-4000-8000-000000000003','viewer',true, false, null,'an organization audience is targeted, not open'),
-- arm 2 — the Open Library
 (2,'open library','library',  'a0000000-0000-4000-8000-00000000000a','outsider',   'corpus_item','b0000000-0000-4000-8000-000000000004','viewer',true, true,'viewer','an industry audience is open to anyone signed in'),
 (2,'open library','library',  'a0000000-0000-4000-8000-00000000000e','nobody',     'corpus_item','b0000000-0000-4000-8000-000000000004','viewer',true, true,'viewer','open means open — even the principal shared on nothing'),
-- arm 3 — starter-pack curator
 (3,'pack curator','curator',  'a0000000-0000-4000-8000-000000000008','curator','seo_starter_pack','b0000000-0000-4000-8000-000000000014','viewer',true, true,'admin','curator of the pack industry'),
 (3,'pack curator','curator',  'a0000000-0000-4000-8000-000000000008','curator','seo_starter_pack','b0000000-0000-4000-8000-000000000014','admin', true, true,'admin','the arm has no level guard'),
 (3,'pack curator','curator',  'a0000000-0000-4000-8000-00000000000a','outsider','seo_starter_pack','b0000000-0000-4000-8000-000000000014','viewer',true, false, null,'not a curator'),
-- arm 4 — rulebook curator, including the draft branch
 (4,'rulebook curator','curator','a0000000-0000-4000-8000-000000000008','curator','rulebook','b0000000-0000-4000-8000-000000000013','viewer',true, true,'admin','curator of the rulebook industry'),
 (4,'rulebook curator','curator','a0000000-0000-4000-8000-000000000008','curator','rulebook','b0000000-0000-4000-8000-000000000013','admin', true, true,'admin','the rulebook is a draft, so the curator writes it'),
 (4,'rulebook curator','curator','a0000000-0000-4000-8000-00000000000e','nobody','rulebook','b0000000-0000-4000-8000-000000000013','viewer',true, false, null,'not a curator'),
-- arm 5 — ownership
 (5,'owner','home',           'a0000000-0000-4000-8000-000000000001','owner','corpus_home_a','b0000000-0000-4000-8000-000000000001','viewer',true, true,'admin','created_by is the owner'),
 (5,'owner','home',           'a0000000-0000-4000-8000-000000000001','owner','corpus_home_a','b0000000-0000-4000-8000-000000000001','admin', true, true,'admin','ownership carries every rung'),
-- arm 6 — the early org-admin lane (viewer only)
 (6,'early org-admin lane','org lanes','a0000000-0000-4000-8000-000000000005','org_admin','corpus_item','b0000000-0000-4000-8000-00000000000d','viewer',true, true,'admin','organization admin, internal row, organization class'),
 (6,'early org-admin lane','org lanes','a0000000-0000-4000-8000-000000000005','org_admin','corpus_private','b0000000-0000-4000-8000-000000000011','viewer',true, false, null,'the private class opens no organization lane'),
-- arm 7 — public visibility
 (7,'public','public',        'a0000000-0000-4000-8000-00000000000a','outsider','corpus_public','b0000000-0000-4000-8000-00000000000c','viewer',true, true,'viewer','a public row, asked with the public lane on'),
 (7,'public','public',        'a0000000-0000-4000-8000-00000000000a','outsider','corpus_public','b0000000-0000-4000-8000-00000000000c','viewer',false,false, null,'the same row with the public lane off'),
-- arm 8 — the global-readable system organization
 (8,'system organization','system org','a0000000-0000-4000-8000-00000000000a','outsider','corpus_item','b0000000-0000-4000-8000-00000000000b','viewer',true, true,'viewer','internal row in a globally readable system organization'),
 (8,'system organization','system org','a0000000-0000-4000-8000-00000000000a','outsider','corpus_item','b0000000-0000-4000-8000-00000000000b','viewer',false,false, null,'the same row with the public lane off'),
-- arm 9 — the platform-admin lane
 (9,'platform admin','system org','a0000000-0000-4000-8000-000000000007','super_admin','corpus_item','b0000000-0000-4000-8000-00000000000b','admin',true, true,'admin','super admin, system organization, organization class'),
 (9,'platform admin','system org','a0000000-0000-4000-8000-000000000007','super_admin','corpus_item','b0000000-0000-4000-8000-00000000000d','admin',true, false, null,'not a system organization — the lane does not reach here'),
-- arm 10 — the direct-grant ladder, every rung
 (10,'direct grant','ladder','a0000000-0000-4000-8000-000000000002','grantee_viewer','corpus_item','b0000000-0000-4000-8000-000000000005','viewer',true, true,'viewer','granted viewer'),
 (10,'direct grant','ladder','a0000000-0000-4000-8000-000000000002','grantee_viewer','corpus_item','b0000000-0000-4000-8000-000000000005','editor',true, false,'viewer','viewer does not reach editor'),
 (10,'direct grant','ladder','a0000000-0000-4000-8000-000000000003','grantee_editor','corpus_item','b0000000-0000-4000-8000-000000000005','editor',true, true,'editor','granted editor'),
 (10,'direct grant','ladder','a0000000-0000-4000-8000-000000000003','grantee_editor','corpus_item','b0000000-0000-4000-8000-000000000005','admin', true, false,'editor','editor does not reach admin'),
 (10,'direct grant','ladder','a0000000-0000-4000-8000-000000000004','grantee_admin','corpus_item','b0000000-0000-4000-8000-000000000005','admin', true, true,'admin','granted admin'),
-- arm 11 — membership on the record itself
 (11,'membership','membership','a0000000-0000-4000-8000-00000000000b','record_member','corpus_item','b0000000-0000-4000-8000-00000000000e','editor',true, true,'editor','the editor role confers editor'),
 (11,'membership','membership','a0000000-0000-4000-8000-00000000000b','record_member','corpus_item','b0000000-0000-4000-8000-00000000000e','admin', true, false,'editor','editor does not confer admin'),
-- arm 12 — the education assignment
 (12,'education assignment','assignment','a0000000-0000-4000-8000-00000000000c','scope_member','corpus_item','b0000000-0000-4000-8000-00000000000f','viewer',true, true,'viewer','assigned to a scope they are a member of'),
 (12,'education assignment','assignment','a0000000-0000-4000-8000-00000000000c','scope_member','corpus_item','b0000000-0000-4000-8000-00000000000f','editor',true, false,'viewer','the arm is viewer-only'),
-- arm 13 — containment through the pair cache, including the loop and both Homes
 (13,'containment','containment','a0000000-0000-4000-8000-00000000000d','container_grantee','corpus_item','b0000000-0000-4000-8000-000000000010','viewer',true, true,'viewer','reached through Home A, which conveys viewer'),
 (13,'containment','containment','a0000000-0000-4000-8000-00000000000d','container_grantee','corpus_item','b0000000-0000-4000-8000-000000000010','editor',true, false,'viewer','the relation conveys no more than viewer'),
 (13,'containment — two Homes','two homes','a0000000-0000-4000-8000-00000000000d','container_grantee','corpus_item','b0000000-0000-4000-8000-00000000000a','editor',true, true,'editor','the second Home conveys editor — access is the maximum across paths'),
 (13,'containment — two-hop','two hop','a0000000-0000-4000-8000-00000000000d','container_grantee','corpus_note','b0000000-0000-4000-8000-000000000006','viewer',true, true,'viewer','Home A > Item > Note, two carrying hops'),
 (13,'containment — loop','loop','a0000000-0000-4000-8000-00000000000d','container_grantee','corpus_loop_b','b0000000-0000-4000-8000-000000000009','editor',true, true,'editor','around the loop from Loop A, which they hold'),
 (13,'containment — admin rung','ladder','a0000000-0000-4000-8000-00000000000d','container_grantee','corpus_private','b0000000-0000-4000-8000-000000000011','admin',true, true,'admin','the relation conveys admin — the top rung, carried'),
-- arm 14 — the late org-admin lane (above viewer, where arm 6 does not reach)
 (14,'late org-admin lane','org lanes','a0000000-0000-4000-8000-000000000005','org_admin','corpus_item','b0000000-0000-4000-8000-00000000000d','admin',true, true,'admin','organization admin above viewer'),
-- arm 15 — the late org-member lane
 (15,'late org-member lane','org lanes','a0000000-0000-4000-8000-000000000006','org_member','corpus_item','b0000000-0000-4000-8000-00000000000d','viewer',true, true,'editor','a plain member reads an internal organization row'),
 (15,'late org-member lane','org lanes','a0000000-0000-4000-8000-000000000006','org_member','corpus_item','b0000000-0000-4000-8000-00000000000d','admin', true, false,'editor','the member lane stops at editor'),
 (15,'late org-member lane','org lanes','a0000000-0000-4000-8000-000000000006','org_member','corpus_private','b0000000-0000-4000-8000-000000000011','viewer',true, false, null,'the private class opens no organization lane'),
-- arm 16 — the FK parent chain, the detail Table with no direct share
 (16,'FK parent chain','detail','a0000000-0000-4000-8000-000000000001','owner','corpus_detail','b0000000-0000-4000-8000-000000000007','viewer',true, true,'admin','they own the Home the detail hangs from'),
 (16,'FK parent chain','detail','a0000000-0000-4000-8000-000000000001','owner','corpus_detail','b0000000-0000-4000-8000-000000000007','admin', true, true,'admin','the parent chain carries every rung the parent gives'),
 (16,'FK parent chain','detail','a0000000-0000-4000-8000-00000000000e','nobody','corpus_detail','b0000000-0000-4000-8000-000000000007','viewer',true, false, null,'nothing is ever shared on a detail directly'),
-- the principal shared on none of it
 (0,'none','shared on none','a0000000-0000-4000-8000-00000000000e','nobody','corpus_home_a','b0000000-0000-4000-8000-000000000001','viewer',true,false,null,'shared on none'),
 (0,'none','shared on none','a0000000-0000-4000-8000-00000000000e','nobody','corpus_item','b0000000-0000-4000-8000-000000000005','viewer',true,false,null,'shared on none'),
 (0,'none','shared on none','a0000000-0000-4000-8000-00000000000e','nobody','corpus_item','b0000000-0000-4000-8000-000000000010','viewer',true,false,null,'shared on none'),
 (0,'none','shared on none','a0000000-0000-4000-8000-00000000000e','nobody','corpus_note','b0000000-0000-4000-8000-000000000006','viewer',true,false,null,'shared on none'),
 (0,'none','shared on none','a0000000-0000-4000-8000-00000000000e','nobody','corpus_loop_b','b0000000-0000-4000-8000-000000000009','viewer',true,false,null,'shared on none'),
 (0,'none','shared on none','a0000000-0000-4000-8000-00000000000e','nobody','corpus_private','b0000000-0000-4000-8000-000000000011','viewer',true,false,null,'shared on none');

-- Put back the audit trigger bootstrap.sql stood down (see its header).
alter table admin.admins enable trigger admins_audit_trigger;

commit;
