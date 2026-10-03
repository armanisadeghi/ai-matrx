-- inverse of lane7w4a_b_a_protected_field_is_read_by_the_people_it_names.sql — removes each fragment (asserted) and drops the new functions.
-- Refused while any protected field exists (its values would become unreadable to everybody).
set local lock_timeout = '3s';
do $$
begin
  if exists (select 1 from custom.record r where r.table_id = custom.field_kernel_id() and r.data_class = 'field'
              and r.deleted_at is null and custom.field_is_protected(r.data)) then
    raise exception 'A protected field exists; taking its doors away would leave its values unreadable. Nothing was changed.' using errcode = '55000';
  end if;
end $$;
do $do$
declare
  r     record;
  v_def text;
  v_n   integer;
begin
  for r in select * from (values
    ($w4a$platform._drill_plan(uuid,jsonb,jsonb,text)$w4a$, $w4a$    v_def := platform._drill_resolve(p_organization_id, p_source ->> 'token');
    v_def := platform._drill_protect(v_def, q, p_kind);   -- LANE7-W4A[p1]: protected custom fields
$w4a$, $w4a$    v_def := platform._drill_resolve(p_organization_id, p_source ->> 'token');
$w4a$, $w4a$LANE7-W4A[p1]$w4a$),
    ($w4a$custom.entity_records_find(uuid,text,text,jsonb,integer,integer)$w4a$, $w4a$Declare it first, or ask for the fields this table has.';
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
$w4a$, $w4a$Declare it first, or ask for the fields this table has.';
  end if;
$w4a$, $w4a$LANE7-W4A[f2]$w4a$),
    ($w4a$custom.entity_records_find(uuid,text,text,jsonb,integer,integer)$w4a$, $w4a$  v_got    int;
  v_pf     custom.record;   -- LANE7-W4A[f1]
$w4a$, $w4a$  v_got    int;
$w4a$, $w4a$LANE7-W4A[f1]$w4a$),
    ($w4a$custom.entity_record_read(uuid,text,uuid)$w4a$, $w4a$  select coalesce(array_agg(x), '{}'::text[]) into v_excluded from jsonb_array_elements_text(v_mask -> 'excluded') x;
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
$w4a$, $w4a$  select coalesce(array_agg(x), '{}'::text[]) into v_excluded from jsonb_array_elements_text(v_mask -> 'excluded') x;
$w4a$, $w4a$LANE7-W4A[r2]$w4a$),
    ($w4a$custom.entity_record_read(uuid,text,uuid)$w4a$, $w4a$  v_written  jsonb;
  v_prot     jsonb;   -- LANE7-W4A[r1]: this row's protected values, for this person
$w4a$, $w4a$  v_written  jsonb;
$w4a$, $w4a$LANE7-W4A[r1]$w4a$),
    ($w4a$custom.entity_field_declare(uuid,text,jsonb)$w4a$, $w4a$  v_key := v_doc ->> 'key';
  -- LANE7-W4A[d1]: A PROTECTED FIELD NAMES ITS READERS: the ones asked for, else the table's default
  -- readers (custom/protected_field_rules). The shape guard judges them and the table's rule.
  if custom.field_is_protected(v_doc) then
    v_doc := v_doc || jsonb_build_object('readers', coalesce(
      case when jsonb_typeof(p_spec -> 'readers') = 'array' then p_spec -> 'readers' end,
      custom.protected_field_rule(p_token) -> 'readers'));
  end if;
$w4a$, $w4a$  v_key := v_doc ->> 'key';
$w4a$, $w4a$LANE7-W4A[d1]$w4a$),
    ($w4a$custom._field_shape_guard()$w4a$, $w4a$     and custom.sensitivity_rank(coalesce(d ->> 'sensitivity', 'internal')) > custom.sensitivity_rank('internal')
     and custom.protected_field_rule(v_token) is null   -- LANE7-W4A[s3]: a token with a rule keeps it beside the row
$w4a$, $w4a$     and custom.sensitivity_rank(coalesce(d ->> 'sensitivity', 'internal')) > custom.sensitivity_rank('internal')
$w4a$, $w4a$LANE7-W4A[s3]$w4a$),
    ($w4a$custom._field_shape_guard()$w4a$, $w4a$  -- LANE7-W4A[s2] (2026-10-03): A PROTECTED FIELD (sensitivity above internal on a standard table
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

  -- LANE7-SEC (2026-10-02): A PROMISE THE STORE CANNOT KEEP IS REFUSED.$w4a$, $w4a$  -- LANE7-SEC (2026-10-02): A PROMISE THE STORE CANNOT KEEP IS REFUSED.$w4a$, $w4a$LANE7-W4A[s2]$w4a$),
    ($w4a$custom._field_shape_guard()$w4a$, $w4a$  v_archived  text;   -- UI-FIX-19: the name of an archived choices table
  v_protect   text;   -- LANE7-W4A[s1]: the protected-field shape rule's refusal, if any
$w4a$, $w4a$  v_archived  text;   -- UI-FIX-19: the name of an archived choices table
$w4a$, $w4a$LANE7-W4A[s1]$w4a$),
    ($w4a$custom._entity_custom_fields_guard()$w4a$, $w4a$  -- LANE7-W4A[g5]: 5. EACH PROTECTED VALUE MOVES BESIDE THE ROW, with its envelope; every write and
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
end;$w4a$, $w4a$  new.custom_fields := v_doc;
  return new;
end;$w4a$, $w4a$LANE7-W4A[g5]$w4a$),
    ($w4a$custom._entity_custom_fields_guard()$w4a$, $w4a$  -- LANE7-W4A[g4] (2026-10-03): A PROTECTED VALUE IS CHANGED ONLY BY THE PEOPLE ITS FIELD NAMES.
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

  -- NOTHING DECLARED, NOTHING TO ENVELOPE.$w4a$, $w4a$  -- NOTHING DECLARED, NOTHING TO ENVELOPE.$w4a$, $w4a$LANE7-W4A[g4]$w4a$),
    ($w4a$custom._entity_custom_fields_guard()$w4a$, $w4a$      v_key := v_f.data ->> 'key';
      continue when custom.field_is_protected(v_f.data);   -- LANE7-W4A[g3]: its own rule, below
$w4a$, $w4a$      v_key := v_f.data ->> 'key';
$w4a$, $w4a$LANE7-W4A[g3]$w4a$),
    ($w4a$custom._entity_custom_fields_guard()$w4a$, $w4a$  -- LANE7-W4A[g2]: A PROTECTED VALUE NEVER LANDS IN THE ROW. With the store off nothing below runs,
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
$w4a$, $w4a$  if not v_open then
    return new;
  end if;
$w4a$, $w4a$LANE7-W4A[g2]$w4a$),
    ($w4a$custom._entity_custom_fields_guard()$w4a$, $w4a$  v_hdr      text;
  -- LANE7-W4A[g1]: the protected fields this write may change (key -> field id), and one answer
  v_prot     jsonb := '{}'::jsonb;
  v_pa       jsonb;
  v_pkey     text;
  v_pval     jsonb;
  v_penv     jsonb;
  v_pold     record;
$w4a$, $w4a$  v_hdr      text;
$w4a$, $w4a$LANE7-W4A[g1]$w4a$)
  ) t(fn, old_frag, new_frag, mark)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.mark in v_def) = 0 then
      continue;   -- this edit is not there (idempotent)
    end if;
    v_n := (length(v_def) - length(replace(v_def, r.old_frag, ''))) / length(r.old_frag);
    if v_n <> 1 then
      raise exception 'LANE7-W4A: % carries the expected fragment % times, not once (edit %) — its body moved; re-read it and re-base this file', r.fn, v_n, r.mark;
    end if;
    execute replace(v_def, r.old_frag, r.new_frag);
  end loop;
