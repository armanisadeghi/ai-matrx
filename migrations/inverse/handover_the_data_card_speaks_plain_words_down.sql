-- chair-step: lane HANDOVER — puts back the Settings → Data card's earlier words on the older_tables and agent_context switches, exactly as they were before handover_the_data_card_speaks_plain_words.sql.

update platform.cutover_seam
   set old_side     = 'The older data tables on /data',
       new_side     = 'The copies in the new record store on /data-v2 (same ids)',
       flip_does    = 'Every older table in this organization is archived (never deleted) and points at its copy, so any link to it opens the copy; the organization''s "tables moved" setting turns on. The copies are untouched.',
       reverse_does = 'Exactly the tables this switch archived come back as they were; the "tables moved" setting goes back to what it was. The copies stay, so switching again carries nothing twice.'
 where seam_key = 'older_tables';

update platform.cutover_seam
   set old_side     = 'The current scopes and context system',
       new_side     = 'The record store''s copy of this organization''s scopes, which follows every edit made in the current screens',
       flip_does    = 'Every agent turn in this organization reads its scopes and context from the record store''s copy. The current scope screens stay where edits are made and the copy keeps following them; nothing is archived at this switch.'
 where seam_key = 'agent_context';
