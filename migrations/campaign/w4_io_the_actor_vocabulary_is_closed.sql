-- chair-step: replaces three of this lane's own function bodies that stamped `_actor` with words the store's closed actor vocabulary does not hold (`import`, `anonymous`, `offline`), so every import row and every cleared submission was refused at the write door; replacements are judged by the allow-list, so the sanctioned route is a terminal-confirmed step
-- based-on: custom.io_import_rows(uuid, uuid, jsonb, jsonb) ae2a06c8f68366b2034eb3064b71124567f9fad096a9b60b6ccfc266f0b55708
-- based-on: custom.anon_clear(uuid, uuid) 1d877a0633e675948ee970aad3f7431b72a81958f1e90437c3e1cccaaa281f0b
-- based-on: custom.anon_capture(uuid, text, uuid, jsonb, text, timestamp with time zone) 6178f5ec4dcde086c1b364ad23bb326681a64f0440c668dc2fbea66ca75162a6
--
-- W4-IO / W4-ANON, file 10 — THE ACTOR VOCABULARY IS CLOSED, AND THESE THREE DID NOT SPEAK IT.
--
-- WHAT THE GREEN SUITE FOUND. Every row of a two-row import was refused:
--
--     "import" is not somebody this store can record as the author of a value.
--     The vocabulary is exactly user, agent, system.
--
-- `custom.actor_vocabulary()` is `{user, agent, system}` and `custom.actor_word` refuses
-- anything else BY NAME — which is the store working exactly as designed, and three of this
-- seat's doors inventing words anyway: `import`, `anonymous` and `offline`. So no import ever
-- wrote a row, no cleared submission ever became a record, and no offline capture ever landed.
-- Nothing was silently wrong; everything was loudly refused and nothing had called them yet.
--
-- THE FIX, AND WHY IT IS NOT A VOCABULARY EXTENSION. `_actor` answers "who authored this
-- value" and it has three answers on purpose: a person, an agent, or the platform itself.
-- "Where did it come from" is a DIFFERENT question, and this campaign already answers it in its
-- own columns — `custom.anon_submission.source` (anonymous, email, webhook, scrape, offline),
-- `custom.io_import.source_name` and the Field's `source`/`source_config`. Adding `import` as a
-- fourth actor would have put the answer to the second question into the first one's column,
-- and every consumer of `_actor` would then have to know about importing.
--
-- So: an import writes as `system` (the platform performed the write, from a file a person
-- handed it); a submission a Rule clears writes as `system` (a Rule performed it); an offline
-- capture writes as `user` (there IS a signed-in person, and their device merely waited for a
-- network). The SOURCE of each is unchanged and still stamped where it belongs.
--
-- THE INVERSE: `migrations/inverse/w4_io_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION custom.io_import_rows(p_organization_id uuid, p_import_id uuid, p_rows jsonb, p_mapping jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run       custom.io_import;
  v_row       jsonb;
  v_doc       jsonb;
  v_key       text;
  v_val       jsonb;
  v_mapped    text;
  v_seen      integer := 0;
  v_written   integer := 0;
  v_refusals  jsonb := '[]'::jsonb;
  v_unmapped  jsonb := '{}'::jsonb;
  v_proposals jsonb := '[]'::jsonb;
  v_fields    text[];
  v_id        uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_rows');
  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'custom.io_import_rows: no open import run % for this organization', p_import_id
      using errcode = '23503';
  end if;

  select coalesce(array_agg(f.key), array[]::text[]) into v_fields
    from custom.field f where f.organization_id = p_organization_id;

  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_seen := v_seen + 1;
    v_doc := '{}'::jsonb;
    for v_key, v_val in select key, value from jsonb_each(v_row) loop
      -- The mapping is authored (a person chose), or it is the identity (the header already
      -- spells a Field key). Both are the same row here: a mapped column is a mapped column.
      v_mapped := coalesce(p_mapping ->> v_key, v_run.mapping ->> v_key,
                           case when v_key = any (v_fields) then v_key else null end);
      if v_mapped is null then
        -- DOOR-14: not an error, an OFFER. Remember it with a sample so the proposal can say
        -- what the column actually looked like rather than merely that it existed.
        v_unmapped := v_unmapped || jsonb_build_object(
          v_key, coalesce(v_unmapped -> v_key, '[]'::jsonb) ||
                 case when jsonb_array_length(coalesce(v_unmapped -> v_key, '[]'::jsonb)) < 5
                      then jsonb_build_array(v_val) else '[]'::jsonb end);
      else
        v_doc := v_doc || jsonb_build_object(v_mapped, v_val);
      end if;
    end loop;

    begin
      -- THE ONE WRITE DOOR. Validation, the value envelope, provenance, the rules and the
      -- outbox all hang off this call; an INSERT here would skip every one of them.
      v_id := custom.record_write(p_organization_id, v_run.table_id,
                                  v_doc || jsonb_build_object('_actor', 'system'));
      v_written := v_written + 1;
    exception when others then
      -- A refusal is RECORDED, never swallowed and never fatal to the run. An import that
      -- half worked must be able to say which half, by row number and by reason.
      v_refusals := v_refusals || jsonb_build_array(
        jsonb_build_object('row', v_seen, 'sqlstate', sqlstate, 'reason', sqlerrm));
    end;
  end loop;

  -- The proposals, built once at the end from everything the run saw.
  select coalesce(jsonb_agg(jsonb_build_object(
           'column', u.key,
           'samples', u.value,
           'inferred_type', custom.io_infer_type(u.value),
           'state', 'proposed')), '[]'::jsonb)
    into v_proposals
    from jsonb_each(v_unmapped) u;

  update custom.io_import
     set rows_seen    = rows_seen + v_seen,
         rows_written = rows_written + v_written,
         refusals     = refusals || v_refusals,
         proposals    = case when v_proposals = '[]'::jsonb then proposals else v_proposals end,
         mapping      = mapping || coalesce(p_mapping, '{}'::jsonb),
         state        = 'written'
   where organization_id = p_organization_id and id = p_import_id;

  return jsonb_build_object('import_id', p_import_id, 'rows_seen', v_seen,
                            'rows_written', v_written, 'refusals', v_refusals,
                            'proposals', v_proposals);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.anon_clear(p_organization_id uuid, p_submission_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_sub    custom.anon_submission;
  v_form   custom.anon_form;
  v_answer jsonb;
  v_id     uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_clear');
  select * into v_sub from custom.anon_submission
   where organization_id = p_organization_id and id = p_submission_id;
  if not found then return null; end if;
  if v_sub.state <> 'quarantined' then return v_sub.record_id; end if;

  select * into v_form from custom.anon_form
   where organization_id = p_organization_id and id = v_sub.form_id;

  if v_form.quarantine_rule_id is null then
    -- No Rule means no automatic clearing. Staying quarantined is the correct answer, not a
    -- failure — and it is what makes "closed by default" true all the way through.
    return null;
  end if;

  -- The SAME evaluator every other Rule uses. A second "is this submission ok" mechanism would
  -- be the first one to disagree with the Rule the organization actually wrote.
  v_answer := custom.rule_run(p_organization_id, v_form.quarantine_rule_id, v_sub.payload,
                              jsonb_build_object('source', v_sub.source,
                                                 'origin', v_sub.remote_origin,
                                                 'form_id', v_sub.form_id));
  if not coalesce(custom.rule_truth(v_answer), false) then
    update custom.anon_submission
       set state = 'rejected',
           rejection_reason = coalesce(v_answer ->> 'why', 'The form''s rule did not admit this submission.')
     where organization_id = p_organization_id and id = p_submission_id;
    return null;
  end if;

  -- Cleared: NOW it becomes a record, through the ONE write door, with its source stamped so
  -- the record itself can always say it came from a stranger.
  v_id := custom.record_write(p_organization_id, v_sub.table_id,
                              v_sub.payload || jsonb_build_object('_actor', 'system'));

  update custom.anon_submission
     set state = 'cleared', record_id = v_id, cleared_at = now(),
         cleared_by_rule_id = v_form.quarantine_rule_id
   where organization_id = p_organization_id and id = p_submission_id;
  update custom.anon_replay set record_id = v_id
   where organization_id = p_organization_id and submission_id = p_submission_id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.anon_capture(p_organization_id uuid, p_client_key text, p_table_id uuid, p_payload jsonb, p_device text DEFAULT NULL::text, p_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_existing uuid;
  v_id       uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_capture');

  -- THE ACCESS DECISION, BEFORE EXISTENCE. This is the SIGNED-IN offline path, so there is a
  -- principal and it must be able to write into this Table — asked of `iam.has_access_for`,
  -- the platform's ONE answer to "may this actor touch this row?", never of the organization
  -- id, which is tenancy and not permission. It is decided before the ledger is read, so a
  -- Table the caller may not reach and a Table that does not exist answer identically: the
  -- opposite order is how a door becomes an existence oracle.
  if not iam.has_access_for(custom.query_principal(), 'record', p_table_id,
                            'editor'::permission_level) then
    raise exception 'You may not add records to this table.'
      using errcode = '42501',
            hint = 'Offline capture writes a record when the device reconnects, so it needs the same editor level on the table that adding a record by hand needs.';
  end if;

  if coalesce(btrim(coalesce(p_client_key, '')), '') = '' then
    raise exception 'custom.anon_capture: the client mints the id, offline, before the first attempt. Without it a reconnect cannot tell a retry from a second capture.'
      using errcode = '22004';
  end if;

  -- THE LEDGER IS THE MECHANISM. `on conflict do nothing` plus the unique index means the
  -- second, third and thirtieth replay all take the same branch, whatever the client believes.
  insert into custom.anon_replay (organization_id, client_key, table_id, device, captured_at)
  values (p_organization_id, p_client_key, p_table_id, p_device, coalesce(p_captured_at, now()))
  on conflict (organization_id, client_key) do nothing;

  select r.record_id into v_existing from custom.anon_replay r
   where r.organization_id = p_organization_id and r.client_key = p_client_key;
  if v_existing is not null then
    update custom.anon_replay set replays = replays + 1
     where organization_id = p_organization_id and client_key = p_client_key;
    return v_existing;
  end if;

  v_id := custom.record_write(p_organization_id, p_table_id,
                              coalesce(p_payload, '{}'::jsonb)
                              || jsonb_build_object('_actor', 'user'));
  update custom.anon_replay set record_id = v_id
   where organization_id = p_organization_id and client_key = p_client_key
     and record_id is null;
  return v_id;
end;
$function$;

revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
