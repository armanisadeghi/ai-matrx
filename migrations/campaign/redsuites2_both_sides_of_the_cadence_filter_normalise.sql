-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.agg_subscriptions(uuid, uuid, text) 9d72ffa6a25e470984fb6b3c12df90efde1615525f5f97788f3cfff52928b943
--
-- RED-SUITES-2 — BOTH SIDES OF THE CADENCE FILTER GO THROUGH THE NORMALISER.
--
-- MEASURED on the MAIN database on 2026-09-21 through `scripts/campaign-tests/forms_green.sql`
-- clause 1, which declares a subscription with `"cadence": "immediate"` and then asks the
-- store to list it:
--
--   custom.agg_subscriptions(org, null, 'immediate')  ->  0 rows
--   "1: the subscription Rule is invisible to custom.agg_subscriptions (0 rows) — REC-72 is not held"
--
-- The Rule is there. The filter compared a NORMALISED stored value against a RAW argument:
--
--   and (p_cadence is null
--        or custom.agg_cadence_normalize(r.data -> 'subscription' ->> 'cadence') = p_cadence)
--
-- Lane DIGESTS made `instant` the canonical word and `custom.agg_cadence_normalize` maps
-- `immediate`, `instant` and `now` onto it. `custom.subscription_declare` normalises what it
-- WRITES, so the stored side is always canonical — which means the raw argument side can never
-- match anything a person actually typed unless they typed the internal word. The answer was
-- an empty list and no error at all.
--
-- IN THE PRODUCT: any screen or runner that filters an organization's subscriptions by the
-- cadence a person chose in the picker gets nothing back, and nothing says why. Half a
-- normalisation is a silent wrong answer, which is the one thing this campaign exists to end.
--
-- THE CENSUS of every use of the normaliser, so this is the class and not the instance:
--   custom.agg_digest_assemble   v_cadence := normalize(v_sub ->> 'cadence')      — one side, correct
--   custom.agg_digest_due_at     v_cadence := normalize(p_cadence)                — normalises its argument
--   custom.subscription_declare  v_cadence := normalize(p_spec ->> 'cadence')     — normalises on write
--   custom.subscriptions         normalize(... ->> 'cadence') as cadence          — projection, no compare
--   custom.agg_subscriptions     THE ONLY COMPARISON, and the only half-normalised one.
-- It is the only place two cadence spellings are compared, and it is fixed here.
--
-- IT IS ADDITIVE IN EVERY CASE: `normalize('instant') = 'instant'`, so a caller already
-- passing the canonical word sees no change; a caller passing an accepted synonym stops
-- getting an empty list. Nothing becomes visible that `custom.has_visibility` did not already
-- allow — the rest of the body, including every access clause, is byte for byte what was live.
--
-- ITS INVERSE: `migrations/inverse/redsuites2_both_sides_of_the_cadence_filter_normalise_down.sql`.
-- THE SUITE: `scripts/campaign-tests/forms_green.sql` clause 1.

CREATE OR REPLACE FUNCTION custom.agg_subscriptions(p_organization_id uuid, p_saved_view_id uuid DEFAULT NULL::uuid, p_cadence text DEFAULT NULL::text)
 RETURNS TABLE(rule_id uuid, saved_view_id uuid, table_id uuid, cadence text, schedule text, quiet_hours jsonb, channel text, recipient_user_id uuid, event_key text, name text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select r.id,
         nullif(r.data -> 'subscription' ->> 'saved_view_id', '')::uuid,
         nullif(r.data ->> 'scope_table_id', '')::uuid,
         custom.agg_cadence_normalize(r.data -> 'subscription' ->> 'cadence'),
         nullif(r.data -> 'subscription' ->> 'schedule', ''),
         case when jsonb_typeof(r.data -> 'subscription' -> 'quiet_hours') = 'object'
              then r.data -> 'subscription' -> 'quiet_hours' else null end,
         coalesce(r.data -> 'subscription' ->> 'channel', 'in_app'),
         nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid,
         coalesce(r.data -> 'subscription' ->> 'event_key', 'records.changed'),
         coalesce(r.data ->> 'name', 'Subscription')
    from custom.record r
   where r.organization_id = p_organization_id
     and r.data_class = 'rule'
     and r.deleted_at is null
     and r.data ? 'subscription'
     -- SWITCHED OFF MEANS SWITCHED OFF, and this is still the one place that has
     -- to know it: every consumer reads through here, so a muted Rule stops firing
     -- immediately, on every cadence and every channel.
     and coalesce((r.data -> 'subscription' ->> 'muted')::boolean, false) = false
     and (p_saved_view_id is null
          or (r.data -> 'subscription' ->> 'saved_view_id')::uuid = p_saved_view_id)
     -- ── RED-SUITES-2, 2026-09-21: BOTH SIDES OF THIS COMPARISON GO THROUGH THE NORMALISER.
     -- The stored cadence was normalised and the ARGUMENT was not, so a caller who passed a
     -- word the store itself accepts on the way in — `immediate`, `now` — was answered ZERO
     -- ROWS and no error. `custom.subscription_declare` normalises what it writes, so the
     -- stored side is always the canonical word and the raw side can never match anything a
     -- person typed. Half a normalisation is a silent wrong answer.
     -- `custom/system_enabled` is unchanged by this; the switch is read where it always was.
     and (p_cadence is null
          or custom.agg_cadence_normalize(r.data -> 'subscription' ->> 'cadence')
             = custom.agg_cadence_normalize(p_cadence));
$function$


