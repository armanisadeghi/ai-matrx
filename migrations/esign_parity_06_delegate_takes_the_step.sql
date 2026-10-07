-- E-signature parity, wave A, step 6 — a delegate takes its delegator's routing step (CONTRACT.md v2 §11,
-- based-on: esign._guard_signer_order() b8e1a2ae1cc969a28f91f86e2b3957ca4bb2fcff3bd775b4c8cd64890dd6ce7b
-- ATTACK A-F3). Found by the server lane's live two-signer delegation proof: on a SEQUENTIAL envelope the
-- order guard refused the delegate's row because the delegator still held the position, so delegation
-- could never complete on any sequential envelope (the shipped default).
CREATE OR REPLACE FUNCTION esign._guard_signer_order()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare v_order text; v_dupes int;
begin
  select signing_order into v_order from esign.envelope where id = new.envelope_id;
  if v_order = 'parallel' then return new; end if;
  select count(*) into v_dupes from esign.envelope_signer s
   where s.envelope_id = new.envelope_id and s.position = new.position and s.id <> new.id
     and s.role <> 'cc_recipient'
     -- A delegate takes its delegator's step (§11, A-F3): the delegator is (about to be) 'delegated'
     -- and never holds the position against the person it handed the step to.
     and s.status <> 'delegated' and s.id is distinct from new.delegated_from_signer_id;
  if v_dupes > 0 and new.role <> 'cc_recipient' then
    raise exception 'esign: position % is already taken on a SEQUENTIAL envelope — ties are legal only when signing_order = parallel (§2.4)', new.position
      using errcode = '22023';
  end if;
  return new;
end $function$;
