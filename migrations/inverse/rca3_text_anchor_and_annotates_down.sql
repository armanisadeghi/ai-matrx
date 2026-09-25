-- chair-step: RC-A3 inverse of rca3_text_anchor_and_annotates — removes the text_anchor validator, its trigger and comment constraint, the text_anchor edge payload kind and the two non-conveying association types. Refuses while any edge or comment carries a text_anchor or uses one of the two pairs.
-- window-class: DROP TRIGGER on platform.associations and DROP CONSTRAINT on platform.comments freeze the 23-relation supautils set for this short transaction; applied in the 1-4 AM PT window.

set local lock_timeout = '5s';

do $$
begin
  if exists (select 1 from platform.associations where payload_kind = 'text_anchor')
     or exists (select 1 from platform.comments where anchor ->> '__kind' = 'text_anchor')
     or exists (select 1 from platform.associations
                 where (source_type, target_type) in (('document', 'document'), ('fc_card', 'document'))) then
    raise exception 'text_anchor payloads or document edges exist; this inverse only removes an unused contract';
  end if;
end $$;

drop trigger trg_associations_validate_text_anchor on platform.associations;
drop function platform._associations_validate_text_anchor();
alter table platform.comments drop constraint comments_text_anchor_is_valid;
drop function platform.text_anchor_problem(jsonb);
delete from platform.edge_payload_kind where kind = 'text_anchor';
delete from platform.association_types
 where (source_type, target_type) in (('document', 'document'), ('fc_card', 'document'));
