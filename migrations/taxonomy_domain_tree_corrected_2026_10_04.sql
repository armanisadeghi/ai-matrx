-- Domain tree 2026-10-04 (Arman's final rulings; Arman: "apply it"). Registry DATA change on platform.taxonomy_node,
-- platform.entity_types and agent.review_queue. Re-parents in place (ids kept). Reverse from the snapshot
-- taxonomy_node_snapshot_before_2026-10-04.json taken before the change. Atomic: raises on any unexpected row count.
do $$
declare
  sys uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  n int;
begin
  -- 0. free the slug `web` for the new domain: apps > web (0 refs anywhere) becomes web-app
  update platform.taxonomy_node set slug='web-app', name='Web App',
    notes=coalesce(nullif(notes,'')||' ','')||'2026-10-04: slug web -> web-app so the Web domain can take `web` (Arman ruling Q4). Zero references held the old slug.'
  where slug='web' and level='feature';
  get diagnostics n = row_count; if n<>1 then raise exception 'web rename touched % rows', n; end if;

  -- 1. new domain rows
  insert into platform.taxonomy_node (slug,name,level,parent_id,status,docs_path,notes,organization_id) values
   ('files','Files','domain',null,'canonical','systems/files/','2026-10-04 Arman: own server (matrx-files), own schema (files); every domain consumes it. Was wrongly inside Media.',sys),
   ('content','Content','domain',null,'canonical',null,'2026-10-04 Arman: authored content on the one content store (content.document).',sys),
   ('data','Data','domain',null,'canonical','systems/data/','2026-10-04 Arman: records an organization defines and owns (schema custom, matrx-records), plus scopes.',sys),
   ('board','Board','domain',null,'canonical','systems/board/','2026-10-04 Arman: the Board engine and its hosts (War Room, dashboard, launchpad).',sys),
   ('projects','Projects','domain',null,'canonical',null,'2026-10-04 Arman: projects and tasks, a primitive consumed across domains.',sys),
   ('web','Web','domain',null,'canonical','systems/web/','2026-10-04 Arman: how the platform reaches the web (matrx-scraper, search, cloud browser, residential egress).',sys),
   ('audio','Audio','domain',null,'canonical',null,'2026-10-04 Arman: the speech engine (TTS/STT), transcription and voice settings.',sys);

  -- 2. coding -> code (slug + name; ids unchanged; no reference holds the slug)
  update platform.taxonomy_node set slug='code', name='Code', docs_path='systems/code/',
    notes=coalesce(nullif(notes,'')||' ','')||'2026-10-04 Arman: renamed from coding.'
  where slug='coding' and level='domain';
  get diagnostics n = row_count; if n<>1 then raise exception 'coding rename touched % rows', n; end if;

  -- 3. re-parent features in place
  update platform.taxonomy_node c set parent_id = d.id
  from (values
    ('file-service','files'),('pdf','files'),('media-durability','files'),
    ('audio-tts','audio'),('transcription','audio'),
    ('printing','publish'),('product-capture','commerce'),
    ('boards','board'),('war-room','board'),('dashboard','board'),('launchpad','board'),
    ('notes','content'),('documents','content'),('visual-maps','content'),('esign','content'),('utilities','content'),
    ('data-tables','data'),('forms','data'),('custom-data','data'),('drill-down','data'),('scopes-context','data'),
    ('tasks-and-projects','projects'),
    ('reports','intelligence'),
    ('scraper','web'),('web-search','web'),('persistent-cloud-browser','web'),('residential-egress','web'),
    ('lists-and-workbooks','data')
  ) as m(child,dom)
  join platform.taxonomy_node d on d.slug=m.dom and d.level='domain'
  where c.slug=m.child and c.level='feature';
  get diagnostics n = row_count; if n<>28 then raise exception 're-parent touched % rows, expected 28', n; end if;

  -- 3b. workbooks: subfeature of data-tables -> feature of content (Univer spreadsheets are authored content)
  update platform.taxonomy_node set level='feature', parent_id=(select id from platform.taxonomy_node where slug='content')
  where slug='workbooks' and level='subfeature';
  get diagnostics n = row_count; if n<>1 then raise exception 'workbooks touched % rows', n; end if;

  -- 4. docs_path for folders that move with this change
  update platform.taxonomy_node c set docs_path=m.p from (values
    ('file-service','systems/files/file-service/'),('media-durability','systems/files/media-durability/'),
    ('custom-data','systems/data/custom-data/'),('drill-down','systems/data/drill-down/'),
    ('scopes-context','systems/data/scopes-context/'),('context-delivery','systems/data/scopes-context/context-delivery/'),
    ('residential-egress','systems/web/residential-egress/'),('persistent-cloud-browser','systems/web/persistent-cloud-browser/'),
    ('coding-session-bridge','systems/code/coding-session-bridge/'),('boards','systems/board/boards/')
  ) as m(s,p) where c.slug=m.s;
  get diagnostics n = row_count; if n<>10 then raise exception 'docs_path touched % rows', n; end if;

  -- 5. new feature rows
  insert into platform.taxonomy_node (slug,name,level,parent_id,status,docs_path,notes,organization_id) values
   ('content-store','Content Store','feature',(select id from platform.taxonomy_node where slug='content'),'canonical',null,
     '2026-10-04: the one canonical store for authored rich content (content.document, document_version, univer_payload).',sys),
   ('storage-sources','Storage Sources','feature',(select id from platform.taxonomy_node where slug='files'),'canonical',null,
     '2026-10-04: Box, Dropbox, Google Drive items resolved into the Matrx Files pipeline (aidream/services/storage_sources).',sys),
   ('reversible-action','Reversible Action','feature',(select id from platform.taxonomy_node where slug='platform'),'canonical','systems/platform/reversible-action/',
     '2026-10-04: docs folder existed with no registry node.',sys),
   ('scheduler','Scheduler','feature',(select id from platform.taxonomy_node where slug='architecture'),'canonical',null,
     '2026-10-04 Arman (Q10): the engine (matrx-scheduler, schema scheduler) behind workflows > automations.',sys);

  -- 6. entity types: the content store gets its own node; message_template_detail joins its parent message_template
  update platform.entity_types set taxonomy_node_id=(select id from platform.taxonomy_node where slug='content-store')
  where (schema_name,table_name) in (('content','document'),('content','document_version'),('content','univer_payload'))
    and taxonomy_node_id=(select id from platform.taxonomy_node where slug='documents');
  get diagnostics n = row_count; if n<>3 then raise exception 'content-store entity types % rows', n; end if;
  update platform.entity_types set taxonomy_node_id=(select id from platform.taxonomy_node where slug='message-templates')
  where schema_name='agent' and table_name='message_template_detail';
  get diagnostics n = row_count; if n<>1 then raise exception 'message_template_detail % rows', n; end if;

  -- 7. split lists-and-workbooks: workbooks -> workbooks (content), deprecated datasets -> data-tables (data)
  update platform.entity_types set taxonomy_node_id=(select id from platform.taxonomy_node where slug='workbooks')
  where schema_name='workbench' and table_name='udt_workbooks';
  get diagnostics n = row_count; if n<>1 then raise exception 'udt_workbooks % rows', n; end if;
  update platform.entity_types set taxonomy_node_id=(select id from platform.taxonomy_node where slug='data-tables')
  where taxonomy_node_id=(select id from platform.taxonomy_node where slug='lists-and-workbooks') and schema_name='deprecated';
  get diagnostics n = row_count; if n<>5 then raise exception 'deprecated udt % rows', n; end if;
  update platform.taxonomy_node set anchors = anchors || '{"db_cron_jobs":["udt_dataset_row_versions_trim_weekly"]}'::jsonb
  where slug='data-tables';
  update platform.taxonomy_node set status='legacy', anchors='{}'::jsonb,
    notes=coalesce(nullif(notes,'')||' ','')||'2026-10-04: retired; split into content > workbooks and data > data-tables (entity types and cron anchor moved).'
  where slug='lists-and-workbooks';
  if exists (select 1 from platform.feature_knob where taxonomy_node_id=(select id from platform.taxonomy_node where slug='lists-and-workbooks'))
     or exists (select 1 from scheduler.sch_task where taxonomy_node_id=(select id from platform.taxonomy_node where slug='lists-and-workbooks'))
     or exists (select 1 from platform.retention_policy where taxonomy_node_id=(select id from platform.taxonomy_node where slug='lists-and-workbooks'))
     or exists (select 1 from platform.entity_types where taxonomy_node_id=(select id from platform.taxonomy_node where slug='lists-and-workbooks'))
  then raise exception 'lists-and-workbooks still referenced'; end if;

  -- 8. retire workspace (no hard delete), only once empty
  if exists (select 1 from platform.taxonomy_node where parent_id=(select id from platform.taxonomy_node where slug='workspace')) then
    raise exception 'workspace still has children';
  end if;
  update platform.taxonomy_node set status='legacy',
    notes='2026-10-04 Arman: dissolved into content, data, board, projects and intelligence. Retired; kept for history and FK targets.'
  where slug='workspace';

  -- 9. review queue: keep the denormalised domain_id equal to the moved feature's new domain
  update agent.review_queue q set domain_id = d.id
  from platform.taxonomy_node f
  join lateral (
    with recursive up as (select id,parent_id,level from platform.taxonomy_node where id=f.id
      union all select t.id,t.parent_id,t.level from platform.taxonomy_node t join up on t.id=up.parent_id)
    select id from up where level='domain'
  ) d on true
  where q.feature_id=f.id and q.domain_id is distinct from d.id
    and q.domain_id in (select id from platform.taxonomy_node where slug in ('workspace','media','knowledge','platform','architecture','account'));
end $$;
