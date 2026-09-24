-- target: branch,production
-- additive: yes
--   It ADDS one table, `custom.anon_form_draft` (a stranger's unfinished answers, reached by the
--   hash of a secret only they hold), four functions (`custom.form_draft_save`,
--   `custom.form_draft_read`, `custom.form_redirect_domains`, `custom.form_redirect_refusal`),
--   two `platform.client_callable_door` rows and four `platform.feature_knob` rows
--   (`custom/form_draft_days`, `custom/form_draft_max_bytes`, `custom/form_draft_saves_per_hour`,
--   `custom/form_redirect_domains`). It REPLACES three live bodies, each by one added block:
--   `custom.form_submit` marks the stranger's saved place sent in the same transaction,
--   `custom.form_declare` judges the thank-you screen's redirect, `custom.form_public` stops
--   handing out a redirect the organization no longer vouches for. Nothing is dropped, granted or
--   revoked; no row of anybody's data is rewritten. The grant to the server lane is the chair step
--   `uichamp_s7_the_server_lane_can_keep_a_strangers_place.sql`. The inverse is
--   `migrations/inverse/uichamp_s7_a_stranger_can_stop_and_come_back_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform
-- lane: S7-PRIME
-- based-on: custom.form_submit(uuid, text, jsonb, text, text, text) a5fe387a02522b991176f40b6664f46628182d9de43fbfa0e1213f68f2ad8b50
-- based-on: custom.form_declare(uuid, uuid, text, jsonb, jsonb, integer, uuid, uuid, uuid, text) b2b84e67efc37ea268447ca1b7134ba4a427ab24797dab17675be94a158d7834
-- based-on: custom.form_public(uuid) 9f4f866b971293f31cf4481157caa0e36700e64d3c54ec0edcf1f66d825de76e
--
-- LANE S7-PRIME (UI-CHAMPIONS-PLAN rev 2, rows 34, 35, 40) — A PUBLIC FORM A STRANGER CAN
-- START FROM A LINK THAT ALREADY KNOWS SOMETHING, STOP, COME BACK TO ON ANOTHER DEVICE, AND
-- LEAVE BY THE DOOR ITS OWNER CHOSE.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE REAL USE CASE
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Ridgeline Physical Therapy's new-patient intake. A referring clinic sends its patients a link
-- that already says which clinic referred them (`?referring_clinic=Harbor+Sports+Medicine`, prefill
-- by link — no store part: the page hands those answers to the SAME asks door FORMS-FIX-1 built,
-- so the questions that depend on them branch exactly as if the patient had typed them). The
-- patient answers half the questions on her phone in the waiting room and stops. The page has
-- kept her place (`custom.form_draft_save`) and shows her a link to finish later; that evening
-- she opens it on her laptop (`custom.form_draft_read`), finishes, and sends. The thank-you
-- screen says the next step in the clinic's own words, or sends her to the clinic's own booking
-- page — and only ever to the clinic's own site.
--
-- CENSUS (read from the clone's catalog, 2026-09-23):
--   · `custom.anon_submission` is what a stranger SENT. Six doors count or list it
--     (`form_public` and `form_submit` for the cap, `anon_submissions`, `forms`, the booking
--     doors). A draft written there as a new `state` would have to be excluded from each of them
--     and from every one written later — the class of bug where an unfinished answer inflates the
--     owner's held count. So a saved place is its OWN TABLE, and nothing that counts
--     submissions can see it.
--   · Nothing reads a redirect today: `presentation.thank_you` is `{title, body}` and the runner
--     shows it. No organization-level "allowed sites" exists anywhere in the catalog; the
--     organization's `website` does, and it is the default here.
--
-- FIVE DECISIONS, EACH WITH ITS REASON
-- ------------------------------------
-- 1. A SAVED PLACE IS REACHED BY A SECRET, NEVER BY WHO YOU ARE. The stranger has no account. The
--    first save mints 192 random bits, answers them ONCE, and stores only their sha256 (the
--    embed token's own posture, `custom.anon_token_verify`). The page keeps the secret in the
--    browser and offers it as a link, so "resume on a second device" is that link. A wrong key
--    and a key for another form answer the same.
-- 2. A SAVED PLACE IS NEVER A SUBMISSION. It is never a record, never held, never counted toward
--    a cap, never listed to the owner. `custom.form_submit` is the only door that turns answers
--    into anything; it now also marks the saved place sent and EMPTIES its answers in the same
--    transaction, because the submission holds them now and a second copy of someone's intake
--    answers kept for a month is a copy nobody asked for. The page sends the saved place's
--    secret as the client key, which is also exactly the idempotency key a double-click needs.
-- 3. IT EXPIRES BY A KNOB. `custom/form_draft_days` (30) after the LAST save; a read after that
--    says the answers are gone, in words, and the form starts fresh. Size and pump limits are
--    knobs too, and starting a new saved place spends the form's own rate bucket under a
--    `draft:` prefix, so a bot cannot mint saved places and a person never spends the budget
--    that sending needs.
-- 4. THE SAME SCOPE AS SENDING. A key the form does not ask for is refused BY NAME, exactly as
--    `custom.form_submit` refuses it; a question taken out since the save is dropped on read.
-- 5. A REDIRECT IS AN ADDRESS A STRANGER IS SENT TO, SO IT HAS ONE RULE. A secure page on one of
--    the organization's own sites: its website's domain, and the list in
--    `custom/form_redirect_domains`, each covering its subdomains — an exact domain or a
--    subdomain, never a suffix match. `custom.form_declare` refuses anything else by name with
--    the list it may use; `custom.form_public` stops handing out a redirect whose site has left
--    the list. An open redirect on a public link is a phishing tool; Typeform and Tally allow
--    any URL, and we deliberately do not.
--
-- LOCKS. create table / index / function, one CREATE OR REPLACE per replaced body, inserts into
-- two registries, comments. No ACCESS EXCLUSIVE on any relation the file does not create.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE FOUR KNOBS. Every number and list below is an organization's to change.
-- ─────────────────────────────────────────────────────────────────────────────────────────

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'form_draft_days', '30'::jsonb, '30'::jsonb, 'integer', 'days', 1, 365,
   'How long a stranger''s unfinished answers are kept',
   'A person answering a public form who stops part-way has their answers saved under a private key only their browser (or the link they copied) holds. This is how many days after their LAST save those answers are kept before the saved place stops answering. Nothing unfinished is ever a record, and nothing unfinished counts as a held answer.',
   'agent', 'Lane S7-PRIME 2026-09-23: UI-CHAMPIONS-PLAN rev 2 names 30 days — a patient who starts an intake form at the referral and finishes it the week of the visit still finds it.',
   date '2026-12-23', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb),
  ('custom', 'form_draft_max_bytes', '65536'::jsonb, '65536'::jsonb, 'integer', 'bytes', 1024, 1048576,
   'Largest set of unfinished answers one saved place keeps',
   'The ceiling on the answers one saved place holds. A long intake form with every question answered at length is a few kilobytes; past this the save is refused by name and nothing already saved is lost.',
   'agent', 'Lane S7-PRIME 2026-09-23: 64 KB is a hundred long answers; files never travel here (they are S8''s upload door).',
   date '2026-12-23', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb),
  ('custom', 'form_draft_saves_per_hour', '240'::jsonb, '240'::jsonb, 'integer', 'saves', 10, 10000,
   'Most times one saved place may be saved in an hour',
   'Answers are saved as a person moves through a form, a moment after they stop typing. This caps how often one saved place is rewritten in an hour, so a script cannot turn a public link into a write pump. A person never reaches it: one save per question, even a hundred questions, is well inside it.',
   'agent', 'Lane S7-PRIME 2026-09-23: four saves a minute for an hour is far past any person and far below a pump.',
   date '2026-12-23', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb),
  ('custom', 'form_redirect_domains', '[]'::jsonb, '[]'::jsonb, 'json', null, null, null,
   'Sites a form may send people to after they answer',
   'A form can send the person who answered it on to another page — "book your first visit", a payment page, a scheduling page. It may only be a secure page on one of the organization''s own sites: its website (read from the organization itself) and the domains listed here, each also covering its subdomains. An address anywhere else is refused when the form is saved, and stops being handed out the moment its domain leaves this list.',
   'agent', 'Lane S7-PRIME 2026-09-23: an open redirect on a public link is a phishing tool; the organization''s own website is the default, so a clinic with a website needs to set nothing.',
   date '2026-12-23', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE SAVED PLACE. One row per person part-way through one form. It is NOT a submission:
-- `custom.anon_submission` is what a stranger SENT, and nothing here is sent until
-- `custom.form_submit` takes it — so no owner's count, list, cap or held number ever sees
-- it. It is reached by the hash of a secret only the stranger holds; the secret itself is
-- never stored.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create table custom.anon_form_draft (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null,
  form_id         uuid        not null,
  secret_hash     text        not null,
  answers         jsonb       not null default '{}'::jsonb,
  saves           integer     not null default 1,
  window_start    timestamptz not null default now(),
  window_saves    integer     not null default 1,
  created_at      timestamptz not null default now(),
  saved_at        timestamptz not null default now(),
  expires_at      timestamptz not null,
  submitted_at    timestamptz,
  submission_id   uuid,
  remote_origin   text,
  deleted_at      timestamptz,
  constraint anon_form_draft_answers_is_an_object check (jsonb_typeof(answers) = 'object')
);

create unique index anon_form_draft_secret_hash_idx
  on custom.anon_form_draft (secret_hash) where deleted_at is null;
create index anon_form_draft_organization_id_form_id_idx
  on custom.anon_form_draft (organization_id, form_id);

alter table custom.anon_form_draft enable row level security;

comment on table custom.anon_form_draft is
  'S7-PRIME (2026-09-23): a stranger''s unfinished answers to one public form, reached only by the sha256 of a secret the stranger holds. Written only by custom.form_draft_save and consumed by custom.form_submit (the client key IS the secret). Never a record, never a submission, never counted as held. Kept custom/form_draft_days after the last save.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE REDIRECT RULE, WRITTEN ONCE. form_declare refuses with it; form_public re-asks it.
-- ─────────────────────────────────────────────────────────────────────────────────────────

-- The organization's own sites: its website's domain (a leading "www." dropped, so the whole
-- site counts) and every domain in custom/form_redirect_domains, lower-cased, deduplicated.
create function custom.form_redirect_domains(p_organization_id uuid)
returns text[]
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_list    jsonb;
  v_site    text;
  v_domains text[] := array[]::text[];
  v_d       text;
begin
  begin
    v_list := platform.knob_resolve('custom', 'form_redirect_domains', p_organization_id);
  exception when others then
    v_list := '[]'::jsonb;
  end;
  if jsonb_typeof(v_list) = 'array' then
    for v_d in select jsonb_array_elements_text(v_list) loop
      v_d := lower(btrim(v_d));
      v_d := regexp_replace(v_d, '^[a-z][a-z0-9+.-]*://', '');
      v_d := split_part(split_part(split_part(v_d, '/', 1), ':', 1), '?', 1);
      v_d := regexp_replace(v_d, '^\*\.', '');
      v_d := rtrim(v_d, '.');
      if v_d ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
         and not (v_d = any (v_domains)) then
        v_domains := v_domains || v_d;
      end if;
    end loop;
  end if;

  select o.website into v_site from iam.organizations o where o.id = p_organization_id;
  v_site := lower(btrim(coalesce(v_site, '')));
  if v_site <> '' then
    v_site := regexp_replace(v_site, '^[a-z][a-z0-9+.-]*://', '');
    v_site := split_part(split_part(split_part(v_site, '/', 1), ':', 1), '?', 1);
    v_site := rtrim(regexp_replace(v_site, '^www\.', ''), '.');
    if v_site ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
       and not (v_site = any (v_domains)) then
      v_domains := v_site || v_domains;
    end if;
  end if;
  return v_domains;
end;
$fn$;

comment on function custom.form_redirect_domains(uuid) is
  'S7-PRIME: the sites a form of this organization may send a person to after they answer — the domain of iam.organizations.website plus custom/form_redirect_domains, each covering its subdomains.';

-- NULL when the address may be used; otherwise the sentence that says why not. A secure page
-- (https), a plain host (no user name before an @, no spaces), on one of the organization's
-- own sites — an exact domain or a subdomain of one, never a suffix match
-- ("evil-cedarridge.com" is not "cedarridge.com").
create function custom.form_redirect_refusal(p_organization_id uuid, p_url text)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_url     text := btrim(coalesce(p_url, ''));
  v_host    text;
  v_domains text[];
  v_d       text;
begin
  if v_url = '' then return null; end if;
  if length(v_url) > 2000 then
    return 'That address is longer than a web address can be, so the form cannot send anyone to it.';
  end if;
  v_host := lower(substring(v_url from '^[Hh][Tt][Tt][Pp][Ss]://([A-Za-z0-9.-]+)(?::[0-9]{1,5})?(?:[/?#][^[:space:]]*)?$'));
  if v_host is null then
    return format('A form can only send people on to a secure web page, so the address has to start with https:// and name a site — "%s" does not.',
                  left(v_url, 120));
  end if;
  v_host := rtrim(v_host, '.');
  v_domains := custom.form_redirect_domains(p_organization_id);
  foreach v_d in array v_domains loop
    if v_host = v_d or right(v_host, length(v_d) + 1) = '.' || v_d then
      return null;
    end if;
  end loop;
  if array_length(v_domains, 1) is null then
    return format('A form can only send people on to this organization''s own sites, and it has none yet, so %s cannot be used. Add the organization''s website, or list the site in its forms settings.',
                  v_host);
  end if;
  return format('A form can only send people on to this organization''s own sites (%s), and %s is not one of them.',
                array_to_string(v_domains, ', '), v_host);
end;
$fn$;

comment on function custom.form_redirect_refusal(uuid, text) is
  'S7-PRIME: null when a form of this organization may send a person to this address after they answer; otherwise the sentence saying why not. https only, a plain host, on custom.form_redirect_domains(org) or a subdomain of one.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- custom.form_draft_save(form, answers, secret?, bucket?, origin?) — KEEP MY PLACE.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.form_draft_save(p_form_id uuid,
                                       p_answers jsonb,
                                       p_secret text default null,
                                       p_bucket text default null,
                                       p_origin text default null)
returns table(draft_secret text, saved_at timestamptz, expires_at timestamptz, state text, message text)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f       custom.anon_form;
  v_count   bigint;
  v_exposed text[];
  v_key     text;
  v_doc     jsonb := '{}'::jsonb;
  v_days    integer;
  v_max     integer;
  v_per_hr  integer;
  v_d       custom.anon_form_draft;
  v_secret  text;
  v_hash    text;
begin
  if p_form_id is null then
    raise exception 'This form is not available.' using errcode = '23503';
  end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found or v_f.published_at is null then
    -- The same silence custom.form_public keeps: a form nobody was handed has nothing to save.
    raise exception 'This form is not available.'
      using errcode = '23503',
            hint = 'The link names no published form. It may have been mistyped, or the form may have been taken down.';
  end if;
  perform custom.assert_store_door(v_f.organization_id, 'custom.form_draft_save');

  if v_f.closed_at is not null then
    draft_secret := null; saved_at := null; expires_at := null; state := 'closed';
    message := 'This form is closed, so it is not taking any more answers and nothing was saved.';
    return next; return;
  end if;
  select count(*) into v_count from custom.anon_submission s
   where s.organization_id = v_f.organization_id and s.form_id = v_f.id and s.state <> 'rejected';
  if v_f.submission_cap is not null and v_count >= v_f.submission_cap then
    draft_secret := null; saved_at := null; expires_at := null; state := 'full';
    message := 'This form has all the answers it was set up to take, so nothing was saved.';
    return next; return;
  end if;

  if jsonb_typeof(p_answers) is distinct from 'object' then
    raise exception 'Answers to save come as one set of question and answer pairs.'
      using errcode = '22023',
            hint = 'p_answers is an object keyed by the question''s field key, exactly as custom.form_submit takes it.';
  end if;

  -- SCOPE, the submit door's own rule: a key the form does not ask for is refused BY NAME.
  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_exposed
    from jsonb_array_elements(v_f.exposed_field_keys);
  for v_key in select jsonb_object_keys(p_answers) loop
    if not (v_key = any (v_exposed)) then
      raise exception 'This form does not have a field called "%".', v_key
        using errcode = '42501',
              hint = format('It accepts: %s.', coalesce(array_to_string(v_exposed, ', '), '(nothing)'));
    end if;
    v_doc := v_doc || jsonb_build_object(v_key, p_answers -> v_key);
  end loop;

  v_days   := coalesce((platform.knob_resolve('custom', 'form_draft_days', v_f.organization_id) #>> '{}')::integer, 30);
  v_max    := coalesce((platform.knob_resolve('custom', 'form_draft_max_bytes', v_f.organization_id) #>> '{}')::integer, 65536);
  v_per_hr := coalesce((platform.knob_resolve('custom', 'form_draft_saves_per_hour', v_f.organization_id) #>> '{}')::integer, 240);

  if octet_length(v_doc::text) > v_max then
    raise exception 'These answers are too long to save part-way (% bytes; a saved place keeps up to %).',
                    octet_length(v_doc::text), v_max
      using errcode = '54000',
            hint = 'What was saved before is still there. Sending the form keeps everything; only the saved place has a ceiling, and it is a setting (custom/form_draft_max_bytes).';
  end if;

  if p_secret is not null and btrim(p_secret) <> '' then
    v_hash := encode(extensions.digest(p_secret, 'sha256'), 'hex');
    select * into v_d from custom.anon_form_draft d
     where d.secret_hash = v_hash and d.form_id = v_f.id
       and d.organization_id = v_f.organization_id and d.deleted_at is null;
    if not found then
      raise exception 'These saved answers could not be found.'
        using errcode = '42501',
              hint = 'The key does not match any saved place for this form. Start again without it and a new one is made.';
    end if;
    if v_d.submitted_at is not null then
      draft_secret := null; saved_at := v_d.saved_at; expires_at := null; state := 'submitted';
      message := format('These answers were already sent, on %s, so there is nothing left to save.',
                        to_char(v_d.submitted_at at time zone 'UTC', 'FMMonth FMDD, YYYY'));
      return next; return;
    end if;
    if v_d.expires_at >= now() then
      -- THE PUMP LIMIT, on the saved place itself: a window of an hour, counted on the row.
      if v_d.window_start > now() - interval '1 hour' and v_d.window_saves >= v_per_hr then
        draft_secret := p_secret; saved_at := v_d.saved_at; expires_at := v_d.expires_at; state := 'too_many';
        message := 'These answers were saved too many times in the last hour, so this save was skipped. What was saved before is still there.';
        return next; return;
      end if;
      update custom.anon_form_draft d
         set answers = v_doc,
             saves = d.saves + 1,
             window_start = case when d.window_start > now() - interval '1 hour' then d.window_start else now() end,
             window_saves = case when d.window_start > now() - interval '1 hour' then d.window_saves + 1 else 1 end,
             saved_at = now(),
             expires_at = now() + make_interval(days => v_days),
             remote_origin = coalesce(p_origin, d.remote_origin)
       where d.id = v_d.id and d.organization_id = v_f.organization_id
      returning d.saved_at, d.expires_at into saved_at, expires_at;
      draft_secret := p_secret; state := 'saved'; message := null;
      return next; return;
    end if;
    -- An expired saved place is not reopened: a new one is made below, and the answer says so.
  end if;

  -- A NEW SAVED PLACE costs one hit on the form's own rate bucket, in a bucket of its own
  -- ("draft:<client>"), so starting a form never spends the budget sending it needs.
  begin
    perform custom.anon_rate_take(v_f.organization_id, v_f.id,
                                  'draft:' || coalesce(nullif(btrim(p_bucket), ''), 'anonymous'), null);
  exception when sqlstate '53400' then
    draft_secret := null; saved_at := null; expires_at := null; state := 'too_many';
    message := 'That is more new answers than this form takes in one go, so nothing was saved. Try again in a little while.';
    return next; return;
  end;

  v_secret := rtrim(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '=');
  insert into custom.anon_form_draft (organization_id, form_id, secret_hash, answers, expires_at, remote_origin)
  values (v_f.organization_id, v_f.id, encode(extensions.digest(v_secret, 'sha256'), 'hex'), v_doc,
          now() + make_interval(days => v_days), p_origin)
  returning custom.anon_form_draft.saved_at, custom.anon_form_draft.expires_at into saved_at, expires_at;

  draft_secret := v_secret;
  state := 'saved';
  message := case when v_d.id is not null
                  then 'The answers saved earlier had expired, so these were saved as a new copy.'
                  else null end;
  return next;
end;
$fn$;

comment on function custom.form_draft_save(uuid, jsonb, text, text, text) is
  'S7-PRIME: keep a stranger''s place in a published public form. Answers are checked against the form''s exposed keys exactly as custom.form_submit checks them, and saved under the sha256 of a secret; a first save mints the secret and answers it ONCE (it is never stored). Never a record, never a submission, never counted. Kept custom/form_draft_days after the last save; capped by custom/form_draft_max_bytes and custom/form_draft_saves_per_hour; a new saved place costs one hit in the form''s rate bucket under "draft:<client>". server_only.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- custom.form_draft_read(form, secret) — WHERE WAS I.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.form_draft_read(p_form_id uuid, p_secret text)
returns table(answers jsonb, saved_at timestamptz, expires_at timestamptz, state text, message text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f custom.anon_form;
  v_d custom.anon_form_draft;
begin
  if p_form_id is null or p_secret is null or btrim(p_secret) = '' then return; end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  -- The same silence custom.form_public keeps for a form nobody was handed.
  if not found or v_f.published_at is null then return; end if;
  if not custom.store_is_open(v_f.organization_id) then return; end if;

  select * into v_d from custom.anon_form_draft d
   where d.secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex')
     and d.form_id = v_f.id and d.organization_id = v_f.organization_id
     and d.deleted_at is null;
  if not found then
    answers := null; saved_at := null; expires_at := null; state := 'not_found';
    message := 'These saved answers could not be found. The link may be incomplete — the form starts fresh instead.';
    return next; return;
  end if;
  if v_d.submitted_at is not null then
    answers := null; saved_at := v_d.saved_at; expires_at := null; state := 'submitted';
    message := format('These answers were already sent, on %s. There is nothing left to finish.',
                      to_char(v_d.submitted_at at time zone 'UTC', 'FMMonth FMDD, YYYY'));
    return next; return;
  end if;
  if v_d.expires_at < now() then
    answers := null; saved_at := v_d.saved_at; expires_at := v_d.expires_at; state := 'expired';
    message := format('These answers were saved on %s and were kept until %s, so they are gone. The form starts fresh.',
                      to_char(v_d.saved_at at time zone 'UTC', 'FMMonth FMDD'),
                      to_char(v_d.expires_at at time zone 'UTC', 'FMMonth FMDD'));
    return next; return;
  end if;
  if v_f.closed_at is not null then
    answers := null; saved_at := v_d.saved_at; expires_at := v_d.expires_at; state := 'closed';
    message := 'This form has closed since these answers were saved, so they can no longer be sent.';
    return next; return;
  end if;

  -- The answers, narrowed to what the form asks TODAY: a question taken out since is dropped
  -- here rather than handed back to a runner that would try to send it.
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into answers
    from jsonb_each(v_d.answers) e
   where v_f.exposed_field_keys ? e.key;
  saved_at := v_d.saved_at; expires_at := v_d.expires_at; state := 'found'; message := null;
  return next;
end;
$fn$;

comment on function custom.form_draft_read(uuid, text) is
  'S7-PRIME: a stranger''s saved place in a published public form, by the secret only they hold. found (answers, narrowed to today''s exposed keys) · submitted · expired · closed · not_found, each with its sentence. Missing, unpublished and store-off forms answer zero rows, like custom.form_public. server_only.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE TWO DOOR ROWS. Server-only, like custom.form_public and custom.form_submit.
-- ─────────────────────────────────────────────────────────────────────────────────────────

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'form_draft_save',
   'p_form_id uuid, p_answers jsonb, p_secret text, p_bucket text, p_origin text',
   array['uuid'::regtype, 'jsonb'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
   'It takes NO organization id: the form id supplies the organization, so a caller cannot name a tenant. The published form id IS the capability, exactly as custom.form_submit; the saved place is reached only by the sha256 of a secret the caller holds. Answers are refused by name for any key the form does not expose. It writes only custom.anon_form_draft and the form''s own rate bucket.',
   'uichamp_s7_a_stranger_can_stop_and_come_back.sql',
   'server_only: the public form page is server-rendered and its saves reach this door through the app''s own route handler, which alone knows the request''s real origin and client address (the rate bucket). Schema custom stays revoked from anon; this door is granted to the server lane alone, the same posture as custom.form_submit.',
   false, false,
   jsonb_build_object('version', 1, 'declared_by', 'uichamp_s7_a_stranger_can_stop_and_come_back.sql',
     'declared_at', '2026-09-23 lane S7-PRIME',
     'arguments', jsonb_build_object(
       'p_form_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'anon_form',
         'check', 'resolved with deleted_at is null and published_at is not null; a missing and an unpublished form raise the SAME 23503 sentence, so existence is never disclosed; the organization is read from the form row and handed to custom.assert_store_door.',
         'foreign', jsonb_build_object('sqlstate', '23503', 'same_as_invented', true)),
       'p_answers', jsonb_build_object('type', 'jsonb', 'position', 2,
         'check', 'an object whose every key is in the form''s exposed_field_keys (refused by name otherwise), at most custom/form_draft_max_bytes.'),
       'p_secret', jsonb_build_object('type', 'text', 'position', 3,
         'check', 'hashed (sha256) and matched on (secret_hash, form_id, organization_id); a key for another form answers exactly what an invented key answers (42501).',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true)),
       'p_bucket', jsonb_build_object('type', 'text', 'position', 4,
         'check', 'supplied by the server lane from the request, never by the browser; prefixed draft: so it never shares the submit budget.'),
       'p_origin', jsonb_build_object('type', 'text', 'position', 5,
         'check', 'recorded on the saved place only; decides nothing.')),
     'verified', '2026-09-23 lane S7-PRIME — read from this body')),
  ('custom', 'form_draft_read',
   'p_form_id uuid, p_secret text',
   array['uuid'::regtype, 'text'::regtype]::oid[],
   'It takes NO organization id: the form id supplies the organization. The published form id and the secret only the stranger holds are the capability; missing, unpublished and store-off forms answer zero rows, like custom.form_public. It reads only custom.anon_form and custom.anon_form_draft, and hands back answers narrowed to the form''s exposed keys.',
   'uichamp_s7_a_stranger_can_stop_and_come_back.sql',
   'server_only: reached through the app''s own route handler beside custom.form_public. Schema custom stays revoked from anon; granted to the server lane alone.',
   false, false,
   jsonb_build_object('version', 1, 'declared_by', 'uichamp_s7_a_stranger_can_stop_and_come_back.sql',
     'declared_at', '2026-09-23 lane S7-PRIME',
     'arguments', jsonb_build_object(
       'p_form_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'anon_form',
         'check', 'resolved with deleted_at is null and published_at is not null; missing, unpublished and store-off all answer zero rows.',
         'foreign', jsonb_build_object('rows', 0, 'same_as_invented', true)),
       'p_secret', jsonb_build_object('type', 'text', 'position', 2,
         'check', 'hashed (sha256) and matched on (secret_hash, form_id, organization_id); a key for another form answers not_found, exactly as an invented key.',
         'foreign', jsonb_build_object('state', 'not_found', 'same_as_invented', true))),
     'verified', '2026-09-23 lane S7-PRIME — read from this body'))
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE THREE REPLACED BODIES, each the live body with ONE block added (marked S7').
-- ─────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION custom.form_submit(p_form_id uuid, p_origin text, p_payload jsonb, p_bucket text, p_honeypot text DEFAULT NULL::text, p_client_key text DEFAULT NULL::text)
 RETURNS TABLE(submission_id uuid, record_id uuid, state text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f        custom.anon_form;
  v_count    bigint;
  v_exposed  text[];
  v_required text[];
  v_missing  text[];
  v_key      text;
  v_doc      jsonb := '{}'::jsonb;
  v_existing uuid;
  v_id       uuid;
  v_rec      uuid;
begin
  if p_form_id is null then
    raise exception 'This form is not available.' using errcode = '23503';
  end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found then
    raise exception 'This form is not available.'
      using errcode = '23503',
            hint = 'The link names no form. It may have been mistyped, or the form may have been taken down.';
  end if;
  perform custom.assert_store_door(v_f.organization_id, 'custom.form_submit');

  -- CLOSED BY DEFAULT, the same three words custom.anon_write says.
  if v_f.published_at is null then
    raise exception 'This form is not accepting responses.'
      using errcode = '42501',
            hint = 'It exists but has never been published. Whoever owns it publishes it; until then nothing can be submitted, which is the point of the default.';
  end if;
  if v_f.closed_at is not null then
    submission_id := null; record_id := null; state := 'closed';
    message := 'This form is closed, so it is not taking any more answers.';
    return next; return;
  end if;

  -- THE DECOY, ANSWERED FIRST AND ANSWERED CHEERFULLY. See this file's header, decision 5.
  if v_f.honeypot_key is not null and coalesce(btrim(p_honeypot), '') <> '' then
    insert into custom.anon_submission (organization_id, form_id, table_id, source, payload,
                                        raw_payload, client_key, state, remote_origin,
                                        rejection_reason)
    values (v_f.organization_id, v_f.id, v_f.table_id, 'form', '{}'::jsonb,
            jsonb_build_object('form_id', v_f.id, 'at', now(), 'origin', p_origin,
                               'honeypot', true),
            p_client_key, 'rejected', p_origin,
            format('The decoy field "%s" was filled in, which a person answering this form never does. Nothing was written and the sender was shown the thank-you screen.',
                   v_f.honeypot_key))
    returning id into v_id;
    submission_id := v_id; record_id := null; state := 'accepted';
    message := null; return next; return;
  end if;

  -- IDEMPOTENCY BEFORE RATE, so a replay costs no budget and makes no second row.
  if p_client_key is not null then
    select s.id, s.record_id into v_existing, v_rec from custom.anon_submission s
     where s.organization_id = v_f.organization_id and s.form_id = v_f.id
       and s.client_key = p_client_key;
    if v_existing is not null then
      submission_id := v_existing; record_id := v_rec; state := 'accepted';
      message := 'This answer had already arrived, so it was not written twice.';
      return next; return;
    end if;
  end if;

  select count(*) into v_count from custom.anon_submission s
   where s.organization_id = v_f.organization_id and s.form_id = v_f.id and s.state <> 'rejected';
  if v_f.submission_cap is not null and v_count >= v_f.submission_cap then
    submission_id := null; record_id := null; state := 'full';
    message := 'This form has all the answers it was set up to take.';
    return next; return;
  end if;

  -- THE RATE LIMIT, on the bucket the SERVER chose (a coarse client identifier). A
  -- browser choosing its own bucket would be counting itself.
  begin
    perform custom.anon_rate_take(v_f.organization_id, v_f.id,
                                  coalesce(nullif(btrim(p_bucket), ''), 'anonymous'), null);
  exception when sqlstate '53400' then
    submission_id := null; record_id := null; state := 'too_many';
    message := 'That is more answers than this form takes in one go. Try again in a little while.';
    return next; return;
  end;

  -- SCOPE. A key the form does not ask for is refused BY NAME, never trimmed in silence.
  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_exposed
    from jsonb_array_elements(v_f.exposed_field_keys);
  for v_key in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
    if not (v_key = any (v_exposed)) then
      raise exception 'This form does not have a field called "%".', v_key
        using errcode = '42501',
              hint = format('It accepts: %s.', coalesce(array_to_string(v_exposed, ', '), '(nothing)'));
    end if;
    v_doc := v_doc || jsonb_build_object(v_key, p_payload -> v_key);
  end loop;

  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_required
    from jsonb_array_elements(v_f.required_field_keys);
  select coalesce(array_agg(k), array[]::text[]) into v_missing
    from unnest(v_required) k
   where coalesce(p_payload -> k, 'null'::jsonb) in ('null'::jsonb, '""'::jsonb);
  if array_length(v_missing, 1) > 0 then
    raise exception 'This form needs %.', array_to_string(v_missing, ', ')
      using errcode = '22004',
            hint = 'Each missing field is named so the screen can point at it, rather than showing one error beside a form with twenty questions.';
  end if;

  -- QUARANTINE. `custom.record` is not touched here, and the provenance travels with the
  -- submission so the record made from it can always say where it came from.
  insert into custom.anon_submission (organization_id, form_id, table_id, source, payload,
                                      raw_payload, client_key, state, remote_origin)
  values (v_f.organization_id, v_f.id, v_f.table_id, 'form', v_doc,
          jsonb_build_object('form_id', v_f.id, 'form_slug', v_f.slug,
                             'form_version', v_f.version, 'at', now(),
                             'origin', p_origin, 'via', 'form'),
          p_client_key, 'quarantined', p_origin)
  returning id into v_id;

  if p_client_key is not null then
    insert into custom.anon_replay (organization_id, client_key, table_id, submission_id, captured_at)
    values (v_f.organization_id, p_client_key, v_f.table_id, v_id, now())
    on conflict (organization_id, client_key) where deleted_at is null do nothing;
  end if;

  -- S7': THE STRANGER'S SAVED PLACE IS USED UP BY THE ANSWER IT BECAME. When the page saved
  -- progress for this person it sends that saved place's key as the client key, so the one
  -- send that turns the answers into a submission also marks the saved place sent, in this
  -- same transaction. Its answers are emptied — they live in the submission now, and a second
  -- copy of somebody's intake answers kept for a month would be a copy nobody asked for.
  if p_client_key is not null then
    update custom.anon_form_draft d
       set submitted_at = now(), submission_id = v_id, answers = '{}'::jsonb
     where d.organization_id = v_f.organization_id
       and d.form_id = v_f.id
       and d.secret_hash = encode(extensions.digest(p_client_key, 'sha256'), 'hex')
       and d.submitted_at is null
       and d.deleted_at is null;
  end if;

  -- THE ACCEPT RULE. With one, the answer becomes a record now; with none, it waits for a
  -- person and this function SAYS SO instead of implying it landed.
  if v_f.quarantine_rule_id is not null then
    v_rec := custom.anon_clear(v_f.organization_id, v_id);
  end if;

  if v_rec is not null then
    perform custom.form_notify(v_f.organization_id, v_f.id, v_rec, v_id);
    submission_id := v_id; record_id := v_rec; state := 'accepted'; message := null;
  elsif v_f.quarantine_rule_id is null then
    submission_id := v_id; record_id := null; state := 'held';
    message := 'Your answer arrived and is waiting for someone to look at it.';
  else
    select s.rejection_reason into message from custom.anon_submission s
     where s.organization_id = v_f.organization_id and s.id = v_id;
    submission_id := v_id; record_id := null; state := 'held';
    message := coalesce(message, 'Your answer arrived and is waiting for someone to look at it.');
  end if;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.form_declare(p_organization_id uuid, p_table_id uuid, p_title text, p_questions jsonb, p_presentation jsonb DEFAULT '{}'::jsonb, p_submission_cap integer DEFAULT NULL::integer, p_quarantine_rule_id uuid DEFAULT NULL::uuid, p_notify_rule_id uuid DEFAULT NULL::uuid, p_form_id uuid DEFAULT NULL::uuid, p_slug text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user     uuid := custom.query_principal();
  v_keys     text[];
  v_q        jsonb;
  v_key      text;
  v_exposed  text[] := array[]::text[];
  v_required text[] := array[]::text[];
  v_slug     text;
  v_id       uuid;
  v_hp       text;
  v_present  jsonb;
  -- The accept Rule this door makes when the caller brought none.
  v_accept   uuid := p_quarantine_rule_id;
  v_ids      uuid[] := array[]::uuid[];
  v_fid      uuid;
  v_expr     jsonb;
  v_args     jsonb := '[]'::jsonb;
  v_aname    text;
  v_redirect text;
  v_said     text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.form_declare');

  -- A FORM DECIDES WHAT STRANGERS MAY WRITE INTO A TABLE, so declaring one is an admin
  -- act on that Table — the same rung custom.anon_publish already asks for. Asking less
  -- here and more at publish would let anyone assemble the loaded gun and only check who
  -- pulls the trigger.
  if v_user is null then
    raise exception 'Nobody is signed in, so no form can be made.'
      using errcode = '42501',
            hint = 'custom.form_declare is the owner''s side of a form. The public side — custom.form_public and custom.form_submit — is the one that has no principal.';
  end if;
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.form_declare',
                                          'admin'::public.permission_level, 'table');

  -- The subject has to be a TABLE of this organization, and the fields it declares are
  -- the only things a question may ask for.
  select array_agg(f ->> 'name') into v_keys
    from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_keys is null then
    raise exception 'There is no table % in this organization to make a form for.', p_table_id
      using errcode = '23503',
            hint = 'A form is a view on a real Table (SCR-13). Make the Table first — every question is one of its Fields and every answer is one of its records.';
  end if;

  if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'A form has to ask something.'
      using errcode = '22004',
            hint = 'questions is a list of {"field": "<the field''s key on this table>", "ask": "…", "help": "…", "required": true|false}. The field key is the address; ask and help are this form''s own words for it.';
  end if;

  for v_q in select value from jsonb_array_elements(p_questions) loop
    v_key := nullif(btrim(coalesce(v_q ->> 'field', v_q ->> 'key', '')), '');
    if v_key is null then
      raise exception 'One of this form''s questions does not say which field it asks for.'
        using errcode = '22004',
              hint = 'Every question names a Field of the subject table by key. The table''s fields are: ' || array_to_string(v_keys, ', ') || '.';
    end if;
    if not (v_key = any (v_keys)) then
      raise exception 'This table has no field called "%", so the form cannot ask for it.', v_key
        using errcode = '23503',
              hint = format('Its fields are: %s. Add the Field first, or ask for one that is there — a question with nowhere to land is an answer nobody can read.',
                            array_to_string(v_keys, ', '));
    end if;
    if not (v_key = any (v_exposed)) then
      v_exposed := v_exposed || v_key;
    end if;
    if coalesce((v_q ->> 'required')::boolean, false) and not (v_key = any (v_required)) then
      v_required := v_required || v_key;
    end if;
  end loop;

  -- ─────────────────────────────────────────────────────────────────────────
  -- THE ACCEPT RULE, WHEN NOBODY BROUGHT ONE.
  --
  -- Without it `custom.form_submit` holds every answer for a person and the
  -- form is a drawer. The Rule is REC-15's own shape, referencing Fields BY ID
  -- (REC-17) — a Rule naming a field by its KEY is refused, and it is right to.
  -- With nothing required the test is honestly a constant, and it says so in
  -- its own name rather than pretending to check something.
  -- ─────────────────────────────────────────────────────────────────────────
  if v_accept is null then
    foreach v_key in array v_required loop
      select r.id into v_fid
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.field_kernel_id()
         and r.deleted_at is null
         and r.data ->> 'key' = v_key
         and nullif(r.data ->> 'table_id', '')::uuid = p_table_id
       limit 1;
      if v_fid is not null then
        v_ids := v_ids || v_fid;
      end if;
    end loop;

    if array_length(v_ids, 1) is null then
      v_expr := jsonb_build_object('const', true);
      v_aname := coalesce(nullif(btrim(p_title), ''), 'This form') || ': take every answer';
    else
      foreach v_fid in array v_ids loop
        v_args := v_args || jsonb_build_array(
          jsonb_build_object('op', 'present',
                             'args', jsonb_build_array(jsonb_build_object('field', v_fid))));
      end loop;
      if jsonb_array_length(v_args) = 1 then
        v_expr := v_args -> 0;
      else
        v_expr := jsonb_build_object('op', 'and', 'args', v_args);
      end if;
      v_aname := coalesce(nullif(btrim(p_title), ''), 'This form')
                 || ': every answer it asks for is there';
    end if;

    v_accept := custom.rule_declare(p_organization_id, jsonb_build_object(
      'name', v_aname,
      'kind', 'predicate',
      -- V11-C (2026-09-22): `membership`, NOT `validate`. See this file's header.
      'uses', jsonb_build_array('membership'),
      'scope_table_id', p_table_id,
      'applies_to_types', '[]'::jsonb,
      'expr', v_expr,
      'description',
        'DOOR-17: an anonymous answer lands quarantined and becomes a record only when '
        || 'this Rule admits it. It is the form''s validation and its release in one '
        || 'object, so the two cannot disagree. Made by custom.form_declare because the '
        || 'caller brought none — without it every answer is held for a person forever. '
        || 'V11-C: its use is `membership` — it says which SUBMISSIONS this form admits, '
        || 'which is what custom.anon_clear asks it through custom.rule_run. A `validate` '
        || 'use would enlist it in the table''s write-time checks and make the form''s '
        || 'questions compulsory for every record anybody writes by any route.'
    ), null);
  end if;

  -- The presentation carries the questions as the form WORDS them; the answerable key
  -- list is what the door enforces. One object, two readers, no third place to drift.
  v_present := coalesce(p_presentation, '{}'::jsonb) || jsonb_build_object('questions', p_questions);

  -- ─────────────────────────────────────────────────────────────────────────
  -- S7': WHAT THE STRANGER SEES AFTER SENDING, JUDGED HERE, ONCE.
  --
  -- `thank_you` is {title, body, redirect_url}. The message is the form's own words. The
  -- redirect is optional and it is an ADDRESS a stranger's browser is sent to, so it is held
  -- to one rule: a secure page on one of this organization's own sites — its website, and the
  -- list it keeps in `custom/form_redirect_domains`. Anything else is refused by name with the
  -- list it may use, never quietly dropped: the owner typed it and expects it to work.
  -- ─────────────────────────────────────────────────────────────────────────
  if jsonb_typeof(v_present -> 'thank_you') is not null
     and jsonb_typeof(v_present -> 'thank_you') not in ('object', 'null') then
    raise exception 'The thank-you screen has to be a title, a message and an optional address, not %.',
                    jsonb_typeof(v_present -> 'thank_you')
      using errcode = '22023',
            hint = 'presentation.thank_you is {"title": "…", "body": "…", "redirect_url": "https://…"}; every part may be left out.';
  end if;
  if jsonb_typeof(v_present -> 'thank_you') = 'object' then
    v_redirect := nullif(btrim(coalesce(v_present #>> '{thank_you,redirect_url}', '')), '');
    if v_redirect is null then
      v_present := v_present #- '{thank_you,redirect_url}';
    else
      v_said := custom.form_redirect_refusal(p_organization_id, v_redirect);
      if v_said is not null then
        raise exception '%', v_said
          using errcode = '22023',
                hint = 'Leave the address empty and the thank-you message is shown instead. An organization''s own sites are its website and the list in its forms settings (custom/form_redirect_domains).';
      end if;
      v_present := jsonb_set(v_present, '{thank_you,redirect_url}', to_jsonb(v_redirect));
    end if;
  end if;

  if p_form_id is not null then
    select honeypot_key into v_hp from custom.anon_form
     where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
    if v_hp is null and not found then
      raise exception 'There is no form % in this organization.', p_form_id
        using errcode = '23503';
    end if;
  end if;
  -- ONE decoy per form, minted once and kept, so a bot cannot learn the name by watching
  -- two forms. `extensions.` is written out because search_path is pg_catalog here.
  v_hp := coalesce(v_hp, 'confirm_' || encode(extensions.gen_random_bytes(5), 'hex'));
  v_slug := coalesce(nullif(btrim(p_slug), ''), custom.form_slug(p_organization_id, p_title, p_form_id));

  if p_form_id is null then
    insert into custom.anon_form (organization_id, table_id, slug, title, exposed_field_keys,
                                  required_field_keys, presentation, submission_cap,
                                  quarantine_rule_id, notify_rule_id, honeypot_key)
    values (p_organization_id, p_table_id, v_slug, nullif(btrim(p_title), ''),
            to_jsonb(v_exposed), to_jsonb(v_required), v_present, p_submission_cap,
            v_accept, p_notify_rule_id, v_hp)
    returning id into v_id;
  else
    update custom.anon_form
       set table_id = p_table_id,
           slug = v_slug,
           title = nullif(btrim(p_title), ''),
           exposed_field_keys = to_jsonb(v_exposed),
           required_field_keys = to_jsonb(v_required),
           presentation = v_present,
           submission_cap = p_submission_cap,
           quarantine_rule_id = v_accept,
           notify_rule_id = p_notify_rule_id,
           honeypot_key = v_hp
     where organization_id = p_organization_id and id = p_form_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'There is no form % in this organization.', p_form_id
        using errcode = '23503';
    end if;
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.form_public(p_form_id uuid)
 RETURNS TABLE(form_id uuid, organization_id uuid, table_id uuid, title text, presentation jsonb, fields jsonb, honeypot_key text, state text, message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f      custom.anon_form;
  v_count  bigint;
  v_state  text;
  v_msg    text;
  v_fields jsonb;
begin
  if p_form_id is null then return; end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found then return; end if;
  -- A form that was never published is still silence: nobody was handed this address.
  if v_f.published_at is null then return; end if;

  -- ── STORE-OFF: PUBLISHED, AND THE SWITCH IS DOWN. ───────────────────────────────────────
  -- The holder of this link was given it by this organization. Answering nothing told them
  -- our product had lost their page. Their questions are NOT returned with it: `presentation`
  -- and `fields` are emptied, so the link says only that it is switched off and by whom.
  if not custom.store_is_open(v_f.organization_id) then
    form_id := v_f.id; organization_id := v_f.organization_id; table_id := v_f.table_id;
    title := coalesce(v_f.title, 'Form'); presentation := '{}'::jsonb;
    fields := '[]'::jsonb; honeypot_key := null;
    state := 'unavailable'; message := custom.store_off_sentence(v_f.organization_id);
    return next;
    return;
  end if;

  select count(*) into v_count from custom.anon_submission s
   where s.organization_id = v_f.organization_id and s.form_id = v_f.id and s.state <> 'rejected';

  if v_f.closed_at is not null then
    v_state := 'closed';
    v_msg := 'This form is closed, so it is not taking any more answers.';
  elsif v_f.submission_cap is not null and v_count >= v_f.submission_cap then
    v_state := 'full';
    v_msg := 'This form has all the answers it was set up to take.';
  else
    v_state := 'open';
    v_msg := null;
  end if;

  -- EXACTLY the exposed Fields, as the store holds them, each carrying its own id —
  -- the same `{id, ...data}` shape every other reader of a Field builds.
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id) || f.data order by ord), '[]'::jsonb)
    into v_fields
    from jsonb_array_elements_text(v_f.exposed_field_keys) with ordinality k(key, ord)
    join custom.record f
      on f.organization_id = v_f.organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_f.table_id
     and f.data ->> 'key' = k.key;

  form_id := v_f.id; organization_id := v_f.organization_id; table_id := v_f.table_id;
  title := coalesce(v_f.title, 'Form'); presentation := v_f.presentation;
  -- S7': A REDIRECT IS ONLY HANDED OUT WHILE IT IS STILL ONE OF THE ORGANIZATION'S OWN SITES.
  -- custom.form_declare refuses a foreign address when the form is saved; this is the other
  -- half, for a site the organization has since taken off its list. The stranger is then shown
  -- the thank-you message instead of being sent somewhere the organization no longer vouches for.
  if nullif(btrim(coalesce(presentation #>> '{thank_you,redirect_url}', '')), '') is not null
     and custom.form_redirect_refusal(v_f.organization_id, presentation #>> '{thank_you,redirect_url}') is not null then
    presentation := presentation #- '{thank_you,redirect_url}';
  end if;
  fields := v_fields; honeypot_key := v_f.honeypot_key; state := v_state; message := v_msg;
  return next;
end;
$function$;
