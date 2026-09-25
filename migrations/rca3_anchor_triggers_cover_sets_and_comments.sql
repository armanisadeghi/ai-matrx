-- window: trigger/index DDL on platform.associations (hot, supautils-set freeze) — 1-4 AM PT only
-- RC-A3 (verification evidence/verify-RC-A1-A3.md F1/F2), the trigger half — APPLY IN THE 1-4 AM PT WINDOW:
--   * the edge trigger also runs for payload_kind text_anchor_set, so an explicit set is checked
--     anchor by anchor against its document exactly like a single anchor;
--   * platform.comments gets the same target check for a text_anchor (the body,
--     platform._comments_validate_text_anchor, landed with rca3_anchors_check_their_target).
-- window-class: DROP/CREATE TRIGGER on platform.associations and CREATE TRIGGER on platform.comments freeze the 23-relation supautils set for this short transaction; applied in the 1-4 AM PT window.
-- based-on: trigger trg_associations_validate_text_anchor on platform.associations 238ee9e45f7704218dcde758a0a4991845eb5c4c0e7a442874546a97083aae07

set local lock_timeout = '5s';

drop trigger trg_associations_validate_text_anchor on platform.associations;
create trigger trg_associations_validate_text_anchor
  before insert or update of payload, payload_kind on platform.associations
  for each row when (new.payload_kind in ('text_anchor', 'text_anchor_set'))
  execute function platform._associations_validate_text_anchor();

create trigger trg_comments_validate_text_anchor
  before insert or update of anchor on platform.comments
  for each row when (new.anchor ->> '__kind' = 'text_anchor')
  execute function platform._comments_validate_text_anchor();
