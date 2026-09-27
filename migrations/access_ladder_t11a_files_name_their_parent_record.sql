-- lane: access-ladder T-11, step 0 (T-13's precondition), part a: a file can name the record it
-- belongs to, and a file that does is that record's child.
--
-- Law: common-docs/policies/access-ladder.md ("Children inherit their parent"): an AI chat's
-- attachments are the chat's; a child never carries a level of its own. `files.files` is an
-- Organization table, and today the only thing keeping the attachments of Private AI chats and the
-- raw artifacts of Confidential coding sessions away from coworkers is `visibility = 'personal'`.
-- T-11 step 4 stops `personal` from locking on Organization tables, so first every such file names
-- its parent here, and the org lanes of the access kernel skip a row that names one (T-11 step 4,
-- `platform.child_parent_columns`). The file then answers to its owner, its own shares, and — when
-- the parent is readable — never to the organization at large.
--
-- Why not a `platform.entity_relationships` composition edge: an edge only ADDS the parent's
-- readers to a row that keeps its own organization lanes; it cannot hold a row to its parent. And
-- why not the reference gate (RC-A2c): it would ask the kernel about the parent on every one of
-- ~68k coding-session artifacts inside `iam.accessible_entity_ids('file')`, for every files read.
--
-- One table per transaction: this file takes a lock on files.files only (a nullable column with no
-- default and a NOT VALID check are catalog-only; the trigger needs SHARE ROW EXCLUSIVE for
-- milliseconds). Part b validates the check; parts c/d add the writers on chat.coding_session,
-- chat.message and platform.associations, each its own file.
set local lock_timeout = '2s';

alter table files.files
  add column if not exists parent_record_type text,
  add column if not exists parent_record_id uuid;

alter table files.files
  add constraint files_parent_record_shape
  check (
    (parent_record_type is null and parent_record_id is null)
    or (parent_record_type in ('conversation', 'coding_session', 'file'))
  ) not valid;

comment on column files.files.parent_record_type is
  'Access ladder T-11: the kind of record this file belongs to (conversation = an AI chat''s '
  'attachment or output; coding_session = a coding session''s raw artifact; file = a variant of '
  'another file). Set = this file is a CHILD: it has no organization lane of its own and is read by '
  'its owner, its own shares, and its parent''s readers only. NULL = an ordinary file. A '
  'coding-session artifact whose session record does not exist (yet, or any more) carries the type '
  'with a NULL id and stays its owner''s. Written by triggers, never by clients.';
comment on column files.files.parent_record_id is
  'Access ladder T-11: the id of the record named by parent_record_type (see that column).';

-- ── The declaration the kernel reads: which columns name a row's parent ─────────────────────────
-- A plain CASE with no SET clause so the planner inlines it (the kernel asks it on every node).
create or replace function platform.child_parent_columns(p_token text)
returns text[]
language sql
immutable
as $function$
  -- Access ladder T-11: THE DECLARATION — the one list. A row of this token whose FIRST column is
  -- set is a child of the record the two columns name: iam.has_access_for_base,
  -- iam.accessible_entity_ids and iam.entity_read_expr give such a row no organization lane of its
  -- own (owner, grants and containment are unchanged). Add a token only with a forcing test.
  select case p_token
           when 'file' then array['parent_record_type', 'parent_record_id']
         end
$function$;

comment on function platform.child_parent_columns(text) is
  'Access ladder T-11: (type column, id column) naming a row''s parent record for the tokens whose '
  'rows may be children of another record (a file attached to an AI chat). A row with the type '
  'column set has no organization lane of its own.';

-- ── The writer every insert passes: variants follow their source, coding artifacts their session ─
create or replace function files._stamp_parent_record()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_parent_type text;
  v_session uuid;
begin
  if new.parent_record_type is not null then
    return new;
  end if;
  -- A variant (a resized image, a thumbnail, a converted page) is its source file's child when the
  -- source is itself a child: it shows exactly what the source shows.
  if new.parent_file_id is not null then
    select f.parent_record_type into v_parent_type
      from files.files f where f.id = new.parent_file_id;
    if v_parent_type is not null then
      new.parent_record_type := 'file';
      new.parent_record_id := new.parent_file_id;
      return new;
    end if;
  end if;
  -- A coding session's raw artifact (commands, environment values, tool output) is the session's.
  -- When the session record is not there yet the type alone is set: the file is a child with no
  -- readable parent, which keeps it its owner's; chat.coding_session's insert trigger fills the id.
  if new.artifact_kind = 'coding_session_artifact' then
    select c.id into v_session
      from chat.coding_session c
     where c.created_by = new.created_by
       and c.provider = coalesce(new.metadata ->> 'provider', 'claude_code')
       and c.provider_session_id = new.provider_session_id
       and c.deleted_at is null
     limit 1;
    new.parent_record_type := 'coding_session';
    new.parent_record_id := v_session;
  end if;
  return new;
end;
$function$;

comment on function files._stamp_parent_record() is
  'Access ladder T-11: on insert, a variant of a child file becomes that file''s child, and a '
  'coding-session artifact becomes its session''s child (type only until the session exists).';

create trigger _stamp_parent_record
  before insert on files.files
  for each row execute function files._stamp_parent_record();
