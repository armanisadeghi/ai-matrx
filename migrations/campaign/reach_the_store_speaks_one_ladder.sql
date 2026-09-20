-- REACH — THE STORE SPEAKS ONE LADDER, AND A READ DOOR CAN SAY SO.
--
-- WHAT THIS CLOSES, measured live on the main database on 2026-09-19: of the 263
-- functions in schema `custom`, a signed-in person could execute 28. Every
-- migration verb, every query verb beyond a plain list, homes, relations,
-- reparent, the as-of reads, the aggregates, import and export were reachable
-- only as the role that owns the store — so the app, which talks to the database
-- directly with supabase-js and never through the Python server, could not call
-- any of them.
--
-- This file is the first of the three that fix it, and it is the part that has
-- nothing to do with grants: it makes the ONE access ladder able to answer for a
-- READ, and it puts the two objects that still judged access with a ladder of
-- their own onto that one ladder.
--
--   1. `custom.assert_client_may_open` — the read twin of
--      `custom.assert_client_may_change`. Identical ladder, identical order (the
--      organization wall first, then the row through `custom.has_visibility`);
--      only the sentence differs, because "you may not WRITE to this record" is
--      the wrong thing to tell somebody who asked to READ one. A door that had
--      to choose between the wrong sentence and no check at all is a door that
--      ends up with no check.
--
--   2. `custom.query_visible_ids` — the id set every query verb, every export and
--      every aggregate joins against. It asked `custom.query_access_ids`, whose
--      member arm answers NULL, meaning "this member may see the whole
--      organization". That is a second ladder: `custom.read_record` refuses a
--      record marked `visibility='personal'` that this very list hands to the
--      same person through a query. It now asks `custom.has_visibility` per row —
--      the one function, at the level the caller asked for — so a query, an
--      export, an aggregate and a plain read all answer the same question.
--      Organization members keep their reads: arm 2 of the one function resolves
--      `custom/member_default_level`, which is `viewer` on this database.
--
--   3. `custom._field_write_door` — the field-level masking trigger, the one
--      object `custom.doors_not_on_one_ladder()` excused by name. It asked
--      `iam.effective_level`; it now asks `custom.effective_level`, which is that
--      same call plus the store's own arms. The INSERT arm above it is untouched:
--      a creator writing their own first values never reaches this line, which is
--      what keeps a brand-new row (whose level the ladder cannot yet resolve,
--      because the row does not exist) writable by its author.
--      With it routed, the named exception comes OUT of the census — the guard
--      `pnpm check:store-doors-decide` now has nothing excused at all.
--
-- ADDITIVE: it creates one function and replaces three. It grants nothing,
-- revokes nothing, drops nothing and changes no knob.
--
-- THE INVERSE: migrations/inverse/reach_the_store_speaks_one_ladder_down.sql.

-- based-on: custom.query_visible_ids(uuid, uuid, text) c387de47af0dde6adaf555fed0383bebc01b77cc1eca11dbb79f633d0bbeac44
-- based-on: custom._field_write_door() 0e8bdf36c76466f8598e9eaa7c4d8ade7abb01dbf95100a9214bd39d56f802bd
-- based-on: custom.doors_not_on_one_ladder() b7c59354b139677996aa61c824b059b3b69fd3715e9a25f6fcc69c9d4815b416

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── 1. the read twin of the one ladder ───────────────────────────────────────
create or replace function custom.assert_client_may_open(
  p_organization_id uuid,
  p_subject_id      uuid,
  p_door            text,
  p_required        public.permission_level default 'viewer'::public.permission_level,
  p_subject_word    text default 'record')
returns void
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_me          uuid;
  v_subject_org uuid;
