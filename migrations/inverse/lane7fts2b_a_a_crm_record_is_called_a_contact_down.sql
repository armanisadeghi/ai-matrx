-- inverse of lane7fts2b_a_a_crm_record_is_called_a_contact.sql — party's registry label back to 'Entity'.
set local lock_timeout = '3s';
update platform.entity_types set label = 'Entity' where token = 'party' and label = 'Contact';
