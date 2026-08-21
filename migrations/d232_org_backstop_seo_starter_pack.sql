-- D232 §C (follow-on) — the two org-backstop laggards that appeared 2026-08-21 from
-- parallel work, after the original eleven were cleared by
-- `d232_org_backstop_11_laggards.sql`.
--
-- Live-verified immediately before applying: both carry `organization_id NOT NULL`
-- with no default and no org-bearing BEFORE INSERT trigger, so an org-forgetting
-- write 500s (23502). db-rules §2: the backstop is REQUIRED whenever the column is
-- NOT NULL.
--
--   seo.starter_pack       root  -> _stamp_org_default (org from created_by/auth.uid)
--   seo.starter_pack_item  child -> inherit_org_from_parent('seo','starter_pack','pack_id')
--                                   (pack_id is NOT NULL and CASCADEs from the pack)
--
-- Idempotent.

drop trigger if exists _stamp_org_default on seo.starter_pack;
create trigger _stamp_org_default before insert on seo.starter_pack
  for each row execute function public._stamp_org_default();

drop trigger if exists _inherit_org on seo.starter_pack_item;
create trigger _inherit_org before insert on seo.starter_pack_item
  for each row execute function platform.inherit_org_from_parent('seo', 'starter_pack', 'pack_id');
