-- LANE SC-R · REFERENCE-FIELD (P12) — A RECORD POINTS AT A PLATFORM ENTITY. GREEN.
--
-- THE USE CASE. Whitfield & Ames LLP is a two-partner workers'-compensation and personal-injury
-- firm. Its Clients table keeps one record per client matter. Each matter points at the INTAKE
-- NOTE the paralegal took on the first call and at the client's own WEB SITE — the firm reads a
-- business client's site before a deposition. In the scope system those were reference items
-- (`allowed_reference_types = {note}` and `{web_site}`); in the store they are entity-reference
-- Fields. Dana — test@test.com — is the firm's paralegal: a member who edits Clients. Admin is the
-- managing partner and keeps a private settlement memo nobody else may open.
--
-- WHAT IT PROVES, EVERY CLAUSE FROM test@test.com's `authenticated` SEAT THROUGH
-- custom.record_write / record_update / read_record / record_history / record_delete /
-- record_restore / entity_reference_words / entity_reference_kinds:
--   1  a matter pointing at its intake note and its web site lands; read_record answers each as
--      {token, id, label} with the note's own label and the site's own name
--   2  the edge beside each value is ONE platform.associations row record → <token>,
--      role = the field key, relation_field_id = the field
--   3  NEGATIVE: a web site in the intake-note column is refused ("… can only point at Note")
--   4  NEGATIVE: an invented id AND the partner's private memo are refused in the SAME words
--      ("… points at something that is not there") — missing and forbidden read alike
--   5  a matter the partner pointed at his private memo shows Dana the withheld label, never
--      the memo's title
--   6  changing the intake note moves both halves: the old edge is withdrawn, the new one live,
--      and the record's history holds both versions of the value
--   7  deleting the matter tombstones its edges; restoring it brings them back
--   8  the words helper names a picker's choices before anything is saved (withheld for the memo)
--   9  the kinds door lists note, web site and agent and not file; field_kinds publishes the word
--
-- Before SC-R the fixture's first entity-reference Field is refused:
--   23514 There is no kind of column called "entity_reference".
-- Its twin is scr_red.sql.
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/scr_green.sql   (ends in ROLLBACK)

\set ON_ERROR_STOP on
\set suite 'scr_green.sql'
\set requires 'grant:authenticated:custom.record_write|grant:authenticated:custom.record_update|grant:authenticated:custom.read_record'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '90s';

create temporary table _sr (k text primary key, v uuid) on commit drop;
grant select on _sr to authenticated;

-- ═══ FIXTURES, as the connected role: the firm, its two people, the switch, a Home, the Clients
-- ═══ Table and its two entity-reference columns, and the notes and site the matters point at.
do $fx$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org   uuid := gen_random_uuid();
  v_home  uuid; v_clients uuid; v_fnote uuid; v_fsite uuid;
  v_intake uuid := gen_random_uuid();
  v_follow uuid := gen_random_uuid();
  v_memo   uuid := gen_random_uuid();
  v_site   uuid := gen_random_uuid();
  v_agent  uuid;
  m text;
