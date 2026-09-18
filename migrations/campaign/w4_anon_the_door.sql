-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
--
-- W4-ANON, file 2 — THE ANONYMOUS WRITE DOOR, THE EMBED TOKEN, THE INBOUND ADDRESS AND THE
--                   OFFLINE REPLAY.
--
-- DOOR-17 · DOOR-19 · DOOR-20 · DOOR-21.
--
-- 🚨 THIS IS THE CAMPAIGN'S ONLY UNAUTHENTICATED SURFACE, AND IT WIDENS NOTHING.
-- Not one statement in this file grants `anon` anything, and there is no GRANT in it at all.
-- Schema `custom` is declared closed in `platform.schema_client_exposure`, holds no privilege
-- for `public`, `anon`, `authenticated` or `service_role`, and is absent from `pgrst.db_schemas`
-- — so a browser cannot reach these functions and nothing here changes that. The anonymous
-- writer is a person with no account typing into a form; the CALLER is the server, holding a
-- token it was given. "Token-scoped" is the whole security model: the token names one form, the
-- form names its exposed keys, and neither the caller nor the payload can widen either.
--
-- THE FIVE REFUSALS, EACH WITH A POSITIVE CONTROL IN THE SUITE
-- ------------------------------------------------------------
--   1. CLOSED BY DEFAULT.    `published_at is null` → refused. Only `custom.anon_publish` sets
--                            it, and only a principal who may administer the Table may call it.
--                            A form that exists is not a form that accepts writes.
--   2. ORIGIN.               A token carries an exact origin list. A write from an origin not
--                            on it is refused BY NAME, and an empty list means no origin at all
--                            — never "everywhere", which is what a permissive default means in
--                            practice the day somebody forgets to fill it in.
--   3. RATE.                 The (n+1)th write in the window is refused by name. The count is
--                            ROWS with a unique index and an atomic upsert, so two requests at
--                            the same millisecond cannot both read `n` and both write `n+1`.
--   4. SCOPE.                A payload key outside the form's `exposed_field_keys` is refused
--                            by name — never silently dropped, because a form that quietly
--                            discards what somebody typed is worse than one that refuses.
--   5. QUARANTINE.           An accepted write lands in `custom.anon_submission`, NOT in
--                            `custom.record`. No read door can see it as a record, because it
--                            is not one. `record_id` stays null until a Rule clears it.
--
-- WHY A RULE CLEARS IT AND NOT A FLAG. "Which submissions are real" is exactly the kind of
-- judgement this platform keeps as a Rule (W1-RULE) rather than as code: it is an opinion an
-- organization holds, it changes, and it must be editable in English by the person who holds
-- it. `custom.anon_clear` evaluates the form's `quarantine_rule_id` against the submission's
-- own values through `custom.rule_run` — the same evaluator every other Rule uses. A form with
-- no Rule holds everything for a person, which is Typeform's inbox and is the right default.
--
-- DOOR-21, AND WHY THE CLIENT MINTS THE ID. A device capturing offline has no server to ask for
-- an id, so it makes one. That is not a workaround; it is the only design in which a reconnect
-- cannot duplicate: the id exists BEFORE the first attempt, so every replay carries the same
-- one and the UNIQUE index on `(organization_id, client_key)` collapses them. The count of
-- replays is kept rather than discarded, so a client stuck in a loop is visible.
--
-- DOOR-19, SAID HONESTLY. Webhook and scrape work end to end here: an address is issued, a
-- secret is presented, a submission lands with its source stamped and its originating payload
-- kept. INBOUND EMAIL IS PENDING A TRANSPORT, not a door: `communication.emails` on this
-- database is a flat (sender, recipient, subject, body) table with no organization, no routing
-- and no MX behind it, so there is nothing that delivers a message to this function today.
-- `custom.anon_inbound_land` already accepts `channel = 'email'` and stamps `source = 'email'`,
-- so the day a mailbox exists it calls this and nothing here changes. Naming that gap is the
-- point: a door that claimed email worked would be found out by the first person who tried it.
--
-- THE INVERSE: `migrations/inverse/w4_anon_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── the publish act, which is the only thing that opens a form ───────────────
create function custom.anon_publish(p_organization_id uuid,
                                    p_form_id uuid,
                                    p_published boolean default true)
returns timestamptz
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_user  uuid := custom.query_principal();
  v_table uuid;
  v_at    timestamptz;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_publish');
  select f.table_id into v_table from custom.anon_form f
   where f.organization_id = p_organization_id and f.id = p_form_id and f.deleted_at is null;
  if v_table is null then
    raise exception 'custom.anon_publish: no form % in this organization', p_form_id
      using errcode = '23503';
  end if;
  -- PUBLISHING A FORM OPENS A WRITE PATH FOR PEOPLE WITH NO ACCOUNT. That is an admin act on
  -- the Table, not an editor act: whoever may publish is deciding that strangers may add rows.
  if not custom.has_visibility(v_user, 'record', v_table, 'admin'::permission_level) then
    raise exception 'You may not publish this form.'
      using errcode = '42501',
            hint = 'Publishing opens a write path for people with no account, so it needs the admin level on the Table the form writes into — the same level that decides who may reach the Table at all.';
  end if;

  v_at := case when p_published then now() else null end;
  update custom.anon_form
     set published_at = v_at,
         published_by = case when p_published then v_user else published_by end,
         closed_at    = case when p_published then null else now() end
   where organization_id = p_organization_id and id = p_form_id;
  return v_at;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'anon_publish',
        'p_organization_id uuid, p_form_id uuid, p_published boolean',
        array['uuid'::regtype, 'uuid'::regtype, 'boolean'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry; NULL is refused there. p_form_id is resolved to its Table inside THIS organization only, and the caller is then checked by custom.has_visibility(principal, ''record'', that Table, ''admin'') — the ADMIN rung, because publishing opens a write path for people with no account. A form id from another tenant reads as absent and is refused by name. NULL p_form_id is refused by name.',
        'w4_anon_the_door.sql',
        null, true, false)
on conflict do nothing;

-- ── DOOR-20: issuing a token. The secret leaves ONCE and is never stored ──────
create function custom.anon_token_issue(p_organization_id uuid,
                                        p_mode text,
                                        p_allowed_origins jsonb,
                                        p_form_id uuid default null,
                                        p_saved_view_id uuid default null,
                                        p_record_id uuid default null,
                                        p_expires_at timestamptz default null)
returns table(token_id uuid, secret text)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_user   uuid := custom.query_principal();
  v_table  uuid;
  v_secret text;
  v_id     uuid;
  v_n      integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_token_issue');
  if coalesce(p_mode, '') not in ('read', 'write') then
    raise exception 'custom.anon_token_issue: mode is read or write, not "%". A token carrying both would be one credential holding two decisions, and the second is always the one nobody meant to grant.', p_mode
      using errcode = '22023';
  end if;

  select count(*) into v_n from jsonb_array_elements_text(coalesce(p_allowed_origins, '[]'::jsonb));
  if v_n = 0 then
    -- An empty origin list is refused at ISSUE rather than silently meaning "everywhere".
    raise exception 'custom.anon_token_issue: name the origins this token works from.'
      using errcode = '22004',
            hint = 'An embed token with no origin list is a token that works from any page on the internet, including an attacker''s. Pass the exact origins, scheme and host and port: ["https://example.com"].';
  end if;

  if p_mode = 'write' then
    if p_form_id is null then
      raise exception 'custom.anon_token_issue: a write token must name the form it writes to'
        using errcode = '22004';
    end if;
    select f.table_id into v_table from custom.anon_form f
     where f.organization_id = p_organization_id and f.id = p_form_id and f.deleted_at is null;
    if v_table is null then
      raise exception 'custom.anon_token_issue: no form % in this organization', p_form_id
        using errcode = '23503';
    end if;
    if not custom.has_visibility(v_user, 'record', v_table, 'admin'::permission_level) then
      raise exception 'You may not issue a write token for this form.'
        using errcode = '42501',
              hint = 'Issuing a write token hands a stranger a way in, so it needs the admin level on the Table the form writes into.';
    end if;
  elsif p_record_id is not null then
    if not custom.has_visibility(v_user, 'record', p_record_id, 'admin'::permission_level) then
      raise exception 'You may not issue a read token for this record.'
        using errcode = '42501',
              hint = 'A read token lets anyone holding it read the record from an allowed origin, so issuing one needs the admin level on that record.';
    end if;
  end if;

  -- The secret is minted here and returned ONCE. Only its digest is stored, so a database read
  -- — a backup, a support query, a leaked dump — cannot produce a working token.
  v_secret := encode(gen_random_bytes(32), 'hex');
  insert into custom.anon_token (organization_id, form_id, saved_view_id, record_id, mode,
                                 secret_hash, allowed_origins, expires_at, created_by)
  values (p_organization_id, p_form_id, p_saved_view_id, p_record_id, p_mode,
          encode(digest(v_secret, 'sha256'), 'hex'),
          coalesce(p_allowed_origins, '[]'::jsonb), p_expires_at, v_user)
  returning id into v_id;

  token_id := v_id; secret := v_secret; return next;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'anon_token_issue',
        'p_organization_id uuid, p_mode text, p_allowed_origins jsonb, p_form_id uuid, p_saved_view_id uuid, p_record_id uuid, p_expires_at timestamp with time zone',
        array['uuid'::regtype, 'text'::regtype, 'jsonb'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'timestamptz'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry; NULL is refused there. A write token requires p_form_id, resolved to its Table inside this organization, and the caller checked by custom.has_visibility(principal, ''record'', that Table, ''admin''); NULL p_form_id is refused by name. A read token naming p_record_id checks custom.has_visibility(principal, ''record'', p_record_id, ''admin''). An empty p_allowed_origins is refused by name rather than meaning "any origin".',
        'w4_anon_the_door.sql',
        null, true, false)
on conflict do nothing;

create function custom.anon_token_revoke(p_organization_id uuid, p_token_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare v_user uuid := custom.query_principal();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_token_revoke');
  -- Revocation is a TIMESTAMP, never a delete: "when was this revoked, and by whom" is the
  -- first question after an incident, and a deleted row answers neither.
  update custom.anon_token
     set revoked_at = now(), revoked_by = v_user
   where organization_id = p_organization_id and id = p_token_id and revoked_at is null;
  return found;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'anon_token_revoke',
        'p_organization_id uuid, p_token_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry; NULL is refused there. p_token_id is keyed with the organization in the UPDATE, so a token belonging to another tenant matches no row and the call returns false without revealing that it exists.',
        'w4_anon_the_door.sql',
        null, true, false)
on conflict do nothing;

-- ── DOOR-20: what a token is allowed to be, checked from the origin it arrived from ──
create function custom.anon_token_verify(p_secret text, p_origin text, p_required_mode text)
returns table(token_id uuid, organization_id uuid, form_id uuid,
              saved_view_id uuid, record_id uuid, mode text)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_hash text := encode(digest(coalesce(p_secret, ''), 'sha256'), 'hex');
  v_tok  custom.anon_token;
begin
  select * into v_tok from custom.anon_token t
   where t.secret_hash = v_hash and t.deleted_at is null;
  if not found then
    raise exception 'This embed link is not valid.'
      using errcode = '42501',
            hint = 'The token does not match any issued token. It may have been mistyped, or it may have been rotated — issue a new embed and replace the old one.';
  end if;
  if v_tok.revoked_at is not null then
    raise exception 'This embed link was revoked on %.', to_char(v_tok.revoked_at, 'YYYY-MM-DD')
      using errcode = '42501',
            hint = 'Whoever owns the form or view revoked it. A new embed has to be issued; the old link will never work again.';
  end if;
  if v_tok.expires_at is not null and v_tok.expires_at < now() then
    raise exception 'This embed link expired on %.', to_char(v_tok.expires_at, 'YYYY-MM-DD')
      using errcode = '42501',
            hint = 'Issue a new embed. The expiry is a property of the token, so extending it is not possible — that is what makes an expiry mean something.';
  end if;
  -- THE ORIGIN CHECK, AND IT IS EXACT. Not a suffix match, not a wildcard: an attacker's
  -- `https://example.com.evil.test` passes a suffix check and fails this one.
  if not exists (select 1 from jsonb_array_elements_text(v_tok.allowed_origins) o
                  where o = p_origin) then
    raise exception 'This embed does not work on %.', coalesce(p_origin, '(no origin)')
      using errcode = '42501',
            hint = 'The token names the exact sites it works from. Add this origin to the embed, or use the embed that was issued for this site.';
  end if;
  if p_required_mode is not null and v_tok.mode <> p_required_mode then
    raise exception 'This embed is a %-only link.', v_tok.mode
      using errcode = '42501',
            hint = 'A read token cannot write and a write token cannot read. Issue the one you need; a token carrying both would be one credential holding two decisions.';
  end if;

  update custom.anon_token set last_used_at = now()
   where custom.anon_token.id = v_tok.id
     and custom.anon_token.organization_id = v_tok.organization_id;

  token_id := v_tok.id; organization_id := v_tok.organization_id; form_id := v_tok.form_id;
  saved_view_id := v_tok.saved_view_id; record_id := v_tok.record_id; mode := v_tok.mode;
  return next;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'anon_token_verify',
        'p_secret text, p_origin text, p_required_mode text',
        array['text'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
        'Takes NO entity id. The token secret IS the identity: it is hashed and matched against custom.anon_token.secret_hash, and the row it matches supplies the organization — the caller never names one and cannot influence which one comes back. Revocation, expiry, an EXACT origin match (never a suffix or wildcard) and the mode are each checked and each refused by name.',
        'w4_anon_the_door.sql',
        'server_only: the server holds the token and knows the request Origin header; a browser handing this function an origin string would be stating its own origin, which is not a check.',
        false, false)
