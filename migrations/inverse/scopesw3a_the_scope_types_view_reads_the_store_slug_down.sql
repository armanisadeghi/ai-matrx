-- lane: SCOPES-W3
-- lock: custom
-- Inverse of scopesw3a: the view reads the old table's slug again (the old table must be back in `context`).
create or replace view custom.context_scope_types with (security_invoker = true) as
 select id,
    organization_id,
    coalesce(( select s.slug from context.scope_types s where s.id = t.id), data ->> 'slug'::text) as slug,
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
