-- additive: yes
-- based-on: custom.where_tables_live(uuid[]) 830b4f6fe164e46d4d324358fe506422665dfeee9c217a6bef5ec32d3fe7bdf6
-- based-on: custom._older_table_copy_refusal(uuid) 1159dea4c04c42a07c5f6c02b17f0e69ee6568bef757f275c13e4f5bf6f0fa93
--
-- chair-step: it REPLACES two live function bodies with identical signatures, volatility,
--   security and grants — `custom.where_tables_live(uuid[])` and
--   `custom._older_table_copy_refusal(uuid)` — and rewrites the `reason` / `anonymous_purpose`
--   of their two `platform.client_callable_door` rows so the register says what the bodies now
--   do. Nothing is dropped, granted or revoked; no data row is touched. The inverse is
--   `migrations/inverse/suitehealth3_where_a_table_lives_is_told_only_to_who_may_open_it_down.sql`.
--
-- LANE SUITE-HEALTH-3 (chair rulings 2 and 3, 2026-09-25). `pnpm check:store-doors-decide`
-- census 5 named both: declared client doors taking an id whose bodies never reach the one ladder.
--
-- 1. custom.where_tables_live — THE HONEST NOT-FOUND WORD FOR WHAT YOU MAY NOT OPEN. It used to
--    answer `older` for any live older table id to any signed-in caller: measured on the dev
--    clone, a stranger (a signed-in account in no organization) got `older` for all 95 older
--    tables — an existence oracle, since an id nobody minted answers `record`. Now an `older`
--    answer is given only to a person who may open that table: the older store's own read rule
--    (workbench.udt_datasets' std_select + platform_admin_read, asked for this person — measured
--    identical to RLS for admin@admin.com, test@test.com and a stranger over every older table
--    on the clone) or the one ladder on its record-store copy (custom.has_visibility). Everyone
--    else gets `record` with the `record` sentence — byte-identical to an id that was never
--    minted, so the record store's own doors then answer "not found" exactly as for that id.
--    A caller with no person (the service lane, the store owner) is answered as before.
--
-- 2. custom._older_table_copy_refusal — THE NAME ONLY TO WHO MAY OPEN THE COPY. It named the
--    table to every caller with no auth.uid() — so a visitor whose public form reached the copy
--    fence (through a SECURITY DEFINER door, as the register row says) was told the table's name,
--    the opposite of its own register row ("never its name"); measured: 80 of 80 refusals named
--    on the clone. Now the name is given exactly when custom.assert_client_may_open (the same
--    may-open ladder every door asks) admits the caller to the copy, and the copy exists; otherwise the refusal says
--    "this table". The write is refused either way — only the sentence changes. The anonymous
--    declaration stays: the fence still refuses a visitor's write, with a sentence that names
--    nothing.

