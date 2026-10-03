-- chair-step: functions and body replacements only. Creates the protected-field functions
-- (custom.field_is_protected, protected_field_rule, protected_readers_problem, field_access,
-- protected_field_notice, protected_field_query_refusal, protected_value, protected_values,
-- protected_matches, field_protection_refusal, protected_value_leaks,
-- entity_field_protect_arman_explicitly_approved; hr.custom_field_subject, hr.custom_field_access;
-- history.protect_field_scrub [history exception, chair-allowed 2026-10-03 for the fold only]; platform._drill_protect) and edits six live bodies by
-- asserted fragment: custom._entity_custom_fields_guard, custom._field_shape_guard,
-- custom.entity_field_declare, custom.entity_record_read (also STABLE -> VOLATILE: a granted read is
-- audited), custom.entity_records_find, platform._drill_plan. No table DDL, no client grant (every new
-- definer door is revoked from clients; file c opens three). Requires file a. Its inverse removes each
-- fragment (asserted) and drops the functions.
-- ORDER (production, chair ruling): r2, w2_a, w5_a, w3a, w2_b (live) -> 5b2 -> 4a (a, b, c):
-- lane7sec_r2_an_archived_field_never_blocks_a_row.sql, then
-- lane7w2_a_a_choice_on_a_standard_row_holds_its_key.sql (re-based on r2), then
-- lane7w5b2_a_record_read_takes_only_the_columns_you_may_read.sql (custom.entity_record_read), then
-- lane7w4a_a_a_protected_value_has_its_own_place.sql, then lane7w4a_b_a_protected_field_is_read_by_the_people_it_names.sql, then
-- lane7w4a_c_the_people_a_field_names_reach_its_values.sql. Based on production's bodies (custom._entity_custom_fields_guard e29bf768…) plus SEC r2
-- plus W2's Choice-key lines; custom.entity_record_read on 5b2's body (both anchors are lines 5b2
-- keeps; the clone proof ran on that body); onehome_d2 (pending, fragment-based) applies before or after this
-- unchanged. Body edits in file b are FRAGMENT edits on the live body (each anchor asserted present
-- exactly once, refused by name otherwise), so they land on r2+W2 with or without onehome_d2 and
-- with or without W3a/W5 — the clone proof ran on prod+r2+W2+onehome_d2+W3a+W5.
--
-- LANE 7 · STANDARD-TABLES · W4a (b) — A PROTECTED FIELD IS READ ONLY BY THE PEOPLE IT NAMES.
-- Design: common-docs/projects/data-doctrine-adoption/v6/DESIGN-STANDARD-TABLES-W45.md § Wave 4a (rev 3).
-- Clone wins, said here: (1) "protected" is FLD-12's own word — sensitivity above internal on a
-- standard table's field — not a second `level` key; (2) history.row_versions has no append-only
-- trigger on the clone (only the vault barrier), so R2 is a doctrine exception carried by one function;
-- (3) search projections read no custom_fields on the clone, so the search leg is a census of the
-- projection functions (G4a), not a recompute; (4) HR's own write guard refuses every unarmed write, so
-- the protect door arms through the rule's registered `arm` function.
set local lock_timeout = '3s';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE WORDS: what makes a field protected, and the rule a token holds.
-- A field of a STANDARD table whose sensitivity is above internal (FLD-12's own word) is
-- protected: its values live in custom.entity_protected_value. (The design's `level` key would
-- have been a second word for sensitivity; the store keeps one.)
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.field_is_protected(p_data jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select nullif(p_data ->> 'table_token', '') is not null
     and coalesce(p_data ->> 'sensitivity', 'internal') in ('confidential', 'restricted');
$function$;

CREATE OR REPLACE FUNCTION custom.protected_field_rule(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- The platform's entry for one token (custom/protected_field_rules, read at the platform level
-- only: the knob is locked), or null. An entry whose rule is not a real function of the expected
-- shape is null too: a rule nobody can run protects nothing.
declare
  v jsonb;
begin
  v := platform.knob_resolve('custom', 'protected_field_rules', null, null) -> p_token;
  if v is null or jsonb_typeof(v) <> 'object' or nullif(v ->> 'rule', '') is null then
    return null;
  end if;
  if to_regprocedure((v ->> 'rule') || '(uuid,text,uuid,text,jsonb,boolean,uuid)') is null then
    return null;
  end if;
  return v;
end
$function$;
REVOKE ALL ON FUNCTION custom.protected_field_rule(text) FROM anon;   -- invoker: the shape guard asks it as the writer

-- The shape of `readers`. The `capability` reader kind is ALLOWED by the chair (2026-10-03); it is the arm below (and its twin in
-- hr.custom_field_access): without it, delete both arms and a protected HR field is readable by
-- the employee alone — which would take HR admins' access away, so the chair rules it.
CREATE OR REPLACE FUNCTION custom.protected_readers_problem(p_token text, p_readers jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  r      jsonb;
  v_pre  text;
begin
  if p_readers is null or jsonb_typeof(p_readers) <> 'array' or jsonb_array_length(p_readers) = 0 then
    return 'A protected field names the people who read it, and this one names nobody.';
  end if;
  v_pre := split_part(coalesce(custom.protected_field_rule(p_token) ->> 'rule', ''), '.', 1) || '.';
  for r in select x from jsonb_array_elements(p_readers) x loop
    if jsonb_typeof(r) <> 'object' then
      return 'Each reader of a protected field is {"field": …} or {"capability": …}.';
    end if;
    if coalesce(r ->> 'level', 'viewer') not in ('viewer', 'commenter', 'editor') then
      return format('A reader''s level is viewer, commenter or editor, and one says %s.', r ->> 'level');
    end if;
    if (r ? 'field') = (r ? 'capability') then
      return 'Each reader of a protected field names either a field or a capability, and exactly one of them.';
    end if;
    if r ? 'field' and coalesce(r ->> 'field', '') !~ '^[a-z][a-z0-9_]*$' then
      return 'A reader''s field is the name of a person on the row.';
    end if;
    -- R1: the capability reader kind — a capability of the rule's own domain (hr.* for HR).
    if r ? 'capability' and (coalesce(r ->> 'capability', '') !~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$'
                             or left(r ->> 'capability', length(v_pre)) <> v_pre) then
      return format('A reader''s capability belongs to this table''s own rules (%s…), and one says %s.',
                    v_pre, coalesce(r ->> 'capability', 'nothing'));
    end if;
  end loop;
  return null;
end
$function$;
REVOKE ALL ON FUNCTION custom.protected_readers_problem(text, jsonb) FROM anon;   -- invoker, as above

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE ONE ANSWER. custom.field_access asks the field's rule, and nothing else, whether this
-- person may read / edit this protected value on this row, or use the field across rows
-- ('query': filter, sort, group, add up). It returns the decision with the audit id. p_audit
-- false is the quiet form a read-only statement uses (drill, find): the decision is the same,
-- the read is not written to the rule's audit log (a read-only transaction cannot write it).
-- Never client-callable: every door that calls it passes the signed-in person.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.field_access(p_user uuid, p_field_id uuid, p_token text, p_row_id uuid, p_action text, p_audit boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f      custom.record;
  v_rule jsonb;
  v_out  jsonb;
begin
  if p_action is null or p_action not in ('read', 'edit', 'query') then
    raise exception 'A protected field is read, edited or queried, and this asks to %.', coalesce(p_action, 'nothing')
      using errcode = '22023';
  end if;
  select * into f from custom.record r
   where r.id = p_field_id and r.table_id = custom.field_kernel_id() and r.data_class = 'field';
  if not found then
    return jsonb_build_object('allowed', false, 'protected', true, 'reason', 'no_field');
  end if;
  if not custom.field_is_protected(f.data) then
    return jsonb_build_object('allowed', true, 'protected', false);
  end if;
  if p_token is distinct from f.data ->> 'table_token' then
    return jsonb_build_object('allowed', false, 'protected', true, 'reason', 'other_table');
  end if;
  v_rule := custom.protected_field_rule(p_token);
  if v_rule is null then
    -- a protected field whose table lost its rule is read by nobody — never by everybody
    return jsonb_build_object('allowed', false, 'protected', true, 'reason', 'no_rule');
  end if;
  execute format('select %s($1, $2, $3, $4, $5, $6, $7)', (v_rule ->> 'rule')::regproc::text)
    into v_out
    using p_user, p_token, p_row_id, p_action, f.data || jsonb_build_object('id', f.id), coalesce(p_audit, true), f.organization_id;
  return coalesce(v_out, '{}'::jsonb) || jsonb_build_object(
    'allowed', coalesce((v_out ->> 'allowed')::boolean, false), 'protected', true);
end
$function$;
REVOKE ALL ON FUNCTION custom.field_access(uuid, uuid, text, uuid, text, boolean) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 5. HR'S RULE, reproducing today's audience exactly (design W45 4b table): READ is
-- hr._l1_viewer's `self` (a {field: "subject"} reader) or a capability reader the person holds
-- for the subject's employment — with the default readers that is exactly `hr_admin`
-- (identity.read OR working_record.write, with a resolved subject). Managers, owners, admins,
-- peers: no. EDIT is hr._l1_subject_write_gate for each editor capability (identity.write by
-- default), which fails closed on an unresolvable subject and audits its own denial; the employee
-- cannot edit unless a {field: "subject", level: "editor"} reader says so. QUERY (use the field
-- across rows) is a capability reader the person holds in the organization; each row's value is
-- then still asked per row. A null subject is refused: no capability is ever asked without one.
-- Audit: a granted read writes hr._record_access_audit with the field key; a write writes
-- hr._l1_write_audit — the same two functions HR's doors call.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.custom_field_subject(p_token text, p_row_id uuid)
 RETURNS TABLE(employee_id uuid, organization_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
begin
  if p_token = 'hr_employee' then
    return query select e.id, e.organization_id from hr.employee e
                  where e.id = p_row_id and e.deleted_at is null;
  elsif p_token = 'hr_position_assignment' then
    return query select em.employee_id, pa.organization_id
                   from hr.position_assignment pa join hr.employment em on em.id = pa.employment_id
                  where pa.id = p_row_id and em.organization_id = pa.organization_id;
  elsif p_token = 'hr_training_assignment' then
    return query select em.employee_id, ta.organization_id
                   from hr.training_assignment ta join hr.employment em on em.id = ta.employment_id
                  where ta.id = p_row_id and em.organization_id = ta.organization_id;
  elsif p_token = 'hr_candidate' then
    return query select c.converted_to_employee_id, c.organization_id from hr.candidate c
                  where c.id = p_row_id and c.converted_to_employee_id is not null;
  end if;
end
$function$;
REVOKE ALL ON FUNCTION hr.custom_field_subject(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION hr.custom_field_access(p_user uuid, p_token text, p_row_id uuid, p_action text, p_field jsonb, p_audit boolean, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_readers jsonb := coalesce(p_field -> 'readers', '[]'::jsonb);
  v_key     text  := p_field ->> 'key';
  r         jsonb;
  v_emp     uuid;
  v_org     uuid;
  v_view    jsonb;
  v_subj    uuid;
  v_caps    text[];
  v_cap     text;
  v_basis   text;
  v_self    boolean := false;
  v_audit   uuid;
  v_gate    jsonb;
  v_semp    uuid;
  v_tried   boolean := false;
begin
  -- QUERY: may this person use the field across rows at all? Only a capability reader she holds
  -- in this organization admits it (asked once, organization-wide, never with a null subject).
  if p_action = 'query' then
    if p_user is null then
      return jsonb_build_object('allowed', false, 'reason', 'nobody');
    end if;
    v_caps := hr._l1_capabilities(p_user, p_organization_id, current_date);
    for r in select x from jsonb_array_elements(v_readers) x where x ? 'capability' loop
      if substr(r ->> 'capability', 4) = any (v_caps) then
        return jsonb_build_object('allowed', true, 'basis', 'capability', 'capability', r ->> 'capability');
      end if;
    end loop;
    return jsonb_build_object('allowed', false, 'reason', 'not_a_reader');
  end if;

  select s.employee_id, s.organization_id into v_emp, v_org from hr.custom_field_subject(p_token, p_row_id) s;
  if v_emp is null or v_org is distinct from p_organization_id then
    -- no subject (a requisition, a candidate before hire, a row of another employer): nobody reads it
    return jsonb_build_object('allowed', false, 'reason', 'no_subject');
  end if;

  if p_action = 'read' then
    if p_user is null then
      return jsonb_build_object('allowed', false, 'reason', 'nobody');
    end if;
    v_view := hr._l1_viewer(p_user, v_emp, current_date);
    if v_view is null then
      return jsonb_build_object('allowed', false, 'reason', 'no_subject');
    end if;
    v_subj := nullif(v_view ->> 'subject_employment_id', '')::uuid;
    if v_view ->> 'kind' = 'self'
       and exists (select 1 from jsonb_array_elements(v_readers) x where x ->> 'field' = 'subject') then
      v_basis := 'self'; v_self := true;
    elsif v_subj is not null then
      -- R1: the capability readers, asked for the subject's own employment (hr._l1_viewer's
      -- hr_admin arm exactly, when the readers are the defaults).
      for r in select x from jsonb_array_elements(v_readers) x where x ? 'capability' loop
        if hr.capability(p_user, substr(r ->> 'capability', 4), v_subj, current_date, v_org) then
          v_basis := 'capability';
          exit;
        end if;
      end loop;
    end if;
    if v_basis is null then
      return jsonb_build_object('allowed', false, 'reason', 'not_a_reader');
    end if;
    if coalesce(p_audit, true) then
      v_audit := hr._record_access_audit(
        p_organization_id => v_org, p_action => 'reveal_field', p_target_token => p_token,
        p_purpose => 'operational', p_basis => v_basis, p_granted => true,
        p_target_ids => array[p_row_id], p_row_count => 1, p_subject_employment_id => v_subj,
        p_sensitivity_tier => 'confidential', p_field_key => v_key, p_is_self_access => v_self);
    end if;
    return jsonb_build_object('allowed', true, 'basis', v_basis, 'audit_id', v_audit);
  end if;

  -- EDIT.
  if p_user is null then
    -- the platform's own writer (a server job, the 4b mover): no person to ask, recorded as such
    if coalesce(p_audit, true) then
      v_audit := hr._l1_write_audit(v_org, p_token, 'write', array[p_row_id],
                                    hr.subject_employment_as_of(v_emp, current_date, v_org),
                                    'operational', 'confidential', false);
    end if;
    return jsonb_build_object('allowed', true, 'basis', 'platform', 'audit_id', v_audit);
  end if;
  if p_user is distinct from auth.uid() then
    -- HR's write gate asks the signed-in person; a door may not ask it about somebody else
    return jsonb_build_object('allowed', false, 'reason', 'not_the_session');
  end if;
  if exists (select 1 from jsonb_array_elements(v_readers) x
              where x ->> 'field' = 'subject' and x ->> 'level' = 'editor') then
    v_view := hr._l1_viewer(p_user, v_emp, current_date);
    if v_view ->> 'kind' = 'self' then
      v_audit := hr._l1_write_audit(v_org, p_token, 'write', array[p_row_id],
                                    nullif(v_view ->> 'subject_employment_id', '')::uuid,
                                    'operational', 'confidential', true);
      return jsonb_build_object('allowed', true, 'basis', 'self', 'audit_id', v_audit);
    end if;
  end if;
  for r in select x from jsonb_array_elements(v_readers) x
            where x ? 'capability' and x ->> 'level' = 'editor' loop
    v_tried := true;
    select g.gate, g.subject_employment into v_gate, v_semp
      from hr._l1_subject_write_gate(v_org, substr(r ->> 'capability', 4), v_emp, p_token, 'update', 'operational') g;
    if v_gate is null then
      v_audit := hr._l1_write_audit(v_org, p_token, 'write', array[p_row_id], v_semp,
                                    'operational', 'confidential', false);
      return jsonb_build_object('allowed', true, 'basis', 'capability', 'audit_id', v_audit);
    end if;
  end loop;
  return jsonb_build_object('allowed', false, 'reason', case when v_tried then 'not_an_editor' else 'no_editor' end,
                            'audit_id', v_gate ->> 'audit_id');
end
$function$;
REVOKE ALL ON FUNCTION hr.custom_field_access(uuid, text, uuid, text, jsonb, boolean, uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 6. THE READ DOORS a person reaches. Each asks custom.field_access for the signed-in person.
-- ─────────────────────────────────────────────────────────────────────────────────────────

-- What a person is told for a protected value she may not read: the store's withheld notice.
CREATE OR REPLACE FUNCTION custom.protected_field_notice(p_field custom.record)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'reason', coalesce(p_field.data ->> 'sensitivity', 'confidential'),
    'needs',  'one of the people it names',
    'says',   format('Only the people it names can read %s.',
                     coalesce(nullif(p_field.data ->> 'label', ''), p_field.data ->> 'key')));
$function$;

-- The refusal for using a field across rows the person cannot read, or null.
CREATE OR REPLACE FUNCTION custom.protected_field_query_refusal(p_field_id uuid, p_verb text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f custom.record;
begin
  select * into f from custom.record r
   where r.id = p_field_id and r.table_id = custom.field_kernel_id() and r.data_class = 'field';
  if not found or not custom.field_is_protected(f.data) then
    return null;
  end if;
  if coalesce((custom.field_access(auth.uid(), f.id, f.data ->> 'table_token', null, 'query', false) ->> 'allowed')::boolean, false) then
    return null;
  end if;
  return format('You can''t %s %s: only the people it names can read it.', coalesce(p_verb, 'use'),
                coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'));
end
$function$;
REVOKE ALL ON FUNCTION custom.protected_field_query_refusal(uuid, text) FROM PUBLIC, anon, authenticated;

-- One protected value for the signed-in person, or null when her rule says no (quiet: used by the
-- drill doors' compiled SQL, one call per row, inside a read-only statement).
CREATE OR REPLACE FUNCTION custom.protected_value(p_token text, p_row_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v jsonb;
begin
  select pv.value into v from custom.entity_protected_value pv
   where pv.table_token = p_token and pv.row_id = p_row_id and pv.field_id = p_field_id;
  if v is null then
    return null;
  end if;
  if coalesce((custom.field_access(auth.uid(), p_field_id, p_token, p_row_id, 'read', false) ->> 'allowed')::boolean, false) then
    return v;
  end if;
  return null;
end
$function$;

-- Every protected field of one row, for the signed-in person: the values she may read (with
-- their envelopes) and a withheld notice for each one she may not. Null when the table has no
-- protected field. Each granted read is audited by the field's rule.
CREATE OR REPLACE FUNCTION custom.protected_values(p_organization_id uuid, p_token text, p_row_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f        custom.record;
  v_values jsonb := '{}'::jsonb;
  v_env    jsonb := '{}'::jsonb;
  v_hidden jsonb := '{}'::jsonb;
  v_keys   text[] := '{}'::text[];
  v_any    boolean := false;
  pv       record;
begin
  for f in select * from custom.entity_fields(p_organization_id, p_token) loop
    continue when not custom.field_is_protected(f.data) or (f.data ->> 'key') is null;
    v_any := true;
    v_keys := v_keys || (f.data ->> 'key');
    if coalesce((custom.field_access(auth.uid(), f.id, p_token, p_row_id, 'read', true) ->> 'allowed')::boolean, false) then
      select x.value, x.envelope into pv from custom.entity_protected_value x
       where x.table_token = p_token and x.row_id = p_row_id and x.field_id = f.id;
      if found then
        v_values := v_values || jsonb_build_object(f.data ->> 'key', pv.value);
        if pv.envelope is not null then
          v_env := v_env || jsonb_build_object(f.data ->> 'key', pv.envelope);
        end if;
      end if;
    else
      v_hidden := v_hidden || jsonb_build_object(f.data ->> 'key', custom.protected_field_notice(f));
    end if;
  end loop;
  if not v_any then
    return null;
  end if;
  return jsonb_build_object('keys', to_jsonb(v_keys), 'values', v_values, 'written', v_env, 'hidden', v_hidden);
end
$function$;

-- The rows whose protected value matches (p_value null: every row holding one) and that the
-- signed-in person may read, with the value. Refuses, in a sentence, a person who may not use
-- the field across rows. Row visibility is the caller's (the find door joins the table as her).
CREATE OR REPLACE FUNCTION custom.protected_matches(p_field_id uuid, p_value jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(row_id uuid, value jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f         custom.record;
  v_refusal text;
begin
  select * into f from custom.record r
   where r.id = p_field_id and r.table_id = custom.field_kernel_id() and r.data_class = 'field';
  if not found or not custom.field_is_protected(f.data) then
    return;
  end if;
  v_refusal := custom.protected_field_query_refusal(p_field_id, 'filter by');
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = '42501',
            hint = 'LANE7-W4A: a protected field is used across rows only by the people its rule names. Nothing was read.';
  end if;
  return query
    select pv.row_id, pv.value
      from custom.entity_protected_value pv
     where pv.field_id = p_field_id
       and (p_value is null or pv.value = p_value)
       and coalesce((custom.field_access(auth.uid(), p_field_id, pv.table_token, pv.row_id, 'read', false) ->> 'allowed')::boolean, false);
end
$function$;


-- Closed until file c declares them as client doors (a grant change the chair runs with Arman).
-- Until then they are asked only for a table that holds a protected field; the record read tells a
-- seat they are closed to that each protected value is withheld, never an error.
REVOKE ALL ON FUNCTION custom.protected_value(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION custom.protected_values(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION custom.protected_matches(uuid, jsonb) FROM PUBLIC, anon, authenticated;
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 7. THE SHAPE RULE for a protected field (called by custom._field_shape_guard, below). A token
-- without a rule is the SEC block's, unchanged ("cannot be confidential yet"). For a token with
-- one: a new protected field must name readers of a shape the store knows; an existing field
-- becomes protected, or changes whom it names, only inside the protect door (which records
-- Arman's words and moves every copy first); a protected field never quietly becomes readable by
-- everyone (un-protecting is not built, and says so).
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.field_protection_refusal(p_op text, p_old jsonb, p_new jsonb, p_field_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_was   boolean := p_old is not null and custom.field_is_protected(p_old);
  v_is    boolean := custom.field_is_protected(p_new);
  v_label text := coalesce(nullif(p_new ->> 'label', ''), p_new ->> 'key');
  v_door  boolean := current_setting('custom.protect_field_door', true) is not distinct from p_field_id::text;
  v_prob  text;
begin
  if not v_was and not v_is then
    return null;
  end if;
  if v_was and not v_is then
    return format('"%s" stays protected: making it readable by everyone again isn''t built yet, so nothing was written.', v_label);
  end if;
  if custom.protected_field_rule(p_new ->> 'table_token') is null then
    return null;   -- the LANE7-SEC block refuses it, in its own words
  end if;
  v_prob := custom.protected_readers_problem(p_new ->> 'table_token', p_new -> 'readers');
  if v_prob is not null then
    return v_prob;
  end if;
  if p_op = 'UPDATE' and not v_was and not v_door then
    return format('Protecting "%s" moves its values out of every record first, and that is done with Arman''s approval, so nothing was written.', v_label);
  end if;
  if p_op = 'UPDATE' and v_was and not v_door
     and ((p_old -> 'readers') is distinct from (p_new -> 'readers')
          or (p_old ->> 'table_token') is distinct from (p_new ->> 'table_token')) then
    return format('Who reads "%s" changes only with Arman''s approval, so nothing was written.', v_label);
  end if;
  return null;
end
$function$;
REVOKE ALL ON FUNCTION custom.field_protection_refusal(text, jsonb, jsonb, uuid) FROM anon;   -- invoker: the shape guard asks it as the writer

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 8. G4a — THE CENSUS. Every place a protected field's value could still sit outside
-- custom.entity_protected_value: (row) a record's custom_fields, or its _values envelope;
-- (history) a history.row_versions snapshot of that record; (search) a search projection that
-- reads custom_fields at all (the clone's projections read none: title, subtitle and tags only).
-- Empty is green. p_field_id null: every protected field.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.protected_value_leaks(p_field_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(place text, table_token text, field_key text, row_id uuid, ref text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f custom.record;
  t record;
begin
  for f in select * from custom.record r
            where r.table_id = custom.field_kernel_id() and r.data_class = 'field' and r.deleted_at is null
              and custom.field_is_protected(r.data)
              and (p_field_id is null or r.id = p_field_id) loop
    select * into t from custom.entity_table(f.data ->> 'table_token');
    return query execute format(
      'select ''row''::text, %L::text, %L::text, x.id, null::text from %I.%I x '
      || 'where x.organization_id = $1 and jsonb_typeof(x.custom_fields) = ''object'' '
      || 'and (x.custom_fields ? $2 or coalesce((x.custom_fields -> ''_values'') ? $2, false))',
      t.token, f.data ->> 'key', t.schema_name, t.table_name)
      using f.organization_id, f.data ->> 'key';
    return query
      select 'history'::text, t.token::text, (f.data ->> 'key')::text, rv.row_id, rv.id::text
        from history.row_versions rv
       where rv.entity_type = t.token and rv.organization_id = f.organization_id
         and jsonb_typeof(rv.row_data -> 'custom_fields') = 'object'
         and ((rv.row_data -> 'custom_fields') ? (f.data ->> 'key')
              or coalesce((rv.row_data -> 'custom_fields' -> '_values') ? (f.data ->> 'key'), false));
  end loop;
  return query
    select 'search'::text, null::text, null::text, null::uuid, p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'platform' and p.proname like '\_search\_item\_sync\_%' and p.prosrc ~ 'custom_fields'
       and exists (select 1 from custom.record r
                    where r.table_id = custom.field_kernel_id() and r.data_class = 'field' and r.deleted_at is null
                      and custom.field_is_protected(r.data)
                      and (p_field_id is null or r.id = p_field_id));
end
$function$;
REVOKE ALL ON FUNCTION custom.protected_value_leaks(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 9. THE HISTORY EXCEPTION — ALLOWED BY THE CHAIR (2026-10-03) ONLY FOR THE FOLD: protecting an existing
-- field (and the HR fold, 4b, which protects HR's fields through this same door). Nothing else may call it. history.row_versions is append-only by doctrine
-- (and by grant: no client may update it; on the clone no trigger forbids the database owner, the
-- one vault barrier aside). Protecting a field that already has values must not leave them in old
-- snapshots, so this ONE function removes that one key from that token's snapshots in that
-- organization, after copying each value into custom.entity_protected_value_version with its
-- history id and time (operation 'protect_field_history'). It never touches a classified
-- (vault) entity type, never another key, never another organization. Separable: drop this
-- function and the protect door refuses any field whose values are already in history.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION history.protect_field_scrub(p_entity_type text, p_organization_id uuid, p_field_id uuid, p_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_n integer;
begin
  if current_setting('custom.protect_field_door', true) is distinct from p_field_id::text then
    raise exception 'History is rewritten only by the protect door, for the field it is protecting.'
      using errcode = '42501', hint = 'LANE7-W4A / chair ruling R2: custom.entity_field_protect_arman_explicitly_approved.';
  end if;
  if platform.is_service_only_history(p_entity_type) then
    raise exception 'The history of % is classified and is never rewritten.', p_entity_type using errcode = '42501';
  end if;
  insert into custom.entity_protected_value_version
    (organization_id, table_token, row_id, field_id, value, envelope, operation, history_version_id, occurred_at, actor_id)
  select rv.organization_id, p_entity_type, rv.row_id, p_field_id,
         rv.row_data -> 'custom_fields' -> p_key, rv.row_data -> 'custom_fields' -> '_values' -> p_key,
         'protect_field_history', rv.id, rv.occurred_at, rv.actor_id
    from history.row_versions rv
   where rv.entity_type = p_entity_type and rv.organization_id = p_organization_id
     and jsonb_typeof(rv.row_data -> 'custom_fields') = 'object'
     and ((rv.row_data -> 'custom_fields') ? p_key
          or coalesce((rv.row_data -> 'custom_fields' -> '_values') ? p_key, false));
  update history.row_versions rv
     set row_data = rv.row_data #- array['custom_fields', p_key] #- array['custom_fields', '_values', p_key]
   where rv.entity_type = p_entity_type and rv.organization_id = p_organization_id
     and jsonb_typeof(rv.row_data -> 'custom_fields') = 'object'
     and ((rv.row_data -> 'custom_fields') ? p_key
          or coalesce((rv.row_data -> 'custom_fields' -> '_values') ? p_key, false));
  get diagnostics v_n = row_count;
  return v_n;
end
$function$;
REVOKE ALL ON FUNCTION history.protect_field_scrub(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 10. THE PROTECT DOOR. Database owner only (the chair runs it on Arman's word, the ladder's gate,
-- exactly as custom.set_table_confidential_arman_explicitly_approved). In ONE transaction:
--   1. records Arman's words (platform.class_approval_by_arman, token custom.field:<id>);
--   2. marks the field protected (sensitivity confidential) with its readers;
--   3. moves the key's value out of every record of the token in the field's organization into
--      custom.entity_protected_value (each move a version, operation 'protect_field');
--   4. removes it from every history snapshot (R2, history.protect_field_scrub);
--   5. proves, with the G4a census, that no copy is left — or raises, and everything rolls back.
-- p_readers null: the readers the field already names, else the token's default readers. On a
-- field that is already protected it changes only whom it names (nothing moves).
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.entity_field_protect_arman_explicitly_approved(p_field_id uuid, p_readers jsonb, p_arman_words text, p_approved_on date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f         custom.record;
  t         record;
  v_rule    jsonb;
  v_key     text;
  v_readers jsonb;
  v_prob    text;
  v_id      bigint;
  v_was     boolean;
  v_rows    integer := 0;
  v_hist    integer := 0;
  v_hcopies boolean;
  v_left    text;
begin
  if p_field_id is null then
    raise exception 'Name the field to protect (p_field_id).' using errcode = '22004';
  end if;
  select * into f from custom.record r
   where r.id = p_field_id and r.table_id = custom.field_kernel_id() and r.data_class = 'field'
     and r.deleted_at is null
   for update;
  if not found or nullif(f.data ->> 'table_token', '') is null then
    raise exception 'There is no live field of a standard table with id %.', p_field_id using errcode = '02000';
  end if;
  v_key  := f.data ->> 'key';
  v_was  := custom.field_is_protected(f.data);
  v_rule := custom.protected_field_rule(f.data ->> 'table_token');
  select * into t from custom.entity_table(f.data ->> 'table_token');
  if v_rule is null then
    raise exception '% can''t keep a field that only named people read: no rule decides who they are.', t.label
      using errcode = '23514', hint = 'LANE7-W4A: custom/protected_field_rules names the tables that can.';
  end if;
  v_readers := coalesce(p_readers, f.data -> 'readers', v_rule -> 'readers');
  v_prob := custom.protected_readers_problem(f.data ->> 'table_token', v_readers);
  if v_prob is not null then
    raise exception '%', v_prob using errcode = '23514';
  end if;
  -- the copies a search projection would hold: none may read custom_fields (proven by name)
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'platform' and p.proname like '\_search\_item\_sync\_%' and p.prosrc ~ 'custom_fields') then
    raise exception 'A search projection reads custom fields, so a protected value could be left in search; nothing was changed.'
      using errcode = '55000', hint = 'LANE7-W4A: custom.protected_value_leaks() names it.';
  end if;

  v_id := platform._record_arman_class_approval('custom.field:' || p_field_id::text,
                                                'confidential'::platform.data_class,
                                                p_arman_words, p_approved_on);
  perform set_config('custom.protect_field_door', p_field_id::text, true);
  update custom.record r
     set data = r.data || jsonb_build_object(
                  'sensitivity', case when v_was then r.data ->> 'sensitivity' else 'confidential' end,
                  'readers', v_readers)
   where r.organization_id = f.organization_id and r.id = p_field_id;

  if not v_was then
    if nullif(v_rule ->> 'arm', '') is not null then
      execute format('select %s()', (v_rule ->> 'arm')::regproc::text);
    end if;
    -- 3. the records
    execute format(
      'insert into custom.entity_protected_value (organization_id, table_token, row_id, field_id, value, envelope, updated_at) '
      || 'select x.organization_id, %L, x.id, $3, x.custom_fields -> $2, x.custom_fields -> ''_values'' -> $2, now() '
      || 'from %I.%I x where x.organization_id = $1 and jsonb_typeof(x.custom_fields) = ''object'' '
      || 'and x.custom_fields ? $2 and jsonb_typeof(x.custom_fields -> $2) <> ''null'' '
      || 'on conflict (table_token, row_id, field_id) do update set value = excluded.value, envelope = excluded.envelope, updated_at = now()',
      t.token, t.schema_name, t.table_name)
      using f.organization_id, v_key, p_field_id;
    get diagnostics v_rows = row_count;
    insert into custom.entity_protected_value_version
      (organization_id, table_token, row_id, field_id, value, envelope, operation)
    select pv.organization_id, pv.table_token, pv.row_id, pv.field_id, pv.value, pv.envelope, 'protect_field'
      from custom.entity_protected_value pv
     where pv.field_id = p_field_id;
    execute format(
      'update %I.%I x set custom_fields = case when jsonb_typeof(x.custom_fields -> ''_values'') = ''object'' '
      || 'then jsonb_set(x.custom_fields - $2, ''{_values}'', (x.custom_fields -> ''_values'') - $2) '
      || 'else x.custom_fields - $2 end '
      || 'where x.organization_id = $1 and jsonb_typeof(x.custom_fields) = ''object'' '
      || 'and (x.custom_fields ? $2 or coalesce((x.custom_fields -> ''_values'') ? $2, false))',
      t.schema_name, t.table_name)
      using f.organization_id, v_key;

    -- 4. history (R2)
    select exists (select 1 from history.row_versions rv
                    where rv.entity_type = t.token and rv.organization_id = f.organization_id
                      and jsonb_typeof(rv.row_data -> 'custom_fields') = 'object'
                      and ((rv.row_data -> 'custom_fields') ? v_key
                           or coalesce((rv.row_data -> 'custom_fields' -> '_values') ? v_key, false)))
      into v_hcopies;
    if v_hcopies then
      if to_regprocedure('history.protect_field_scrub(text,uuid,uuid,text)') is null then
        raise exception '"%" already has values in the history of % records, and history is never rewritten without the chair''s ruling; nothing was changed.',
          coalesce(nullif(f.data ->> 'label', ''), v_key), t.label
          using errcode = '55000', hint = 'LANE7-W4A: chair ruling R2 (history.protect_field_scrub).';
      end if;
      execute 'select history.protect_field_scrub($1, $2, $3, $4)' into v_hist
        using t.token, f.organization_id, p_field_id, v_key;
    end if;
  end if;

  -- 5. nothing left, or nothing at all
  select string_agg(distinct l.place, ', ') into v_left from custom.protected_value_leaks(p_field_id) l;
  if v_left is not null then
    raise exception 'A copy of "%" is still in % after the move, so nothing was changed.',
      coalesce(nullif(f.data ->> 'label', ''), v_key), v_left
      using errcode = '55000', hint = 'LANE7-W4A G4a: custom.protected_value_leaks(field) names each copy.';
  end if;
  perform set_config('custom.protect_field_door', '', true);

  return jsonb_build_object('field_id', p_field_id, 'token', t.token, 'key', v_key,
                            'approval_id', v_id, 'readers', v_readers,
                            'already_protected', v_was,
                            'rows_moved', v_rows, 'history_versions_moved', v_hist);
end
$function$;
REVOKE ALL ON FUNCTION custom.entity_field_protect_arman_explicitly_approved(uuid, jsonb, text, date) FROM PUBLIC, anon, authenticated, service_role;
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 11. THE DRILL DOORS (drill_rows, drill_ask, drill_describe, the Table API and the MCP, which
-- all plan through platform._drill_plan). A protected custom field (cf:<id>) is, for a person
-- the rule admits to use it across rows, a column whose every row asks the rule again
-- (custom.protected_value); for anybody else it is not offered (describe, the API's columns),
-- and a question that filters, sorts, groups or adds it up is refused in a sentence — never
-- silently answered without it. A table with no protected field plans byte for byte as before.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform._drill_protect(p_def jsonb, p_question jsonb, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cols  jsonb := p_def -> '_c' -> 'cols';
  v_token text  := p_def -> '_c' -> 'fact' ->> 'token';
  v_q     jsonb := coalesce(p_question, '{}'::jsonb);
  v_drop  text[] := '{}'::text[];
  v_read  text[] := '{}'::text[];
  k       text;
  c       jsonb;
  f       custom.record;
  v_fid   uuid;
  v_verb  text;
  v_type  text;
begin
  if v_cols is null or jsonb_typeof(v_cols) <> 'object' then
    return p_def;
  end if;
  for k, c in select e.key, e.value from jsonb_each(v_cols) e
               where e.key like 'cf:%' and coalesce((e.value ->> 'custom')::boolean, false) loop
    begin
      v_fid := substr(k, 4)::uuid;
    exception when others then
      continue;
    end;
    select * into f from custom.record r
     where r.id = v_fid and r.table_id = custom.field_kernel_id() and r.data_class = 'field';
    continue when not found or not custom.field_is_protected(f.data);
    if coalesce(p_def -> '_c' -> 'fact' -> 'pk', '[]'::jsonb) = '["id"]'::jsonb
       and coalesce((custom.field_access(auth.uid(), v_fid, v_token, null, 'query', false) ->> 'allowed')::boolean, false) then
      v_type := coalesce(c ->> 'type', 'text');
      v_cols := jsonb_set(v_cols, array[k, 'expr'], to_jsonb(format(
        '(case when t.organization_id = %L::uuid then (custom.protected_value(%L, t.id, %L::uuid)%s)%s end)',
        f.organization_id, v_token, v_fid,
        case when v_type = 'jsonb' then '' else ' #>> ''{}''' end,
        case when v_type in ('jsonb', 'text') then '' else '::' || v_type end)));
      v_cols := jsonb_set(v_cols, array[k, 'protected'], 'true'::jsonb);
      v_read := v_read || k;
      continue;
    end if;
    if p_kind <> 'describe' and position(k in v_q::text) > 0 then
      v_verb := case
        when position(k in coalesce(v_q -> 'sort', 'null'::jsonb)::text) > 0 then 'sort by'
        when position(k in coalesce(v_q -> 'where', 'null'::jsonb)::text) > 0
          or position(k in coalesce(v_q -> 'window', 'null'::jsonb)::text) > 0 then 'filter by'
        when position(k in coalesce(v_q -> 'by', 'null'::jsonb)::text) > 0
          or position(k in coalesce(v_q -> 'across', 'null'::jsonb)::text) > 0 then 'group by'
        when position(k in coalesce(v_q -> 'show', 'null'::jsonb)::text) > 0 then 'add up'
        else 'use' end;
      raise exception '%', format('You can''t %s %s: only the people it names can read it.', v_verb,
                                  coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'))
        using errcode = '42501',
              hint = 'LANE7-W4A: a protected field is used across rows only by the people its rule names. Nothing was read.';
    end if;
    v_drop := v_drop || k;
  end loop;
  if cardinality(v_drop) = 0 and cardinality(v_read) = 0 then
    return p_def;
  end if;
  p_def := jsonb_set(p_def, '{_c,cols}', v_cols - v_drop);
  if jsonb_typeof(p_def -> 'api' -> 'columns') = 'array' then
    p_def := jsonb_set(p_def, '{api,columns}', coalesce((
      select jsonb_agg(case when x ->> 'api_name' = any (v_read)
                            then x || jsonb_build_object('protected', true, 'indexed', false) else x end
                       order by o)
        from jsonb_array_elements(p_def -> 'api' -> 'columns') with ordinality a(x, o)
       where not (coalesce(x ->> 'api_name', '') = any (v_drop))), '[]'::jsonb));
  end if;
  return p_def;
end
$function$;
REVOKE ALL ON FUNCTION platform._drill_protect(jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 12. THE SIX LIVE BODIES, edited by asserted fragment (the onehome_d2 pattern). Each edit carries
-- its marker LANE7-W4A[..]; a body that already carries it is skipped (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────────────────
do $do$
declare
  r     record;
  v_def text;
  v_n   integer;
begin
  for r in select * from (values
    ($w4a$custom._entity_custom_fields_guard()$w4a$, $w4a$  v_hdr      text;
$w4a$, $w4a$  v_hdr      text;
  -- LANE7-W4A[g1]: the protected fields this write may change (key -> field id), and one answer
  v_prot     jsonb := '{}'::jsonb;
  v_pa       jsonb;
  v_pkey     text;
  v_pval     jsonb;
  v_penv     jsonb;
  v_pold     record;
$w4a$, $w4a$LANE7-W4A[g1]$w4a$),
    ($w4a$custom._entity_custom_fields_guard()$w4a$, $w4a$  if not v_open then
    return new;
  end if;
$w4a$, $w4a$  -- LANE7-W4A[g2]: A PROTECTED VALUE NEVER LANDS IN THE ROW. With the store off nothing below runs,
  -- so a write that names a protected field's key is refused here rather than kept in the row.
  if not v_open
     and jsonb_typeof(v_row -> 'custom_fields') = 'object' and (v_row -> 'custom_fields') <> '{}'::jsonb
     and exists (select 1 from custom.record f
                  where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
                    and f.deleted_at is null and f.data ->> 'table_token' = v_token
                    and custom.field_is_protected(f.data)
                    and ((v_row -> 'custom_fields') ? (f.data ->> 'key')
                         or coalesce((v_row -> 'custom_fields' -> '_values') ? (f.data ->> 'key'), false))) then
    raise exception 'This organization''s records are not on the store, so a protected field''s value cannot be kept and nothing was written.'
      using errcode = '23514', hint = 'LANE7-W4A: a protected value lives only beside the row, in custom.entity_protected_value.';
  end if;
  if not v_open then
    return new;
  end if;
$w4a$, $w4a$LANE7-W4A[g2]$w4a$),
    ($w4a$custom._entity_custom_fields_guard()$w4a$, $w4a$      v_key := v_f.data ->> 'key';
$w4a$, $w4a$      v_key := v_f.data ->> 'key';
      continue when custom.field_is_protected(v_f.data);   -- LANE7-W4A[g3]: its own rule, below
$w4a$, $w4a$LANE7-W4A[g3]$w4a$),
    ($w4a$custom._entity_custom_fields_guard()$w4a$, $w4a$  -- NOTHING DECLARED, NOTHING TO ENVELOPE.$w4a$, $w4a$  -- LANE7-W4A[g4] (2026-10-03): A PROTECTED VALUE IS CHANGED ONLY BY THE PEOPLE ITS FIELD NAMES.
  -- A protected field (custom.field_is_protected) is asked through custom.field_access — the field's
  -- own rule and nothing else: no share, platform, creator, owner or organization lane — for every
  -- writer, every door. A client with no person behind it is refused; the platform's own writers
  -- (no person, not a client) are asked as such and recorded by the rule. Its value never stays in
  -- the row: step 5 below moves it beside the row. A key set to JSON null clears it.
  if v_fields is not null then
    v_bad := '{}'::text[];
    foreach v_f in array v_fields loop
      v_key := v_f.data ->> 'key';
      continue when v_key is null or not custom.field_is_protected(v_f.data);
      continue when not (v_doc ? v_key or coalesce((v_doc -> '_values') ? v_key, false));
      if v_me is null and coalesce(custom.caller_role()::text, '') in ('authenticated', 'anon') then
        v_pa := jsonb_build_object('allowed', false);
      else
        v_pa := custom.field_access(v_me, v_f.id, v_token, (v_row ->> 'id')::uuid, 'edit', true);
      end if;
      if coalesce((v_pa ->> 'allowed')::boolean, false) then
        v_prot := v_prot || jsonb_build_object(v_key, v_f.id::text);
      else
        v_bad := v_bad || coalesce(nullif(v_f.data ->> 'label', ''), v_key);
      end if;
    end loop;
    if cardinality(v_bad) > 0 then
      select e.label into v_label from custom.entity_table(v_token) e;
      select string_agg(format('"%s"', x), ', ' order by x) into v_list from unnest(v_bad) x;
      raise exception 'Only the people it names can change % on this %, so nothing was written.',
                      v_list, lower(coalesce(v_label, v_token))
        using errcode = '42501',
              hint = 'LANE7-W4A: a protected field is written only by the people its rule names (custom.field_access).';
    end if;
  end if;

  -- NOTHING DECLARED, NOTHING TO ENVELOPE.$w4a$, $w4a$LANE7-W4A[g4]$w4a$),
    ($w4a$custom._entity_custom_fields_guard()$w4a$, $w4a$  new.custom_fields := v_doc;
  return new;
end;$w4a$, $w4a$  -- LANE7-W4A[g5]: 5. EACH PROTECTED VALUE MOVES BESIDE THE ROW, with its envelope; every write and
  -- clear is a version. The row keeps neither the value nor its envelope.
  for v_pkey in select jsonb_object_keys(v_prot) loop
    v_pval := v_doc -> v_pkey;
    v_penv := case when jsonb_typeof(v_doc -> '_values') = 'object' then v_doc -> '_values' -> v_pkey end;
    if v_pval is not null and jsonb_typeof(v_pval) = 'null' then
      delete from custom.entity_protected_value pv
       where pv.table_token = v_token and pv.row_id = (v_row ->> 'id')::uuid and pv.field_id = (v_prot ->> v_pkey)::uuid;
      insert into custom.entity_protected_value_version
        (organization_id, table_token, row_id, field_id, value, envelope, operation, actor_id)
      values (v_org, v_token, (v_row ->> 'id')::uuid, (v_prot ->> v_pkey)::uuid, null, null, 'clear', v_me);
    elsif v_pval is not null then
      select pv.value, pv.envelope into v_pold from custom.entity_protected_value pv
       where pv.table_token = v_token and pv.row_id = (v_row ->> 'id')::uuid and pv.field_id = (v_prot ->> v_pkey)::uuid;
      if v_penv is not null and jsonb_typeof(v_penv) = 'object' then
        v_penv := jsonb_set(v_penv, '{ver}', to_jsonb(case
          when v_pold.envelope is null then 1
          when v_pold.value is distinct from v_pval then coalesce((v_pold.envelope ->> 'ver')::integer, 0) + 1
          else coalesce((v_pold.envelope ->> 'ver')::integer, 1) end));
      end if;
      insert into custom.entity_protected_value as pv
        (organization_id, table_token, row_id, field_id, value, envelope, updated_at, updated_by)
      values (v_org, v_token, (v_row ->> 'id')::uuid, (v_prot ->> v_pkey)::uuid, v_pval, v_penv, now(), v_me)
      on conflict (table_token, row_id, field_id)
        do update set value = excluded.value, envelope = excluded.envelope, updated_at = now(), updated_by = excluded.updated_by;
      insert into custom.entity_protected_value_version
        (organization_id, table_token, row_id, field_id, value, envelope, operation, actor_id)
      values (v_org, v_token, (v_row ->> 'id')::uuid, (v_prot ->> v_pkey)::uuid, v_pval, v_penv, 'write', v_me);
    end if;
    v_doc := v_doc - v_pkey;
    if jsonb_typeof(v_doc -> '_values') = 'object' then
      v_doc := jsonb_set(v_doc, '{_values}', (v_doc -> '_values') - v_pkey);
    end if;
  end loop;

  new.custom_fields := v_doc;
  return new;
end;$w4a$, $w4a$LANE7-W4A[g5]$w4a$),
    ($w4a$custom._field_shape_guard()$w4a$, $w4a$  v_archived  text;   -- UI-FIX-19: the name of an archived choices table
$w4a$, $w4a$  v_archived  text;   -- UI-FIX-19: the name of an archived choices table
  v_protect   text;   -- LANE7-W4A[s1]: the protected-field shape rule's refusal, if any
$w4a$, $w4a$LANE7-W4A[s1]$w4a$),
    ($w4a$custom._field_shape_guard()$w4a$, $w4a$  -- LANE7-SEC (2026-10-02): A PROMISE THE STORE CANNOT KEEP IS REFUSED.$w4a$, $w4a$  -- LANE7-W4A[s2] (2026-10-03): A PROTECTED FIELD (sensitivity above internal on a standard table
  -- whose token has a rule in custom/protected_field_rules) keeps its values beside the row, so the
  -- promise can be kept there. custom.field_protection_refusal judges its readers, refuses making an
  -- existing field protected or changing whom it names outside the protect door, and refuses
  -- un-protecting. A token with no rule falls through to the LANE7-SEC block, unchanged.
  -- (asked only when protection is involved, so no other field write calls anything new)
  if tg_op = 'UPDATE' and ((nullif(d ->> 'table_token', '') is not null and coalesce(d ->> 'sensitivity', 'internal') in ('confidential', 'restricted')) or (nullif(old.data ->> 'table_token', '') is not null and coalesce(old.data ->> 'sensitivity', 'internal') in ('confidential', 'restricted'))) then
    v_protect := custom.field_protection_refusal(tg_op, old.data, d, new.id);
  elsif tg_op = 'INSERT' and (nullif(d ->> 'table_token', '') is not null and coalesce(d ->> 'sensitivity', 'internal') in ('confidential', 'restricted')) then
    v_protect := custom.field_protection_refusal(tg_op, null, d, new.id);
  end if;
  if v_protect is not null then
    raise exception '%', v_protect
      using errcode = '23514', hint = 'LANE7-W4A: custom.entity_field_protect_arman_explicitly_approved protects a field and moves its values.';
  end if;

  -- LANE7-SEC (2026-10-02): A PROMISE THE STORE CANNOT KEEP IS REFUSED.$w4a$, $w4a$LANE7-W4A[s2]$w4a$),
    ($w4a$custom._field_shape_guard()$w4a$, $w4a$     and custom.sensitivity_rank(coalesce(d ->> 'sensitivity', 'internal')) > custom.sensitivity_rank('internal')
$w4a$, $w4a$     and custom.sensitivity_rank(coalesce(d ->> 'sensitivity', 'internal')) > custom.sensitivity_rank('internal')
     and custom.protected_field_rule(v_token) is null   -- LANE7-W4A[s3]: a token with a rule keeps it beside the row
$w4a$, $w4a$LANE7-W4A[s3]$w4a$),
    ($w4a$custom.entity_field_declare(uuid,text,jsonb)$w4a$, $w4a$  v_key := v_doc ->> 'key';
$w4a$, $w4a$  v_key := v_doc ->> 'key';
  -- LANE7-W4A[d1]: A PROTECTED FIELD NAMES ITS READERS: the ones asked for, else the table's default
  -- readers (custom/protected_field_rules). The shape guard judges them and the table's rule.
  if custom.field_is_protected(v_doc) then
    v_doc := v_doc || jsonb_build_object('readers', coalesce(
      case when jsonb_typeof(p_spec -> 'readers') = 'array' then p_spec -> 'readers' end,
      custom.protected_field_rule(p_token) -> 'readers'));
  end if;
$w4a$, $w4a$LANE7-W4A[d1]$w4a$),
    ($w4a$custom.entity_record_read(uuid,text,uuid)$w4a$, $w4a$  v_written  jsonb;
$w4a$, $w4a$  v_written  jsonb;
  v_prot     jsonb;   -- LANE7-W4A[r1]: this row's protected values, for this person
$w4a$, $w4a$LANE7-W4A[r1]$w4a$),
    ($w4a$custom.entity_record_read(uuid,text,uuid)$w4a$, $w4a$  select coalesce(array_agg(x), '{}'::text[]) into v_excluded from jsonb_array_elements_text(v_mask -> 'excluded') x;
$w4a$, $w4a$  select coalesce(array_agg(x), '{}'::text[]) into v_excluded from jsonb_array_elements_text(v_mask -> 'excluded') x;
  -- LANE7-W4A[r2]: PROTECTED VALUES live beside the row. The ones this person's field rule admits are
  -- read (and audited by the rule); every other one is withheld with the store's notice.
  -- (Asked only when the table has a protected field: a table without one reads exactly as before.)
  if exists (select 1 from custom.entity_fields(p_organization_id, p_token) pf
              where (nullif(pf.data ->> 'table_token', '') is not null and coalesce(pf.data ->> 'sensitivity', 'internal') in ('confidential', 'restricted'))) then
    if has_function_privilege('custom.protected_values(uuid,text,uuid)', 'execute') then
      v_prot := custom.protected_values(p_organization_id, p_token, p_record_id);
    else
      -- a seat the read door is not open to is told each value is withheld, never an error
      select jsonb_build_object('keys', coalesce(jsonb_agg(pf.data ->> 'key'), '[]'::jsonb), 'values', '{}'::jsonb,
                                'written', '{}'::jsonb,
                                'hidden', coalesce(jsonb_object_agg(pf.data ->> 'key', jsonb_build_object('reason', pf.data ->> 'sensitivity', 'needs', 'one of the people it names',
                                    'says', format('Only the people it names can read %s.', coalesce(nullif(pf.data ->> 'label', ''), pf.data ->> 'key')))), '{}'::jsonb))
        into v_prot
        from custom.entity_fields(p_organization_id, p_token) pf
       where (nullif(pf.data ->> 'table_token', '') is not null and coalesce(pf.data ->> 'sensitivity', 'internal') in ('confidential', 'restricted')) and pf.data ->> 'key' is not null;
    end if;
  end if;
  if v_prot is not null then
    v_doc := v_doc || (v_prot -> 'values');
    if (v_prot -> 'written') <> '{}'::jsonb then
      v_doc := jsonb_set(v_doc, '{_values}',
                 coalesce(case when jsonb_typeof(v_doc -> '_values') = 'object' then v_doc -> '_values' end, '{}'::jsonb)
                 || (v_prot -> 'written'));
    end if;
    select coalesce(array_agg(x), '{}'::text[]) into v_visible from unnest(v_visible) x
     where not ((v_prot -> 'keys') ? x);
    v_visible := v_visible || array(select k from jsonb_array_elements_text(v_prot -> 'keys') k
                                     where not ((v_prot -> 'hidden') ? k));
    v_mask := jsonb_set(v_mask, '{notices}',
                ((v_mask -> 'notices') - array(select jsonb_array_elements_text(v_prot -> 'keys'))) || (v_prot -> 'hidden'));
    select coalesce(array_agg(x), '{}'::text[]) into v_hidden from jsonb_object_keys(v_mask -> 'notices') x;
  end if;
$w4a$, $w4a$LANE7-W4A[r2]$w4a$),
    ($w4a$custom.entity_records_find(uuid,text,text,jsonb,integer,integer)$w4a$, $w4a$  v_got    int;
$w4a$, $w4a$  v_got    int;
  v_pf     custom.record;   -- LANE7-W4A[f1]
$w4a$, $w4a$LANE7-W4A[f1]$w4a$),
    ($w4a$custom.entity_records_find(uuid,text,text,jsonb,integer,integer)$w4a$, $w4a$Declare it first, or ask for the fields this table has.';
  end if;
$w4a$, $w4a$Declare it first, or ask for the fields this table has.';
  end if;

  -- LANE7-W4A[f2]: A PROTECTED FIELD is found beside the row: custom.protected_matches refuses, in a
  -- sentence, a person its rule does not admit to use the field across rows, and returns only the
  -- rows whose value she may read; the table itself is still read as her.
  select * into v_pf from custom.entity_fields(p_organization_id, p_token) f where f.data ->> 'key' = p_key limit 1;
  if (nullif(v_pf.data ->> 'table_token', '') is not null and coalesce(v_pf.data ->> 'sensitivity', 'internal') in ('confidential', 'restricted')) then
    execute format(
      'select coalesce(jsonb_agg(jsonb_build_object(''id'', x.id, ''title'', %s, ''value'', x._pv) order by x.id), ''[]''::jsonb) '
      || 'from (select y.*, m.value as _pv from custom.protected_matches($1, $2) m join %I.%I y on y.id = m.row_id '
      ||       'where y.organization_id = $3 %s order by y.id limit $4 offset $5) x',
      case when t.title_column is null then 'null::text' else format('x.%I::text', t.title_column) end,
      t.schema_name, t.table_name,
      case when t.has_deleted_at then 'and y.deleted_at is null' else '' end)
      into v_rows using v_pf.id, p_value, p_organization_id, v_lim, greatest(coalesce(p_offset, 0), 0);
    v_got := jsonb_array_length(v_rows);
    return jsonb_build_object('token', t.token, 'label', t.label, 'key', p_key,
                              'value', p_value, 'rows', v_rows, 'count', v_got,
                              'page', jsonb_build_object(
                                'requested', v_lim, 'returned', v_got,
                                'ceiling',   custom.page_ceiling(p_organization_id),
                                'next',      case when v_got = v_lim
                                                  then greatest(coalesce(p_offset, 0), 0) + v_lim else null end));
  end if;
$w4a$, $w4a$LANE7-W4A[f2]$w4a$),
    ($w4a$platform._drill_plan(uuid,jsonb,jsonb,text)$w4a$, $w4a$    v_def := platform._drill_resolve(p_organization_id, p_source ->> 'token');
$w4a$, $w4a$    v_def := platform._drill_resolve(p_organization_id, p_source ->> 'token');
    v_def := platform._drill_protect(v_def, q, p_kind);   -- LANE7-W4A[p1]: protected custom fields
$w4a$, $w4a$LANE7-W4A[p1]$w4a$)
  ) t(fn, old_frag, new_frag, mark)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.mark in v_def) > 0 then
      continue;   -- already carries this edit (idempotent)
    end if;
    v_n := (length(v_def) - length(replace(v_def, r.old_frag, ''))) / length(r.old_frag);
    if v_n <> 1 then
      raise exception 'LANE7-W4A: % carries the expected fragment % times, not once (edit %) — its body moved; re-read it and re-base this file', r.fn, v_n, r.mark;
    end if;
    execute replace(v_def, r.old_frag, r.new_frag);
  end loop;
end
$do$;

-- A granted read of a protected value is audited by its rule, so the record read writes: VOLATILE.
ALTER FUNCTION custom.entity_record_read(uuid, text, uuid) VOLATILE;
