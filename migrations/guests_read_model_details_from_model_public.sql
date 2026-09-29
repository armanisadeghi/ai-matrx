-- A signed-out guest reads a model's details from the public model catalog (2026-09-29).
--
-- THE DEFECT
-- ----------
-- A guest running a public app at /p/<slug> (or any signed-out chat surface) opens a model's
-- details — its controls and constraints — through `fetchModelById`, which read
-- `ai.model_config`. DD-186 (dd186_anon_columns_views.sql) revoked `anon` from that view on the
-- premise "no signed-out reader in any repository" — false for /p/<slug>. On 2026-09-27 the
-- client stopped asking for guests (commit 7222e2d370), so a guest's model details never showed.
--
-- THE FIX — the ai.model_public pattern, not a widening of ai.model_config
-- -----------------------------------------------------------------------
-- `ai.model_public` is the world-readable model catalog: an owner-rights view (T-35j) whose
-- `anon` grant is bounded column by column (DD-186), so a new column is closed until named.
-- The resolved `controls` / `constraints` a model's settings panel needs are public, non-
-- sensitive facts (no endpoint, vendor, translator or price data — the same masking
-- ai.model_config documents), produced by the SECURITY DEFINER `ai.resolve_model_config`.
-- They are appended to ai.model_public as plain select-list expressions — the planner drops
-- them when a reader does not select them, so the catalog list pays nothing for them — and
-- granted to `anon` by name. ai.model_config stays closed to `anon` and runs as its caller.
--
-- CREATE OR REPLACE VIEW replaces reloptions, and provision_shape_guard refuses a (re)created
-- view that is not security_invoker=true — so the view is replaced as an invoker view and then
-- returned, inside this one transaction, to the owner-rights mode T-35j gave it
-- (access_ladder_t35j_dollars_and_infrastructure_are_admin_only.sql, the same ALTER). Existing
-- columns keep their order, types and column grants.

create or replace view ai.model_public with (security_invoker = true) as
 SELECT m.id,
    m.name,
    m.common_name,
    m.capabilities,
    m.context_window,
    m.max_tokens,
    m.is_primary,
    m.is_premium,
    m.mid_fallback_id,
    m.guest_fallback_id,
    m.release_date,
    m.description,
    m.cost_rating,
    m.speed_rating,
    p.name AS maker,
    o.usage_basis,
    o.token_billed,
    (ceil(((((o.pricing -> 0) ->> 'input_price'::text))::numeric * (20000)::numeric)))::bigint AS points_per_million_input,
    (ceil(((((o.pricing -> 0) ->> 'output_price'::text))::numeric * (20000)::numeric)))::bigint AS points_per_million_output,
    COALESCE(m.is_deprecated, false) AS is_deprecated,
    m.retired_at,
    m.successor_id,
    (ai.resolve_model_config(m.id) -> 'controls'::text) AS controls,
    (ai.resolve_model_config(m.id) -> 'constraints'::text) AS constraints
   FROM ((ai.model_definition m
     JOIN ai.provider p ON ((p.id = m.provider_id)))
     LEFT JOIN LATERAL ( SELECT o1.pricing,
            o1.usage_basis,
            o1.token_billed
           FROM (ai.offering o1
             JOIN ai.endpoint e ON (((e.id = o1.endpoint_id) AND (e.deleted_at IS NULL) AND e.is_active)))
          WHERE ((o1.model_id = m.id) AND (o1.deleted_at IS NULL) AND o1.is_available)
          ORDER BY o1.priority, o1.created_at, o1.id
         LIMIT 1) o ON (true))
  WHERE (m.deleted_at IS NULL);

alter view ai.model_public set (security_invoker = false);

grant select (controls, constraints) on ai.model_public to anon, authenticated;