set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION custom.where_tables_live(p_table_ids uuid[])
 RETURNS TABLE(table_id uuid, lives_in text, why text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_me     uuid  := auth.uid();
begin
  if v_me is null and v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
    raise exception 'Sign in to ask where a table lives.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_table_ids), 0) > 1000 then
    raise exception 'Ask about at most 1000 tables at once (% were asked).', cardinality(p_table_ids) using errcode = '22023';
  end if;
  return query
    select i.id,
           h.lives_in,
           case h.lives_in
             when 'older' then 'It is an older table, and the older table is the one in use: its copy in the new system (if it has one) is read-only until an owner switches Data tables on the organization''s settings page.'
             else 'It lives in the new system (the record store); the store''s own doors decide whether you may open it.'
           end
      from (select distinct u.id from unnest(coalesce(p_table_ids, '{}'::uuid[])) as u(id) where u.id is not null) i
      cross join lateral (select platform.table_lives_in(i.id) as lives_in) l
      -- WHO MAY BE TOLD `older` (SUITE-HEALTH-3). A person is told an older table's home only
      -- when she may open it: the older store's own read rule for her, or the one ladder on its
      -- record-store copy. Anyone else hears `record` — the word an id nobody minted answers —
      -- and the store's doors then say "not found" for it exactly as for that id. No person
      -- (the service lane, the store owner) is answered as before.
      cross join lateral (
        select case
                 when l.lives_in is distinct from 'older' or v_me is null then l.lives_in
                 when exists (select 1 from workbench.udt_datasets d
                               where d.id = i.id
                                 and (d.created_by = v_me
                                      or d.visibility = 'public'::platform.visibility
                                      or iam.has_access_for(v_me, 'dataset', d.id, 'viewer'::public.permission_level)
                                      or public.is_platform_admin()))
                   then l.lives_in
                 when custom.has_visibility(v_me, 'record', i.id, 'viewer'::public.permission_level) then l.lives_in
                 else 'record'
               end as lives_in) h;
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
  v_org  uuid;
begin
  if p_table_id is null or platform.table_lives_in(p_table_id) is distinct from 'older' then
    return null;
  end if;
  select d.organization_id, coalesce(nullif(d.table_name, ''), 'this table')
    into v_org, v_name
    from workbench.udt_datasets d where d.id = p_table_id and d.deleted_at is null;
  if not found then
    return null;
  end if;
  -- THE NAME ONLY TO WHO MAY OPEN THE COPY (SUITE-HEALTH-3). The same may-open ladder every
  -- door asks, about the copy by its id. A caller it refuses — a visitor whose form reached this
  -- fence, a person the copy is not shared with — is still refused the write; the sentence just
  -- names nothing. A copy that is not in the record store at all cannot be opened by anyone, so
  -- it is not named either (the ladder lets an absent id through for the calling door to say
  -- "not found"; here there is no door after it to say so).
  if exists (select 1 from custom.record r where r.id = p_table_id) then
    begin
      perform custom.assert_client_may_open(v_org, p_table_id, 'custom._older_table_copy_refusal', 'viewer', 'table');
    exception when insufficient_privilege or null_value_not_allowed then
      v_name := 'this table';
    end;
  else
    v_name := 'this table';
  end if;
  return format('This is the new system''s copy of %s; the older table is still the one in use until an owner switches Data tables on the organization''s settings page. Edit it at /data/%s.',
                v_name, p_table_id);
end;
$function$;

update platform.client_callable_door
   set reason = 'Every client (the app, the extension, the server under a person) asks here which store a table id is read and written in, instead of inferring it from whether the record store holds a same-id copy. It answers only the store word and a fixed sentence per id — never a name, organization, row or count. An `older` answer is given only to a person who may open that older table (the older store''s own read rule for her) or its record-store copy (custom.has_visibility); anyone else hears `record` with the `record` sentence, byte-identical to an id nobody minted, and the store''s doors then say not found. No person (the service lane) is answered by the switch alone.',
       declared_by = 'migrations/campaign/wherelives_the_older_table_is_the_writer_until_the_switch.sql (lane WHERE-LIVES-SWITCH); reach re-decided by migrations/campaign/suitehealth3_where_a_table_lives_is_told_only_to_who_may_open_it.sql (lane SUITE-HEALTH-3)'
 where schema_name = 'custom' and function_name = 'where_tables_live' and identity_args = 'p_table_ids uuid[]';

update platform.client_callable_door
   set reason = 'The copy fence''s question, asked by custom._context_copy_fence() as the writer. p_table_id is only looked up; NULL answers NULL. It answers NULL or a refusal sentence; the sentence names the table only when custom.assert_client_may_open admits the caller to the copy (the one may-open ladder), else says "this table".',
       anonymous_purpose = 'The copy fence runs as whichever role writes custom.record, including a public form submitted by a visitor who is not signed in; the fence must still refuse that write with a sentence. The may-open ladder never admits a signed-out caller, so a visitor learns only that an id is a copy, never its name.',
       declared_by = 'migrations/campaign/wherelives_the_older_table_is_the_writer_until_the_switch.sql (lane WHERE-LIVES-SWITCH); naming re-decided by migrations/campaign/suitehealth3_where_a_table_lives_is_told_only_to_who_may_open_it.sql (lane SUITE-HEALTH-3)'
 where schema_name = 'custom' and function_name = '_older_table_copy_refusal' and identity_args = 'p_table_id uuid';
