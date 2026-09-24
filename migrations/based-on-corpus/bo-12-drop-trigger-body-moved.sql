-- expect-scan: trigger stamp_updated on zz_bo_12.invoice
-- expect-live: refuse
-- setup: create table zz_bo_12.invoice (id int, updated_at timestamptz)
-- setup: create function zz_bo_12.stamp() returns trigger language plpgsql as $f$ begin new.updated_at := now(); return new; end $f$
-- setup: create trigger stamp_updated before update on zz_bo_12.invoice for each row execute function zz_bo_12.stamp()
-- based-on: trigger stamp_updated on zz_bo_12.invoice 1a4855f7d3edc559a088b34449b8f48cbb6517c73cd65e3fa713442b41fb63d4
--
-- The same class on a trigger, with a declaration that no longer matches the live definition.
drop trigger if exists stamp_updated on zz_bo_12.invoice;
create trigger stamp_updated before insert or update on zz_bo_12.invoice for each row execute function zz_bo_12.stamp();