begin
  -- ONE order, always, and it is `custom.assert_client_may_change`'s order: the
  -- organization wall first, then the row. Reversing it would tell somebody in the
  -- wrong organization that they may not open a record, when what is true is that
  -- they are not in that organization at all.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- Way through 1: the role that owns the store (every campaign and server lane).
  if custom.query_is_store_owner() then
    return;
  end if;

  if p_subject_id is null then
    return;
  end if;

  -- Way through 2: no signed-in person at all — the anonymous doors, which have
  -- already decided the request against the form's own token.
  v_me := custom.query_principal();
  if v_me is null then
    return;
  end if;

  -- Way through 3: a subject that does not live in this organization, or is not
  -- there at all. The door raises its own 02000 a line later, and it must raise the
  -- SAME thing for a foreign id and an invented one.
  select r.organization_id into v_subject_org
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_subject_id;
  if v_subject_org is null then
    return;
  end if;

  -- THE ONE LADDER. The same call, at the same threshold vocabulary, as every
  -- other door in this store.
  if custom.has_visibility(v_me, 'record', p_subject_id, p_required) then
    return;
  end if;

  raise exception 'You do not have access to this %, so % has nothing to show you.',
    coalesce(nullif(btrim(p_subject_word), ''), 'record'),
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = format(
            'DOOR-1 decides reading and writing with the SAME question: a %s you may not open is a %s you may not change. This needs the %s level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization.',
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            p_required);
end;
$function$;

-- ── 2. the id set every query verb joins against, on the one ladder ──────────
create or replace function custom.query_visible_ids(
  p_organization_id uuid,
  p_table_id        uuid default null::uuid,
  p_required        text default 'viewer'::text)
returns setof uuid
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_user uuid := custom.query_principal();
begin
  -- The organization wall, before any row is fetched, because this is now a door a
  -- signed-in person may execute directly.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_visible_ids');

  return query
    select r.id
      from custom.record r
     where r.organization_id = p_organization_id
       and (p_table_id is null or r.table_id = p_table_id)
       and r.deleted_at is null
       -- DOOR-17: a quarantined submission is invisible to every read until a Rule clears it.
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       -- THE ONE LADDER, per row. `custom.has_visibility` is what `custom.read_record`
       -- asks; asking anything else here is what let the same person be refused a
       -- record by the read door and handed it by a query in the same breath. A
       -- connection with no principal at all is the campaign's own maintenance and is
       -- judged by the role instead, exactly as `custom.query_access_ids` judged it.
       and ((v_user is null and custom.query_is_store_owner())
            or custom.has_visibility(v_user, 'record', r.id, p_required::public.permission_level));
end;
$function$;

-- ── 3. the field-masking trigger, off its own ladder ─────────────────────────
create or replace function custom._field_write_door()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  v_me    uuid := auth.uid();
  v_level public.permission_level;
  v_key   text;
  v_field custom.record;
  v_old   jsonb := coalesce(case when tg_op = 'UPDATE' then old.data end, '{}'::jsonb);
begin
  -- WHO THIS SKIPS, AND WHY IT IS NOT THE ROLE. Every write door into this store is
  -- SECURITY DEFINER and every server lane runs as the role that OWNS custom.record, so a
  -- role test here would skip the only write path that exists and DOOR-3 would be a law
  -- nothing ever enforced. What matters is whether a PERSON is being acted for: when the
  -- request carries one, that person's field-level security binds the write, whichever
  -- door and whichever role it arrived through. A write carrying no person at all is the
  -- store's own housekeeping and has no field-level answer to give.
  if v_me is null then
    return new;
  end if;
  if new.table_id is null or new.table_id = custom.field_kernel_id() then
    return new;
  end if;

  -- CREATING is not editing somebody else's field. `platform._stamp_actor` has already run
  -- (it sorts ahead of this trigger), so `created_by` is the person, and VIS-25 makes the
  -- creator the owner and therefore the top level on what they just made. Without this arm
  -- nobody could ever write a confidential field's first value, including its author — and
  -- it is also why the ladder below is only ever asked about a row that already exists.
  if tg_op = 'INSERT' and new.created_by = v_me then
    return new;
  end if;

  -- THE ONE LADDER'S LEVEL FORM. This used to be `iam.effective_level`, which is arm 2 of
  -- the one function rather than the one function: it cannot see the store's own carrying,
  -- so a person admitted to this record THROUGH its Table was masked out of every field on
  -- it. `custom.effective_level` is the same question the read door asks, so the fields a
  -- person may change are decided on the ladder that decided they may be here at all.
  v_level := custom.effective_level(v_me, new.organization_id, new.id, 'record');

  for v_key in
    select e.key from jsonb_each(coalesce(new.data, '{}'::jsonb)) e
     where left(e.key, 1) <> '_'
       and (v_old -> e.key) is distinct from e.value
  loop
    select f.* into v_field
      from custom.record f
     where f.organization_id = new.organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = new.table_id
       and f.data ->> 'key' = v_key;
    if not found then continue; end if;

    if not iam.may_touch_field(v_me, v_field.id, new.organization_id, v_level, 'edit') then
      raise exception 'You can see this record, but "%" is not yours to change.',
                      coalesce(v_field.data ->> 'label', v_key)
        using errcode = '42501',
              hint = 'DOOR-3: the store refuses an edit to a field you may not edit, whichever door you came through. '
                     || 'It would take ' || iam.level_label('record',
                          iam.field_sensitivity_level(v_field.data ->> 'sensitivity', 'edit', new.organization_id))
                     || ', or a share of this one field with you.';
    end if;
  end loop;
  return new;