end
$do$;

ALTER FUNCTION custom.entity_record_read(uuid, text, uuid) STABLE;
DROP FUNCTION IF EXISTS platform._drill_protect(jsonb, jsonb, text);
DROP FUNCTION IF EXISTS custom.entity_field_protect_arman_explicitly_approved(uuid, jsonb, text, date);
DROP FUNCTION IF EXISTS history.protect_field_scrub(text, uuid, uuid, text);
DROP FUNCTION IF EXISTS custom.protected_value_leaks(uuid);
DROP FUNCTION IF EXISTS custom.field_protection_refusal(text, jsonb, jsonb, uuid);
DROP FUNCTION IF EXISTS custom.protected_matches(uuid, jsonb);
DROP FUNCTION IF EXISTS custom.protected_values(uuid, text, uuid);
DROP FUNCTION IF EXISTS custom.protected_value(text, uuid, uuid);
DROP FUNCTION IF EXISTS custom.protected_field_query_refusal(uuid, text);
DROP FUNCTION IF EXISTS custom.protected_field_notice(custom.record);
DROP FUNCTION IF EXISTS hr.custom_field_access(uuid, text, uuid, text, jsonb, boolean, uuid);
DROP FUNCTION IF EXISTS hr.custom_field_subject(text, uuid);
DROP FUNCTION IF EXISTS custom.field_access(uuid, uuid, text, uuid, text, boolean);
DROP FUNCTION IF EXISTS custom.protected_readers_problem(text, jsonb);
DROP FUNCTION IF EXISTS custom.protected_field_rule(text);
DROP FUNCTION IF EXISTS custom.field_is_protected(jsonb);
