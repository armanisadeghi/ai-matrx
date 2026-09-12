-- N01 canonical catalog capture. READ ONLY; run with an empty search_path.
BEGIN TRANSACTION READ ONLY;
SELECT set_config('search_path', '', true);
WITH target AS (SELECT 'workbench.note_folders'::regclass AS rel),
columns AS (
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid,false)) ORDER BY a.attname),'[]'::jsonb) j
 FROM target t JOIN pg_attribute a ON a.attrelid=t.rel LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attname IN ('id','organization_id','created_by','name','parent_id') AND NOT a.attisdropped
),
acl AS (
 SELECT jsonb_build_object('acl_is_null',c.relacl IS NULL,'grants',coalesce((SELECT jsonb_agg(jsonb_build_object('grantor',coalesce(g.rolname,'PUBLIC'),'grantee',coalesce(r.rolname,'PUBLIC'),'privilege',(x).privilege_type,'grantable',(x).is_grantable) ORDER BY coalesce(g.rolname,'PUBLIC'),coalesce(r.rolname,'PUBLIC'),(x).privilege_type,(x).is_grantable) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x LEFT JOIN pg_roles g ON g.oid=(x).grantor LEFT JOIN pg_roles r ON r.oid=(x).grantee),'[]'::jsonb)) j
 FROM target t JOIN pg_class c ON c.oid=t.rel
),
policies AS (
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',coalesce((SELECT jsonb_agg(coalesce(r.rolname,'PUBLIC') ORDER BY coalesce(r.rolname,'PUBLIC')) FROM unnest(p.polroles) role_oid LEFT JOIN pg_roles r ON r.oid=role_oid),'[]'::jsonb),'using',pg_get_expr(p.polqual,p.polrelid,false),'with_check',pg_get_expr(p.polwithcheck,p.polrelid,false)) ORDER BY p.polname,p.polcmd),'[]'::jsonb) j
 FROM target t LEFT JOIN pg_policy p ON p.polrelid=t.rel
),
triggers AS (
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,false),'function',jsonb_build_object('schema',n.nspname,'name',p.proname,'identity_arguments',pg_get_function_identity_arguments(p.oid),'owner',o.rolname,'config',coalesce((SELECT jsonb_agg(v ORDER BY v) FROM unnest(p.proconfig) v),'[]'::jsonb),'acl',jsonb_build_object('acl_is_null',p.proacl IS NULL,'grants',coalesce((SELECT jsonb_agg(jsonb_build_object('grantor',coalesce(g.rolname,'PUBLIC'),'grantee',coalesce(r.rolname,'PUBLIC'),'privilege',(x).privilege_type,'grantable',(x).is_grantable) ORDER BY coalesce(g.rolname,'PUBLIC'),coalesce(r.rolname,'PUBLIC'),(x).privilege_type,(x).is_grantable) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x LEFT JOIN pg_roles g ON g.oid=(x).grantor LEFT JOIN pg_roles r ON r.oid=(x).grantee),'[]'::jsonb)),'definition',pg_get_functiondef(p.oid))) ORDER BY t.tgname),'[]'::jsonb) j
 FROM target x LEFT JOIN pg_trigger t ON t.tgrelid=x.rel AND NOT t.tgisinternal LEFT JOIN pg_proc p ON p.oid=t.tgfoid LEFT JOIN pg_namespace n ON n.oid=p.pronamespace LEFT JOIN pg_roles o ON o.oid=p.proowner
),
indexes AS (
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'unique',i.indisunique,'valid',i.indisvalid,'ready',i.indisready,'definition',pg_get_indexdef(i.indexrelid)) ORDER BY c.relname),'[]'::jsonb) j
 FROM target t JOIN pg_index i ON i.indrelid=t.rel JOIN pg_class c ON c.oid=i.indexrelid
 WHERE c.relname IN ('note_folders_created_by_name_unique','note_folders_organization_created_by_name_unique','note_folders_id_organization_unique')
),
foreign_keys AS (
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.conname,'definition',pg_get_constraintdef(c.oid,false),'validated',c.convalidated,'deferrable',c.condeferrable,'initially_deferred',c.condeferred,'child',c.conrelid::regclass::text,'parent',c.confrelid::regclass::text) ORDER BY c.conname),'[]'::jsonb) j
 FROM pg_constraint c WHERE c.contype='f' AND (c.conrelid='workbench.notes'::regclass OR c.confrelid='workbench.note_folders'::regclass)
),
counts AS (SELECT jsonb_build_object('folders',(SELECT count(*) FROM workbench.note_folders),'notes',(SELECT count(*) FROM workbench.notes),'folderless_notes',(SELECT count(*) FROM workbench.notes WHERE folder_id IS NULL),'missing_folder_refs',(SELECT count(*) FROM workbench.notes n LEFT JOIN workbench.note_folders f ON f.id=n.folder_id WHERE n.folder_id IS NOT NULL AND f.id IS NULL),'org_mismatches',(SELECT count(*) FROM workbench.notes n JOIN workbench.note_folders f ON f.id=n.folder_id WHERE n.folder_id IS NOT NULL AND n.organization_id<>f.organization_id)) j)
SELECT jsonb_build_object('contract',jsonb_build_object('version',2,'target','workbench.note_folders','search_path',current_setting('search_path'),'transaction_read_only',current_setting('transaction_read_only')::boolean),'table',jsonb_build_object('catalog_oid',c.oid::text,'owner',o.rolname,'rls_enabled',c.relrowsecurity,'rls_forced',c.relforcerowsecurity),'columns',jsonb_build_object('canonical',columns.j,'md5',md5(columns.j::text)),'acl',jsonb_build_object('canonical',acl.j,'md5',md5(acl.j::text)),'policies',jsonb_build_object('canonical',policies.j,'md5',md5(policies.j::text)),'triggers_and_helpers',jsonb_build_object('canonical',triggers.j,'md5',md5(triggers.j::text)),'foreign_keys',jsonb_build_object('canonical',foreign_keys.j,'md5',md5(foreign_keys.j::text)),'indexes',indexes.j,'data',counts.j) snapshot
FROM target t JOIN pg_class c ON c.oid=t.rel JOIN pg_roles o ON o.oid=c.relowner CROSS JOIN columns CROSS JOIN acl CROSS JOIN policies CROSS JOIN triggers CROSS JOIN foreign_keys CROSS JOIN indexes CROSS JOIN counts;
ROLLBACK;