begin
  perform set_config('app.actor_system', 'campaign-test/scr_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by, settings) values
    (v_org, 'Whitfield & Ames LLP', 'whitfield-ames-llp-'||substr(v_org::text,1,8), 'WA', c_admin,
     jsonb_build_object('campaign_test', 'scr_green'));
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active'),
    (v_org,'organization',v_org,c_dana,'member','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/scr_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Whitfield & Ames LLP')) returning id into v_home;

  v_clients := custom.table_declare(v_org, jsonb_build_object(
    'name','clients','type','entity','slug','clients',
    'label_singular','Client','label_plural','Clients',
    'display','list','ordered',false,'weight','light','retention_days',2555,
    'row_order','sorted','agent_writable',true,'title_field','matter','parent_id',v_home::text,
    'default_sort', jsonb_build_array(jsonb_build_object('field','matter','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','matter','type','text'))));

  -- THE TWO COLUMNS, declared the way the field editor sends them: the kind word and the kinds.
  v_fnote := custom.field_declare(v_org, v_clients, jsonb_build_object(
    'name','intake_note','label','Intake note','type','entity_reference',
    'allowed_types', jsonb_build_array('note')));
  v_fsite := custom.field_declare(v_org, v_clients, jsonb_build_object(
    'name','client_web_sites','label','Client web sites','type','entity_reference','multi',true,
    'allowed_types', jsonb_build_array('web_site')));

  -- NEGATIVE declarations, in the column's own words.
  begin
    perform custom.field_declare(v_org, v_clients, jsonb_build_object(
      'name','medical_records','label','Medical records','type','entity_reference',
      'allowed_types', jsonb_build_array('file')));
    raise exception 'FIXTURE FAILED: an entity reference was allowed to name files';
  exception when check_violation then
    get stacked diagnostics m = pg_exception_hint;
    if m not ilike '%File column%' then
      raise exception 'FIXTURE FAILED: refused, but the remedy does not say File column: %', m;
    end if;
  end;
  begin
    perform custom.field_declare(v_org, v_clients, jsonb_build_object(
      'name','opposing_counsel','label','Opposing counsel','type','entity_reference'));
    raise exception 'FIXTURE FAILED: an entity reference that names no kind was declared';
  exception when check_violation then null;
  end;

  -- Dana works the matters, so she edits Clients (a member holds viewer by default).
  perform custom.share_grant(v_org, v_clients, 'user', c_dana, 'editor'::public.permission_level);

  -- WHAT THE MATTERS POINT AT. Dana's two notes are the firm's (visible to its members); the
  -- partner's memo is personal to him; the client's site is the firm's research target.
  insert into workbench.notes (id, label, content, organization_id, created_by, visibility) values
    (v_intake, 'Intake call — Marisol Delgado, fall from a roof ladder 08/14',
     'Roofer, 11 years. Fell ~9 ft from a ladder on a residential job; L1 compression fracture. Employer: Delgado Roofing & Solar (her brother). Carrier denied on 08/29 citing independent-contractor status.',
     v_org, c_dana, 'internal'),
    (v_follow, 'Follow-up call — QME panel request and wage statements',
     'Requested the QME panel on 09/03. Client to send 12 weeks of pay stubs and the 1099 the carrier relies on.',
     v_org, c_dana, 'internal'),
    (v_memo, 'Partner memo — Delgado settlement range',
     'Private. Range discussed with co-counsel only.',
     v_org, c_admin, 'personal');
  insert into web.site (id, organization_id, created_by, name, root_url, domain) values
    (v_site, v_org, c_dana, 'Delgado Roofing & Solar', 'https://delgadoroofingsolar.com', 'delgadoroofingsolar.com');

  -- A MATTER THE PARTNER POINTED AT HIS OWN MEMO (the server lane; he may open it).
  insert into _sr values ('memo_matter', custom.record_write(v_org, v_clients, jsonb_build_object(
    'matter', 'Delgado v. Delgado Roofing & Solar — settlement conference prep',
    'intake_note', jsonb_build_object('token','note','id',v_memo::text))));

  select a.id into v_agent from agent.definition a where a.deleted_at is null limit 1;
  insert into _sr values ('org',v_org),('clients',v_clients),('fnote',v_fnote),('fsite',v_fsite),
                         ('intake',v_intake),('follow',v_follow),('memo',v_memo),('site',v_site),
                         ('dana',c_dana),('admin',c_admin);
end $fx$;

-- ═══ THE SEAT ════════════════════════════════════════════════════════════════════════════
do $seat$
declare
  c_dana_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := (select v from _sr where k='org');
  v_clients uuid := (select v from _sr where k='clients');
  v_fnote   uuid := (select v from _sr where k='fnote');
  v_fsite   uuid := (select v from _sr where k='fsite');
  v_intake  uuid := (select v from _sr where k='intake');
  v_follow  uuid := (select v from _sr where k='follow');
  v_memo    uuid := (select v from _sr where k='memo');
  v_site    uuid := (select v from _sr where k='site');
  v_memo_matter uuid := (select v from _sr where k='memo_matter');
  v_rec uuid; v_doc jsonb; v_n int; m text; v_words jsonb; v_ver int;
