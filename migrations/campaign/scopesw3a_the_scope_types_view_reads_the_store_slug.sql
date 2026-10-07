-- lane: SCOPES-W3
-- lock: custom
--
-- Inverse: migrations/inverse/scopesw3a_the_scope_types_view_reads_the_store_slug_down.sql.
--
-- THE USE CASE. Cedar Ridge Physical Therapy's scope type "Practice Areas" is read from the record store alone; the view
-- no longer asks the old context.scope_types table for its slug, so the old table can move to `deprecated`.
-- WHY NO DATA CHANGE: the 76 differing slugs differ ONLY by hyphen vs underscore (old "practice-areas", store "practice_areas";
-- checked: replace(old,'-','_') = store for all 76). The store's own guard (REC-66, custom._table_shape_guard) allows only
-- lower-case letters, digits and underscores in a type's slug and every writer (_ctx_scope_slug / _ctx_slug) writes underscores;
-- every reader that matches a type by slug (scope_system_apply, _ctx_store_type) already compares with replace('_','-').
-- So the store slug is the truth and the old hyphenated key is a legacy display form.
create or replace view custom.context_scope_types with (security_invoker = true) as
 select id,
    organization_id,
    data ->> 'slug'::text as slug,
    data ->> 'label_singular'::text as label_singular,
    data ->> 'label_plural'::text as label_plural,
    coalesce(nullif(data ->> 'sort_order'::text, ''::text)::integer, 0) as sort_order,
    created_by,
    updated_by,
    created_at,
    updated_at,
    deleted_at,
    version
   from custom.record t
  where table_id = custom.table_kernel_id() and data @> '{"kept_for": "context"}'::jsonb;
