-- chair-step: inverse of migrations/campaign/hr360_observers_visible_to_per_meeting.sql (lane HR-360) — observers_visible_to back to organization-only.
update platform.feature_knob set overridable_by = array['organization'] where feature = 'meet' and key = 'observers_visible_to';
