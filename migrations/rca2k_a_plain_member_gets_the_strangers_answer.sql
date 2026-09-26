-- based-on: public.access_denied_context(text, uuid) ff3f16427d52e3938882db288eed32b9c09f860d9d700ab9553d8b2514f5c3b3
--
-- RC-A2 round 4 (register row RC-A2), the chair's ruling (2026-09-26) on public.access_denied_context,
-- replacing the discoverability test rca2j put in: A PLAIN MEMBER OF THE RECORD'S ORGANIZATION WHO
-- CANNOT OPEN IT GETS THE STRANGER'S ANSWER — identical to a missing id: no existence, no title, no
-- owner, no organization, no deletion, no prior request (Google Drive, Notion, Linear, Figma).
-- The full answer stays for exactly four:
--   * the record's owner;
--   * anyone holding a level on it;
--   * anyone who reads an ancestor of it (the nearest-openable-parent walk);
--   * the owners/admins of the ORGANIZATION that holds it — they manage the org's records (the Table
--     transfer offer depends on it; a Google Workspace admin gets the same).
-- So the V24 stranger rule's "member of the object's organization" exception narrows to the
-- organization's owners/admins (public.is_org_admin_for), and rca2j's discoverability arm goes: it
-- would have hidden a record from someone who reads its parent. rca2j's detail rule stays: a comment
-- on a record answered as missing answers as a random comment id (no `via`).
-- Forcing suite: aidream db/tests/test_rca2k_a_plain_member_gets_the_strangers_answer.py.
-- Inverse (rehearsal only): migrations/inverse/rca2k_a_plain_member_gets_the_strangers_answer_down.sql

set local lock_timeout = '2s';

do $patch$
declare
  v_def text := pg_get_functiondef('public.access_denied_context(text,uuid)'::regprocedure);
  v_anchor text := $a$  -- RC-A2j: THE HIDDEN RECORD'S ANSWER IS THE MISSING ANSWER — for a member of its organization
  -- too. Only whoever may discover the row, or an owner/admin of the organization holding it (the
  -- org's own oversight: the Table transfer offer), keeps the full answer.
  if v_uid is not null
     and v_level = 'none'
     and not v_is_owner
     and (
           (v_ancestor_json is null
            and not (v_attrs.o_org is not null and iam.has_org_access_for(v_uid, v_attrs.o_org)))
        or not (iam.is_discoverable(v_uid, v_meta.token, p_id, 'viewer'::public.permission_level)
                or (v_attrs.o_org is not null and public.is_org_admin_for(v_uid, v_attrs.o_org)))
         ) then
$a$;
  v_repl text := $a$  -- RC-A2k (chair ruling 2026-09-26): A PLAIN MEMBER OF THE RECORD'S ORGANIZATION WHO CANNOT OPEN
  -- IT GETS THE STRANGER'S ANSWER. The full answer stays for the owner, anyone holding a level,
  -- anyone reading an ancestor, and the owners/admins of the organization that holds it.
  if v_uid is not null
     and v_level = 'none'
     and not v_is_owner
     and v_ancestor_json is null
     and not (v_attrs.o_org is not null and public.is_org_admin_for(v_uid, v_attrs.o_org)) then
$a$;
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'rca2k patch: anchor occurs % time(s) in public.access_denied_context, expected 1 — nothing was changed', v_n;
  end if;
  execute replace(v_def, v_anchor, v_repl);
end
$patch$;
