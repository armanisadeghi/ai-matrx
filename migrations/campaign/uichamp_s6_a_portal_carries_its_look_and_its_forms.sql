-- chair-step: one client door changes signature — `custom.portal_declare` gains `p_config` (the
--   portal's look and its forms) as an eighth, defaulted argument — and a defaulted argument cannot
--   be added by CREATE OR REPLACE without leaving a second overload behind, so it is DROPPED and
--   CREATED again in this one transaction, with its `platform.client_callable_door` row re-pointed
--   at the new identity before commit. The additive allow-list refuses a DROP by name and it is
--   right to: a person reads what the CREATE puts back. Every existing argument keeps its name,
--   position and default, so every caller (the records client's named call, matrx-records'
--   four positional arguments) still resolves unchanged, and a call that sends no `p_config`
--   leaves a portal's look and forms exactly as they were. `custom.portal` gains ONE nullable
--   column, `config jsonb`, with no default and no foreign key (metadata-only; no row is
--   rewritten). `custom.portal_card`, `custom.portal_me` and `custom.portal_public` are REPLACED
--   (same signatures, same jsonb answers plus new keys). NEW: two client doors
--   (`custom.portal_form`, `custom.portal_form_submit`) and their door rows, and five internal
--   helpers. No policy or trigger is touched. The EXECUTE grants a signed-in person needs on the
--   re-created door and the two new ones are the NEXT file,
--   `uichamp_s6_a_signed_in_person_may_open_a_portals_look_and_forms.sql`.
--   The inverse is `migrations/inverse/uichamp_s6_a_portal_carries_its_look_and_its_forms_down.sql`.
-- lane: S6
-- lock: custom,platform
-- based-on: custom.portal_declare(uuid, text, uuid, jsonb, uuid, text, text) 09b425cc8b0bdd8748940b19604b70cf787457bc2c34bcff37421781a6b8c738
-- based-on: custom.portal_card(uuid, uuid) 6e4fe88f66e28a2a07c4623095d71cf670063872bba1ce5e8858588dc4f2266d
-- based-on: custom.portal_me() 63d2489ad4467510139113569397ba09176d9f2fe3126e8dc606d41d4aaf6f60
-- based-on: custom.portal_public(text) 1c6fdf1803d963fc5f136acb2d9b558569eec0ad1e18d72d0684991277fdba38
--
-- LANE S6 (UI-CHAMPIONS-PLAN rev 2, rows 45, 46, 55) — THE PORTAL CARRIES ITS OWN LOOK AND ITS FORMS.
--
-- THE USE CASE. Harbor Point Plumbing & Drain gives each property manager it works for a portal:
-- "Your service calls". Today that page is the app's own chrome with one line of text naming the
-- portal, so a property manager who opens it from a text message cannot tell whose page she is
-- on; it has no way to send the plumber anything but the one form a developer wired in; and a job
-- says "On site" as raw text with no idea of what came before or what comes next. Softr's client
-- portals and Stripe's customer portal carry the business's logo and colour, several ways to ask
-- for something, and a status line per item. This file gives the store those three things, on the
-- portal's own record, through the portal's existing doors.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- WHAT CHANGES
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- 1. `custom.portal.config jsonb` — nullable, no default. Two keys, judged by the store:
--      style: { display_name  2–80 characters — what the portal calls the business,
--               welcome       up to 280 characters — the line under the name,
--               logo_file_id  a PUBLIC picture in this organization's Files,
--               accent        one of the design system's colour names
--                             (slate, green, amber, red, blue, violet, teal),
--               footer_links  up to five {label, url}, url https://, mailto: or tel: }
--      forms: [ {form_id, label?, order?} ]   up to twelve, in the order given.
--    Anything else is refused BY NAME and nothing is written.
--
-- 2. THE ORGANIZATION'S BRAND IS THE DEFAULT, SO A NEW PORTAL IS NEVER BLANK.
--    `custom._portal_style(org, config)` resolves what an outsider is shown: the portal's own
--    name, else the organization's name; the portal's own logo, else the organization's logo
--    file, else the organization's logo address; the welcome line and accent the portal set
--    (none means the app's own). It says which values came from the organization
--    (`from_organization`), so the builder can say "using Harbor Point's own logo".
--
-- 3. THE LOGO IS READ THROUGH THE PORTAL, NOT THROUGH THE OWNER. A logo is shown on the sign-in
--    page, before anybody has signed in, to people who belong to no organization here. So the
--    store refuses a logo that is not a PUBLIC picture of this organization's Files (visibility
--    `public`, on the public CDN bucket), with the remedy, and the outsider's answer carries the
--    picture's public address — built the way the file service builds it
--    (`matrx_files.cloud_sync.cdn.public_url_for`: base, key, `?v=<checksum[:8]>`). A private
--    file would need the owner's session to sign, which is exactly the read an outsider must
--    never ride on.
--
-- 4. MANY FORMS PER PORTAL, EACH WRITING TO A TABLE THE PORTAL SHOWS. A form is refused unless
--    its answers land in a Table this portal exposes (a portal that sent a client's answers into
--    a Table she cannot see would hide her own request from her), unless it is a crew form, or
--    when it names a form that is not in this organization. Re-stating a portal's tables
--    re-judges the forms it already carries: a table taken off the portal takes no form with it
--    silently — the declaration is refused, naming the form.
--
-- 5. A PORTAL FORM IS ANSWERED AS THE CLIENT, AND LANDS AS HERS.
--    `custom.portal_form(org, portal, form)` hands a signed-in principal the form's questions —
--    only if the form is on HER portal. `custom.portal_form_submit(org, portal, form, answers,
--    client_key)` takes her answers through the same scope, required-field, idempotency and rate
--    rules `custom.form_submit` applies, and then does the one thing a public form cannot: the
--    portal, never the form, says WHICH CLIENT this is for — the relation Field that ties the
--    form's Table to the client (the portal's `names_via`) is filled with her own client record,
--    and a form that tries to fill it itself is refused by name. The submission is quarantined
--    first (source `portal`, carrying the portal, the principal and the client), then:
--      · the form's accept Rule, when it has one, decides it exactly as it decides a stranger's
--        (`custom.anon_clear`, the one evaluator);
--      · a form with no Rule becomes a record at once — the invitation already told the store
--        who this is, which is the question quarantine exists to ask of a stranger (Softr and
--        Stripe write a signed-in client's request straight through).
--    The record is written as the person who declared the portal (they hold `admin` on every
--    Table it shows), stamped `_source.via = portal`, and it reaches her through her own grant
--    the moment it exists: she sees her request in her own list.
--
-- 6. THE OUTSIDER'S READ CARRIES IT ALL. `custom.portal_me()` gains, per portal, `style` and the
--    OPEN forms (`forms`), and per Table `stage`: the stage Field, its label and its stages in
--    the order they were declared — only when that Field is one the portal shows. The status
--    timeline is drawn from that list and from `custom.record_history`, the existing history
--    door, which masks every field the portal did not open. `custom.portal_public` (the sign-in
--    page) gains `style`. `custom.portal_card` (the owner) gains `config` as stored, `style` as
--    resolved, and `forms` with each form's title, Table and state.
--
-- LOCKS. ALTER TABLE custom.portal ADD COLUMN (nullable, no default: ACCESS EXCLUSIVE on
-- custom.portal for a catalogue write, no rewrite, milliseconds), create / drop / replace
-- function, insert and update of three `platform.client_callable_door` rows, comment on. Nothing
-- on custom.record. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 1. The column.
-- ─────────────────────────────────────────────────────────────────────────────────────────

-- IF NOT EXISTS: the inverse keeps the column (it holds organizations' own settings), so the
-- up file runs again cleanly after it (rule 27: up, inverse, up).
alter table custom.portal add column if not exists config jsonb;

comment on column custom.portal.config is
  'S6: the portal''s own look and its forms, as custom.portal_declare judged them: {"style": {display_name, welcome, logo_file_id, accent, footer_links}, "forms": [{form_id, label, order}]}. NULL means the organization''s own brand and no forms. Read through custom.portal_card (owner), custom.portal_me (the client) and custom.portal_public (the sign-in page); written only by custom.portal_declare.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 2. The helpers. Internal and SECURITY INVOKER: each is called only from inside a definer door,
--    so it runs with that door's rights, carries no call surface of its own, and needs no door row.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.portal_accents()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $$
  -- THE DESIGN SYSTEM'S OWN COLOUR NAMES (@ai-matrx/design-system `STYLE_COLORS`), never a hex.
  -- A name carries its own light and dark class, so a portal is legible on both grounds, and a
  -- retired name degrades to the app's own colour instead of to an unreadable one.
  select array['slate', 'green', 'amber', 'red', 'blue', 'violet', 'teal']::text[];
$$;

comment on function custom.portal_accents() is
  'S6: the accent colours a portal may carry — the design system''s STYLE_COLORS names, in its order.';

create function custom._portal_picture_url(p_organization_id uuid, p_file_id uuid, p_own_only boolean)
returns text
language sql
stable
set search_path to 'pg_catalog'
as $$
  -- The public address of a PUBLIC picture, built the way the file service builds it
  -- (`public_url_for`: `https://cdn.matrxserver.com/<key>?v=<checksum[:8]>`), or NULL. A file that
  -- is private, deleted, not a picture, or not on the public bucket has no address an outsider may
  -- use. `p_own_only` asks that the file belong to this organization's Files (a portal's own logo);
  -- the organization's logo is the organization's own choice and is only asked to be public.
  select 'https://cdn.matrxserver.com/'
         || replace(substr(f.storage_uri, length('s3://cdn.matrxserver.com/') + 1), ' ', '%20')
         || case when coalesce(btrim(f.checksum), '') <> '' then '?v=' || left(btrim(f.checksum), 8) else '' end
    from files.files f
   where f.id = p_file_id
     and f.deleted_at is null
     and f.visibility = 'public'
     and f.storage_uri like 's3://cdn.matrxserver.com/%'
     and coalesce(f.mime_type, '') like 'image/%'
     and (not p_own_only or f.organization_id = p_organization_id);
$$;

comment on function custom._portal_picture_url(uuid, uuid, boolean) is
  'S6: the public CDN address of a public picture (the file service''s public_url_for), or NULL. Internal to the portal doors.';

create function custom._portal_style(p_organization_id uuid, p_config jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  v_org    record;
  v_style  jsonb := coalesce(p_config -> 'style', '{}'::jsonb);
  v_logo   uuid  := nullif(v_style ->> 'logo_file_id', '')::uuid;
  v_url    text;
  v_from   text[] := '{}';
  v_logoid uuid;
begin
  select o.name, o.logo_file_id, o.logo_url into v_org
    from iam.organizations o where o.id = p_organization_id;

  if v_logo is not null then
    v_url := custom._portal_picture_url(p_organization_id, v_logo, true);
    v_logoid := v_logo;
  end if;
  if v_url is null and v_org.logo_file_id is not null then
    v_url := custom._portal_picture_url(p_organization_id, v_org.logo_file_id, false);
    if v_url is not null then v_logoid := v_org.logo_file_id; v_from := array_append(v_from, 'logo'); end if;
  end if;
  if v_url is null and coalesce(v_org.logo_url, '') ~ '^https://' then
    v_url := v_org.logo_url; v_logoid := null; v_from := array_append(v_from, 'logo');
  end if;
  if coalesce(v_style ->> 'display_name', '') = '' then
    v_from := array_append(v_from, 'display_name');
  end if;

  return jsonb_build_object(
    'display_name', coalesce(nullif(v_style ->> 'display_name', ''), v_org.name, 'Client portal'),
    'welcome',      nullif(v_style ->> 'welcome', ''),
    'logo_file_id', v_logoid,
    'logo_url',     v_url,
    'accent',       nullif(v_style ->> 'accent', ''),
    'footer_links', coalesce(v_style -> 'footer_links', '[]'::jsonb),
    'from_organization', to_jsonb(v_from));
end $$;

comment on function custom._portal_style(uuid, jsonb) is
  'S6: what an outsider is shown of a portal''s look — the portal''s own values over the organization''s brand (name, logo file, logo address), with from_organization naming the ones that were defaulted.';

create function custom._portal_forms(p_organization_id uuid, p_config jsonb, p_open_only boolean)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $$
  -- The portal's forms in the portal's order, each with its title, the Table its answers land in
  -- and its state. `p_open_only` is the outsider's list: a closed, full or removed form is ABSENT
  -- there, never a dead button.
  select coalesce(jsonb_agg(x.item order by x.ord), '[]'::jsonb)
    from (
      select pf.ord,
             jsonb_build_object(
               'form_id', pf.form_id,
               'label',   coalesce(nullif(pf.label, ''), f.title, 'Form'),
               'order',   pf.ord,
               'title',   coalesce(f.title, 'Form'),
               'table_id', f.table_id,
               'table',   coalesce(nullif(t.data ->> 'name', ''), 'a table'),
               'state',   case
                            when f.id is null then 'gone'
                            when f.closed_at is not null then 'closed'
                            when f.submission_cap is not null
                                 and (select count(*) from custom.anon_submission s
                                       where s.organization_id = f.organization_id
                                         and s.form_id = f.id and s.state <> 'rejected') >= f.submission_cap
                              then 'full'
                            else 'open'
                          end) as item,
             f.id is not null and f.closed_at is null as live
        from jsonb_array_elements(coalesce(p_config -> 'forms', '[]'::jsonb)) with ordinality e(v, pos)
        cross join lateral (select nullif(e.v ->> 'form_id', '')::uuid as form_id,
                                   e.v ->> 'label' as label,
                                   coalesce((e.v ->> 'order')::integer, e.pos::integer) as ord) pf
        left join custom.anon_form f
          on f.organization_id = p_organization_id and f.id = pf.form_id and f.deleted_at is null
        left join custom.record t
          on t.organization_id = p_organization_id and t.id = f.table_id) x
   where not p_open_only or (x.item ->> 'state') = 'open';
$$;

comment on function custom._portal_forms(uuid, jsonb, boolean) is
  'S6: a portal''s forms in its order with title, Table and state (open, closed, full, gone); the outsider''s list is the open ones only.';

create function custom._portal_stage(p_organization_id uuid, p_table_id uuid, p_visible jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  v_key  text := custom._stage_field_key(p_organization_id, p_table_id);
  v_lab  text;
  v_opts uuid;
begin
  -- A stage an outsider may be told about: only when the Table has one AND the portal shows it.
  -- A stage Field the portal hides is not a timeline she is owed; it is a field she was not given.
  if v_key is null or not coalesce(p_visible ? v_key, false) then
    return null;
  end if;
  select coalesce(nullif(f.data ->> 'label', ''), 'Stage'),
         (f.data -> 'config' ->> 'options_table_id')::uuid
    into v_lab, v_opts
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = v_key;
  if v_lab is null then
    return null;
  end if;
  -- THE ORDER A PERSON DECLARED — read as records, exactly as custom.pipeline_read reads them.
  return jsonb_build_object(
    'field', v_key,
    'label', v_lab,
    'stages', coalesce((select jsonb_agg(jsonb_build_object(
                          'key', coalesce(nullif(o.metadata ->> 'option_key', ''),
                                          custom.choice_slug(o.data ->> 'title')),
                          'label', coalesce(nullif(o.data ->> 'title', ''), '(unnamed choice)'),
                          'retired', o.deleted_at is not null)
                          order by (o.deleted_at is not null),
                                   (o.metadata ->> 'option_position')::integer nulls last,
                                   o.created_at, o.id)
                         from custom.record o
                        where o.organization_id = p_organization_id
                          and v_opts is not null
                          and o.table_id = v_opts), '[]'::jsonb));
end $$;

comment on function custom._portal_stage(uuid, uuid, jsonb) is
  'S6: a Table''s stage Field and its stages in declared order, for a portal that shows that Field; NULL otherwise.';

create function custom._portal_config_judge(p_organization_id uuid, p_exposed uuid[],
                                            p_prior jsonb, p_given jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  v_out    jsonb := coalesce(p_prior, '{}'::jsonb);
  v_key    text;
  v_style  jsonb;
  v_s      jsonb := '{}'::jsonb;
  v_links  jsonb;
  v_link   jsonb;
  v_lout   jsonb := '[]'::jsonb;
  v_txt    text;
  v_url    text;
  v_logo   uuid;
  v_file   record;
  v_forms  jsonb;
  v_fout   jsonb := '[]'::jsonb;
  v_item   record;
  v_form   custom.anon_form;
  v_seen   uuid[] := '{}';
  v_n      integer := 0;
  v_table  text;
begin
  if p_given is not null and jsonb_typeof(p_given) <> 'null' then
    if jsonb_typeof(p_given) <> 'object' then
      raise exception 'A portal''s settings are an object with a look ("style") and a list of forms ("forms").'
        using errcode = '22023', hint = 'Nothing was written.';
    end if;
    for v_key in select jsonb_object_keys(p_given) loop
      if v_key not in ('style', 'forms') then
        raise exception 'A portal''s settings have a look ("style") and a list of forms ("forms"), and "%" is neither.', v_key
          using errcode = '22023', hint = 'Nothing was written.';
      end if;
    end loop;

    -- ── THE LOOK ──────────────────────────────────────────────────────────────────────
    if p_given ? 'style' then
      v_style := p_given -> 'style';
      if v_style is null or jsonb_typeof(v_style) = 'null' then
        v_out := v_out - 'style';           -- back to the organization's own brand
      elsif jsonb_typeof(v_style) <> 'object' then
        raise exception 'A portal''s look is an object: display_name, welcome, logo_file_id, accent, footer_links.'
          using errcode = '22023', hint = 'Nothing was written.';
      else
        for v_key in select jsonb_object_keys(v_style) loop
          if v_key not in ('display_name', 'welcome', 'logo_file_id', 'accent', 'footer_links') then
            raise exception 'A portal''s look has a name, a welcome line, a logo, an accent colour and footer links, and "%" is none of them.', v_key
              using errcode = '22023',
                    hint = 'The keys are display_name, welcome, logo_file_id, accent and footer_links. Nothing was written.';
          end if;
        end loop;

        v_txt := nullif(btrim(coalesce(v_style ->> 'display_name', '')), '');
        if v_txt is not null then
          if length(v_txt) < 2 or length(v_txt) > 80 then
            raise exception 'The name a portal shows has to be 2 to 80 characters, and "%" is %.', v_txt, length(v_txt)
              using errcode = '22023', hint = 'Leave it empty to show the organization''s own name. Nothing was written.';
          end if;
          v_s := v_s || jsonb_build_object('display_name', v_txt);
        end if;

        v_txt := nullif(btrim(coalesce(v_style ->> 'welcome', '')), '');
        if v_txt is not null then
          if length(v_txt) > 280 then
            raise exception 'A portal''s welcome line is at most 280 characters, and this one is %.', length(v_txt)
              using errcode = '22023', hint = 'It sits under the name on the sign-in page and at the top of the portal. Nothing was written.';
          end if;
          v_s := v_s || jsonb_build_object('welcome', v_txt);
        end if;

        v_txt := nullif(btrim(coalesce(v_style ->> 'accent', '')), '');
        if v_txt is not null then
          if not (v_txt = any (custom.portal_accents())) then
            raise exception 'A portal''s accent is one of the colours the rest of the app uses (%), and "%" is not one of them.',
              array_to_string(custom.portal_accents(), ', '), v_txt
              using errcode = '22023', hint = 'Leave it empty to use the app''s own colour. Nothing was written.';
          end if;
          v_s := v_s || jsonb_build_object('accent', v_txt);
        end if;

        v_txt := nullif(btrim(coalesce(v_style ->> 'logo_file_id', '')), '');
        if v_txt is not null then
          begin
            v_logo := v_txt::uuid;
          exception when invalid_text_representation then
            raise exception 'A portal''s logo is a picture from this organization''s Files, named by its id, and "%" is not an id.', v_txt
              using errcode = '22023', hint = 'Nothing was written.';
          end;
          select f.id, f.organization_id, f.visibility::text as visibility, f.mime_type, f.storage_uri, f.deleted_at
            into v_file
            from files.files f where f.id = v_logo;
          if v_file.id is null or v_file.deleted_at is not null
             or v_file.organization_id is distinct from p_organization_id then
            -- A file of another organization answers exactly as one that does not exist.
            raise exception 'There is no such picture in this organization''s Files, so it cannot be this portal''s logo.'
              using errcode = '02000', hint = 'Pick a picture from Files, or upload the logo there first. Nothing was written.';
          end if;
          if coalesce(v_file.mime_type, '') not like 'image/%' then
            raise exception 'That file is not a picture, so it cannot be this portal''s logo.'
              using errcode = '22023', hint = 'Pick a PNG, JPEG, WebP or SVG from Files. Nothing was written.';
          end if;
          if custom._portal_picture_url(p_organization_id, v_logo, true) is null then
            raise exception 'That picture is private to your organization, so the people you invite could not see it: a portal''s logo is shown on its sign-in page, before anybody has signed in.'
              using errcode = '42501',
                    hint = 'Make the picture public in Files, or pick one that already is. Nothing was written.';
          end if;
          v_s := v_s || jsonb_build_object('logo_file_id', v_logo);
        end if;

        v_links := v_style -> 'footer_links';
        if v_links is not null and jsonb_typeof(v_links) <> 'null' then
          if jsonb_typeof(v_links) <> 'array' then
            raise exception 'A portal''s footer links are a list of {label, url}.'
              using errcode = '22023', hint = 'Nothing was written.';
          end if;
          if jsonb_array_length(v_links) > 5 then
            raise exception 'A portal''s footer carries at most five links, and this one has %.', jsonb_array_length(v_links)
              using errcode = '22023', hint = 'Nothing was written.';
          end if;
          for v_link in select value from jsonb_array_elements(v_links) loop
            v_txt := nullif(btrim(coalesce(v_link ->> 'label', '')), '');
            v_url := nullif(btrim(coalesce(v_link ->> 'url', '')), '');
            if v_txt is null or v_url is null then
              raise exception 'Every footer link needs the words it shows and the address it opens.'
                using errcode = '22004', hint = 'Nothing was written.';
            end if;
            if length(v_txt) > 40 then
              raise exception 'A footer link''s words are at most 40 characters, and "%" is %.', v_txt, length(v_txt)
                using errcode = '22023', hint = 'Nothing was written.';
            end if;
            if v_url !~* '^(https://[^[:space:]]+|mailto:[^[:space:]]+|tel:[+0-9() .-]+)$' or length(v_url) > 500 then
              raise exception 'The footer link "%" opens "%", and a portal only links to a secure web address (https://), an email (mailto:) or a phone number (tel:).', v_txt, v_url
                using errcode = '22023', hint = 'Nothing was written.';
            end if;
            v_lout := v_lout || jsonb_build_array(jsonb_build_object('label', v_txt, 'url', v_url));
          end loop;
          if jsonb_array_length(v_lout) > 0 then
            v_s := v_s || jsonb_build_object('footer_links', v_lout);
          end if;
        end if;

        if v_s = '{}'::jsonb then
          v_out := v_out - 'style';
        else
          v_out := v_out || jsonb_build_object('style', v_s);
        end if;
      end if;
    end if;

    -- ── THE FORMS, AS GIVEN ───────────────────────────────────────────────────────────
    if p_given ? 'forms' then
      v_forms := p_given -> 'forms';
      if v_forms is null or jsonb_typeof(v_forms) = 'null'
         or (jsonb_typeof(v_forms) = 'array' and jsonb_array_length(v_forms) = 0) then
        v_out := v_out - 'forms';
      elsif jsonb_typeof(v_forms) <> 'array' then
        raise exception 'A portal''s forms are a list of {form_id, label, order}.'
          using errcode = '22023', hint = 'Nothing was written.';
      elsif jsonb_array_length(v_forms) > 12 then
        raise exception 'A portal carries at most twelve forms, and this one names %.', jsonb_array_length(v_forms)
          using errcode = '22023', hint = 'Nothing was written.';
      else
        v_out := v_out || jsonb_build_object('forms', v_forms);
      end if;
    end if;
  end if;

  -- ── EVERY FORM THAT WILL STAND IS JUDGED, GIVEN OR KEPT ─────────────────────────────
  -- Against the Tables THIS declaration exposes, so a table taken off the portal never takes a
  -- form with it in silence.
  if v_out ? 'forms' then
    for v_item in
      select e.v, e.pos,
             coalesce(case when jsonb_typeof(e.v -> 'order') = 'number' then (e.v ->> 'order')::numeric end, e.pos) as ord
        from jsonb_array_elements(v_out -> 'forms') with ordinality e(v, pos)
       order by 3, e.pos
    loop
      if jsonb_typeof(v_item.v) <> 'object' or nullif(v_item.v ->> 'form_id', '') is null then
        raise exception 'Every form on a portal is named by its id ({"form_id": …}).'
          using errcode = '22004', hint = 'Nothing was written.';
      end if;
      for v_key in select jsonb_object_keys(v_item.v) loop
        if v_key not in ('form_id', 'label', 'order') then
          raise exception 'A form on a portal has an id, a label and an order, and "%" is none of them.', v_key
            using errcode = '22023', hint = 'Nothing was written.';
        end if;
      end loop;
      begin
        select * into v_form from custom.anon_form f
         where f.organization_id = p_organization_id and f.id = (v_item.v ->> 'form_id')::uuid
           and f.deleted_at is null;
      exception when invalid_text_representation then
        raise exception 'A form on a portal is named by its id, and "%" is not an id.', v_item.v ->> 'form_id'
          using errcode = '22023', hint = 'Nothing was written.';
      end;
      if v_form.id is null then
        raise exception 'There is no form % in this organization, so this portal cannot offer it.', v_item.v ->> 'form_id'
          using errcode = '02000', hint = 'It may have been removed. Take it off the portal''s forms. Nothing was written.';
      end if;
      if v_form.id = any (v_seen) then
        raise exception 'The form "%" is on this portal twice.', coalesce(v_form.title, 'Form')
          using errcode = '23505', hint = 'Nothing was written.';
      end if;
      if v_form.audience = 'crew' then
        raise exception 'The form "%" is a crew form, filled in by your own people, so it cannot be offered to a client.', coalesce(v_form.title, 'Form')
          using errcode = '22023', hint = 'Nothing was written.';
      end if;
      if not (v_form.table_id = any (coalesce(p_exposed, '{}'))) then
        select coalesce(nullif(t.data ->> 'name', ''), 'a table') into v_table
          from custom.record t where t.organization_id = p_organization_id and t.id = v_form.table_id;
        raise exception 'The form "%" puts its answers in %, and this portal does not show that table, so a client would send something she could never see again.',
          coalesce(v_form.title, 'Form'), coalesce(v_table, 'a table')
          using errcode = '22023',
                hint = 'Add that table to the portal, or take the form off it. Nothing was written.';
      end if;
      v_seen := v_seen || v_form.id;
      v_n := v_n + 1;
      v_txt := nullif(btrim(coalesce(v_item.v ->> 'label', '')), '');
      if v_txt is not null and length(v_txt) > 60 then
        raise exception 'A form''s label on a portal is at most 60 characters, and "%" is %.', v_txt, length(v_txt)
          using errcode = '22023', hint = 'Nothing was written.';
      end if;
      v_fout := v_fout || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                  'form_id', v_form.id, 'label', v_txt, 'order', v_n)));
    end loop;
    v_out := v_out || jsonb_build_object('forms', v_fout);
  end if;

  if v_out = '{}'::jsonb then
    return null;
  end if;
  return v_out;
end $$;

comment on function custom._portal_config_judge(uuid, uuid[], jsonb, jsonb) is
  'S6: judges and normalizes a portal''s config. A top-level key given replaces that key; a key not given is kept; every form that will stand is re-judged against the Tables this declaration exposes. Refuses by name; returns NULL for an empty config.';

create function custom._portal_principal_here(p_organization_id uuid, p_portal_id uuid, p_door text)
returns custom.portal_principal
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  v_pp custom.portal_principal;
begin
  -- THE CALLER IS A LIVE PRINCIPAL OF THIS LIVE PORTAL, OR THIS DOOR SAYS NOTHING ABOUT IT.
  -- A portal that does not exist, one that is closed or archived, one of another organization and
  -- one the caller is not on all answer the same sentence: the id cannot be used to learn that a
  -- portal is there.
  select pp.* into v_pp
    from custom.portal_principal pp
    join custom.portal p on p.id = pp.portal_id
   where pp.portal_id = p_portal_id
     and pp.organization_id = p_organization_id
     and p.organization_id = p_organization_id
     and p.is_active and p.archived_at is null
     and pp.is_active
     and pp.user_id is not null
     and pp.user_id = custom.query_principal()
     and coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false);
  if v_pp.id is null then
    raise exception 'You are not on that portal, so % has nothing to show you there.', coalesce(nullif(btrim(p_door), ''), 'this door')
      using errcode = '42501',
            hint = 'Open the link the business emailed you, or ask them to invite this address.';
  end if;
  return v_pp;
end $$;

comment on function custom._portal_principal_here(uuid, uuid, text) is
  'S6: the caller''s own live principal row on a live portal, or one refusal (42501) for every other case.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3. custom.portal_declare — the eighth argument.
-- ─────────────────────────────────────────────────────────────────────────────────────────

drop function custom.portal_declare(uuid, text, uuid, jsonb, uuid, text, text);

create function custom.portal_declare(p_organization_id uuid, p_title text, p_client_table_id uuid, p_tables jsonb, p_portal_id uuid DEFAULT NULL::uuid, p_slug text DEFAULT NULL::text, p_sign_in_method text DEFAULT 'magic_link'::text, p_config jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id       uuid;
  v_slug     text;
  v_spec     jsonb;
  v_table    uuid;
  v_names    text;
  v_field    record;
  v_vis_ids  uuid[];
  v_edit_ids uuid[];
  v_vis_keys jsonb;
  v_ed_keys  jsonb;
  v_key      text;
  v_conveys  public.permission_level;
  v_comments boolean;
  v_ord      integer := 0;
  v_n        integer := 0;
  v_knob     jsonb;
  v_note     text;
  v_prior    jsonb;
  v_exposed  uuid[] := '{}';
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_declare');
  perform custom.assert_store_door(p_organization_id, 'custom.portal_declare');

  if p_organization_id is null or coalesce(btrim(p_title), '') = '' or p_client_table_id is null then
    raise exception 'A portal needs the organization it belongs to, a title, and the Table whose records are the clients.'
      using errcode = '22004';
  end if;
  if coalesce(p_sign_in_method, '') <> 'magic_link' then
    raise exception 'The only way into a portal today is a magic link by email, and "%" is not that.', p_sign_in_method
      using errcode = '22023',
            hint = 'The portal never holds a password: it asks the platform''s own auth to email a one-time link. A second sign-in method is a real feature, not a value this door will take.';
  end if;
  if jsonb_typeof(p_tables) is distinct from 'array' or jsonb_array_length(p_tables) = 0 then
    raise exception 'A portal that exposes no Table would show its clients an empty page, so this door does not make one.'
      using errcode = '22004',
            hint = 'Send tables as [{"table_id": …, "names_via": "<the field key that names the client>", "visible_fields": [...], "editable_fields": [...], "comments": false}].';
  end if;

  -- THE ONE LADDER, at the rung whose definition is "may decide who else sees it". A
  -- portal hands records of these Tables to people outside the organization, so the rung
  -- is `admin` on the CLIENT Table and on every Table exposed - the same question
  -- `custom.share_grant` asks before it shares one record.
  perform custom.assert_client_may_change(p_organization_id, p_client_table_id,
            'custom.portal_declare', 'admin'::public.permission_level, 'table');

  if p_portal_id is not null then
    select p.id, p.config into v_id, v_prior from custom.portal p
     where p.id = p_portal_id and p.organization_id = p_organization_id;
    if v_id is null then
      raise exception 'There is no such portal in this organization.' using errcode = '02000';
    end if;
  end if;

  v_slug := coalesce(nullif(btrim(lower(coalesce(p_slug, ''))), ''),
                     custom.portal_slug(p_organization_id, p_title, p_portal_id));

  if v_id is null then
    insert into custom.portal (organization_id, title, slug, client_table_id, sign_in_method,
                               opened_at, created_by)
    values (p_organization_id, btrim(p_title), v_slug, p_client_table_id, 'magic_link',
            now(), custom.query_principal())
    returning id into v_id;
  else
    update custom.portal
       set title = btrim(p_title), slug = v_slug, client_table_id = p_client_table_id,
           is_active = true, closed_at = null
     where id = v_id;
    -- RE-STATING a portal replaces what it exposes, so a Table dropped from the
    -- declaration stops being exposed in the same act. The principals are untouched:
    -- who is invited is not part of what the portal shows.
    delete from custom.portal_table where portal_id = v_id;
  end if;

  for v_spec in select value from jsonb_array_elements(p_tables) loop
    v_ord := v_ord + 1;
    v_table := nullif(v_spec ->> 'table_id', '')::uuid;
    v_names := nullif(btrim(coalesce(v_spec ->> 'names_via', '')), '');
    if v_table is null or v_names is null then
      raise exception 'Every Table a portal exposes has to say which Field on it names the client.'
        using errcode = '22004',
              hint = 'Each entry needs table_id and names_via. names_via is the key of the relation Field that points at the client Table - it is what makes "only theirs" answerable.';
    end if;
    perform custom.assert_client_may_change(p_organization_id, v_table,
              'custom.portal_declare', 'admin'::public.permission_level, 'table');

    select fm.field_id, fm.field_key, fm.field_type, fm.points_at
      into v_field
      from custom.portal_field_map(p_organization_id, v_table) fm
     where fm.field_key = v_names;
    if v_field.field_id is null then
      raise exception 'That Table has no field called "%", so a portal over it cannot say who a record belongs to.', v_names
        using errcode = '42703',
              hint = format('Its fields are %s.',
                            coalesce((select string_agg(fm.field_key, ', ' order by fm.field_key)
                                        from custom.portal_field_map(p_organization_id, v_table) fm), '(none)'));
    end if;
    if v_field.field_type is distinct from 'relation' then
      raise exception 'The field "%" is a % field, and a portal needs a relation - the "belongs to" link that points at the client.', v_names, v_field.field_type
        using errcode = '22023',
              hint = 'REL-10: a relation Field''s key IS the role of the association the store writes, and that association is what carries the record to the client. A text field holding a name carries nothing, so it could never answer "only theirs" without a second query - which is the thing this design exists to avoid.';
    end if;
    if v_field.points_at is distinct from p_client_table_id then
      raise exception 'The field "%" points at a different Table from the one whose records are the clients, so it does not say who this record belongs to.', v_names
        using errcode = '22023',
              hint = 'Point names_via at the relation Field that links this Table to the client Table, or make the client Table the one that Field already points at.';
    end if;

    -- THE FIELDS. Nothing given means every field of that Table is visible and none is
    -- editable - the honest default for a portal, and the one a person describing
    -- "let them see their jobs" means.
    select coalesce(array_agg(fm.field_id order by fm.field_key), '{}'),
           coalesce(jsonb_agg(fm.field_key order by fm.field_key), '[]')
      into v_vis_ids, v_vis_keys
      from custom.portal_field_map(p_organization_id, v_table) fm
     where jsonb_typeof(v_spec -> 'visible_fields') is distinct from 'array'
        or jsonb_array_length(coalesce(v_spec -> 'visible_fields', '[]')) = 0
        or fm.field_key in (select jsonb_array_elements_text(v_spec -> 'visible_fields'));

    v_edit_ids := '{}'; v_ed_keys := '[]';
    if jsonb_typeof(v_spec -> 'editable_fields') = 'array' then
      for v_key in select jsonb_array_elements_text(v_spec -> 'editable_fields') loop
        if not exists (select 1 from custom.portal_field_map(p_organization_id, v_table) fm
                        where fm.field_key = v_key) then
          raise exception 'That Table has no field called "%", so a portal cannot let a client edit it.', v_key
            using errcode = '42703';
        end if;
        if not (v_key = any (select jsonb_array_elements_text(v_vis_keys))) then
          raise exception 'The field "%" is editable in this portal but not visible in it, which is a screen that cannot exist.', v_key
            using errcode = '22023',
                  hint = 'Add it to visible_fields as well, or take it out of editable_fields. Nothing was written.';
        end if;
        select fm.field_id into v_field from custom.portal_field_map(p_organization_id, v_table) fm where fm.field_key = v_key;
        v_edit_ids := v_edit_ids || v_field.field_id;
        v_ed_keys := v_ed_keys || to_jsonb(v_key);
      end loop;
    end if;

    v_comments := coalesce((v_spec ->> 'comments')::boolean, false);
    v_conveys := case
                   when coalesce(array_length(v_edit_ids, 1), 0) > 0 then 'editor'::public.permission_level
                   when v_comments then 'commenter'::public.permission_level
                   else 'viewer'::public.permission_level
                 end;

    select fm.field_id into v_field
      from custom.portal_field_map(p_organization_id, v_table) fm where fm.field_key = v_names;

    insert into custom.portal_table (portal_id, organization_id, table_id, names_via_field_id,
                                     edge_role, visible_field_ids, visible_field_keys,
                                     editable_field_ids, editable_field_keys, comments_allowed,
                                     conveys_max, ord)
    values (v_id, p_organization_id, v_table, v_field.field_id, v_names,
            v_vis_ids, v_vis_keys, v_edit_ids, v_ed_keys, v_comments, v_conveys, v_ord);
    v_exposed := v_exposed || v_table;
    v_n := v_n + 1;
  end loop;

  -- S6: THE PORTAL'S LOOK AND ITS FORMS. A key given replaces that key; a key not given is kept
  -- (a caller that sends no p_config, as every caller before S6 does, leaves both exactly as they
  -- were); every form that will stand is re-judged against the Tables just declared.
  update custom.portal
     set config = custom._portal_config_judge(p_organization_id, v_exposed, v_prior, p_config)
   where id = v_id
     and config is distinct from custom._portal_config_judge(p_organization_id, v_exposed, v_prior, p_config);

  -- THE ORGANIZATION OPENS ITS OWN EXTERNAL LANE, AND THAT ACT IS THIS ONE.
  -- W2-TRUST's ruling stands: the world-lane admission CHECKS are not switchable, and the
  -- knob holds the LANE closed, not a check. Declaring a portal IS the explicit act VIS-N-5
  -- asks for - an organization admin saying, on the record, that outsiders may sign in
  -- here. It is written as an organization override so the platform default stays false
  -- and every other organization is untouched.
  v_note := format('Opened by custom.portal_declare for the portal "%s".', btrim(p_title));
  if custom.query_principal() is null and custom.query_is_store_owner() then
    -- The server lane. Already judged at `admin` on the client Table, which is a higher bar
    -- than the knob door's own gate; this is the door's own writer, not a second path.
    v_knob := platform._knob_override_write(
      'custom', 'external_principal_enabled', 'organization', p_organization_id,
      p_organization_id, 'true'::jsonb, v_note, null);
  else
    v_knob := platform.knob_override_set(
      'custom', 'external_principal_enabled', 'organization', p_organization_id,
      p_organization_id, 'true'::jsonb, v_note);
  end if;
  if not coalesce((v_knob ->> 'ok')::boolean, false) then
    raise exception 'The portal was not made: this organization''s outside door could not be opened (%).',
      coalesce(v_knob ->> 'reason', 'no reason given')
      using errcode = '42501',
            hint = coalesce(nullif(v_knob ->> 'detail', ''),
                            'custom/external_principal_enabled is what lets somebody with no membership sign in here, and declaring a portal is the act that opens it. Whoever declares a portal has to be an owner or an admin of the organization.');
  end if;

  return v_id;
end $function$;

comment on function custom.portal_declare(uuid, text, uuid, jsonb, uuid, text, text, jsonb) is
  'VIS-31 / PORTAL + S6: create or re-state one portal. Re-stating replaces what it exposes and leaves the people alone. p_config carries the portal''s look ({"style": …}) and its forms ({"forms": [{form_id, label, order}]}); a key given replaces that key, a key not given is kept, and every form is judged against the Tables this call exposes.';

update platform.client_callable_door d
   set identity_args = pg_get_function_identity_arguments('custom.portal_declare(uuid, text, uuid, jsonb, uuid, text, text, jsonb)'::regprocedure),
       identity_argtypes = platform.door_argtypes(p.proargtypes),
       reason = d.reason || ' S6: p_config (the portal''s look and its forms) is judged inside the body by custom._portal_config_judge: a logo must be a PUBLIC picture of THIS organization''s Files (a file of another organization answers exactly as one that does not exist), and every form must be a form of THIS organization whose Table this call exposes.',
       argument_rules = case when d.argument_rules is null then null else
         jsonb_set(d.argument_rules, '{arguments,p_config}', jsonb_build_object(
           'type', 'jsonb',
           'check', 'S6: the uuids inside (style.logo_file_id, forms[].form_id) reach no row without organization_id = p_organization_id beside them — files.files.organization_id and custom.anon_form.organization_id — decided after the ladder has admitted the caller at admin on the client Table; a foreign id is refused with the sentence an invented one gets.',
           'foreign', jsonb_build_object('not_a_leak', true, 'same_as_invented', true),
           'verified', '2026-09-23 lane S6 — read from this body')) end
  from pg_catalog.pg_proc p
 where p.oid = 'custom.portal_declare(uuid, text, uuid, jsonb, uuid, text, text, jsonb)'::regprocedure
   and d.schema_name = 'custom' and d.function_name = 'portal_declare';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 4. custom.portal_card — the owner sees the look as stored and as it resolves, and the forms.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create or replace function custom.portal_card(p_organization_id uuid, p_portal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_p custom.portal;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_card');
  select * into v_p from custom.portal where id = p_portal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such portal in this organization.' using errcode = '02000';
  end if;
  perform custom.assert_client_may_open(p_organization_id, v_p.client_table_id,
            'custom.portal_card', 'admin'::public.permission_level, 'table');

  return jsonb_build_object(
    'portal_id', v_p.id,
    'title', v_p.title,
    'slug', v_p.slug,
    'is_active', v_p.is_active,
    'sign_in_method', v_p.sign_in_method,
    'client_table_id', v_p.client_table_id,
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
               'table_id', pt.table_id,
               'name', coalesce(nullif(t.data ->> 'name', ''), 'a table'),
               'names_via', pt.edge_role,
               'visible_fields', pt.visible_field_keys,
               'editable_fields', pt.editable_field_keys,
               'comments', pt.comments_allowed,
               'conveys', pt.conveys_max::text) order by pt.ord)
        from custom.portal_table pt
        left join custom.record t on t.organization_id = pt.organization_id and t.id = pt.table_id
       where pt.portal_id = v_p.id), '[]'::jsonb),
    'principals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'principal_id', pp.id,
               'email', pp.email,
               'client_record_id', pp.client_record_id,
               'client', coalesce(custom.portal_record_title(pp.organization_id, pp.client_record_id), pp.client_record_id::text),
               'signed_in', pp.user_id is not null,
               'is_active', pp.is_active,
               'invited_at', pp.invited_at,
               'revoked_at', pp.revoked_at,
               -- TAILS-5 (B): THE LINK THE OFFICE COPIES, per person. Built the one way it is
               -- built anywhere, from the invitation custom.portal_invite minted. Null when
               -- there is no live link — the screen says which, and never draws a dead control.
               'accept_path', (
                 select '/invitations/portal/accept/' || i.token
                   from iam.invitations i
                  where i.target_type = 'portal_principal'
                    and i.target_id = pp.id
                    and i.organization_id = pp.organization_id
                    and i.status = 'pending'
                    and i.deleted_at is null
                    and (i.expires_at is null or i.expires_at > now())
                  order by i.created_at desc
                  limit 1)) order by pp.invited_at)
        from custom.portal_principal pp
       where pp.portal_id = v_p.id), '[]'::jsonb),
    'external_lane_open', coalesce(
      (platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false),
    -- S6: the look as the owner set it, as a client sees it, and every form with its state.
    'config', coalesce(v_p.config, '{}'::jsonb),
    'style', custom._portal_style(p_organization_id, v_p.config),
    'forms', custom._portal_forms(p_organization_id, v_p.config, false),
    'accents', to_jsonb(custom.portal_accents()));
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 5. custom.portal_me — the client's own read carries the look, the open forms, and each
--    Table's stages.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create or replace function custom.portal_me()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
begin
  -- The outsider's own standing, and NOTHING about anybody else's. It answers what the
  -- portal DECLARED - which Tables, which fields - and not one record: the records come
  -- back through `custom.read_records` like everybody else's, so there is one read path
  -- on this platform and a portal is not a second one.
  if v_me is null then
    return jsonb_build_object('signed_in', false, 'portals', '[]'::jsonb,
      'explanation', 'Nobody is signed in, so there is no portal to show.');
  end if;
  return jsonb_build_object(
    'signed_in', true,
    'user_id', v_me,
    'external', iam.is_external_principal(v_me),
    'portals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'portal_id', p.id,
               'title', p.title,
               'slug', p.slug,
               'organization_id', p.organization_id,
               'organization', o.name,
               'principal_id', pp.id,
               'client_record_id', pp.client_record_id,
               'client', coalesce(custom.portal_record_title(p.organization_id, pp.client_record_id), 'your records'),
               -- S6: the portal's look and the forms she may send, open ones only.
               'style', custom._portal_style(p.organization_id, p.config),
               'forms', custom._portal_forms(p.organization_id, p.config, true),
               'tables', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'table_id', pt.table_id,
                          'name', coalesce(nullif(t.data ->> 'name', ''), 'Records'),
                          'visible_fields', pt.visible_field_keys,
                          'editable_fields', pt.editable_field_keys,
                          'comments', pt.comments_allowed,
                          -- S6: the stages this Table moves through, when the portal shows its stage.
                          'stage', custom._portal_stage(pt.organization_id, pt.table_id, pt.visible_field_keys)) order by pt.ord)
                   from custom.portal_table pt
                   left join custom.record t on t.organization_id = pt.organization_id and t.id = pt.table_id
                  where pt.portal_id = p.id), '[]'::jsonb))
             order by p.title)
        from custom.portal_principal pp
        join custom.portal p on p.id = pp.portal_id and p.is_active
        join iam.organizations o on o.id = p.organization_id
       where pp.user_id = v_me and pp.is_active
         and coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p.organization_id) #>> '{}')::boolean, false)),
      '[]'::jsonb));
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 6. custom.portal_public — the sign-in page carries the look.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create or replace function custom.portal_public(p_slug text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
declare
  v_p custom.portal;
  v_o text;
begin
  -- THE SIGN-IN PAGE, AND NOTHING ELSE. A slug that does not exist, one that is closed, one
  -- that is ARCHIVED, and one whose organization has not opened the external lane all answer
  -- the same NULL, which is the 404: the address cannot be used to learn that anything is
  -- there.
  select * into v_p from custom.portal
   where slug = lower(btrim(coalesce(p_slug, ''))) and is_active and archived_at is null;
  if not found then return null; end if;
  if not coalesce((platform.knob_resolve('custom', 'external_principal_enabled', v_p.organization_id) #>> '{}')::boolean, false) then
    return null;
  end if;
  select o.name into v_o from iam.organizations o where o.id = v_p.organization_id;

  if not custom.store_is_open(v_p.organization_id) then
    return jsonb_build_object(
      'portal_id', v_p.id, 'slug', v_p.slug, 'title', v_p.title, 'organization', v_o,
      'sign_in_method', v_p.sign_in_method, 'state', 'unavailable',
      'message', custom.store_off_sentence(v_p.organization_id),
      'style', custom._portal_style(v_p.organization_id, v_p.config));
  end if;

  -- S6: the look — what the business is called here, its logo and its colour — so the page a
  -- client opens from a text message says whose it is before she types anything.
  return jsonb_build_object(
    'portal_id', v_p.id, 'slug', v_p.slug, 'title', v_p.title, 'organization', v_o,
    'sign_in_method', v_p.sign_in_method, 'state', 'open',
    'style', custom._portal_style(v_p.organization_id, v_p.config));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 7. custom.portal_form — one of HER portal's forms, its questions.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.portal_form(p_organization_id uuid, p_portal_id uuid, p_form_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_pp     custom.portal_principal;
  v_p      custom.portal;
  v_f      custom.anon_form;
  v_names  text;
  v_item   jsonb;
  v_fields jsonb;
  v_state  text := 'open';
  v_msg    text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.portal_form');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_form');
  v_pp := custom._portal_principal_here(p_organization_id, p_portal_id, 'custom.portal_form');
  select * into v_p from custom.portal where id = v_pp.portal_id;

  select e.v into v_item
    from jsonb_array_elements(coalesce(v_p.config -> 'forms', '[]'::jsonb)) e(v)
   where e.v ->> 'form_id' = p_form_id::text;
  select * into v_f from custom.anon_form
   where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
  if v_item is null or v_f.id is null then
    raise exception 'That form is not on your portal.'
      using errcode = '02000', hint = 'Go back to your portal: the forms you can send are listed there.';
  end if;

  -- The Field that ties the form's Table to her is the PORTAL's to fill, never a question.
  select pt.edge_role into v_names from custom.portal_table pt
   where pt.portal_id = v_p.id and pt.table_id = v_f.table_id;

  if v_f.closed_at is not null then
    v_state := 'closed'; v_msg := 'This form is closed, so it is not taking any more answers.';
  elsif v_f.submission_cap is not null
        and (select count(*) from custom.anon_submission s
              where s.organization_id = v_f.organization_id and s.form_id = v_f.id
                and s.state <> 'rejected') >= v_f.submission_cap then
    v_state := 'full'; v_msg := 'This form has all the answers it was set up to take.';
  end if;

  -- EXACTLY the exposed Fields, as the store holds them — the same `{id, ...data}` shape
  -- custom.form_public builds — minus the one the portal fills.
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id) || f.data order by ord), '[]'::jsonb)
    into v_fields
    from jsonb_array_elements_text(v_f.exposed_field_keys) with ordinality k(key, ord)
    join custom.record f
      on f.organization_id = v_f.organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_f.table_id
     and f.data ->> 'key' = k.key
   where k.key is distinct from v_names;

  return jsonb_build_object(
    'form_id', v_f.id,
    'portal_id', v_p.id,
    'table_id', v_f.table_id,
    'title', coalesce(v_f.title, 'Form'),
    'label', coalesce(nullif(v_item ->> 'label', ''), v_f.title, 'Form'),
    'presentation', v_f.presentation,
    'fields', v_fields,
    'required', coalesce((select jsonb_agg(r) from jsonb_array_elements_text(v_f.required_field_keys) r
                           where r is distinct from v_names), '[]'::jsonb),
    'state', v_state,
    'message', v_msg);
