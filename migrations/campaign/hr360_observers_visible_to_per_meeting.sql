-- HR-360: meet.observers_visible_to may be set for ONE meeting (the meet_meeting rung)
-- lane: HR-360
--
-- A host says "observers are shown to hosts only" for one meeting through
-- communication.meet_policy_set(meeting, 'observers_visible_to', '"hosts"'); the 360 review meeting
-- does. Read by aidream services/meet/observer.py at the meeting's rung.
-- Inverse: migrations/inverse/hr360_observers_visible_to_per_meeting_down.sql.

update platform.feature_knob
   set overridable_by = array['organization', 'meet_meeting']
 where feature = 'meet' and key = 'observers_visible_to'
   and not ('meet_meeting' = any(overridable_by));
