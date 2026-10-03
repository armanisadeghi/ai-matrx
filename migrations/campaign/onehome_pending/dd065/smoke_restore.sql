with x as (select id from extend.wbx_highlight where deleted_at is not null order by id limit 1)
update extend.wbx_highlight h set is_deleted = false from x where h.id = x.id
returning 'legacy restore is_deleted=false' probe, h.is_deleted, h.deleted_at is null deleted_at_cleared
