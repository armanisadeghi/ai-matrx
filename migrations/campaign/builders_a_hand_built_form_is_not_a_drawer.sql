-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.form_declare(uuid, uuid, text, jsonb, jsonb, integer, uuid, uuid, uuid, text) 9f2461ca4a825aebda899d78cd1c2e1cb275e906703ec3eb9ac31c2f22ea937f
--
-- A FORM BUILT BY HAND ACCEPTED NOTHING, AND SAID IT WAS OPEN.
--
-- WHAT THE FIRST BROWSER WALK FOUND (lane BUILDERS, 2026-09-21). The studio
-- manager of Ironline Fitness built a class-signup form in the Forms rail,
-- published it, and the screen said "Open — anyone with the link can answer
-- it." A stranger opened the link and answered. The answer came back
-- "Your answer arrived and is waiting for someone to look at it", the member
-- never reached the grid, and nobody was told anything had happened. The form
-- row: `quarantine_rule_id` NULL, `notify_rule_id` NULL.
--
-- THAT IS BY CONSTRUCTION, AND IT IS THE WHOLE DEFECT CLASS THIS LANE EXISTS TO
-- CLOSE. `custom.form_submit` writes a record only when the form's accept Rule
-- admits the submission; with no accept Rule every answer is held for a person.
-- The AGENT path never hits this, because `form_propose` builds the accept Rule
-- itself in Python before it calls this door. The HAND path had no maker at all.
-- So the two ways to get a form produced two different objects wearing one name:
-- the agent's worked and the person's was a drawer nobody was watching.
--
-- THE FIX IS THE DOOR'S, NOT A SCREEN'S. A second maker in TypeScript would be
-- a third idea of what "this form accepts an answer" means. `custom.form_declare`
-- already computes the required keys of every question it is given, so it is the
-- one place that can answer "is this submission complete?" — and from today it
-- MAKES that Rule when the caller did not bring one. `form_propose` passes an
-- explicit id and is untouched; a re-statement that already carries a Rule keeps
-- it; and the expression and the naming are BYTE-FOR-BYTE the ones
-- `matrx_records/store/client.py` writes, so an agent's form and a hand-built
-- form are the same object.
--
-- NOTIFY IS DELIBERATELY NOT DEFAULTED. "Tell nobody" is a real answer a person
-- gives, and this door cannot tell it apart from "nothing was said", so guessing
-- here would silently subscribe somebody. The builder asks the question instead.
--
-- THE INVERSE: `migrations/inverse/builders_a_hand_built_form_is_not_a_drawer_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.form_declare(p_organization_id uuid,
                                    p_table_id uuid,
                                    p_title text,
                                    p_questions jsonb,
                                    p_presentation jsonb default '{}'::jsonb,
                                    p_submission_cap integer default null,
                                    p_quarantine_rule_id uuid default null,
                                    p_notify_rule_id uuid default null,
                                    p_form_id uuid default null,
                                    p_slug text default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_user     uuid := custom.query_principal();
  v_keys     text[];
  v_q        jsonb;
  v_key      text;
  v_exposed  text[] := array[]::text[];
  v_required text[] := array[]::text[];
  v_slug     text;
  v_id       uuid;
  v_hp       text;
  v_present  jsonb;
  -- The accept Rule this door makes when the caller brought none.
  v_accept   uuid := p_quarantine_rule_id;
  v_ids      uuid[] := array[]::uuid[];
  v_fid      uuid;
  v_expr     jsonb;
  v_args     jsonb := '[]'::jsonb;
  v_aname    text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.form_declare');

  -- A FORM DECIDES WHAT STRANGERS MAY WRITE INTO A TABLE, so declaring one is an admin
  -- act on that Table — the same rung custom.anon_publish already asks for. Asking less
  -- here and more at publish would let anyone assemble the loaded gun and only check who
  -- pulls the trigger.
  if v_user is null then
    raise exception 'Nobody is signed in, so no form can be made.'
      using errcode = '42501',
            hint = 'custom.form_declare is the owner''s side of a form. The public side — custom.form_public and custom.form_submit — is the one that has no principal.';
  end if;
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.form_declare',
                                          'admin'::public.permission_level, 'table');

  -- The subject has to be a TABLE of this organization, and the fields it declares are
  -- the only things a question may ask for.
  select array_agg(f ->> 'name') into v_keys
    from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_keys is null then
    raise exception 'There is no table % in this organization to make a form for.', p_table_id
      using errcode = '23503',
            hint = 'A form is a view on a real Table (SCR-13). Make the Table first — every question is one of its Fields and every answer is one of its records.';
  end if;

  if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'A form has to ask something.'
      using errcode = '22004',
            hint = 'questions is a list of {"field": "<the field''s key on this table>", "ask": "…", "help": "…", "required": true|false}. The field key is the address; ask and help are this form''s own words for it.';
  end if;

  for v_q in select value from jsonb_array_elements(p_questions) loop
    v_key := nullif(btrim(coalesce(v_q ->> 'field', v_q ->> 'key', '')), '');
    if v_key is null then
      raise exception 'One of this form''s questions does not say which field it asks for.'
        using errcode = '22004',
              hint = 'Every question names a Field of the subject table by key. The table''s fields are: ' || array_to_string(v_keys, ', ') || '.';
    end if;
    if not (v_key = any (v_keys)) then
      raise exception 'This table has no field called "%", so the form cannot ask for it.', v_key
        using errcode = '23503',
              hint = format('Its fields are: %s. Add the Field first, or ask for one that is there — a question with nowhere to land is an answer nobody can read.',
                            array_to_string(v_keys, ', '));
    end if;
    if not (v_key = any (v_exposed)) then
      v_exposed := v_exposed || v_key;
    end if;
    if coalesce((v_q ->> 'required')::boolean, false) and not (v_key = any (v_required)) then
      v_required := v_required || v_key;
    end if;
  end loop;

  -- ─────────────────────────────────────────────────────────────────────────
  -- THE ACCEPT RULE, WHEN NOBODY BROUGHT ONE.
  --
  -- Without it `custom.form_submit` holds every answer for a person and the
  -- form is a drawer. The Rule is REC-15's own shape, referencing Fields BY ID
  -- (REC-17) — a Rule naming a field by its KEY is refused, and it is right to.
  -- With nothing required the test is honestly a constant, and it says so in
  -- its own name rather than pretending to check something.
  -- ─────────────────────────────────────────────────────────────────────────
  if v_accept is null then
    foreach v_key in array v_required loop
      select r.id into v_fid
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.field_kernel_id()
         and r.deleted_at is null
         and r.data ->> 'key' = v_key
         and nullif(r.data ->> 'table_id', '')::uuid = p_table_id
       limit 1;
      if v_fid is not null then
        v_ids := v_ids || v_fid;
      end if;
    end loop;

    if array_length(v_ids, 1) is null then
      v_expr := jsonb_build_object('const', true);
      v_aname := coalesce(nullif(btrim(p_title), ''), 'This form') || ': take every answer';
    else
      foreach v_fid in array v_ids loop
        v_args := v_args || jsonb_build_array(
          jsonb_build_object('op', 'present',
                             'args', jsonb_build_array(jsonb_build_object('field', v_fid))));
      end loop;
      if jsonb_array_length(v_args) = 1 then
        v_expr := v_args -> 0;
      else
        v_expr := jsonb_build_object('op', 'and', 'args', v_args);
      end if;
      v_aname := coalesce(nullif(btrim(p_title), ''), 'This form')
                 || ': every answer it asks for is there';
    end if;

    v_accept := custom.rule_declare(p_organization_id, jsonb_build_object(
      'name', v_aname,
      'kind', 'predicate',
      'uses', jsonb_build_array('validate'),
      'scope_table_id', p_table_id,
      'applies_to_types', '[]'::jsonb,
      'expr', v_expr,
      'description',
        'DOOR-17: an anonymous answer lands quarantined and becomes a record only when '
        || 'this Rule admits it. It is the form''s validation and its release in one '
        || 'object, so the two cannot disagree. Made by custom.form_declare because the '
        || 'caller brought none — without it every answer is held for a person forever.'
    ), null);
  end if;

  -- The presentation carries the questions as the form WORDS them; the answerable key
  -- list is what the door enforces. One object, two readers, no third place to drift.
  v_present := coalesce(p_presentation, '{}'::jsonb) || jsonb_build_object('questions', p_questions);

  if p_form_id is not null then
    select honeypot_key into v_hp from custom.anon_form
     where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
    if v_hp is null and not found then
      raise exception 'There is no form % in this organization.', p_form_id
        using errcode = '23503';
    end if;
  end if;
  -- ONE decoy per form, minted once and kept, so a bot cannot learn the name by watching
  -- two forms. `extensions.` is written out because search_path is pg_catalog here.
  v_hp := coalesce(v_hp, 'confirm_' || encode(extensions.gen_random_bytes(5), 'hex'));
  v_slug := coalesce(nullif(btrim(p_slug), ''), custom.form_slug(p_organization_id, p_title, p_form_id));

  if p_form_id is null then
    insert into custom.anon_form (organization_id, table_id, slug, title, exposed_field_keys,
                                  required_field_keys, presentation, submission_cap,
                                  quarantine_rule_id, notify_rule_id, honeypot_key)
    values (p_organization_id, p_table_id, v_slug, nullif(btrim(p_title), ''),
            to_jsonb(v_exposed), to_jsonb(v_required), v_present, p_submission_cap,
            v_accept, p_notify_rule_id, v_hp)
    returning id into v_id;
  else
    update custom.anon_form
       set table_id = p_table_id,
           slug = v_slug,
           title = nullif(btrim(p_title), ''),
           exposed_field_keys = to_jsonb(v_exposed),
           required_field_keys = to_jsonb(v_required),
           presentation = v_present,
           submission_cap = p_submission_cap,
           quarantine_rule_id = v_accept,
           notify_rule_id = p_notify_rule_id,
           honeypot_key = v_hp
     where organization_id = p_organization_id and id = p_form_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'There is no form % in this organization.', p_form_id
        using errcode = '23503';
    end if;
  end if;

  return v_id;
end;
$fn$;

comment on function custom.form_declare(uuid, uuid, text, jsonb, jsonb, integer, uuid, uuid, uuid, text) is
  'SCR-13 / PRODUCTS row 1: create or re-state ONE form over one Table. Needs `admin` on it. A question naming no Field of that Table is refused BY NAME. Since 2026-09-21 it MAKES the accept Rule when the caller brought none — without one custom.form_submit holds every answer for a person and a hand-built form is a drawer nobody is watching.';
