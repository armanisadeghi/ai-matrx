-- The inverse of `migrations/campaign/storetxn2_kind_instance_is_superseded_by_the_record_store.sql`,
-- for rule 27 (up -> inverse -> up) ON THE CLONE.
--
-- It deletes the ONE declaration row that file wrote, and it deletes it only while
-- `archived_as is null` — a row that has an archive is a TRIPPED deprecation (REC-37 step 8 ran
-- `platform.deprecate_relation`, the relation was renamed and a raising view put in its place),
-- and removing that row would make the platform forget where a live relation went. The inverse
-- of a declaration is the absence of the declaration, never the loss of an archive reference.

delete from platform.deprecated_relations
 where old_ref = 'content_ir.kind_instance'
   and new_ref = 'custom.record'
   and archived_as is null;
