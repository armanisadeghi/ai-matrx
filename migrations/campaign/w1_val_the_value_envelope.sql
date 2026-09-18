-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.record_values(uuid,uuid) b6eba0d0585e8e8bd42fd6acd90d39354630b4018c67d2a1d44953e22d12a524
-- based-on: custom._record_field_validation() a7ac84e16bbfb4bc949f5e6129c2891f29d769ed55f48090b8719fe09d535c1b
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
-- W1-VAL — THE VALUE ENVELOPE, inside the record's ONE jsonb document.
--          VAL-1 · VAL-2 · VAL-3 · VAL-4 · VAL-5 · VAL-6 · VAL-7 · VAL-8.
--
-- THE RULINGS THIS FILE EXECUTES (build log 2026-09-17 17:10 UTC, rules 23 and 28)
-- -------------------------------------------------------------------------------
-- (a) VAL-3 vs D-3: an alternate is exactly {value, src, rank} — a RANK, never a
--     confidence, score, probability or weight. The envelope law REFUSES any other key
--     inside an alternate, by name. D-3's escape stands: an organization that wants a
--     confidence number declares a plain Field for it.
-- (b) VAL-7: "every value's provenance is queryable" binds every Value in `custom.record`
--     from its first write, and does NOT bind `history.row_versions`' NULL-`actor_tier`
--     rows — History's store is this lane's `must not touch` and a NULL tier reads as
--     human and is never backfilled. The residue is W3-HIST's, and it is named, not implied.
-- (c) VAL-9 is NOT executed here. Schema `custom` speaks `user · agent · system` in the
--     columns from birth — `custom.record` carries no `*_by_tier` column at all, so
--     `platform._stamp_actor_tier` is column-guarded and inert on it — and the
--     widen/flip/backfill/narrow pass over the nine carrying columns and History's
--     thirty partitions is forbidden to this row by its own `must not touch` cell, by
--     rules 4 and 9, and by tonight being branch-only. What this file does instead is
--     TRANSLATE at the one door: `human→user`, `ai→agent`, `code→system`, with the three
--     retired words refused by name and the replacement printed.
--
-- WHY THE ENVELOPE IS A SIDECAR AND NOT A WRAPPER
-- ----------------------------------------------
-- REC-36 says one jsonb document per record and VAL-4 says alternates live INSIDE it,
-- never a row per value. The document's shape today is a FLAT `key → value` map, read that
-- way by `custom.validate_values`, by `custom.record_values`, by `custom.table_type_field`
-- and by every projection `W1-TABLE` and `W1-FIELD` built (`custom."table"`, `custom.home`,
-- `custom.field`, `custom.merge_field`, `custom.rule`). Wrapping every value in an object
-- would have rewritten all of them. So the value stays exactly where it is and the envelope
-- rides beside it under reserved keys, the convention `_computed` and `_retired` already
-- established in this store:
--
--   {
--     "phone": "+1-415-555-0101",              <- the surviving Value. Every existing reader.
--     "_values": {
--       "phone": {
--         "ver": 1,                            <- VAL-7 / DYN-8: the per-Value version id.
--         "src": "s1",                         <- VAL-1: the provenance POINTER.
--         "actor": "user",                     <- VAL-8: user | agent | system.
--         "on_behalf_of": null,                <- carried for an agent write only.
--         "at": "2026-09-17T17:00:00Z",
--         "absent": null,                      <- VAL-2: or one of the four words.
--         "alternates": [                      <- VAL-3 / VAL-4: ranked, in THIS document.
--           {"value": "+1-415-555-0102", "src": "s2", "rank": 2}
--         ]
--       }
--     },
--     "_sources": {                            <- VAL-1: interned ONCE PER SAVE.
--       "s1": {"kind": "practitioner_record", "system": "Meridian Health"},
--       "s2": {"kind": "employee_record", "system": "Vantage HR"}
--     }
--   }
--
-- INTERNED means interned: ten Values citing one source hold ten pointers and ONE
-- descriptor, and `custom.intern_provenance` finds the existing pointer by jsonb equality
-- rather than minting a second. The law refuses two pointers holding the same descriptor,
-- so the interning is enforced and not merely performed.
--
-- WHY VAL-5 AND VAL-6 ARE A REFUSAL AND NOT A COLUMN
-- -------------------------------------------------
-- Visibility and Access are per Field and per Record, never per Value. The enforceable form
-- of that sentence is that the envelope has a CLOSED key set, so `visibility`, `access`,
-- `share`, `acl`, `permission`, `permissions` and `secret` are refused inside it — the first
-- seven by name, with VAL-6's remedy printed: a Value that must be secret goes in a
-- contained record with its own visibility. `custom.record.visibility` (per record) and the
-- Field's own `sensitivity` (per field, `W1-FIELD`) are where those words already live.
--
-- WHERE EACH RULE IS ENFORCED, AND WHY THERE ARE THREE PLACES FOR ONE IMPLEMENTATION
-- ---------------------------------------------------------------------------------
--   `custom.value_envelope_refusal(jsonb)`  the ONE implementation of the law. Returns the
--                                           refusal sentence, or null.
--   trigger `_value_envelope`               normalises (actor, stamp, intern, version) and
--                                           then RAISES that sentence. Named with a leading
--                                           underscore deliberately: triggers fire in name
--                                           order, and this must run before every
--                                           `custom_record_*` guard and after
--                                           `platform._stamp_actor`.
--   constraint `record_value_envelope`      `custom.value_envelope_ok(data)`, which is that
--                                           same function `is null`. A trigger can be turned
--                                           off by `ALTER TABLE … DISABLE TRIGGER`; a CHECK
--                                           cannot, and it also covers the kernel and
--                                           relation rows where the validation trigger
--                                           early-returns. NOT VALID, so the statement is an
--                                           enumerated additive shape at `--target production`.
--
-- A FORGED VERSION IS IMPOSSIBLE RATHER THAN REFUSED. The trigger recomputes every `ver`
-- from the OLD row on every write, so nothing a caller puts in `ver` survives; `actor`,
-- `on_behalf_of` and `at` are likewise stamped from the write's own declaration, never read
-- from the document. That is what makes a read-modify-write safe: a caller may send the
-- whole document back, including the stamps it read, and get the truth of THIS write.
--
-- THE INVERSE: `migrations/inverse/w1_val_the_value_envelope_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. THE VOCABULARIES, each in exactly one place
-- ═══════════════════════════════════════════════════════════════════════════════

-- VAL-2. The four words, VERBATIM from the contract row. No coining, no renaming: the row
-- reads "never asked, none, refused, conflicting" and so does this array.
create function custom.absence_reasons()
  returns text[] language sql immutable set search_path to 'pg_catalog' as $$
  select array['never asked', 'none', 'refused', 'conflicting']::text[];
$$;

comment on function custom.absence_reasons() is
  'VAL-2: a Value''s reason for absence. The four words verbatim from the contract row.';

-- VAL-8. The actor vocabulary, and nothing else.
create function custom.actor_vocabulary()
  returns text[] language sql immutable set search_path to 'pg_catalog' as $$
  select array['user', 'agent', 'system']::text[];
$$;

comment on function custom.actor_vocabulary() is
  'VAL-8: the actor vocabulary user, agent, system, enforced at the write door.';

-- VAL-9 (c). The retired triple and what each becomes, so the refusal can print the
-- replacement instead of a list. This is the whole of VAL-9 that is this lane''s: a
-- translation at one door, never a second vocabulary.
create function custom.retired_actor_words()
  returns jsonb language sql immutable set search_path to 'pg_catalog' as $$
  select jsonb_build_object('human', 'user', 'ai', 'agent', 'code', 'system');
$$;

comment on function custom.retired_actor_words() is
  'VAL-9 as this lane holds it: platform.actor_tier()''s live triple mapped to the store''s own. human->user, ai->agent, code->system.';

-- The CLOSED key sets. VAL-5 and VAL-6 are enforced by closing these, not by adding a column.
create function custom.value_envelope_keys()
  returns text[] language sql immutable set search_path to 'pg_catalog' as $$
  select array['ver', 'src', 'actor', 'on_behalf_of', 'at', 'absent', 'alternates']::text[];
$$;

create function custom.value_alternate_keys()
  returns text[] language sql immutable set search_path to 'pg_catalog' as $$
  select array['value', 'src', 'rank']::text[];
$$;

comment on function custom.value_alternate_keys() is
  'VAL-3 under ruling (a): an alternate is a value, a source and a RANK. Never a confidence, score, probability or weight — D-3 stays deferred and its escape is a plain Field.';

-- The seven words that mean "somebody tried to put access on a Value".
create function custom.per_value_access_words()
  returns text[] language sql immutable set search_path to 'pg_catalog' as $$
  select array['visibility', 'access', 'share', 'acl', 'permission', 'permissions', 'secret']::text[];
$$;

comment on function custom.per_value_access_words() is
  'VAL-5/VAL-6: refused inside a value envelope by name, with the contained-record remedy printed.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. THE LAW — one implementation, read by the trigger and by the CHECK
-- ═══════════════════════════════════════════════════════════════════════════════

create function custom.value_envelope_refusal(p_data jsonb)
  returns text language plpgsql immutable set search_path to 'pg_catalog' as $$
declare
  v_values  jsonb;
  v_sources jsonb;
  v_key     text;
  v_env     jsonb;
  v_k       text;
  v_alt     jsonb;
  v_ranks   int[];
  v_ptr     text;
  v_absent  text;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return null;                      -- the column's own NOT NULL and default cover this.
  end if;

  -- ── _sources: the interned provenance table ──────────────────────────────────
  if p_data ? '_sources' then
    v_sources := p_data -> '_sources';
    if jsonb_typeof(v_sources) <> 'object' then
      return 'this record''s provenance block (_sources) must be an object of pointer -> source, and it is a '
             || jsonb_typeof(v_sources) || '.';
    end if;
    for v_ptr in select k from jsonb_object_keys(v_sources) k loop
      if v_ptr !~ '^s[0-9]+$' then
        return format('"%s" is not a provenance pointer. A pointer is interned by this store and looks like s1, s2, s3 — it is never a name a writer chooses.', v_ptr);
      end if;
      if jsonb_typeof(v_sources -> v_ptr) <> 'object' then
        return format('the source at %s must be an object describing where the value came from, and it is a %s.', v_ptr, jsonb_typeof(v_sources -> v_ptr));
      end if;
    end loop;
    -- VAL-1: INTERNED ONCE PER SAVE. Two pointers holding the same description is the
    -- defect the word "interned" exists to prevent, so it is refused rather than tolerated.
    if (select count(*) from (select distinct v.value from jsonb_each(v_sources) v) d)
       <> (select count(*) from jsonb_object_keys(v_sources) k) then
      return 'the same source is written twice in this record''s provenance block. A source is interned once per save and every value that came from it points at the one entry.';
    end if;
  else
    v_sources := '{}'::jsonb;
  end if;

  if not (p_data ? '_values') then
    return null;
  end if;

  v_values := p_data -> '_values';
  if jsonb_typeof(v_values) <> 'object' then
    return 'this record''s value block (_values) must be an object of field key -> envelope, and it is a '
           || jsonb_typeof(v_values) || '.';
  end if;

  for v_key, v_env in select * from jsonb_each(v_values) loop
    if jsonb_typeof(v_env) <> 'object' then
      return format('the envelope for %s must be an object, and it is a %s.', v_key, jsonb_typeof(v_env));
    end if;

    -- ── the CLOSED key set, which is where VAL-5 and VAL-6 are enforced ────────
    for v_k in select k from jsonb_object_keys(v_env) k loop
      if not (v_k = any (custom.value_envelope_keys())) then
        if v_k = any (custom.per_value_access_words()) then
          return format('%s cannot carry "%s": visibility and access belong to a Field and to a Record, never to a single value. A value that must be secret goes in a contained record with its own visibility.', v_key, v_k);
        end if;
        return format('%s carries "%s", which is not part of a value envelope. An envelope holds %s.', v_key, v_k, array_to_string(custom.value_envelope_keys(), ', '));
      end if;
    end loop;

    -- ── ver: the per-Value version id, VAL-7 / DYN-8 ───────────────────────────
    if not (v_env ? 'ver') or jsonb_typeof(v_env -> 'ver') <> 'number'
       or (v_env -> 'ver')::text !~ '^[0-9]+$' or (v_env ->> 'ver')::numeric < 1 then
      return format('%s must carry a whole version number of 1 or more, and this store writes it — no caller sets it.', v_key);
    end if;

    -- ── actor: VAL-8 ───────────────────────────────────────────────────────────
    if not (v_env ? 'actor') or jsonb_typeof(v_env -> 'actor') <> 'string'
       or not ((v_env ->> 'actor') = any (custom.actor_vocabulary())) then
      return format('%s must name who wrote it, and the vocabulary is exactly %s.', v_key,
                    array_to_string(custom.actor_vocabulary(), ', '));
    end if;

    if v_env ? 'on_behalf_of' and jsonb_typeof(v_env -> 'on_behalf_of') <> 'null' then
      if (v_env ->> 'actor') <> 'agent' then
        return format('%s says it was written on behalf of somebody, but its author is a %s. Only an agent acts on behalf of a person.', v_key, v_env ->> 'actor');
      end if;
      if jsonb_typeof(v_env -> 'on_behalf_of') <> 'string' then
        return format('%s: on behalf of whom is a person''s id, and it is a %s.', v_key, jsonb_typeof(v_env -> 'on_behalf_of'));
      end if;
    end if;

    if v_env ? 'at' and jsonb_typeof(v_env -> 'at') <> 'string' then
      return format('%s: the time it was written must be a timestamp, and it is a %s.', v_key, jsonb_typeof(v_env -> 'at'));
    end if;

    -- ── absent: VAL-2, all four words, each distinguishable ────────────────────
    if v_env ? 'absent' and jsonb_typeof(v_env -> 'absent') <> 'null' then
      v_absent := v_env ->> 'absent';
      if not (v_absent = any (custom.absence_reasons())) then
        return format('%s: "%s" is not a reason a value can be missing. The reasons are %s.', v_key, v_absent,
                      array_to_string(custom.absence_reasons(), ', '));
      end if;
      if p_data ? v_key and jsonb_typeof(p_data -> v_key) <> 'null' then
        return format('%s both holds a value and says why it is missing ("%s"). It can be one or the other.', v_key, v_absent);
      end if;
    end if;

    -- ── src: the pointer must RESOLVE, or interning is a decoration ────────────
    if v_env ? 'src' and jsonb_typeof(v_env -> 'src') <> 'null' then
      if jsonb_typeof(v_env -> 'src') <> 'string' then
        return format('%s: its source must be a provenance pointer this store interned. Write the source itself and the store interns it; %s is not a pointer.', v_key, jsonb_typeof(v_env -> 'src'));
      end if;
      if not (v_sources ? (v_env ->> 'src')) then
        return format('%s points at the source %s, and this record''s provenance block has no such entry.', v_key, v_env ->> 'src');
      end if;
    end if;

    -- ── alternates: VAL-3 and VAL-4 ────────────────────────────────────────────
    if v_env ? 'alternates' and jsonb_typeof(v_env -> 'alternates') <> 'null' then
      if jsonb_typeof(v_env -> 'alternates') <> 'array' then
        return format('%s: its other candidate values must be a list, and it is a %s.', v_key, jsonb_typeof(v_env -> 'alternates'));
      end if;
      v_ranks := array[]::int[];
      for v_alt in select value from jsonb_array_elements(v_env -> 'alternates') loop
        if jsonb_typeof(v_alt) <> 'object' then
          return format('%s: every other candidate is a value, a source and a rank, and one of them is a %s.', v_key, jsonb_typeof(v_alt));
        end if;
        for v_k in select k from jsonb_object_keys(v_alt) k loop
          if not (v_k = any (custom.value_alternate_keys())) then
            if v_k = any (custom.per_value_access_words()) then
              return format('%s: an alternate cannot carry "%s" — visibility and access belong to a Field and to a Record, never to a single value.', v_key, v_k);
            end if;
            return format('%s: an alternate carries "%s", which is not part of one. An alternate holds %s — a rank, which is the order an organization''s sources are trusted in, and never a score or a confidence a machine invented.', v_key, v_k, array_to_string(custom.value_alternate_keys(), ', '));
          end if;
        end loop;
        if not (v_alt ? 'value') then
          return format('%s: an alternate with no value is not a candidate for anything.', v_key);
        end if;
        if not (v_alt ? 'rank') or jsonb_typeof(v_alt -> 'rank') <> 'number'
           or (v_alt -> 'rank')::text !~ '^[0-9]+$' or (v_alt ->> 'rank')::numeric < 1 then
          return format('%s: every alternate carries a whole rank of 1 or more — the order its source is trusted in.', v_key);
        end if;
        if (v_alt ->> 'rank')::int = any (v_ranks) then
          return format('%s: two alternates claim rank %s. A rank is an order, so it is held by one candidate.', v_key, v_alt ->> 'rank');
        end if;
        v_ranks := v_ranks || (v_alt ->> 'rank')::int;
        if v_alt ? 'src' and jsonb_typeof(v_alt -> 'src') <> 'null' then
          if jsonb_typeof(v_alt -> 'src') <> 'string' then
            return format('%s: an alternate''s source must be a provenance pointer this store interned, and it is a %s.', v_key, jsonb_typeof(v_alt -> 'src'));
          end if;
          if not (v_sources ? (v_alt ->> 'src')) then
            return format('%s: an alternate points at the source %s, and this record''s provenance block has no such entry.', v_key, v_alt ->> 'src');
          end if;
        end if;
      end loop;
    end if;
  end loop;

  return null;
end;
$$;

comment on function custom.value_envelope_refusal(jsonb) is
  'VAL-1..VAL-8: the value envelope''s whole law, in one implementation. Returns the sentence a person should read, or null. The trigger _value_envelope raises it; the CHECK constraint record_value_envelope reads it through custom.value_envelope_ok.';

create function custom.value_envelope_ok(p_data jsonb)
  returns boolean language sql immutable set search_path to 'pg_catalog' as $$
  select custom.value_envelope_refusal(p_data) is null;
$$;

comment on function custom.value_envelope_ok(jsonb) is
  'The CHECK half of custom.value_envelope_refusal. A trigger can be disabled; a CHECK cannot, and this one also covers the kernel and relation rows where the validation trigger early-returns.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. INTERNING — VAL-1's "once per save", as a function and not as a hope
-- ═══════════════════════════════════════════════════════════════════════════════

create function custom.source_pointer(p_sources jsonb, p_source jsonb)
  returns text language sql immutable set search_path to 'pg_catalog' as $$
  select e.key
    from jsonb_each(coalesce(p_sources, '{}'::jsonb)) e
   where e.value = p_source
   limit 1;
$$;

comment on function custom.source_pointer(jsonb, jsonb) is
  'The pointer this record already holds for a source description, by jsonb equality (which is key-order independent), or null. This is what makes interning idempotent.';

create function custom.source_next_pointer(p_sources jsonb)
  returns text language sql immutable set search_path to 'pg_catalog' as $$
  select 's' || (coalesce(max(substring(k from 2)::int), 0) + 1)::text
    from jsonb_object_keys(coalesce(p_sources, '{}'::jsonb)) k
   where k ~ '^s[0-9]+$';
$$;

create function custom.intern_provenance(p_data jsonb)
  returns jsonb language plpgsql immutable set search_path to 'pg_catalog' as $$
declare
  v_sources jsonb := coalesce(p_data -> '_sources', '{}'::jsonb);
  v_values  jsonb;
  v_out     jsonb := '{}'::jsonb;
  v_key     text;
  v_env     jsonb;
  v_alts    jsonb;
  v_alt     jsonb;
  v_ptr     text;
begin
  if p_data is null or jsonb_typeof(p_data -> '_values') <> 'object' then
    return p_data;
  end if;
  if jsonb_typeof(v_sources) <> 'object' then
    return p_data;             -- a malformed block is the law's to refuse, not this one's to repair.
  end if;
  v_values := p_data -> '_values';

  for v_key, v_env in select * from jsonb_each(v_values) loop
    if jsonb_typeof(v_env) <> 'object' then
      v_out := v_out || jsonb_build_object(v_key, v_env);
      continue;
    end if;

    -- A writer names the SOURCE; this store hands back a pointer. An inline object is the
    -- ergonomic half of VAL-1 and the only reason a caller never has to know a pointer exists.
    if jsonb_typeof(v_env -> 'src') = 'object' then
      v_ptr := custom.source_pointer(v_sources, v_env -> 'src');
      if v_ptr is null then
        v_ptr := custom.source_next_pointer(v_sources);
        v_sources := jsonb_set(v_sources, array[v_ptr], v_env -> 'src');
      end if;
      v_env := jsonb_set(v_env, '{src}', to_jsonb(v_ptr));
    end if;

    if jsonb_typeof(v_env -> 'alternates') = 'array' then
      v_alts := '[]'::jsonb;
      for v_alt in select value from jsonb_array_elements(v_env -> 'alternates') loop
        if jsonb_typeof(v_alt) = 'object' and jsonb_typeof(v_alt -> 'src') = 'object' then
          v_ptr := custom.source_pointer(v_sources, v_alt -> 'src');
          if v_ptr is null then
            v_ptr := custom.source_next_pointer(v_sources);
            v_sources := jsonb_set(v_sources, array[v_ptr], v_alt -> 'src');
          end if;
          v_alt := jsonb_set(v_alt, '{src}', to_jsonb(v_ptr));
        end if;
        v_alts := v_alts || jsonb_build_array(v_alt);
      end loop;
      v_env := jsonb_set(v_env, '{alternates}', v_alts);
    end if;

    v_out := v_out || jsonb_build_object(v_key, v_env);
  end loop;

  p_data := jsonb_set(p_data, '{_values}', v_out);
  if v_sources = '{}'::jsonb then
    return p_data - '_sources';
  end if;
  return jsonb_set(p_data, '{_sources}', v_sources);
end;
$$;

comment on function custom.intern_provenance(jsonb) is
  'VAL-1: a source written inline on a value becomes a 28-byte pointer plus ONE entry in the record''s _sources block, however many values cite it. Idempotent: interning an already-interned document changes nothing.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. THE STAMP AND THE VERSION — both computed, never accepted
-- ═══════════════════════════════════════════════════════════════════════════════

create function custom.stamp_value_envelopes(p_data jsonb, p_actor text, p_on_behalf_of text, p_at timestamptz)
  returns jsonb language plpgsql immutable set search_path to 'pg_catalog' as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_env jsonb;
begin
  if p_data is null or jsonb_typeof(p_data -> '_values') <> 'object' then
    return p_data;
  end if;
  for v_key, v_env in select * from jsonb_each(p_data -> '_values') loop
    if jsonb_typeof(v_env) = 'object' then
      v_env := v_env
               || jsonb_build_object('actor', p_actor)
               || jsonb_build_object('on_behalf_of', to_jsonb(p_on_behalf_of))
               || jsonb_build_object('at', to_jsonb(p_at));
    end if;
    v_out := v_out || jsonb_build_object(v_key, v_env);
  end loop;
  return jsonb_set(p_data, '{_values}', v_out);
end;
$$;

comment on function custom.stamp_value_envelopes(jsonb, text, text, timestamptz) is
  'VAL-7/VAL-8: who wrote each value, on whose behalf, and when — taken from the WRITE and never from the document, so no caller can choose an author (the same law platform._stamp_actor holds over created_by).';

create function custom.value_versions(p_old jsonb, p_new jsonb)
  returns jsonb language plpgsql immutable set search_path to 'pg_catalog' as $$
declare
  v_out   jsonb := '{}'::jsonb;
  v_key   text;
  v_env   jsonb;
  v_prior jsonb;
  v_ver   integer;
begin
  if p_new is null or jsonb_typeof(p_new -> '_values') <> 'object' then
    return p_new;
  end if;
  for v_key, v_env in select * from jsonb_each(p_new -> '_values') loop
    if jsonb_typeof(v_env) <> 'object' then
      v_out := v_out || jsonb_build_object(v_key, v_env);
      continue;
    end if;
    v_prior := coalesce(p_old, '{}'::jsonb) -> '_values' -> v_key;
    if v_prior is null or jsonb_typeof(v_prior) <> 'object' then
      v_ver := 1;
    elsif ((p_new -> v_key) is distinct from (coalesce(p_old, '{}'::jsonb) -> v_key))
       or ((v_env - 'ver' - 'at' - 'actor' - 'on_behalf_of')
            is distinct from (v_prior - 'ver' - 'at' - 'actor' - 'on_behalf_of')) then
      -- The VALUE moved, or its source, its reason for absence or its alternates did.
      v_ver := coalesce((v_prior ->> 'ver')::integer, 0) + 1;
    else
      -- Re-asserting the same value is not a new version of it, whoever asserted it.
      v_ver := coalesce((v_prior ->> 'ver')::integer, 1);
    end if;
    v_out := v_out || jsonb_build_object(v_key, jsonb_set(v_env, '{ver}', to_jsonb(v_ver)));
  end loop;
  return jsonb_set(p_new, '{_values}', v_out);
end;
$$;

comment on function custom.value_versions(jsonb, jsonb) is
  'DYN-8''s third element: the per-Value version id, recomputed from the OLD row on every write. A caller cannot forge one because nothing it writes into ver survives. It moves when the value, its source, its reason for absence or its alternates move — never when the same value is asserted again.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. THE ACTOR, RESOLVED AND REFUSED AT THE DOOR
-- ═══════════════════════════════════════════════════════════════════════════════

create function custom.actor_word(p_declared text)
  returns text language plpgsql stable set search_path to 'pg_catalog' as $$
declare
  v_word text := nullif(btrim(coalesce(p_declared, '')), '');
  v_map  jsonb := custom.retired_actor_words();
  v_live text;
begin
  if v_word is null then
    -- Nothing declared on this write: translate the platform's own live declaration.
    -- This is ruling (c) in one line — one vocabulary stored, one translation, at one door.
    v_live := coalesce(platform.declared_actor_tier(), platform.actor_tier());
    v_word := v_map ->> v_live;
    if v_word is null then
      raise exception 'This write does not say who is writing, and the connection does not either. Say it: put "_actor" of %s in the record, or declare it on the connection.',
        array_to_string(custom.actor_vocabulary(), ', ')
        using errcode = '22004';
    end if;
    return v_word;
  end if;

  if v_word = any (custom.actor_vocabulary()) then
    return v_word;
  end if;

  if v_map ? v_word then
    raise exception '"%" is the old word for who wrote this. This store says "%" — the vocabulary is exactly %.',
      v_word, v_map ->> v_word, array_to_string(custom.actor_vocabulary(), ', ')
      using errcode = '22023';
  end if;

  raise exception '"%" is not somebody this store can record as the author of a value. The vocabulary is exactly %.',
    v_word, array_to_string(custom.actor_vocabulary(), ', ')
    using errcode = '22023';
end;
$$;

comment on function custom.actor_word(text) is
  'VAL-8 at the door: user, agent or system, or a refusal that NAMES what was offered. The three retired words get the replacement printed (ruling (c)); anything else gets the vocabulary.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. THE WRITE PATH — one trigger, on the table the one door writes
-- ═══════════════════════════════════════════════════════════════════════════════

create function custom._value_envelope()
  returns trigger language plpgsql set search_path to 'pg_catalog' as $$
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
$$;

comment on function custom._value_envelope() is
  'VAL-1..VAL-8 on the write path: resolve and refuse the actor, strip the write-only declaration, intern the provenance, stamp the author and the time, recompute every version from the OLD row, then raise the envelope law''s own sentence. Named with a leading underscore because triggers fire in name order and this must run after platform._stamp_actor and before every custom_record_* guard.';

create trigger _value_envelope
  before insert or update on custom.record
  for each row execute function custom._value_envelope();

-- The backstop a DISABLE TRIGGER cannot reach, and this lane's production clause.
-- NOT VALID because that is an enumerated additive shape and because the law is about
-- what is written from now on, not a claim about rows nobody has read.
alter table custom.record
  add constraint record_value_envelope check (custom.value_envelope_ok(data)) not valid;

comment on constraint record_value_envelope on custom.record is
  'VAL-1..VAL-8: the value envelope''s shape, on every write path including a direct one. Its message comes from custom.value_envelope_refusal, which the trigger _value_envelope raises in words.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. THE READS — every Value read returns its version id (DYN-8's triple)
-- ═══════════════════════════════════════════════════════════════════════════════

create function custom.record_values_versioned(p_organization_id uuid, p_record_id uuid)
  returns table(field_key text, field_id uuid, value jsonb, value_version integer,
                source jsonb, absent_reason text, actor text, on_behalf_of text,
                written_at timestamptz, alternates jsonb)
  language sql stable set search_path to 'pg_catalog' as $$
  with r as (
    select rec.* from custom.record rec
     where rec.organization_id = p_organization_id and rec.id = p_record_id
  ),
  keys as (
    -- Every key the plain read returns, plus every key that is ABSENT WITH A REASON —
    -- VAL-2 would be unreadable if a reasoned absence did not come back as a row.
    select k from r, jsonb_object_keys(custom.record_values(p_organization_id, p_record_id)) k
    union
    select k from r, jsonb_object_keys(coalesce(r.data -> '_values', '{}'::jsonb)) k
  )
  select keys.k,
         f.id,
         case when (r.data -> '_computed') ? keys.k
              then r.data -> '_computed' -> keys.k -> 'value'
              else r.data -> keys.k end,
         coalesce((r.data -> '_values' -> keys.k ->> 'ver')::integer, 1),
         r.data -> '_sources' -> (r.data -> '_values' -> keys.k ->> 'src'),
         r.data -> '_values' -> keys.k ->> 'absent',
         r.data -> '_values' -> keys.k ->> 'actor',
         r.data -> '_values' -> keys.k ->> 'on_behalf_of',
         (r.data -> '_values' -> keys.k ->> 'at')::timestamptz,
         coalesce((select jsonb_agg(jsonb_build_object('value', a -> 'value',
                                                       'rank',  a -> 'rank',
                                                       'source', r.data -> '_sources' -> (a ->> 'src'))
                                    order by (a ->> 'rank')::int)
                     from jsonb_array_elements(coalesce(r.data -> '_values' -> keys.k -> 'alternates',
                                                        '[]'::jsonb)) a),
                  '[]'::jsonb)
    from r
    cross join keys
    left join lateral (
      select af.id
        from custom.applicable_fields(p_organization_id, r.table_id,
                                      r.data ->> custom.table_type_field(p_organization_id, r.table_id)) af
       where af.data ->> 'key' = keys.k
       limit 1
    ) f on true
   order by keys.k;
$$;

comment on function custom.record_values_versioned(uuid, uuid) is
  'DYN-8: every Value of a record with the version id a run must be able to quote, beside its source, its author, its reason for absence and its ranked alternates. A value that is absent WITH a reason comes back as a row — VAL-2 is unreadable otherwise.';

create function custom.value_read(p_organization_id uuid, p_record_id uuid, p_key text)
  returns table(field_key text, field_id uuid, value jsonb, value_version integer,
                source jsonb, absent_reason text, actor text, on_behalf_of text,
                written_at timestamptz, alternates jsonb)
  language sql stable set search_path to 'pg_catalog' as $$
  select * from custom.record_values_versioned(p_organization_id, p_record_id) v
   where v.field_key = p_key;
$$;

comment on function custom.value_read(uuid, uuid, text) is
  'One Value, with the triple a merge field resolves to: this record id, the field id, and the value version.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. THE VALIDATION PATH, EXTENDED — not a second one
-- ═══════════════════════════════════════════════════════════════════════════════

create function custom.validate_value_envelope(p_organization_id uuid, p_fields custom.record[], p_data jsonb)
  returns void language plpgsql stable set search_path to 'pg_catalog' as $$
declare
  v_keys  text[];
  v_key   text;
  v_alt   jsonb;
  f       custom.record;
begin
  if jsonb_typeof(p_data -> '_values') <> 'object' then
    return;
  end if;
  select array_agg(x.data ->> 'key') into v_keys from unnest(p_fields) x;

  for v_key in select k from jsonb_object_keys(p_data -> '_values') k loop
    if not (v_key = any (coalesce(v_keys, array[]::text[]))) then
      raise exception 'This record carries where "%" came from, and this table has no field called "%". Provenance nobody can read is worse than none.', v_key, v_key
        using errcode = '23514', hint = 'VAL-1: every value envelope belongs to a declared Field of this table.';
    end if;
    -- VAL-3: an alternate is a candidate for the SAME field, so it is the same kind of
    -- value. An alternate nobody could promote is not an alternate.
    -- `select * into`, never `select x into`: `unnest()` over an array of a composite type
    -- EXPANDS it into columns, so `x` is the whole row and plpgsql would assign it to the
    -- first field — `id uuid` — and refuse the composite's text as a uuid.
    select * into f from unnest(p_fields) x where x.data ->> 'key' = v_key limit 1;
    for v_alt in select value from jsonb_array_elements(
                   coalesce(p_data -> '_values' -> v_key -> 'alternates', '[]'::jsonb)) loop
      if jsonb_typeof(v_alt -> 'value') is not null and jsonb_typeof(v_alt -> 'value') <> 'null' then
        perform custom.validate_values(p_organization_id, array[f],
                                       jsonb_build_object(v_key, v_alt -> 'value'), null);
      end if;
    end loop;
  end loop;
end;
$$;

comment on function custom.validate_value_envelope(uuid, custom.record[], jsonb) is
  'The half of the envelope law that needs the Field definitions and so cannot live in a CHECK: an envelope for a key no Field declares is refused by name, and every alternate is validated as a value that Field could actually hold.';

-- `custom._record_field_validation` is W1-FIELD's, replaced here rather than duplicated
-- (the lane brief: extend the existing validation path, never add a second one). TWO
-- changes, both marked W1-VAL below; every other line is W1-FIELD's, unchanged.
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

-- `custom.record_values` is W1-FIELD's plain read. Two more reserved keys exist now, and a
-- read that returned them as if they were the record's own values would be a lie about what
-- the record holds. Same body, two more subtractions.
create or replace function custom.record_values(p_organization_id uuid, p_record_id uuid)
 returns jsonb
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  select (r.data - '_computed' - '_retired' - '_values' - '_sources')
         || coalesce((select jsonb_object_agg(e.key, e.value -> 'value')
                        from jsonb_each(coalesce(r.data -> '_computed', '{}'::jsonb)) e),
                     '{}'::jsonb)
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_record_id;
$function$;
