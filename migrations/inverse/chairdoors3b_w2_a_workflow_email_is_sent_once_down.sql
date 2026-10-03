-- chair-step: undo chairdoors3b_w2_a_workflow_email_is_sent_once.sql: drops crm.sending_claim and its entity_types row. Every claim the server made is forgotten, so a replayed workflow email could send twice again until the table exists.
-- lane: CHAIR-DOORS-3B
delete from platform.entity_types where token = 'crm_sending_claim';
drop table if exists crm.sending_claim;
