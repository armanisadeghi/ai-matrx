with w as (update legal.wc_claim set visibility = 'public' where id = (select id from legal.wc_claim order by id limit 1) returning 'wc_claim update visibility=public' p, visibility::text v),
     h as (update extend.wbx_highlight set deleted_at = now() where id = (select id from extend.wbx_highlight where deleted_at is null order by id limit 1) returning 'wbx_highlight soft delete', (deleted_at is not null)::text)
select * from w union all select * from h
