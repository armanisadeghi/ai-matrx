-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom._record_field_validation() da1507e77f2476850fc41876548b2018f061ddf13034df8144cb374b39b40bd3
--
-- W1-VAL FOLLOW-UP — THE VALIDATION TRIGGER READS THE SWITCH THAT IS SUPPOSED TO HOLD IT OFF.
--
-- WHY THIS FILE EXISTS, AND WHY IT IS NOT AN EDIT OF `w1_val_the_value_envelope.sql`.
-- -------------------------------------------------------------------------------
-- That file is applied and ledgered on the branch; its bytes are history and are never
-- rewritten (§4.13, and the runner refuses a ledgered name whose SHA-256 has moved). It is
-- superseded HERE instead. What it got wrong is one thing: it replaces
-- `custom._record_field_validation()`, a function whose `RETURNS` clause names `trigger`,
-- and its body never names `custom/system_enabled`. `migrations/JUDGMENT.md` §4a withdraws
-- schema `custom`'s guard-unread exemption from exactly that shape (fixtures
-- `a6-18-…-custom-returns-trigger.sql` refuse, `a6-19-…-returns-trigger.sql` accept),
-- because Postgres resolves a trigger's function by OID at fire time and not by schema
-- privilege: replacing the body is replacing what an already-bound trigger executes. Both
-- runners judge that file `refuse:guard-unread` at `--target production`, and they are right
-- to. `custom.record_values(uuid,uuid)`, the other body that file replaces, returns `jsonb`,
-- so the schema exemption still covers it and it is not touched here.
--
-- WHAT "OFF" MEANS FOR THIS FUNCTION, DECIDED FROM THE CODE AND NOT FROM A HABIT.
-- ------------------------------------------------------------------------------
-- The reflex answer — read the knob first and `return new` while it is false, the way
-- `custom._entity_custom_fields_guard` does for `crm.party` — is WRONG HERE, and the
-- difference is worth writing down because the next author will reach for it.
--
--   * On `crm.party` the guarded behaviour is NEW. OFF means "the write answers exactly as
--     it did before this campaign existed", so returning NEW untouched is the whole point:
--     nothing is skipped, because nothing was there to skip.
--   * On `custom.record` the guarded behaviour is THE VALIDATION ITSELF. A body that
--     returned NEW while the switch is off would let a privileged writer — and while the
--     store is closed, EVERY writer is a privileged one — put unvalidated documents into
--     the store, with no field definitions checked, no retype retirement, no envelope law.
--     That is the silent pass law 4 forbids: the flag would not be holding a feature off,
--     it would be holding the CHECKING off and saying nothing.
--
-- So: **the switch never removes a check.** Validation runs in full whether it is on or off,
-- and every existing caller answers identically either way, which is what makes landing this
-- inert. What OFF adds is the door, stated out loud: while `custom/system_enabled` resolves
-- false the store is closed to every client (schema `custom` is revoked from PUBLIC, `anon`,
-- `authenticated` and `service_role`, is absent from `pgrst.db_schemas` and from the ORM), so
-- it belongs to the campaign that owns it, and a write arriving as any other role is REFUSED
-- BY NAME with the remedy instead of being quietly accepted. A refusal with a named remedy is
-- inert and honest; a silent pass is neither.
--
-- The owner is read from the catalogue (`pg_class.relowner` for `custom.record`), never
-- written here as a role literal (rule 15), so the door cannot drift from the table it
-- guards. The bound, named rather than implied: this trigger fires BEFORE INSERT OR UPDATE,
-- so the door is on those two verbs. It is not the security boundary and never was — §6's
-- fact two is, and a DELETE path is `W4-DOOR`'s row. This is the store saying no in words at
-- the one place a write already passes through.
--
-- WHAT LANDS ON PRODUCTION. `custom._record_field_validation` does not exist on production at
-- all (no wave-1 `custom` file has landed there — tonight is branch-only), so this replaces
-- no live body there; it is a new function beside a store no role can reach. On the branch it
-- replaces the body ledgered by `w1_val_the_value_envelope.sql`, whose SHA-256 is the
-- `-- based-on:` line above, and every line of it below is that body unchanged except the
-- two marked `W1-VAL-APPLY`.
--
-- THE INVERSE: `migrations/inverse/w1_val_validation_reads_its_switch_down.sql`.

set lock_timeout = '2s';
set statement_timeout = '300s';


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. THE SWITCH, READ THE WAY EVERY OTHER CAMPAIGN BODY READS A KNOB
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function custom.store_is_open(p_organization_id uuid default null)
  returns boolean
  language plpgsql
  stable
  set search_path to 'pg_catalog'
as $fn_sio$
declare
  v_open boolean;
begin
  -- The established read, unchanged from `custom._entity_custom_fields_guard` and
  -- `custom.containment_depth_ceiling`: `platform.knob_resolve(feature, key, rung)` answers
  -- jsonb and `#>> '{}'` takes the scalar out of it. Passing the organization id means an
  -- organization rung answers for that organization; `null` asks for the platform value,
  -- which is `coalesce(value, default_value)` and is what the runner asserts is false before
  -- it opens anything (§6b.2).
  begin
    v_open := coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean,
                       false);
  exception when others then
    -- §6b.4b, and it is a real trap rather than defensive noise: `platform.knob_resolve` is
    -- SECURITY INVOKER, and `has_table_privilege('anon','platform.feature_knob','SELECT')`
    -- is false — so for a role that merely cannot SEE the row it RAISES `P0001 … is not
    -- seeded`, which reads like a missing knob and is not one. A switch this writer cannot
    -- read is CLOSED, never open, and the caller is what says so out loud.
    v_open := false;
  end;
  return v_open;
