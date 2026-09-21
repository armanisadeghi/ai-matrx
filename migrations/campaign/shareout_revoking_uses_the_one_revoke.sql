-- chair-step: this replaces the body of custom.table_share_outside_revoke, a live client door, so the judge cannot read what the statement will do from its allow-list
-- based-on: custom.table_share_outside_revoke(uuid, uuid) 3e41ec8bb14f8f1b9bfe71192aa79eabeb1087214cb558dd689691677c00f016
--
-- SHARE-OUT item 1 — THE REVOKE WROTE A STATUS THE COLUMN DOES NOT HOLD.
--
-- CAUGHT BY THE SEAT SUITE, on the real data, at clause 9:
--
--   ERROR: new row for relation "permissions" violates check constraint
--          "permissions_status_check"
--   CHECK (status = ANY (ARRAY['active','pending','rejected']))
--
-- The door set `status = 'revoked'`, which is not one of the three words that column
-- holds. So the revoke raised — meaning the outside person's access could NOT be taken
-- away through the door built to take it away, which is the worst possible half of this
-- feature to get wrong.
--
-- 🚨 AND THE REAL DEFECT IS BIGGER THAN THE TYPO: there was a SECOND revoke. The platform
-- already has one — `custom.share_revoke` — and it does not write a status at all: it
-- DELETES the grant row, which is what a share being taken back means here, and its
-- `zzz_history_grant_capture` trigger writes the history in the same statement. A door
-- that hand-wrote its own UPDATE beside it was a second answer to one question, and it
-- was the wrong answer. Fixing the word would have left the second implementation
-- standing. Fixing the class removes it.
--
-- WHAT CHANGES. `custom.table_share_outside_revoke` now CALLS `custom.share_revoke` —
-- one revoke, one history row, one set of words — and handles its "nothing to take back"
-- refusal as the ordinary case it is for an invitation nobody has accepted yet.
--
-- WHAT DOES NOT CHANGE: every identity check above it, and the fact that this one
-- statement ends the outside person's reach into the organization entirely, because the
-- grant IS the admission (`custom.portal_admits` arm 2).
--
-- THE INVERSE: `migrations/inverse/shareout_revoke_down.sql`.

create or replace function custom.table_share_outside_revoke(p_organization_id uuid, p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_inv     iam.invitations;
  v_removed integer := 0;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_share_outside_revoke');
  perform custom.assert_store_door(p_organization_id, 'custom.table_share_outside_revoke');

  select * into v_inv from iam.invitations
   where id = p_invitation_id and organization_id = p_organization_id
     and target_type = 'custom_table' and deleted_at is null;
  if not found then
    raise exception 'There is no such invitation to a table in this organization.'
      using errcode = '02000';
  end if;
  perform custom.assert_client_may_change(p_organization_id, v_inv.target_id,
            'custom.table_share_outside_revoke', 'admin'::public.permission_level, 'table');

  -- 🚨 THE GRANT GOES FIRST AND IT GOES COMPLETELY, THROUGH THE ONE REVOKE.
  -- `custom.share_revoke` is the platform's revoke: it deletes the grant row and its
  -- history trigger records the act in the same statement. Because the grant IS the
  -- admission (`custom.portal_admits` arm 2), this ends their access to the table, to
  -- every record in it, and to this organization's doors — there is no second row to
  -- forget. Anything they still had open refuses on its next call.
  --
  -- An invitation nobody accepted has no grant, and `share_revoke` says so with 02000.
  -- That is not a failure here: withdrawing an unaccepted invitation is an ordinary act
  -- and the sentence below says exactly what happened.
  if v_inv.invited_user_id is not null then
    begin
      perform custom.share_revoke(p_organization_id, v_inv.target_id, 'person', v_inv.invited_user_id);
      v_removed := 1;
    -- 02000 is `share_revoke`'s own "there is no share here to take back from them".
    exception when sqlstate '02000' then
      v_removed := 0;
    end;
  end if;

  update iam.invitations
     set status = 'revoked', deleted_at = now(),
         updated_by = custom.query_principal(), updated_at = now()
   where id = v_inv.id;

  return jsonb_build_object(
    'revoked', true, 'invitation_id', v_inv.id, 'email', v_inv.email,
    'grants_removed', v_removed,
    'say', case when v_removed > 0
                then format('%s can no longer open this table. Their access ended immediately — anything they had open refuses the next time it asks.', v_inv.email)
                else format('%s''s invitation is withdrawn. They had not joined, so they never had access to take away.', v_inv.email) end);
end;
$fn$;
