-- chair-step: RC-A3 inverse of rca3_anchor_triggers_cover_sets_and_comments — the edge trigger runs for single text_anchor payloads only again, and platform.comments loses its target check (the structural CHECK stays).
-- window-class: DROP/CREATE TRIGGER on platform.associations and DROP TRIGGER on platform.comments freeze the 23-relation supautils set for this short transaction; applied in the 1-4 AM PT window.
-- based-on: trigger trg_associations_validate_text_anchor on platform.associations b0499f459fceaf52525aebd2f23fba94aa2636748c9e2c43b85d76f79f3fbbba

set local lock_timeout = '5s';

drop trigger trg_comments_validate_text_anchor on platform.comments;
drop trigger trg_associations_validate_text_anchor on platform.associations;
create trigger trg_associations_validate_text_anchor
  before insert or update of payload, payload_kind on platform.associations
  for each row when (new.payload_kind = 'text_anchor')
  execute function platform._associations_validate_text_anchor();
