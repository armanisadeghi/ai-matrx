-- Preserve page-specific research when a planned page becomes a canonical page.
-- Site-level grounding remains attached to web_site and is inherited at read
-- time; this trigger copies only the more specific plan-node lineage.

create or replace function platform.propagate_plan_page_research_lineage()
returns trigger
language plpgsql
security definer
set search_path = platform, public
as $function$
begin
  if new.source_type in ('research_topic', 'research_tag')
     and new.target_type = 'plan_node' then
    insert into platform.associations (
      source_type,
      source_id,
      target_type,
      target_id,
      organization_id,
      label,
      metadata,
      created_by,
      role
    )
    select
      new.source_type,
      new.source_id,
      'web_page',
      realized.target_id,
      coalesce(new.organization_id, realized.organization_id),
      new.label,
      coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
        'lineage_origin', 'plan_node',
        'plan_node_id', new.target_id
      ),
      new.created_by,
      'inherited_from_plan'
    from platform.associations realized
    where realized.source_type = 'plan_node'
      and realized.source_id = new.target_id
      and realized.target_type = 'web_page'
      and realized.role = 'realizes'
    on conflict do nothing;
  elsif new.source_type = 'plan_node'
        and new.target_type = 'web_page'
        and new.role = 'realizes' then
    insert into platform.associations (
      source_type,
      source_id,
      target_type,
      target_id,
      organization_id,
      label,
      metadata,
      created_by,
      role
    )
    select
      research.source_type,
      research.source_id,
      'web_page',
      new.target_id,
      coalesce(research.organization_id, new.organization_id),
      research.label,
      coalesce(research.metadata, '{}'::jsonb) || jsonb_build_object(
        'lineage_origin', 'plan_node',
        'plan_node_id', new.source_id
      ),
      coalesce(new.created_by, research.created_by),
      'inherited_from_plan'
    from platform.associations research
    where research.source_type in ('research_topic', 'research_tag')
      and research.target_type = 'plan_node'
      and research.target_id = new.source_id
    on conflict do nothing;
  end if;

  return new;
end;
$function$;

drop trigger if exists associations_propagate_plan_page_research_lineage
  on platform.associations;

create trigger associations_propagate_plan_page_research_lineage
after insert on platform.associations
for each row
execute function platform.propagate_plan_page_research_lineage();

-- Bring already-realized plan pages forward without rewriting their source
-- records or deleting historical lineage.
insert into platform.associations (
  source_type,
  source_id,
  target_type,
  target_id,
  organization_id,
  label,
  metadata,
  created_by,
  role
)
select
  research.source_type,
  research.source_id,
  'web_page',
  realized.target_id,
  coalesce(research.organization_id, realized.organization_id),
  research.label,
  coalesce(research.metadata, '{}'::jsonb) || jsonb_build_object(
    'lineage_origin', 'plan_node',
    'plan_node_id', research.target_id
  ),
  coalesce(realized.created_by, research.created_by),
  'inherited_from_plan'
from platform.associations research
join platform.associations realized
  on realized.source_type = 'plan_node'
 and realized.source_id = research.target_id
 and realized.target_type = 'web_page'
 and realized.role = 'realizes'
where research.source_type in ('research_topic', 'research_tag')
  and research.target_type = 'plan_node'
on conflict do nothing;

comment on function platform.propagate_plan_page_research_lineage() is
  'Copies page-specific research topic/tag lineage in either order between plan.node realization and web.page. Site-level research remains inherited from web.site at read time.';
