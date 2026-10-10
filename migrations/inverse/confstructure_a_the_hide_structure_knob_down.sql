-- chair-step: lane CONF-STRUCTURE inverse - removes the access/confidential_hides_structure knob row (run only after confstructure_b's inverse).

delete from platform.feature_knob where feature = 'access' and key = 'confidential_hides_structure';
