-- expect-scan: trigger stamp_updated on zz_bo_13.invoice
-- expect-live: accept
-- setup: create table zz_bo_13.invoice (id int, updated_at timestamptz)
-- setup: create function zz_bo_13.stamp() returns trigger language plpgsql as $f$ begin new.updated_at := now(); return new; end $f$
-- setup: create trigger stamp_updated before update on zz_bo_13.invoice for each row execute function zz_bo_13.stamp()
-- based-on: trigger stamp_updated on zz_bo_13.invoice {{hash:trigger stamp_updated on zz_bo_13.invoice}}
--
-- Positive control for bo-12.
drop trigger if exists stamp_updated on zz_bo_13.invoice;
create trigger stamp_updated before insert or update on zz_bo_13.invoice for each row execute function zz_bo_13.stamp();
