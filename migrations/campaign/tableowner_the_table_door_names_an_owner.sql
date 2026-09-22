-- TABLE-OWNER — A TABLE IS NEVER MINTED WITH NOBODY HOLDING IT.
--
-- WHAT WAS ACTUALLY WRONG, measured on the main database 2026-09-19 rather than inferred.
-- The SHARE lane left this behind as "`custom.table_declare` does not stamp `created_by`".
-- It does. `platform._stamp_actor` is a BEFORE INSERT ON custom.record row trigger and it
-- has been there since the store was provisioned; a real call proves it, in a rolled-back
-- transaction as `authenticated` carrying admin@admin.com's JWT:
--
--     select custom.table_declare('884d1ce8-…', <a live spec>);
--     -> 7d2d0e8e-ce56-4303-b0bc-167a574de156  created_by 87a6e699-3622-4869-8843-d0867456c0dd
--
-- So the door is not the hole. THE HOLE IS THE OTHER SIDE OF THE SAME COLUMN: `_stamp_actor`
-- stamps `coalesce(created_by, app.user_id, auth.uid())`, and when a Table is written with no
-- acting identity at all — a migration, a seed, any server lane holding the service role and
-- no claims — it stamps NOTHING, silently, and the row is born with no Owner. Nothing refuses
-- it, nothing says it happened, and the Table is then unreachable by the Owner rung of VIS-17's
-- one ladder: `public.may_manage_sharing` admits the Owner (`created_by`) or `admin` on the
-- thing, and a Table with neither cannot be shared, re-levelled or revoked by anybody at all.
--
-- THE CLASS FIX, and it sits at the door for every door: when the acting identity is unknown,
-- the ORGANIZATION'S OWNER holds the Table. That is not a guess about who typed it — it is the
-- honest answer to "who holds this", the same answer the organization already gives for
-- everything else nobody claimed, and it is the answer the share dialog can act on. It is a
-- row trigger on `custom.record` rather than a line inside `custom.table_declare`, because
-- `table_declare` is not the only door: `custom._options_table_for` mints Tables too, the
-- agent tool's `table_propose` goes through `table_declare`, and a future door would have to
-- remember. One trigger, every door, in the same transaction as the INSERT.
--
-- It fires ONLY when `created_by` is still null after `platform._stamp_actor` has run (name
-- order: `_stamp_actor` < `zz0_table_owner`), and only for `data_class = 'table'`. A Table
-- created by a person is untouched. An organization with no members at all — `Matrx System`,
-- which holds the nine platform seed Tables — has no owner to name, so the row stays ownerless
-- and that is correct rather than papered over: there is no person there to hold anything.
--
-- THE BACKFILL, run below and reported by the DO block: the nine ownerless Tables that exist
-- today carry ZERO rows in `history.row_versions` (the six oldest) or one row whose `actor_id`
-- is null and whose `actor_tier` is `code` (the three from 2026-09-18 19:45). History names no
-- author for any of them, and their organization `39c38960-d30c-4840-b0c1-c9960de95582`
-- (`Matrx System`) has no members, so neither source can resolve one. They are named in the
-- notice rather than given a fabricated Owner.

create or replace function custom._table_owner_stamp()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  -- Only reached with created_by still null (the trigger's WHEN clause says so).
  select om.user_id
    into new.created_by
    from iam.organization_member om
   where om.organization_id = new.organization_id
     and om.role = 'owner'
   order by om.joined_at asc nulls last, om.user_id asc
   limit 1;
  return new;
end
$fn$;

comment on function custom._table_owner_stamp() is
  'TABLE-OWNER: a Table written with no acting identity is held by the organization''s owner, '
  'so the Owner rung of the one ladder is never empty. Fires only when platform._stamp_actor '
  'found nobody. An organization with no members leaves the row ownerless, which is the truth.';

create or replace trigger zz0_table_owner
  before insert on custom.record
  for each row
  when (new.data_class = 'table' and new.created_by is null)
  execute function custom._table_owner_stamp();

-- The backfill, and the census it prints. `history.row_versions` first, because the first
-- version's author is the closest thing to a creator the database still holds; the
-- organization's owner second, which is the same answer the trigger now gives at the door.
do $do$
declare
  v_fixed   int := 0;
  v_left    int;
  v_names   text;
begin
  with ownerless as (
    select r.id, r.organization_id from custom.record r
     where r.data_class = 'table' and r.created_by is null
  ), resolved as (
    select o.id,
           coalesce(
             (select h.actor_id from history.row_versions h
               where h.row_id = o.id and h.actor_id is not null
               order by h.version asc, h.occurred_at asc limit 1),
             (select om.user_id from iam.organization_member om
               where om.organization_id = o.organization_id and om.role = 'owner'
               order by om.joined_at asc nulls last, om.user_id asc limit 1)
           ) as owner_id
      from ownerless o
  )
  update custom.record r
     set created_by = s.owner_id
    from resolved s
   where r.id = s.id and s.owner_id is not null and r.created_by is null;
  get diagnostics v_fixed = row_count;

  select count(*), coalesce(string_agg(r.id::text || ' (' || coalesce(r.data ->> 'name', '?') || ')', ', ' order by r.id), '')
    into v_left, v_names
    from custom.record r
   where r.data_class = 'table' and r.created_by is null;

  raise notice 'TABLE-OWNER backfill: % Table(s) given an Owner; % left unresolved.', v_fixed, v_left;
  if v_left > 0 then
    raise notice 'TABLE-OWNER unresolved (no author in history, no owner in their organization): %', v_names;
  end if;
end
$do$;