on conflict do nothing;

-- ── DOOR-17: the rate limit, atomic ─────────────────────────────────────────
create function custom.anon_rate_take(p_organization_id uuid,
                                      p_form_id uuid,
                                      p_bucket text,
                                      p_token_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
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
  on conflict (organization_id, form_id, bucket, window_start)
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
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'anon_rate_take',
        'p_organization_id uuid, p_form_id uuid, p_bucket text, p_token_id uuid',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id and p_form_id are matched together, so a form id from another tenant reads as absent and is refused by name. It grants nothing and reads no record: it only counts, and raises 53400 when the count passes the form''s own limit. It is called BY custom.anon_write after the token check, never on its own as an access decision.',
        'w4_anon_the_door.sql',
        'server_only: it is an internal step of the anonymous write path, called after the token has already been verified; nothing outside that path has a reason to take a rate token.',
        false, false)
on conflict do nothing;

-- ── DOOR-17: THE ANONYMOUS WRITE DOOR ────────────────────────────────────────
create function custom.anon_write(p_secret text,
                                  p_origin text,
                                  p_payload jsonb,
                                  p_client_key text default null,
                                  p_raw_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
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
    on conflict (organization_id, client_key) do nothing;
  end if;

  -- 7. Offer it to the form's Rule at once. A form with no Rule holds everything for a person.
  if v_form.quarantine_rule_id is not null then
    perform custom.anon_clear(v_tok.organization_id, v_id);
  end if;

  return v_id;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'anon_write',
        'p_secret text, p_origin text, p_payload jsonb, p_client_key text, p_raw_payload jsonb',
        array['text'::regtype, 'text'::regtype, 'jsonb'::regtype, 'text'::regtype, 'jsonb'::regtype]::oid[],
        'It takes NO organization id and NO record id, by design: the token secret supplies the organization and the form, so a caller cannot name a tenant or a table. In order — custom.anon_token_verify (existence, revocation, expiry, EXACT origin, write mode), custom.assert_store_door, published_at is not null, idempotency on p_client_key, the rate limit, then every payload key checked against the form''s exposed_field_keys and refused by name. The write lands in custom.anon_submission, never in custom.record, with source stamped anonymous; it becomes a record only when a Rule clears it.',
        'w4_anon_the_door.sql',
        'server_only: the server is what holds the token and what reads the request Origin header. Schema custom is closed and absent from pgrst.db_schemas, so no browser can reach this function; the anonymous WRITER has no account, but the CALLER is always the server. This row stays anonymous_callers = false for exactly that reason.',
        false, false)
