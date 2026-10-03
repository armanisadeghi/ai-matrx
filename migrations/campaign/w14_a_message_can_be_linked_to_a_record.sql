-- target: production
-- additive: yes
-- lane: INTEGRATION
-- lock: platform
--
-- v6 LANE 3 INTEGRATION · W1.4 — "LINK A RECORD…" REACHES A MESSAGE.
--
-- THE USE CASE. A front-desk coordinator at Cedar Ridge Physical Therapy gets a direct message
-- from a patient ("Can we move Thursday's session?") and links it to the patient's row in the
-- Referral Intake Queue table, so the record shows the conversation that changed its visit.
-- The right-click verb "Link a record…" offers only the kinds the relationship registry lets link
-- into the target (public.association_link_sources); `dm_message` had no registered pair at all,
-- so a message's picker said nothing could be linked.
--
-- WHAT IT ADDS. Two platform.association_types rows, record → dm_message and dm_message → record,
-- container_side 'none', conveying viewer at most and no access by themselves — the shape SC-R
-- and W2.2 seeded every record pair with. Label NULL (open), so the link's own `anchored_to` role
-- is kept. Nothing is granted, revoked, dropped or replaced; no function body changes. One
-- reachability rebuild at commit (platform.trg_reachability_on_rules), as W2.2's insert did.
-- SIDE EFFECT, SAID: record → dm_message also lists "Direct Message" among the kinds an
-- entity-reference Field may name (custom.entity_reference_kinds reads the same registry); its
-- picker cannot list one (dm_message is not reference_pickable), so nothing new can be chosen.
-- Inverse: `migrations/inverse/w14_a_message_can_be_linked_to_a_record_down.sql`.

set local statement_timeout = '120s';

insert into platform.association_types
  (source_type, target_type, label, container_side, conveys_max, is_active, notes)
select p.source_type, p.target_type, null, 'none', 'viewer'::public.permission_level, true,
       'W1.4 (2026-10-03): "Link a record…" links a message and a store record (anchored_to); '
       || 'conveys no access.'
  from (values ('record', 'dm_message'), ('dm_message', 'record')) as p(source_type, target_type)
  join platform.entity_types e on e.token = 'dm_message' and e.is_active
 where not exists (
   select 1 from platform.association_types a
    where a.source_type = p.source_type and a.target_type = p.target_type
 )
on conflict do nothing;
