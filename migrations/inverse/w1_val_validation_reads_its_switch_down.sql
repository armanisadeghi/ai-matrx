-- target: branch
-- based-on: custom._record_field_validation() 1518b2f22d95c9a9a6a0ad99f0fff669f6f2bd2ee8701aba5b8aef600f2defd0
--
-- THE INVERSE of `migrations/campaign/w1_val_validation_reads_its_switch.sql` (§4.13,
-- rule 27). It restores the prior state exactly: `custom.store_is_open(uuid)` does not
-- exist, and `custom._record_field_validation()` is back to the body
-- `w1_val_the_value_envelope.sql` ledgered, so that
-- `encode(sha256(convert_to(pg_get_functiondef(oid),'utf8')),'hex')` reads
-- `da1507e77f2476850fc41876548b2018f061ddf13034df8144cb374b39b40bd3` again — the hash the
-- up-file's own `-- based-on:` line names. That is what makes "the inverse restores the
-- prior state" a measurement rather than a claim.
--
-- IT IS `-- target: branch` ON PURPOSE, for the same reason every other inverse in this
-- directory is: an inverse is a DROP, which rule 9 forbids on production in any lane.
--
-- ORDER MATTERS: the trigger body calls `custom.store_is_open`, so the body is restored
-- first and the function dropped after it has no caller left.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- W1-VAL's body, restored before its callee is dropped.
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

-- 🚨 `custom.store_is_open` STAYS STANDING (lane INVERSE-GUARD, 2026-09-21). This file used to
-- drop it, and FORTY-SEVEN triggers created by later files reach it — every shape guard, store
-- door, history capture, outbox and organization wall on `custom.record`, `custom.external_link`,
-- `custom.external_source`, `platform.associations`, `platform.custom_field_definition`,
-- `iam.memberships`, `iam.permissions`, `custom.doc_render` and `custom.doc_signature`. As
-- written this inverse left every one of them attached over a function that was gone, so the
-- next write anywhere in the store died on
--     function custom.store_is_open(uuid) does not exist
-- before the red twin asked its first question. A store that cannot take a write is not the
-- prior state this file claims to restore.
--
-- THE DEFECT IS RESTORED IN FULL BY THE BODY ABOVE, which is the whole of it: W1-VAL's
-- `custom._record_field_validation()` with the switch UNREAD, byte for byte the definition
-- `w1_val_the_value_envelope.sql` ledgered, so
-- `encode(sha256(convert_to(pg_get_functiondef(oid),'utf8')),'hex')` still reads
-- `da1507e77f2476850fc41876548b2018f061ddf13034df8144cb374b39b40bd3`. The switch stays standing
-- and validation no longer asks it, which is precisely the defect.
--
-- ground-standing-ok: b — this inverse is run ALONE, by `scripts/campaign-tests/w1_val_t5.sql`
-- inside a rolled-back transaction, never in the same transaction as
-- `w1_table_table_home_containment_down.sql`, which drops `custom.table_kernel_id`,
-- `custom.field_kernel_id` and `custom.table_type_field` that the body above calls. In a full
-- un-apply this file runs FIRST and that one LAST: W1-VAL sits above W1-TABLE in the ledger,
-- and an inverse stack comes off in the reverse of the order it went on.
