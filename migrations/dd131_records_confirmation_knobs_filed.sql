-- DD-131 — file the eight `records.confirmation.*` knobs (B-40a, seeded
-- 2026-09-12 16:46:03Z) under the platform → custom-data taxonomy node, so
-- the universal settings screen has somewhere to render them.
--
-- WHY THIS MIGRATION EXISTS. `pnpm check:settings-ladder-ui` (B-45 §7.1,
-- verified again live by B-49 before this file ran) failed all eight
-- `records.confirmation.*` keys as UNFILED: `platform.feature_knob
-- .taxonomy_node_id` was null on every one of them, which lands a key in a
-- "not filed under a domain yet" bucket nobody navigates to on purpose. B-40a
-- seeded the eight keys (aidream migration `wf_043_dd131_confirmation_phase0
-- .sql`) but did not file them — filing is a curation decision distinct from
-- the seed, the same reasoning `dd123_kind_sandbox_open_organization_rung
-- .sql`'s header gives for `custom.*`.
--
-- WHY `platform → custom-data`. `records.confirmation.*` governs whether a
-- CUSTOM record (a row an agent or a human authored into a table under the
-- Data Doctrine's custom-data machinery) is treated as "born confirmed" or
-- needs a human's word before it counts — that is a custom-data policy, not a
-- new domain. It is the SAME node `dd123_kind_sandbox_open_organization_rung
-- .sql` files `custom.*` under and aidream migration 0631 gives
-- `extensibility`: one home for the platform's custom-data knob namespaces,
-- not a fourth. No taxonomy node is invented here (the vocabulary law
-- forbids it) — the node is resolved by slug, never a pasted uuid, exactly as
-- the DD-123 migration does it.
--
-- WHAT THIS MIGRATION DOES NOT TOUCH. The `table`/`agent` rung NAMES the
-- universal settings UI needs to render `overridable_by` are a UI-vocabulary
-- change (`lib/scoped-config/types.ts` / `ladder.ts` / `features/settings
-- /universal/scopeRows.ts`), not a database filing — done alongside this
-- migration in the same commit, not in it. The three `unfolding.*` keys
-- (seeded 2026-09-12 16:59:14Z, no git-tracked source — see B-49's report)
-- belong to a different lane's feature and are out of scope here.

update platform.feature_knob k
   set taxonomy_node_id = n.id
  from platform.taxonomy_node n
  join platform.taxonomy_node d on d.id = n.parent_id
 where n.level = 'feature' and n.slug = 'custom-data'
   and d.level = 'domain'  and d.slug = 'platform'
   and k.feature = 'records'
   and k.key like 'confirmation.%'
   and k.taxonomy_node_id is distinct from n.id;

-- Verification in the same transaction. A curation migration that filed the
-- wrong keys, filed them under the wrong node, or left one behind must fail
-- HERE, not on the settings screen in front of a person.
do $$
declare
  v_node   uuid;
  v_unfiled int;
  v_filed   int;
begin
  select id into v_node
    from platform.taxonomy_node n
   where n.level = 'feature' and n.slug = 'custom-data'
     and n.parent_id = (select id from platform.taxonomy_node
                         where level = 'domain' and slug = 'platform');
  if v_node is null then
    raise exception 'DD-131 filing: the taxonomy node platform → custom-data does not exist; the settings screen would have nowhere to render these eight keys';
  end if;

  select count(*) into v_unfiled
    from platform.feature_knob
   where feature = 'records' and key like 'confirmation.%'
     and taxonomy_node_id is distinct from v_node;
  if v_unfiled <> 0 then
    raise exception 'DD-131 filing: % records.confirmation.* key(s) are not filed under platform → custom-data', v_unfiled;
  end if;

  select count(*) into v_filed
    from platform.feature_knob
   where feature = 'records' and key like 'confirmation.%'
     and taxonomy_node_id = v_node;
  if v_filed <> 8 then
    raise exception 'DD-131 filing: expected 8 records.confirmation.* keys filed, found %; B-40a''s seed count may have changed underneath this migration', v_filed;
  end if;
end $$;
