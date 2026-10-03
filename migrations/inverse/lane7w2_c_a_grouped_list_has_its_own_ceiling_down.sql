-- chair-step: the inverse of lane7w2_c_a_grouped_list_has_its_own_ceiling.sql. It deletes the one
-- knob row that file added.

DELETE FROM platform.feature_knob WHERE feature = 'lists' AND key = 'group_rows_ceiling';
