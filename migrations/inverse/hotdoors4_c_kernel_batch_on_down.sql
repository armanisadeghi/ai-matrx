-- chair-step: undo hotdoors4_c_kernel_batch_on.sql - switches access/kernel_batch off for everyone (the one-statement revert).
-- lane: HOT-DOORS-4

update platform.feature_knob set value = '{"on": false, "off_for": []}'::jsonb
 where feature = 'access' and key = 'kernel_batch';
