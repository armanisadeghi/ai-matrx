-- AP3-PHASEB-U4 GREEN: the §4 `where` grammar end to end through platform.entity_list_scoped (G1/G2), the sort
-- list paged by keyset (G3) and the count switch (G4), on platform columns and on "_custom.<key>".
-- Every case walks the list to the end (keyset pages) and compares it with a direct read of the table as that
-- person under her row security, the lane written out by hand and the filter written as plain SQL:
--   ok = rows = distinct = total (= direct rows), the id sets' md5 equal, and for a sorted case the ordered id
--   sequences' md5 equal too (mixed directions, empty values last, text case-blind then as written, id last).
-- Fixtures (rolled back): three Holloway contacts whose names carry % _ [ . * \ (contains must match literally),
-- the custom key referral_source declared by Holloway and admin's Workspace beside Ridgeline's (a contested key),
-- one stray value in an organization that declares none (referral_source is "public": every seat reads it), an internal renewal_risk field withheld from a non-admin
-- seat (the store's level rule raised in the transaction). Oak Street's live choice field preferred_channel is read.
-- Expect every line ok = true, as admin@admin.com and as test@test.com.
-- Run as postgres (Supabase MCP execute_sql); the MCP stops a call at 60 s, so set ap3.user (admin|test) and ap3.part
-- (filters|sorts) below and run the four combinations (the admin-only cases ride admin/filters).
begin;
select set_config('ap3.user', 'admin', true), set_config('ap3.part', 'filters', true);   -- admin|test x filters|sorts
-- ── helpers ───────────────────────────────────────────────────────────────────────────────────────────────
-- walk: a list paged by keyset to the end through platform.entity_list_scoped
create function pg_temp.walk(p_token text, p_scope jsonb, p_filter jsonb, p_sort jsonb, p_size int, p_total boolean default true)
returns jsonb language plpgsql as $f$
declare v_after text; v_page jsonb; v_ids text[] := '{}'; v_n int := 0; v_total jsonb; v_ign jsonb;
begin
  loop
    v_page := platform.entity_list_scoped(p_token, p_scope, coalesce(p_filter, '{}'::jsonb), p_sort => p_sort,
                                          p_page_size => p_size, p_after => v_after, p_with_total => p_total);
    v_n := v_n + 1;
    if v_n = 1 then v_total := v_page -> 'total'; v_ign := v_page -> 'sort_ignored'; end if;
    v_ids := v_ids || array(select r ->> 'id' from jsonb_array_elements(v_page -> 'rows') r);
    v_after := v_page ->> 'next_after';
    exit when v_after is null or v_n > 200;
  end loop;
  return jsonb_build_object('rows', cardinality(v_ids), 'distinct', (select count(distinct x) from unnest(v_ids) x),
    'total', v_total, 'pages', v_n, 'ignored', v_ign,
    'set', (select md5(coalesce(string_agg(x, ',' order by x), '')) from unnest(v_ids) x),
    'seq', md5(array_to_string(v_ids, ',')));
exception when others then
  return jsonb_build_object('err', sqlstate || ' ' || left(sqlerrm, 100));
end $f$;
-- direct: the same list read straight from the table under her row security, the lane written out by hand
-- (mine ∪ member organizations with Shown-to ∪ explicit grants ∪ what she opens by containment elsewhere), the
-- organization filter, live organizations, the token's default list, and the predicate written as plain SQL
create function pg_temp.direct(p_token text, p_org uuid, p_pred text, p_order text default null)
returns jsonb language plpgsql as $f$
declare v_t text; v_u uuid := auth.uid(); v_lane text; v_n int; v_set text; v_seq text;
begin
  v_t := case p_token when 'party' then 'crm.party' when 'project' then 'projects.projects' when 'task' then 'projects.tasks' end;
  v_lane := format($l$p.deleted_at is null and p.organization_id not in (select iam.archived_org_ids())
    and (%2$L::uuid is null or p.organization_id = %2$L::uuid)
    and (p.created_by = %1$L::uuid
         or (p.organization_id in (select om.organization_id from iam.organization_member om where om.user_id = %1$L::uuid)
             and platform.shown_to_lists(p.shown_to, null, p.created_by, p.organization_id, %1$L::uuid, platform.shown_to_context(%3$L)))
         or p.id in (select g.resource_id from iam.permissions g where g.resource_type = %3$L and g.status <> 'rejected'
                       and (g.expires_at is null or g.expires_at > now())
                       and (g.granted_to_user_id = %1$L::uuid or g.granted_to_organization_id in
                             (select om.organization_id from iam.organization_member om where om.user_id = %1$L::uuid)))
         or (not coalesce(p.organization_id in (select om.organization_id from iam.organization_member om where om.user_id = %1$L::uuid), false)
             and not (coalesce(p.published_to_web, false) or coalesce(p.organization_id in (select so.organization_id from iam.system_orgs so where so.global_readable), false))
             and platform.shown_to_lists(p.shown_to, null, p.created_by, p.organization_id, %1$L::uuid, platform.shown_to_context(%3$L))
             and iam.has_access(%3$L, p.id, 'viewer')))$l$, v_u, p_org, p_token)
    || case when p_token = 'party' then ' and p.canonical_id is null and p.record_class::text = ''contact''' else '' end;
  execute format('select count(*), md5(coalesce(string_agg(p.id::text, '','' order by p.id::text), '''')), md5(coalesce(string_agg(p.id::text, '','' order by %s), '''')) from %s p where %s and (%s)',
                 coalesce(p_order, 'p.id'), v_t, v_lane, p_pred) into v_n, v_set, v_seq;
  return jsonb_build_object('rows', v_n, 'set', v_set, 'seq', v_seq);
end $f$;
create temp table _r(k text, door jsonb, direct jsonb, ok boolean) on commit drop;
grant all on _r to authenticated;
grant execute on all functions in schema pg_temp to authenticated;
-- check: one case. Set: rows = distinct = total = direct rows and the id sets match; ordered: the sequences match too
create function pg_temp.chk(p_k text, p_token text, p_org uuid, p_filter jsonb, p_pred text, p_sort jsonb default null,
                            p_order text default null, p_size int default 500, p_total boolean default true)
returns void language plpgsql as $f$
declare v_d jsonb; v_x jsonb;
begin
  v_d := pg_temp.walk(p_token, jsonb_strip_nulls(jsonb_build_object('kind', 'all', 'organization_id', p_org)), p_filter, p_sort, p_size, p_total);
  v_x := pg_temp.direct(p_token, p_org, p_pred, p_order);
  insert into _r values (p_k, v_d, v_x,
    v_d ->> 'err' is null and (v_d ->> 'rows')::int = (v_d ->> 'distinct')::int and (v_d ->> 'rows')::int = (v_x ->> 'rows')::int
    and (not p_total or (v_d ->> 'total')::int = (v_d ->> 'rows')::int) and (p_total or coalesce(v_d ->> 'total', '') = '')
    and v_d ->> 'set' = v_x ->> 'set' and (p_order is null or v_d ->> 'seq' = v_x ->> 'seq'));
end $f$;
grant execute on function pg_temp.chk(text, text, uuid, jsonb, text, jsonb, text, int, boolean) to authenticated;

-- ── fixtures (rolled back) ────────────────────────────────────────────────────────────────────────────────
select set_config('app.actor_system', 'ap3_u4_forcing_test', true);
insert into crm.party(id, party_kind, display_name, first_name, last_name, organization_id, created_by, record_class) values
  ('7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1e01', 'person', 'Rosa Delgado [50%_Club] v1.2*', 'Rosa', 'Delgado',
   '344cfaa8-2b0c-4971-854a-9694614816f2', '87a6e699-3622-4869-8843-d0867456c0dd', 'contact'),
  ('7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1e02', 'person', 'Rosa Delgado 50xxClub v1x2', 'Rosa', 'Delgado',
   '344cfaa8-2b0c-4971-854a-9694614816f2', '87a6e699-3622-4869-8843-d0867456c0dd', 'contact'),
  ('7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1e03', 'person', 'Tomas Reyes C:\Clients\Reyes', 'Tomas', 'Reyes',
   '344cfaa8-2b0c-4971-854a-9694614816f2', '87a6e699-3622-4869-8843-d0867456c0dd', 'contact');
set local role authenticated;
select set_config('request.headers', '{}', true);
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
-- referral_source: Ridgeline already declares it; Holloway and admin's Workspace declare it too (a contested key)
select custom.entity_field_declare('344cfaa8-2b0c-4971-854a-9694614816f2', 'party', '{"key":"referral_source","label":"Referral source","type":"text","sensitivity":"public"}'::jsonb);
select custom.entity_field_declare('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', 'party', '{"key":"referral_source","label":"Referral source","type":"text","sensitivity":"public"}'::jsonb);
select custom.entity_field_declare('344cfaa8-2b0c-4971-854a-9694614816f2', 'party', '{"key":"renewal_risk","label":"Renewal risk","type":"text","sensitivity":"internal"}'::jsonb);
reset role;
update crm.party set custom_fields = coalesce(custom_fields, '{}'::jsonb) || '{"referral_source":"Conference booth","renewal_risk":"High: budget frozen"}'
 where id = '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1e01';
update crm.party set custom_fields = coalesce(custom_fields, '{}'::jsonb) || '{"referral_source":"Partner referral"}'
 where id = '7b1f0c2e-5a41-4c6e-9d0b-3f2a8e6c1e02';
update crm.party set custom_fields = coalesce(custom_fields, '{}'::jsonb) || '{"referral_source":"Conference booth"}'
 where id = (select id from crm.party where organization_id = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f' and deleted_at is null
              and canonical_id is null and record_class::text = 'contact' order by id limit 1);
-- a stray value in an organization that declares no such field (Oak Street): never matches
update crm.party set custom_fields = coalesce(custom_fields, '{}'::jsonb) || '{"referral_source":"Conference booth"}'
 where id = (select id from crm.party where organization_id = '2643e470-b275-47f3-95f3-ae275ad3ca47' and deleted_at is null
              and canonical_id is null and record_class::text = 'contact' order by id limit 1);
-- the internal field is the admin seat's only (the store's level rule, raised in the transaction)
update platform.feature_knob set value = jsonb_set(value, '{read,internal}', '"admin"')
 where feature = 'custom' and key = 'field_sensitivity_levels';

set local role authenticated;
set local statement_timeout = '300s';
do $d$
declare
  v_x jsonb; v_y jsonb;
  u text; h uuid := '344cfaa8-2b0c-4971-854a-9694614816f2'; w uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_ref text := $p$(case when p.organization_id in ('344cfaa8-2b0c-4971-854a-9694614816f2', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', '0fec03d8-afe5-4ea0-bf14-d0ab18e4a536') then p.custom_fields ->> 'referral_source' end)$p$;
begin
  foreach u in array case current_setting('ap3.user') when 'admin' then array['87a6e699-3622-4869-8843-d0867456c0dd']
                                                       else array['4060701e-706a-4c76-b3ca-0bbc69fa5a14'] end loop
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    u := left(u, 4) || ':';
    continue when current_setting('ap3.part') <> 'filters';
    -- G1: text match, neq, negation (platform columns)
    perform pg_temp.chk(u || 'contains', 'party', h, '{"all":[{"column":"display_name","op":"contains","value":"AN"}]}', $p$p.display_name ilike '%an%'$p$);
    perform pg_temp.chk(u || 'text_starts_with', 'party', h, '{"all":[{"column":"display_name","op":"text","match":"starts_with","value":"ro"}]}', $p$lower(p.display_name) like 'ro%'$p$);
    perform pg_temp.chk(u || 'text_ends_with', 'party', h, '{"all":[{"column":"last_name","op":"text","match":"ends_with","value":"ES"}]}', $p$lower(p.last_name) like '%es'$p$);
    perform pg_temp.chk(u || 'text_equals', 'party', h, '{"all":[{"column":"last_name","op":"text","match":"equals","value":"  delgado "}]}', $p$lower(btrim(p.last_name)) = 'delgado'$p$);
    perform pg_temp.chk(u || 'neq', 'party', h, '{"all":[{"column":"last_name","op":"neq","value":"Delgado"}]}', $p$p.last_name is distinct from 'Delgado'$p$);
    perform pg_temp.chk(u || 'ne_alias', 'party', h, '{"all":[{"column":"last_name","op":"ne","value":"Delgado"}]}', $p$p.last_name is distinct from 'Delgado'$p$);
    perform pg_temp.chk(u || 'negated_contains', 'party', h, '{"all":[{"column":"display_name","op":"contains","value":"an","negated":true}]}', $p$not coalesce(p.display_name ilike '%an%', false)$p$);
    perform pg_temp.chk(u || 'negated_eq_keeps_empty', 'party', h, '{"all":[{"column":"headline","op":"eq","value":"Founder","negated":true}]}', $p$not coalesce(p.headline = 'Founder', false)$p$);
    perform pg_temp.chk(u || 'empty', 'party', h, '{"all":[{"column":"headline","op":"empty"}]}', $p$p.headline is null or btrim(p.headline) = ''$p$);
    perform pg_temp.chk(u || 'negated_empty', 'party', h, '{"all":[{"column":"headline","op":"empty","negated":true}]}', $p$not (p.headline is null or btrim(p.headline) = '')$p$);
    perform pg_temp.chk(u || 'null', 'party', h, '{"all":[{"column":"date_of_birth","op":"null"}]}', $p$p.date_of_birth is null$p$);
    perform pg_temp.chk(u || 'in', 'party', h, '{"all":[{"column":"last_name","op":"in","values":["Delgado","Walker","Nobody"]}]}', $p$p.last_name in ('Delgado', 'Walker', 'Nobody')$p$);
    perform pg_temp.chk(u || 'in_empty_none', 'party', h, '{"all":[{"column":"last_name","op":"in","values":[]}]}', $p$false$p$);
    perform pg_temp.chk(u || 'in_empty_negated_all', 'party', h, '{"all":[{"column":"last_name","op":"in","values":[],"negated":true}]}', $p$true$p$);
    -- G2: several predicates on one column, ranges
    perform pg_temp.chk(u || 'one_column_three', 'party', h,
      '{"all":[{"column":"display_name","op":"gte","value":"C"},{"column":"display_name","op":"lt","value":"S"},{"column":"display_name","op":"contains","value":"a"},{"column":"display_name","op":"contains","value":"z","negated":true}]}',
      $p$p.display_name >= 'C' and p.display_name < 'S' and p.display_name ilike '%a%' and not coalesce(p.display_name ilike '%z%', false)$p$);
    perform pg_temp.chk(u || 'range_time', 'party', h, '{"all":[{"column":"created_at","op":"range","gte":"2026-10-06T00:00:00Z","lt":"2026-10-06T18:26:00Z"}]}',
      $p$p.created_at >= '2026-10-06T00:00:00Z' and p.created_at < '2026-10-06T18:26:00Z'$p$);
    -- contains is a literal: % _ [ . * \ never act as patterns
    perform pg_temp.chk(u || 'literal_pct_us', 'party', h, '{"all":[{"column":"display_name","op":"contains","value":"50%_c"}]}', $p$strpos(lower(p.display_name), '50%_c') > 0$p$);
    perform pg_temp.chk(u || 'literal_dot_star', 'party', h, '{"all":[{"column":"display_name","op":"contains","value":"v1.2*"}]}', $p$strpos(lower(p.display_name), 'v1.2*') > 0$p$);
    perform pg_temp.chk(u || 'literal_bracket', 'party', h, '{"all":[{"column":"display_name","op":"contains","value":"[50"}]}', $p$strpos(lower(p.display_name), '[50') > 0$p$);
    perform pg_temp.chk(u || 'literal_backslash', 'party', h, '{"all":[{"column":"display_name","op":"contains","value":"c:\\clients"}]}', $p$strpos(lower(p.display_name), 'c:\clients') > 0$p$);
    perform pg_temp.chk(u || 'literal_underscore', 'party', h, '{"all":[{"column":"display_name","op":"contains","value":"_"}]}', $p$strpos(p.display_name, '_') > 0$p$);
    -- custom keys: bare = each row judged by its own organization's field; namespaced = exactly one; a stray never
    perform pg_temp.chk(u || 'custom_bare_or', 'party', null, '{"all":[{"column":"_custom.referral_source","op":"eq","value":"Conference booth"}]}', v_ref || $p$ = 'Conference booth'$p$);
    perform pg_temp.chk(u || 'custom_namespaced', 'party', null, '{"all":[{"column":"_custom.referral_source@344cfaa8-2b0c-4971-854a-9694614816f2","op":"contains","value":"booth"}]}',
      $p$p.organization_id = '344cfaa8-2b0c-4971-854a-9694614816f2' and p.custom_fields ->> 'referral_source' ilike '%booth%'$p$);
    perform pg_temp.chk(u || 'custom_negated', 'party', h, '{"all":[{"column":"_custom.referral_source","op":"eq","value":"Conference booth","negated":true}]}',
      $p$p.custom_fields ->> 'referral_source' is distinct from 'Conference booth'$p$);
    perform pg_temp.chk(u || 'custom_bare_neq', 'party', null, '{"all":[{"column":"_custom.referral_source","op":"neq","value":"Conference booth"}]}',
      v_ref || $p$ is distinct from 'Conference booth'$p$);
    perform pg_temp.chk(u || 'custom_bare_null', 'party', null, '{"all":[{"column":"_custom.referral_source","op":"null"}]}', v_ref || ' is null');
    perform pg_temp.chk(u || 'custom_empty', 'party', h, '{"all":[{"column":"_custom.referral_source","op":"empty"}]}',
      $p$coalesce(btrim(p.custom_fields ->> 'referral_source'), '') = ''$p$);
    -- tasks and projects in admin's Workspace
    perform pg_temp.chk(u || 'task_neq_status', 'task', w, '{"all":[{"column":"status","op":"neq","value":"done"}]}', $p$p.status is distinct from 'done'$p$);
    perform pg_temp.chk(u || 'task_due_empty', 'task', w, '{"all":[{"column":"due_date","op":"empty"}]}', $p$p.due_date is null$p$);
    perform pg_temp.chk(u || 'task_due_range_not_empty', 'task', w, '{"all":[{"column":"due_date","op":"empty","negated":true},{"column":"due_date","op":"lt","value":"2026-10-15"}]}',
      $p$p.due_date is not null and p.due_date < '2026-10-15'$p$);
    perform pg_temp.chk(u || 'task_priority_in', 'task', w, '{"all":[{"column":"priority","op":"in","values":["high","medium"]}]}', $p$p.priority::text in ('high', 'medium')$p$);
    perform pg_temp.chk(u || 'task_title_not_contains', 'task', w, '{"all":[{"column":"title","op":"contains","value":"review","negated":true},{"column":"assignee_id","op":"empty","negated":true}]}',
      $p$not coalesce(p.title ilike '%review%', false) and p.assignee_id is not null$p$);
    perform pg_temp.chk(u || 'project_contains_neq', 'project', w, '{"all":[{"column":"name","op":"contains","value":"o"},{"column":"status","op":"neq","value":"archived"}]}',
      $p$p.name ilike '%o%' and p.status is distinct from 'archived'$p$);
  end loop;
  foreach u in array case current_setting('ap3.user') when 'admin' then array['87a6e699-3622-4869-8843-d0867456c0dd']
                                                       else array['4060701e-706a-4c76-b3ca-0bbc69fa5a14'] end loop
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    u := left(u, 4) || ':';
    continue when current_setting('ap3.part') <> 'sorts';
    -- G3: several sort keys, mixed directions, empty values last, keyset pages
    perform pg_temp.chk(u || 'sort3_party', 'party', h, null, 'true',
      '[{"column":"last_name","dir":"desc"},{"column":"headline","dir":"asc"},{"column":"created_at","dir":"desc"}]',
      $o$nullif(lower(p.last_name), '') desc nulls last, nullif(p.last_name, '') desc nulls last, nullif(lower(p.headline), '') asc nulls last, nullif(p.headline, '') asc nulls last, p.created_at desc nulls last, p.id$o$, 7);
    perform pg_temp.chk(u || 'sort3_party_no_total', 'party', h, null, 'true',
      '[{"column":"last_name","dir":"desc"},{"column":"headline","dir":"asc"},{"column":"created_at","dir":"desc"}]',
      $o$nullif(lower(p.last_name), '') desc nulls last, nullif(p.last_name, '') desc nulls last, nullif(lower(p.headline), '') asc nulls last, nullif(p.headline, '') asc nulls last, p.created_at desc nulls last, p.id$o$, 7, false);
    perform pg_temp.chk(u || 'sort3_task', 'task', w, '{"all":[{"column":"title","op":"contains","value":"e"}]}', $p$p.title ilike '%e%'$p$,
      '[{"column":"due_date","dir":"asc"},{"column":"priority","dir":"desc"},{"column":"title","dir":"asc"}]',
      $o$p.due_date asc nulls last, p.priority desc nulls last, nullif(lower(p.title), '') asc nulls last, nullif(p.title, '') asc nulls last, p.id$o$, 13);
    perform pg_temp.chk(u || 'sort_custom_contested', 'party', null, null, 'true',
      '[{"column":"_custom.referral_source","dir":"desc"},{"column":"display_name","dir":"asc"}]',
      format($o$nullif(lower(%1$s), '') desc nulls last, nullif(%1$s, '') desc nulls last, nullif(lower(p.display_name), '') asc nulls last, nullif(p.display_name, '') asc nulls last, p.id$o$, v_ref), 41);
  end loop;
  -- a choice is filtered by the word a person sees (Oak Street's preferred_channel stores its keys)
  if current_setting('ap3.part') <> 'filters' or current_setting('ap3.user') <> 'admin' then
    return;
  end if;
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  -- AP-4's finding: the Table API's object form takes contains (platform.drill_rows), matched literally
  begin
    v_x := platform.drill_rows(null, '{"kind":"entity","token":"party","api":true}',
                               '{"scope":"all","limit":500,"where":{"display_name":{"contains":"50%_C"}}}');
    v_x := jsonb_build_object('rows', jsonb_array_length(v_x -> 'rows'), 'distinct', jsonb_array_length(v_x -> 'rows'), 'total', v_x -> 'total',
      'set', (select md5(coalesce(string_agg(r ->> 'id', ',' order by r ->> 'id'), '')) from jsonb_array_elements(v_x -> 'rows') r));
  exception when others then
    v_x := jsonb_build_object('err', sqlstate || ' ' || left(sqlerrm, 100));
  end;
  v_y := pg_temp.direct('party', null, $p$strpos(lower(p.display_name), '50%_c') > 0$p$);
  insert into _r values ('87a6:drill_rows_object_contains', v_x, v_y, v_x ->> 'err' is null and v_x ->> 'set' = v_y ->> 'set'
                         and (v_x ->> 'rows')::int = (v_y ->> 'rows')::int and (v_x ->> 'total')::int = (v_y ->> 'rows')::int);
  perform pg_temp.chk('87a6:choice_word', 'party', '2643e470-b275-47f3-95f3-ae275ad3ca47',
    '{"all":[{"column":"_custom.preferred_channel","op":"in","values":["Email","Text message"]}]}', $p$p.custom_fields ->> 'preferred_channel' in ('email', 'text_message')$p$);
  -- a masked field filters as unknown: test@test.com (an editor of the row, not its organization's admin) cannot read
  -- the internal renewal_risk, so a positive test matches nothing and a negated one keeps every row
  perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  perform pg_temp.chk('4060:masked_positive_none', 'party', h, '{"all":[{"column":"_custom.renewal_risk","op":"contains","value":"High"}]}', 'false');
  perform pg_temp.chk('4060:masked_negated_all', 'party', h, '{"all":[{"column":"_custom.renewal_risk","op":"contains","value":"High","negated":true}]}', 'true');
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  perform pg_temp.chk('87a6:unmasked_positive', 'party', h, '{"all":[{"column":"_custom.renewal_risk","op":"contains","value":"High"}]}', $p$p.custom_fields ->> 'renewal_risk' ilike '%high%'$p$);
end $d$;
reset role;
select count(*) as cases, count(*) filter (where ok) as ok,
       jsonb_agg(jsonb_build_object('k', k, 'door', door - 'set' - 'seq', 'direct', direct - 'set' - 'seq') order by k) filter (where not ok) as failing,
       string_agg(k || '=' || coalesce(door ->> 'rows', door ->> 'err'), ' ' order by k) as rows_per_case
  from _r;
rollback;
