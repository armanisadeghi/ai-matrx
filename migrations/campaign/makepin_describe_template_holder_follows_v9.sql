-- chair-step: moves the system-rung holder of the mandate make.describe_template (Make: Sentence to Template) from agent version 4 (5df63c1e-e768-45ad-bcd2-622670ac1e18) of "Sentence To Template Builder" to its newest version 9 (6391a4ad-5b34-4bf1-ac7c-f56ad60d1c10), so the /make describe box runs the current prompt (sample rows, reminders, declared output). One row of mandate.definition, one column (default_holder_version_id); no table, column, policy or function is touched. Guarded: only moves when the row still holds version 4. Inverse: migrations/inverse/makepin_describe_template_holder_follows_v9_down.sql.
-- lock: mandate
-- lane: MAKE-PIN
update mandate.definition
   set default_holder_version_id = '6391a4ad-5b34-4bf1-ac7c-f56ad60d1c10'
 where mandate_key = 'make.describe_template'
   and default_holder_id = '0237fc41-f56a-4cce-91d9-9d96184ffbdd'
   and default_holder_version_id = '5df63c1e-e768-45ad-bcd2-622670ac1e18';
