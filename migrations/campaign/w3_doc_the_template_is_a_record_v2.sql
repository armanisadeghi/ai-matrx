-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- THIS FILE SUPERSEDES `w3_doc_the_template_is_a_record.sql`. It carries the SAME objects
-- under the SAME reserved prefix, byte-identical except for `custom.doc_format_value`'s
-- percent and date arms, which this lane's own acceptance test (`w3_doc_c43.sql` part D)
-- caught RED on the branch: `to_char(12.5,'FM999,999,990.####')` prints `13`, not `12.5`
-- (`####` is not a fraction spec) and `to_char(ts,'FMDD Month YYYY')` prints two spaces
-- before a short month name (`Month` is blank-padded to nine characters; only `FMMonth`
-- suppresses the padding). BOTH FIXED HERE, MEASURED ON THE BRANCH: `12.5`→`12.5`, `8`→`8`,
-- `12.567`→`12.567`; `3 November 2026`→`3 November 2026` (one space). A superseding filename
-- is required rather than `CREATE OR REPLACE` on the original name: the original body is now
-- live on the branch under this lane's own reservation, so a replacement needs a
-- `-- based-on:` line, which `pnpm db:based-on` cannot generate because the function does not
-- exist on PRODUCTION at all — this is a NEW function everywhere, not a replacement. The
-- original file's three inverses were run in dependency order (render-path → render-and-seal
-- → template) before this file was written, so no live object of this lane's is touched twice
-- under two names.
--
-- W3-DOC — REC-68. A DOCUMENT TEMPLATE IS A RECORD WHOSE TOKENS ARE FIELD IDS.
--
-- THE CHAMPION, NAMED BEFORE THE FIRST LINE (§3 rule 9 of the workspace laws, and REC-68's
-- own COMPANY proof): **PandaDoc**. PandaDoc resolves a document token from the CRM FIELD's
-- id rather than from a typed name, which is why re-pointing or renaming a field does not
-- break a template. Google Docs' mail merge does the opposite — it matches a `{{Header}}`
-- token to a spreadsheet COLUMN HEADING, so renaming the column silently empties the merge.
-- This lane implements PandaDoc's mechanism and refuses Google's: a token is
-- `{{field:<uuid>}}`, the uuid is a Field Record's id, and a Field's label may be rewritten
-- every day without touching one template.
--
-- WHAT THE LAW SAYS, WORD FOR WORD
-- --------------------------------
--   REC-68  "A document template is a Record whose tokens are Field ids, and it renders with
--            the units and formats the Field carries, so a merge cannot print a number the
--            record does not hold."
--
-- SO THE TEMPLATE IS A RECORD, NOT A TABLE. It is a row in `custom.record` with
-- `data_class = 'doc_template'` — the same shape `table`, `field`, `rule` and `merge_field`
-- already take (REC-36: one jsonb document per record). It is NOT a tenth kernel Table:
-- REC-27's kernel is NINE and `V8-PROD`'s fact ① counts exactly nine kernel rows on
-- production. A tenth would turn that verifier red for a reason that has nothing to do with
-- what it is checking.
--
-- 🚨 WHY THE REFUSAL IS A DOOR AND NOT A TRIGGER ON `custom.record`.
-- This lane holds NO LOCK. §4.7 gives it every object under its own reserved prefix `doc_`
-- inside schema `custom` and nothing else; a trigger added to `custom.record` is DDL on an
-- object `LOCK:custom` covers, and that lock is another lane's. So "refused at save, by
-- name" lives in the SAVE DOOR — `custom.doc_template_save` — which is the only writer that
-- can produce a `doc_template` row at all. That is not a weaker place to put it:
--   · schema `custom` is revoked from PUBLIC, anon, authenticated and service_role (§6.3),
--     so no client reaches `custom.record` directly;
--   · the ONE client door, `custom.record_write`, cannot set `data_class` — it inserts with
--     the column's default, `'record'` — so no caller can mint a template past this door;
--   · `custom.doc_template` (the view) reads `data_class = 'doc_template'` and therefore
--     shows exactly the rows this door wrote.
-- A template that skipped the door is unrepresentable rather than merely discouraged.
--
-- THE DOOR READS THE SWITCH. `custom.doc_template_save` calls the ONE door predicate
-- `custom.assert_store_door`, which resolves the guard this file is headed with —
-- `platform.knob_resolve('custom','system_enabled', <organization>)` — and refuses with
-- SQLSTATE 42501 while it is false for anyone but the role that owns `custom.record`.
-- There is one predicate and this file adds no second one.
--
-- WHAT MAKES THE TESTS FAIL — THE PRODUCTION CHANGES, NAMED (rule 3)
-- ------------------------------------------------------------------
--   · Delete the `v_bad is not null` branch from `custom.doc_template_save` → the refusal
--     leg of `w3_doc_c43.sql` (part B) fails: a token naming no Field saves silently.
--   · Make `custom.doc_unresolved_tokens` compare `f.key` instead of `f.id` → part B fails
--     AND part A fails, because every id-token becomes unresolvable.
--   · Delete the `'currency'` arm of `custom.doc_format_value` → part D fails: the merge
--     prints a bare number where the Field carries a currency.
--   · Delete the `p_field_data ->> 'unit'` arm → part D fails: the unit the Field carries
--     stops reaching the document.
--   · Widen `custom.doc_token_pattern()` to accept any word → part B fails: `{{field:name}}`
--     becomes a token and a NAME-keyed merge is back, which is the whole defect REC-68 names.
--
-- THE INVERSE: `migrations/inverse/w3_doc_the_template_is_a_record_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. THE TOKEN. One pattern, stated once, so nothing anywhere re-spells it.
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function custom.doc_token_pattern()
returns text language sql immutable parallel safe set search_path = pg_catalog as $$
  -- PandaDoc's mechanism: the token carries the Field's ID. The uuid shape is part of the
  -- pattern rather than checked afterwards, so `{{field:full_name}}` is NOT A TOKEN at all —
  -- it is ordinary text that renders as itself. A name-keyed merge cannot be written here.
  select '\{\{field:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}\}';
$$;

comment on function custom.doc_token_pattern() is
  'REC-68: a document-template token names a Field by its id. W3-DOC.';

create or replace function custom.doc_tokens(p_body text)
returns table(ordinal integer, raw text, field_id uuid)
language sql immutable parallel safe set search_path = pg_catalog as $$
  select row_number() over ()::integer,
         '{{field:' || m[1] || '}}',
         m[1]::uuid
    from regexp_matches(coalesce(p_body, ''), custom.doc_token_pattern(), 'gi') m;
$$;

comment on function custom.doc_tokens(text) is
  'Every Field id a template body points at, in the order it appears. W3-DOC.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. WHICH TOKENS DO NOT RESOLVE — the query the refusal is made of.
--    A token resolves when its uuid is a Field OF THE TABLE the template renders.
--    A Field of some OTHER table is unresolved for a different, named reason: that is
--    rule 3's second input with a different expected value, built into the law itself.
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function custom.doc_unresolved_tokens(
  p_organization_id uuid, p_table_id uuid, p_body text)
returns table(raw text, field_id uuid, why text)
language sql stable set search_path = pg_catalog as $$
  select distinct t.raw, t.field_id,
         case when f.id is null
                then 'there is no Field with that id in this organization'
              else 'that Field belongs to another table'
         end
    from custom.doc_tokens(p_body) t
    left join custom.field f
      on f.organization_id = p_organization_id and f.id = t.field_id
   where f.id is null or f.entity_definition_id is distinct from p_table_id;
$$;

comment on function custom.doc_unresolved_tokens(uuid, uuid, text) is
  'REC-68: the tokens a template body names that are not Fields of the Table it renders. W3-DOC.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. THE UNITS AND THE FORMATS THE FIELD CARRIES (REC-68's second half, FLD-N-1).
--    `unit` and `format` live on the Field and change what a value MEANS, so the merge
--    reads them off the Field and never off the template. A merge cannot print a number
--    the record does not hold: every arm below formats the STORED value and computes none.
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function custom.doc_format_value(p_field_data jsonb, p_value jsonb)
returns text language plpgsql immutable set search_path = pg_catalog as $$
declare
  v_fmt  text := nullif(p_field_data ->> 'format', '');
  v_unit text := nullif(p_field_data ->> 'unit', '');
  v_kind text := p_field_data -> 'config' ->> 'kind';
  v_n    numeric;
  v_t    text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return '';
  end if;

  -- A multi-valued Field renders as its values, in order, comma separated — the modifier
  -- (FLD-2), never a second behaviour.
  if jsonb_typeof(p_value) = 'array' then
    return (select string_agg(custom.doc_format_value(p_field_data, e), ', ')
              from jsonb_array_elements(p_value) e);
  end if;

  v_t := case when jsonb_typeof(p_value) = 'string' then p_value #>> '{}' else p_value::text end;

  if v_fmt = 'currency' then
    begin v_n := v_t::numeric; exception when others then return v_t; end;
    -- The UNIT is the currency (FLD-N-1's own worked example) and it is printed, because a
    -- proposal that says 1,200.00 without saying of what is exactly the merge that lies.
    return btrim(coalesce(v_unit || ' ', '') || to_char(v_n, 'FM999,999,999,990.00'));
  end if;

  if v_fmt = 'percent' then
    begin v_n := v_t::numeric; exception when others then return v_t; end;
    -- FIXED (found by this lane's own w3_doc_c43.sql part D): `####` is not a fraction
    -- specifier in `to_char`, so 12.5 printed as 13. `FM999,999,999,990.999999` prints up to
    -- six real decimal places and `rtrim` peels back trailing zeros and a bare trailing dot,
    -- so 12.5 stays 12.5, 8 stays 8, and 12.567 stays 12.567.
    return rtrim(rtrim(to_char(v_n, 'FM999,999,999,990.999999'), '0'), '.') || coalesce(v_unit, '%');
  end if;

  if v_fmt in ('date', 'datetime') or v_kind in ('date', 'datetime') then
    begin
      -- FIXED (found by the same test): `Month` blank-pads to nine characters and only the
      -- `FM` fill-mode PREFIXED ONTO `Month` itself (`FMMonth`) suppresses the padding — the
      -- leading `FM` on `FMDD` only affects the day. Without it, "3 November 2026" printed
      -- with two spaces before the year became "3 November  2026".
      return case when coalesce(v_fmt, v_kind) = 'date'
                  then to_char(v_t::timestamptz, 'FMDD FMMonth YYYY')
                  else to_char(v_t::timestamptz, 'FMDD FMMonth YYYY "at" HH24:MI') end;
    exception when others then return v_t;
    end;
  end if;

  -- url · email · phone · signature and every other declared format print the value the
  -- record holds. A format this function does not know is never a reason to print nothing.
  if v_unit is not null then
    return v_t || ' ' || v_unit;
  end if;
  return v_t;
