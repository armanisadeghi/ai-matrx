-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- lane: S6
-- based-on: custom.assert_store_door(uuid, text) 14c40e3aaf11738680fbc20b9744bf67bf1ec59c8a6297562e41e36a0b4e8c4f
--
-- LANE S6 — WHEN THE STORE IS OFF, A CLIENT IS TOLD IN A CLIENT'S WORDS.
--
-- THE DEFECT, MEASURED LIVE 2026-09-25 (lane S6's store-off probe, Rincon Plumbing Co — Ventura
-- Branch, test@test.com on her own portal): with the record store switched off, every read door
-- her portal pages call — custom.read_records, read_record, record_history, io_comments — refused
-- her with `custom.assert_store_door`'s sentence, which is written for the BUSINESS:
--   "This organization has turned the record store off, so custom.applicable_fields is not
--    taking writes." + "…open Database Settings for this organization and turn it back on… this
--    store takes writes only from the role that owns custom.record…"
-- A door's machine name, "writes" on a read, and settings instructions for a screen she cannot
-- open. The two client form doors were fixed door by door in the S6 up; this is the CLASS: one
-- sentence choice, in the one function every door asks.
--
-- THE CHANGE. Only the refusal changes, and only for a caller who is not an active member of the
-- organization: she gets `custom.store_off_sentence(org)` — the sentence her portal's sign-in page
-- already shows ("… has turned its record store off, so this link is not open right now. An owner
-- or an administrator … turns it back on …") with no hint. A member keeps today's sentence and
-- hint word for word (eight campaign suites assert it). If either helper cannot be asked from the
-- calling context, the member sentence stands — the door is exactly as closed either way.
-- Same signature, same volatility, same memo, same owner-role bypass.

CREATE OR REPLACE FUNCTION custom.assert_store_door(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner  oid;
  v_who    name;
  v_memo   text := 'w:d:' || coalesce(p_organization_id::text, '-');
  v_me     uuid;
  v_member boolean := true;
  v_say    text;
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS ORGANIZATION.
  -- WRITE-PERF-4: out of its own slot (0.6 us) rather than out of the shared blob (8.25 us on
  -- a realistic blob). The stamp is a superset of the seat the blob checked, so this yes is
  -- reused in strictly fewer situations than before, never more.
  if platform.memo_k_get(v_memo) = '1' then
    return;
  end if;
  v_who := custom.caller_role();

  -- The campaign's own lanes run as the role that owns the store. Read the owner from the
  -- catalogue, never as a role literal (rule 15), so this cannot drift from the table.
  if custom.store_is_open(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- ── S6 2026-09-25: A CLIENT HEARS IT IN HER OWN WORDS. ─────────────────────────────────
  -- Somebody who is not a member of this organization (a portal client, a person something was
  -- shared with) is told what her sign-in page tells her, never the owner's settings speech.
  begin
    v_me := custom.query_principal();
    if v_me is not null then
      v_member := iam.is_org_member(v_me, p_organization_id);
    end if;
    if not v_member then
      v_say := custom.store_off_sentence(p_organization_id);
    end if;
  exception when insufficient_privilege or undefined_function then
    v_member := true;  -- cannot tell from here: the member sentence below, exactly as before
  end;
  if not v_member and v_say is not null then
    raise exception '%', v_say using errcode = '42501';
  end if;

  -- ── STORE-ON 2026-09-23: "TURNED OFF", NEVER "NOT TURNED ON YET". ──────────────────────
  -- Owner ruling the same day: the record store's default is ON, and every active
  -- organization was switched on. "has not turned it on yet" described a world where being
  -- off was the starting state nobody had left; it is now a decision somebody in this
  -- organization made, and the sentence says so. The door is exactly as closed as it was.
  raise exception 'This organization has turned the record store off, so % is not taking writes.',
    coalesce(nullif(btrim(p_door), ''), 'it')
    using errcode = '42501',
          hint = 'The record store is on for every organization by default. Somebody with an owner''s or an administrator''s seat here switched it off: open Database Settings for this organization and turn it back on, and everything already made is kept and starts working again. While it is off, this store takes writes only from the role that owns custom.record, through every door: it is a closed door, not a quiet one.';
end;
$function$;
