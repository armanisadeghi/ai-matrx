-- chair-step: the inverse of w1_org_is_personal_is_deprecated_on_main.sql. It DROPS the function
--   iam.is_personal_dependents(), DELETES the platform.deprecated_relations row and PUTS BACK the
--   partial unique index that makes is_personal rule again. Running it undoes REC-61's
--   deprecation and is only ever correct as a revert of that one file. A person reads the body.
--
-- w1_org_is_personal_is_deprecated_on_main_down.sql
--
-- THE INVERSE. Every object is put back exactly as production carried it on 2026-09-22, read off
-- the live catalog rather than remembered:
--
--   CREATE UNIQUE INDEX organizations_one_personal_per_creator ON iam.organizations
--     USING btree (created_by) WHERE ((is_personal IS TRUE) AND (created_by IS NOT NULL))
--
-- and `iam.organizations.is_personal` carried NO comment before the up file added one, so the
-- comment is set back to null rather than to some earlier sentence.
--
-- THE ONE WAY THIS CAN FAIL, AND IT IS HONEST WHEN IT DOES: the unique index is re-created over
-- live data. If, between the up and the down, two organizations with the same `created_by` were
-- both flagged `is_personal`, the CREATE UNIQUE INDEX raises 23505 and the whole transaction
-- rolls back — which is the truth (the constraint no longer holds), not a defect in this file.
-- The remedy is to fix the duplicate, not to weaken the index.

set lock_timeout = '5s';

drop function if exists iam.is_personal_dependents();

delete from platform.deprecated_relations
 where old_ref = 'iam.organizations.is_personal';

comment on column iam.organizations.is_personal is null;

create unique index organizations_one_personal_per_creator
    on iam.organizations using btree (created_by)
 where ((is_personal is true) and (created_by is not null));