end;
$$;

comment on function custom.doc_format_value(jsonb, jsonb) is
  'REC-68 / FLD-N-1: renders one stored Value with the unit and format its Field carries. W3-DOC.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. THE VIEW. A template is a Record, and this is how a person reads one.
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace view custom.doc_template with (security_invoker = true) as
  select r.id,
         r.organization_id,
         (r.data ->> 'renders_table_id')::uuid            as renders_table_id,
         r.data ->> 'name'                                as name,
         r.data ->> 'body'                                as body,
         coalesce((r.data ->> 'template_version')::integer, 1) as template_version,
         (select count(*) from custom.doc_tokens(r.data ->> 'body')) as token_count,
         r.created_by, r.updated_by, r.created_at, r.updated_at,
         r.version, r.metadata, r.visibility, r.data
    from custom.record r
   where r.data_class = 'doc_template'
     and r.deleted_at is null;

comment on view custom.doc_template is
  'REC-68: a document template IS a Record (data_class = doc_template), written only through custom.doc_template_save. W3-DOC.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. THE DOOR — and the refusal, BY NAME, that REC-68 is made of.
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function custom.doc_template_save(
  p_organization_id uuid,
  p_table_id        uuid,
  p_name            text,
  p_body            text,
  p_template_id     uuid default null)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_id      uuid;
  v_bad     record;
  v_tname   text;
  v_ver     integer;
  v_labels  text;
