-- chair-step: puts the system-rung holder of make.describe_template back on agent version 4 (5df63c1e-e768-45ad-bcd2-622670ac1e18) of "Sentence To Template Builder", undoing makepin_describe_template_holder_follows_v9.sql.
-- lock: mandate
-- lane: MAKE-PIN
update mandate.definition
   set default_holder_version_id = '5df63c1e-e768-45ad-bcd2-622670ac1e18'
 where mandate_key = 'make.describe_template'
   and default_holder_id = '0237fc41-f56a-4cce-91d9-9d96184ffbdd'
   and default_holder_version_id = '6391a4ad-5b34-4bf1-ac7c-f56ad60d1c10';
