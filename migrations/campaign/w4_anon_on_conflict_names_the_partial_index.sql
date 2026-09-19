-- chair-step: replaces three of this lane's own bodies whose ON CONFLICT clauses named index columns without the PARTIAL predicate the provisioner builds those unique indexes with, so the rate limit and both idempotency ledgers raised "there is no unique or exclusion constraint matching the ON CONFLICT specification" on their first call; replacements are judged by the allow-list, so the sanctioned route is a terminal-confirmed step
-- based-on: custom.anon_capture(uuid,text,uuid,jsonb,text,timestamp with time zone) 22f96225026d7d69620505001631d5c520004c5c423b6aecb0863e77d2ce9b29
-- based-on: custom.anon_rate_take(uuid,uuid,text,uuid) 5799231fa2dd3066d1d02304dd7713421693a4befc797700e6309e997c579c22
-- based-on: custom.anon_write(text,text,jsonb,text,jsonb) bf703cfb8b723e06d9fe24a71529b2aed1b1b0269d425a813cb6674c3211e61c
--
-- W4-ANON, file 4 — ON CONFLICT MUST NAME THE PARTIAL PREDICATE TOO.
--
-- WHAT THE GREEN SUITE FOUND:
--     ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- `platform.provision` builds every unique index this campaign asks for as a PARTIAL index —
-- `… WHERE (deleted_at IS NULL)` — which is right: a soft-deleted row must not keep its slot.
-- Postgres matches an `ON CONFLICT (cols)` inference against a partial index only when the
-- statement repeats the predicate, so all three upserts matched nothing and raised.
--
-- Measured on the main database, 2026-09-18:
--     anon_hit_organization_id_form_id_bucket_window_start_idx  … WHERE (deleted_at IS NULL)
--     anon_replay_organization_id_client_key_idx                … WHERE (deleted_at IS NULL)
-- so `custom.anon_rate_take` (the whole rate limit), `custom.anon_write`'s replay ledger insert
-- and `custom.anon_capture`'s were each broken on their first call.
--
-- WHY IT MATTERS MORE THAN A SYNTAX FIX. These three upserts ARE the atomicity of this lane:
-- the rate window is a single upserted row precisely so two simultaneous requests cannot both
-- read `n` and both write `n+1`, and the replay ledger is a unique index precisely so
-- idempotency is a constraint rather than a promise. An `on conflict` that matches no index
-- does not fall back to a race — it raises — but the lesson is the same either way: the
-- guarantee lives in the index, so the statement has to name the index that exists.
--
-- THE INVERSE: `migrations/inverse/w4_anon_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

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
                            'editor'::public.permission_level) then
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
  on conflict (organization_id, client_key) where deleted_at is null do nothing;

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
$function$
;

CREATE OR REPLACE FUNCTION custom.anon_rate_take(p_organization_id uuid, p_form_id uuid, p_bucket text, p_token_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_form   custom.anon_form;
  v_start  timestamptz;
  v_hits   integer;
begin
  select * into v_form from custom.anon_form
   where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
  if not found then
    raise exception 'custom.anon_rate_take: no form % in this organization', p_form_id
      using errcode = '23503';
  end if;

  -- The window is a FLOOR of now(), so every request in the same window lands on the same row
  -- and the unique index makes the count atomic. Reading a count and then writing it back is
  -- the classic way two simultaneous requests both become the nth.
  v_start := to_timestamp(floor(extract(epoch from now())
                                / greatest(1, extract(epoch from v_form.rate_limit_window)))
                          * greatest(1, extract(epoch from v_form.rate_limit_window)));

  insert into custom.anon_hit (organization_id, form_id, token_id, bucket, window_start, hits)
  values (p_organization_id, p_form_id, p_token_id, p_bucket, v_start, 1)
  on conflict (organization_id, form_id, bucket, window_start) where deleted_at is null
    do update set hits = custom.anon_hit.hits + 1
  returning hits into v_hits;

  if v_hits > v_form.rate_limit_per_window then
    raise exception 'Too many submissions. This form takes % per %.',
      v_form.rate_limit_per_window, v_form.rate_limit_window
      using errcode = '53400',
            hint = 'Wait for the window to pass and send it again; nothing was lost. If this form should take more, raise its limit — it is a setting on the form, not a number in code.';
  end if;
  return v_hits;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.anon_write(p_secret text, p_origin text, p_payload jsonb, p_client_key text DEFAULT NULL::text, p_raw_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tok      record;
  v_form     custom.anon_form;
  v_exposed  text[];
  v_required text[];
  v_key      text;
  v_missing  text[];
  v_doc      jsonb := '{}'::jsonb;
  v_existing uuid;
  v_id       uuid;
begin
  -- 1. THE TOKEN. It supplies the organization; the caller never names one.
  select * into v_tok from custom.anon_token_verify(p_secret, p_origin, 'write');

  perform custom.assert_store_door(v_tok.organization_id, 'custom.anon_write');

  select * into v_form from custom.anon_form
   where organization_id = v_tok.organization_id and id = v_tok.form_id and deleted_at is null;
  if not found then
    raise exception 'This form is no longer available.'
      using errcode = '23503';
  end if;

  -- 2. CLOSED BY DEFAULT.
  if v_form.published_at is null then
    raise exception 'This form is not accepting responses.'
      using errcode = '42501',
            hint = 'The form exists but has never been published, or it was closed. Whoever owns it publishes it; until then nothing can be submitted, which is the point of the default.';
  end if;

  -- 3. IDEMPOTENCY FIRST, so a replay costs no rate budget and produces no second row.
  if p_client_key is not null then
    select s.id into v_existing from custom.anon_submission s
     where s.organization_id = v_tok.organization_id
       and s.form_id = v_form.id
       and s.client_key = p_client_key;
    if v_existing is not null then
      update custom.anon_replay
         set replays = replays + 1
       where organization_id = v_tok.organization_id and client_key = p_client_key;
      return v_existing;
    end if;
  end if;

  -- 4. RATE. The bucket is the token, because the token is the only identity there is.
  perform custom.anon_rate_take(v_tok.organization_id, v_form.id,
                                v_tok.token_id::text, v_tok.token_id);

  -- 5. SCOPE. A key the form does not expose is REFUSED BY NAME, never silently dropped: a
  -- form that quietly discards what somebody typed is worse than one that says no.
  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_exposed
    from jsonb_array_elements(v_form.exposed_field_keys);
  for v_key in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
    if not (v_key = any (v_exposed)) then
      raise exception 'This form does not have a field called "%".', v_key
        using errcode = '42501',
              hint = format('It accepts: %s. A submission carrying anything else is refused rather than quietly trimmed, so nobody can push a value into a field the form never showed.',
                            coalesce(array_to_string(v_exposed, ', '), '(nothing)'));
    end if;
    v_doc := v_doc || jsonb_build_object(v_key, p_payload -> v_key);
  end loop;

  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_required
    from jsonb_array_elements(v_form.required_field_keys);
  select coalesce(array_agg(k), array[]::text[]) into v_missing
    from unnest(v_required) k
   where coalesce(p_payload -> k, 'null'::jsonb) in ('null'::jsonb, '""'::jsonb);
  if array_length(v_missing, 1) > 0 then
    raise exception 'This form needs %.', array_to_string(v_missing, ', ')
      using errcode = '22004',
            hint = 'Each missing field is named so the screen can point at it, rather than showing one generic error beside a form with twenty questions.';
  end if;

  -- 6. QUARANTINE. NOT a record. `custom.record` is never touched here.
  insert into custom.anon_submission (organization_id, form_id, table_id, source, payload,
                                      raw_payload, client_key, state, remote_origin)
  values (v_tok.organization_id, v_form.id, v_form.table_id, 'anonymous', v_doc,
          coalesce(p_raw_payload, '{}'::jsonb), p_client_key, 'quarantined', p_origin)
  returning id into v_id;

  if p_client_key is not null then
    insert into custom.anon_replay (organization_id, client_key, table_id, submission_id, captured_at)
    values (v_tok.organization_id, p_client_key, v_form.table_id, v_id, now())
    on conflict (organization_id, client_key) where deleted_at is null do nothing;
  end if;

  -- 7. Offer it to the form's Rule at once. A form with no Rule holds everything for a person.
  if v_form.quarantine_rule_id is not null then
    perform custom.anon_clear(v_tok.organization_id, v_id);
  end if;

  return v_id;
end;
$function$
;

revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
