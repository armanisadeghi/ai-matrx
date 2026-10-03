with a as (select id from extend.wbx_highlight where deleted_at is null order by id limit 2),
     legacy as (update extend.wbx_highlight h set is_deleted = true from (select id from a order by id limit 1) x where h.id=x.id returning 'legacy write is_deleted=true' probe, h.is_deleted, h.deleted_at is not null deleted_at_set),
     canon  as (update extend.wbx_highlight h set deleted_at = now() from (select id from a order by id offset 1) x where h.id=x.id returning 'canonical write deleted_at=now()', h.is_deleted, h.deleted_at is not null)
select * from legacy union all select * from canon
union all select 'disagreeing rows (3 tables)', null, ((select count(*) from extend.wbx_demo where is_deleted is distinct from (deleted_at is not null))+(select count(*) from extend.wbx_guidance where is_deleted is distinct from (deleted_at is not null))+(select count(*) from extend.wbx_highlight where is_deleted is distinct from (deleted_at is not null)))=0
