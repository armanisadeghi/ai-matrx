-- chair-step: lane HANDOVER — the owner's Settings → Data card says what each per-organization switch means in plain words: no web paths (/data, /data-v2), no "(same ids)", no internal setting names ("tables moved" setting), no "record store". Copy only: four text columns of two platform.cutover_seam rows (older_tables, agent_context). No function, grant, check or prerequisite changes.
-- lane: HANDOVER
-- INVERSE: migrations/inverse/handover_the_data_card_speaks_plain_words_down.sql
--
-- THE USE CASE. The owner of Cedar Ridge Physical Therapy opens Settings → Data to switch her
-- organization over. The card read "The older data tables on /data", "The copies in the new record
-- store on /data-v2 (same ids)" and "the organization's "tables moved" setting turns on": web paths,
-- an engineering note and a setting's internal name, on the one screen an owner reads before she
-- presses. The same facts, said the way a person says them.
-- Guard: the card's own jest suite reads these rows' words through the board
-- (features/unified-data/cutover/__tests__/the-data-card-shows-what-holds-the-switch-first.test.tsx
-- asserts no internal key on the card); this file is copy.

update platform.cutover_seam
   set old_side     = 'Tables are kept in the old system.',
       new_side     = 'Tables live in the new system. Every old link opens the same table there.',
       flip_does    = 'Every old table is archived (never deleted) and points to its copy in the new system, so any link to it opens the copy. The copies are not changed.',
       reverse_does = 'Exactly the tables this switch archived come back as they were. The copies stay, so switching again copies nothing twice.'
 where seam_key = 'older_tables';

update platform.cutover_seam
   set old_side     = 'Agents read their context from the current scope screens.',
       new_side     = 'Agents read their context from the new system''s copy, which follows every edit.',
       flip_does    = 'Every agent in this organization reads its scopes and context from the new system''s copy. Edits are still made in the scope screens and the copy follows them; nothing is archived.'
 where seam_key = 'agent_context';
