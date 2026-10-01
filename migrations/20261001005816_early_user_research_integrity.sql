set lock_timeout = '3s';
alter table crm.party_research add constraint party_research_category check (category in ('unknown','real_user','friend','family','employee','former_employee','owner','test','bot'));
alter table crm.party_research add constraint party_research_contact_state check (contact_state in ('not_contacted','draft','contacted','replied','trial_active','declined','hold','opted_out'));
alter table crm.party_research add constraint party_research_outreach_object check (jsonb_typeof(outreach) = 'object');
create or replace function crm._party_research_identity_guard()
returns trigger language plpgsql set search_path = '' as $body$
begin
  if not exists (select 1 from crm.party p where p.id = new.party_id and p.claimed_by = new.subject_id
    and p.organization_id = new.organization_id and p.deleted_at is null and p.canonical_id is null) then
    raise exception 'The contact no longer belongs to this user. Refresh the account before saving notes.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.subject_id is distinct from old.subject_id or new.party_id is distinct from old.party_id) then
    raise exception 'A saved annotation cannot be moved to another person.' using errcode = '23514';
  end if;
  return new;
end;
$body$;
revoke all on function crm._party_research_identity_guard() from public, anon, authenticated;
create trigger _research_identity_guard before insert or update on crm.party_research
for each row execute function crm._party_research_identity_guard();

