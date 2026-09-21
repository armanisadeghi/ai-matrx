-- target: branch
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom._record_field_validation() da1507e77f2476850fc41876548b2018f061ddf13034df8144cb374b39b40bd3
-- based-on: custom.record_values(uuid,uuid) 694cf0acfc37b0099c35093000f3318d580961c1ef703b2b5987d9bc6f4c7681
--
-- 🚨 WHY THIS FILE IS NOT `w1_val_value_envelope.sql`, WHICH THE BRANCH LEDGER NAMES.
-- The first rehearsal of these bytes (sha256 ba799c51a764de6d…, applied 17:23:20Z) carried a
-- real bug: `custom.validate_value_envelope` said `select x into f from unnest(p_fields) x`,
-- and `unnest()` over an array of a COMPOSITE type expands it into columns, so plpgsql tried
-- to assign the whole row to `f`'s first field and raised `invalid input syntax for type
-- uuid`. §4.13's answer to a wrong branch migration is its own inverse, so the inverse was
-- RUN — both replaced bodies came back byte for byte to W1-FIELD's hashes, and all eighteen
-- of this lane's functions, the trigger and the constraint were gone. The corrected bytes
-- cannot re-use the old NAME: the runner refuses a file already ledgered with a different
-- SHA-256 by name, and it is right to — a ledger row records what actually ran, and those
-- bytes did run and were reversed. So the corrected file is a new name and the old row stands
-- as the history it is. `--accept-drift` would have re-pointed that row WITHOUT executing
-- anything, which is the one thing that would have made the ledger lie.
--
-- THE INVERSE of `migrations/campaign/w1_val_the_value_envelope.sql` (§4.13, rule 27). It
-- restores the prior state exactly: `custom.record` carries no `record_value_envelope`
-- constraint and no `_value_envelope` trigger, none of this lane's eighteen functions
-- exist, and the TWO functions this lane replaced —`custom._record_field_validation()`
-- and `custom.record_values(uuid,uuid)` — are restored to `W1-FIELD`'s bodies, byte for
-- byte, so that `encode(sha256(convert_to(pg_get_functiondef(oid),'utf8')),'hex')` reads
-- `a7ac84e16bbfb4bc949f5e6129c2891f29d769ed55f48090b8719fe09d535c1b` and
-- `b6eba0d0585e8e8bd42fd6acd90d39354630b4018c67d2a1d44953e22d12a524` again — the two hashes
-- the up-file's own `-- based-on:` lines name. That is what makes "the inverse restores the
-- prior state" a measurement rather than a claim.
--
-- IT IS `-- target: branch` ON PURPOSE. Tonight is branch-only, and an inverse is a DROP,
-- which rule 9 forbids on production in any lane. When the up-file is applied to production
-- at the attended step, this file is what the chair holds in reserve, and running it there
-- is a chair decision with the owner present, never a lane's.
--
-- ORDER MATTERS: the constraint reads `custom.value_envelope_ok`, which reads
-- `custom.value_envelope_refusal`, so the constraint goes first and the functions after.

set lock_timeout = '5s';
set statement_timeout = '600s';

alter table custom.record drop constraint if exists record_value_envelope;
drop trigger if exists _value_envelope on custom.record;

-- W1-FIELD's body, restored before its caller is dropped.
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
begin
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
            'reason', format('this record became a %s, and %s does not apply to a %s',
                             coalesce(v_rtype, 'different kind of thing'),
                             coalesce(nullif(g.data ->> 'label', ''), g.data ->> 'key'),
                             coalesce(v_rtype, 'record of that kind')),
            'at', to_jsonb(now()));
          new.data := new.data - (g.data ->> 'key');
        end if;
      end loop;
      if jsonb_array_length(v_retired) > 0 then
        new.data := jsonb_set(new.data, '{_retired}', v_retired);
      end if;
    end if;
  end if;

  perform custom.validate_values(new.organization_id, v_fields, new.data, v_rtype);
  return new;
end;
$function$;

create or replace function custom.record_values(p_organization_id uuid, p_record_id uuid)
 returns jsonb
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  select (r.data - '_computed' - '_retired')
         || coalesce((select jsonb_object_agg(e.key, e.value -> 'value')
                        from jsonb_each(coalesce(r.data -> '_computed', '{}'::jsonb)) e),
                     '{}'::jsonb)
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_record_id;
$function$;

-- 🚨 ELEVEN OF THIS LANE'S EIGHTEEN FUNCTIONS STAY STANDING (lane INVERSE-GUARD, 2026-09-21).
-- ENTITY-FIELDS ADOPTED THE VALUE ENVELOPE. `custom._entity_custom_fields_guard`
-- (`entityfields_a_row_with_no_custom_fields_has_none.sql`) calls
-- `custom.validate_value_envelope`, `custom.actor_word`, `custom.value_versions`,
-- `custom.stamp_value_envelopes` and `custom.value_envelope_refusal`, and it is what the LIVE
-- trigger `custom_fields_validation` on `crm.party` runs — so dropping them would leave that
-- trigger attached over bodies that are gone and every write to a standard Entity carrying
-- custom fields would raise. Two more were adopted elsewhere: `custom.history_actor`
-- (`histscreens_a_record_can_say_who_changed_it.sql`) reads `custom.retired_actor_words`, and
-- `custom.enrich_land` (`enrich_a_field_a_model_owns.sql`) reads `custom.absence_reasons`.
-- The four vocabulary helpers those five bodies then call
-- (`custom.actor_vocabulary`, `custom.per_value_access_words`, `custom.value_alternate_keys`,
-- `custom.value_envelope_keys`) go with them: leaving a body standing over a callee that is
-- gone is the same defect one hop down.
--
-- So those eleven are LEFT WHERE THEY ARE and the behaviour is NEUTERED instead. What carried
-- W1-VAL's fix is gone in full: the `record_value_envelope` constraint, the `_value_envelope`
-- trigger, the seven functions below, and — the whole of it — the two replaced bodies above,
-- `custom._record_field_validation()` and `custom.record_values(uuid,uuid)`, restored byte for
-- byte to W1-FIELD's hashes. With those two back, NOTHING in the record store writes, reads or
-- validates an envelope: a value is a bare JSON scalar again, with no version, no actor and no
-- provenance, which is precisely the defect this file exists to restore. The eleven survivors
-- are reachable only from ENTITY-FIELDS' own guard and two screens outside this lane.
drop function if exists custom.value_read(uuid, uuid, text);
drop function if exists custom.record_values_versioned(uuid, uuid);
drop function if exists custom._value_envelope();
drop function if exists custom.intern_provenance(jsonb);
drop function if exists custom.source_next_pointer(jsonb);
drop function if exists custom.source_pointer(jsonb, jsonb);
drop function if exists custom.value_envelope_ok(jsonb);
--   the eleven deliberately NOT dropped:
--   custom.validate_value_envelope(uuid, custom.record[], jsonb)
--   custom.actor_word(text)
--   custom.value_versions(jsonb, jsonb)
--   custom.stamp_value_envelopes(jsonb, text, text, timestamptz)
--   custom.value_envelope_refusal(jsonb)
--   custom.per_value_access_words()
--   custom.value_alternate_keys()
--   custom.value_envelope_keys()
--   custom.retired_actor_words()
--   custom.actor_vocabulary()
--   custom.absence_reasons()
