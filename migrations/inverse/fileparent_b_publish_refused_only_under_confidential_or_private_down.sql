-- lane: FILE-PARENT-NARROW
-- based-on: files._record_children_follow_their_record() 39a9391fab1c1126e626d42d06193d7ed0e3e3f2d89c996a8d89985ba948e0dd
-- Inverse of migrations/campaign/fileparent_b_publish_refused_only_under_confidential_or_private.sql: restores the
-- FILE-PARENT-TRUTH body that refuses a published file under ANY store row.

create or replace function files._record_children_follow_their_record()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
begin
  if new.parent_record_type = 'record' and coalesce(new.published_to_web, false) then
    raise exception using
      errcode = '42501',
      message = 'A file under a table row follows its row; it cannot be published on its own.',
      detail  = format('file %s, row %s', new.id, new.parent_record_id),
      hint    = 'Publish the row, or share the file with the people who need it. To attach a published file to a row, unpublish it first.';
  end if;
  return new;
end;
$fn$;