end;
$fn_sio$;

comment on function custom.store_is_open(uuid) is
  'The product switch for schema custom (custom/system_enabled), read the way every campaign body reads a knob and unable to raise: a switch the writer cannot read is CLOSED. It never decides whether a check runs - only whether the store is open to anyone but its owner.';


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. THE VALIDATION TRIGGER — W1-VAL'S BODY, PLUS THE DOOR THAT READS THE SWITCH
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function custom._record_field_validation()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_type_field text;
  v_rtype      text;
  v_fields     custom.record[];
  v_gone       custom.record[];
  g            custom.record;
  v_retired    jsonb;
  v_owner      oid;                 -- W1-VAL-APPLY (1 of 2)
begin
  -- W1-VAL-APPLY (2 of 2): THE DOOR. While `custom/system_enabled` resolves false this store
  -- is closed to every client, so the only legitimate writer is the one that owns it. Nobody
  -- else is refused silently and nobody else is let through silently either: they are told
  -- which switch is off and who turns it on. Validation below is NOT conditional on this —
  -- the switch never removes a check, and the owner's write answers exactly as it did
  -- before this file, which is what makes landing it inert.
  if not custom.store_is_open(new.organization_id) then
    select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
    if not pg_has_role(current_user, v_owner, 'member') then
      raise exception 'The custom data store is switched off, so it is not taking writes from "%".', current_user
        using errcode = '42501',
              hint = 'custom/system_enabled resolves false. While it does, this store takes writes only from the role that owns custom.record. The switch checklist turns the knob on; a lane never does. Nothing here skips validation while the switch is off - it is a closed door, not a quiet one.';
    end if;
  end if;

  -- The kernel is defined in code, the Tables and the Fields and the merge fields have their
  -- own shape guards, and a relation row carries an edge rather than a document.
  if new.data_class in ('kernel', 'relation')
     or new.table_id is null
     or new.table_id = custom.table_kernel_id()
     or new.table_id = custom.field_kernel_id() then
    return new;
  end if;

  v_type_field := custom.table_type_field(new.organization_id, new.table_id);
  if v_type_field is not null then
    v_rtype := new.data ->> v_type_field;
  end if;

  select array_agg(f) into v_fields
    from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) f;
  if v_fields is null then
    return new;               -- a Table that declared no definitions validates nothing.
  end if;

  -- T8's retype: a Value that stops applying is neither coerced nor deleted. It is moved,
  -- WITH ITS REASON, and the field is then hidden by custom.applicable_fields. This is a
  -- STAND-IN for History and says so: W3-HIST (HIS-*) owns the real store, and when it
  -- lands this block writes there instead. Until then the value is in the document, not gone.
  if tg_op = 'UPDATE' and v_type_field is not null
     and (old.data ->> v_type_field) is distinct from v_rtype then
    select array_agg(f) into v_gone
      from custom.applicable_fields(new.organization_id, new.table_id,
                                    old.data ->> v_type_field) f
     where not exists (select 1
                         from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) a
                        where a.id = f.id);
    v_retired := coalesce(new.data -> '_retired', '[]'::jsonb);
    if v_gone is not null then
      foreach g in array v_gone loop
        if old.data ? (g.data ->> 'key') and jsonb_typeof(old.data -> (g.data ->> 'key')) <> 'null' then
          v_retired := v_retired || jsonb_build_object(
            'key',   g.data ->> 'key',
            'label', g.data ->> 'label',
            'value', old.data -> (g.data ->> 'key'),
            -- W1-VAL (1 of 2): a retired Value takes its ENVELOPE with it. Where a value came
            -- from, who wrote it and its other candidates are facts about that value, so they
            -- belong beside it in _retired and not orphaned in _values pointing at nothing.
            'envelope', old.data -> '_values' -> (g.data ->> 'key'),
            'reason', format('this record became a %s, and %s does not apply to a %s',
                             coalesce(v_rtype, 'different kind of thing'),
                             coalesce(nullif(g.data ->> 'label', ''), g.data ->> 'key'),
                             coalesce(v_rtype, 'record of that kind')),
            'at', to_jsonb(now()));
          new.data := new.data - (g.data ->> 'key');
          if jsonb_typeof(new.data -> '_values') = 'object' then
            new.data := jsonb_set(new.data, '{_values}',
                                  (new.data -> '_values') - (g.data ->> 'key'));
          end if;
        end if;
      end loop;
      if jsonb_array_length(v_retired) > 0 then
        new.data := jsonb_set(new.data, '{_retired}', v_retired);
      end if;
    end if;
  end if;

  perform custom.validate_values(new.organization_id, v_fields, new.data, v_rtype);
  -- W1-VAL (2 of 2): the half of the envelope law that needs the definitions.
  perform custom.validate_value_envelope(new.organization_id, v_fields, new.data);
  return new;
end;
$function$;

comment on function custom._record_field_validation() is
  'W1-FIELD''s validation path, extended by W1-VAL with the envelope law, and reading custom/system_enabled at its door: while the switch is off this store takes writes only from the role that owns custom.record, and every other writer is refused by name with the remedy. The switch never removes a check - validation below the door runs identically whether it is on or off.';
