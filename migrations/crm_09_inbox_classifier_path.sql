-- crm_09_inbox_classifier_path.sql
--
-- Point the inbox classifier accessors at the path the server ACTUALLY writes.
--
-- crm_08 was built while aidream's reply ingester was still in flight, against
-- an assumed `attributes.inbound_classification`. The ingester shipped writing
-- `attributes.outreach_inbound` instead
-- (aidream/services/outreach_inbound/service.py, the inbound crm.interaction
-- insert).
--
-- 🚨 The failure this repairs was SILENT. Nothing errors when a jsonb path
-- misses: `#>>` simply returns NULL. Every real reply would have rendered
-- "Unclassified" in the inbox, the classification facet would have been
-- permanently empty, and the Chasebox label filters would have matched nothing
-- -- while every test, type-check and dead-end gate stayed green, because the
-- only fixture that ever exercised these functions was written against the
-- assumption rather than against the writer.
--
-- The real path goes FIRST; the two never-written names are kept as tolerant
-- fallbacks so an older row (if one exists) still resolves. Rename on the
-- server => change these two functions and features/crm/inbox/attributes.ts in
-- the SAME commit.

CREATE OR REPLACE FUNCTION public.crm_inbound_label(p_attributes jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(btrim(coalesce(
    p_attributes #>> '{outreach_inbound,label}',
    p_attributes #>> '{inbound_classification,label}',
    p_attributes #>> '{classification,label}',
    ''
  )), '');
$$;
GRANT EXECUTE ON FUNCTION public.crm_inbound_label(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_inbound_evidence(p_attributes jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(btrim(coalesce(
    p_attributes #>> '{outreach_inbound,evidence}',
    p_attributes #>> '{inbound_classification,evidence}',
    p_attributes #>> '{classification,evidence}',
    ''
  )), '');
$$;
GRANT EXECUTE ON FUNCTION public.crm_inbound_evidence(jsonb) TO authenticated;
