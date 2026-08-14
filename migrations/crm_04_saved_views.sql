-- CRM smart views: `crm.saved_view` — a NAMED, RE-RUNNABLE party-list query.
--
-- Why a table and not a user preference: `lib/list-views` persists STYLE
-- (view/density/sort/columns) and deliberately never persists QUERY. A smart
-- view IS a query, and a sales floor shares it — so it is a real record with an
-- identity, an owner, an org, and the platform `visibility` tier deciding
-- whether it is mine alone (`personal`) or the team's (`internal`). That also
-- makes it addressable: an outreach list enrolled from a view stamps the view's
-- id into `crm.outreach_list.definition`, so the queue can point back at the
-- query that filled it.
--
-- The definition is the SAME query shape the /crm list already serves through
-- `applyPartyListPredicates` (scope, kind facet, search, column filters, sort).
-- It is jsonb, not columns, because that shape belongs to the list surface and
-- grows with it; the client validates it on read (`parseSavedViewDefinition`)
-- and falls back to the default query rather than trusting a stale blob.
--
-- Idempotent. Applied live 2026-08-14 and recorded in public._schema_migrations.

do $$
begin
  if to_regclass('crm.saved_view') is null then
    perform platform.create_entity_table(
      p_schema => 'crm', p_table => 'saved_view', p_token => 'crm_saved_view',
      p_label => 'Smart View',
      p_fields => ARRAY[
        'name text NOT NULL',
        'description text',
        -- The party-list query: { version, scope, search, kind, filters, sort, direction }.
        $f$definition jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        -- Last time a human actually opened it — how the bar orders itself.
        'last_used_at timestamptz'
      ],
      p_variant => 'entity', p_versioned => true, p_soft_delete => true,
      p_visibility => 'internal', p_category => false, p_listed => true,
      p_org_default => true, p_gin_jsonb => true);
  end if;
end $$;

-- One name per owner per org: a second "Hot leads" is a mistake, not a variant.
create unique index if not exists saved_view_name_per_owner
  on crm.saved_view (organization_id, created_by, lower(name))
  where deleted_at is null;

create index if not exists saved_view_org_recent
  on crm.saved_view (organization_id, last_used_at desc nulls last)
  where deleted_at is null;
