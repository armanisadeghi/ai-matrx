-- lane: ANON-LANES
-- DD-249 / R12 — THE FOUR (PLUS ONE) ANONYMOUS READ LANES NOBODY HAD CENSUSED, RULED.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHAT DOORS-ONLY-5 LEFT BEHIND, AND WHAT THIS ANSWERS
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- `iam.apply_table_grants` learned to ISSUE the opt-in anonymous read grant on 2026-09-21 and
-- said out loud that it never withdraws one, because the withdrawal would have taken away four
-- live anonymous lanes that lane had not censused. This file is that census's verdict, and its
-- twin `anonlanes_the_optin_withdraws_an_undeclared_lane.sql` is the withdrawal.
--
-- THE MEASUREMENT (main database, 2026-09-21, SELECT-only). Ten active tokens carry an `anon`
-- SELECT grant while their class resolves NO anonymous lane. Five of them also carry a live
-- `pub_read` policy naming `anon` with the predicate `deleted_at IS NULL AND visibility =
-- 'public'` — a rule AND a key, i.e. a working anonymous lane with rows behind it:
--
--   app.definition           81 public rows   /p/[slug] renders a published agent app to a
--                                             signed-out visitor (app/(public)/p/[slug]/page.tsx
--                                             reads .schema("app").from("definition") with the
--                                             cookie-bound SSR client, which carries no cookie
--                                             when nobody is signed in).
--   education.learn_doc      11 public rows   features/education/publishing/queries.ts builds its
--                                             client with getScriptSupabaseClient() — the
--                                             publishable key, no cookies, therefore `anon` — and
--                                             serves /education/learn/**, its sitemap and its OG
--                                             images from a cache.
--   agent.message_template    8 public rows   the indexable public viewer /p/e/message_template/[id]
--                                             (app/(public)/p/e/loadPublicResource.ts), which names
--                                             its columns from utils/permissions/publicLane.ts.
--   workbench.notes           2 public rows   the same public viewer at /p/e/note/[id].
--   canvas.canvas_items     (shared lane)     the shared-view path a signed-out visitor reaches on
--                                             /s/[token] and /canvas/shared (canvasArtifactService).
--
-- All five are ALREADY DECLARED, with measured reasons and exact column lists, in
-- `lib/security/public-exposure.ts#ANON_COLUMN_SURFACE` — the release gate that fails when the
-- live anon column grant and that list differ in EITHER direction. So the intent was recorded;
-- what was missing is that the DATABASE's own generator knew nothing about it, and the access was
-- living on hand-written column ACLs that nothing regenerates. That is the `platform.categories`
-- shape exactly, and it takes the `platform.categories` fix: DECLARE the lane per table so
-- `iam.apply_table_grants` owns the grant.
--
-- 🚨 NOTHING WIDENS HERE. Every `client_anonymous_excluded_columns` array below is the set of
-- columns `anon` does NOT hold TODAY, read live from `pg_attribute` before this file was written.
-- The generator's output is byte-identical to the ACLs it takes over. This declares what is
-- already true; it does not publish one new column or one new row.
--
-- 🚨 WHY THE SET IS DECLARED AND NOT INFERRED (db-rules §6d-2): `ADD COLUMN` leaves `attacl`
-- NULL, so a generator that inferred the excluded set from the live ACLs would hand every future
-- column to anonymous readers the day somebody added one.
--
-- canvas.canvas_items was not in this lane's brief. It is declared anyway because it is the same
-- shape, on the same evidence, and leaving it out would arm the twin file's withdrawal against a
-- live shared-artifact page the next time anything regenerated that table. Saying that here is
-- cheaper than a landmine.
--
-- THE TENTH TOKEN, platform.feature_knob, is NOT declared here: its lane is a hand-written
-- `feature_knob_read_anon` gated on a `public_read` boolean, on a `private`-class `system` table —
-- a different shape whose canonicalisation or withdrawal is its own ruling. It takes a row in
-- `platform.anon_lane_pending_withdrawal` in the twin file instead.
--
-- The remaining four (extend.wbx_capture, ui.ui_surface_agent_pref, ui.ui_surface_config,
-- workbench.heatmap_saves) hold an `anon` column grant with NO SELECT-capable policy reaching
-- `anon` at all — a key with no door, which can never return a row. The twin file's generator
-- revokes those on sight.
--
-- ADDITIVE: this file is five UPDATEs to `platform.entity_types` plus one `iam.apply_table_grants`
-- call per table, which re-issues the grants the tables already hold.
-- Inverse: migrations/inverse/anonlanes_five_public_lanes_declare_the_optin.inverse.sql
-- Proof:   scripts/campaign-tests/doorsonly5_the_anon_lane_is_optin_only.sql (8/8)

set local lock_timeout = '5s';

update platform.entity_types
   set client_anonymous_public_read = true,
       client_anonymous_public_read_reason =
         'The published agent-app page: 81 rows marked visibility = ''public'' are rendered to signed-out visitors at /p/[slug] (app/(public)/p/[slug]/page.tsx reads .schema("app").from("definition") through the cookie-bound SSR client, which is `anon` when nobody is signed in) and by the get_aga_public_data RPC behind the same page. The lane has been live on 47 hand-written anon column ACLs and is declared in lib/security/public-exposure.ts#ANON_COLUMN_SURFACE; this declares it so the generator owns it. Lane ANON-LANES, 2026-09-21.',
       client_anonymous_excluded_columns =
         array['organization_id','version','metadata','created_by','updated_by','custom_fields']
 where schema_name = 'app' and table_name = 'definition' and is_active;

update platform.entity_types
   set client_anonymous_public_read = true,
       client_anonymous_public_read_reason =
         'The public learn-doc library: 11 rows marked visibility = ''public'' are served to signed-out readers at /education/learn/**, in its sitemap and in its OG images. features/education/publishing/queries.ts builds its client with getScriptSupabaseClient() — the publishable key, no cookies, therefore the `anon` role — and projects LEARN_DOC_PUBLIC_SELECT, which lib/security/public-exposure.test.ts pins to the declared column list. Lane ANON-LANES, 2026-09-21.',
       client_anonymous_excluded_columns =
         array['organization_id','created_by','updated_by','version','metadata','custom_fields']
 where schema_name = 'education' and table_name = 'learn_doc' and is_active;

update platform.entity_types
   set client_anonymous_public_read = true,
       client_anonymous_public_read_reason =
         'The indexable public resource viewer: 8 rows marked visibility = ''public'' are rendered to signed-out visitors at /p/e/message_template/[id] by app/(public)/p/e/loadPublicResource.ts, which names its columns from utils/permissions/publicLane.ts#PUBLIC_LANE_COLUMNS rather than selecting *. DD-226 already narrowed the grant to exactly what that page renders. Lane ANON-LANES, 2026-09-21.',
       client_anonymous_excluded_columns =
         array['metadata','organization_id','created_by','updated_by','version','deleted_at','custom_fields']
 where schema_name = 'agent' and table_name = 'message_template' and is_active;

update platform.entity_types
   set client_anonymous_public_read = true,
       client_anonymous_public_read_reason =
         'The indexable public resource viewer: rows marked visibility = ''public'' (2 today) are rendered to signed-out visitors at /p/e/note/[id] by app/(public)/p/e/loadPublicResource.ts, which names its columns from utils/permissions/publicLane.ts#PUBLIC_LANE_COLUMNS. The matrx-extend notes client holds the publishable key before its user signs in and reads the same lane. Lane ANON-LANES, 2026-09-21.',
       client_anonymous_excluded_columns =
         array['metadata','organization_id','version','created_by','updated_by','content_preview','custom_fields']
 where schema_name = 'workbench' and table_name = 'notes' and is_active;

update platform.entity_types
   set client_anonymous_public_read = true,
       client_anonymous_public_read_reason =
         'The shared canvas artifact: rows marked visibility = ''public'' are rendered to signed-out visitors on /s/[token] and /canvas/shared through canvasArtifactService.getById / .getBySource. `version` is deliberately readable there (features/canvas/core/CanvasBody.tsx keys its render on it) per migrations/dd186_canvas_item_version_is_public.sql. Not in lane ANON-LANES'' brief; declared because it is the same shape on the same evidence and the withdrawal twin would otherwise disarm it. 2026-09-21.',
       client_anonymous_excluded_columns =
         array['user_id','organization_id','created_by','updated_by','metadata','custom_fields']
 where schema_name = 'canvas' and table_name = 'canvas_items' and is_active;

-- ── THE GRANT BECOMES THE GENERATOR'S OUTPUT ──────────────────────────────────
-- A declaration that nothing acts on is a flag that answers nothing — the "door with no key"
-- shape DD-249 measured on 223 tables. `iam.apply_table_grants` is the one place every
-- provisioning path funnels its table grants through, so calling it here is what makes the
-- hand-written ACLs the generator's output. It re-issues the grants these tables already hold and
-- touches no policy.

do $$
declare
  r record;
begin
  for r in
    select et.schema_name, et.table_name, et.rls_variant
      from platform.entity_types et
     where et.is_active
       and coalesce(et.client_anonymous_public_read, false)
       and (et.schema_name, et.table_name) in
           (('app','definition'),('education','learn_doc'),('agent','message_template'),
            ('workbench','notes'),('canvas','canvas_items'))
  loop
    perform iam.apply_table_grants(r.schema_name, r.table_name, r.rls_variant);
  end loop;
end $$;
