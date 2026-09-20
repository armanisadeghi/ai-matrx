-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- LANE DOORS-TWO — THE ACTS A PERSON PERFORMS ON A DOCUMENT, AND THE ONE CATALOGUE
-- A NOTIFICATION EDITOR ASKS FOR.
--
-- MEASURED on the main database 2026-09-20, before this file:
--
--   · `custom.doc_template_read`, `custom.doc_template_save`, `custom.doc_render_document`,
--     `custom.doc_render_read`, `custom.doc_sign` and `custom.doc_signature_read` are all
--     client-callable. Every SINGULAR act of product #5 works.
--   · Not one PLURAL act does. `custom.doc_template` (a view), `custom.doc_render` and
--     `custom.doc_signature` (tables) hold NO client SELECT, and `@ai-matrx/records`
--     reached all three with a direct PostgREST `.from()`. So a person could save a
--     template they could never list, render a document they could never find again, and
--     sign something whose seal they could never see. The whole of product #5 opened on
--     *"permission denied for view doc_template"*, which is the sentence lane TEST-BENCH
--     photographed on the try-everything page.
--   · There was also no way to DELETE a template through any door.
--   · `custom.agg_subscription_cadences()` — the list of cadences the digest runner
--     actually understands — holds no client grant, so `NotifyRuleEditor` asked for it,
--     was refused, and fell back to a cadence list typed into the screen. A picker that
--     silently drifts from what the runner honours is worse than no picker.
--
-- THIS FILE ADDS THE FIVE MISSING ACTS AND NOTHING ELSE. A LIST IS A DOOR, NEVER A GRANT
-- ON THE THING BEHIND IT: opening the view or the two tables to `authenticated` would have
-- been one line and would have handed the browser every organization's rows to filter
-- itself. Each door below narrows in SQL, as the definer, after the ladder has spoken.
--
--   custom.doc_templates(org, table_id)      — what can I render this table's records as?
--                                              VIEWER on the Table.
--   custom.doc_template_delete(org, template) — EDITOR on the Table it renders, because a
--                                              template is the Table's wording.
--   custom.doc_renders(org, record_id)       — the documents already made from this record.
--                                              VIEWER on the RECORD: a document is what the
--                                              record says, so seeing the record is the
--                                              right to see what it was written into.
--   custom.doc_signatures(org, record_id)    — the seals over those documents. VIEWER on
--                                              the record, same reason.
--   custom.subscription_cadences(org)        — the cadences the digest runner understands,
--                                              delegated to custom.agg_subscription_cadences()
--                                              so there is ONE list and a screen can never
--                                              offer a cadence nothing honours.
--
-- THE LADDER, EXACTLY, in every one of them: `custom.assert_client_may_reach` for the
-- organization wall first; then `custom.assert_client_may_open` / `..._may_change` on the
-- SUBJECT at the level named above; then, for the one that writes,
-- `custom.assert_store_door`, which resolves this file's guard (custom/system_enabled)
-- through `platform.knob_resolve` and judges `custom.caller_role()`. The reads are STABLE
-- and take no store-door call, exactly as `custom.doc_template_read` does not.
--
-- REFUSALS ARE SENTENCES. A template that is not in this organization reads as absent and
-- says so with the id; a delete of somebody else's wording says whose authority it takes.
--
-- NOTHING IS REVOKED, NOTHING IS REPLACED, NO EXISTING BODY IS TOUCHED — every object
-- below is NEW, so no `-- based-on:` line is owed. The GRANTs these doors need are a
-- deliberate act of their own and live in
-- `migrations/campaign/doorstwo_the_document_doors_can_be_reached.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── what can I render this table's records as ────────────────────────────────
create function custom.doc_templates(p_organization_id uuid, p_table_id uuid)
returns table(template_id uuid, renders_table_id uuid, name text, body text,
              template_version integer, token_count bigint, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_templates');
  -- A Table IS a record in this store, which is why the subject word is 'record'.
  perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.doc_templates',
                                        'viewer'::public.permission_level, 'record');
  return query
    select t.id, t.renders_table_id, t.name, t.body, t.template_version,
           t.token_count, t.updated_at
      from custom.doc_template t
     where t.organization_id = p_organization_id
       and t.renders_table_id = p_table_id
     order by t.name;
end;
$fn$;

comment on function custom.doc_templates(uuid, uuid) is
  'REC-68: the document templates that render ONE Table''s records, for a person who may already open that Table. The list door that `custom.doc_template_read` is the singular of; it exists so no browser ever needs SELECT on the custom.doc_template view.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'doc_templates',
        'p_organization_id uuid, p_table_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. p_table_id is then checked by custom.assert_client_may_open at viewer, so a table this caller may not open is refused by name before any row is read, and a table id belonging to another organization fails that same check. The rows are filtered by organization_id AND renders_table_id inside the definer, so no row of another tenant can be returned. It returns template wording only - no record data and no rendered document.',
        'doorstwo_the_document_and_cadence_doors.sql',
        null, true, false)
on conflict do nothing;

-- ── stop offering this wording ───────────────────────────────────────────────
create function custom.doc_template_delete(p_organization_id uuid, p_template_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_table uuid;
  v_name  text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_template_delete');

  select (r.data ->> 'renders_table_id')::uuid, r.data ->> 'name'
    into v_table, v_name
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_template_id
     and r.data_class = 'doc_template'
     and r.deleted_at is null;
  if v_table is null then
    raise exception 'There is no document template % in this organization.', p_template_id
      using errcode = '02000',
            hint = 'It may already have been removed, or it may belong to another organization - organizations are hard walls (REC-29).';
  end if;

  -- A TEMPLATE IS THE TABLE''S WORDING, so removing it is an edit of the Table, not of a
  -- record. Whoever may add a column may retire a proposal template; whoever may not, may
  -- not - and is told by name which authority it takes.
  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.doc_template_delete',
                                          'editor'::public.permission_level, 'table');
  perform custom.assert_store_door(p_organization_id, 'custom.doc_template_delete');

  -- Soft, like every other record. VAL-10: documents ALREADY rendered from it keep their
  -- body, their hash and their seal - a template going away can never invalidate a
  -- signature over bytes that were frozen at render time.
  update custom.record r
     set deleted_at = now(), updated_at = now(), version = r.version + 1
   where r.organization_id = p_organization_id and r.id = p_template_id;
  return true;
end;
$fn$;

comment on function custom.doc_template_delete(uuid, uuid) is
  'REC-68: retire one document template. It takes editor on the Table the template renders, because a template is that Table''s wording. Soft delete only: documents already rendered keep their frozen bytes and their seals (VAL-10), so retiring a template can never invalidate a signature.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'doc_template_delete',
        'p_organization_id uuid, p_template_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. p_template_id is resolved together with the organization and with data_class = ''doc_template'', so another tenant''s template reads as absent and is refused by name. The Table it renders is then checked by custom.assert_client_may_change at editor, and custom.assert_store_door resolves the custom/system_enabled guard. It soft-deletes ONE record of data_class doc_template and touches no rendered document and no seal.',
        'doorstwo_the_document_and_cadence_doors.sql',
        null, true, false)
on conflict do nothing;

-- ── the documents already made from this record ──────────────────────────────
create function custom.doc_renders(p_organization_id uuid, p_record_id uuid)
returns table(render_id uuid, template_id uuid, record_id uuid, table_id uuid,
              template_version integer, body text, content_hash text,
              rendered_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_renders');
  -- A DOCUMENT IS WHAT THE RECORD SAYS. Whoever may read the record may read what it was
  -- written into; there is no second, weaker secret in the rendered copy.
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.doc_renders',
                                        'viewer'::public.permission_level, 'record');
  return query
    select d.id, d.template_id, d.record_id, d.table_id, d.template_version,
           d.body, d.content_hash, d.rendered_at
      from custom.doc_render d
     where d.organization_id = p_organization_id
       and d.record_id = p_record_id
       and d.deleted_at is null
     order by d.rendered_at desc;
end;
$fn$;

comment on function custom.doc_renders(uuid, uuid) is
  'REC-68 / VAL-10: every document already rendered from ONE record, newest first, for a person who may open that record. The frozen bytes and their SHA-256 are returned as stored - a render is never edited, so this is the same document a seal was made over.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'doc_renders',
        'p_organization_id uuid, p_record_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. p_record_id is then checked by custom.assert_client_may_open at viewer, so a record this caller may not open is refused by name before any row is read, and a record of another organization fails that same check. Rows are filtered by organization_id AND record_id AND deleted_at is null inside the definer. It returns the rendered body of documents made from a record the caller may already read; it reveals nothing the record does not.',
        'doorstwo_the_document_and_cadence_doors.sql',
        null, true, false)
on conflict do nothing;

-- ── the seals over those documents ───────────────────────────────────────────
create function custom.doc_signatures(p_organization_id uuid, p_record_id uuid)
returns table(signature_id uuid, render_id uuid, record_id uuid, field_key text,
              signer_name text, signer_user_id uuid, signed_at timestamptz,
              document_hash text, document_version integer)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_signatures');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.doc_signatures',
                                        'viewer'::public.permission_level, 'record');
  return query
    select s.id, s.render_id, s.record_id, s.field_key, s.signer_name, s.signer_user_id,
           s.signed_at, s.document_hash, s.document_version
      from custom.doc_signature s
     where s.organization_id = p_organization_id
       and s.record_id = p_record_id
       and s.deleted_at is null
     order by s.signed_at desc;
end;
$fn$;

comment on function custom.doc_signatures(uuid, uuid) is
  'VAL-10: the seals over documents rendered from ONE record - signer, time, document hash and document version - for a person who may open that record. Whether a seal still HOLDS is custom.doc_signature_intact''s answer, never a screen''s.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'doc_signatures',
        'p_organization_id uuid, p_record_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. p_record_id is then checked by custom.assert_client_may_open at viewer, so a record this caller may not open is refused by name and another organization''s record fails that same check. Rows are filtered by organization_id AND record_id AND deleted_at is null inside the definer. It returns the seal''s metadata only - signer name, time, hash and version - and no document body and no key material.',
        'doorstwo_the_document_and_cadence_doors.sql',
        null, true, false)
on conflict do nothing;

-- ── the cadences the digest runner actually understands ──────────────────────
create function custom.subscription_cadences(p_organization_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.subscription_cadences');
  -- ONE LIST. This delegates rather than repeating the array, so a cadence added to the
  -- digest runner appears in every picker on the next call and a picker can never offer a
  -- cadence nothing honours.
  return custom.agg_subscription_cadences();
end;
$fn$;

comment on function custom.subscription_cadences(uuid) is
  'DOOR-18: the cadences a subscription may be written with, delegated to custom.agg_subscription_cadences() so the screen''s picker and the digest runner read ONE list. A client door only, because the notifier''s own reader is server-only by design.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'subscription_cadences',
        'p_organization_id uuid',
        array['uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. It then returns a constant catalogue of cadence words from custom.agg_subscription_cadences(), which is IMMUTABLE and reads no table. No organization data, no record and no subscription is reachable through it.',
        'doorstwo_the_document_and_cadence_doors.sql',
        null, true, false)
on conflict do nothing;
