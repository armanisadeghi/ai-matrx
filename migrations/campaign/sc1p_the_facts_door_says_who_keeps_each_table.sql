-- chair-step: it REPLACES the view custom.table (three columns appended at the end, nothing else changed) and DROPS AND RE-MAKES custom.table_facts(uuid) with eight result columns more, then GRANTs EXECUTE on it to authenticated again. `create or replace view`, a DROP and a GRANT are each refused by the additive allow-list by name, so this comes through the chair. Result columns cannot change in place; the drop and the re-make are one transaction, so no caller ever sees the door absent. The door's platform.client_callable_door row is unchanged (same identity, `p_organization_id uuid`). Nothing is written to any table. Runs AFTER sc1p_each_table_says_who_keeps_it.sql (it reads custom.table_placement).
-- lane: SC-1 PLACEMENT (who keeps each table, and whether the context picker offers it)
-- lock: custom
-- based-on: custom.table_facts(uuid) 533648f50cc33733dc2a175c4a1f2534e3eadfb6cc2093ab491c4d2a8c07841a
--
-- THE USE CASE. Titanium's hub, once its scopes are copied (SC-2), must list its own
-- spreadsheets and NOT Clients, Departments and Team Members — and one "Show everything"
-- must list those three under the context system, each with a sentence saying who keeps it
-- and a link to where it is used. The hub already asks this door for every Table's two lane
-- facts, so the placement facts ride on the same call (one round trip, one client method).
--
-- WHO MAY CALL IT is unchanged: custom.assert_client_may_reach first, then only the Tables in
-- custom.query_visible_ids(org, custom.table_kernel_id()). A column that USES a choices table is
-- named only when the caller can open the table that column belongs to.
--
-- The inverse is `migrations/inverse/sc1p_the_facts_door_says_who_keeps_each_table_down.sql`.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ── 1. THE VIEW: three columns more, at the end ────────────────────────────────────────
-- `create or replace view` may only APPEND columns, which is all this does; every existing
-- column keeps its name, position and meaning.
create or replace view custom.table
with (security_invoker = true) as
 SELECT id,
    organization_id,
    COALESCE(data ->> 'slug'::text, lower(data ->> 'name'::text)) AS slug,
    data ->> 'name'::text AS name,
    COALESCE(data ->> 'label_singular'::text, data ->> 'name'::text) AS label_singular,
    COALESCE(data ->> 'label_plural'::text, (data ->> 'name'::text) || 's'::text) AS label_plural,
    data ->> 'icon'::text AS icon,
    data ->> 'color'::text AS color,
    COALESCE(data ->> 'type'::text, 'entity'::text) AS type,
    COALESCE(data ->> 'type'::text, 'entity'::text) = 'detail'::text AS detail,
    data ->> 'parent_token'::text AS parent_token,
    COALESCE((data ->> 'agent_writable'::text)::boolean, true) AS agent_writable,
    COALESCE(data ->> 'display'::text, 'list'::text) AS display,
    COALESCE((data ->> 'ordered'::text)::boolean, false) AS ordered,
    COALESCE(data ->> 'weight'::text, 'light'::text) AS weight,
    COALESCE((data ->> 'retention_days'::text)::integer, 30) AS retention_days,
    data ->> 'title_field'::text AS title_field,
    COALESCE(data -> 'fields'::text, '[]'::jsonb) AS fields,
    COALESCE(data -> 'default_sort'::text, '[]'::jsonb) AS default_sort,
    COALESCE(data ->> 'row_order'::text, 'sorted'::text) AS row_order,
    custom.containment_parent(data) AS home_id,
    data_class = 'kernel'::text AS is_kernel,
    created_by,
    updated_by,
    created_at,
    updated_at,
    version,
    metadata,
    visibility,
    data,
    (custom.table_placement(organization_id, id, data, data_class = 'kernel'::text) ->> 'kept_by_the_app'::text)::boolean AS kept_by_the_app,
    custom.table_placement(organization_id, id, data, data_class = 'kernel'::text) ->> 'kept_for'::text AS kept_for,
    (custom.table_placement(organization_id, id, data, data_class = 'kernel'::text) ->> 'offered_as_context'::text)::boolean AS offered_as_context
   FROM custom.record r
  WHERE table_id = custom.table_kernel_id() AND deleted_at IS NULL;

