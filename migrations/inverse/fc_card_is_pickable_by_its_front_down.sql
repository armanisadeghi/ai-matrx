-- chair-step: rule-27 inverse of fc_card_is_pickable_by_its_front.sql — single flashcards are unpickable again (no picker lists them; a card cannot be linked to a passage).

set local lock_timeout = '2s';

update platform.entity_types
   set title_column = null, reference_pickable = false
 where token = 'fc_card';
