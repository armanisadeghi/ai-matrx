-- lane: DEAD-KEYS
-- chair-step: this file calls `iam.apply_rls(...)` / `iam.apply_table_grants(...)`, spec-driven
-- builders whose statements the additive allow-list cannot read ahead of time. What they execute is
-- the canonical route and nothing else: the grant re-issued here is byte-identical to the one the
-- table already holds (the excluded set below was read live from pg_attribute first), and the only
-- NEW object is the `pub_read` rule the opt-in emits.
-- DD-249 / R12 — THE FIRST OF ANON-LANES' FOUR DEAD KEYS, RULED: workbench.heatmap_saves IS BROKEN.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE FINDING ANON-LANES HANDED ON, AND WHICH HALF OF IT IS TRUE HERE
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ANON-LANES (2026-09-22) left four tables carrying an `anon` SELECT column grant with NO
-- SELECT-capable policy reaching `anon` — a KEY WITH NO DOOR, which can never return a row — while
-- `lib/security/public-exposure.ts#ANON_COLUMN_SURFACE` still named a signed-out reader for each.
-- Its own words: "Either those pages are already broken or the reasons are stale."
--
-- MEASURED, main database, 2026-09-22 (SELECT-only census + a live signed-out probe on the
-- publishable key + 24 h of edge_logs):
--
--   * THE READER IS REAL AND IT IS IN THE (public) ROUTE GROUP.
--     app/(public)/free/zip-code-heatmap/[id]/page.tsx reads .schema("workbench")
--     .from("heatmap_saves") with the BROWSER client, naming exactly the nine columns declared in
--     ANON_COLUMN_SURFACE, and its own comment says "RLS hands `anon` public rows only". Its
--     layout.tsx does the same read through the SSR client for the page title and OG description.
--     app/(public)/free/zip-code-heatmap/components/SaveHeatmapModal.tsx writes
--     `visibility: isPublic ? "public" : "personal"` and tells the person, on screen:
--     "This link is public. Anyone with the link can view your ...".
--
--   * THE RULE IS MISSING. `anon` holds SELECT on nine columns and NO permissive SELECT policy
--     names `anon` or PUBLIC. A signed-out probe with the publishable key answers 200 [] — not
--     42501 — so the page does not error; it renders "this heatmap is unavailable" for a link the
--     product promised was public. The share feature is dead on arrival for everyone not signed in.
--
--   * NOBODY HAS HIT IT YET because the table holds ZERO rows today (0 total, 0 public). That is
--     luck, not safety: the first person to tick "public" and send the link gets a broken page, and
--     the two of us who would have to debug it would be reading a comment that says the opposite.
--
-- So this one is the BROKEN half of ANON-LANES' either/or, and it takes the fix that ruling
-- already wrote down: DECLARE the lane so the generator owns both the rule and the key.
--
-- 🚨 NOTHING WIDENS. `client_anonymous_excluded_columns` below is exactly the set of columns `anon`
-- does NOT hold today, read live from pg_attribute before this file was written, so
-- `iam.apply_table_grants` re-issues the nine-column ACL unchanged and
-- `pnpm check:anon-column-surface` stays green without touching ANON_COLUMN_SURFACE's column list.
-- What is new is one policy: `pub_read ... using (deleted_at is null and visibility = 'public')`.
-- A row that is not public, or is archived, is exactly as unreachable as it was five minutes ago.
--
-- 🚨 WHY THE OPT-IN AND NOT data_class = 'public'. The table is `confidential`: a saved heatmap is
-- somebody's own data set and most rows will never be shared. R12's chair ruling (2026-09-22) is
-- precisely for this shape — a row marked visibility = 'public' IS an anonymous read lane by
-- definition, per table, explicit, default false — so the table keeps its class and its emergency
-- door and publishes only what its owner ticked.
--
-- 🚨 `iam.apply_rls` KEEPS BESPOKE POLICIES. heatmap_saves carries two hand-written ones
-- (`heatmap_saves_user_id_is_the_caller_insert` / `_update`, another lane's guard); the generator
-- drops only names in `iam.generated_policy_names()` and raises a notice naming what it kept.
-- Nothing of that lane's work is removed here.
--
-- ADDITIVE: one UPDATE to platform.entity_types plus one canonical regeneration of one table.
-- Inverse: migrations/inverse/deadkeys_the_public_heatmap_link_gets_its_rule.inverse.sql
-- Proof:   a signed-out probe on the publishable key answers 200 WITH the public row, and
--          `select=user_id` on the same table still answers 42501.

set local lock_timeout = '5s';

update platform.entity_types
   set client_anonymous_public_read = true,
       client_anonymous_public_read_reason =
         'The shared heatmap link: rows marked visibility = ''public'' are rendered to signed-out visitors at /free/zip-code-heatmap/[id] (app/(public)/free/zip-code-heatmap/[id]/page.tsx reads .schema("workbench").from("heatmap_saves") with the browser client and names the nine columns pinned in lib/security/public-exposure.ts#ANON_COLUMN_SURFACE; its layout.tsx reads title/description for the page metadata). SaveHeatmapModal.tsx writes that visibility and tells the person the link is public. MEASURED 2026-09-22: the grant was live and NO policy reached anon, so every such link answered "unavailable" to a signed-out visitor -- the lane is declared here so the rule exists and the generator owns it. Lane DEAD-KEYS, 2026-09-22.',
       client_anonymous_excluded_columns =
         array['user_id','organization_id','created_by','updated_by','version','metadata','custom_fields']
 where schema_name = 'workbench' and table_name = 'heatmap_saves' and is_active;

-- ── THE RULE AND THE KEY, BOTH FROM THE GENERATOR ────────────────────────────
-- `iam.apply_rls` is the one place `pub_read` is emitted (it asks `iam.class_lanes`, which now
-- answers the opt-in), and it calls `iam.apply_table_grants` itself. Hand-writing the policy beside
-- the generator is not an option: the next regeneration drops it.

do $$
declare
  r record;
begin
  select et.schema_name, et.table_name, et.token, et.rls_variant
    into r
    from platform.entity_types et
   where et.schema_name = 'workbench' and et.table_name = 'heatmap_saves' and et.is_active;
  if r.token is null then
    raise exception 'DEAD-KEYS: workbench.heatmap_saves is not an active registered token — nothing was generated.';
  end if;
  perform iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
end $$;
