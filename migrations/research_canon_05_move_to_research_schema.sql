-- migrate: skip: GATED on PostgREST exposure of the `research` schema (Supabase Settings -> API ->
-- Exposed schemas). This is NOT reachable via the MCP. Moving these FE-read tables into an
-- unexposed schema 404s every research read instantly. The canonicalization (migrations 01-04)
-- is already live in public; this file is the staged physical move. Once `research` is exposed:
--   1) remove this skip line, 2) apply via Supabase MCP, 3) add `research` to the db-types
--   --schema list + aidream matrx_orm.yaml, 4) repoint FE `.from('rs_*')` -> `.schema('research').from('rs_*')`,
--   5) register the moves in scripts/dead-relations.json + platform.deprecated_relations, 6) ledger it.
--
-- research_canon_05_move_to_research_schema
-- Relocate the fully-canonical research cluster public.rs_* -> research.rs_*.
-- SET SCHEMA carries columns/PK/indexes/constraints/inbound FKs/RLS policies/triggers/sequences.
-- The view tracks deps by OID so SET SCHEMA is safe; the 4 functions hardcode public.rs_* and are repointed below.

-- Schema is pre-created; ensure grants (idempotent).
create schema if not exists research;
grant usage on schema research to authenticated, anon, service_role;
grant all on all tables in schema research to service_role;
grant select, insert, update, delete on all tables in schema research to authenticated;
alter default privileges in schema research grant all on tables to service_role;
alter default privileges in schema research grant select, insert, update, delete on tables to authenticated;

-- Move the 12 base tables (entity + components + junctions).
alter table public.rs_topic           set schema research;
alter table public.rs_template         set schema research;
alter table public.rs_keyword          set schema research;
alter table public.rs_source           set schema research;
alter table public.rs_tag              set schema research;
alter table public.rs_synthesis        set schema research;
alter table public.rs_document         set schema research;
alter table public.rs_content          set schema research;
alter table public.rs_analysis         set schema research;
alter table public.rs_media            set schema research;
alter table public.rs_source_tag       set schema research;
alter table public.rs_keyword_source   set schema research;
-- Move the denormalized view (deps are by OID, keeps resolving).
alter view  public.rs_source_keywords  set schema research;

-- Registry schema_name must follow (verify_canonical / has_access resolve schema from entity_types).
update platform.entity_types set schema_name='research'
 where token in ('research_topic','research_template','research_keyword','research_source','research_tag',
                 'research_synthesis','research_document','research_content','research_analysis',
                 'research_media','research_source_tag','research_keyword_source');
update public.shareable_resource_registry set schema_name='research'
 where resource_type in ('research_topic','research_template');

-- Repoint the 4 functions that hardcode public.rs_* (only the rs_* refs change; pc_episodes/dm_messages stay public).
CREATE OR REPLACE FUNCTION public.get_user_dashboard_metrics()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('agents',0,'conversations',0,'knowledge_files',0,'published_apps',0,
      'notes',0,'tasks',0,'transcripts',0,'scopes',0,'shortcuts',0,'research_reports',0,'podcasts',0,'messages',0);
  end if;
  return jsonb_build_object(
    'agents',           (select count(*) from agent.definition      where created_by = uid and coalesce(is_archived, false) = false),
    'conversations',    (select count(*) from chat.conversation      where created_by = uid and deleted_at is null),
    'knowledge_files',  (select count(*) from files.files            where created_by = uid and deleted_at is null),
    'published_apps',   (select count(*) from app.definition         where created_by = uid and status = 'published'),
    'notes',            (select count(*) from workbench.notes        where created_by = uid and deleted_at is null),
    'tasks',            (select count(*) from workspace.tasks        where created_by = uid),
    'transcripts',      (select count(*) from transcripts.transcripts where user_id = uid and coalesce(is_deleted, false) = false),
    'scopes',           (select count(*) from context.scopes         where created_by = uid),
    'shortcuts',        (select count(*) from agent.shortcut         where created_by = uid and coalesce(is_active, false) = true),
    'research_reports', (select count(*) from research.rs_topic      where created_by = uid),
    'podcasts',         (select count(*) from public.pc_episodes     where user_id = uid),
    'messages',         (select count(*) from public.dm_messages     where sender_id = uid and deleted_at is null)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_keywords(p_topic_id uuid, p_keyword_ids uuid[])
 RETURNS void LANGUAGE plpgsql
AS $function$
BEGIN
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
      FROM unnest(p_keyword_ids) WITH ORDINALITY AS u(id, ord)
      LEFT JOIN research.rs_keyword k
        ON k.id = u.id AND k.topic_id = p_topic_id
     WHERE k.id IS NULL
  ) THEN
    RAISE EXCEPTION 'reorder_keywords: one or more ids do not belong to topic %', p_topic_id;
  END IF;
  UPDATE research.rs_keyword k
     SET position = u.ord
    FROM unnest(p_keyword_ids) WITH ORDINALITY AS u(id, ord)
   WHERE k.id = u.id
     AND k.topic_id = p_topic_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rs_keyword_assign_position()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.position IS NULL OR NEW.position = 0 THEN
        SELECT COALESCE(MAX(position), 0) + 1
          INTO NEW.position
          FROM research.rs_keyword
         WHERE topic_id = NEW.topic_id;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rs_topic_append_output(p_topic_id uuid, p_kind text, p_asset jsonb)
 RETURNS jsonb LANGUAGE plpgsql
AS $function$
declare
  v_outputs jsonb; v_assets jsonb; v_kind_obj jsonb; v_asset_id text;
begin
  if p_kind is null or p_kind = '' then raise exception 'p_kind is required'; end if;
  if p_asset is null or jsonb_typeof(p_asset) <> 'object' then raise exception 'p_asset must be a JSON object'; end if;
  select coalesce(outputs, '{}'::jsonb) into v_outputs from research.rs_topic where id = p_topic_id for update;
  if not found then raise exception 'rs_topic % not found', p_topic_id; end if;
  v_asset_id := p_asset->>'id';
  v_assets := coalesce(v_outputs -> p_kind -> 'assets', '[]'::jsonb);
  v_assets := (select coalesce(jsonb_agg(elem), '[]'::jsonb) from jsonb_array_elements(v_assets) elem
                where v_asset_id is null or elem->>'id' is distinct from v_asset_id);
  v_assets := jsonb_build_array(p_asset) || v_assets;
  v_kind_obj := coalesce(v_outputs -> p_kind, '{}'::jsonb);
  v_kind_obj := jsonb_set(v_kind_obj, array['assets'], v_assets, true);
  v_outputs := jsonb_set(v_outputs, array[p_kind], v_kind_obj, true);
  update research.rs_topic set outputs = v_outputs where id = p_topic_id;
  return v_outputs;
end;
$function$;

-- At execution time also re-scan for any OTHER function/policy referencing rs_* unqualified and repoint.
