-- chair-step: RC-A1 inverse of rcstore_l — removes the doors (type_settings, document_get, find_document, local_sync_changes, version_list/get/diff, search_documents, read_published, read_published_by_slug, thin_autosave_versions) and their doors and grants, the per-type and global knobs rcstore_l seeded, the text_anchor_set and render_binding payload kinds, restores text_anchor to its v1 schema, the visibility column default and the guard body without default visibility.
-- based-on: content._document_guard_data_class() 55f97dd783db647942af17d6a6fd10f53236aa65a61530503e30f24cddfac79a
-- ground-standing-ok: b — the inverses run newest first: this file (rcstore_l) runs long before
-- rcstore_a_content_schema_down.sql, which refuses while any function or table still lives in schema
-- content; the restored guard body and content._capture_bypassed leave together, never apart.

set local lock_timeout = '2s';

delete from platform.client_callable_door
 where schema_name = 'content' and function_name in ('read_published', 'read_published_by_slug', 'thin_autosave_versions');

drop function content.read_published_by_slug(uuid, text, text);
drop function content.read_published(uuid);
drop function content.thin_autosave_versions(boolean);
drop function content.search_documents(text, text, uuid, text[], text, integer, integer);
drop function content._search_args_ok(text, uuid, text);
drop function content.version_diff(uuid, integer, integer);
drop function content.version_get(uuid, integer);
drop function content.version_list(uuid, integer, integer);
drop function content.local_sync_changes(timestamptz, integer);
drop function content.find_document(uuid, text, text);
drop function content.document_get(uuid, boolean);
drop function content.type_settings(text, uuid);
revoke usage on schema content from anon;

CREATE OR REPLACE FUNCTION content._document_guard_data_class()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

alter table content.document alter column visibility set default 'internal'::platform.visibility;

delete from platform.edge_payload_kind where kind in ('text_anchor_set', 'render_binding');
update platform.edge_payload_kind
   set version = 1, json_schema = $ta${"$defs": {"TextAnchorBlock": {"additionalProperties": false, "description": "Optional stable block hint: which block of the body held the passage, and its hash.", "properties": {"__kind": {"description": "The registered kind this payload is an instance of, when it is one.", "type": "string"}, "hash": {"description": "Hash of that block's text at the captured version.", "maxLength": 128, "minLength": 1, "title": "Hash", "type": "string"}, "index": {"description": "Zero-based index of the block (paragraph, list item, heading) in the body.", "minimum": 0, "title": "Index", "type": "integer"}}, "required": ["index", "hash"], "title": "TextAnchorBlock", "type": "object"}}, "additionalProperties": false, "description": "One passage of one content version, in Unicode code points.", "properties": {"__kind": {"const": "text_anchor", "default": "text_anchor", "description": "The registered kind this payload is an instance of.", "title": "Kind", "type": "string"}, "block": {"anyOf": [{"$ref": "#/$defs/TextAnchorBlock"}, {"type": "null"}], "default": null, "description": "Optional block hint for disambiguation."}, "content_version": {"description": "The document content_version the offsets were captured against.", "minimum": 1, "title": "Content Version", "type": "integer"}, "end": {"description": "Code-point offset just past the passage (end > start).", "minimum": 1, "title": "End", "type": "integer"}, "exact": {"description": "The selected text, exactly; its code-point length is end - start.", "maxLength": 20000, "minLength": 1, "title": "Exact", "type": "string"}, "prefix": {"default": "", "description": "Up to 64 code points of text immediately before the passage.", "maxLength": 64, "title": "Prefix", "type": "string"}, "start": {"description": "Code-point offset where the passage begins.", "minimum": 0, "title": "Start", "type": "integer"}, "suffix": {"default": "", "description": "Up to 64 code points of text immediately after the passage.", "maxLength": 64, "title": "Suffix", "type": "string"}}, "required": ["content_version", "start", "end", "exact"], "title": "TextAnchor", "type": "object"}$ta$::jsonb
 where kind = 'text_anchor';

delete from platform.feature_knob
 where feature = 'content.document'
   and (key like 'default_visibility.%' or key like 'identity_key.%' or key like 'listed.%'
        or key like 'local_sync.%' or key like 'editor_mode.%'
        or key in ('large_body_chars', 'autosave_version_keep_days', 'edited_answer_visible_to_model'));
