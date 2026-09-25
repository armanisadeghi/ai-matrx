-- inverse of migrations/campaign/suitehealth3_where_a_table_lives_is_told_only_to_who_may_open_it.sql — restores the two bodies and
-- the two door rows exactly as they were live on production and the dev clone on 2026-09-25 (sha256 of
-- pg_get_functiondef identical on both).

set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION custom.where_tables_live(p_table_ids uuid[])
 RETURNS TABLE(table_id uuid, lives_in text, why text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  if auth.uid() is null and v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
    raise exception 'Sign in to ask where a table lives.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_table_ids), 0) > 1000 then
    raise exception 'Ask about at most 1000 tables at once (% were asked).', cardinality(p_table_ids) using errcode = '22023';
  end if;
  return query
    select i.id,
           l.lives_in,
           case l.lives_in
             when 'older' then 'It is an older table, and the older table is the one in use: its copy in the new system (if it has one) is read-only until an owner switches Data tables on the organization''s settings page.'
             else 'It lives in the new system (the record store); the store''s own doors decide whether you may open it.'
           end
      from (select distinct u.id from unnest(coalesce(p_table_ids, '{}'::uuid[])) as u(id) where u.id is not null) i
      cross join lateral (select platform.table_lives_in(i.id) as lives_in) l;
end;
$function$;


CREATE OR REPLACE FUNCTION custom._older_table_copy_refusal(p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_name text;
begin
  if p_table_id is null or platform.table_lives_in(p_table_id) is distinct from 'older' then
    return null;
  end if;
  select case when auth.uid() is null or iam.has_org_access(d.organization_id)
              then coalesce(nullif(d.table_name, ''), 'this table') else 'this table' end
    into v_name
    from workbench.udt_datasets d where d.id = p_table_id and d.deleted_at is null;
  if not found then
    return null;
  end if;
  return format('This is the new system''s copy of %s; the older table is still the one in use until an owner switches Data tables on the organization''s settings page. Edit it at /data/%s.',
                v_name, p_table_id);
end;
$function$;
update platform.client_callable_door set reason = 'The copy fence''s question, asked by custom._context_copy_fence() as the writer. p_table_id is only looked up; NULL answers NULL. It answers NULL or a refusal sentence; the sentence names the table only when the caller is a member of the table''s organization (iam.has_org_access), else says "this table".', anonymous_purpose = 'The copy fence runs as whichever role writes custom.record, including a public form submitted by a visitor who is not signed in; without EXECUTE that write would fail on permission instead of on the fence. A signed-out caller learns only that an id is a copy, never its name.', declared_by = 'migrations/campaign/wherelives_the_older_table_is_the_writer_until_the_switch.sql (lane WHERE-LIVES-SWITCH)' where schema_name = 'custom' and function_name = '_older_table_copy_refusal' and identity_args = 'p_table_id uuid';
update platform.client_callable_door set reason = 'Every client (the app, the extension, the server under a person) asks here which store a table id is read and written in, instead of inferring it from whether the record store holds a same-id copy. It answers only the store word and a fixed sentence per id — never a name, organization, row or count — so it reveals nothing the older store''s or record store''s own doors would not; those doors then decide existence and access.', anonymous_purpose = NULL, declared_by = 'migrations/campaign/wherelives_the_older_table_is_the_writer_until_the_switch.sql (lane WHERE-LIVES-SWITCH)' where schema_name = 'custom' and function_name = 'where_tables_live' and identity_args = 'p_table_ids uuid[]';