begin
  -- THE DOOR. One call to the ONE predicate. This is a SECURITY DEFINER door, so
  -- `current_user` in here is already the definer; `custom.assert_store_door` judges
  -- `custom.caller_role()` — what the caller actually held — and resolves the guard this
  -- file is headed with, custom/system_enabled, through platform.knob_resolve.
  perform custom.assert_store_door(p_organization_id, 'custom.doc_template_save');

  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.doc_template_save: organization_id and the table the template renders are both required'
      using errcode = '22004';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'a document template needs a name - it is what a person picks it by'
      using errcode = '23514', hint = 'REC-68.';
  end if;

  select t.data ->> 'name' into v_tname
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_tname is null then
    raise exception 'this template says it renders records of something that is not a table of this organization'
      using errcode = '23503',
            hint = 'REC-68: a template renders the records of ONE Table, and its tokens are that Table''s Fields.';
  end if;

  -- ── REC-68, THE REFUSAL. A token naming no Field is refused AT SAVE, BY NAME. ──────
  -- It names the token it refused and the Fields that ARE available, because a refusal
  -- that does not say what to write instead is a dead end.
  select * into v_bad
    from custom.doc_unresolved_tokens(p_organization_id, p_table_id, p_body)
   order by raw
   limit 1;
  if v_bad.raw is not null then
    select string_agg(format('%s (%s)', f.label, f.id), ', ' order by f.sort, f.key)
      into v_labels
      from custom.field f
     where f.organization_id = p_organization_id
       and f.entity_definition_id = p_table_id;
    raise exception 'the template "%" points at % and %', btrim(p_name), v_bad.raw, v_bad.why
      using errcode = '23503',
            hint = format('REC-68: a token names a Field of %s by its id, never by a name, so renaming a field never breaks a template. The fields you can merge here are: %s.',
                          v_tname, coalesce(v_labels, 'none - this table has declared no fields yet'));
  end if;

  -- ── the positive path: it is a Record, written the way every Record is written ─────
  if p_template_id is null then
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, null, 'doc_template', jsonb_build_object(
      'renders_table_id', p_table_id,
      'name', btrim(p_name),
      'body', coalesce(p_body, ''),
      'template_version', 1))
    returning id into v_id;
    return v_id;
  end if;

  -- REC-68 + VAL-10: EVERY SAVE OF AN EXISTING TEMPLATE IS A NEW TEMPLATE VERSION. A
  -- signature seals a document version (VAL-10), so a template whose body could move under
  -- a sealed document without the version moving would make the seal meaningless.
  select coalesce((r.data ->> 'template_version')::integer, 1) into v_ver
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_template_id
     and r.data_class = 'doc_template' and r.deleted_at is null;
  if v_ver is null then
    raise exception 'there is no document template % in this organization', p_template_id
      using errcode = '02000';
  end if;

  update custom.record r
     set data = r.data
                || jsonb_build_object('renders_table_id', p_table_id,
                                      'name', btrim(p_name),
                                      'body', coalesce(p_body, ''),
                                      'template_version', v_ver + 1)
   where r.organization_id = p_organization_id and r.id = p_template_id
  returning r.id into v_id;
  return v_id;
