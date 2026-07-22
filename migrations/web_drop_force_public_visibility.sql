-- Drop the force_public_visibility trigger + function added 2026-07-21. It
-- silently rewrote every web.site / web.brand visibility to 'public', and
-- visibility='public' is a READ GRANT to every authenticated user in
-- iam.has_access_for_base — it made all tenants' marketing data cross-visible
-- and it overrode the attempted revert.
drop trigger if exists force_public_visibility on web.site;
drop trigger if exists force_public_visibility on web.brand;
drop function if exists web.force_public_visibility() cascade;

update web.site  set visibility = 'internal' where visibility = 'public';
update web.brand set visibility = 'internal' where visibility = 'public';