comment on column custom.table.kept_by_the_app is 'SC-1: the app or one of its features keeps this Table (stored, or read off the older facts) — custom.table_placement.';
comment on column custom.table.kept_for is 'SC-1: which feature keeps it (context, choices, checklists, bookings, workflow, app, store, …); null when the organization keeps it.';
comment on column custom.table.offered_as_context is 'SC-1: whether the context picker offers this Table.';

-- ── 2. THE FACTS DOOR: the same three facts it answered, and who keeps each table ─────────
-- A function's result columns cannot change in place, so it is dropped and made again in
-- this one transaction: no caller can see it absent. Its platform.client_callable_door row
-- (identity `p_organization_id uuid`) is unchanged and stays; the grant is made again below.
drop function custom.table_facts(uuid);

create function custom.table_facts(p_organization_id uuid)
returns table(table_id uuid, visibility text, mine boolean,
              kept_by_the_app boolean, kept_for text, offered_as_context boolean,
              keeper_group text, keeper_says text,
              used_in_kind text, used_in_id uuid, used_in_table_id uuid)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_facts');
  return query
    with t as (
      select r.id, r.visibility, r.created_by, r.data,
             custom.table_placement(r.organization_id, r.id, r.data, r.data_class = 'kernel') as p
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.table_kernel_id()
         and r.deleted_at is null
         and r.id in (select v from custom.query_visible_ids(p_organization_id,
                                                             custom.table_kernel_id()) v)
    ),
    -- WHICH COLUMN USES EACH CHOICES TABLE: the list Field whose config names it. The first
    -- one made, when several share it.
    uses as (
      select distinct on (nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid)
             nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid as options_table_id,
             coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key') as column_label,
             nullif(f.data ->> 'entity_definition_id', '')::uuid as of_table
        from custom.record f
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and f.data ->> 'type' = 'list'
         and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
       order by nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid, f.created_at
    )
    select t.id,
           t.visibility::text,
           (v_me is not null and t.created_by = v_me),
           (t.p ->> 'kept_by_the_app')::boolean,
           t.p ->> 'kept_for',
           (t.p ->> 'offered_as_context')::boolean,
           s.keeper_group,
           s.keeper_says,
           case when not (t.p ->> 'kept_by_the_app')::boolean then null else coalesce(s.used_in_kind, 'table') end,
           case when not (t.p ->> 'kept_by_the_app')::boolean then null else coalesce(s.used_in_id, t.id) end,
           case when not (t.p ->> 'kept_by_the_app')::boolean then null
                else coalesce(s.used_in_table_id, case when coalesce(s.used_in_kind, 'table') = 'table' then coalesce(s.used_in_id, t.id) end) end
      from t
      left join lateral (
        select t.p ->> 'kept_for' as word,
               case t.p ->> 'kept_for'
                 when 'context'  then nullif(t.data -> 'scope_binding' ->> 'scope_id', '')
                 when 'workflow' then nullif(t.data ->> 'parent_id', '')
                 when 'app'      then substring(coalesce(t.data ->> 'slug', '') from '^records_ui_([a-z]+)')
               end as ref
      ) kw on true
      left join uses u on u.options_table_id = t.id
      left join t ut on ut.id = u.of_table                     -- only a table the caller can open is named
      left join t wt on kw.word = 'workflow' and wt.id::text = kw.ref
      left join context.scopes sc on kw.word = 'context' and sc.id::text = kw.ref
                                  and sc.organization_id = p_organization_id and sc.deleted_at is null
      left join lateral (
        select
          case
            when not (t.p ->> 'kept_by_the_app')::boolean then null
            when kw.word = 'choices' then 'The choices behind your columns'
            when kw.word = 'context' then 'The context system'
            when kw.word = 'checklists' then 'Checklists'
            when kw.word = 'bookings' then 'Bookings'
            when kw.word = 'workflow' then 'Workflows'
            when kw.word = 'store' then 'The store itself'
            when kw.word = 'app' then 'The app'
            else initcap(replace(kw.word, '_', ' '))
          end as keeper_group,
          case
            when not (t.p ->> 'kept_by_the_app')::boolean then null
            when kw.word = 'choices' and u.options_table_id is not null and ut.id is not null
              then format('Kept by the %s column of %s: it holds that column''s choices and opens from there.',
                          u.column_label, coalesce(nullif(ut.data ->> 'name', ''), 'a table'))
            when kw.word = 'choices' and u.options_table_id is not null
              then format('Kept by the %s column of a table you cannot open: it holds that column''s choices.', u.column_label)
            when kw.word = 'choices'
              then 'Kept for a column''s choices. No column uses it now, so only its own page opens it.'
            when kw.word = 'context' and sc.id is not null
              then format('Kept by the context system: it belongs to %s and opens from there.', sc.name)
            when kw.word = 'context' and coalesce((t.p ->> 'offered_as_context')::boolean, false)
              then format('Kept by the context system: each %s in it is a context you can pick for an agent, and opens on its own page.',
                          lower(coalesce(nullif(t.data ->> 'label_singular', ''), 'record')))
            when kw.word = 'context'
              then 'Kept by the context system.'
            when kw.word = 'checklists'
              then 'Kept by checklists: the steps of every checklist run in this organization.'
            when kw.word = 'bookings'
              then format('Kept by bookings: the times people are holding on %s.',
                          coalesce(nullif(regexp_replace(coalesce(t.data ->> 'name', ''), '^Slots for ', ''), ''), 'a booking page'))
            when kw.word = 'workflow' and wt.id is not null
              then format('Kept by the workflow of %s: the states its records move through.', coalesce(nullif(wt.data ->> 'name', ''), 'a table'))
            when kw.word = 'workflow'
              then 'Kept by a table''s workflow: the states its records move through.'
            when kw.word = 'store'
              then 'Part of the store itself: every table is built on it.'
            when kw.word = 'app' and kw.ref is not null
              then 'Kept by the app: ' || case kw.ref
                     when 'view' then 'the saved views of the tables here.'
                     when 'comment' then 'the comments people leave on records.'
                     when 'form' then 'the forms made on the tables here.'
                     when 'dashboard' then 'the dashboards made on the tables here.'
                     when 'action' then 'the action inbox.'
                     when 'checklist' then 'the checklist runs.'
                     when 'slots' then 'the times people are holding on a booking page.'
                     when 'demo' then 'a demonstration of the app''s screens.'
                     when 'shapeproof' then 'a demonstration of the app''s screens.'
                     else 'its own bookkeeping.' end
            when kw.word = 'app' then 'Kept by the app.'
            else format('Kept by %s.', replace(kw.word, '_', ' '))
          end as keeper_says,
          case
            when kw.word = 'context' and sc.id is not null then 'scope'
            when kw.word = 'choices' and ut.id is not null then 'table'
            when kw.word = 'workflow' and wt.id is not null then 'table'
          end as used_in_kind,
          case
            when kw.word = 'context' and sc.id is not null then sc.id
            when kw.word = 'choices' and ut.id is not null then ut.id
            when kw.word = 'workflow' and wt.id is not null then wt.id
          end as used_in_id,
          case
            when kw.word = 'choices' and ut.id is not null then ut.id
            when kw.word = 'workflow' and wt.id is not null then wt.id
          end as used_in_table_id
      ) s on true;
end;
$fn$;

comment on function custom.table_facts(uuid) is
  'Per Table the caller can already open: who can see it (visibility), whether the CALLER made it '
  '(mine), and — SC-1 PLACEMENT — whether the app keeps it (kept_by_the_app) and for which feature (kept_for), whether '
  'the context picker offers it, the plain sentence that says who keeps it (keeper_says, grouped by '
  'keeper_group) and where it is used (used_in_kind table|scope + used_in_id, used_in_table_id). '
  'A table the organization keeps answers null for the last five.';

grant execute on function custom.table_facts(uuid) to authenticated;
