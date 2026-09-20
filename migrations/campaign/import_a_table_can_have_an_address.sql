-- additive: yes
-- guard: custom/system_enabled
--
-- chair-step: it GRANTS EXECUTE to `authenticated` on THREE new functions of schema `custom`
--   (`custom.inbound_declare`, `custom.inbound_addresses`, `custom.inbound_set`) and to
--   `service_role` ALONE on one more (`custom.inbound_mail_land`) — the mail gateway's door,
--   which no browser may ever call and `anon` gains nothing from. Two internals are created
--   with no grant (`custom.inbound_domain`, `custom.inbound_mail_map`). One knob is declared
--   (`custom/inbound_domain`). Every granted function is SECURITY DEFINER and asks the
--   organization wall and the switch by name before anything; the landing door asks neither a
--   wall nor a rung because the ADDRESS is what authorises the delivery, exactly as
--   `custom.anon_inbound_land` has since W4-ANON, and it says so in its own body. Nothing is
--   dropped, nothing is revoked, nothing existing is replaced. The inverse is
--   `migrations/inverse/import_a_table_can_have_an_address_down.sql`.
--
-- LANE IMPORT — "AND FILE ANYTHING SENT TO THIS ADDRESS."
--
-- DOOR-19 (P8). PRODUCTS row 9's second half, and HubSpot's forwarding address is the bar:
-- you forward a mail to an address and it becomes an object, with the originating message
-- still attached to it. Measured on the main database and across `aidream` on 2026-09-20:
--
--   * `custom.anon_inbound` and `custom.anon_inbound_land` EXIST (W4-ANON). Between them they
--     hold an address, check its secret, keep the raw payload forever and quarantine a
--     submission. That is the receiving half and it is kept whole.
--   * NOTHING MINTED AN ADDRESS. There is no door that gives a Table one, so the table was
--     empty on the main database and the feature was unreachable by construction.
--   * NOTHING TURNED A MAIL INTO A RECORD. `anon_inbound_land` quarantines, and only a FORM's
--     rule clears a quarantined submission. Mail has no form, so mail stopped there forever.
--   * THE PLATFORM RECEIVES NO MAIL AT ALL. Searched across `aidream`: the only inbound path
--     is `POST /gmail/{token}`, a Google Pub/Sub push that reads replies out of ONE connected
--     user's own Gmail for outreach campaigns. There is no MX domain, no SMTP receiver and no
--     Postmark/Mailgun/SES inbound webhook. Postmark and Mailgun appear only outbound.
--
-- SO THIS FILE BUILDS THE DOOR AND THE MAPPING, AND SAYS PLAINLY WHAT IT CANNOT BUILD. The
-- address a Table gets is real, stable and stored; the mapping from a mail onto that Table's
-- columns is real and runs; the landing door is real and is the one a gateway calls. What is
-- NOT here is the mail route itself — an MX record for the inbound domain pointed at a
-- receiving service. That is a DNS change on a domain the owner controls and a webhook to
-- point at this door; no SQL can make it true, and pretending otherwise would mean handing
-- somebody an address that silently swallows everything sent to it. `custom.inbound_declare`
-- therefore RETURNS the route that has to exist, in one sentence, with every address it mints.
--
-- WHAT THE MAPPING DOES, AND WHY IT IS THE SAME MAPPING AS THE SPREADSHEET'S. A mail is a row
-- with named columns — from, subject, body, date, and whatever else the sender's system put in
-- the headers. So a header that matches a Field is a value, and a header that matches nothing
-- is a FIELD PROPOSAL in the ONE inbox, decided by the same people with the same right as an
-- import's and an agent's. It is never a junk bag: there is no `extra` column anywhere in this
-- file, because a column called `extra` is where information goes to be never looked at again.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE DOMAIN. One knob, so an organization on its own domain is a setting and
--    never a second code path.
-- ─────────────────────────────────────────────────────────────────────────────
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'inbound_domain', '"inbound.matrxserver.com"'::jsonb, '"inbound.matrxserver.com"'::jsonb, 'string',
   'The mail domain a table''s inbound address is minted under',
   'DOOR-19. Every inbound address is <name>@<this domain>. Mail only ARRIVES once this '
   'domain''s MX record points at a receiving service that calls custom.inbound_mail_land — '
   'that is a DNS change, not a setting, and custom.inbound_declare says so with every address '
   'it mints. An organization that owns its own domain overrides this at the organization '
   'rung and the addresses it mints afterwards use it; addresses already minted keep theirs, '
   'because an address that changed under people would lose mail.',
   'agent', 'Unified data campaign, lane IMPORT, 2026-09-20: PRODUCTS row 9, P8.',
   '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