end;
$$;

comment on function custom.doc_template_save(uuid, uuid, text, text, uuid) is
  'REC-68: the one door a document template is written through. A token naming no Field of the Table it renders is refused here, by name. W3-DOC.';

-- THE ACCESS DECISION, IN DATA. `platform.provision_shape_guard` refuses a SECURITY DEFINER
-- function that reaches COMMIT with no declaration, and it is right to: prose in a comment is
-- not a declaration and no test executes it. This door is `server_only` for the same reason
-- every door in schema `custom` is — §6.3 revokes the schema from PUBLIC, anon, authenticated
-- and service_role, `custom` is absent from `pgrst.db_schemas`, and the product switch
-- `custom/system_enabled` resolves false. The client grant is switch-checklist work.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'doc_template_save',
   'p_organization_id uuid, p_table_id uuid, p_name text, p_body text, p_template_id uuid',
   array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'text'::regtype, 'uuid'::regtype]::oid[],
   'REC-68. p_organization_id is the tenant the template belongs to and is the leading column of every row this door reads or writes — the Table lookup, the Field lookup behind custom.doc_unresolved_tokens and the custom.record insert are all keyed on it, so a caller cannot name one organization and reach another''s Fields; null is refused with SQLSTATE 22004. p_table_id must be a Table record OF THAT ORGANIZATION or the door refuses with 23503; null is refused with 22004. p_name is a label, never an identifier; blank is refused with 23514. p_body is the template text and may be empty, which is a template with no tokens. p_template_id is null for a new template and otherwise must be an existing doc_template record of that organization, refused with 02000 when it is not.',
   'migrations/campaign/w3_doc_the_template_is_a_record.sql',
   'server_only: nothing client-side calls this. Schema custom is revoked from PUBLIC, anon, authenticated and service_role, is absent from pgrst.db_schemas, and the product switch custom/system_enabled resolves false. The document-template authoring screen is W6-DOCS''s and calls this door server-side; the client grant is switch-checklist work with its own step, never a lane''s.',
   false, false,
   jsonb_build_object(
     'p_organization_id', 'the tenant; every read and the write are keyed on it. null refused 22004.',
     'p_table_id',        'a Table record of that organization; a token resolves only against ITS fields. null refused 22004, foreign refused 23503.',
     'p_name',            'a label. blank refused 23514.',
     'p_body',            'the template text. empty is legal and means no tokens.',
     'p_template_id',     'null mints a new template; otherwise a doc_template record of that organization, refused 02000 when absent.'))
on conflict do nothing;
