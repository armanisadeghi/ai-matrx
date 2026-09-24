-- expect-scan: view zz_bo_10.open_invoices
-- expect-live: refuse
-- setup: create table zz_bo_10.invoice (id int, paid boolean)
-- setup: create view zz_bo_10.open_invoices with (security_invoker = true) as select id from zz_bo_10.invoice where not paid
--
-- The same class on a view: DROP VIEW then CREATE VIEW overwrites whatever a peer did to it.
drop view if exists zz_bo_10.open_invoices;
create view zz_bo_10.open_invoices with (security_invoker = true) as select id, paid from zz_bo_10.invoice where not paid;
