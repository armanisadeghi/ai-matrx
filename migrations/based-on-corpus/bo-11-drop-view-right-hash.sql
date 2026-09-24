-- expect-scan: view zz_bo_11.open_invoices
-- expect-live: accept
-- setup: create table zz_bo_11.invoice (id int, paid boolean)
-- setup: create view zz_bo_11.open_invoices with (security_invoker = true) as select id from zz_bo_11.invoice where not paid
-- based-on: view zz_bo_11.open_invoices {{hash:view zz_bo_11.open_invoices}}
--
-- Positive control for bo-10.
drop view if exists zz_bo_11.open_invoices;
create view zz_bo_11.open_invoices with (security_invoker = true) as select id, paid from zz_bo_11.invoice where not paid;
