-- RC-A1 (common-docs/projects/rich-content-unification/STORE-DESIGN.md §3.2–§3.5, §5 steps 3–5):
-- window-class: trigger DDL on the new, empty rich-content tables freezes the 23-relation supautils set (auth/storage/realtime) for this short transaction; applied in the 1-4 AM PT window.
-- the BEHAVIOUR of the rich-content store, attached to the empty tables rcstore_b..f built:
--   * the published-version pin (composite FK to an immutable version row);
--   * derived fields computed by the database and refused loudly from clients (§3.3);
--   * content_version moves only on tracked changes; capture writes one immutable
--     content.document_version row per content_version (§3.5); insert-only Univer payloads;
--   * the §3.2 guards (type, class floor + visibility coupling, sealed, Univer body, folder
--     access, publish door, inline data: URIs), RAG ingest on content change only (§3.4);
--   * the write doors the guards name: content.univer_save, version_publish,
--     version_unpublish, version_restore (doors declared before grants);
--   * hard-delete protection and soft-delete edges; the registry flip to the certified custom
--     version store (§5 step 5; _version_capture is never attached).
-- Apply inside the 1–4 AM PT window, after rcstore_f.

set local lock_timeout = '2s';

-- ============================================================================================
-- 4. The published-version pin (§5 step 3): a composite FK to an immutable version row.
--    Its covering index leads with the constraint columns. The tenancy lane: document_version
--    rows are written ONLY by content._capture_version with the document's own
--    organization_id, and the FK itself forces document_version.document_id = document.id,
--    so a pinned version is structurally the same organization as the document. The
--    validation-only trigger below is the platform's declared answer for this nullable FK
--    (platform.assert_same_org on the leading column), not a second authority.
-- ============================================================================================
alter table content.document
  add constraint document_published_fk
  foreign key (id, published_content_version)
  references content.document_version (document_id, content_version)
  deferrable initially deferred;
create index document_published_pin_idx on content.document (id, published_content_version)
  where published_content_version is not null;
create trigger _same_org_published_pin
  before insert or update of published_content_version on content.document
  for each row execute function platform.assert_same_org('id', 'content.document');

-- ============================================================================================
-- 5. Derived fields (§3.3): computed by the database, refused loudly from clients.
-- ============================================================================================
create or replace function content._document_refuse_client_derived()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_col text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    v_col := case
      when new.content_hash is not null then 'content_hash'
      when new.preview <> ''            then 'preview'
      when new.word_count <> 0          then 'word_count'
      when new.char_count <> 0          then 'char_count'
      when new.content_version <> 0     then 'content_version'
      when new.payload_hash is not null then 'payload_hash'
    end;
  else
    v_col := case
      when new.content_hash    is distinct from old.content_hash    then 'content_hash'
      when new.preview         is distinct from old.preview         then 'preview'
      when new.word_count      is distinct from old.word_count      then 'word_count'
      when new.char_count      is distinct from old.char_count      then 'char_count'
      when new.content_version is distinct from old.content_version then 'content_version'
      when new.payload_hash    is distinct from old.payload_hash    then 'payload_hash'
    end;
  end if;
  if v_col is null then
    return new;
  end if;
  raise exception using
    errcode = '42501',
    message = format('content.document.%s is computed by the database; a client may not write it.', v_col),
    hint = case v_col
      when 'content_hash'    then 'content_hash is computed from body; send body only.'
      when 'preview'         then 'preview is computed from body; send body only.'
      when 'word_count'      then 'word_count is computed from body; send body only.'
      when 'char_count'      then 'char_count is computed from body; send body only.'
      when 'content_version' then 'content_version moves by itself when title, body or another tracked field changes; use version (the base column) as your compare-and-swap token.'
      else 'payload_hash is computed from the Univer payload; save Univer documents through content.univer_save.'
    end;
end;
$fn$;

create or replace function content._document_derive()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
begin
  new.content_hash := encode(sha256(convert_to(new.body, 'UTF8')), 'hex');
  new.char_count   := char_length(new.body);
  new.word_count   := coalesce((select count(*)::integer from regexp_matches(new.body, '\S+', 'g')), 0);
  new.preview      := left(btrim(regexp_replace(regexp_replace(left(new.body, 4000), '[#>*_`~|]+', '', 'g'), '\s+', ' ', 'g')), 280);
  return new;
