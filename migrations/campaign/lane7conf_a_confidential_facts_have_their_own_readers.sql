-- chair-step: NEEDS ARMAN WATCHING (CHAIR-GUIDANCE § What needs Arman watching). This file:
--   · CREATES ONE TABLE crm.party_confidential (row security ON, every client privilege revoked —
--     crm's default ACL would otherwise hand authenticated arwd; registered in platform.entity_types
--     as machinery). Enabling row security makes platform._admin_read_follows_rls add its
--     platform-admin read policy, which takes the sign-in freeze (milliseconds, retried 8 s).
--   · adds ONE organization-overridable knob row (crm/party_confidential_readers, INSERT).
--   · GRANTS EXECUTE to authenticated on two new doors (public.crm_party_confidential_read,
--     public.crm_party_confidential_write) and on hr.employee_row_reader (the policy predicate).
--   · LOCKS: CREATE TRIGGER on crm.party (SHARE ROW EXCLUSIVE: writes wait, reads do not);
--     the sign-in freeze above. lock_timeout 3s; re-run on a lock refusal (the file is idempotent).
--   · The hr.employee policy is file b, alone: lane7conf_b_an_employee_row_is_read_by_the_employee_and_hr.sql.
--   · No column is added or dropped; no existing function body is replaced; no index on a live table.
-- Inverse: migrations/inverse/lane7conf_a_confidential_facts_have_their_own_readers_down.sql
-- lane: STANDARD-TABLES (lane 7)
-- lock: platform
-- window-class: one new table + knob + doors + one trigger. ORDER: this file, then lane7conf_b (the policy).
--
-- LANE 7 · CONFIDENTIAL SPLIT — A CONFIDENTIAL FACT IS READ ONLY BY THE PEOPLE ITS RULES NAME.
--
-- THE GAP (live on production): every member of an organization reads every CRM person's tax_id and
-- date_of_birth (crm.party is member-readable; generic doors hand back the whole row), and every member
-- reads every hr.employee row (legal names, former names, HR custom data, the login account) through
-- every invoker door (custom.entity_record_read, records_find, record_home). (history.row_versions is
-- already platform-admin-only for clients: its restrictive platform_admin_only policy; untouched.)
--
-- CRM — A SPLIT TABLE. tax_id and date_of_birth live in crm.party_confidential, keyed by the party.
--   Readers are a knob, crm/party_confidential_readers, organization-overridable, default (open-leaning,
--   CRM's own ownership words): the organization's owners and admins, the person who created the record,
--   and the person it is assigned to — all as editors. An organization may name more:
--   {"user": "<uuid>", "level": "viewer|commenter|editor"}. A member who is not a reader gets
--   state "withheld" from the read door (never an error, never a null that pretends "not recorded").
--   The old columns are KEPT AND BLANKED: copied, then emptied, in this transaction; a BEFORE trigger
--   moves any later write of them aside into the split table (clients must be editors; server writers
--   are trusted), so no writer can put a value back where every member reads it. Kept (not dropped)
--   because dropping takes ACCESS EXCLUSIVE on the busiest CRM table and breaks generated types,
--   the ORM and two gate-corpus scripts for no reader's gain; production holds 0 values today.
--
-- HR — THE EMPLOYEE ROW IS CONFIDENTIAL; THE DIRECTORY IS THE HR DOOR. Every screen a member uses for
--   colleagues reads through HR's SECURITY DEFINER doors (hr_directory_list, hr_employee_profile with
--   viewer = peer: display name, preferred names, pronouns, photo, work email/phone, title, department,
--   location, manager), which project only directory facts and run as the owner, so they are unchanged.
--   What a member reached on top of that was the RAW row through invoker doors. A
--   restrictive SELECT policy now admits a client to an hr.employee row only when
--   hr.employee_row_reader says so: the employee (login account) or an HR admin — HR's own rule,
--   hr._l1_viewer kinds 'self' / 'hr_admin' (identity.read or working_record.write capability) — plus
--   the platform admin lane the table already had. Peers keep the directory; nobody's screen loses a field it showed.
--
-- RED before this file, GREEN after: scripts/campaign-tests/lane7conf_member_reads_no_confidential_fact.mjs
set local lock_timeout = '3s';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 1. THE KNOB: who reads a CRM person's confidential facts.
-- ─────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, label, description, set_by, basis, review_due,
   overridable_by, override_direction, propagation, public_read, delegable)
