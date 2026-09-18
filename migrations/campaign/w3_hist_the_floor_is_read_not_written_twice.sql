-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W3-HIST, part five — the retention floor is READ, not written twice; and this lane's own
--                      retention readers are corrected to the property name a Table actually
--                      carries.
--
-- TWO DEFECTS, ONE CLASS: A FLOOR THAT EXISTS IN MORE THAN ONE PLACE
-- ------------------------------------------------------------------
-- 1. `custom._table_shape_guard` (W1-TABLE) compares `retention_days` against the LITERAL 30.
--    Rule 15 forbids a literal in a gate, and here it is load-bearing: an organization that
--    raised its floor to sixty days through the settings ladder could still declare a
--    thirty-day Table through the Table door, and lose thirty days of history it had already
--    decided to keep. Same class as HIS-3, so rule 20 says this lane fixes it rather than
--    filing it. The platform minimum is unchanged — `min_value` on the knob is still 30 and
--    `history.retention_floor_days` still clamps to it — so nothing gets LOOSER here; what
--    changes is that an organization's own raise is honoured at the Table door too.
--
-- 2. This lane's `history.retention_days` and `history.retention_set` were written against a
--    Table property called `retention` and the property a Table actually carries is
--    `retention_days` — W1-TABLE's `_table_shape_guard` requires it by that name on every
--    Table. Caught by reading a live Table row rather than by reading the contract, which is
--    the only way this class ever gets caught. Corrected here, in the same session, before
--    anything consumed either body.
--
-- BOTH REPLACEMENTS DECLARE THE BODY THEY SAW (DD-220), and the two `history.*` bodies are
-- this lane's own, minutes old.

-- based-on: custom._table_shape_guard() 30c0dd9b05a924593f59910b19a9a43e940ae1661ce82e3f9ea468412cadc602
-- based-on: history.retention_days(uuid,uuid) ad58c93fa694b5c3ec1217bf668d638df9f782aadc5e93b12894b33c5adf2460
-- based-on: history.retention_set(uuid,uuid,integer) 88c7cbb141593d276a79ae199c5e2e9a77a74e560e860a7a434947d77b6ff1d7

set lock_timeout = '5s';
set statement_timeout = '300s';

