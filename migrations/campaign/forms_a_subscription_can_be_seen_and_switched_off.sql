-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.agg_subscriptions(uuid, uuid, text) ad8d72f6266f31311e72aa6a57e5eff4a5b634cc1a336a7258c5e66ff49ea9f6
--
-- LANE FORMS — A NOTIFICATION NOBODY COULD SEE AND NOBODY COULD TURN OFF.
--
-- MEASURED 2026-09-20 by this lane's own seat suite, which is the first thing that ever
-- tried: `custom.agg_subscriptions` — DOOR-18's ONE reader of subscriptions — holds no
-- EXECUTE grant for `authenticated` and no row in `platform.client_callable_door`. So a
-- person could be subscribed to something (a form's notify Rule subscribes them the moment
-- an agent writes it) and had **no way to find out**, and no way to stop it. Notifications
-- arriving from a rule you cannot list is the shape of a product people learn to distrust.
--
-- THIS FILE ADDS THE TWO ACTS A PERSON NEEDS AND NOTHING ELSE:
--
--   custom.subscriptions(org, table_id?)   — what am I subscribed to here, and (if I hold
--                                            admin on the Table) what is anyone subscribed
--                                            to over it.
--   custom.subscription_mute(org, rule, on) — stop telling me. It is a Rule edit, but NOT
--                                            an admin act: a notification addressed to you
--                                            is yours to switch off, and making a person
--                                            ask an administrator to stop being paged is
--                                            how an organization ends up with a rule nobody
--                                            reads and nobody can kill.
--
-- THE LADDER, EXACTLY:
--   · the organization wall first (`custom.assert_client_may_reach`);
--   · the LIST is narrowed to Tables the caller can already open
--     (`custom.query_visible_ids` over the Table kernel) — a subscription list is not a
--     second way to learn that a Table exists;
--   · within those, a member sees the subscriptions ADDRESSED TO THEM, and somebody holding
--     `admin` on the scope Table sees every subscription over it. `mine` says which is
--     which, so a screen never has to guess whose a row is;
--   · MUTE is the recipient's own act, or an admin's on that Table. Anyone else is refused
--     by name.
--
-- AND THE MUTE IS HONOURED IN ONE PLACE, WHICH IS WHY THIS FILE REPLACES
-- `custom.agg_subscriptions` RATHER THAN FILTERING IN THE NEW DOORS. That function is the
-- single reader every consumer goes through — `custom.agg_subscription_fire` (immediate),
-- `custom.agg_digest_run` (the Monday summary) and this lane's own `custom.form_notify`.
-- Teaching the READER about `muted` makes "switched off" true everywhere at once. Filtering
-- in the list door instead would have produced the worst possible screen: one that says a
-- subscription is off while it keeps firing.
--
-- The replaced body is byte-for-byte what was there plus one `and` in the WHERE clause.
--
-- THE INVERSE: `migrations/inverse/forms_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── the ONE reader learns what `muted` means ─────────────────────────────────
create or replace function custom.agg_subscriptions(p_organization_id uuid,
                                                    p_saved_view_id uuid default null,
                                                    p_cadence text default null)
returns table(rule_id uuid, saved_view_id uuid, cadence text, schedule text,
              channel text, recipient_user_id uuid, event_key text, name text)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select r.id,
         nullif(r.data -> 'subscription' ->> 'saved_view_id', '')::uuid,
         coalesce(r.data -> 'subscription' ->> 'cadence', 'immediate'),
         nullif(r.data -> 'subscription' ->> 'schedule', ''),
         coalesce(r.data -> 'subscription' ->> 'channel', 'in_app'),
         nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid,
         coalesce(r.data -> 'subscription' ->> 'event_key', 'records.changed'),
         coalesce(r.data ->> 'name', 'Subscription')
    from custom.record r
   where r.organization_id = p_organization_id
     and r.data_class = 'rule'
     and r.deleted_at is null
     and r.data ? 'subscription'
     -- SWITCHED OFF MEANS SWITCHED OFF, and this is the one place that has to know it:
     -- every consumer of a subscription reads through here, so a muted Rule stops firing
     -- immediately, on every cadence and every channel, rather than a screen claiming it
     -- is off while it keeps paging somebody.
     and coalesce((r.data -> 'subscription' ->> 'muted')::boolean, false) = false
     and (p_saved_view_id is null
          or (r.data -> 'subscription' ->> 'saved_view_id')::uuid = p_saved_view_id)
     and (p_cadence is null
          or coalesce(r.data -> 'subscription' ->> 'cadence', 'immediate') = p_cadence);
$fn$;

-- ── what am I subscribed to here ─────────────────────────────────────────────
create function custom.subscriptions(p_organization_id uuid, p_table_id uuid default null)
returns table(rule_id uuid, name text, table_id uuid, saved_view_id uuid,
              cadence text, schedule text, channel text, recipient_user_id uuid,
              event_key text, muted boolean, mine boolean, i_may_mute boolean)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.subscriptions');
  return query
    select r.id,
           coalesce(r.data ->> 'name', 'Subscription'),
           (r.data ->> 'scope_table_id')::uuid,
           nullif(r.data -> 'subscription' ->> 'saved_view_id', '')::uuid,
           coalesce(r.data -> 'subscription' ->> 'cadence', 'immediate'),
           nullif(r.data -> 'subscription' ->> 'schedule', ''),
           coalesce(r.data -> 'subscription' ->> 'channel', 'in_app'),
           nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid,
           coalesce((r.data -> 'subscription' ->> 'muted')::boolean, false),
           nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid is not distinct from v_me,
           (nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid is not distinct from v_me)
             or custom.has_visibility(v_me, 'record', (r.data ->> 'scope_table_id')::uuid,
                                      'admin'::public.permission_level)
      from custom.record r
     where r.organization_id = p_organization_id
       and r.data_class = 'rule'
       and r.deleted_at is null
       and r.data ? 'subscription'
       and (p_table_id is null or (r.data ->> 'scope_table_id')::uuid = p_table_id)
       -- A subscription list is NOT a second way to learn that a Table exists.
       and (r.data ->> 'scope_table_id')::uuid in
             (select v from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v)
       -- Mine, or — holding admin on the Table it is about — anyone's over that Table.
       and (nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid is not distinct from v_me
            or custom.has_visibility(v_me, 'record', (r.data ->> 'scope_table_id')::uuid,
                                     'admin'::public.permission_level))
     order by coalesce(r.data ->> 'name', 'Subscription');
end;
$fn$;

comment on function custom.subscriptions(uuid, uuid) is
  'DOOR-18: what this person is being told about, and — where they hold admin on the Table — what anyone is. Narrowed to Tables the caller can already open, so it never reveals a Table. `mine` says whose a row is and `i_may_mute` says whether the switch is offered, so a screen never shows a control that would be refused.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'subscriptions',
        'p_organization_id uuid, p_table_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. The rows are then narrowed twice: to Tables in custom.query_visible_ids for THIS caller, so a subscription can never reveal a Table, and within those to the subscriptions addressed to the caller plus — only where custom.has_visibility says admin on that Table — anyone''s over it. A p_table_id from another tenant returns zero rows. It returns no record and no payload.',
        'forms_a_subscription_can_be_seen_and_switched_off.sql',
        null, true, false)
on conflict do nothing;

-- ── stop telling me ──────────────────────────────────────────────────────────
create function custom.subscription_mute(p_organization_id uuid, p_rule_id uuid,
                                         p_muted boolean default true)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me    uuid := custom.query_principal();
  v_rule  custom.record;
  v_who   uuid;
  v_table uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.subscription_mute');
  select * into v_rule from custom.record r
   where r.organization_id = p_organization_id and r.id = p_rule_id
     and r.data_class = 'rule' and r.deleted_at is null;
  if not found or not (v_rule.data ? 'subscription') then
    raise exception 'There is no subscription % here.', p_rule_id
      using errcode = '23503',
            hint = 'It may have been removed, or it may belong to another organization — organizations are hard walls (REC-29).';
  end if;

  v_who := nullif(v_rule.data -> 'subscription' ->> 'recipient_user_id', '')::uuid;
  v_table := (v_rule.data ->> 'scope_table_id')::uuid;

  -- YOUR OWN NOTIFICATION IS YOURS TO SWITCH OFF. Requiring an administrator for that is
  -- how an organization ends up with a rule nobody reads and nobody can kill. Somebody
  -- else's is an admin act on the Table it is about, which is where that authority lives.
  if v_who is distinct from v_me
     and not custom.has_visibility(v_me, 'record', v_table, 'admin'::public.permission_level) then
    raise exception 'That notification is not addressed to you, so you cannot switch it off.'
      using errcode = '42501',
            hint = 'A notification you receive is always yours to stop. Switching off somebody else''s takes the admin level on the table it is about — ask whoever holds it.';
  end if;

  update custom.record
     set data = jsonb_set(data, '{subscription,muted}', to_jsonb(coalesce(p_muted, true)), true),
         updated_at = now(), version = version + 1
   where organization_id = p_organization_id and id = p_rule_id;
  return coalesce(p_muted, true);
end;
$fn$;

comment on function custom.subscription_mute(uuid, uuid, boolean) is
  'DOOR-18: stop (or restart) one subscription. The recipient''s own act, because a notification addressed to you is yours to switch off; somebody else''s takes admin on the Table it is about. The switch is read by custom.agg_subscriptions, which is the ONE reader every consumer goes through, so off means off on every cadence and every channel at once.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'subscription_mute',
        'p_organization_id uuid, p_rule_id uuid, p_muted boolean',
        array['uuid'::regtype, 'uuid'::regtype, 'bool'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. p_rule_id is matched together with the organization and with data_class = ''rule'', so another tenant''s rule reads as absent and is refused by name. The caller is then either the subscription''s own recipient — a notification addressed to you is yours to stop — or holds admin on the Table the Rule is about, checked by custom.has_visibility; anyone else is refused by name. It changes ONE key of ONE Rule and touches no record.',
        'forms_a_subscription_can_be_seen_and_switched_off.sql',
        null, true, false)
on conflict do nothing;
