-- Owner-confirmed facts from Arman's September 30 conversation.
-- This is a real-data seed, not a test fixture. Replays preserve all owner edits.
set lock_timeout = '3s';
do $seed$
declare
  owner_id uuid := '4cf62e4e-2679-484f-b652-034e697418df';
  crm_org uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  r record; subject_id uuid; contact_id uuid; matched integer;
begin
  if not exists (select 1 from iam.users where id = owner_id) then
    raise exception 'The research owner does not exist. No owner facts were written.';
  end if;
  for r in select * from (values
    ('zeeeepa@gmail.com','Lukas','unknown','contacted','Arman messaged him with an offer for free access. Terms and delivery channel are not recorded.'),
    ('developer111@pixelium.uk','developer111','unknown','hold','Blocked September 29, 2026 for now. Arman also messaged him. Keep invitations on hold.'),
    ('avaniayesh58@gmail.com','Ava Niayesh','friend','not_contacted','Arman confirmed this is a friend.'),
    ('jasonmilakovic@gmail.com','Jasonmil100','real_user','not_contacted','Arman confirmed this is a real user. Relationship checks are still required before outside-user outreach.'),
    ('ladisvarum999@gmail.com','Ladis Varum','real_user','not_contacted','Arman confirmed this is a real user. Relationship checks are still required before outside-user outreach.'),
    ('tahirmahfooz@gmail.com','Tahir Mahfooz','employee','not_contacted','Arman confirmed this is his employee. Check organization and employment connections before discovery.'),
    ('jatinbanga22@gmail.com','Techno Freax','former_employee','not_contacted','Arman confirmed this is a former employee. Do not merge this account with Jatin Banga from names alone.'),
    ('jatin.b.rx3@gmail.com','Jatin Banga','former_employee','not_contacted','Arman confirmed this is a former employee. Retain relationship history, but ignore activity before June 2026 for this program.')
  ) as facts(email,label,category,contact_state,notes)
  loop
    select count(*), (array_agg(u.id))[1] into matched, subject_id
      from auth.users u where lower(u.email) = r.email;
    if matched <> 1 then raise exception 'Account identity missing or ambiguous for %. No owner facts were written.', r.email; end if;
    select count(*), (array_agg(p.id))[1] into matched, contact_id
      from crm.party p where p.claimed_by = subject_id and p.organization_id = crm_org
        and p.deleted_at is null and p.canonical_id is null;
    if matched <> 1 then raise exception 'Claimed contact missing or ambiguous for %. No owner facts were written.', r.email; end if;
    insert into crm.party_research(subject_id,party_id,organization_id,created_by,updated_by,label,category,contact_state,notes)
      values(subject_id,contact_id,crm_org,owner_id,owner_id,r.label,r.category,r.contact_state,r.notes)
      on conflict (created_by, subject_id) where deleted_at is null do nothing;
  end loop;
end;
$seed$;

