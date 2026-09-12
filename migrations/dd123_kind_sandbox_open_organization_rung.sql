-- DD-123 rollout STEP 0 — open the organization rung on the Shape sandbox gate,
-- and file the `custom` feature so the universal settings screen can render it.
--
-- This is the CURATION migration the seed
-- (`dd123_kind_sandbox_gate_and_ceilings_knobs.sql`) deliberately refused to be:
-- per the feature-knobs SoR, `overridable_by` / `override_direction` /
-- `bound_value` are never in a re-runnable seed's on-conflict list, so opening a
-- rung is always its own recorded decision and a seed re-run can never quietly
-- re-lock it.
--
-- WHAT CHANGES
--
--   custom.sandbox_org_components            overridable_by '{}' → '{organization}'
--                                            override_direction stays 'any'
--   custom.sandbox_frame_height_px           unchanged — stays platform-locked
--   custom.sandbox_expanded_frame_height_px  unchanged — stays platform-locked
--   custom.sandbox_message_bytes             unchanged — stays platform-locked
--
-- WHY THE GATE OPENS NOW. The gate selects which of two render paths an
-- organization's own authored components take. It opens because both proofs the
-- plan named as its preconditions are in: S5 — rendering parity across the live
-- corpus (124 of 139 bodies pixel-identical framed vs in-page, every residual
-- named and attributed: remote-image refusals, animation timing, clock text, and
-- one sub-2% board explained in the B-45 report) — and S6, the real-browser
-- spec that asserts the frame's refusals (connect-src, script-src-elem, img-src)
-- and its isolation (window.top, parent.document, document.cookie, localStorage,
-- sessionStorage all throw; the frame's origin is opaque). An organization that
-- takes this override is choosing a render path that has been measured against
-- its own bodies, and it can put itself back with one cleared row and no deploy.
--
-- WHY THE CEILINGS DO NOT OPEN. `sandbox_frame_height_px`,
-- `sandbox_expanded_frame_height_px` and `sandbox_message_bytes` are blast-radius
-- backstops: a tenant raising them spends the HOST page's layout and the reader's
-- tab memory, not their own. The SoR's "whose number is it?" test answers "not
-- theirs", and the frame's compiled-in copies mean raising one above the shipped
-- constant does nothing anyway. They stay '{}'.
--
-- WHY `override_direction` STAYS 'any'. Direction is only enforced for numeric
-- knobs against the live platform rung; on a boolean it has no meaning beyond
-- "either way", and an organization must be able to move in BOTH directions —
-- onto the framed path, and straight back off it — because "off" is the rollback
-- the whole rollout rests on.
--
-- THE TAXONOMY FILING. `platform.feature_knob.taxonomy_node_id` is what the
-- universal settings UI groups its left nav by; a null lands the key in a "not
-- filed under a domain yet" bucket nobody navigates to on purpose, and
-- `pnpm check:settings-ladder-ui` fails any key with a non-empty
-- `overridable_by` and a null node. All four `custom.*` rows are filed under the
-- EXISTING node platform → custom-data — the same node aidream migration 0631
-- gives `extensibility`, which is the other custom-data knob namespace. No node
-- is invented here (the vocabulary law forbids it) and the node is resolved by
-- slug, never by a pasted uuid.
--
-- WHY THIS FILING IS NOT AN EDIT TO aidream/db/migrations/0631_feature_knob_taxonomy_mapping.sql.
-- That file is ledgered in `public._schema_migrations` with the SHA-256 of the
-- bytes that ran; changing it on disk without re-running it reports as permanent
-- drift in aidream's own applier, and re-running it is a 400-row update to fix
-- four. The DB is the mechanism and the .sql is the record — so this file is the
-- record of these four rows, and 0631 stays the record of the 404 it moved.
-- Re-running 0631 afterwards is a no-op for `custom`: it only touches features
-- named in its own mapping table, and `custom` is not one of them.

update platform.feature_knob
   set overridable_by = '{organization}',
       override_direction = 'any'
 where feature = 'custom'
   and key = 'sandbox_org_components';

update platform.feature_knob k
   set taxonomy_node_id = n.id
  from platform.taxonomy_node n
  join platform.taxonomy_node d on d.id = n.parent_id
 where n.level = 'feature' and n.slug = 'custom-data'
   and d.level = 'domain'  and d.slug = 'platform'
   and k.feature = 'custom'
   and k.key in ('sandbox_org_components', 'sandbox_frame_height_px',
                 'sandbox_expanded_frame_height_px', 'sandbox_message_bytes')
   and k.taxonomy_node_id is distinct from n.id;

-- Verification in the same transaction. A curation migration that opened the
-- wrong rung, opened a ceiling, or left a key unfiled must fail HERE, not on the
-- settings screen in front of a person.
do $$
declare
  v_gate_rung text[];
  v_gate_dir  text;
  v_open_ceilings int;
  v_unfiled int;
  v_node uuid;
begin
  select overridable_by, override_direction into v_gate_rung, v_gate_dir
    from platform.feature_knob
   where feature = 'custom' and key = 'sandbox_org_components';

  if v_gate_rung is distinct from '{organization}'::text[] then
    raise exception 'DD-123 step 0: the gate''s overridable_by is %, not {organization}', v_gate_rung;
  end if;
  if v_gate_dir <> 'any' then
    raise exception 'DD-123 step 0: the gate''s override_direction is %, not any — an organization must be able to move back OFF', v_gate_dir;
  end if;

  -- The rung must be one platform.knob_index can actually build a scope_chain
  -- from; an unregistered kind vanishes from the chain without a word.
  if not exists (select 1 from platform.knob_scope_kind where kind = 'organization') then
    raise exception 'DD-123 step 0: "organization" is not a platform.knob_scope_kind row — knob_index would drop it from every scope_chain silently';
  end if;

  select count(*) into v_open_ceilings
    from platform.feature_knob
   where feature = 'custom'
     and key in ('sandbox_frame_height_px', 'sandbox_expanded_frame_height_px',
                 'sandbox_message_bytes')
     and array_length(overridable_by, 1) is not null;
  if v_open_ceilings <> 0 then
    raise exception 'DD-123 step 0: % ceiling row(s) became overridable — the ceilings are the host page''s blast radius, not tenant policy', v_open_ceilings;
  end if;

  select id into v_node
    from platform.taxonomy_node n
   where n.level = 'feature' and n.slug = 'custom-data'
     and n.parent_id = (select id from platform.taxonomy_node
                         where level = 'domain' and slug = 'platform');
  if v_node is null then
    raise exception 'DD-123 step 0: the taxonomy node platform → custom-data does not exist; the settings screen would have nowhere to render these four keys';
  end if;

  select count(*) into v_unfiled
    from platform.feature_knob
   where feature = 'custom' and taxonomy_node_id is distinct from v_node;
  if v_unfiled <> 0 then
    raise exception 'DD-123 step 0: % custom.* key(s) are not filed under platform → custom-data', v_unfiled;
  end if;
end $$;