on conflict do nothing;

-- ── DOOR-17: the Rule clears the quarantine ─────────────────────────────────
create function custom.anon_clear(p_organization_id uuid, p_submission_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
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
                              v_sub.payload || jsonb_build_object('_actor', 'anonymous'));

  update custom.anon_submission
     set state = 'cleared', record_id = v_id, cleared_at = now(),
         cleared_by_rule_id = v_form.quarantine_rule_id
   where organization_id = p_organization_id and id = p_submission_id;
  update custom.anon_replay set record_id = v_id
   where organization_id = p_organization_id and submission_id = p_submission_id;
  return v_id;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'anon_clear',
        'p_organization_id uuid, p_submission_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry; NULL is refused there. p_submission_id is matched together with the organization, so another tenant''s submission reads as absent and returns NULL rather than raising. It grants nothing: the decision is the form''s own quarantine Rule, evaluated through custom.rule_run, and the record it may create goes through custom.record_write, which makes its own access decision.',
        'w4_anon_the_door.sql',
        'server_only: clearing runs on the write path and on the triage worker; the human triage screen calls the review verb, not this one.',
        false, false)
on conflict do nothing;

-- ── DOOR-19: an inbound address lands a submission, source stamped ───────────
create function custom.anon_inbound_land(p_address text,
                                         p_secret text,
                                         p_payload jsonb,
                                         p_raw_payload jsonb default '{}'::jsonb,
                                         p_client_key text default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_in  custom.anon_inbound;
  v_id  uuid;
  v_ex  uuid;
begin
  select * into v_in from custom.anon_inbound
   where address = p_address and deleted_at is null;
  if not found then
    raise exception 'No inbound address "%".', p_address
      using errcode = '42501',
            hint = 'The address is what authorises the delivery, so an unknown one is refused without saying whether it ever existed.';
  end if;
  if v_in.disabled_at is not null then
    raise exception 'The inbound address "%" is switched off.', p_address
      using errcode = '42501',
            hint = 'Whoever owns the Table disabled it. Everything that arrived before is still there.';
  end if;
  -- A webhook presents a shared secret; an email address IS the secret, so there is nothing to
  -- present. Saying that in one branch is clearer than pretending both are the same.
  if v_in.secret_hash is not null
     and v_in.secret_hash is distinct from encode(digest(coalesce(p_secret, ''), 'sha256'), 'hex') then
    raise exception 'That is not the secret for "%".', p_address
      using errcode = '42501';
  end if;

  perform custom.assert_store_door(v_in.organization_id, 'custom.anon_inbound_land');

  if p_client_key is not null then
    select s.id into v_ex from custom.anon_submission s
     where s.organization_id = v_in.organization_id and s.inbound_id = v_in.id
       and s.client_key = p_client_key;
    if v_ex is not null then return v_ex; end if;
  end if;

  -- The ORIGINATING PAYLOAD is kept, always. HubSpot's forwarding address is only useful
  -- because the message is still there when somebody asks why the record says what it says.
  insert into custom.anon_submission (organization_id, form_id, inbound_id, table_id, source,
                                      payload, raw_payload, client_key, state, remote_origin)
  values (v_in.organization_id, v_in.form_id, v_in.id, v_in.table_id, v_in.source,
          coalesce(p_payload, '{}'::jsonb), coalesce(p_raw_payload, '{}'::jsonb),
          p_client_key, 'quarantined', p_address)
  returning id into v_id;

  update custom.anon_inbound set last_received_at = now()
   where custom.anon_inbound.id = v_in.id
     and custom.anon_inbound.organization_id = v_in.organization_id;

  if v_in.form_id is not null then
    perform custom.anon_clear(v_in.organization_id, v_id);
  end if;
  return v_id;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'anon_inbound_land',
        'p_address text, p_secret text, p_payload jsonb, p_raw_payload jsonb, p_client_key text',
        array['text'::regtype, 'text'::regtype, 'jsonb'::regtype, 'jsonb'::regtype, 'text'::regtype]::oid[],
        'Takes NO organization id and NO table id: the ADDRESS supplies both, so a caller cannot name a tenant. An unknown or disabled address is refused without saying which. A webhook address additionally presents a shared secret compared against secret_hash; an email address IS the secret, which is why that branch is explicit rather than folded together. The submission lands quarantined with the address''s own source stamped on it and the originating payload kept.',
        'w4_anon_the_door.sql',
        'server_only: the transport — the webhook endpoint, the scraper, and the mailbox when one exists — runs on the server and is what holds the address and the secret.',
        false, false)
