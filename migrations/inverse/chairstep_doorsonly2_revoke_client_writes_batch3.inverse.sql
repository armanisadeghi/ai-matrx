-- chair-step: DOORS-ONLY-2 batch 3 inverse -- RE-GRANTS the client write privileges on
-- iam.access_requests and platform.associations. The restrictive refusal policies stay, so no
-- write becomes reachable by this file alone. NOTE that the four association callers were moved
-- to public.assoc_add / public.assoc_remove and will not move back, so this restores a surface
-- nobody walks. Only run it to undo a withdrawal that broke a real path, and say which path.

grant insert, update, delete on iam."access_requests" to authenticated;
grant insert, update, delete on platform."associations" to authenticated;
