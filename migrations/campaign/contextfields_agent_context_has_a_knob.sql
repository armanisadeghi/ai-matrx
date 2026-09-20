-- target: branch,production
-- additive: yes
-- seeds-guards: yes
--
-- CONTEXT-FIELDS — AGENT CONTEXT IS A RAMP CONSUMER, LIKE THE GRID AND THE EXTENSION.
--
-- WHAT THIS IS FOR. A context item IS a Field and a scope IS a Record (DYNAMIC-VALUES
-- §D), so an agent's context can resolve out of the unified record store through the
-- read door, under the operating person's own principal, with the triple and a
-- provenance row per value. That path is built. This file gives it the ONE thing that
-- makes shipping it safe: its own rung on the ramp everybody else already rides.
--
-- WHY A RUNG AND NOT A CUTOVER. The existing context system keeps working for every
-- current agent — that is the ruling, and turning the old path off is the owner's call.
-- While this knob is false the resolver declares exactly what it declared yesterday and
-- reads the values the context RPC resolved, byte for byte. While it is true, a context
-- item resolves from the store with the RPC's own answer sitting underneath it as the
-- fallback link, so even an organization that has flipped it cannot LOSE a value: a
-- scope that is not a Record yet simply answers from the fallback and the provenance row
-- says `fallback_1`.
--
-- WHY IT SHARES RUNG 3 WITH SCOPES, AND THAT IS NOT AN OVERSIGHT. Agent context reads
-- SCOPE values. It cannot honestly be on before scopes are, so it belongs in the same
-- batch (`scopes_education_checkout`) at the same order rather than at a rung of its own
-- that would imply it could be ramped independently.
--
-- IDEMPOTENT. `on conflict do nothing`, like every other ramp knob. The register's own
-- row for this consumer is the SECOND file
-- (`contextfields_the_register_names_agent_context.sql`): replacing a live view body is
-- a chair step by this runner's allow-list, and a knob nobody has flipped is not, so
-- they are two files rather than one refused one.

set lock_timeout = '3s';
set statement_timeout = '2min';

-- ────────────────────────────────────────────────────────────── 1. THE KNOB

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'consumer_context_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Ramp: agent context reads the unified store',
   'CUT-3''s ramp, one consumer. While false an agent''s context items resolve exactly as '
   'they do today, from public.resolve_full_context. While true each context item resolves '
   'as what it is — a Field of the Record its scope is — through the store''s read door '
   'under the operating person''s own principal, carrying its version and a provenance row, '
   'with the RPC''s own value as the fallback link so no value can be lost by flipping it.',
   'agent', 'Unified data campaign CONTEXT-FIELDS, 2026-09-20: context items are Fields.',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;
