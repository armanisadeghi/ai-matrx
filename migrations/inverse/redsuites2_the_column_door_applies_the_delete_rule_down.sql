-- chair-step: it restores `custom.field_update` to the body it had before RED-SUITES-2, in
--   which the settings arm silently discarded `on_target_delete` and `relation_target`. It
--   replaces one function body and nothing else; no row is deleted, no grant moves, no table
--   changes. It is the inverse half of
--   `migrations/campaign/redsuites2_the_column_door_applies_the_delete_rule.sql` and exists so
--   that file's up->inverse->up rehearsal can be run.
--
-- Running this re-opens a silent failure: the column editor's delete-rule and
-- change-the-table controls will answer "saved" and change nothing.

CREATE OR REPLACE FUNCTION custom.field_update(p_organization_id uuid, p_field_id uuid, p_patch jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_old       jsonb;
  v_table     uuid;
  v_next      jsonb;
  v_opts      uuid;
  v_word      text;
  v_spec      jsonb;
  v_was       text;
  v_now       text;
  v_behaviour boolean;
  v_compute_was text;
  v_compute_now text;
  v_parity    text;
  v_restamped integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.field_update');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_update');

  select r.data, (r.data ->> 'entity_definition_id')::uuid into v_old, v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_field_id
     and r.table_id = custom.field_kernel_id()
     and r.deleted_at is null;
  if v_old is null then
    raise exception 'There is no such field in this organization, so nothing was changed.'
      using errcode = '23514', hint = 'REC-29: organizations are hard walls.';
  end if;
  if v_table is not null then
    perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.field_update',
                                            'admin'::public.permission_level, 'table');
  end if;

  if nullif(p_patch ->> 'key', '') is not null and (p_patch ->> 'key') is distinct from (v_old ->> 'key') then
    raise exception 'A field''s key is how every saved value finds it, so it cannot be renamed.'
      using errcode = '23514', hint = 'The name a person reads is the label, and that can be changed freely.';
  end if;

  -- ── IS THIS A CHANGE OF BEHAVIOUR? T12. ───────────────────────────────────────────────
  -- Any of the three words a caller uses for it. The door used to refuse one of them and
  -- ignore the other two; it now carries all three out through the same function that shapes
  -- a field when it is created, so a column changed and a column created are the same shape.
  v_behaviour := coalesce(nullif(p_patch ->> 'parity_type', ''),
                          nullif(p_patch ->> 'plain', ''),
                          nullif(p_patch ->> 'type', '')) is not null;

  if v_behaviour then
    -- The spec is everything this field already is, with the patch written over it. The key
    -- and the table never move; `custom._field_document_for` decides the rest.
    v_spec := jsonb_strip_nulls(jsonb_build_object(
      'key',            v_old ->> 'key',
      'label',          coalesce(p_patch ->> 'label', v_old ->> 'label'),
      'multi',          coalesce(p_patch -> 'multi', v_old -> 'multi'),
      'dated',          coalesce(p_patch -> 'dated', v_old -> 'dated'),
      'required',       coalesce(p_patch -> 'required', v_old -> 'required'),
      'sort',           coalesce(p_patch -> 'sort', v_old -> 'sort'),
      'source',         coalesce(p_patch ->> 'source', v_old ->> 'source'),
      'source_config',  coalesce(p_patch -> 'source_config', v_old -> 'source_config'),
      'sensitivity',    coalesce(p_patch ->> 'sensitivity', v_old ->> 'sensitivity'),
      'context_policy', coalesce(p_patch ->> 'context_policy', v_old ->> 'context_policy'),
      'applies_to_types', coalesce(p_patch -> 'applies_to_types', v_old -> 'applies_to_types'),
      'depends_on',     coalesce(p_patch -> 'depends_on', v_old -> 'depends_on'),
      'unit',           coalesce(p_patch ->> 'unit', v_old ->> 'unit'),
      'expr',           coalesce(p_patch -> 'expr', v_old -> 'config' -> 'expr'),
      -- TAILS-2, 2026-09-21: WHEN a worked-out column works itself out is part of what the
      -- column IS, and this builder's fixed key list did not carry it — so a caller who
      -- retyped a formula and said `compute_on` got `custom._field_document_for`'s default
      -- ('read') and no word about it. It is carried now; a rollup still gets 'read', and
      -- that is said out loud rather than swallowed (see the settings arm below).
      'compute_on',     coalesce(nullif(p_patch ->> 'compute_on', ''), v_old ->> 'compute_on'),
      'on_target_delete', coalesce(p_patch ->> 'on_target_delete', v_old ->> 'on_target_delete'),
      'options_table_id', coalesce(p_patch ->> 'options_table_id', v_old -> 'config' ->> 'options_table_id'),
      'options',        p_patch -> 'options',
      'rules',          coalesce(p_patch -> 'rules', v_old -> 'rules')));
    -- The patch's own word for the behaviour, whichever of the three it used.
    if nullif(p_patch ->> 'parity_type', '') is not null then
      v_spec := v_spec || jsonb_build_object('parity_type', p_patch ->> 'parity_type');
    elsif nullif(p_patch ->> 'plain', '') is not null then
      v_spec := v_spec || jsonb_build_object('plain', p_patch ->> 'plain');
    else
      v_spec := v_spec || jsonb_build_object('type', p_patch ->> 'type');
    end if;

    v_next := custom._field_document_for(p_organization_id, v_table, v_spec);
    -- The key and the table are this field's identity and _field_document_for takes them from
    -- the spec; written again here so a spec that lost one cannot silently move a field.
    v_next := v_next || jsonb_build_object('key', v_old ->> 'key');
    -- SEAT-SUITES: a column that was indexed stays indexed when it changes what it holds,
    -- unless the patch says otherwise. `custom._field_document_for` builds a fresh document
    -- and knows nothing about either setting, so without this a retype silently un-promoted
    -- the column and the index went on standing for a shape that no longer exists.
    if coalesce(p_patch -> 'promoted', v_old -> 'promoted') is not null then
      v_next := v_next || jsonb_build_object('promoted', coalesce(p_patch -> 'promoted', v_old -> 'promoted'));
    end if;
    if coalesce(p_patch -> 'unique', v_old -> 'unique') is not null then
      v_next := v_next || jsonb_build_object('unique', coalesce(p_patch -> 'unique', v_old -> 'unique'));
    end if;
    if v_table is not null then
      v_next := v_next || jsonb_build_object('entity_definition_id', v_table::text);
    end if;

    v_was := custom.field_behaviour(v_old);
    v_now := custom.field_behaviour(v_next);

    -- THE CHOICES, if the new behaviour is a list and the caller typed some.
    if (v_next ->> 'type') = 'list'
       and nullif(v_next -> 'config' ->> 'options_table_id', '') is null
       and jsonb_typeof(p_patch -> 'options') = 'array'
       and jsonb_array_length(p_patch -> 'options') > 0 then
      v_opts := custom._options_table_for(p_organization_id, v_next ->> 'label', p_patch -> 'options');
      v_next := jsonb_set(v_next, '{config,options_table_id}', to_jsonb(v_opts::text));
    end if;

    -- ── RELATION-DECLARE, 2026-09-20: THE LINKS GO FIRST, THEN THE COLUMN CHANGES. ────
    -- Retyping a relation column to text left its edges LIVE in platform.associations, still
    -- naming a field that no longer behaves as a relation - and platform.relations_to then
    -- raised 23514 for EVERY record of the table it used to point at. One column took down
    -- the whole reverse side of another table. The links go in the same operation as the
    -- change that made them meaningless, softly, so REL-13's history keeps its record of them.
    if (v_old ->> 'type') = 'relation'
       and ((v_next ->> 'type') is distinct from 'relation'
            or (v_next ->> 'relation_target') is distinct from (v_old ->> 'relation_target')) then
      perform custom.relation_edges_withdraw(p_organization_id, array[p_field_id],
        case when (v_next ->> 'type') is distinct from 'relation'
             then format('"%s" no longer points at other records',
                         coalesce(v_next ->> 'label', v_next ->> 'key'))
             else format('"%s" now points at a different table',
                         coalesce(v_next ->> 'label', v_next ->> 'key')) end);
    end if;

    -- AND THE WRITE, which is what fires custom._field_type_converts_values: every value of
    -- this column is converted where it converts and kept in `_retired` with its reason where
    -- it does not, and the history.migration_log row is written by that same trigger. Nothing
    -- here duplicates any of it — this door's whole job was to let it happen.
    update custom.record
       set data = v_next, updated_at = now(), version = version + 1
     where organization_id = p_organization_id
       and id = p_field_id
       and table_id = custom.field_kernel_id();

    if v_was is not distinct from v_now then
      raise notice 'custom: "%" still behaves as %; its other settings were saved.',
        coalesce(v_next ->> 'label', v_next ->> 'key'), coalesce(v_now, 'before');
    end if;
    return p_field_id;
  end if;

  -- ── OTHERWISE: THE SETTINGS, exactly as before. ───────────────────────────────────────
  v_next := v_old;
  if p_patch ? 'label'          then v_next := jsonb_set(v_next, '{label}', to_jsonb(p_patch ->> 'label')); end if;
  if p_patch ? 'required'       then v_next := jsonb_set(v_next, '{required}', to_jsonb(coalesce((p_patch ->> 'required')::boolean, false))); end if;
  if p_patch ? 'dated'          then v_next := jsonb_set(v_next, '{dated}', to_jsonb(coalesce((p_patch ->> 'dated')::boolean, false))); end if;
  if p_patch ? 'sort'           then v_next := jsonb_set(v_next, '{sort}', to_jsonb(coalesce((p_patch ->> 'sort')::numeric, 100))); end if;
  if p_patch ? 'sensitivity'    then v_next := jsonb_set(v_next, '{sensitivity}', to_jsonb(p_patch ->> 'sensitivity')); end if;
  if p_patch ? 'context_policy' then v_next := jsonb_set(v_next, '{context_policy}', to_jsonb(p_patch ->> 'context_policy')); end if;
  if p_patch ? 'unit'           then v_next := jsonb_set(v_next, '{unit}', to_jsonb(p_patch ->> 'unit')); end if;

  -- ── FIX-7B-FIELD, 2026-09-20: THE SHAPE OF THE VALUE, WHICH IS A SETTING LIKE ANY OTHER. ──
  -- MEASURED on this database from the seat `authenticated`, before this migration: declare a
  -- relation column with `multi` false, call `custom.field_update(org, field, {"multi": true})`,
  -- read it back with `custom.read_record` — `multi=false, relation_max=1`. The door returned
  -- the field id, reported success and changed NOTHING. `multi` appeared exactly once in this
  -- body, inside the BEHAVIOUR arm above, which only runs when the patch also carries
  -- `parity_type`, `plain` or `type`. So the ONE control the roll-up panel's own refusal sends
  -- a person to — "Tick 'Can hold more than one' on Photos, or use Borrowed value to read its
  -- one value" — could not be reached by any door, from any client, at all. Same class as
  -- `promoted` / `unique` (SEAT-SUITES, 2026-09-19) and `source` / `review_interval_days`
  -- (ENRICH, 2026-09-20): a door that says yes and does nothing.
  --
  -- A LIST IS REFUSED BY NAME, NOT SILENTLY WRITTEN. For `select` and `multi_select`, "one
  -- answer or several" IS the behaviour — `custom._field_document_for` derives `multi` from the
  -- parity type and never from the caller — so writing `multi` on a list column here would put
  -- the document permanently at odds with its own `parity_type`, which is the silent failure
  -- again wearing the fix's clothes. The behaviour arm above already does this properly, and
  -- the refusal names the word to send it.
  if p_patch ? 'multi' then
    if (v_old ->> 'type') = 'list' then
      raise exception 'Whether "%" takes one answer or several IS what it holds, so it is changed by saying which kind it is.',
        coalesce(v_old ->> 'label', v_old ->> 'key')
        using errcode = '23514',
              hint = 'FLD-2: send parity_type "select" for one answer or "multi_select" for several; multi alone is not a setting on a list.';
    end if;
    v_next := jsonb_set(v_next, '{multi}', to_jsonb(coalesce((p_patch ->> 'multi')::boolean, false)));
  end if;
  -- REC-51: A RELATION'S CARDINALITY LIVES IN TWO KEYS AND BOTH MUST MOVE. `custom.validate_values`
  -- counts the links against `relation_max` and `custom.relation_declaration` calls the column
  -- "one" while that number is 1 — so `multi` true beside `relation_max` 1 is a column that ticks
  -- the box on screen and still refuses the second record. `custom._field_document_for` derives
  -- the same pair the same way when a column is created (1, or 25 when it holds several); a cap a
  -- caller had already widened past 25 is kept rather than narrowed, and an explicit
  -- `relation_max` in the patch always wins.
  if (v_next ->> 'type') = 'relation' and (p_patch ? 'multi' or p_patch ? 'relation_max') then
    v_next := jsonb_set(v_next, '{relation_max}', to_jsonb(greatest(1, coalesce(
      nullif(p_patch ->> 'relation_max', '')::integer,
      case when coalesce((v_next ->> 'multi')::boolean, false)
           then greatest(coalesce((v_old ->> 'relation_max')::integer, 1), 25)
           else 1 end))));
  end if;
  -- ── ENRICH, 2026-09-20: THE THREE SETTINGS THAT MADE AGT-6 UNREACHABLE. ───────────────
  -- `source`, `source_config` and `review_interval_days` are keys the Field document has
  -- always carried and this door has never had an arm for. So `custom.field_update(field,
  -- {"source":"agent","review_interval_days":30})` returned the field id, reported success
  -- and changed NOTHING - and no person and no agent could declare an enrichment on an
  -- existing column through any door at all. That is the measured state behind AGT-6's own
  -- "zero readers and zero writers", and it is the same class as `promoted` / `unique`,
  -- which SEAT-SUITES closed on 2026-09-19.
  --
  -- A column a MODEL owns is not an ordinary setting, so the arm does not simply write the
  -- word: `source = 'agent'` is handed to custom.enrich_normalize, the ONE judge of an
  -- enrichment, exactly as custom.enrich_declare does. There is therefore no way into
  -- "a model fills this in" that skips the judging - not a door, not a script, not a lane.
  if p_patch ? 'review_interval_days' then
    if jsonb_typeof(p_patch -> 'review_interval_days') = 'null' then
      v_next := v_next - 'review_interval_days';
    else
      v_next := jsonb_set(v_next, '{review_interval_days}',
                          to_jsonb((p_patch ->> 'review_interval_days')::integer));
    end if;
  end if;
  if p_patch ? 'source' or p_patch ? 'source_config' then
    v_next := jsonb_set(v_next, '{source}',
                        to_jsonb(coalesce(nullif(p_patch ->> 'source', ''), v_next ->> 'source', 'manual')));
    v_next := jsonb_set(v_next, '{source_config}',
                        coalesce(p_patch -> 'source_config', v_next -> 'source_config', '{}'::jsonb));
    if (v_next ->> 'source') = 'agent' then
      v_next := jsonb_set(v_next, '{source_config}',
                  custom.enrich_normalize(p_organization_id, v_table, v_next ->> 'key',
                    coalesce(v_next -> 'source_config', '{}'::jsonb)
                    || jsonb_strip_nulls(jsonb_build_object('review_interval_days',
                         v_next -> 'review_interval_days'))));
      -- The two copies of freshness cannot disagree: the Field's own key is the one AGT-6
      -- names, and the judged config is what the runner reads, so the judge decides both.
      if (v_next -> 'source_config' -> 'review_interval_days') is not null then
        v_next := jsonb_set(v_next, '{review_interval_days}',
                            v_next -> 'source_config' -> 'review_interval_days');
      else
        v_next := v_next - 'review_interval_days';
      end if;
    end if;
  end if;
  -- SEAT-SUITES: THE TWO SETTINGS THIS DOOR ACCEPTED AND THREW AWAY. `custom.promote_field`
  -- reads `promoted` and `unique` off the Field document to decide whether to build an index
  -- and whether it is a unique one. Neither had an arm here, so `custom.field_update(field,
  -- {"promoted":true,"unique":true})` returned the field id, reported success and changed
  -- nothing — and no person could ever ask for an indexed or a unique column through any
  -- door. Measured from the seat `authenticated` on the main database, 2026-09-19:
  -- promote_field answered `"unique": false` after the door said yes. Same class as T12,
  -- which STORE-T closed for `plain` and `type`; these are the last two.
  if p_patch ? 'promoted'       then v_next := jsonb_set(v_next, '{promoted}', to_jsonb(coalesce((p_patch ->> 'promoted')::boolean, false))); end if;
  if p_patch ? 'unique'         then v_next := jsonb_set(v_next, '{unique}', to_jsonb(coalesce((p_patch ->> 'unique')::boolean, false))); end if;
  if p_patch ? 'rules'          then v_next := jsonb_set(v_next, '{rules}', coalesce(p_patch -> 'rules', '[]'::jsonb)); end if;
  -- ── lane RELATION-DISPLAY, 2026-09-21: WHICH OF THE OTHER RECORD''S COLUMNS THIS ONE
  --    SHOWS. The same judge the create door uses (custom._display_spec_for), so a spec
  --    cannot be looser here than it was there, and an explicit null REMOVES it - the
  --    column goes back to whatever the table it points at is titled by.
  if p_patch ? 'display' then
    if (v_next ->> 'type') is distinct from 'relation' then
      raise exception 'Only a column that points at other records can say which of their columns to show, and "%" does not point at any.',
          coalesce(nullif(v_next ->> 'label', ''), nullif(v_next ->> 'key', ''), 'this column')
        using errcode = '23514',
              hint = 'REL-DISP: retype it to a column that points at another table first, or leave display out. Nothing was changed.';
    end if;
    if jsonb_typeof(p_patch -> 'display') = 'null' then
      v_next := v_next - 'display';
    else
      v_next := jsonb_set(v_next, '{display}',
                  coalesce(custom._display_spec_for(p_organization_id,
                             nullif(v_next ->> 'relation_target', '')::uuid,
                             p_patch -> 'display'), 'null'::jsonb));
      if jsonb_typeof(v_next -> 'display') = 'null' then v_next := v_next - 'display'; end if;
    end if;
  end if;
  -- STORE-T / T7: the dependency list is a SETTING of a worked-out column, and a door that
  -- could not change it could not fix a formula that reads the wrong column either.
  if p_patch ? 'depends_on'     then v_next := jsonb_set(v_next, '{depends_on}',
                                       case when jsonb_typeof(p_patch -> 'depends_on') = 'array'
                                            then p_patch -> 'depends_on' else '[]'::jsonb end); end if;

  -- THE CHOICES, EDITED WHERE THEY WERE TYPED (unchanged).
  if jsonb_typeof(p_patch -> 'options') = 'array' and (v_old ->> 'type') = 'list' then
    v_opts := nullif(v_old -> 'config' ->> 'options_table_id', '')::uuid;
    if v_opts is null then
      v_opts := custom._options_table_for(p_organization_id, v_next ->> 'label', p_patch -> 'options');
      v_next := jsonb_set(v_next, '{config,options_table_id}', to_jsonb(v_opts::text));
    else
      update custom.record o
         set deleted_at = now()
       where o.organization_id = p_organization_id
         and o.table_id = v_opts
         and o.deleted_at is null
         and not exists (select 1 from jsonb_array_elements_text(p_patch -> 'options') w
                          where btrim(w.value) = (o.data ->> 'title'));
      for v_word in select btrim(value) from jsonb_array_elements_text(p_patch -> 'options') loop
        if v_word <> '' and not exists (
             select 1 from custom.record o
              where o.organization_id = p_organization_id and o.table_id = v_opts
                and o.deleted_at is null and o.data ->> 'title' = v_word) then
          insert into custom.record (organization_id, table_id, data)
          values (p_organization_id, v_opts, jsonb_build_object('title', v_word));
        end if;
      end loop;
    end if;
  end if;

  -- ── TAILS-2, 2026-09-21: WHEN IT WORKS ITSELF OUT, WHICH THIS DOOR WAS TOLD AND IGNORED. ──
  -- MEASURED (lane SHARE-OUT, 2026-09-20): the settings arm's key list has never carried
  -- `compute_on`, so `custom.field_update(org, field, {"compute_on":"write"})` returned the
  -- field id, reported success and left the column working itself out on every read forever.
  -- A door that is told something and answers yes without doing it is the silent failure this
  -- campaign exists to end — same class as `promoted`/`unique`, `multi`, `source`.
  --
  -- THE ANSWER IS TO APPLY IT, not to refuse it: `custom._derived_fields` already stamps a
  -- `write` formula into `_derived` on every save and `custom.derived_values_of` already works
  -- a `read` one out on every read. The only cases that CANNOT be applied are refused BY NAME,
  -- with the way to change them, because "it is not a formula" and "a rollup is always read"
  -- are answers a person can act on.
  if p_patch ? 'compute_on' then
    v_parity := custom.parity_type(v_old);
    v_compute_was := nullif(v_old ->> 'compute_on', '');
    v_compute_now := nullif(btrim(coalesce(p_patch ->> 'compute_on', '')), '');
    if v_compute_now is null or v_compute_now not in ('read', 'write') then
      raise exception 'A column either works its answer out when somebody reads it or when somebody saves it, and "%" is neither.',
        coalesce(p_patch ->> 'compute_on', 'nothing')
        using errcode = '23514', hint = 'FLD-9: send compute_on as "read" or as "write".';
    end if;
    if coalesce(v_old ->> 'type', '') <> 'formula' and coalesce(v_old ->> 'source', '') <> 'formula' then
      raise exception '"%" is not worked out by the store, so there is no moment for it to be worked out at.',
        coalesce(v_old ->> 'label', v_old ->> 'key')
        using errcode = '23514',
              hint = 'FLD-9: make it a worked-out column first — send type "formula" (with expr), "lookup" or "rollup" to this same door — and then say compute_on.';
    end if;
    if v_parity = 'rollup' and v_compute_now = 'write' then
      raise exception 'A roll-up adds up other records, so an answer stamped when "%" was last saved would be wrong the moment one of them changed. It is worked out when somebody reads it, always.',
        coalesce(v_old ->> 'label', v_old ->> 'key')
        using errcode = '23514',
              hint = 'FLD-11: to stamp a number at save time, make this column a formula over its own record''s columns (send type "formula" with an expr) — a roll-up cannot be one.';
    end if;
    v_next := jsonb_set(v_next, '{compute_on}', to_jsonb(v_compute_now));
  end if;

  update custom.record
     set data = v_next, updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_field_id
     and table_id = custom.field_kernel_id();

  -- ── AND THE ANSWERS THAT ARE ALREADY OUT THERE MOVE WITH IT. ────────────────────────────
  -- `_derived` is written by the save path and by nothing else, so a column switched to
  -- `write` would hold NO stamped answer on any record until each one happened to be saved
  -- again — a column that reads empty on every existing row and full on every new one, with
  -- nothing on the screen saying why. Switching the other way leaves a stale stamp behind
  -- that `custom.computed_provenance` would keep reporting as a fact about this column.
  -- Both are closed here, through the ordinary write path, so every guard and every history
  -- row sees the change exactly as it sees a save.
  if v_table is not null and v_compute_now is not null and v_compute_now is distinct from v_compute_was then
    if v_compute_now = 'write' then
      update custom.record r
         set updated_at = now()
       where r.organization_id = p_organization_id
         and r.table_id = v_table
         and r.deleted_at is null
         and r.data_class = 'record';
      get diagnostics v_restamped = row_count;
    else
      update custom.record r
         set data = jsonb_set(r.data, '{_derived}', (r.data -> '_derived') - (v_old ->> 'key')),
             updated_at = now()
       where r.organization_id = p_organization_id
         and r.table_id = v_table
         and r.deleted_at is null
         and r.data_class = 'record'
         and (r.data -> '_derived') ? (v_old ->> 'key');
      get diagnostics v_restamped = row_count;
    end if;
    raise notice 'custom: "%" is now worked out on %, and % record(s) were brought with it.',
      coalesce(v_next ->> 'label', v_next ->> 'key'), v_compute_now, v_restamped;
  end if;

  return p_field_id;
end;
$function$