begin
  perform set_config('request.jwt.claims', c_dana_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASS — seated as authenticated (test@test.com), custom.record unreadable directly';

  -- 1 · the matter lands pointing at its intake note and its web site, and reads back with words
  v_rec := custom.record_write(v_org, v_clients, jsonb_build_object(
    'matter', 'Delgado v. Delgado Roofing & Solar — WC claim ADJ11873402',
    'intake_note', jsonb_build_object('token','note','id',v_intake::text),
    'client_web_sites', jsonb_build_array(jsonb_build_object('token','web_site','id',v_site::text))));
  v_doc := custom.read_record(v_org, v_rec, false);
  if v_doc -> 'intake_note' ->> 'token' is distinct from 'note'
     or v_doc -> 'intake_note' ->> 'id' is distinct from v_intake::text
     or v_doc -> 'intake_note' ->> 'label' is distinct from 'Intake call — Marisol Delgado, fall from a roof ladder 08/14' then
    raise exception 'CLAUSE 1 FAILED: the intake note reads back as %', v_doc -> 'intake_note';
  end if;
  if jsonb_typeof(v_doc -> 'client_web_sites') <> 'array'
     or v_doc -> 'client_web_sites' -> 0 ->> 'label' is distinct from 'Delgado Roofing & Solar' then
    raise exception 'CLAUSE 1 FAILED: the web sites read back as %', v_doc -> 'client_web_sites';
  end if;
  raise notice 'CLAUSE 1 PASS — read_record answers % and %', v_doc -> 'intake_note', v_doc -> 'client_web_sites';

  -- 2 · the edge beside each value: one association record → <token>, role = key, field on it
  select count(*) into v_n from platform.associations a
   where a.source_type = 'record' and a.source_id = v_rec and a.deleted_at is null
     and ((a.target_type = 'note' and a.target_id = v_intake and a.role = 'intake_note' and a.relation_field_id = v_fnote)
       or (a.target_type = 'web_site' and a.target_id = v_site and a.role = 'client_web_sites' and a.relation_field_id = v_fsite));
  if v_n <> 2 then
    raise exception 'CLAUSE 2 FAILED: % of the two edges are there: %', v_n,
      (select jsonb_agg(jsonb_build_object('t',a.target_type,'id',a.target_id,'role',a.role,'f',a.relation_field_id))
         from platform.associations a where a.source_type='record' and a.source_id=v_rec and a.deleted_at is null);
  end if;
  raise notice 'CLAUSE 2 PASS — record → note (intake_note) and record → web_site (client_web_sites), each naming its field';

  -- 3 · NEGATIVE: the wrong kind in a column
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object(
      'intake_note', jsonb_build_object('token','web_site','id',v_site::text)));
    raise exception 'CLAUSE 3 FAILED: a web site was put in the intake-note column';
  exception when check_violation then
    get stacked diagnostics m = message_text;
    if m not ilike 'Intake note points at %can only point at Note%' then
      raise exception 'CLAUSE 3 FAILED: refused, but in the wrong words: %', m;
    end if;
  end;
  raise notice 'CLAUSE 3 PASS — "%"', m;

  -- 4 · NEGATIVE: an invented id and the partner's private memo, refused in the same words
  begin
    perform custom.record_write(v_org, v_clients, jsonb_build_object(
      'matter', 'Okafor v. Harbor Freight Logistics — WC claim ADJ11911030',
      'intake_note', jsonb_build_object('token','note','id',gen_random_uuid()::text)));
    raise exception 'CLAUSE 4 FAILED: an invented note was pointed at';
  exception when check_violation then
    get stacked diagnostics m = message_text;
    if m <> 'Intake note points at something that is not there' then
      raise exception 'CLAUSE 4 FAILED: invented id refused in the wrong words: %', m;
    end if;
  end;
  begin
    perform custom.record_write(v_org, v_clients, jsonb_build_object(
      'matter', 'Okafor v. Harbor Freight Logistics — WC claim ADJ11911030',
      'intake_note', jsonb_build_object('token','note','id',v_memo::text)));
    raise exception 'CLAUSE 4 FAILED: Dana pointed a matter at the partner''s private memo';
  exception when check_violation then
    get stacked diagnostics m = message_text;
    if m <> 'Intake note points at something that is not there' then
      raise exception 'CLAUSE 4 FAILED: the private memo refused in different words: %', m;
    end if;
  end;
  raise notice 'CLAUSE 4 PASS — an invented note and a note she may not open both answer "%"', m;

  -- 5 · the matter the partner pointed at his memo: Dana sees the withheld label, never the title
  v_doc := custom.read_record(v_org, v_memo_matter, false);
  if v_doc -> 'intake_note' ->> 'id' is distinct from v_memo::text
     or v_doc -> 'intake_note' ->> 'label' is distinct from platform.relation_withheld_label()
     or v_doc::text ilike '%settlement range%' then
    raise exception 'CLAUSE 5 FAILED: the memo reference reads back to Dana as %', v_doc -> 'intake_note';
  end if;
  raise notice 'CLAUSE 5 PASS — the partner''s memo reads to Dana as label "%"', v_doc -> 'intake_note' ->> 'label';

  -- 6 · a change moves both halves, and the history holds both versions of the value
  perform custom.record_update(v_org, v_rec, jsonb_build_object(
    'intake_note', jsonb_build_object('token','note','id',v_follow::text)));
  select count(*) into v_n from platform.associations a
   where a.source_type='record' and a.source_id=v_rec and a.target_type='note' and a.target_id=v_intake
     and a.role='intake_note' and a.deleted_at is null;
  if v_n <> 0 then raise exception 'CLAUSE 6 FAILED: the edge to the first intake note was not withdrawn'; end if;
  select count(*) into v_n from platform.associations a
   where a.source_type='record' and a.source_id=v_rec and a.target_type='note' and a.target_id=v_follow
     and a.role='intake_note' and a.deleted_at is null;
  if v_n <> 1 then raise exception 'CLAUSE 6 FAILED: no live edge to the follow-up note'; end if;
  if custom.read_record(v_org, v_rec, false) -> 'intake_note' ->> 'label'
     is distinct from 'Follow-up call — QME panel request and wage statements' then
    raise exception 'CLAUSE 6 FAILED: the changed value reads %', custom.read_record(v_org, v_rec, false) -> 'intake_note';
  end if;
  select count(*) into v_n from custom.record_history(v_org, v_rec, 50, 0) h
   where h.changes::text like '%' || v_intake::text || '%' or h.changes::text like '%' || v_follow::text || '%';
  if v_n < 1 then
    raise exception 'CLAUSE 6 FAILED: the record history does not name the intake note change: %',
      (select jsonb_agg(to_jsonb(h)) from custom.record_history(v_org, v_rec, 50, 0) h);
  end if;
  select count(*) into v_n from custom.record_history(v_org, v_rec, 50, 0) h;
  raise notice 'CLAUSE 6 PASS — old edge withdrawn, new edge live, history holds % versions naming the change', v_n;

  -- 7 · delete tombstones the edges; restore brings them back
  perform custom.record_delete(v_org, v_rec);
  select count(*) into v_n from platform.associations a
   where a.source_type='record' and a.source_id=v_rec and a.target_type <> 'record' and a.deleted_at is null;
  if v_n <> 0 then raise exception 'CLAUSE 7 FAILED: % entity edges stayed live after the matter was deleted', v_n; end if;
  perform custom.record_restore(v_org, v_rec);
  select count(*) into v_n from platform.associations a
   where a.source_type='record' and a.source_id=v_rec and a.target_type <> 'record' and a.deleted_at is null;
  if v_n <> 2 then raise exception 'CLAUSE 7 FAILED: after the restore % of the 2 entity edges are live', v_n; end if;
  raise notice 'CLAUSE 7 PASS — deleted: 0 live entity edges; restored: 2';

  -- 8 · the words helper, for a picker before anything is saved
  v_words := custom.entity_reference_words(v_org, jsonb_build_array(
    jsonb_build_object('token','note','id',v_intake::text),
    jsonb_build_object('token','note','id',v_memo::text),
    jsonb_build_object('token','web_site','id',v_site::text)));
  if v_words -> 0 ->> 'label' is distinct from 'Intake call — Marisol Delgado, fall from a roof ladder 08/14'
     or v_words -> 1 ->> 'label' is distinct from platform.relation_withheld_label()
     or v_words -> 2 ->> 'label' is distinct from 'Delgado Roofing & Solar' then
    raise exception 'CLAUSE 8 FAILED: the words helper answered %', v_words;
  end if;
  raise notice 'CLAUSE 8 PASS — entity_reference_words named the note and the site, withheld the memo';

  -- 9 · the kinds a record may point at, and the word on the menu
  if not exists (select 1 from custom.entity_reference_kinds() k where k.token = 'note')
     or not exists (select 1 from custom.entity_reference_kinds() k where k.token = 'web_site')
     or not exists (select 1 from custom.entity_reference_kinds() k where k.token = 'agent')
     or exists (select 1 from custom.entity_reference_kinds() k where k.token in ('file','record','user','user_profile')) then
    raise exception 'CLAUSE 9 FAILED: the kinds are %', (select jsonb_agg(k.token) from custom.entity_reference_kinds() k);
  end if;
  if not exists (select 1 from custom.field_kinds() k where k.kind = 'entity_reference' and k.behavior = 'relation') then
    raise exception 'CLAUSE 9 FAILED: custom.field_kinds() does not publish entity_reference';
  end if;
  select count(*) into v_n from custom.entity_reference_kinds();
  raise notice 'CLAUSE 9 PASS — % kinds a record may point at (note, web site, agent … never file or a person); field_kinds publishes entity_reference', v_n;
end $seat$;

\echo 'scr_green.sql: ALL CLAUSES PASSED'
rollback;