end $$;

comment on function custom.portal_form(uuid, uuid, uuid) is
  'S6: a form on the caller''s own portal — its questions (the exposed Fields minus the one that names the client, which the portal fills), its required keys and its state. A caller who is not a live principal of that live portal, or a form not on it, is refused.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 8. custom.portal_form_submit — her answers, landing as hers.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.portal_form_submit(p_organization_id uuid, p_portal_id uuid, p_form_id uuid,
                                          p_payload jsonb, p_client_key text DEFAULT NULL::text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_pp       custom.portal_principal;
  v_p        custom.portal;
  v_f        custom.anon_form;
  v_names    text;
  v_exposed  text[];
  v_required text[];
  v_missing  text[];
  v_key      text;
  v_doc      jsonb := '{}'::jsonb;
  v_existing uuid;
  v_rec      uuid;
  v_id       uuid;
  v_count    bigint;
  v_held     text;
  v_stood    boolean := false;
  v_msg      text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.portal_form_submit');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_form_submit');
  v_pp := custom._portal_principal_here(p_organization_id, p_portal_id, 'custom.portal_form_submit');
  select * into v_p from custom.portal where id = v_pp.portal_id;

  select * into v_f from custom.anon_form
   where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
  if v_f.id is null or not exists (
       select 1 from jsonb_array_elements(coalesce(v_p.config -> 'forms', '[]'::jsonb)) e(v)
        where e.v ->> 'form_id' = p_form_id::text) then
    raise exception 'That form is not on your portal.'
      using errcode = '02000', hint = 'Go back to your portal: the forms you can send are listed there.';
  end if;
  select pt.edge_role into v_names from custom.portal_table pt
   where pt.portal_id = v_p.id and pt.table_id = v_f.table_id;
  if v_names is null then
    -- custom.portal_declare refuses this state; a table taken off the portal outside it still
    -- says so rather than writing a record that would never reach her.
    raise exception 'That form puts its answers in a table this portal no longer shows, so it cannot be sent from here.'
      using errcode = '22023', hint = 'The business has to put the table back on the portal, or take the form off it.';
  end if;

  if v_f.closed_at is not null then
    return jsonb_build_object('submission_id', null, 'record_id', null, 'state', 'closed',
             'message', 'This form is closed, so it is not taking any more answers.');
  end if;

  -- IDEMPOTENCY BEFORE RATE, so a replay costs no budget and makes no second row.
  if p_client_key is not null then
    select s.id, s.record_id into v_existing, v_rec from custom.anon_submission s
     where s.organization_id = v_f.organization_id and s.form_id = v_f.id
       and s.client_key = p_client_key and s.deleted_at is null;
    if v_existing is not null then
      return jsonb_build_object('submission_id', v_existing, 'record_id', v_rec, 'state', 'accepted',
               'message', 'This had already arrived, so it was not sent twice.');
    end if;
  end if;

  select count(*) into v_count from custom.anon_submission s
   where s.organization_id = v_f.organization_id and s.form_id = v_f.id and s.state <> 'rejected';
  if v_f.submission_cap is not null and v_count >= v_f.submission_cap then
    return jsonb_build_object('submission_id', null, 'record_id', null, 'state', 'full',
             'message', 'This form has all the answers it was set up to take.');
  end if;

  -- THE RATE LIMIT, on a bucket that is THIS person on THIS portal — the store's own choice.
  begin
    perform custom.anon_rate_take(v_f.organization_id, v_f.id, 'portal:' || v_pp.id::text, null);
  exception when sqlstate '53400' then
    return jsonb_build_object('submission_id', null, 'record_id', null, 'state', 'too_many',
             'message', 'That is more than this form takes in one go. Try again in a little while.');
  end;

  -- SCOPE. A key the form does not ask for is refused BY NAME, never trimmed in silence — and the
  -- Field that says which client this is for is the portal's, never hers to fill.
  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_exposed
    from jsonb_array_elements(v_f.exposed_field_keys);
  for v_key in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
    if v_key = v_names then
      raise exception 'Which client this is for is decided by the portal, not by the form, so "%" cannot be filled in here.', v_key
        using errcode = '42501', hint = 'Leave it out: the portal fills it with your own record.';
    end if;
    if not (v_key = any (v_exposed)) then
      raise exception 'This form does not have a field called "%".', v_key
        using errcode = '42501',
              hint = format('It accepts: %s.', coalesce(array_to_string(array_remove(v_exposed, v_names), ', '), '(nothing)'));
    end if;
    v_doc := v_doc || jsonb_build_object(v_key, p_payload -> v_key);
  end loop;

  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_required
    from jsonb_array_elements(v_f.required_field_keys);
  select coalesce(array_agg(k), array[]::text[]) into v_missing
    from unnest(v_required) k
   where k is distinct from v_names
     and coalesce(p_payload -> k, 'null'::jsonb) in ('null'::jsonb, '""'::jsonb);
  if array_length(v_missing, 1) > 0 then
    raise exception 'This form needs %.', array_to_string(v_missing, ', ')
      using errcode = '22004',
            hint = 'Each missing field is named so the screen can point at it, rather than showing one error beside a form with twenty questions.';
  end if;

  -- THE PORTAL NAMES THE CLIENT.
  v_doc := v_doc || jsonb_build_object(v_names, v_pp.client_record_id::text);

  insert into custom.anon_submission (organization_id, form_id, table_id, source, payload,
                                      raw_payload, client_key, state, remote_origin)
  values (v_f.organization_id, v_f.id, v_f.table_id, 'portal', v_doc,
          jsonb_build_object('form_id', v_f.id, 'form_slug', v_f.slug,
                             'form_version', v_f.version, 'at', now(), 'via', 'portal',
                             'portal_id', v_p.id, 'principal_id', v_pp.id,
                             'client_record_id', v_pp.client_record_id),
          p_client_key, 'quarantined', 'portal:' || v_p.slug)
  returning id into v_id;

  -- WHO WRITES IT: the person who declared this portal. They were judged at `admin` on every
  -- Table it shows, and she was not — she holds her own records, not the Table. The stand-in is
  -- put back on every exit path.
  if v_p.created_by is not null then
    v_held := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_p.created_by, 'role', 'authenticated')::text, true);
    v_stood := true;
  end if;
  begin
    if v_f.quarantine_rule_id is not null then
      -- The form's own Rule decides, exactly as it decides a stranger's.
      v_rec := custom.anon_clear(v_f.organization_id, v_id);
    else
      -- No Rule: the invitation already said who this is. It lands now.
      v_rec := custom.record_write(
                 v_f.organization_id, v_f.table_id,
                 v_doc
                   || jsonb_build_object('_actor', 'system')
                   || jsonb_build_object('_source', jsonb_build_object(
                        'via',           'portal',
                        'form_id',       v_f.id,
                        'form_version',  v_f.version,
                        'submission_id', v_id,
                        'portal_id',     v_p.id,
                        'principal_id',  v_pp.id,
                        'at',            to_char(now() at time zone 'utc',
                                                 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))));
      update custom.anon_submission
         set state = 'cleared', record_id = v_rec, cleared_at = now()
       where organization_id = v_f.organization_id and id = v_id;
    end if;
  exception when others then
    if v_stood then
      perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
    end if;
    raise;
  end;
  if v_stood then
    perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
  end if;

  if p_client_key is not null then
    insert into custom.anon_replay (organization_id, client_key, table_id, submission_id, record_id, captured_at)
    values (v_f.organization_id, p_client_key, v_f.table_id, v_id, v_rec, now())
    on conflict (organization_id, client_key) where deleted_at is null do nothing;
  end if;

  if v_rec is not null then
    perform custom.form_notify(v_f.organization_id, v_f.id, v_rec, v_id);
    return jsonb_build_object('submission_id', v_id, 'record_id', v_rec, 'state', 'accepted',
             'message', null);
  end if;
  select s.rejection_reason, s.state into v_msg, v_key from custom.anon_submission s
   where s.organization_id = v_f.organization_id and s.id = v_id;
  return jsonb_build_object('submission_id', v_id, 'record_id', null,
           'state', case when v_key = 'rejected' then 'rejected' else 'held' end,
           'message', coalesce(v_msg, 'It arrived and is waiting for someone to look at it.'));
