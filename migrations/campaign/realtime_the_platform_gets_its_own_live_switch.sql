-- target: branch,production
-- additive: yes
-- seeds-guards: yes
--
-- REALTIME, file 0 — THE SWITCH THAT HOLDS DATABASE BROADCAST OFF.
--
-- The campaign's rule is that every shared object it changes on production lands behind a
-- knob that is OFF. The obvious knob to borrow was `custom/system_enabled`, and borrowing it
-- would have been wrong: the object this lane adds to `realtime.messages` is the ONE RLS
-- policy every future private channel on this platform will be authorized by, and wiring it
-- to the record store's product switch would mean the day somebody turns the store off, the
-- scheduler's channel and every channel after it goes dark with it. A shared primitive gets
-- its own switch or it is not a primitive.
--
-- OFF BY DEFAULT, AND "OFF" HAS A MEANING WORTH SAYING PLAINLY. Today `realtime.messages` has
-- RLS enabled and ZERO policies, so every private channel is already refused — off is exactly
-- the state the platform is in this minute, and this knob is what keeps it there until
-- somebody decides otherwise. There is no OTHER path this turns off: nothing is live to
-- break.
--
-- WHO MAY MOVE IT: nobody below the platform. It is not org-overridable (`overridable_by` is
-- empty) because it is not a preference about one company's data — it is whether this
-- database will authorize a socket at all. (`delegable` is deliberately not named: the
-- rehearsal copy's `platform.feature_knob` does not carry that column yet, and a seed file
-- that only runs on one of the two databases is worse than a column left at its default.)

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation)
values
  ('platform', 'realtime_broadcast_enabled',
   'false'::jsonb, 'false'::jsonb, 'boolean',
   'Live updates from the database',
   'Whether this database authorizes PRIVATE realtime channels at all. When it is off, the one RLS policy on realtime.messages admits nobody and every screen falls back to the state it already has today: a list that updates when you reload it, and a banner that says so. When it is on, a subscriber is admitted to a topic exactly when the schema that owns that topic''s prefix says she may see the thing behind it — the same ladder that schema''s read doors ask, never a second one. It carries no data either way: a broadcast on these topics is a notice naming which ids moved, and the client re-reads them through the ordinary read door.',
   'agent',
   'Off because nothing is live yet: realtime.messages has had RLS enabled and no policies since this database was created, so every private channel is already refused and this knob only keeps that true until the switch file registers a topic prefix. Turned on by lane REALTIME once two browsers have proved a change travels and a non-member is refused.',
   (current_date + 90),
   '{}'::text[], 'any', 'next_load')
on conflict (feature, key) do nothing;
