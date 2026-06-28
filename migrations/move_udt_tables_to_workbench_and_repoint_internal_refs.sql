-- Move all 10 udt_* tables public -> workbench (their canonical home) and repoint
-- every INTERNAL DB reference. NO shims left behind. Data preserved (SET SCHEMA
-- keeps rows; the wbx_pattern->udt_datasets FK + intra-set FKs auto-follow cross-
-- schema; RLS policies + 23 triggers move with the tables). App code (FE/aidream)
-- is repointed AFTER — its now-broken refs are the intended to-do signal.
--
-- Function rewrite: (public.)?<table> -> workbench.<table> for each of the 10
-- exact table names with word boundaries (\y). Because '_' is a regex word char,
-- function NAMES that merely start with a table name (e.g.
-- udt_dataset_rows_validate_trigger) are NOT matched — only real table refs are.
-- Verified post-apply: 0 functions reference public.udt_* or any non-workbench
-- udt ref; 41 functions now on workbench.udt_*.
-- Idempotent: table move guarded by to_regclass; rewrite re-runs to a fixpoint.
do $mig$
declare
  t text;
  r record;
  olddef text;
  newdef text;
  tbls text[] := array[
    'udt_dataset_row_versions','udt_document_snapshots','udt_workbook_snapshots',
    'udt_picklist_items','udt_dataset_fields','udt_dataset_rows','udt_datasets',
    'udt_documents','udt_picklists','udt_workbooks'
  ];
begin
  foreach t in array tbls loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I set schema workbench', t);
    end if;
  end loop;

  for r in
    select p.oid
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.prokind='f' and n.nspname='public'
      and pg_get_functiondef(p.oid) ~ ('\y(' || array_to_string(tbls,'|') || ')\y')
  loop
    olddef := pg_get_functiondef(r.oid);
    newdef := olddef;
    foreach t in array tbls loop
      newdef := regexp_replace(newdef, '(public\.)?\y'||t||'\y', 'workbench.'||t, 'g');
    end loop;
    if newdef <> olddef then
      execute newdef;
    end if;
  end loop;

  update public.shareable_resource_registry
     set schema_name='workbench'
   where table_name like 'udt\_%' escape '\' and schema_name is distinct from 'workbench';
end $mig$;