VALUES
  ('crm', 'party_confidential_readers',
   '[{"role":"admin","level":"editor"},{"field":"created_by","level":"editor"},{"field":"assigned_to","level":"editor"}]'::jsonb,
   '[{"role":"admin","level":"editor"},{"field":"created_by","level":"editor"},{"field":"assigned_to","level":"editor"}]'::jsonb,
   'json',
   'Who reads a contact''s tax ID and date of birth',
   'Readers of a CRM contact''s confidential facts. Each entry: {"role":"admin"|"owner"}, {"field":"created_by"|"assigned_to"} or {"user":"<id>"}, with "level" viewer, commenter or editor. Everyone else in the organization sees them as withheld.',
   'agent',
   'Lane 7 confidential split, 2026-10-03: every member read tax_id / date_of_birth on crm.party. Default leans open within CRM''s own ownership words: owners and admins, the creator, the assignee.',
   date '2026-12-31', array['organization'], 'any', 'instant', false, true)
ON CONFLICT (feature, key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE SPLIT TABLE. No client privilege at all; only the doors below read or write it.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.party_confidential (
  party_id        uuid        PRIMARY KEY,
  organization_id uuid        NOT NULL,
  tax_id          text,
  date_of_birth   date,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid
);
CREATE INDEX IF NOT EXISTS party_confidential_org_idx ON crm.party_confidential (organization_id);
ALTER TABLE crm.party_confidential ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm.party_confidential FROM PUBLIC, anon, authenticated;
GRANT ALL ON crm.party_confidential TO service_role;
COMMENT ON TABLE crm.party_confidential IS
  'LANE7-CONF: a CRM person''s confidential facts (tax ID, date of birth), split from crm.party. Read and written only through public.crm_party_confidential_read / _write, which ask crm.party_confidential_level (knob crm/party_confidential_readers).';

INSERT INTO platform.entity_types (token, schema_name, table_name, label, audit_class, audit_class_reason, table_ref)
SELECT 'party_confidential', 'crm', 'party_confidential', 'Contact confidential facts', 'machinery',
       'machinery: row security on and no grant to anon or authenticated; reachable only by the owner and the SECURITY DEFINER doors public.crm_party_confidential_read / _write, which ask crm.party_confidential_level',
       'crm.party_confidential'::regclass
 WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types e WHERE e.token = 'party_confidential');

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE RULE: the level (viewer | commenter | editor) a person holds on a party's confidential facts,
--    or null. Takes the row's facts so the BEFORE INSERT trigger can ask before the row exists.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.party_confidential_level(
  p_organization_id uuid, p_created_by uuid, p_assigned_to uuid, p_user uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_role    text;
  v_readers jsonb;
  v_r       jsonb;
  v_lvl     text;
  v_best    int := 0;
  v_rank    int;
  v_match   boolean;
begin
  if p_user is null or p_organization_id is null then return null; end if;
  select m.role into v_role from iam.organization_member m
   where m.organization_id = p_organization_id and m.user_id = p_user
   limit 1;
  if v_role is null then return null; end if;   -- never a reader outside the organization
  v_readers := coalesce(platform.knob_resolve('crm', 'party_confidential_readers', p_organization_id),
    '[{"role":"admin","level":"editor"},{"field":"created_by","level":"editor"},{"field":"assigned_to","level":"editor"}]'::jsonb);
  if jsonb_typeof(v_readers) <> 'array' then return null; end if;
  for v_r in select * from jsonb_array_elements(v_readers) loop
    continue when jsonb_typeof(v_r) <> 'object';
    v_lvl := coalesce(v_r ->> 'level', 'viewer');
    v_rank := case v_lvl when 'viewer' then 1 when 'commenter' then 2 when 'editor' then 3 else 0 end;
    continue when v_rank = 0;
    v_match := case
      when v_r ? 'role'  then v_role = any (case v_r ->> 'role'
                                               when 'admin' then array['owner','admin']
                                               else array[v_r ->> 'role'] end)
      when v_r ? 'field' then case v_r ->> 'field'
                                when 'created_by'  then p_created_by  = p_user
                                when 'assigned_to' then p_assigned_to = p_user
                                else false end
      when v_r ? 'user'  then (v_r ->> 'user') = p_user::text
      else false end;
    if coalesce(v_match, false) and v_rank > v_best then v_best := v_rank; end if;
  end loop;
  return case v_best when 1 then 'viewer' when 2 then 'commenter' when 3 then 'editor' else null end;
