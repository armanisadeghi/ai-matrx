-- target: branch
-- based-on: custom._value_envelope() 1c4f6c3e5c59a1a1b40786ca0d4e3da3c8aec2b36afd4e1c047f1111a5bf755d
--
-- THE INVERSE of `migrations/campaign/w1_v1_fixes_the_store_opens_the_envelope.sql`
-- (rule 27). It restores the prior state exactly: `custom._value_envelope()` back to the
-- body that file's own `-- based-on:` line names (sha256
-- b91076e6acb617269699701913421d3a34013302a6537b0da0d2db4603e738fd) - no door, no ceiling,
-- and the envelope opened only by a caller - `custom.size_refusal` gone, and the two ceiling
-- knobs gone from the register.
--
-- IT IS APPLIED AFTER `w1_v1_fixes_envelope_opens_over_fields_down.sql`, never instead of
-- it: that file superseded this one's trigger body, so the two inverses come off the stack
-- in the order they went on.
--
-- Branch-only: it DROPs and DELETEs, and schema `custom` does not exist on production.

set lock_timeout = '5s';
set statement_timeout = '300s';

delete from platform.feature_knob
 where feature = 'custom' and key in ('value_max_bytes', 'document_max_bytes');

CREATE OR REPLACE FUNCTION custom._value_envelope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_data     jsonb := coalesce(new.data, '{}'::jsonb);
  v_actor    text;
  v_obo      text;
  v_refusal  text;
begin
  -- Nothing to do for a document with no envelope and no declaration. This is the common
  -- path for every record written before VAL-1 and for every kernel row.
  if not (v_data ? '_values' or v_data ? '_sources' or v_data ? '_actor' or v_data ? '_on_behalf_of') then
    return new;
  end if;

  v_actor := custom.actor_word(v_data ->> '_actor');
  v_obo   := nullif(btrim(coalesce(v_data ->> '_on_behalf_of', '')), '');
  if v_obo is not null and v_actor <> 'agent' then
    raise exception 'This write says it is on behalf of somebody, and its author is a %. Only an agent acts on behalf of a person.', v_actor
      using errcode = '22023';
  end if;

  -- The declaration is a fact about the WRITE, not content of the record.
  v_data := v_data - '_actor' - '_on_behalf_of';

  v_data := custom.intern_provenance(v_data);
  v_data := custom.stamp_value_envelopes(v_data, v_actor, v_obo, now());
  v_data := custom.value_versions(case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end, v_data);

  v_refusal := custom.value_envelope_refusal(v_data);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '23514', hint = 'VAL-1..VAL-8: a value carries its source, its author, its reason for being missing and its other candidates, inside this record''s one document.';
  end if;

  new.data := v_data;
  return new;
end;
$function$;


drop function if exists custom.size_refusal(uuid, jsonb);