end;
$fn$;

-- content_version: +1 on a tracked change; 1 on insert; otherwise held (a server write cannot
-- move it either). Honours the migration bypass so an import can carry its own numbering.
create or replace function content._document_bump_content_version()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
begin
  if content._capture_bypassed() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.content_version := 1;
    return new;
  end if;
  if (new.title, new.summary, new.body, new.format, new.payload_hash, new.document_type_id,
      new.visibility, new.data_class, new.folder_id, new.archived_at, new.deleted_at, new.sealed_at)
     is distinct from
     (old.title, old.summary, old.body, old.format, old.payload_hash, old.document_type_id,
      old.visibility, old.data_class, old.folder_id, old.archived_at, old.deleted_at, old.sealed_at) then
    new.content_version := old.content_version + 1;
  else
    new.content_version := old.content_version;
  end if;
  return new;
end;
$fn$;

create trigger _a_refuse_client_derived
  before insert or update on content.document
  for each row execute function content._document_refuse_client_derived();
create trigger _b_derive_document
  before insert or update of body, title on content.document
  for each row execute function content._document_derive();
create trigger _c_bump_content_version
  before insert or update on content.document
  for each row execute function content._document_bump_content_version();

-- ============================================================================================
-- 6. The §3.2 guards. Every refusal names its remedy.
-- ============================================================================================
create or replace function content._document_guard_type()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_slug  text;
  v_group boolean;
begin
  if tg_op = 'UPDATE' and new.document_type_id is not distinct from old.document_type_id then
    return new;
  end if;
  select c.slug, coalesce((c.metadata ->> 'group')::boolean, false)
    into v_slug, v_group
    from platform.categories c
   where c.id = new.document_type_id
     and c.dimension = 'document_type'
     and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and c.deleted_at is null;
  if v_slug is null then
    raise exception using
      errcode = '23514',
      message = format('document_type_id %s is not a live document type.', new.document_type_id),
      hint = 'Pick a type from platform.categories where dimension = ''document_type'' in the system organization (note, study_guide, blog, skill, …).';
  end if;
  if v_group then
    raise exception using
      errcode = '23514',
      message = format('"%s" groups document types in pickers; it is not itself a type a document can carry.', v_slug),
      hint = 'Pick one of its member types (for example blog or show_notes under article).';
  end if;
  if tg_op = 'UPDATE' and (
       exists (select 1 from skill.skill_detail d where d.document_id = new.id)
    or exists (select 1 from agent.message_template_detail d where d.document_id = new.id)
    or exists (select 1 from content.univer_payload d where d.document_id = new.id)) then
    raise exception using
      errcode = '23514',
      message = 'This document carries type-specific fields, so its type cannot change.',
      hint = 'Duplicate it as the new type instead; its Detail row belongs to the old type.';
  end if;
  return new;
end;
$fn$;

-- The class floor: the STRICTER of the platform value and the organization's resolved value
-- (so an organization override can only raise it). Governance changes are owner/admin only.
create or replace function content._document_guard_data_class()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_slug     text;
  v_platform platform.data_class;
  v_resolved platform.data_class;
  v_floor    platform.data_class;