end
$function$;
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
SELECT 'crm', 'party_confidential_level', 'p_organization_id uuid, p_created_by uuid, p_assigned_to uuid, p_user uuid',
   'lane7conf (STANDARD-TABLES)',
   'LANE7-CONF: the rule for a CRM contact''s confidential facts. Takes the row''s own organization, creator and assignee plus the person asked about; answers null outside that organization (iam.organization_member), else the best level the knob crm/party_confidential_readers names. NULL arguments answer null.',
   'server_only: called only inside public.crm_party_confidential_read / _write and the crm.party trigger crm._party_confidential_moves_aside; no client calls it directly.',
   false, false
 WHERE NOT EXISTS (SELECT 1 FROM platform.client_callable_door d
                    WHERE d.schema_name = 'crm' AND d.function_name = 'party_confidential_level');

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE READ DOOR. One entry per asked party that sits in one of the caller's organizations:
--    state "shown" (a reader: values, null = not recorded) or "withheld" (a member who is not a
--    reader: no values). A party outside the caller's organizations is simply absent. Never raises.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_party_confidential_read(p_party_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_out jsonb := '[]'::jsonb;
  r     record;
  v_lvl text;
begin
  if v_uid is null or p_party_ids is null then return v_out; end if;
  for r in
    select p.id, p.party_kind, p.organization_id, p.created_by, p.assigned_to, c.tax_id, c.date_of_birth
      from crm.party p
      left join crm.party_confidential c on c.party_id = p.id
     where p.id = any (p_party_ids[1:500])
       and p.organization_id in (select iam.my_orgs())
  loop
    v_lvl := crm.party_confidential_level(r.organization_id, r.created_by, r.assigned_to, v_uid);
    if v_lvl is null then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'party_id', r.id, 'state', 'withheld', 'level', null, 'may_edit', false,
        'fields', case r.party_kind when 'organization' then jsonb_build_array('tax_id')
                                    else jsonb_build_array('date_of_birth') end));
    else
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'party_id', r.id, 'state', 'shown', 'level', v_lvl, 'may_edit', v_lvl = 'editor',
        'tax_id', r.tax_id, 'date_of_birth', r.date_of_birth));
    end if;
  end loop;
  return v_out;
end
$function$;
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers, anonymous_callers)
SELECT 'public', 'crm_party_confidential_read', 'p_party_ids uuid[]', 'lane7conf (STANDARD-TABLES)',
   'LANE7-CONF: a CRM contact''s tax ID / date of birth for the people crm.party_confidential_level names (knob crm/party_confidential_readers); a member who is not a reader gets state withheld and no value; a contact outside the caller''s organizations is absent.', true, false
 WHERE NOT EXISTS (SELECT 1 FROM platform.client_callable_door d
                    WHERE d.schema_name = 'public' AND d.function_name = 'crm_party_confidential_read' AND d.identity_args = 'p_party_ids uuid[]');
GRANT EXECUTE ON FUNCTION public.crm_party_confidential_read(uuid[]) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 5. THE WRITE DOOR. Keys tax_id / date_of_birth (null clears). Editors only; a refusal is one
--    plain sentence. Returns the read door's entry for the party.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_party_confidential_write(p_party_id uuid, p_values jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_p    record;
  v_lvl  text;
  v_bad  text[];
  v_dob  date;
  v_tax  text;
