-- chair-step: lane STORE-DOORS-DECIDE-RED. Agent term lists become a Trash kind: a person archives a term list themselves (the agent builder's Archive, aidream DELETE /term-lists/{id}), so it is listed in their Trash and their organization's Trash and restored through public.entity_undelete at the editor rung. One registry value; no body, table or row is touched.
--
-- WHY. `pnpm check:trash-doors` flagged `entity:agent_term_list` — "has archived rows but is not in
-- Trash". The standing rule (TRASH-COVERAGE, Arman 2026-09-20 "soft-delete everything important"):
-- if a person can archive it themselves it is in Trash with its own restore; if it is derived data that
-- only its source restores, it is listed under the source. A term list is the first kind: the builder's
-- AgentTermListsManager archives it (features/agents/term-lists/service.ts archiveTermList) and so does
-- the server door (aidream services/term_lists/service.py archive_term_list), and nothing but Trash can
-- bring it back. Its attachments to agents are tombstoned by the platform cascade with the same stamp,
-- so the generic restore brings them back with it.
--
-- MEASURED BEFORE WRITING (production, rolled back): with the value set, public._trash_kind_rows lists
-- the newest archived list for its owner (personal mode) and in its organization's Trash (organization
-- mode), and public.entity_undelete('agent_term_list', <id>) from the owner's authenticated seat
-- restores it (deleted_at back to null).
--
-- The scrape_parsed_page half of the same finding is excused, not registered: it is the web identity
-- row of a Source and is trashed and restored with that Source (aidream 1240's soft-delete edge); the
-- Source (processed_document) is the Trash kind. Reason recorded in scripts/lib/trash-doors.ts.
-- INVERSE: migrations/inverse/storedoorsdecidered_a_term_list_a_person_archives_is_in_trash_down.sql

do $kind$
declare
  v_n int;
begin
  if exists (select 1 from platform.entity_types e
              where e.user_artifact_kind = 'agent_term_list' and e.token <> 'agent_term_list') then
    raise exception 'storedoorsdecidered: agent_term_list is already another entity''s Trash kind';
  end if;
  update platform.entity_types e
     set user_artifact_kind = e.token
   where e.token = 'agent_term_list'
     and e.user_artifact_kind is null;
  get diagnostics v_n = row_count;
  if not exists (select 1 from platform.entity_types e
                  where e.token = 'agent_term_list' and e.user_artifact_kind = 'agent_term_list' and e.is_active) then
    raise exception 'storedoorsdecidered: agent_term_list is not a Trash kind after the update (% row(s) changed)', v_n;
  end if;
end
$kind$;