begin
  if content._capture_bypassed() then
    return new;
  end if;
  select c.slug into v_slug from platform.categories c where c.id = new.document_type_id;
  if v_slug is null then
    return new;   -- the type guard refuses this row with its own sentence
  end if;
  select (k.value #>> '{}')::platform.data_class into v_platform
    from platform.feature_knob k
   where k.feature = 'content.document' and k.key = 'data_class.' || v_slug;
  if v_platform is null then
    raise exception using
      errcode = '55000',
      message = format('Document type %s has no class floor (knob content.document / data_class.%s is not seeded).', v_slug, v_slug),
      hint = 'Seed the knob in platform.feature_knob; a missing floor is never defaulted.';
  end if;
  v_resolved := (platform.knob_resolve('content.document', 'data_class.' || v_slug, new.organization_id, auth.uid()) #>> '{}')::platform.data_class;
  v_floor := least(v_platform, coalesce(v_resolved, v_platform));   -- enum order: private < confidential < organization < public

  if tg_op = 'INSERT' and new.data_class is null then
    new.data_class := v_floor;
  end if;
  if new.data_class > v_floor then
    raise exception using
      errcode = '42501',
      message = format('A %s may not be classed %s: its floor is %s.', v_slug, new.data_class, v_floor),
      hint = format('Use %s or stricter.', v_floor);
  end if;
  if tg_op = 'UPDATE' and new.data_class is distinct from old.data_class
     and auth.uid() is not null
     and old.created_by is distinct from auth.uid()
     and not iam.has_access('document', new.id, 'admin') then
    raise exception using
      errcode = '42501',
      message = 'Only the owner of a document (or an admin on it) can change its data class.',
      hint = 'Ask the owner to change it.';
  end if;
  if new.data_class = 'private' and new.visibility <> 'personal' then
    raise exception using
      errcode = '23514',
      message = format('A private-class %s can only be personal (visibility is %s).', v_slug, new.visibility),
      hint = 'Send visibility = ''personal'', or lower the class (not below its floor) before sharing.';
  end if;
  if new.visibility = 'public' and new.data_class not in ('organization', 'public') then
    raise exception using
      errcode = '23514',
      message = format('A %s-class document cannot be public.', new.data_class),
      hint = 'Lower the class to organization (if its floor allows) before making it public.';
  end if;
  return new;
end;
$fn$;

create or replace function content._document_guard_sealed()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
begin
  if old.sealed_at is null or content._capture_bypassed() then
    return new;
  end if;
  if new.sealed_at is distinct from old.sealed_at
     or (new.title, new.body, new.format, new.payload_hash, new.document_type_id)
        is distinct from (old.title, old.body, old.format, old.payload_hash, old.document_type_id) then
    raise exception using
      errcode = '42501',
      message = 'This document is sealed: its title, body, format and type can no longer change.',
      hint = 'Duplicate it to edit a copy.';
  end if;
  return new;
end;
$fn$;

create or replace function content._document_guard_univer()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
begin
  if content._capture_bypassed()
     or coalesce(current_setting('content.univer_save_doc', true), '') = new.id::text then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.format = 'univer' and (new.body <> '' or new.payload_hash is not null) then
      raise exception using
        errcode = '42501',
        message = 'A Univer document starts empty; its content arrives through content.univer_save.',
        hint = 'Insert it with format = ''univer'' and no body, then call content.univer_save(document_id, expected_version, snapshot, projection).';
    end if;
    return new;
  end if;
  if (new.format = 'univer' or old.format = 'univer')
     and (new.format is distinct from old.format
          or new.body is distinct from old.body
          or new.payload_hash is distinct from old.payload_hash) then
    raise exception using
      errcode = '42501',
      message = 'A Univer document''s body, payload and format change only through content.univer_save.',
      hint = 'Call content.univer_save(document_id, expected_version, snapshot, projection).';
  end if;
  return new;
end;
$fn$;

create or replace function content._document_guard_folder()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
begin
  if new.folder_id is null
     or (tg_op = 'UPDATE' and new.folder_id is not distinct from old.folder_id)
     or auth.uid() is null then
    return new;
  end if;
  if not iam.has_access('folder', new.folder_id, 'editor') then
    raise exception using
      errcode = '42501',
      message = 'You can only file a document in a folder you can edit.',
      hint = 'Pick a folder you own or hold editor on, or leave folder_id empty.';
  end if;
  return new;
end;
$fn$;

create or replace function content._document_guard_publish()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
begin
  if content._capture_bypassed()
     or coalesce(current_setting('content.publish_doc', true), '') = new.id::text then
    return new;
  end if;
  if (tg_op = 'INSERT' and (new.published_content_version is not null or new.published_at is not null))
     or (tg_op = 'UPDATE' and (new.published_content_version, new.published_at)
                              is distinct from (old.published_content_version, old.published_at)) then
    raise exception using
      errcode = '42501',
      message = 'The published version of a document changes only through its publish door.',
      hint = 'Call content.version_publish(document_id, content_version) or content.version_unpublish(document_id).';
  end if;
  return new;
end;
$fn$;

create or replace function content._document_refuse_inline_data_uri()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_max integer;
  v_len integer;
begin
  if strpos(new.body, 'data:') = 0 then
    return new;
  end if;
  select max(length(m[1])) into v_len
    from regexp_matches(new.body, 'data:[A-Za-z0-9.+/-]*;base64,([A-Za-z0-9+/=]+)', 'g') m;
  if v_len is null then
    return new;
  end if;
  v_max := (platform.knob_resolve('content.document', 'max_inline_data_uri_bytes', new.organization_id, auth.uid()) #>> '{}')::integer;
  if (v_len / 4) * 3 > v_max then
    raise exception using
      errcode = '23514',
      message = format('This document embeds a %s-byte inline data: URI; the limit is %s bytes.', (v_len / 4) * 3, v_max),
      hint = 'Upload the image as a file and attach it to the document (a document -> file attachment edge); reference it by file, never as an inline data: URI.';
  end if;
  return new;
end;
$fn$;

create trigger _d1_guard_document_type
  before insert or update of document_type_id on content.document
  for each row execute function content._document_guard_type();
create trigger _d2_guard_data_class
  before insert or update of data_class, document_type_id, visibility on content.document
  for each row execute function content._document_guard_data_class();
create trigger _d3_guard_sealed
  before update on content.document
  for each row execute function content._document_guard_sealed();
create trigger _d4_guard_univer
  before insert or update of format, body, payload_hash on content.document
  for each row execute function content._document_guard_univer();
create trigger _d5_guard_folder_access
  before insert or update of folder_id on content.document
  for each row execute function content._document_guard_folder();
create trigger _d6_guard_publish
  before insert or update of published_content_version, published_at on content.document
  for each row execute function content._document_guard_publish();
create trigger _d7_refuse_inline_data_uri
  before insert or update of body on content.document
  for each row execute function content._document_refuse_inline_data_uri();

-- ============================================================================================
-- 7. The version store (§3.5): capture, immutability, insert-only payloads.
-- ============================================================================================
create or replace function content._capture_version()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_kind    text;
  v_slug    text;
  v_body_cv integer;
begin
  -- Writes content.document_version: the ONE certified custom version store of `document`.
  if content._capture_bypassed() then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.content_version = old.content_version then
    return null;
  end if;

  if tg_op = 'INSERT'
     or (new.title, new.summary, new.body, new.format, new.payload_hash)
        is distinct from (old.title, old.summary, old.body, old.format, old.payload_hash) then
    v_kind := 'content';
  elsif (new.visibility, new.data_class, new.document_type_id)
        is distinct from (old.visibility, old.data_class, old.document_type_id) then
    v_kind := 'governance';
  else
    v_kind := 'lifecycle';
  end if;

  if v_kind = 'content' then
    select c.slug into v_slug from platform.categories c where c.id = new.document_type_id;
    if not coalesce((platform.knob_resolve('content.document', 'capture.' || v_slug, new.organization_id, auth.uid()) #>> '{}')::boolean, true) then
      return null;   -- capture off for this type: lifecycle and governance versions only
    end if;
    v_body_cv := new.content_version;
  else
    select v.body_content_version into v_body_cv
      from content.document_version v
     where v.document_id = new.id
     order by v.content_version desc
     limit 1;
    v_body_cv := coalesce(v_body_cv, new.content_version);
  end if;

  insert into content.document_version (
    organization_id, created_by, document_id, content_version, change_kind,
    title, summary, format, body, body_content_version, content_hash, payload_hash,
    document_type_id, visibility_at_capture, data_class_at_capture, folder_id_at_capture,
    archived_at_capture, deleted_at_capture, sealed_at_capture,
    origin, actor_id, actor_tier, device_id, conversation_id, custom_fields)
  values (
    new.organization_id, new.updated_by, new.id, new.content_version, v_kind,
    new.title, new.summary, new.format, case when v_kind = 'content' then new.body end, v_body_cv,
    new.content_hash, new.payload_hash,
    new.document_type_id, new.visibility, new.data_class, new.folder_id,
    new.archived_at, new.deleted_at, new.sealed_at,
    new.last_origin, auth.uid(), coalesce(platform.declared_actor_tier(), platform.actor_tier()),
    new.last_device_id, new.last_conversation_id, new.custom_fields);
  return null;
end;
$fn$;

create trigger _capture_version
  after insert or update on content.document
  for each row execute function content._capture_version();

create or replace function content._document_version_immutable()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
begin
  if content._capture_bypassed() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then
      raise exception using
        errcode = '42501',
        message = 'Versions are written by the database when a document changes; they cannot be inserted directly.',
        hint = 'Edit content.document; to go back to an old version call content.version_restore(document_id, content_version, expected_version).';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if current_user in ('authenticated', 'anon') then
      raise exception using
        errcode = '42501',
        message = 'A version is a permanent record; it cannot be deleted by hand.',
        hint = 'Autosave versions are thinned by the platform; to discard a document, move it to the trash.';
    end if;
    return old;
  end if;
  if (new.organization_id, new.created_by, new.created_at, new.document_id, new.content_version,
      new.change_kind, new.title, new.summary, new.format, new.body, new.body_content_version,
      new.content_hash, new.payload_hash, new.document_type_id, new.visibility_at_capture,
      new.data_class_at_capture, new.folder_id_at_capture, new.archived_at_capture,
      new.deleted_at_capture, new.sealed_at_capture, new.origin, new.actor_id, new.actor_tier,
      new.device_id, new.conversation_id, new.source_ref, new.custom_fields)
     is distinct from
     (old.organization_id, old.created_by, old.created_at, old.document_id, old.content_version,
      old.change_kind, old.title, old.summary, old.format, old.body, old.body_content_version,
      old.content_hash, old.payload_hash, old.document_type_id, old.visibility_at_capture,
      old.data_class_at_capture, old.folder_id_at_capture, old.archived_at_capture,
      old.deleted_at_capture, old.sealed_at_capture, old.origin, old.actor_id, old.actor_tier,
      old.device_id, old.conversation_id, old.source_ref, old.custom_fields) then
    raise exception using
      errcode = '42501',
      message = 'A version is a record of what the document said; only its label and note can change.',
      hint = 'Edit the document itself to change its content; set label or note on this version.';
  end if;
  return new;
end;
$fn$;

create trigger _a_version_immutable
  before insert or update or delete on content.document_version
  for each row execute function content._document_version_immutable();

create or replace function content._univer_payload_insert_only()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
begin
  if content._capture_bypassed() then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' then
    raise exception using
      errcode = '42501',
      message = 'A Univer payload is never overwritten; every save mints a new content version.',
      hint = 'Save through content.univer_save(document_id, expected_version, snapshot, projection).';
  end if;
  if current_user in ('authenticated', 'anon') then
    raise exception using
      errcode = '42501',
      message = 'Univer payloads are written only by content.univer_save.',
      hint = 'Call content.univer_save(document_id, expected_version, snapshot, projection).';
  end if;
  return coalesce(new, old);
end;
$fn$;

create trigger _a_univer_payload_insert_only
  before insert or update or delete on content.univer_payload
  for each row execute function content._univer_payload_insert_only();

-- ============================================================================================
-- 8. RAG ingest (§3.4): only when title, body or payload change on a live row whose type has
--    auto_ingest on. Same channel as notes' trg_auto_ingest_note, source_kind 'document'.
-- ============================================================================================
create or replace function content._document_notify_auto_ingest()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_slug text;
begin
  if content._capture_bypassed() or new.deleted_at is not null then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and (new.title, new.body, new.payload_hash) is not distinct from (old.title, old.body, old.payload_hash) then
    return null;
  end if;
  select c.slug into v_slug from platform.categories c where c.id = new.document_type_id;
  if not coalesce((platform.knob_resolve('content.document', 'auto_ingest.' || v_slug, new.organization_id, auth.uid()) #>> '{}')::boolean, false) then
    return null;
  end if;
  perform pg_notify('auto_ingest', json_build_object(
    'source_kind',     'document',
    'source_id',       new.id::text,
    'document_type',   v_slug,
    'created_by',      new.created_by::text,
    'organization_id', new.organization_id::text)::text);
  return null;
end;
$fn$;

create trigger _notify_auto_ingest
  after insert or update of title, body, payload_hash on content.document
  for each row execute function content._document_notify_auto_ingest();

-- ============================================================================================
-- 9. Write doors the guards name (§3.5): univer_save, version_publish / unpublish,
--    version_restore. Each decides access itself (editor on the document for a signed-in
--    caller; a server caller — service_role or the direct connection — is trusted) and carries
--    the compare-and-swap precondition on the base `version` where it writes content.
-- ============================================================================================
create or replace function content.univer_save(
  p_document_id uuid,
  p_expected_version integer,
  p_snapshot jsonb,
  p_projection text,
  p_origin text default 'manual')
returns content.document
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_doc  content.document;
  v_row  content.document;
  v_hash text;
begin
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon')
     and not iam.has_access('document', p_document_id, 'editor') then
    raise exception using errcode = '42501',
      message = 'You cannot edit this document, or it does not exist.',
      hint = 'Ask its owner for editor access.';
  end if;
  select * into v_doc from content.document d where d.id = p_document_id and d.deleted_at is null for update;
  if not found then
    raise exception using errcode = '42501',
      message = 'You cannot edit this document, or it does not exist.',
      hint = 'Ask its owner for editor access.';
  end if;
  if v_doc.format <> 'univer' then
    raise exception using errcode = '22023',
      message = format('content.univer_save saves Univer documents only; this one is %s.', v_doc.format),
      hint = 'Update content.document.body with guardedUpdate on version.';
  end if;
  if p_expected_version is null or v_doc.version <> p_expected_version then
    raise exception using errcode = '40001',
      message = format('This document changed since you loaded it (you had version %s; it is now %s).', p_expected_version, v_doc.version),
      hint = 'Reload it, re-apply your edit, and save again.';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception using errcode = '22023',
      message = 'The snapshot must be a Univer document object.',
      hint = 'Send the IDocumentData object the Univer editor produced.';
  end if;
  if coalesce(p_origin, '') not in ('manual', 'autosave', 'agent', 'import', 'sync', 'restore', 'system') then
    raise exception using errcode = '22023',
      message = format('Unknown save origin %s.', coalesce(p_origin, 'NULL')),
      hint = 'Use manual, autosave, agent, import, sync, restore or system.';
  end if;

  v_hash := encode(sha256(convert_to(p_snapshot::text, 'UTF8')), 'hex');
  if v_hash = v_doc.payload_hash and coalesce(p_projection, '') = v_doc.body then
    return v_doc;   -- nothing changed; no version, no payload
  end if;

  perform set_config('content.univer_save_doc', p_document_id::text, true);
  update content.document d
     set body = coalesce(p_projection, ''),
         payload_hash = v_hash,
         last_origin = p_origin
   where d.id = p_document_id
  returning * into v_row;
  perform set_config('content.univer_save_doc', '', true);

  if v_row.content_version <> v_doc.content_version then
    insert into content.univer_payload (organization_id, created_by, document_id, content_version, snapshot)
    values (v_row.organization_id, v_row.updated_by, v_row.id, v_row.content_version, p_snapshot);
  end if;
  return v_row;
end;
$fn$;

create or replace function content.version_publish(p_document_id uuid, p_content_version integer default null)
returns content.document
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_doc content.document;
  v_row content.document;
  v_cv  integer;
begin
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon')
     and not iam.has_access('document', p_document_id, 'editor') then
    raise exception using errcode = '42501',
      message = 'You cannot publish this document, or it does not exist.',
      hint = 'Ask its owner for editor access.';
  end if;
  select * into v_doc from content.document d where d.id = p_document_id and d.deleted_at is null for update;
  if not found then
    raise exception using errcode = '42501',
      message = 'You cannot publish this document, or it does not exist.',
      hint = 'Ask its owner for editor access.';
  end if;
  v_cv := coalesce(p_content_version, v_doc.content_version);
  if not exists (select 1 from content.document_version v
                  where v.document_id = p_document_id and v.content_version = v_cv
                    and v.change_kind = 'content') then
    raise exception using errcode = '22023',
      message = format('Version %s of this document does not exist or holds no content.', v_cv),
      hint = 'Publish a version listed in content.document_version with change_kind = content.';
  end if;
  perform set_config('content.publish_doc', p_document_id::text, true);
  update content.document d
     set published_content_version = v_cv, published_at = now()
   where d.id = p_document_id
  returning * into v_row;
  perform set_config('content.publish_doc', '', true);
  return v_row;
end;
$fn$;

create or replace function content.version_unpublish(p_document_id uuid)
returns content.document
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_row content.document;
begin
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon')
     and not iam.has_access('document', p_document_id, 'editor') then
    raise exception using errcode = '42501',
      message = 'You cannot unpublish this document, or it does not exist.',
      hint = 'Ask its owner for editor access.';
  end if;
  perform set_config('content.publish_doc', p_document_id::text, true);
  update content.document d
     set published_content_version = null, published_at = null
   where d.id = p_document_id
  returning * into v_row;
  perform set_config('content.publish_doc', '', true);
  if v_row.id is null then
    raise exception using errcode = '42501',
      message = 'You cannot unpublish this document, or it does not exist.',
      hint = 'Ask its owner for editor access.';
  end if;
  return v_row;
end;
$fn$;

create or replace function content.version_restore(p_document_id uuid, p_content_version integer, p_expected_version integer)
returns content.document
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_doc      content.document;
  v_ver      content.document_version;
  v_body     text;
  v_snapshot jsonb;
  v_row      content.document;
begin
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon')
     and not iam.has_access('document', p_document_id, 'editor') then
    raise exception using errcode = '42501',
      message = 'You cannot edit this document, or it does not exist.',
      hint = 'Ask its owner for editor access.';
  end if;
  select * into v_doc from content.document d where d.id = p_document_id and d.deleted_at is null for update;
  if not found then
    raise exception using errcode = '42501',
      message = 'You cannot edit this document, or it does not exist.',
      hint = 'Ask its owner for editor access.';
  end if;
  if p_expected_version is null or v_doc.version <> p_expected_version then
    raise exception using errcode = '40001',
      message = format('This document changed since you loaded it (you had version %s; it is now %s).', p_expected_version, v_doc.version),
      hint = 'Reload it and choose the version to restore again.';
  end if;
  select * into v_ver from content.document_version v
   where v.document_id = p_document_id and v.content_version = p_content_version;
  if not found then
    raise exception using errcode = '22023',
      message = format('Version %s of this document does not exist.', p_content_version),
      hint = 'Pick a version listed in content.document_version for this document.';
  end if;
  select v.body into v_body from content.document_version v
   where v.document_id = p_document_id and v.content_version = v_ver.body_content_version
     and v.change_kind = 'content';
  if v_body is null then
    raise exception using errcode = '22023',
      message = format('Version %s holds no body to restore.', p_content_version),
      hint = 'Pick a version whose change_kind is content.';
  end if;

  if v_doc.format = 'univer' or v_ver.format = 'univer' then
    select u.snapshot into v_snapshot from content.univer_payload u
     where u.document_id = p_document_id and u.content_version = v_ver.body_content_version;
    if v_snapshot is null then
      raise exception using errcode = '22023',
        message = format('Version %s has no Univer payload to restore.', p_content_version),
        hint = 'Pick a Univer version saved through content.univer_save.';
    end if;
    perform set_config('content.univer_save_doc', p_document_id::text, true);
  end if;

  update content.document d
     set title = v_ver.title,
         summary = v_ver.summary,
         format = v_ver.format,
         body = v_body,
         payload_hash = case when v_ver.format = 'univer' then v_ver.payload_hash end,
         last_origin = 'restore'
   where d.id = p_document_id
  returning * into v_row;
  perform set_config('content.univer_save_doc', '', true);

  if v_snapshot is not null and v_row.content_version <> v_doc.content_version then
    insert into content.univer_payload (organization_id, created_by, document_id, content_version, snapshot)
    values (v_row.organization_id, v_row.updated_by, v_row.id, v_row.content_version, v_snapshot);
  end if;
  return v_row;
end;
$fn$;

-- Doors BEFORE grants (platform.client_callable_door; DD-223 requires the function first).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers)
select 'content', p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       case p.proname
         when 'univer_save' then
           'p_document_id: checked with iam.has_access(''document'', p_document_id, ''editor'') for a signed-in caller; a missing or unreachable document is refused 42501 with one sentence (no existence oracle); NULL finds nothing and is refused the same way. p_expected_version: compare-and-swap on the base version (40001 on mismatch). The body writes body, payload_hash and one insert-only content.univer_payload row per new content version.'
         when 'version_publish' then
           'p_document_id: checked with iam.has_access(''document'', p_document_id, ''editor'') for a signed-in caller; missing or unreachable is refused 42501 (NULL likewise). p_content_version: must be an existing content-kind version of that same document (22023 otherwise); NULL publishes the current content version.'
         when 'version_unpublish' then
           'p_document_id: checked with iam.has_access(''document'', p_document_id, ''editor'') for a signed-in caller; missing or unreachable is refused 42501 (NULL likewise). Clears published_content_version and published_at.'
         when 'version_restore' then
           'p_document_id: checked with iam.has_access(''document'', p_document_id, ''editor'') for a signed-in caller; missing or unreachable is refused 42501 (NULL likewise). p_content_version: must be a version of that same document holding a body (22023 otherwise). p_expected_version: compare-and-swap on the base version (40001 on mismatch). Writes back through the document so the restore is itself a new content version with origin restore.'
       end,
       'rcstore_b_document', true, false
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'content'
   and p.proname in ('univer_save', 'version_publish', 'version_unpublish', 'version_restore')
   and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'content' and d.function_name = p.proname
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function content.univer_save(uuid, integer, jsonb, text, text) to authenticated, service_role;
grant execute on function content.version_publish(uuid, integer) to authenticated, service_role;
grant execute on function content.version_unpublish(uuid) to authenticated, service_role;
grant execute on function content.version_restore(uuid, integer, integer) to authenticated, service_role;
grant execute on function content.document_search_vector(text, text, text) to authenticated, service_role;

-- ============================================================================================
-- 10. Lifecycle wiring: hard deletes refused from clients; soft-delete edges declared.
-- ============================================================================================
select platform.protect_from_client_hard_delete('content', 'document', 'document', 'document');
select platform.protect_from_client_hard_delete('skill', 'skill_detail', 'skill', 'skill_detail');
select platform.protect_from_client_hard_delete('agent', 'message_template_detail', 'message template', 'message_template_detail');

select platform.declare_soft_delete_edge('content', 'document', 'content', 'document_version', 'document_id', 'keep',
  'A version is the permanent history of its document: trashing the document keeps every version so restoring it restores its history.',
  'rcstore_b_document', 'document');
select platform.declare_soft_delete_edge('content', 'document', 'content', 'univer_payload', 'document_id', 'keep',
  'A Univer payload is the truth of one content version; it lives exactly as long as that version does.',
  'rcstore_b_document', 'document');
select platform.declare_soft_delete_edge('content', 'document', 'skill', 'skill_detail', 'document_id', 'cascade',
  'A skill''s structured fields have no meaning without the skill document; trashing the document trashes them and restoring it restores them.',
  'rcstore_b_document', 'document');
select platform.declare_soft_delete_edge('content', 'document', 'agent', 'message_template_detail', 'document_id', 'cascade',
  'A message template''s structured fields have no meaning without the template document; trashing the document trashes them and restoring it restores them.',
  'rcstore_b_document', 'document');

-- ============================================================================================
-- 11. The registry flip (§5 step 5): `document` is versioned by its certified custom store.
--     _version_capture is never attached (an entity has exactly one versioning system).
-- ============================================================================================
update platform.entity_types
   set is_versioned = true,
       version_store = 'custom',
       version_store_ref = 'content.document_version'::regclass,
       default_auto_ingest = false,
       custom_fields_enabled = true,
       client_anonymous_public_read = false
 where token = 'document';

do $$
begin
  if exists (select 1 from pg_trigger t
              where t.tgrelid = 'content.document'::regclass and not t.tgisinternal
                and t.tgfoid = 'platform._version_capture'::regproc) then
    raise exception 'content.document carries _version_capture beside its custom store';
  end if;
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'content.document'::regclass and a.attname = 'custom_fields' and not a.attisdropped) then
    raise exception 'content.document did not receive custom_fields';
  end if;
end $$;

