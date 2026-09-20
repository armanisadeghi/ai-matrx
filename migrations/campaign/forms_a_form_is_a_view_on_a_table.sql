-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- LANE FORMS — PRODUCTS row 1, *"Make me an intake form for new patients that texts me
-- when one arrives."* The primitive it adds is P2, the anonymous write door (DOOR-17),
-- which W4-ANON already built. This file is what turns that door into a PRODUCT.
--
-- WHAT WAS ALREADY THERE, AND WHY THIS FILE IS SMALL BECAUSE OF IT
-- ---------------------------------------------------------------
-- `custom.anon_form` (the published surface, closed by default), `custom.anon_token`
-- (embed tokens), `custom.anon_submission` (the quarantine), `custom.anon_hit` (the rate
-- limit as rows), `custom.anon_publish` (the one act that opens a form),
-- `custom.anon_rate_take`, `custom.anon_clear` (the Rule that turns a submission into a
-- record) — all live. `custom.agg_subscriptions` / `custom.agg_deliver` (DOOR-18) are the
-- notification. `platform.saved_view` is the view. None of that is rebuilt here.
--
-- THE HOLE THIS FILE FILLS, IN ONE SENTENCE: **nothing could create a form.**
-- `custom.anon_form` had no declaring door, so `custom.anon_publish(org, form_id)` took a
-- form id that no caller could ever obtain, and `custom.anon_write` was reachable only
-- through an embed token issued against a form that did not exist. A door onto a table
-- nobody can put a row in is a door onto nothing.
--
-- FIVE DECISIONS, EACH WITH ITS REASON
-- ------------------------------------
-- 1. THE PUBLIC LINK IS THE FORM'S OWN ID, and nothing else. 122 bits of UUIDv4 is the
--    capability, exactly as `communication.meet_meeting_by_slug`'s unguessable slug is,
--    and exactly as Typeform's form id in `https://form.typeform.com/to/<id>` is. It is
--    deliberately NOT `iam.publish_binding`: that mechanism is P10 (product 12, the public
--    catalogue), it demands the WORLD lane, a human-readable 3-to-64-character slug and
--    the `custom/external_principal_enabled` switch, and a form link that a stranger can
--    guess is not a form link. The PUBLISH BINDING is `custom.anon_form.published_at` —
--    the explicit act, by a person holding `admin` on the Table, that the store already
--    had.
--
-- 2. THE SERVER IS THE CALLER, so `anon` gains nothing here. `custom.form_public` and
--    `custom.form_submit` are declared `server_only` beside `custom.anon_write`, for the
--    same reason its own row gives: the origin of a request and the client's address are
--    things the SERVER knows and a browser can only assert. A browser handing a door its
--    own origin is not a check. Schema `custom` stays revoked from `anon`, which is
--    W4-ANON's posture, unchanged.
--
-- 3. A SUBMISSION IS STILL QUARANTINED (DOOR-17's law). This file does not add an
--    "auto-accept" flag, because a flag is a Rule-shaped decision wearing a boolean. What
--    makes a patient-intake form land in the table is a real accept Rule on the form
--    (`quarantine_rule_id`) — which is also the form's validation, so the two are one
--    object and cannot disagree. A form with no accept Rule holds every answer for a
--    person, and `custom.form_submit` SAYS SO in its answer rather than pretending.
--
-- 4. THE NOTIFY RULE IS A SUBSCRIPTION RULE (DOOR-18), not a second mechanism.
--    `custom.form_notify` reads the form's `notify_rule_id` through
--    `custom.agg_subscriptions` — the same reader `custom.agg_subscription_fire` uses —
--    and delivers through `custom.agg_deliver` into `communication.notification`. What it
--    skips, on purpose, is `custom.agg_view_admits`: that helper answers "does this saved
--    view admit this record" under the CURRENT principal, and the current principal on a
--    form submission is nobody. The form IS the membership test — a record that arrived
--    through this form is in scope for this form's subscription by construction — so the
--    view is not asked and the code says why instead of quietly returning zero.
--
-- 5. THE HONEYPOT ANSWERS THE BOT WITH THE THANK-YOU SCREEN. That is not a screen lying:
--    the person it lies to is a script, and the person who matters — the form's owner —
--    gets a `custom.anon_submission` row in state `rejected` whose `rejection_reason` says
--    in words that the decoy field was filled. A honeypot that announces itself is a
--    honeypot that has been disarmed.
--
-- THE INVERSE: `migrations/inverse/forms_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ─────────────────────────────────────────────────────────────────────────────
-- THE FOUR COLUMNS A FORM NEEDED AND DID NOT HAVE
--
-- `presentation` is user-facing and therefore NOT `metadata` (REC-59: metadata is
-- system-only and the two never mix). It is one jsonb rather than eight columns because
-- every key in it is presentation — the thing REC-N-15 says a Rule may never read and
-- that never changes what is stored.
-- ─────────────────────────────────────────────────────────────────────────────

alter table custom.anon_form add column if not exists presentation jsonb not null default '{}'::jsonb;
alter table custom.anon_form add column if not exists submission_cap integer;
alter table custom.anon_form add column if not exists honeypot_key text;
alter table custom.anon_form add column if not exists notify_rule_id uuid;

comment on column custom.anon_form.presentation is
  'FORMS / SCR-13: how the form is PUT IN FRONT of a person — {intro, flow (one-at-a-time|single-page), theme, thank_you {title, body}, submit_label, questions [{field, ask, help, required}]}. Presentation only (REC-N-15): no Rule reads it and nothing here changes what is stored. The questions list carries the form''s own wording; the ANSWERABLE key list is exposed_field_keys, which the door enforces.';
comment on column custom.anon_form.submission_cap is
  'FORMS: stop accepting after this many submissions. Null is uncapped. A cap is reached, not exceeded: the form says it is full in its own words rather than refusing with an error a stranger cannot act on.';
comment on column custom.anon_form.honeypot_key is
  'FORMS: the name of a decoy input rendered off-screen. A submission that fills it is stored REJECTED with the reason in words and the sender is shown the thank-you screen — the only lie this system tells is to a script.';
comment on column custom.anon_form.notify_rule_id is
  'FORMS / DOOR-18: the subscription Rule fired on each accepted submission. It is an ordinary Rule record carrying a `subscription` block, read through custom.agg_subscriptions and delivered through custom.agg_deliver — never a second notification mechanism.';

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.form_slug — a name a person can read, made unique inside one organization
-- ─────────────────────────────────────────────────────────────────────────────

create function custom.form_slug(p_organization_id uuid, p_title text, p_form_id uuid default null)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_base text;
  v_try  text;
  v_n    integer := 1;
begin
  v_base := btrim(regexp_replace(lower(coalesce(nullif(btrim(p_title), ''), 'form')),
                                 '[^a-z0-9]+', '-', 'g'), '-');
  if v_base = '' then v_base := 'form'; end if;
  v_base := left(v_base, 56);
  v_try := v_base;
  while exists (select 1 from custom.anon_form f
                 where f.organization_id = p_organization_id
                   and f.slug = v_try
                   and f.deleted_at is null
                   and (p_form_id is null or f.id <> p_form_id)) loop
    v_n := v_n + 1;
    v_try := v_base || '-' || v_n::text;
  end loop;
  return v_try;
end;
$fn$;

comment on function custom.form_slug(uuid, text, uuid) is
  'FORMS: one readable name per form inside one organization. The slug is a LABEL, never the capability — the public link is the form''s own id (see this file''s header, decision 1).';

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.form_declare — the door that was missing. It creates or re-states one form.
--
-- EVERY QUESTION NAMES A FIELD OF THE SUBJECT TABLE, BY KEY, AND A QUESTION THAT NAMES
-- NO FIELD IS REFUSED BY NAME. A form whose questions could drift from the Table would
-- be the "form silo" PRODUCTS row 1 exists to avoid: an answer that lands nowhere.
-- ─────────────────────────────────────────────────────────────────────────────

create function custom.form_declare(p_organization_id uuid,
                                    p_table_id uuid,
                                    p_title text,
                                    p_questions jsonb,
                                    p_presentation jsonb default '{}'::jsonb,
                                    p_submission_cap integer default null,
                                    p_quarantine_rule_id uuid default null,
                                    p_notify_rule_id uuid default null,
                                    p_form_id uuid default null,
                                    p_slug text default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
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

  -- The presentation carries the questions as the form WORDS them; the answerable key
  -- list is what the door enforces. One object, two readers, no third place to drift.
  v_present := coalesce(p_presentation, '{}'::jsonb) || jsonb_build_object('questions', p_questions);

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
            p_quarantine_rule_id, p_notify_rule_id, v_hp)
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
           quarantine_rule_id = p_quarantine_rule_id,
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
$fn$;

comment on function custom.form_declare(uuid, uuid, text, jsonb, jsonb, integer, uuid, uuid, uuid, text) is
  'FORMS / SCR-13: create or re-state ONE form over one Table. Every question names a Field of that Table by key and a question naming no Field is refused BY NAME with the real keys. Needs `admin` on the Table, because a form decides what a stranger may write into it. It does NOT publish — custom.anon_publish is still the one act that opens the door.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'form_declare',
        'p_organization_id uuid, p_table_id uuid, p_title text, p_questions jsonb, p_presentation jsonb, p_submission_cap integer, p_quarantine_rule_id uuid, p_notify_rule_id uuid, p_form_id uuid, p_slug text',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'jsonb'::regtype, 'jsonb'::regtype,
              'int4'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'text'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry; NULL is refused there. A NULL principal is refused by name before anything else, so this door never runs on the server lane. p_table_id is then checked by custom.assert_client_may_change at the ADMIN rung against THIS organization, so a table id from another tenant reads as absent and is refused. Every key inside p_questions is matched against that table''s own declared fields and an unknown one is refused by name; nothing in p_presentation is executed or trusted.',
        'forms_a_form_is_a_view_on_a_table.sql',
        null, true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.forms — the owner's list, with the counts that make it worth looking at
-- ─────────────────────────────────────────────────────────────────────────────

create function custom.forms(p_organization_id uuid, p_table_id uuid default null)
returns table(form_id uuid, table_id uuid, title text, slug text,
              published_at timestamptz, closed_at timestamptz,
              submission_cap integer, responses bigint, in_table bigint,
              held bigint, rejected bigint, state text,
              quarantine_rule_id uuid, notify_rule_id uuid, presentation jsonb)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.forms');
  return query
    select f.id, f.table_id, f.title, f.slug, f.published_at, f.closed_at, f.submission_cap,
           count(s.id),
           count(s.id) filter (where s.state = 'cleared'),
           count(s.id) filter (where s.state = 'quarantined'),
           count(s.id) filter (where s.state = 'rejected'),
           case when f.published_at is null then 'draft'
                when f.closed_at is not null then 'closed'
                when f.submission_cap is not null
                     and count(s.id) filter (where s.state <> 'rejected') >= f.submission_cap
                  then 'full'
                else 'open' end,
           f.quarantine_rule_id, f.notify_rule_id, f.presentation
      from custom.anon_form f
      left join custom.anon_submission s
        on s.organization_id = f.organization_id and s.form_id = f.id
     where f.organization_id = p_organization_id
       and f.deleted_at is null
       and (p_table_id is null or f.table_id = p_table_id)
       -- ONLY the forms of Tables this caller can actually open. The form list is not a
       -- second way to learn that a Table exists.
       and f.table_id in (select v from custom.query_visible_ids(p_organization_id,
                                                                 custom.table_kernel_id()) v)
     group by f.id, f.table_id, f.title, f.slug, f.published_at, f.closed_at,
              f.submission_cap, f.quarantine_rule_id, f.notify_rule_id, f.presentation
     order by f.created_at desc;
end;
$fn$;

comment on function custom.forms(uuid, uuid) is
  'FORMS: one organization''s forms, with how many answers arrived, how many are in the table, how many are held and how many were rejected. Scoped to the Tables the caller can already open — the form list never reveals a Table.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'forms',
        'p_organization_id uuid, p_table_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. The rows are then narrowed to forms whose table_id is in custom.query_visible_ids for THIS caller, so a form over a Table the caller cannot open is absent rather than refused, and a p_table_id from another tenant returns zero rows. It returns no submission payloads — only counts.',
        'forms_a_form_is_a_view_on_a_table.sql',
        null, true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.form_public — THE PUBLIC FACE, and it reads no record of the subject Table.
--
-- What it returns is the form's own words plus the FIELD DEFINITIONS of exactly the keys
-- the form exposes — which is what a screen needs to draw a currency box with its unit
-- and a date box with its kind. It returns no row of the Table, no count of them, and no
-- id of one. DOOR-17's "never exposing any read of the table" is a property of this
-- function's text, not a promise about it.
--
-- A FORM THAT DOES NOT EXIST, A FORM THAT WAS NEVER PUBLISHED, AND A FORM IN AN
-- ORGANIZATION WHOSE STORE IS OFF ANSWER IDENTICALLY: zero rows. That is the 404, and it
-- is `iam.resolve_publish_binding`'s own precedent — the access decision is taken before
-- existence, so a link cannot be used to learn that something is there.
-- ─────────────────────────────────────────────────────────────────────────────

create function custom.form_public(p_form_id uuid)
returns table(form_id uuid, organization_id uuid, table_id uuid, title text,
              presentation jsonb, fields jsonb, honeypot_key text,
              state text, message text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
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
  -- The store's own switch, asked silently: an organization that does not keep its data
  -- here has no form to show, and saying WHICH of the three reasons it is would be the
  -- leak this function exists to avoid.
  if not custom.store_is_open(v_f.organization_id) then return; end if;
  if v_f.published_at is null then return; end if;

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

  -- EXACTLY the exposed Fields, as the store holds them. The screen draws a Field the
  -- same way here as it does in the grid because it is reading the same document.
  select coalesce(jsonb_agg(f.data order by ord), '[]'::jsonb) into v_fields
    from jsonb_array_elements_text(v_f.exposed_field_keys) with ordinality k(key, ord)
    join custom.record f
      on f.organization_id = v_f.organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_f.table_id
     and f.data ->> 'key' = k.key;

  form_id := v_f.id; organization_id := v_f.organization_id; table_id := v_f.table_id;
  title := coalesce(v_f.title, 'Form'); presentation := v_f.presentation;
  fields := v_fields; honeypot_key := v_f.honeypot_key; state := v_state; message := v_msg;
  return next;
end;
$fn$;

comment on function custom.form_public(uuid) is
  'FORMS / DOOR-17: the public face of one published form — its own words and the Field definitions of exactly the keys it exposes. It reads NO record of the subject Table. A form that is missing, unpublished, or in an organization whose store is off all answer with zero rows, which is the 404.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'form_public',
        'p_form_id uuid',
        array['uuid'::regtype]::oid[],
        'It takes NO organization id: the form id supplies the organization, so a caller cannot name a tenant. The form id IS the capability (122 bits of UUIDv4), exactly as an unguessable meeting slug is in communication.meet_meeting_by_slug. It reads custom.anon_form and the Field records of exactly the keys that form exposes, and NO record of the subject table. Missing, unpublished, and store-switched-off all answer zero rows, so the link cannot be used to learn that anything exists.',
        'forms_a_form_is_a_view_on_a_table.sql',
        'server_only: the public form page is server-rendered and the server is what holds the request. Schema custom is revoked from anon and this door is granted to the server lane alone — W4-ANON''s posture is unchanged by this file.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.form_notify — DOOR-18's delivery, on a form's own subscription Rule
-- ─────────────────────────────────────────────────────────────────────────────

create function custom.form_notify(p_organization_id uuid,
                                   p_form_id uuid,
                                   p_record_id uuid,
                                   p_submission_id uuid)
returns uuid
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_f custom.anon_form;
  s   record;
begin
  select * into v_f from custom.anon_form
   where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
  if not found or v_f.notify_rule_id is null then
    return null;
  end if;

  -- THE SAME READER custom.agg_subscription_fire uses, so a form's notify Rule is an
  -- ordinary subscription and an organization editing it in the notify editor is editing
  -- the same object. What is NOT asked is custom.agg_view_admits: it answers under the
  -- CURRENT principal, and the principal of a stranger's submission is nobody, so it
  -- would return false for every form on earth. The form is the membership test — an
  -- answer that arrived through THIS form is in scope for THIS form's subscription by
  -- construction.
  for s in select * from custom.agg_subscriptions(p_organization_id, null, null)
            where rule_id = v_f.notify_rule_id loop
    if s.recipient_user_id is null then
      continue;                        -- a subscription naming nobody tells nobody
    end if;
    return custom.agg_deliver(
      p_organization_id, s.rule_id, p_record_id, s.channel, s.recipient_user_id, s.event_key,
      format('New response: %s', coalesce(v_f.title, 'a form')),
      format('Somebody answered %s. It is in the table now, with the form stamped on it.',
             coalesce(v_f.title, 'your form')),
      jsonb_build_object('form_id', v_f.id, 'form_slug', v_f.slug,
                         'table_id', v_f.table_id, 'submission_id', p_submission_id,
                         'source', 'form'));
  end loop;
  return null;
end;
$fn$;

comment on function custom.form_notify(uuid, uuid, uuid, uuid) is
  'FORMS / DOOR-18: tell whoever the form''s notify Rule names that an answer arrived. The Rule is an ordinary subscription Rule read through custom.agg_subscriptions and delivered through custom.agg_deliver into communication.notification — never a second notification mechanism.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'form_notify',
        'p_organization_id uuid, p_form_id uuid, p_record_id uuid, p_submission_id uuid',
        array['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_form_id is matched together with p_organization_id, so a form id from another tenant reads as absent and returns NULL. It grants nothing and reads no record: it resolves the form''s own subscription Rule and writes one communication.notification row through custom.agg_deliver, whose dedupe key makes a replay a no-op. It is called BY custom.form_submit after the record already exists, never on its own as an access decision.',
        'forms_a_form_is_a_view_on_a_table.sql',
        'server_only: it is an internal step of the form submission path, called after the submission has been accepted and cleared; nothing outside that path has a reason to send a form''s notification.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.form_submit — THE ANONYMOUS WRITE, keyed by the form's own id
--
-- custom.anon_write is the EMBED-TOKEN arm of DOOR-17 and is untouched: a token, an exact
-- origin, a mode. This is the LINK arm — the Typeform case, where the unguessable link
-- itself is the capability and there is no embed to issue. Both land in the same
-- quarantine, through the same rate limit, under the same exposed-key rule, and neither
-- one touches custom.record directly.
-- ─────────────────────────────────────────────────────────────────────────────

create function custom.form_submit(p_form_id uuid,
                                   p_origin text,
                                   p_payload jsonb,
                                   p_bucket text,
                                   p_honeypot text default null,
                                   p_client_key text default null)
returns table(submission_id uuid, record_id uuid, state text, message text)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
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
    on conflict (organization_id, client_key) do nothing;
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
$fn$;

comment on function custom.form_submit(uuid, text, jsonb, text, text, text) is
  'FORMS / DOOR-17: the LINK arm of the anonymous write door — the unguessable form id is the capability, where custom.anon_write''s arm takes an embed token. Closed by default, honeypot, submission cap, rate limit, every payload key checked against the form''s exposed keys and refused by name, then a QUARANTINED submission with source `form` and the form id and version in its provenance. It becomes a record only when the form''s accept Rule says so, and it never touches custom.record directly.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'form_submit',
        'p_form_id uuid, p_origin text, p_payload jsonb, p_bucket text, p_honeypot text, p_client_key text',
        array['uuid'::regtype, 'text'::regtype, 'jsonb'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
        'It takes NO organization id and NO table id: the form id supplies both, so a caller cannot name a tenant or a table. In order — the form exists and is not deleted, custom.assert_store_door, published_at is not null, not closed, the honeypot, idempotency on p_client_key, the submission cap, custom.anon_rate_take on the bucket the SERVER chose, then every payload key checked against exposed_field_keys and refused by name and every required key checked and named. The write lands in custom.anon_submission with source `form`, never in custom.record; it becomes a record only through custom.anon_clear evaluating the form''s own Rule.',
        'forms_a_form_is_a_view_on_a_table.sql',
        'server_only: the server is what knows the request''s real origin and the client''s address, and a browser handing a door its own origin and its own rate-limit bucket would be counting itself. Schema custom stays revoked from anon; this door is granted to the server lane alone.',
        false, false)
on conflict do nothing;
