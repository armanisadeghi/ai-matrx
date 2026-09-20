-- chair-step: one INSERT into platform.shareable_resource_registry, which IS a registry table by every definition the additive allow-list uses but is not one of the eight that list names, so the runner refuses it at production — the same class, and the same loud route, as w1_prov_closed_declares_custom_closed.sql. Without this row public.permissions_validate_resource_type refuses every grant on a record and "who could see this record on that date" replays to nobody forever while reading green. The rehearsed file is headed `-- target: branch` because the night it was written was branch-only; the owner's 2026-09-18 ruling replaced that, and these are its bytes with the header changed and nothing else.
--
-- 🚨 WHY THIS FILE IS `-- target: branch` AND NOT `branch,production`, WHICH IS A HANDOFF,
--    NOT A CHOICE. `scripts/lib/migration-target.ts` allows an INSERT only into the eight
--    tables in its `REGISTRY_INSERT_TABLES` list (platform.feature_knob, knob_override,
--    knob_rung_lock, entity_types, entity_relationships, client_callable_door,
--    campaign_watch.build_lock, campaign_watch.go_signal_capture).
--    `platform.shareable_resource_registry` is not among them, so a header naming production
--    is refused by name — measured 2026-09-18, the exact refusal quoted in this lane's report.
--    That list belongs to `W0-TGT-FE`, which owns the judge and its corpus, and a builder lane
--    does not widen another lane's allow-list to let its own file through (rule 2's floor, and
--    the reason `pnpm check:migration-judgment` runs the corpus through BOTH runners). So the
--    production half of VIS-16's grant replay is HANDED OVER, in these words: either
--    `platform.shareable_resource_registry` joins that allow-list with its own corpus fixture,
--    or this INSERT goes to production as a chair step with the inverse below. Until one of
--    those happens, `history.who_could_see` on production answers "nobody" for every record,
--    and this file is why we know that rather than a thing we find out later.
--
-- W3-HIST, part nine — VIS-16 CANNOT BE PROVEN BECAUSE A RECORD CANNOT BE SHARED AT ALL.
--
-- WHAT WAS MEASURED (branch, 2026-09-18, running scripts/campaign-tests/w3_hist_c17.sql PART 6)
-- --------------------------------------------------------------------------------------------
--   ERROR:  permissions.resource_type=record is not a registered sharing TOKEN.
--   CONTEXT: PL/pgSQL function permissions_validate_resource_type() line 7
--
-- `history.who_could_see` replays grants through `history.grants_at('record', …)`, and
-- `record` IS the entity token for `custom.record` — `platform.entity_types` carries exactly
-- that row (token `record`, schema `custom`, table `record`, measured 2026-09-18). But
-- `platform.shareable_resource_registry` had NO row for it, and
-- `public.permissions_validate_resource_type` refuses an `iam.permissions` row whose
-- `resource_type` is not in that registry. So on both databases, today:
--
--   · no grant on a record of the campaign's store can be WRITTEN at all;
--   · therefore `history.grants_at('record', …)` can only ever return nothing;
--   · therefore VIS-16 — "who could see R on D, including principals who have since lost
--     access" — answers "nobody", confidently, forever, and reads GREEN while doing it.
--
-- That is the failure this campaign's own rules call the worst kind: not a refusal, an empty
-- answer with a query's confidence. It is a different class from this lane's brief and it
-- BLOCKS this lane's exit, so rule 20 says fix it and name it prominently. It is named here.
--
-- THE NEAR MISS, AND WHY IT IS NOT THE ANSWER. `custom_record` IS registered — but it points
-- at `platform.custom_record`, a different, deprecated table (`W7-DEPR-PLAT` retires it). A
-- grant written under that token would be stored and then silently ignored by `iam.has_access`
-- for a row in `custom.record`, which is precisely the bug `permissions_validate_resource_type`
-- exists to kill. Registering the real token is the fix; reusing the near one is the bug.
--
-- WHAT THIS FILE DOES, AND ITS BLAST RADIUS. ONE INSERT into a registry table (the allow-list's
-- own shape), `on conflict do nothing`, describing `custom.record` exactly as the catalogue
-- already describes it. It grants nothing, opens no door and changes no policy: registration
-- makes the token EXPRESSIBLE; whether any particular grant may be created stays where it
-- already lives. `rls_uses_has_permission` is false because schema `custom`'s read path is
-- `W4-DOOR`'s, not the generic `has_permission` arm — this row must not quietly enrol
-- `custom.record` in a second access mechanism.
--
-- ITS PROOF is `scripts/campaign-tests/w3_hist_c17.sql` PART 6, which writes a grant on a
-- record, revokes it, and reads it back for the date it was live. Its RED twin deactivates
-- this row and watches the grant refused and the replay go empty.

insert into platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, display_label,
   url_path_template, rls_uses_has_permission, is_active, is_scopeable, is_link_shareable,
   organization_id, visibility, notes)
values
  ('record', 'custom', 'record', 'id', 'created_by', 'Record',
   '', false, true, false, false,
   '39c38960-d30c-4840-b0c1-c9960de95582', 'public',
   'W3-HIST / VIS-16, 2026-09-18. The entity token for custom.record (platform.entity_types.token = ''record''). Without this row public.permissions_validate_resource_type refuses every grant on a record, so "who could see this on that date" replayed to "nobody" forever while reading green. Registration makes the token EXPRESSIBLE only: rls_uses_has_permission is FALSE because schema custom reads through W4-DOOR, not the generic has_permission arm.')
on conflict (resource_type) do nothing;
