-- THE COMPONENT-ACCESS PRECEDENT (owner ruling 2026-08-08) — part 3/3.
-- Register the missing seo composition edges, then regenerate the membrane
-- policy set for EVERY component table that carries the canonical apply_rls
-- policy set. Component tables with bespoke policy families (files.*,
-- docproc, transcripts studio_*, workbench udt_*, pdf.redaction_mapping,
-- workflow.node_data_slot, legal.wc_impairment_definition, runtime.*) are
-- deliberately left untouched — their extra lanes (public_read, curator,
-- grant_read, read-only runtime) would be dropped by regeneration; they are
-- tracked for canonicalization separately. graveyard excluded. agent.card is
-- a VIEW (no RLS possible). Idempotent: re-running re-applies the same
-- generated policies.

insert into platform.entity_relationships (child_type, parent_type, fk_column, kind)
select v.child_type, v.parent_type, v.fk_column, 'composition'
from (values
  ('seo_site_keyword_value', 'web_site', 'site_id'),
  ('seo_site_topic_value',   'web_site', 'site_id')
) as v(child_type, parent_type, fk_column)
where not exists (
  select 1 from platform.entity_relationships er
  where er.child_type = v.child_type and er.kind = 'composition'
);

select iam.apply_rls(et.schema_name, et.table_name, et.token, 'component')
from platform.entity_types et
where (coalesce(et.is_component, false) or et.rls_variant = 'component')
  and et.schema_name <> 'graveyard'
  and (
    -- canonical apply_rls set (pre-precedent shape) …
    (select string_agg(p.policyname, ',' order by p.policyname)
     from pg_policies p
     where p.schemaname = et.schema_name and p.tablename = et.table_name)
      = 'std_delete,std_insert,std_select,std_update,svc_all'
    -- … or already membraned (idempotent re-apply)
    or exists (
      select 1 from pg_policies p
      where p.schemaname = et.schema_name and p.tablename = et.table_name
        and p.policyname = 'std_select'
        and p.qual like '%accessible_entity_ids%'
    )
  );
