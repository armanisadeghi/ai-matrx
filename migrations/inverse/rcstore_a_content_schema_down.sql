-- chair-step: RC-A1 inverse of rcstore_a — removes the two helpers and the document_type categories rcstore_a seeded, then tears down the EMPTY `content` schema (refuses while any relation or other function lives in it), its exposure declaration, its generate target and its PostgREST exposure.
-- Run only after rcstore_b's inverse has removed content.document.
-- ground-standing-ok: a — every trigger that calls content._capture_bypassed lives on a table in schema
-- `content`, which rcstore_g's inverse detaches and rcstore_b..f's inverses drop before this file can run;
-- and this file refuses outright while any relation remains in schema content.

do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'content')
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'content' and p.proname not in ('_capture_bypassed', 'document_search_vector')) then
    raise exception 'schema content still holds relations or functions; run rcstore_b_document_down.sql first';
  end if;
end $$;

drop function if exists content._capture_bypassed();
drop function if exists content.document_search_vector(text, text, text);

delete from platform.categories
 where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   and dimension = 'document_type' and parent_id is not null;
delete from platform.categories
 where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   and dimension = 'document_type';

-- remove `content` from pgrst.db_schemas, never retyping the rest of the list
do $$
declare v_cur text; v_val text; v_new text;
begin
  select cfg into v_cur
    from (select unnest(rolconfig) cfg from pg_roles where rolname = 'authenticator') s
   where cfg like 'pgrst.db_schemas=%';
  if v_cur is null then
    raise exception 'pgrst.db_schemas is unset on authenticator - refusing to invent one';
  end if;
  v_val := split_part(v_cur, '=', 2);
  select string_agg(btrim(x), ', ' order by ord) into v_new
    from unnest(string_to_array(v_val, ',')) with ordinality as t(x, ord)
   where btrim(x) <> 'content';
  if v_new is distinct from v_val and v_new is not null then
    execute format('alter role authenticator set pgrst.db_schemas = %L', v_new);
  end if;
end $$;

delete from platform.provision_generate_target where schema_name = 'content';
delete from platform.schema_client_exposure where schema_name = 'content';
drop schema content;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
