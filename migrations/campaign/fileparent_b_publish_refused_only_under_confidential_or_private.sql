-- lane: FILE-PARENT-NARROW
-- based-on: files._record_children_follow_their_record() 575b66e5b206f599f83320c237ad4d033625a3f42daf4a4dcb52916c92199f08
--
-- FILE-PARENT-NARROW (2026-10-09): narrow the FILE-PARENT-TRUTH publish refusal to what the access ladder says.
-- The ladder: Private and Confidential records have no Shown to and are never published to the web. The first trigger
-- body refused ANY published file under ANY store row. Now it refuses only when the parent row's Table is Confidential
-- or Private; a published file under an Organization- or Public-level row is allowed as before.
-- Read answers are unchanged (this is a write-time check only; the trigger itself is not touched, only the function body).
-- The parent row is looked up with definer rights: the writer may not be able to read the row, and an unreadable or
-- missing parent must not decide the answer by accident (missing parent = no Table level found = allowed).
--
-- Revert: migrations/inverse/fileparent_b_publish_refused_only_under_confidential_or_private_down.sql

create or replace function files._record_children_follow_their_record()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
-- FILE-PARENT-NARROW (2026-10-09): publishing a child is refused only under a Confidential or Private Table's row
-- (access ladder: those levels are never published). Runs after _a0_t13_dual_write, so published_to_web is the one
-- publish lane (T-13).
declare
  v_level text;
begin
  if new.parent_record_type = 'record' and coalesce(new.published_to_web, false) then
    select t.data ->> 'level' into v_level
      from custom.record r
      join custom.record t on t.id = r.table_id and t.data_class = 'table'
     where r.id = new.parent_record_id;
    if v_level in ('confidential', 'private') then
      raise exception using
        errcode = '42501',
        message = format('A file under a %s table row follows its row; it cannot be published.', v_level),
        detail  = format('file %s, row %s', new.id, new.parent_record_id),
        hint    = 'Share the file with the people who need it. To attach a published file to this row, unpublish it first.';
    end if;
  end if;
  return new;
end;
$fn$;