begin
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Send the values to save as an object with tax_id and/or date_of_birth.' using errcode = '22023';
  end if;
  select array_agg(k) into v_bad from jsonb_object_keys(p_values) k where k not in ('tax_id', 'date_of_birth');
  if v_bad is not null then
    raise exception 'Only tax_id and date_of_birth are kept here; % is not.', array_to_string(v_bad, ', ') using errcode = '22023';
  end if;
  -- a signed-in caller is held to the rule; a call with no person (service role / server) is trusted
  select p.id, p.party_kind, p.organization_id, p.created_by, p.assigned_to into v_p
    from crm.party p
   where p.id = p_party_id and p.organization_id is not null
     and (v_uid is null or p.organization_id in (select iam.my_orgs()));
  if v_p.id is null then
    raise exception 'That contact is not in any of your organizations.' using errcode = '42501';
  end if;
  v_lvl := crm.party_confidential_level(v_p.organization_id, v_p.created_by, v_p.assigned_to, v_uid);
  if v_uid is not null and v_lvl is distinct from 'editor' then
    raise exception 'Only this contact''s confidential editors can change its tax ID or date of birth; an owner or admin of the organization can add you.' using errcode = '42501';
  end if;
  if p_values ? 'date_of_birth' and jsonb_typeof(p_values -> 'date_of_birth') <> 'null' then
    begin
      v_dob := (p_values ->> 'date_of_birth')::date;
    exception when others then
      raise exception 'The date of birth must be a date like 1984-03-27.' using errcode = '22007';
    end;
  end if;
  v_tax := nullif(btrim(p_values ->> 'tax_id'), '');
  -- the row's own facet rule (party_org_facet / party_person_facet), kept beside it
  if v_tax is not null and v_p.party_kind <> 'organization' then
    raise exception 'A tax ID belongs to a company, not a person.' using errcode = '23514';
  end if;
  if v_dob is not null and v_p.party_kind <> 'person' then
    raise exception 'A date of birth belongs to a person, not a company.' using errcode = '23514';
  end if;
  insert into crm.party_confidential as c (party_id, organization_id, tax_id, date_of_birth, updated_by)
  values (v_p.id, v_p.organization_id, v_tax, v_dob, v_uid)
  on conflict (party_id) do update
     set tax_id        = case when p_values ? 'tax_id'        then excluded.tax_id        else c.tax_id end,
         date_of_birth = case when p_values ? 'date_of_birth' then excluded.date_of_birth else c.date_of_birth end,
         updated_at    = now(),
         updated_by    = v_uid;
  if v_uid is null then
    return (select jsonb_build_object('party_id', c.party_id, 'state', 'shown', 'level', 'editor', 'may_edit', true,
                                      'tax_id', c.tax_id, 'date_of_birth', c.date_of_birth)
              from crm.party_confidential c where c.party_id = v_p.id);
  end if;
  return public.crm_party_confidential_read(array[v_p.id]) -> 0;
end
$function$;
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers, anonymous_callers)
SELECT 'public', 'crm_party_confidential_write', 'p_party_id uuid, p_values jsonb', 'lane7conf (STANDARD-TABLES)',
   'LANE7-CONF: saves a CRM contact''s tax ID / date of birth; only an editor named by crm.party_confidential_level, refused in one sentence otherwise.', true, false
 WHERE NOT EXISTS (SELECT 1 FROM platform.client_callable_door d
                    WHERE d.schema_name = 'public' AND d.function_name = 'crm_party_confidential_write' AND d.identity_args = 'p_party_id uuid, p_values jsonb');
GRANT EXECUTE ON FUNCTION public.crm_party_confidential_write(uuid, jsonb) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 6. COPY, THEN BLANK (same transaction). Then the old columns can never hold a value again: any write
--    to them is moved aside into the split table (a client must be an editor; server writers are trusted).
-- ─────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO crm.party_confidential (party_id, organization_id, tax_id, date_of_birth, updated_by)
SELECT p.id, p.organization_id, nullif(btrim(p.tax_id), ''), p.date_of_birth, p.updated_by
  FROM crm.party p
 WHERE (p.tax_id IS NOT NULL OR p.date_of_birth IS NOT NULL) AND p.organization_id IS NOT NULL
ON CONFLICT (party_id) DO UPDATE
   SET tax_id = coalesce(excluded.tax_id, crm.party_confidential.tax_id),
       date_of_birth = coalesce(excluded.date_of_birth, crm.party_confidential.date_of_birth);
