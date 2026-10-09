-- inverse of share_edit_content_documents_and_entity_seat.sql
-- chair-step: rollback of edit_content on Spaces pages; the owner of lane SHARE-EDIT-CONTENT decides.
-- WHAT IT DOES NOT UNDO: the enum value; the entity_seat_level branch is removed below.
drop trigger if exists _a00_guard_edit_content_structure on content.document;
drop function if exists iam._guard_edit_content_structure();
do $patch$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef(to_regprocedure('custom.entity_seat_level(uuid,text,uuid)'));
  v_new := regexp_replace(v_def, $rx$\s+if iam\.has_access\(t\.token, p_record_id, 'edit_content'::public\.permission_level\) then\s+return 'edit_content'::public\.permission_level;\s+end if;$rx$, '');
  if v_new = v_def then raise exception 'SHARE-EDIT-CONTENT inverse: entity_seat_level carries no edit_content branch; nothing changed'; end if;
  execute v_new;
end
$patch$;