end;
$function$;

-- ── 4. and the census keeps nothing excused ──────────────────────────────────
create or replace function custom.doors_not_on_one_ladder()
returns table(function_name text, identity_args text, why text)
language sql
stable
set search_path to 'pg_catalog'
as $function$
  select p.proname::text,
         pg_get_function_identity_arguments(p.oid),
         'decides a row with a ladder of its own (iam.has_access_for / iam.effective_level / '
         'public.has_permission_for) instead of custom.has_visibility, so reading and writing '
         'can disagree again'::text
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     -- THE CODE, NOT THE PROSE: `--` comments are stripped before the body is read, so a
     -- sentence explaining the old ladder can never fail this census and a sentence
     -- promising the new one can never pass it.
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         ~* '(iam\.has_access_for|iam\.effective_level|public\.has_permission_for)'
     -- The one function itself, its level form, its set form and this census.
     and p.proname not in ('has_visibility', 'has_visibility_at', 'effective_level',
                           'visible_record_ids', 'doors_not_on_one_ladder')
     -- AND NOTHING ELSE. `custom._field_write_door` was excused here until 2026-09-19,
     -- when lane REACH routed it onto `custom.effective_level`. There is no excused
     -- object in this store any more, so there is no list to keep one on.
   order by 1;
$function$;

-- ── THE DOORS, DECLARED IN THE SAME TRANSACTION AS THE BODIES ────────────────
-- Schema `custom` never issues a raw GRANT. A function becomes reachable by
-- declaring a row in `platform.client_callable_door` that says who may knock and
-- why, and then asking `custom.reopen_declared_doors()` to make the catalogue
-- match the declaration; the grant is a consequence of the row, never a decision
-- of its own. The declaration is in THIS transaction because it has to be:
-- `provision_shape_guard` refuses to let a SECURITY DEFINER function reach COMMIT
-- with no access decision declared in data, and `door_body_must_decide` refuses a
-- row whose function's body does not actually decide. The two guards meet here.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom',
       p.proname,
       pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes),
       true,
       false,
       'migrations/campaign/reach_the_store_speaks_one_ladder.sql (lane REACH)',
       v.reason
  from (values
  ('query_visible_ids', 'THE LIST OF WHAT YOU ARE ALLOWED TO SEE, as ids. It is the id set every other query verb, every export and every aggregate joins against, and it now asks custom.has_visibility per row - the same question the read door asks. Reachable because a client that cannot ask it cannot tell an empty result from a refusal.')
  ) as v(fname, reason)
  join pg_proc p
    on p.pronamespace = 'custom'::regnamespace
   and p.proname = v.fname
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- The grant follows from the declaration, and only from the declaration.
select custom.reopen_declared_doors();