end $$;

comment on function custom.portal_form_submit(uuid, uuid, uuid, jsonb, text) is
  'S6: a signed-in client sends one of her portal''s forms. Scope, required fields, idempotency and the rate bucket are custom.form_submit''s rules; the relation Field that names the client is filled by the portal with her own record and refused if she sends it; the answer is quarantined (source portal), then the form''s accept Rule decides it or, with no Rule, it becomes a record at once, written as the person who declared the portal.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 9. The door rows for the two new doors (the grant is the next file).
-- ─────────────────────────────────────────────────────────────────────────────────────────

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'portal_form', 'p_organization_id uuid, p_portal_id uuid, p_form_id uuid',
   array['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
   'A portal client reads one form of her own portal. custom.assert_store_door and custom.assert_client_may_reach decide the organization first; custom._portal_principal_here then requires the caller to be a live, bound principal of that live portal of that organization (one refusal for every other case), and the form must be on that portal''s own list.',
   'uichamp_s6_a_portal_carries_its_look_and_its_forms.sql', 'closed until uichamp_s6_a_signed_in_person_may_open_a_portals_look_and_forms.sql opens it (the ddl guard revokes a definer''s client EXECUTE at birth)', false, false,
   jsonb_build_object('version', 1, 'declared_by', 'uichamp_s6_a_portal_carries_its_look_and_its_forms.sql',
     'declared_at', '2026-09-23 lane S6',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_store_door(arg1), custom.assert_client_may_reach(arg1) — the organization wall; a non-member who is no principal here is refused before anything is read.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true)),
       'p_portal_id', jsonb_build_object('type', 'uuid', 'position', 2,
         'check', 'DERIVED BY ORGANIZATION AND BY THE CALLER: custom._portal_principal_here admits only the caller''s own live principal row on a live portal of arg1; every other portal id answers the one 42501 sentence an invented id gets.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true)),
       'p_form_id', jsonb_build_object('type', 'uuid', 'position', 3,
         'check', 'read only under organization_id = arg1 AND on the admitted portal''s own config.forms list; a form of another organization or not on the list answers 02000 exactly as an invented id.',
         'foreign', jsonb_build_object('sqlstate', '02000', 'same_as_invented', true))))),
  ('custom', 'portal_form_submit', 'p_organization_id uuid, p_portal_id uuid, p_form_id uuid, p_payload jsonb, p_client_key text',
   array['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype, 'text'::regtype]::oid[],
   'A portal client sends one form of her own portal. The organization, the principal and the form are decided exactly as custom.portal_form decides them; the answer is scoped to the form''s own Fields, the Field naming the client is filled by the store with HER client record, and the write is custom.record_write (or custom.anon_clear under the form''s Rule) as the portal''s declarer.',
   'uichamp_s6_a_portal_carries_its_look_and_its_forms.sql', 'closed until uichamp_s6_a_signed_in_person_may_open_a_portals_look_and_forms.sql opens it (the ddl guard revokes a definer''s client EXECUTE at birth)', false, false,
   jsonb_build_object('version', 1, 'declared_by', 'uichamp_s6_a_portal_carries_its_look_and_its_forms.sql',
     'declared_at', '2026-09-23 lane S6',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_store_door(arg1), custom.assert_client_may_reach(arg1) — the organization wall; a non-member who is no principal here is refused before anything is read.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true)),
       'p_portal_id', jsonb_build_object('type', 'uuid', 'position', 2,
         'check', 'DERIVED BY ORGANIZATION AND BY THE CALLER: custom._portal_principal_here admits only the caller''s own live principal row on a live portal of arg1; every other portal id answers the one 42501 sentence an invented id gets.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true)),
       'p_form_id', jsonb_build_object('type', 'uuid', 'position', 3,
         'check', 'read only under organization_id = arg1 AND on the admitted portal''s own config.forms list; a form of another organization or not on the list answers 02000 exactly as an invented id.',
         'foreign', jsonb_build_object('sqlstate', '02000', 'same_as_invented', true)))));
