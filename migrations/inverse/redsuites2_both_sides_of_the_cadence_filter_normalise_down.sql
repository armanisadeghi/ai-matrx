-- chair-step: it restores `custom.agg_subscriptions` to the body it had before RED-SUITES-2,
--   in which the cadence filter compared a normalised stored value against a raw argument. One
--   function body, nothing else.
--
-- Running this re-opens a silent wrong answer: filtering subscriptions by any accepted synonym
-- of a cadence returns an empty list and no error.

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
     and (p_cadence is null
          or custom.agg_cadence_normalize(r.data -> 'subscription' ->> 'cadence') = p_cadence);
$function$


