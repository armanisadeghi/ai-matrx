-- Newest-first per-site link-edge reads (marketing link graph + table).
-- 100k+ edge sites hit statement timeout ordering by created_at without this
-- (prod 57014 on /marketing/.../links, 2026-07-21).
create index if not exists link_edge_site_created_idx
  on web.link_edge (site_id, created_at desc, id desc)
  where deleted_at is null;
