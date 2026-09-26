-- A single flashcard can be picked — and so linked to a study-guide passage (the RC-B11 brief's main
-- case). education.fc_card was registered to link (fc_card → note / document, anchored_to) but was not
-- reference_pickable and had no title column, so every picker refused to list cards. A card's name,
-- as a person sees it, is its front.
-- Census of kinds registered to link into a note/document but not listable (2026-09-26):
--   fc_card  → fixed here (title = front).
--   document → stays unpickable: content.document also holds PRIVATE annotation documents, and
--              reference_candidate_predicates can only express equality, not "not the annotation type";
--              listing documents needs a host lister that excludes that type (register it, don't flip this).
--   record   → stays unpickable: custom.record's title lives in data->>'name', not a column; it needs a
--              host listCandidates, not a title_column.

set local lock_timeout = '2s';

update platform.entity_types
   set title_column = 'front', reference_pickable = true
 where token = 'fc_card' and (title_column is distinct from 'front' or not reference_pickable);