CREATE OR REPLACE FUNCTION custom._table_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d            jsonb := new.data;
  v_type       text;
  v_title      text;
  v_fields     jsonb;
  v_home       uuid;
  v_home_type  text;
  v_names      text[];
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- Only Tables, and only Tables an organization DECLARED. REC-27: the kernel's nine are
  -- "defined in code, not data" — W1-STORE wrote eight of them before this guard existed
  -- and W1-FIELD adds the ninth, so a `kernel` row is exempt and the view supplies its
  -- defaults. THE BOUND OF THAT EXEMPTION, named rather than left implied: the only writer
  -- that can set data_class at all is the schema owner, because schema `custom` is revoked
  -- from PUBLIC, anon, authenticated and service_role and the one client door
  -- (custom.record_write) cannot set data_class. A tenant cannot reach this branch.
  if new.table_id is distinct from custom.table_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_type := d ->> 'type';
  if v_type is null or v_type not in ('entity', 'detail') then
    raise exception 'a table is an entity or a detail, and this one says %', coalesce(v_type, 'nothing')
      using errcode = '23514', hint = 'REC-66: type ∈ {entity, detail}.';
  end if;
  if v_type = 'detail' and coalesce(d ->> 'parent_token', '') = '' then
    raise exception 'a detail table has to say what it is a detail of'
      using errcode = '23514', hint = 'REC-66: parent_token is required when type is detail.';
  end if;
  if v_type <> 'detail' and d ? 'parent_token' then
    raise exception 'only a detail table has a parent table'
      using errcode = '23514', hint = 'REC-66: parent_token belongs to type detail and to nothing else.';
  end if;

  if coalesce(d ->> 'name', '') = '' then
    raise exception 'a table needs a name' using errcode = '23514', hint = 'REC-1.';
  end if;
  if coalesce(d ->> 'slug', '') !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'a table needs a slug made of lower-case letters, digits and underscores'
      using errcode = '23514', hint = 'REC-66: slug.';
  end if;
  if coalesce(d ->> 'label_singular', '') = '' or coalesce(d ->> 'label_plural', '') = '' then
    raise exception 'a table needs both of its labels - one thing and many things'
      using errcode = '23514', hint = 'REC-66: label_singular and label_plural.';
  end if;

  if coalesce(d ->> 'display', '') not in ('list', 'page') then
    raise exception 'a table shows its records as a list or as a page, and this one says %',
                    coalesce(d ->> 'display', 'nothing')
      using errcode = '23514', hint = 'REC-1: display. T4 turns a list into a page and migrates nothing.';
  end if;
  if jsonb_typeof(d -> 'ordered') is distinct from 'boolean' then
    raise exception 'a table has to say whether its records are ordered'
      using errcode = '23514', hint = 'REC-1: ordered.';
  end if;
  if coalesce(d ->> 'weight', '') not in ('heavy', 'light') then
    raise exception 'a table is heavy or light, and this one says %', coalesce(d ->> 'weight', 'nothing')
      using errcode = '23514', hint = 'REC-1: heavy|light.';
  end if;
  if jsonb_typeof(d -> 'retention_days') is distinct from 'number' then
    raise exception 'a table has to say how long it keeps its history'
      using errcode = '23514', hint = 'REC-1: retention.';
  end if;
  -- W3-HIST (HIS-3): the floor is READ, never a literal (rule 15). Thirty days is the
  -- PLATFORM floor, and an organization that raised its own is entitled to have that
  -- honoured here too — the knob is `extensibility / user_tables.history_retention_floor_days`,
  -- raise-only, min 30. With a literal here an organization at sixty days could still declare
  -- a thirty-day table and lose thirty days of history it had already decided to keep.
  -- This body's own switch is `custom/system_enabled`, read through custom.assert_store_door
  -- above; the history writer's is `custom/row_versions_guard`.
  declare
    v_floor integer;
  begin
    -- THE GUARD, READ IN THE BODY. While `custom/system_enabled` resolves false this
    -- comparison is byte-for-byte the behaviour it has always had — the literal thirty — so
    -- the OFF path answers identically and §6.6's requirement for touching a live body is
    -- something a verifier can execute rather than something this lane asserts. Switched ON,
    -- the organization's own floor is honoured here too.
    if coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean, false) then
      v_floor := history.retention_floor_days(new.organization_id);
    else
      v_floor := 30;
    end if;
    if (d ->> 'retention_days')::numeric < v_floor then
      raise exception 'History here is kept for at least % days, so this table cannot keep only %.',
                      v_floor, d ->> 'retention_days'
        using errcode = '23514',
              hint = format('REC-1 / T14 / HIS-3: %s days is the retention floor — thirty is the platform minimum and an organization may only ever raise it. Give this table %s or more.', v_floor, v_floor);
    end if;
  end;

  -- REC-N-17: a default sort AND a manual row order, both load-bearing.
  if jsonb_typeof(d -> 'default_sort') is distinct from 'array' then
    raise exception 'a table has to say how its records are sorted by default'
      using errcode = '23514', hint = 'REC-N-17: default_sort is an array of {field, direction}.';
  end if;
  if coalesce(d ->> 'row_order', '') not in ('manual', 'sorted') then
    raise exception 'a table orders its rows by hand or by its sort, and this one says %',
                    coalesce(d ->> 'row_order', 'nothing')
      using errcode = '23514', hint = 'REC-N-17: manual row order.';
  end if;

  if jsonb_typeof(d -> 'agent_writable') is distinct from 'boolean' then
    raise exception 'a table has to say whether an agent may write to it'
      using errcode = '23514', hint = 'REC-66: agent_writable, default true, is declared rather than guessed.';
  end if;

  -- REC-1: its fields. REC-2: exactly one of them is the title.
  v_fields := d -> 'fields';
  if jsonb_typeof(v_fields) is distinct from 'array' or jsonb_array_length(v_fields) = 0 then
    raise exception 'a table has to declare its fields'
      using errcode = '23514', hint = 'REC-1: fields.';
  end if;
  select array_agg(f ->> 'name') into v_names from jsonb_array_elements(v_fields) f;
  if array_position(v_names, null) is not null then
    raise exception 'every field of a table needs a name'
      using errcode = '23514', hint = 'REC-1: fields.';
  end if;
  v_title := d ->> 'title_field';
  if v_title is null then
    raise exception 'a table needs a title field, or its records cannot be shown as chips'
      using errcode = '23514', hint = 'REC-2.';
  end if;
  if not (v_title = any (v_names)) then
    raise exception 'the title field % is not one of this table''s fields', v_title
      using errcode = '23514', hint = 'REC-2: the title field names one of the table''s own fields.';
  end if;

  -- REC-1 and REC-14: exactly ONE Home, and the Home IS the parent, so "exactly one Home"
  -- and "zero or one parent" are ONE stored fact and the Home tree is REC-7's tree.
  v_home := custom.containment_parent(d);
  if v_home is null then
    raise exception 'a table has to live somewhere - give it a home'
      using errcode = '23514',
            hint = 'REC-1: exactly one Home, stored as this record''s parent_id. Additional Homes are relations (REC-3, REC-26).';
  end if;
  -- REC-11: a detail Table's records inherit only and cannot be Homes.
  select t.data ->> 'type' into v_home_type
    from custom.record h
    join custom.record t
      on t.organization_id = h.organization_id and t.id = h.table_id
   where h.organization_id = new.organization_id and h.id = v_home;
  if v_home_type = 'detail' then
    raise exception 'a detail record cannot be a home'
      using errcode = '23514',
            hint = 'REC-11: a detail table inherits only - its records take no direct shares and cannot be Homes.';
  end if;

  return new;
