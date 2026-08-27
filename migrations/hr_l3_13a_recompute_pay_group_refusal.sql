-- HR domain L3 — migration 13a (register item HRB-015, lane L3 punch + kiosk).
--
-- `hr.recompute_apply` hit a raw `23502 null value in column "pay_group_id"` when the employment
-- had no pay group, instead of returning a refusal envelope. Found by execution. A NOT NULL
-- violation reaching the caller is a database fault wearing the clothes of a refusal: it carries no
-- code the client can branch on, no sentence a human can read, and no door. Every other gate in
-- this lane names what was missing (SPEC-ACCESS 4.2); this one did not.
-- Applied live as `hr_l3_13a_recompute_pay_group_refusal`. Idempotent.

do $outer$
declare
  v_def text;
  v_anchor constant text :=
'  ---------------------------------------------------------------- 1. authority (decision 2)';
  v_block constant text :=
'  if coalesce((p_workweek ->> ''pay_group_id'')::uuid, v_em.pay_group_id) is null then
    return hr._punch_refusal(''hr_recompute_no_pay_group'',
      ''This employment has no pay group, so its workweek has no start day, no period calendar and ''
      || ''nothing to attribute overtime to. HR has to assign a pay group before hours can be computed.'',
      jsonb_build_object(''employment_id'', p_employment_id, ''door'', ''/hr/settings/pay-groups''));
  end if;

  ---------------------------------------------------------------- 1. authority (decision 2)';
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.recompute_apply(uuid,jsonb,jsonb,jsonb,text)'::regprocedure;
  if position('hr_recompute_no_pay_group' in v_def) > 0 then
    raise notice 'hr_l3_13a: already applied'; return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_13a: anchor not found in hr.recompute_apply';
  end if;
  execute replace(v_def, v_anchor, v_block);
end $outer$;

do $$
begin
  if pg_get_functiondef('hr.recompute_apply(uuid,jsonb,jsonb,jsonb,text)'::regprocedure)
     not like '%hr_recompute_no_pay_group%' then
    raise exception 'hr_l3_13a: the pay-group refusal is not present';
  end if;
end $$;