UPDATE crm.party SET tax_id = NULL, date_of_birth = NULL
 WHERE tax_id IS NOT NULL OR date_of_birth IS NOT NULL;

CREATE OR REPLACE FUNCTION crm._party_confidential_moves_aside()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tax text := nullif(btrim(new.tax_id), '');
  v_lvl text;
begin
  if v_tax is null and new.date_of_birth is null then
    new.tax_id := null;
    return new;
  end if;
  if v_tax is not null and new.party_kind <> 'organization' then
    raise exception 'A tax ID belongs to a company, not a person.' using errcode = '23514';
  end if;
  if new.date_of_birth is not null and new.party_kind <> 'person' then
    raise exception 'A date of birth belongs to a person, not a company.' using errcode = '23514';
  end if;
  if new.organization_id is null then
    raise exception 'A tax ID or date of birth is kept only on a contact that belongs to an organization.' using errcode = '22023';
  end if;
  if platform.is_client_channel() then
    v_lvl := crm.party_confidential_level(new.organization_id, new.created_by, new.assigned_to, auth.uid());
    if v_lvl is distinct from 'editor' then
      raise exception 'Only this contact''s confidential editors can change its tax ID or date of birth; an owner or admin of the organization can add you.' using errcode = '42501';
    end if;
  end if;
  insert into crm.party_confidential as c (party_id, organization_id, tax_id, date_of_birth, updated_by)
  values (new.id, new.organization_id, v_tax, new.date_of_birth, auth.uid())
  on conflict (party_id) do update
     set tax_id        = coalesce(excluded.tax_id, c.tax_id),
         date_of_birth = coalesce(excluded.date_of_birth, c.date_of_birth),
         updated_at    = now(),
         updated_by    = excluded.updated_by;
  new.tax_id := null;
  new.date_of_birth := null;
  return new;
end
$function$;
REVOKE ALL ON FUNCTION crm._party_confidential_moves_aside() FROM PUBLIC, anon, authenticated;

-- CREATE TRIGGER takes SHARE ROW EXCLUSIVE on crm.party (writers wait, readers do not); no DROP
-- (that would be ACCESS EXCLUSIVE), so a re-run skips it.
DO $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'crm.party'::regclass
                    and tgname = '_zz_party_confidential_moves_aside') then
    create trigger _zz_party_confidential_moves_aside
      before insert or update of tax_id, date_of_birth on crm.party
      for each row execute function crm._party_confidential_moves_aside();
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 7. HR: THE EMPLOYEE ROW IS READ BY THE EMPLOYEE AND HR ADMINS (HR's own rule), via any client door.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.employee_row_reader(p_employee_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_login uuid;
begin
  if v_uid is null or p_employee_id is null then return false; end if;
  if public.is_platform_admin() then return true; end if;     -- the lane the table already had
  select e.login_user_id into v_login from hr.employee e where e.id = p_employee_id;
  if v_login = v_uid then return true; end if;                 -- the employee
  -- HR admins: hr._l1_viewer's own answer (identity.read or working_record.write on this subject).
  return coalesce(hr._l1_viewer(v_uid, p_employee_id, current_date) ->> 'kind', 'none') in ('self', 'hr_admin');
end
$function$;
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers, anonymous_callers)
SELECT 'hr', 'employee_row_reader', 'p_employee_id uuid', 'lane7conf (STANDARD-TABLES)',
   'LANE7-CONF: the predicate of hr.employee''s restrictive read policy: true for the employee, an HR admin (hr._l1_viewer self / hr_admin) or the platform admin lane. Returns a boolean about the caller only.', true, false
 WHERE NOT EXISTS (SELECT 1 FROM platform.client_callable_door d
                    WHERE d.schema_name = 'hr' AND d.function_name = 'employee_row_reader' AND d.identity_args = 'p_employee_id uuid');
GRANT EXECUTE ON FUNCTION hr.employee_row_reader(uuid) TO authenticated, service_role;

-- The policy that asks it is file b (lane7conf_b_…): a policy change rides alone in its transaction.
