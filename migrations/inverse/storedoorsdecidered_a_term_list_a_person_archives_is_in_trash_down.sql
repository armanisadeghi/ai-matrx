-- chair-step: lane STORE-DOORS-DECIDE-RED. Inverse of storedoorsdecidered_a_term_list_a_person_archives_is_in_trash.sql (rule 27 on the clone): agent term lists stop being a Trash kind. One registry value; no row of agent.term_list is touched.

update platform.entity_types
   set user_artifact_kind = null
 where token = 'agent_term_list'
   and user_artifact_kind = 'agent_term_list';
