-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.form_public(uuid) 448a123f2707d722bd4d06b518cb4d48970595f16afa29c2a7907c5f095a135a
--
-- LANE FORMS — THE PUBLIC FACE WAS HANDING OUT FIELDS WITH NO IDENTITY.
--
-- `custom.form_public` answered `jsonb_agg(f.data)`, and `f.data` is the Field
-- DOCUMENT — key, label, type, unit, config, rules — with the Field's id nowhere in
-- it, because the id is the record's own column. Every other reader of a Field in this
-- platform builds it the way `@ai-matrx/records`' `fields()` does:
--
--     rows.map((row) => ({ id: row.id, ...row.data }) as Field)
--
-- so a public form's Fields were the ONLY Fields on the platform arriving without one,
-- and any control that addresses a Field by id — a relation picker asking for its
-- options, a per-field refusal naming which field — would have had nothing to address.
-- It is a shape divergence rather than a crash, which is exactly the kind that is found
-- late and in front of somebody.
--
-- One expression changes. Everything else in this body is byte-for-byte what was there.
--
-- THE INVERSE: `migrations/inverse/forms_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.form_public(p_form_id uuid)
returns table(form_id uuid, organization_id uuid, table_id uuid, title text,
              presentation jsonb, fields jsonb, honeypot_key text,
              state text, message text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f      custom.anon_form;
  v_count  bigint;
  v_state  text;
  v_msg    text;
  v_fields jsonb;
begin
  if p_form_id is null then return; end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found then return; end if;
  -- The store's own switch, asked silently: an organization that does not keep its data
  -- here has no form to show, and saying WHICH of the three reasons it is would be the
  -- leak this function exists to avoid.
  if not custom.store_is_open(v_f.organization_id) then return; end if;
  if v_f.published_at is null then return; end if;

  select count(*) into v_count from custom.anon_submission s
   where s.organization_id = v_f.organization_id and s.form_id = v_f.id and s.state <> 'rejected';

  if v_f.closed_at is not null then
    v_state := 'closed';
    v_msg := 'This form is closed, so it is not taking any more answers.';
  elsif v_f.submission_cap is not null and v_count >= v_f.submission_cap then
    v_state := 'full';
    v_msg := 'This form has all the answers it was set up to take.';
  else
    v_state := 'open';
    v_msg := null;
  end if;

  -- EXACTLY the exposed Fields, as the store holds them, each carrying its own id —
  -- the same `{id, ...data}` shape every other reader of a Field builds.
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id) || f.data order by ord), '[]'::jsonb)
    into v_fields
    from jsonb_array_elements_text(v_f.exposed_field_keys) with ordinality k(key, ord)
    join custom.record f
      on f.organization_id = v_f.organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_f.table_id
     and f.data ->> 'key' = k.key;

  form_id := v_f.id; organization_id := v_f.organization_id; table_id := v_f.table_id;
  title := coalesce(v_f.title, 'Form'); presentation := v_f.presentation;
  fields := v_fields; honeypot_key := v_f.honeypot_key; state := v_state; message := v_msg;
  return next;
end;
$fn$;
