-- chair-step: undo kernel_shadow_d_set_form_on.sql - every store door answers from the one-at-a-time access kernel again (same answers, slower)
-- lane: KERNEL-SHADOW
update platform.feature_knob
   set value = '{"on": false, "off_for": []}'::jsonb, updated_at = now()
 where feature = 'access' and key = 'kernel_set_form';
