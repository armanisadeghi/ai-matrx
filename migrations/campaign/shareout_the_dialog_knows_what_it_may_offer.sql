-- chair-step: this replaces the body of custom.table_share_outside, a live client door, so the judge cannot read what the statement will do from its allow-list
-- based-on: custom.table_share_outside(uuid, uuid) a69e9b287918e60eb52dae2509e58d54218af11daffd0a6135841c365fda981f
--
-- SHARE-OUT item 1 — A CONTROL IS ABSENT OR HONEST, NEVER DEAD.
--
-- Building the dialog against the first version of this door turned up two places where
-- the screen would have had to GUESS, and a guessing screen is how dead controls happen:
--
-- 1. "Sharing with people outside is turned off here." Fine — and then what? The remedy is
--    one switch, and for an owner or an administrator of the organization it is one click.
--    But the screen had no way to know whether THIS viewer is one of them, so it would
--    have drawn a "Turn it on" button for everybody and let the knob door refuse half of
--    them: a button that looks live and is not. The door now answers `may_open_lane`, so
--    the button is drawn for the people who can use it and the others read one sentence
--    saying who to ask.
--
-- 2. The level picker. `custom.table_share_outside_invite` caps every share at the
--    sharer's own level — nobody hands out Admin who does not hold it — so a picker
--    offering all four levels to an editor offers two that will be refused on submit.
--    The door now answers `my_level` and `levels`: exactly the rungs this person may give,
--    each with the word a person reads, straight from `custom.share_levels()` — never a
--    list the screen made up.
--
-- Neither changes a decision. Both are the same answers the write doors already give, said
-- one step earlier so no control is ever drawn that cannot work.
--
-- THE INVERSE: `migrations/inverse/shareout_dialog_offer_down.sql`.

create or replace function custom.table_share_outside(p_organization_id uuid, p_table_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_lane   boolean;
  v_mine   boolean;
  v_rows   jsonb;
  v_who    text;
  v_role   text;
  v_mylvl  public.permission_level;
  v_levels jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_share_outside');
  -- Seeing who else has been given this table is part of seeing the table.
  perform custom.assert_client_may_open(p_organization_id, p_table_id,
            'custom.table_share_outside', 'viewer'::public.permission_level, 'table');

  v_lane := coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false);
  v_mine := custom.may_invite_outside(p_organization_id, p_table_id);
  v_who  := coalesce(platform.knob_resolve('custom', 'outside_invite_who', p_organization_id) #>> '{}',
                     'org_admins_and_table_owners');

  select m.role into v_role
    from iam.organization_member m
   where m.organization_id = p_organization_id and m.user_id = custom.query_principal();

  v_mylvl := custom.effective_level(custom.query_principal(), p_organization_id, p_table_id, 'record');

  -- THE RUNGS THIS PERSON MAY GIVE, capped at the one they hold, in the store's own
  -- words. `custom.share_levels()` is where those words live; nothing here invents any.
  select coalesce(jsonb_agg(jsonb_build_object('level', l.level, 'label', l.label, 'means', l.means)
                            order by l.ordinal), '[]'::jsonb)
    into v_levels
    from custom.share_levels() l
   where v_mylvl is not null and l.level <= v_mylvl;

  select coalesce(jsonb_agg(jsonb_build_object(
           'invitation_id', i.id,
           'email',         i.email,
           'level',         coalesce(i.metadata ->> 'level', 'viewer'),
           'level_label',   iam.level_label('table', coalesce(i.metadata ->> 'level', 'viewer')::public.permission_level),
           'status',        i.status,
           'joined',        i.status = 'accepted',
           'say',           case
                              when i.status = 'accepted'
                                then format('%s can open this table as a %s.', i.email,
                                            coalesce(i.metadata ->> 'level', 'viewer'))
                              when i.expires_at is not null and i.expires_at <= now()
                                then format('%s was invited, and the invitation has run out. Resend it to give them a fresh link.', i.email)
                              else format('%s is invited and has not joined yet. They get access the moment they follow the link and the platform gives them an identity — until then this row holds nothing.', i.email)
                            end,
           'expires_at',    i.expires_at,
           'invited_at',    i.created_at,
           'expired',       i.expires_at is not null and i.expires_at <= now())
           order by i.created_at desc), '[]'::jsonb)
    into v_rows
    from iam.invitations i
   where i.target_type = 'custom_table'
     and i.target_id = p_table_id
     and i.organization_id = p_organization_id
     and i.deleted_at is null
     and i.status <> 'revoked';

  return jsonb_build_object(
    'lane_open',  v_lane,
    'may_invite', v_mine,
    -- WHO MAY TURN THE LANE ON. `platform.knob_override_set` admits an owner or an
    -- administrator of the organization; answering it here means the screen draws that
    -- button for the people who can use it and nobody else.
    'may_open_lane', coalesce(v_role in ('owner', 'admin'), false),
    'my_level',   v_mylvl::text,
    'levels',     v_levels,
    'who',        v_who,
    'invitations', v_rows,
    'say', case
             when not v_lane and coalesce(v_role in ('owner', 'admin'), false) then
               'Sharing with people outside this organization is turned off. You can turn it on — it applies to the whole organization, and after that anyone who may share a table can invite an outside person to it.'
             when not v_lane then
               'Sharing with people outside this organization is turned off here. An owner or an administrator of this organization turns it on once, for everybody, and then anyone who may share a table can invite an outside person to it.'
             when not v_mine and v_who = 'org_admins' then
               'An owner or an administrator of this organization invites people from outside. Ask one of them, or share this table with a colleague here instead.'
             when not v_mine and v_who = 'table_admins' then
               'Whoever holds Admin on this table invites people from outside it. Ask them, or share this table with a colleague here instead.'
             when not v_mine then
               'An owner or an administrator of this organization, or whoever holds Admin on this table, invites people from outside. Ask one of them, or share this table with a colleague here instead.'
             else
               'Invite somebody outside this organization by email. They will see this table and nothing else here, at the level you choose.'
           end);
end;
$fn$;
