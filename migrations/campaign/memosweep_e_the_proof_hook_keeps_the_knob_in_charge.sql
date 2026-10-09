-- chair-step: replaces iam.kernel_batch_on (created by memosweep_a, changed by memosweep_b); nothing is dropped and no privilege changes
-- lane: MEMO-SWEEP
-- based-on: iam.kernel_batch_on(uuid) d9f333d19310e76c23e9d3464c83537aedd0c78f6a871a4c7e629fb53d20c7ae
--
-- MEMO-SWEEP e (2026-10-08): the proof hook 'on_written' (memosweep_b) returned true outright; it now only lifts the "this
-- transaction has written" refusal and leaves the knob (on, off_for) in charge, so the proof script can also set a knob value
-- inside a rolled-back transaction and prove off_for applies to the whole message. Outside that hook nothing changes.
-- Inverse: migrations/inverse/memosweep_e_the_proof_hook_keeps_the_knob_in_charge_down.sql

set local statement_timeout = '60s';

create or replace function iam.kernel_batch_on(p_person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
-- HOT-DOORS-4: may this statement keep access sub-answers in the statement memo for this person (knob
-- access/kernel_batch: {"on": bool, "off_for": [user ids]})? Never once the transaction has written (the
-- memo's own rule). mx.kernel_batch = 'off' / 'on' forces one path for the session (the proofs compute both;
-- not reachable from a client). A null person is the session's own (auth.uid()). Any failure answers false.
-- MEMO-SWEEP (2026-10-08): off_for covers the statement. When the person asked about, or the signed-in person, is
-- listed, a statement-wide opt-out is left in the memo and every later ask in the statement answers false - the
-- person-independent helpers (they pass null) stand down exactly as the person-aware ones do. Answers never change.
declare
  v_p    uuid;
  v_me   uuid;
  v_s    text;
  v_k    text;
  v_on   boolean;
  v_knob jsonb;
  v_off  boolean := false;
begin
  v_s := coalesce(current_setting('mx.kernel_batch', true), '');
  -- MEMO-SWEEP proof hook (a session setting, never reachable from a client): 'on_written' lets the memo run in a
  -- transaction that has written and leaves everything else to the knob (so scripts/db-proofs/memo-path-agreement.py can
  -- plant a fault, or a knob value, with DDL and still run the memo path). No write may follow its first read.
  if v_s <> 'on_written' then
    if pg_catalog.pg_current_xact_id_if_assigned() is not null then
      return false;
    end if;
    if v_s = 'off' then return false; end if;
    if v_s = 'on' then return true; end if;
  end if;
  if platform.memo_k_get('iam.kernel_batch_off_for') = 't' then
    return false;
  end if;
  v_me := auth.uid();
  v_p := coalesce(p_person, v_me);
  v_k := 'iam.kernel_batch_on:' || coalesce(v_p::text, '-');
  v_s := platform.memo_k_get(v_k);
  if v_s is not null then
    return v_s = 't';
  end if;
  begin
    v_knob := platform.knob_resolve('access', 'kernel_batch', null);
    v_off := coalesce(v_knob -> 'off_for' ? coalesce(v_p::text, ''), false)
          or coalesce(v_knob -> 'off_for' ? coalesce(v_me::text, ''), false);
    v_on := coalesce((v_knob ->> 'on')::boolean, false) and not v_off;
  exception when others then
    v_on := false;
  end;
  if v_off then
    perform platform.memo_k_put('iam.kernel_batch_off_for', 't');
  end if;
  perform platform.memo_k_put(v_k, case when v_on then 't' else 'f' end);
  return v_on;
end;
$function$;
