-- RC-A5d(a) — WHICH ASSOCIATION TEXT IS STRUCTURE, AND WHICH IS AN ENDPOINT'S CONTENT (the two
-- declarations the RC-A5d(b) gate reads).
-- chair-step: adds platform.edge_structural_labels() (a signed-in door) and platform.edge_structural_metadata_keys(); applied only when named, immediately before rca5d_b.
-- Design, census and measurements: common-docs/projects/rich-content-unification/ASSOCIATION-VISIBILITY.md §10.
-- Register: common-docs/projects/rich-content-unification/REGISTER.md row RC-A5d.
--
-- THE DEFECT (census on production 2026-09-25): platform.associations.label and .metadata are
-- read by every member of the edge's organization (assoc_select), and writers copy endpoint
-- content into both: file names (file->conversation, file->project, file->rulebook), personal
-- note titles and opening sentences (note->rulebook, note->file), study-guide titles
-- (study_media/assessment/fc_set->file, as label AND metadata.sourceTitle), message text
-- (message->task label and metadata.parent.label), agent names/descriptions (agent->agent label,
-- metadata.gap/tagline), page body quotes (seo_keyword->web_page metadata.evidence). 407 labelled
-- rows and ~450 metadata rows. The other 42,925 labels are the pair's own vocabulary word.
--
-- THE CLASS FIX — fail-closed at the ROW, not the pair:
--   * A label is STRUCTURE only when it is the association type's own label
--     (platform.association_types.label, one per pair: 'catalogued_source', 'part_of', …). Any
--     other label is treated as endpoint content. association_types is admin-only to clients, so
--     the map is served by one SECURITY DEFINER door that returns vocabulary words only.
--   * A metadata key is STRUCTURE only when it is on the allowlist below (identifiers, flags,
--     enums, counts, positions, timestamps). Any other key — sourceTitle, detail, evidence, gap,
--     tagline, parent, source_name, href, reason, and every key a writer adds later — is treated
--     as endpoint content until it is added here with its reason.
--   rca5d_b then gates a row carrying endpoint content exactly as RC-A5 gates a content payload.
-- Inverse: migrations/inverse/rca5d_a_association_text_declarations_down.sql.

set local lock_timeout = '2s';

create or replace function platform.edge_structural_metadata_keys()
returns text[]
language sql
immutable
parallel safe
set search_path to ''
as $$
  -- Every key here holds an identifier, flag, enum, count, position or timestamp — never text
  -- copied from an endpoint. A key absent from this list is endpoint content (fail-closed).
  select array[
    -- identifiers and provenance of the edge itself
    'legacy_id','legacy_table','processed_document_id','chunk_id','page','page_id','file_id',
    'user_id','task_id','project_id','agentId','agent_id','moved_from','imported_from',
    'migrated_from','backfilled_from','backfill_source','backfilled_at','source_key',
    'context_key','assigned_by','assigned_at','due_date','withdrawn_by','withdrawn_as','withdrawn_at',
    -- flags, enums, counts, positions, versions
    'position','pos','is_active','enabled','membership','is_primary_source','pasted','pasted_at',
    'words','source_kind','targetKind','doc_kind','kind','face','representation','mime_type',
    'media_type','attached_from','tier','visibility','version','role','mode','accent','color',
    'approach','confidence','source_count','analyzer_version','provider_iteration','depth_budget',
    'orchestratorPos','conductorPos','field','local_alias','variable_name','resource_policy',
    'action_outcomes','campaign','register','system','whole_value_of'
  ]::text[];
$$;

comment on function platform.edge_structural_metadata_keys() is
  'RC-A5d. The platform.associations.metadata keys that are structure (identifiers, flags, enums, counts, positions, timestamps). A row whose metadata carries any other key is treated as carrying endpoint content and is readable only by someone who can read both ends (policy assoc_payload_follows_endpoints, widened by rca5d_b). Add a key only with its reason; never add one that can hold a title, name, quote or body text.';

create or replace function platform.edge_structural_labels()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  -- {"<source_type>><target_type>": "<the type's own label>"} — vocabulary words only.
  select coalesce(jsonb_object_agg(t.source_type || '>' || t.target_type, t.label), '{}'::jsonb)
    from platform.association_types t
   where t.label is not null and t.label <> '';
$$;

comment on function platform.edge_structural_labels() is
  'RC-A5d. Map of association pair -> that pair''s own label (platform.association_types.label). An edge label equal to it is structure; any other label is treated as endpoint content by policy assoc_payload_follows_endpoints (rca5d_b). Returns registry vocabulary only, no row of any tenant.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers, anonymous_callers)
values
  ('platform', 'edge_structural_labels', '', '{}'::oid[], 'RC-A5d (rca5d_a, 2026-09-25)',
   'SIGNED-IN door (authenticated only). Evaluated once per query inside the restrictive SELECT policy on platform.associations as the caller. Takes no argument and makes no access decision: it returns the association-type vocabulary (pair -> type label), which is registry data, never a tenant row.',
   true, false)
on conflict do nothing;

-- PUBLIC/anon EXECUTE is cleared at birth by the DDL guard (§6d-4); the door row above opens the
-- signed-in lane, so the grant below stands.
grant execute on function platform.edge_structural_labels() to authenticated;
grant execute on function platform.edge_structural_metadata_keys() to authenticated;
