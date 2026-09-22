-- chair-step: it ends in `select custom.reopen_declared_doors()`, which ISSUES the EXECUTE grants
--   that the two `platform.client_callable_door` rows above it declare. A GRANT is the one shape
--   the production allow-list refuses by name, and correctly so — a grant is how the store gets
--   wider. It is deliberate here and it is the point of the file: a conversion nobody can call
--   from a browser is a conversion that never runs. Both doors decide FIRST, on the one ladder:
--   the organization wall (custom.assert_client_may_reach), the store's own off switch
--   (custom.assert_store_door) and, for the one that writes, ADMIN on the Table
--   (custom.assert_client_may_change). Nothing becomes visible to anybody that
--   custom.has_visibility did not already say they may see; nothing is dropped; nothing is
--   revoked; no row of any feature is deleted.
--
-- CHOICE-VALUE (3 of 4) — THE VALUES ALREADY IN THE STORE BECOME WORDS.
--
-- Files 1 and 2 changed what a choice value IS and what every door says about it. The cells
-- written before them still hold an option record's uuid. Censused on the main database at
-- 2026-09-20 06:24Z: ELEVEN live choice cells across six organizations — eight holding a uuid
-- string and three holding an array of them.
--
-- A uuid still RESOLVES (`custom.choice_key_of` matches on the option's id, so nothing is
-- broken), but it resolves by luck rather than by contract: the moment somebody exports the
-- table, groups by that column or hands it to an agent, the uuid is what they see. So the values
-- are converted in place, through THE STORE'S OWN WRITE DOOR.
--
--   `custom.migrate_choice_keys(organization, table, dry_run)`
--
-- HOW IT CONVERTS, and why this shape: it calls `custom.record_update` with the value the row
-- already holds. That runs `custom._resolve_choice_words` — the trigger from file 1, which turns
-- a uuid into the option's key — and then every guard, every validator and `zzz_history_capture`,
-- exactly as an ordinary edit does. So the conversion is not a second write path: it IS the
-- write path, and each converted record's old value is in `history.row_versions` where every
-- other change is.
--
-- IDEMPOTENT. A cell that already holds a key is not written at all (the door is only called for
-- a cell whose resolved key differs from what is stored), so a second run reports zero and
-- writes nothing. It is also safe to run while the product is in use: one record at a time,
-- through the door, with the caller's own rights asked per record.
--
-- THE LADDER, and it is not waived: `custom.assert_client_may_reach` (the organization wall),
-- `custom.assert_store_door` (the switch), and `custom.assert_client_may_change` at ADMIN on the
-- Table — because converting how a whole column is stored is a change to the table's data, not
-- an edit of one row. `custom.record_update` then asks EDITOR on each record again, so a caller
-- who holds admin on the Table but cannot reach a particular row converts what they may and the
-- refusal names the row.
--
-- HISTORY. One `history.migration_log` row per Table actually converted, verb `choice_keys`,
-- whose inverse is `{"kind":"none"}` WITH ITS REASON — deliberately, and this is the honest
-- answer rather than a convenient one: the store no longer has a representation for a uuid
-- choice value, so no door could put one back. HIS-8 names `none` for exactly this case ("a verb
-- that is deliberately one-way and says so"). The per-record before-and-after is not lost: it is
-- in `history.row_versions`, written by the same trigger every other edit goes through.
--
-- THE CENSUS IS PART OF THE ANSWER. The verb returns what it found before and what is true
-- after — cells, how many held a uuid, how many held a key, how many resolve to no choice at all
-- — so "it ran" and "it worked" are the same sentence. `dry_run` returns the census and writes
-- nothing.
--
-- THE INVERSE: migrations/inverse/choiceval_the_values_become_words_down.sql (it drops the two
-- functions; the conversion itself is one-way and the file above says so out loud).

set lock_timeout = '45s';
set statement_timeout = '600s';

create or replace function custom.choice_census(p_organization_id uuid, p_table_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_out jsonb;
begin
  -- THE DECISION BEFORE THE FIRST READ, so a foreign organization id and an invented one answer
  -- identically and neither is told whether the Table exists.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.choice_census');
  perform custom.assert_store_door(p_organization_id, 'custom.choice_census');
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.choice_census');
  end if;

  -- What every choice cell of this organization (or of one Table) is holding right now.
  -- `stored_key` is the contract; `stored_id` and `stored_label` are what a caller wrote before
  -- this lane; `unresolved` is a token that names no choice of that column at all and is the
  -- number a person should care about. The rows are bounded by what this caller may SEE:
  -- custom.query_visible_ids is the read door's own id set, so a census never counts a record
  -- its caller is refused.
  select jsonb_build_object(
    'organization_id', p_organization_id,
    'table_id',        p_table_id,
    'cells',           count(*),
    'stored_key',      count(*) filter (where c.hit is not null and c.raw = c.hit),
    'stored_id',       count(*) filter (where c.hit is not null and c.raw <> c.hit
                                          and c.raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
    'stored_label',    count(*) filter (where c.hit is not null and c.raw <> c.hit
                                          and c.raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
    'unresolved',      count(*) filter (where c.hit is null),
    'at',              to_jsonb(now()))
    from (
      select r.id,
             f.key as fkey,
             e.raw,
             custom.choice_key_of(m.map -> f.key, e.raw) as hit
        from custom.record r
        cross join lateral (select custom.choice_field_map(p_organization_id, r.table_id) as map) m
        cross join lateral jsonb_each(m.map) f(key, val)
        cross join lateral (
          select x #>> '{}' as raw
            from jsonb_array_elements(
                   case when jsonb_typeof(r.data -> f.key) = 'array' then r.data -> f.key
                        when r.data -> f.key is null
                          or jsonb_typeof(r.data -> f.key) = 'null' then '[]'::jsonb
                        else jsonb_build_array(r.data -> f.key) end) x
           where jsonb_typeof(x) = 'string') e
       where r.organization_id = p_organization_id
         and (p_table_id is null or r.table_id = p_table_id)
         and r.deleted_at is null
         and r.table_id is not null
         and custom.has_visibility(custom.query_principal(), 'record', r.id,
                                   'viewer'::public.permission_level)) c
    into v_out;
  return v_out;
end;
$function$;

create or replace function custom.migrate_choice_keys(p_organization_id uuid, p_table_id uuid, p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_before  jsonb;
  v_after   jsonb;
  v_map     jsonb;
  v_changed integer := 0;
  v_rows    integer := 0;
  v_log     uuid;
  v_patch   jsonb;
  r         record;
  e         record;
  v_val     jsonb;
  v_new     jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_choice_keys');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_choice_keys');
  if p_table_id is null then
    raise exception 'custom.migrate_choice_keys: which Table? The conversion is per Table, because its rights are the Table''s.'
      using errcode = '22004',
            hint = 'Pass the Table whose choice columns should be converted. custom.choice_census(organization) tells you which ones still hold ids.';
  end if;
  -- ADMIN on the TABLE: converting how a whole column is stored is a change to the table's
  -- data, not an edit of one row. custom.record_update asks EDITOR per record underneath.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.migrate_choice_keys',
                                          'admin'::public.permission_level, 'table');

  v_before := custom.choice_census(p_organization_id, p_table_id);
  v_map    := custom.choice_field_map(p_organization_id, p_table_id);

  if v_map = '{}'::jsonb then
    return jsonb_build_object('verb', 'choice_keys', 'table_id', p_table_id,
                              'converted', 0, 'records', 0, 'dry_run', coalesce(p_dry_run, false),
                              'before', v_before, 'after', v_before,
                              'says', 'This table has no choice columns, so there was nothing to convert.');
  end if;

  for r in select rec.id, rec.data
             from custom.record rec
            where rec.organization_id = p_organization_id
              and rec.table_id = p_table_id
              and rec.deleted_at is null
            order by rec.created_at, rec.id
  loop
    v_patch := '{}'::jsonb;
    for e in select key as k, value as v from jsonb_each(v_map) loop
      v_val := r.data -> e.k;
      if v_val is null or jsonb_typeof(v_val) = 'null' then
        continue;
      end if;
      if jsonb_typeof(v_val) = 'array' then
        select coalesce(jsonb_agg(coalesce(to_jsonb(custom.choice_key_of(e.v, x #>> '{}')), x)
                                  order by ord), v_val)
          into v_new
          from jsonb_array_elements(v_val) with ordinality t(x, ord);
      elsif jsonb_typeof(v_val) = 'string' then
        v_new := coalesce(to_jsonb(custom.choice_key_of(e.v, v_val #>> '{}')), v_val);
      else
        continue;
      end if;
      if v_new is distinct from v_val then
        v_patch := v_patch || jsonb_build_object(e.k, v_new);
      end if;
    end loop;

    if v_patch <> '{}'::jsonb then
      v_rows := v_rows + 1;
      v_changed := v_changed + (select count(*) from jsonb_object_keys(v_patch));
      if not coalesce(p_dry_run, false) then
        -- THE STORE'S OWN WRITE DOOR. Every guard, every validator and the history capture run
        -- exactly as they do for a person editing the cell by hand.
        perform custom.record_update(p_organization_id, r.id, v_patch);
      end if;
    end if;
  end loop;

  if v_rows > 0 and not coalesce(p_dry_run, false) then
    v_log := history.migration_record(p_organization_id, 'choice_keys', 'table', p_table_id,
      jsonb_build_object(
        'kind',   'none',
        'reason', 'One-way by design: the store no longer has a representation for a choice value '
                  'held as an option record''s uuid, so no door could put one back. Each converted '
                  'record''s previous value is in history.row_versions, written by the same capture '
                  'every other edit goes through.'),
      format('%s choice value(s) on %s record(s) became the option''s own key', v_changed, v_rows));
  end if;

  v_after := custom.choice_census(p_organization_id, p_table_id);

  return jsonb_build_object(
    'verb',      'choice_keys',
    'table_id',  p_table_id,
    'dry_run',   coalesce(p_dry_run, false),
    'converted', v_changed,
    'records',   v_rows,
    'migration_id', v_log,
    'before',    v_before,
    'after',     v_after,
    'says',      case when v_rows = 0
                      then 'Every choice value on this table already holds the option''s own key.'
                      else format('%s value(s) on %s record(s) now hold the option''s own word instead of its id.',
                                  v_changed, v_rows) end,
    'at',        now());
end;
$function$;

-- THE DOORS. Both decide before they read, both are SECURITY DEFINER, and the declaration comes
-- BEFORE the grant because platform.enforce_definer_client_grants fires on the GRANT.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
values (
  'custom', 'choice_census', 'p_organization_id uuid, p_table_id uuid',
  array['uuid'::regtype::oid, 'uuid'::regtype::oid],
  true, false,
  'migrations/campaign/choiceval_the_values_become_words.sql (lane CHOICE-VALUE)',
  'What every choice cell of an organization is holding: how many hold the option''s own key (the contract), how many still hold its id or its label, and how many name no choice at all. A person converting a table needs to see the number before and after, and an unresolved token is a real defect somebody has to be told about rather than a silent null. It decides the organization wall on its own first line, so a foreign organization id answers exactly as an invented one does, and it reads nothing but this organization''s own records.'),
  ('custom', 'migrate_choice_keys', 'p_organization_id uuid, p_table_id uuid, p_dry_run boolean',
  array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'bool'::regtype::oid],
  true, false,
  'migrations/campaign/choiceval_the_values_become_words.sql (lane CHOICE-VALUE)',
  'Converts a table''s choice values from the option record''s uuid to the option''s own stable key, in place, through custom.record_update - so every guard, every validator and the history capture run exactly as they do for a person editing the cell. The organization wall, the store''s off switch and ADMIN on the Table are all decided before the first write, because changing how a whole column is stored is a change to the table rather than an edit of one row. Idempotent: a cell that already holds a key is not written. p_dry_run returns the census and writes nothing.')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

select custom.reopen_declared_doors();
