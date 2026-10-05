-- draft: drops five triggers on platform.associations — apply only inside the 1–4 AM Pacific window (manager ruling, FTS-1c); remove this line then.
-- chair-step: it DROPS the tag copy into the old scope tables, obsolete since tags became platform.tag (FTS-4) and the store copies were archived: the five platform.associations triggers _ab_context_tag_copy_fence_ins/_upd and zz_context_tag_follow_ins/_upd/_del, their functions platform._context_tag_copy_fence() and platform._context_tag_follow_to_the_copy(), and custom.context_tag_copy_batch(uuid, jsonb, integer) with its one-call wrapper custom.context_tag_copy(uuid) and their two platform.client_callable_door rows. No product code calls either copy function (aidream, matrx-frontend, matrx-local, matrx-extend); only campaign tests from the copy's own lanes name them. The inverse recreates every function, owner, grant, trigger and door row exactly.
-- lane: FINISH-THE-SWITCH (FTS-1c, wave 2 last bodies of SCOPES-ON-THE-STORE)
-- lock: platform, custom
-- window-class: five DROP TRIGGER on platform.associations take its ACCESS EXCLUSIVE lock for milliseconds each; applied only inside 1–4 AM Pacific.
--
-- Inverse: migrations/inverse/scopesw2c_the_tag_copy_into_the_old_scope_store_is_gone_down.sql.
--
-- THE USE CASE. Cedar Ridge Physical Therapy tags a patient file "Knee rehab"; the tag is a platform.tag edge and
-- nothing needs copying into the old scope tables any more, so tagging stops paying for a copy nobody reads.

drop trigger _ab_context_tag_copy_fence_ins on platform.associations;
drop trigger _ab_context_tag_copy_fence_upd on platform.associations;
drop trigger zz_context_tag_follow_ins on platform.associations;
drop trigger zz_context_tag_follow_upd on platform.associations;
drop trigger zz_context_tag_follow_del on platform.associations;
drop function platform._context_tag_copy_fence();
drop function platform._context_tag_follow_to_the_copy();
drop function custom.context_tag_copy(uuid);
drop function custom.context_tag_copy_batch(uuid, jsonb, integer);
delete from platform.client_callable_door where function_name in ('context_tag_copy_batch', 'context_tag_copy');
