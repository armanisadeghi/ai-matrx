-- hr_l1_27_reason_accepts_free_text.sql
--
-- hr_l1_26 gated wage-bearing changes on `change_reason_category_id` — a UUID from the
-- platform.categories dimension `hr_change_reason`. Its only caller, ChangePositionForm,
-- sends free-text `change_reason` and has never sent a category at all.
--
-- So the rule as shipped would have refused EVERY wage-bearing change made through the
-- actual product, naming a field the form does not have. A door and its only caller
-- disagreeing about what satisfies a rule is the display-pinned-to-door law broken from
-- the door end — and the door is the half that was wrong here: the gate is a STATED
-- REASON, not a particular storage shape. Either satisfies it.
--
-- Applied live 2026-08-27 and ledgered. Run after hr_l1_26.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('hr._l1_apply_position(jsonb,uuid,uuid)'::regprocedure);

  if position('EITHER A CATEGORY OR THE AUTHOR''S OWN WORDS' in v_def) > 0 then
    raise notice 'hr_l1_27: already applied'; return;
  end if;

  v_new := replace(v_def,
'  if nullif(p_payload ->> ''change_reason_category_id'','''') is null then',
'  -- 🚨 EITHER A CATEGORY OR THE AUTHOR''S OWN WORDS SATISFIES THIS.' || chr(10) ||
'  -- The gate is a STATED REASON, not a particular storage shape. `hr_l1_26` accepted only' || chr(10) ||
'  -- `change_reason_category_id`, while `ChangePositionForm` sends free-text `change_reason`' || chr(10) ||
'  -- — so every wage-bearing change made through the actual UI would have been refused with' || chr(10) ||
'  -- a message about a field the form does not have. A door and its only caller disagreeing' || chr(10) ||
'  -- about what satisfies a rule is the display-pinned-to-door law broken from the door end.' || chr(10) ||
'  if nullif(p_payload ->> ''change_reason_category_id'','''') is null' || chr(10) ||
'     and nullif(btrim(coalesce(p_payload ->> ''change_reason'','''')),'''') is null then');

  if v_new = v_def then
    raise exception 'hr_l1_27: anchor not found — was hr_l1_26 applied?';
  end if;

  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_l1_apply_position';
  if v_src !~ 'EITHER A CATEGORY OR THE AUTHOR' then
    raise exception 'hr_l1_27: widening did not land';
  end if;
  if v_src !~ 'reason_required' then
    raise exception 'hr_l1_27: refusal envelope lost';
  end if;
end $verify$;

insert into public._schema_migrations (source, filename, checksum, applied_at, duration_ms)
values ('matrx-frontend', 'hr_l1_27_reason_accepts_free_text.sql',
        md5('hr_l1_27_reason_accepts_free_text'), now(), 0)
on conflict do nothing;
