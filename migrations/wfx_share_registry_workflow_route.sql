-- Give the `workflow` share registry row its real route back.
--
-- `platform.shareable_resource_registry.url_path_template` was emptied for
-- `workflow` on 2026-08-14 (see features/sharing/FEATURE.md, D138) because
-- `/workflows/{id}` did not exist — an empty template is the registry saying
-- "this record has no signed-in destination", so `getResourceSharePath` returns
-- null and the surface renders NO link, which beats a 404.
--
-- That route exists now: `/workflows/[id]` sets a workflow up, runs it, and
-- watches it live. So the honest value is no longer empty — a person sharing a
-- workflow from `/workflows/all` should get a link the recipient can open. The
-- template matches `entityRegistry.hrefFor("workflow")`, which this change also
-- restored; the registry stays the route authority and this row must agree
-- with it.
--
-- `is_link_shareable` is deliberately NOT touched: anonymous link sharing for
-- workflows is a product decision, not a route fact.
UPDATE platform.shareable_resource_registry
SET url_path_template = '/workflows/{id}'
WHERE resource_type = 'workflow'
  AND coalesce(url_path_template, '') = '';