create or replace function custom.inbound_domain(p_organization_id uuid)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v jsonb;
begin
  v := platform.knob_value('custom', 'inbound_domain', 'organization', p_organization_id);
  return coalesce(nullif(btrim(coalesce(v #>> '{}', '')), ''), 'inbound.matrxserver.com');
exception when others then
  -- THE DEFAULT IS THE PUBLISHED DEFAULT, and a knob layer that is not there yet is not a
  -- reason to refuse somebody an address. It is the same string either way.
  return 'inbound.matrxserver.com';
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. GIVING A TABLE AN ADDRESS.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.inbound_declare(
  p_organization_id uuid,
  p_table_id        uuid,
  p_label           text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_tbl    custom.record;
  v_slug   text;
  v_try    text;
  v_domain text;
  v_n      integer := 0;
  v_id     uuid;
  v_addr   text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.inbound_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.inbound_declare');
  -- AN ADDRESS WRITES INTO THIS TABLE FOREVER, FROM OUTSIDE, WITH NO ACCOUNT BEHIND IT. That
  -- is a change to what the Table IS, not a change to its contents, so it is the admin rung —
  -- the same rung it takes to add a column.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.inbound_declare',
                                          'admin'::public.permission_level, 'table');

  select * into v_tbl from custom.record r
   where r.organization_id = p_organization_id and r.id = p_table_id
     and r.table_id = custom.table_kernel_id() and r.deleted_at is null;
  if not found then
    raise exception 'That table is not in this organization, so it cannot be given an address.'
      using errcode = '23503';
  end if;

  v_domain := custom.inbound_domain(p_organization_id);
  v_slug := btrim(regexp_replace(lower(coalesce(nullif(btrim(coalesce(p_label, '')), ''),
                                                v_tbl.data ->> 'slug',
                                                v_tbl.data ->> 'name', 'inbox')),
                                 '[^a-z0-9]+', '-', 'g'), '-');
  v_slug := left(coalesce(nullif(v_slug, ''), 'inbox'), 40);

  -- THE ADDRESS IS UNIQUE ACROSS EVERYTHING, because mail arrives at an address and not at an
  -- organization. Two tables called "Invoices" in two organizations cannot share one.
  v_try := v_slug;
  loop
    exit when not exists (select 1 from custom.anon_inbound a
                           where a.address = v_try || '@' || v_domain);
    v_n := v_n + 1;
    if v_n > 200 then
      raise exception 'A free address could not be found for "%".', v_slug using errcode = '23505';
    end if;
    v_try := v_slug || '-' || substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 5);
  end loop;
  v_addr := v_try || '@' || v_domain;

  insert into custom.anon_inbound (organization_id, table_id, channel, address, source)
  values (p_organization_id, p_table_id, 'email', v_addr, 'email')
  returning id into v_id;

  return jsonb_build_object(
    'inbound_id', v_id,
    'table_id',   p_table_id,
    'address',    v_addr,
    'channel',    'email',
    'enabled',    true,
    -- NOTHING FAILS SILENTLY, AND THIS IS THE ONE THING THAT COULD. The address is real and
    -- stored; whether mail REACHES it is a fact about DNS, and it is stated here rather than
    -- discovered by somebody whose forwarded invoices went nowhere for a week.
    'mail_route', format('Mail only arrives here once %s has an MX record pointing at a mail service that hands each message to this store. Until that is set up, anything sent to %s bounces at the sender — nothing is silently lost.', v_domain, v_addr),
    'message',    format('Anything sent to %s becomes a record in "%s".', v_addr, coalesce(v_tbl.data ->> 'name', 'this table')));
end;
$function$;

create or replace function custom.inbound_addresses(
  p_organization_id uuid, p_table_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.inbound_addresses');
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.inbound_addresses');
  end if;
  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.address), '[]'::jsonb) into v
    from (select a.id as inbound_id, a.table_id, a.channel, a.address, a.source,
                 a.disabled_at is null as enabled, a.last_received_at, a.created_at,
                 (select count(*) from custom.anon_submission x
                   where x.organization_id = a.organization_id and x.inbound_id = a.id) as received
            from custom.anon_inbound a
           where a.organization_id = p_organization_id
             and a.deleted_at is null
             and (p_table_id is null or a.table_id = p_table_id)
             -- AN ADDRESS BELONGS TO A TABLE, so who may know about the address is who may
             -- know about the table (T10).
             and (a.table_id is null or custom.table_is_live(p_organization_id, a.table_id))) s;
  return v;
end;
$function$;

create or replace function custom.inbound_set(
  p_organization_id uuid, p_inbound_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_in custom.anon_inbound;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.inbound_set');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.inbound_set');
  select * into v_in from custom.anon_inbound
   where organization_id = p_organization_id and id = p_inbound_id and deleted_at is null;
  if not found then
    raise exception 'There is no such address here.' using errcode = '23503';
  end if;
  perform custom.assert_client_may_change(p_organization_id, v_in.table_id, 'custom.inbound_set',
                                          'admin'::public.permission_level, 'table');
  update custom.anon_inbound
     set disabled_at = case when coalesce(p_enabled, true) then null else now() end
   where organization_id = p_organization_id and id = p_inbound_id;
  return jsonb_build_object(
    'inbound_id', p_inbound_id, 'address', v_in.address, 'enabled', coalesce(p_enabled, true),
    'message', case when coalesce(p_enabled, true)
                    then format('%s is on again.', v_in.address)
                    else format('%s is off. Everything that arrived before is still here, and anything sent now is turned away at the door.', v_in.address) end);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A MAIL IS A ROW WITH NAMED COLUMNS.
--
-- Answers `{"doc": {...the values that matched a Field...}, "unmapped": {...header -> the
-- sample...}}`. The mapping is by MEANING first (a table's title field takes the subject; a
-- person column takes the sender if the sender is one of yours) and then by NAME, exactly as
-- a spreadsheet header is matched — so a Field literally called `cc` takes the cc line.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.inbound_mail_map(
  p_organization_id uuid, p_table_id uuid, p_mail jsonb)
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  v_title   text;
  v_f       record;
  v_doc     jsonb := '{}'::jsonb;
  v_taken   text[] := array[]::text[];
  v_un      jsonb := '{}'::jsonb;
  v_k       text;
  v_v       jsonb;
  v_word    text;
  v_cell    jsonb;
  v_flat    jsonb := '{}'::jsonb;
  v_from    text := lower(btrim(coalesce(p_mail ->> 'from', '')));
  v_body    text := coalesce(nullif(p_mail ->> 'text', ''), p_mail ->> 'html');
  v_subject text := nullif(btrim(coalesce(p_mail ->> 'subject', '')), '');
begin
  select r.data ->> 'title_field' into v_title from custom.record r
   where r.organization_id = p_organization_id and r.id = p_table_id and r.deleted_at is null;

  -- BY MEANING, in the order a person would: what is this about, who sent it, what did they
  -- say, when. Each arm takes at most one column and remembers it, so the by-name pass below
  -- never overwrites a value the meaning pass already decided.
  for v_f in select f.data as d, coalesce(custom.parity_type(f.data), f.data ->> 'type') as p
               from custom.applicable_fields(p_organization_id, p_table_id, null) f
  loop
    if v_title is not null and v_f.d ->> 'key' = v_title and v_subject is not null then
      v_doc := v_doc || jsonb_build_object(v_title, to_jsonb(v_subject));
      v_taken := v_taken || v_title;
    elsif v_f.p = 'member' and v_from <> '' and not ('__sender' = any (v_taken)) then
      v_cell := custom.io_cell(p_organization_id, v_f.d, v_from, 'mdy');
      if (v_cell ->> 'ok')::boolean and not coalesce((v_cell ->> 'skip')::boolean, false) then
        v_doc := v_doc || jsonb_build_object(v_f.d ->> 'key', v_cell -> 'value');
        v_taken := v_taken || (v_f.d ->> 'key') || '__sender';
      end if;
    elsif v_f.p = 'email' and v_from <> '' and not ('__sender' = any (v_taken)) then
      v_doc := v_doc || jsonb_build_object(v_f.d ->> 'key', to_jsonb(v_from));
      v_taken := v_taken || (v_f.d ->> 'key') || '__sender';
    elsif v_f.p is null and (v_f.d ->> 'type') = 'text'
          and coalesce((v_f.d -> 'config' ->> 'long')::boolean, (v_f.d ->> 'plain') = 'long_text',
                       v_f.d ->> 'key' in ('body', 'message', 'notes', 'description', 'details'))
          and v_body is not null and not ('__body' = any (v_taken)) then
      v_doc := v_doc || jsonb_build_object(v_f.d ->> 'key', to_jsonb(left(v_body, 20000)));
      v_taken := v_taken || (v_f.d ->> 'key') || '__body';
    elsif v_f.p = 'datetime' and v_f.d ->> 'key' in ('received_at', 'received', 'sent_at', 'date')
          and nullif(p_mail ->> 'received_at', '') is not null then
      v_doc := v_doc || jsonb_build_object(v_f.d ->> 'key', to_jsonb(p_mail ->> 'received_at'));
      v_taken := v_taken || (v_f.d ->> 'key');
    end if;
  end loop;

  -- FLATTEN THE MAIL into header -> value, headers block included, so the by-name pass and the
  -- proposal pass read ONE thing. `attachments` is not a header and is handled by the caller.
  for v_k, v_v in select key, value from jsonb_each(p_mail - 'attachments' - 'headers') loop
    v_flat := v_flat || jsonb_build_object(v_k, v_v);
  end loop;
  if jsonb_typeof(p_mail -> 'headers') = 'object' then
    for v_k, v_v in select key, value from jsonb_each(p_mail -> 'headers') loop
      if not (v_flat ? v_k) then
        v_flat := v_flat || jsonb_build_object(v_k, v_v);
      end if;
    end loop;
  end if;

  for v_k, v_v in select key, value from jsonb_each(v_flat) loop
    v_word := btrim(coalesce(v_v #>> '{}', ''));
    if v_word = '' then continue; end if;
    select f.data as d into v_f
      from custom.applicable_fields(p_organization_id, p_table_id, null) f
     where lower(coalesce(f.data ->> 'key', '')) = lower(v_k)
        or lower(coalesce(f.data ->> 'label', '')) = lower(v_k)
     limit 1;
    if found and not ((v_f.d ->> 'key') = any (v_taken)) then
      v_cell := custom.io_cell(p_organization_id, v_f.d, v_word, 'mdy');
      if (v_cell ->> 'ok')::boolean and not coalesce((v_cell ->> 'skip')::boolean, false) then
        v_doc := v_doc || jsonb_build_object(v_f.d ->> 'key', v_cell -> 'value');
        v_taken := v_taken || (v_f.d ->> 'key');
        continue;
      end if;
    end if;
    -- NEVER A JUNK BAG. A header nothing matched is remembered WITH its value so it can be
    -- offered as a column, exactly as an unmapped spreadsheet column is.
    if not found and v_k not in ('text', 'html', 'to', 'message_id', 'raw') then
      v_un := v_un || jsonb_build_object(v_k, jsonb_build_array(to_jsonb(left(v_word, 200))));
    end if;
  end loop;

  return jsonb_build_object('doc', v_doc, 'unmapped', v_un);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. THE LANDING DOOR — the one a mail gateway calls.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.inbound_mail_land(
  p_address text,
  p_mail    jsonb,
  p_secret  text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_in     custom.anon_inbound;
  v_map    jsonb;
  v_doc    jsonb;
  v_un     jsonb;
  v_sub    uuid;
  v_rec    uuid;
  v_held   text;
  v_stood  boolean := false;
  v_att    jsonb;
  v_files  uuid[] := array[]::uuid[];
  v_file   uuid;
  v_fk     uuid;
  v_attf   text;
  v_props  integer := 0;
  v_k      text;
  v_v      jsonb;
  v_spec   jsonb;
  v_owner  uuid;
begin
  -- THE ADDRESS IS WHAT AUTHORISES THE DELIVERY. There is no signed-in caller here and there
  -- never will be: a mail gateway has no account. So an unknown address is refused WITHOUT
  -- saying whether it ever existed, exactly as custom.anon_inbound_land has always done.
  select * into v_in from custom.anon_inbound
   where address = lower(btrim(coalesce(p_address, ''))) and deleted_at is null;
  if not found then
    raise exception 'No inbound address "%".', p_address
      using errcode = '42501',
            hint = 'The address is what authorises the delivery, so an unknown one is refused without saying whether it ever existed.';
  end if;
  if v_in.disabled_at is not null then
    raise exception 'The inbound address "%" is switched off.', p_address
      using errcode = '42501',
            hint = 'Whoever owns the table switched it off. Everything that arrived before is still there.';
  end if;
  if v_in.secret_hash is not null
     and v_in.secret_hash is distinct from encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') then
    raise exception 'That is not the secret for "%".', p_address using errcode = '42501';
  end if;
  perform custom.assert_store_door(v_in.organization_id, 'custom.inbound_mail_land');
  if v_in.table_id is null then
    raise exception 'The address "%" is not attached to a table, so there is nowhere for this message to land.', p_address
      using errcode = '23503';
  end if;

  -- THE SAME MESSAGE TWICE IS ONE RECORD. A gateway retries; `Message-ID` is what makes the
  -- retry the same message, and it is the inbound half of "a re-import doubles nothing".
  if nullif(p_mail ->> 'message_id', '') is not null then
    select s.id, s.record_id into v_sub, v_rec
      from custom.anon_submission s
     where s.organization_id = v_in.organization_id
       and s.inbound_id = v_in.id
       and s.client_key = p_mail ->> 'message_id';
    if v_sub is not null then
      return jsonb_build_object('submission_id', v_sub, 'record_id', v_rec, 'already', true,
                                'message', 'This message was already filed. Nothing was written again.');
    end if;
  end if;

  -- THE ORIGINATING MESSAGE IS KEPT, ALWAYS AND WHOLE. HubSpot's forwarding address is only
  -- useful because the message is still there when somebody asks why the record says what it
  -- says.
  insert into custom.anon_submission (organization_id, form_id, inbound_id, table_id, source,
                                      payload, raw_payload, client_key, state, remote_origin)
  values (v_in.organization_id, v_in.form_id, v_in.id, v_in.table_id, 'email',
          coalesce(p_mail, '{}'::jsonb), coalesce(p_mail, '{}'::jsonb),
          nullif(p_mail ->> 'message_id', ''), 'quarantined', v_in.address)
  returning id into v_sub;
  update custom.anon_inbound set last_received_at = now()
   where id = v_in.id and organization_id = v_in.organization_id;

  v_map := custom.inbound_mail_map(v_in.organization_id, v_in.table_id, coalesce(p_mail, '{}'::jsonb));
  v_doc := v_map -> 'doc';
  v_un  := v_map -> 'unmapped';

  -- AGT-N-5: THE PRINCIPAL OF AN UNATTENDED RUN IS THE PERSON WHO SET IT UP — here, whoever
  -- declared the address, whom `custom.inbound_declare` already required to hold ADMIN on this
  -- Table. Only when there is no principal at all; a signed-in caller keeps their own.
  v_owner := v_in.created_by;
  if custom.query_principal() is null and v_owner is not null then
    v_held := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    v_stood := true;
  end if;

  begin
    -- REC-31: A FILE IS A RECORD, reached through a relation. Every attachment becomes one,
    -- whether or not this Table has a column to point at them — losing the attachment because
    -- nobody added a column first would be the data loss this whole lane is about.
    if jsonb_typeof(p_mail -> 'attachments') = 'array' then
      v_fk := custom.file_kernel_id();
      for v_att in select value from jsonb_array_elements(p_mail -> 'attachments') loop
        v_file := custom.record_write(v_in.organization_id, v_fk,
                    jsonb_strip_nulls(jsonb_build_object(
                      'name',         coalesce(nullif(v_att ->> 'filename', ''), 'attachment'),
                      'mime_type',    nullif(v_att ->> 'content_type', ''),
                      'size_bytes',   nullif(v_att ->> 'size', '')::bigint,
                      'url',          nullif(v_att ->> 'url', ''),
                      '_actor',       'system',
                      '_source',      jsonb_build_object('via', 'inbound', 'address', v_in.address,
                                                         'submission_id', v_sub::text))));
        v_files := v_files || v_file;
      end loop;
      if cardinality(v_files) > 0 then
        select f.data ->> 'key' into v_attf
          from custom.applicable_fields(v_in.organization_id, v_in.table_id, null) f
         where custom.parity_type(f.data) = 'attachment'
         limit 1;
        if v_attf is not null then
          v_doc := v_doc || jsonb_build_object(v_attf, to_jsonb(array(select x::text from unnest(v_files) x)));
        end if;
      end if;
    end if;

    v_rec := custom.record_write(v_in.organization_id, v_in.table_id,
               v_doc || jsonb_build_object(
                 '_actor',  'system',
                 '_source', jsonb_strip_nulls(jsonb_build_object(
                              'via', 'inbound', 'channel', 'email', 'address', v_in.address,
                              'from', p_mail ->> 'from', 'message_id', p_mail ->> 'message_id',
                              'submission_id', v_sub::text))));

    update custom.anon_submission set state = 'accepted', record_id = v_rec
     where organization_id = v_in.organization_id and id = v_sub;

    -- THE HEADERS NOTHING MATCHED, OFFERED IN THE ONE INBOX. Same queue as an import's
    -- columns and an agent's, decided by the same people with the same right.
    for v_k, v_v in select key, value from jsonb_each(coalesce(v_un, '{}'::jsonb)) loop
      v_spec := custom.io_proposal_spec(
                  jsonb_build_object('column', v_k, 'field_key',
                                     btrim(regexp_replace(lower(v_k), '[^a-z0-9]+', '_', 'g'), '_'))
                  || (custom.io_infer_column(v_in.organization_id, v_in.table_id, v_k, v_v)
                        - 'header' - 'matched' - 'field_key'));
      begin
        perform custom.work_approval_request(
          v_in.organization_id, v_in.table_id,
          jsonb_build_object('kind', 'field_add', 'field', v_spec),
          format('Mail to %s carried "%s", which this table has no column for. An example: %s',
                 v_in.address, v_k, coalesce(v_v -> 0 #>> '{}', '')),
          null, 'person', null);
        v_props := v_props + 1;
      exception when others then
        null;   -- a proposal that cannot be filed never costs the message its record
      end;
    end loop;
  exception when others then
    if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;
    update custom.anon_submission
       set state = 'rejected', rejection_reason = sqlerrm
     where organization_id = v_in.organization_id and id = v_sub;
    return jsonb_build_object('submission_id', v_sub, 'record_id', null, 'already', false,
                              'refused', sqlerrm,
                              'message', format('The message was kept but could not become a record: %s', sqlerrm));
  end;
  if v_stood then perform set_config('request.jwt.claims', coalesce(v_held, ''), true); end if;

  return jsonb_build_object(
    'submission_id', v_sub, 'record_id', v_rec, 'already', false,
    'attachments',   cardinality(v_files),
    'columns_offered', v_props,
    'message', format('Filed in %s.%s%s',
                      coalesce((select r.data ->> 'name' from custom.record r
                                 where r.organization_id = v_in.organization_id and r.id = v_in.table_id), 'the table'),
                      case when cardinality(v_files) > 0
                           then format(' %s attachment%s kept.', cardinality(v_files),
                                       case when cardinality(v_files) = 1 then '' else 's' end) else '' end,
                      case when v_props > 0
                           then format(' %s new column%s waiting in the approvals inbox.', v_props,
                                       case when v_props = 1 then '' else 's' end) else '' end));
end;
$function$;

-- ── DECLARE, THEN GRANT. ────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', v.fn, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false,
       'migrations/campaign/import_a_table_can_have_an_address.sql (lane IMPORT)', v.why
  from (values
    ('inbound_declare',
     'Give a table its own address, so anything sent to it becomes a record. An admin''s act on the table, because an address writes into it forever from outside. Answers WITH the mail route that has to exist before anything arrives.'),
    ('inbound_addresses',
     'The addresses this organization''s tables have, how many messages each has taken and when the last one arrived. Narrowed to the tables the caller may open.'),
    ('inbound_set',
     'Switch one address off or on. Off turns new mail away at the door and keeps everything that already arrived.')
  ) as v(fn, why)
  join pg_proc p on p.proname = v.fn and p.pronamespace = 'custom'::regnamespace
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = v.fn
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.inbound_declare(uuid, uuid, text) to authenticated;
grant execute on function custom.inbound_addresses(uuid, uuid) to authenticated;
grant execute on function custom.inbound_set(uuid, uuid, boolean) to authenticated;

-- THE GATEWAY'S DOOR, AND ONLY THE GATEWAY'S — DECLARED AS SUCH, IN DATA.
-- `service_role` is the server lane; `anon` and `authenticated` gain NOTHING here, because a
-- browser that could land mail at any address could write into any table in any organization
-- that ever published one. `provision_shape_guard` is right to demand this in data rather than
-- in the prose above: a sentence in a comment is not a decision anything executes.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'custom', 'inbound_mail_land', iam.door_identity_args(p.oid),
       platform.door_argtypes(p.proargtypes), false, false,
       'server_only: the mail gateway lane alone, as service_role. A mail gateway has no account, so the ADDRESS is the credential and the optional shared secret is checked against custom.anon_inbound.secret_hash before anything is read. No browser may ever reach it: a signed-in caller who could land mail at an arbitrary address would be writing into any table of any organization that ever minted one, around that organization''s wall entirely.',
       'migrations/campaign/import_a_table_can_have_an_address.sql (lane IMPORT)',
       'p_address is looked up in custom.anon_inbound and an unknown or disabled one is refused without saying whether it ever existed; the organization and the table are taken FROM that row and never from an argument, so there is no entity id a caller could aim. p_secret is checked against that row''s secret_hash when it has one, and NULL is refused there. p_mail is content, never an identity. The write then goes through custom.record_write under the address owner''s principal (AGT-N-5), so every wall, validator and rule runs exactly as it would for that person.'
  from pg_proc p
 where p.proname = 'inbound_mail_land' and p.pronamespace = 'custom'::regnamespace
   and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = 'inbound_mail_land'
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.inbound_mail_land(text, jsonb, text) to service_role;
