-- hr_l1_41_a_pay_change_carries_its_proposal_flat.sql
--
-- Completes the hr_l1_39 ruling and carries the current definitions of the summary
-- helpers. THREE sources feed the decider's description, and none of them is the hash:
--   · patch-carrying flows (profile edit, address change) diff `payload.patch`;
--   · PAY CHANGES carry their proposal FLAT at the top of the payload — hr_compensation_
--     upsert routes it that way — so the patch branch never matched them and they fell
--     through to the row summary, which describes the position assignment (title, FTE,
--     date) and never mentions the money. The one number a pay approver exists to look
--     at was the one thing still missing from their screen;
--   · row flows (leave, timecard, overtime) get _wf_row_summary from the target row.
--
-- 🚨 MONEY IS ALWAYS TWO DECIMALS. `FM…D99` suppresses trailing zeros and leaves the
-- decimal point standing, so 96000 rendered as "96,000." — the third time this exact FM
-- trap has been hit in this lane (hours in the leave sentence, hours again, then money).
-- hr._money_text owns it now, beside hr._hours_text which owns the hours.
--
-- Applied live 2026-08-28 and ledgered. Proven on a live pay_change through the product:
--   "Pay change — Armani Sadeghi"
--   "Base pay  Not provided → 96,000.00 USD per year"
--   "Effective from  Not provided → 1 Sep 2026"
-- with no hex hash anywhere on the screen.

create or replace function hr._money_text(p_amount numeric, p_currency text default null)
returns text language sql stable as $$
  select case when p_amount is null then null
              else trim(to_char(p_amount, 'FM999G999G999G990D00'))
                   || coalesce(' ' || nullif(btrim(p_currency), ''), '') end;
$$;

create or replace function hr._wf_pay_change_digest(p_payload jsonb, p_assignment uuid)
returns jsonb language plpgsql stable security definer set search_path = public, hr as $fn$
declare v_prev numeric; v_prev_cur text; v_out jsonb := '[]'::jsonb;
begin
  if p_payload is null or not (p_payload ? 'amount') then return '[]'::jsonb; end if;

  -- The "from" half: what this component is paid today, same assignment and same kind.
  select c.amount, c.currency into v_prev, v_prev_cur
    from hr.compensation c
   where c.position_assignment_id = p_assignment
     and c.deleted_at is null
     and c.component_kind is not distinct from (p_payload ->> 'component_kind')
     and c.approved_at is not null
   order by c.effective_from desc limit 1;

  v_out := v_out || jsonb_build_object(
    'field', 'amount',
    'label', initcap(replace(coalesce(p_payload ->> 'component_kind', 'base'), '_', ' ')) || ' pay',
    'from', hr._money_text(v_prev, v_prev_cur),
    'to', hr._money_text((p_payload ->> 'amount')::numeric, p_payload ->> 'currency')
          || coalesce(' per ' || replace(p_payload ->> 'per_unit', '_', ' '), ''));

  if p_payload ? 'effective_from' then
    v_out := v_out || jsonb_build_object(
      'field', 'effective_from', 'label', 'Effective from', 'from', null,
      'to', to_char((p_payload ->> 'effective_from')::date, 'FMDD FMMon YYYY'));
  end if;

  return v_out;
end $fn$;

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('hr._wf_display(uuid,boolean)'::regprocedure);
  if position('A PAY CHANGE CARRIES ITS PROPOSAL FLAT' in v_def) > 0 then
    raise notice 'hr_l1_41: already applied'; return;
  end if;

  v_new := replace(v_def,
$a1$  elsif inst.payload ? 'patch' then$a1$,
$r1$  -- 🚨 A PAY CHANGE CARRIES ITS PROPOSAL FLAT, NOT UNDER `patch`.
  elsif inst.payload ? 'amount' and inst.target_token = 'hr_position_assignment' then
    v_change := hr._wf_pay_change_digest(inst.payload, inst.target_id);
  elsif inst.payload ? 'patch' then$r1$);
  if v_new = v_def then raise exception 'hr_l1_41: patch-branch anchor not found'; end if;
  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_display';
  if v_src !~ 'A PAY CHANGE CARRIES ITS PROPOSAL FLAT' then raise exception 'hr_l1_41: did not land'; end if;
  if v_src ~ '_wf_call_digest' then raise exception 'hr_l1_41: the integrity hash came back'; end if;
  if hr._money_text(96000, 'USD') !~ '96,000\.00 USD' then
    raise exception 'hr_l1_41: money is not formatted to the cent';
  end if;
end $verify$;

update hr.function_contract set is_active = false
 where function_name = '_wf_display'
   and home_migration in ('hr_l1_37_the_decider_can_see_the_change.sql',
                          'hr_l1_39_a_checksum_is_not_a_description.sql');

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values ('hr', '_wf_display', 'hr_l1_41_a_pay_change_carries_its_proposal_flat.sql',
        array['''change''', '''digest''', '''subject_label''', 'p_contentless or not v_entitled',
              '_wf_row_summary', '_wf_pay_change_digest'],
        array['_wf_call_digest'],
        'Three sources, none of them the integrity hash. _wf_call_digest returns sha256 — the '
        || 'engine tamper check — and must never reach a slot a human reads.')
on conflict do nothing;
