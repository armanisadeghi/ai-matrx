-- INVERSE of migrations/campaign/readinesscap_the_400_write_cap_is_a_knob.sql

delete from platform.feature_knob where feature = 'cutover' and key = 'readiness_writes_cap';
