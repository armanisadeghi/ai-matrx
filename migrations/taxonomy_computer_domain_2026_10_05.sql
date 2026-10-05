-- Domain tree: the Computer domain (Arman approved 2026-10-04: "the person's own computer, through the desktop app")
-- and code > desktop-apps. Registry DATA change on platform.taxonomy_node only. Atomic: raises on any unexpected count.
do $$
declare
  sys uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  comp uuid;
  n int;
begin
  insert into platform.taxonomy_node (slug,name,level,parent_id,status,docs_path,notes,organization_id)
  values ('computer','Computer','domain',null,'canonical',null,
    '2026-10-04 Arman: the person''s own computer, through the desktop app (matrx-local). Its engine is the desktop core, consumed by agents, code, files and audio.',sys)
  returning id into comp;

  insert into platform.taxonomy_node (slug,name,level,parent_id,status,docs_path,notes,organization_id)
  select s, initcap(replace(s,'-',' ')), 'feature', comp, 'proposed', null, '2026-10-04 Arman: Computer domain feature.', sys
  from unnest(array['processes','background-jobs','resources','power','screen','windows','keyboard-and-mouse',
                    'audio-devices','clipboard','system-info','folder-watch']) as s;
  get diagnostics n = row_count; if n<>11 then raise exception 'computer features % rows', n; end if;

  insert into platform.taxonomy_node (slug,name,level,parent_id,status,docs_path,notes,organization_id)
  values ('desktop-apps','Desktop Apps','feature',(select id from platform.taxonomy_node where slug='code' and level='domain'),'proposed',null,
    '2026-10-04 Arman: the coding apps the desktop manages (Claude, Codex, Cursor, VS Code, Antigravity), each with its profiles.',sys);
end $$;
