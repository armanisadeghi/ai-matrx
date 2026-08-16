-- AI Work Saved Requests: one platform-seeded shortcut category.
-- A Saved Request IS an agent.shortcut row (the platform's existing "stored,
-- first-class invocation of an agent version"). This category is how AI Work
-- recognises its own rows without a new table.
insert into platform.categories (id, organization_id, dimension, name, slug, is_system, icon, position)
select
  '3f2d5c8a-1b47-4e6d-9c0f-7a5e2d13b904'::uuid,
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
  'shortcut',
  'Saved requests',
  'ai-work-saved-requests',
  true,
  'BookmarkCheck',
  0
where not exists (
  select 1 from platform.categories
  where dimension = 'shortcut' and slug = 'ai-work-saved-requests'
);