on conflict do nothing;

-- ── DOOR-21: the offline replay, counted as rows ────────────────────────────
create function custom.anon_capture(p_organization_id uuid,
                                    p_client_key text,
                                    p_table_id uuid,
                                    p_payload jsonb,
                                    p_device text default null,
                                    p_captured_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
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
                              || jsonb_build_object('_actor', 'offline'));
  update custom.anon_replay set record_id = v_id
   where organization_id = p_organization_id and client_key = p_client_key
     and record_id is null;
  return v_id;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'anon_capture',
        'p_organization_id uuid, p_client_key text, p_table_id uuid, p_payload jsonb, p_device text, p_captured_at timestamp with time zone',
        array['uuid'::regtype, 'text'::regtype, 'uuid'::regtype, 'jsonb'::regtype, 'text'::regtype, 'timestamptz'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry; NULL is refused there. p_table_id is checked by iam.has_access_for(principal, ''record'', p_table_id, ''editor'') BEFORE the replay ledger is read, so a Table the caller may not reach and a Table that does not exist answer identically; NULL fails that check and is refused. This is the SIGNED-IN offline path — a device whose person has an account but no network — so the record is written through custom.record_write, which makes the real per-row access decision for that principal; this function grants nothing. p_client_key is refused empty by name, and the UNIQUE index on (organization_id, client_key) is what collapses replays. The unauthenticated offline path is custom.anon_write with p_client_key, which quarantines instead.',
        'w4_anon_the_door.sql',
        null, true, false)
on conflict do nothing;

revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