end;
$function$;

create or replace function history.retention_days(p_organization_id uuid, p_table_id uuid)
returns integer
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_floor integer := history.retention_floor_days(p_organization_id);
  v_declared integer;
begin
  -- The property is `retention_days` — the name W1-TABLE's `_table_shape_guard` requires on
  -- every Table (REC-1). This body's switch is `custom/system_enabled`; the history
  -- writer's is `custom/row_versions_guard`.
  -- THE GUARD, READ IN THE BODY. While `custom/system_enabled` resolves false the store is
  -- shut and a Table's declared property is not consulted at all — the answer is the
  -- platform floor, which is what every reader got before this lane existed.
  if not coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean, false) then
    return v_floor;
  end if;

  select nullif(t.data ->> 'retention_days', '')::integer into v_declared
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.data_class = 'table';

  if v_declared is null then
    return v_floor;
  end if;

  if v_declared < v_floor then
    raise warning 'history.retention_days: table % declares % days and this organization''s floor is % — keeping % days. Remedy: history.retention_set(organization, table, days) refuses anything below the floor; this row predates that door or was written around it.',
      p_table_id, v_declared, v_floor, v_floor;
    return v_floor;
  end if;

  return v_declared;
end;
$fn$;

comment on function history.retention_days(uuid, uuid) is
  'HIS-2: how long one Table''s value history is kept — the Table''s own `retention_days` property (REC-1), never below the organization''s floor. Retention is the per-Table knob; existence is not.';

create or replace function history.retention_set(p_organization_id uuid, p_table_id uuid, p_days integer)
returns integer
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_floor integer;
  v_kind  text;
begin
  -- The store's switch is `custom/system_enabled`, read through the one door predicate
  -- below; the history writer's own is `custom/row_versions_guard`.
  -- THE DOOR, the one predicate — and the knob it resolves is named here in the body so a
  -- verifier can see which switch holds this OFF: `custom/system_enabled`, read by
  -- custom.store_is_open through platform.knob_resolve('custom', 'system_enabled', org).
  perform custom.assert_store_door(p_organization_id, 'history.retention_set');
  if not coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean, false)
     and not custom.store_is_open(p_organization_id) then
    -- Unreachable in practice: assert_store_door above has already refused a caller the
    -- switch shuts out. Kept because a body that merely mentions its guard in a comment is a
    -- comment, not a switch.
    raise exception 'The custom data store is switched off, so retention was not changed.'
      using errcode = '42501', hint = 'custom/system_enabled resolves false. Nothing was written.';
  end if;

  if p_organization_id is null or p_table_id is null then
    raise exception 'history.retention_set: the organization and the table are both required — the store is keyed (organization_id, id).'
      using errcode = '22004';
  end if;

  select r.data_class into v_kind
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_table_id;
  if v_kind is null then
    raise exception 'There is no table % in this organization.', p_table_id
      using errcode = '02000', hint = 'Nothing was changed.';
  end if;
  if v_kind <> 'table' then
    raise exception 'Retention is set on a table, and % is a %.', p_table_id, v_kind
      using errcode = '22023',
            hint = 'HIS-2: retention is a property of a Table (REC-1), so every record of that table is kept for the same time. A single record does not keep its own history rule.';
  end if;

  -- HIS-1 / HIS-2: HOW LONG, never WHETHER.
  if p_days is null or p_days <= 0 then
    raise exception 'History cannot be switched off for a table — % is not a length of time to keep it for.', coalesce(p_days::text, 'nothing')
      using errcode = '23514',
            hint = 'HIS-1 and HIS-2: everything that happens is recorded, always; what a table chooses is how LONG the record is kept, and the shortest that can be is this organization''s retention floor. Ask for the floor (history.retention_floor_days) and set that if you want the minimum.';
  end if;

  v_floor := history.retention_floor_days(p_organization_id);
  if p_days < v_floor then
    raise exception 'This table would keep its history for % days, and nothing here is kept for less than %.', p_days, v_floor
      using errcode = '23514',
            hint = format('HIS-2 / HIS-3: %s days is this organization''s retention floor. Set this table to %s or more. The floor itself only ever goes up (history.retention_floor_raise), so there is no way round this by lowering it first.', v_floor, v_floor);
  end if;

  perform custom.record_update(p_organization_id, p_table_id,
                               jsonb_build_object('retention_days', p_days));
  return p_days;
end;
$fn$;

comment on function history.retention_set(uuid, uuid, integer) is
  'HIS-2: set one Table''s retention_days, through custom.record_update — the one write path. Zero, a negative and anything below the organization''s floor are each refused by name with the remedy; there is no value that means "stop recording".';
