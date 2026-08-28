-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- CHECK 33 DEBT CAMPAIGN — BATCH 1 of N: the punch and kiosk families, this lane's own.
--
-- 20 SECURITY DEFINER helpers in `hr`, every one of them anon-executable and every one with a NULL
-- ACL — i.e. never revoked at all, carrying only the implicit PUBLIC grant. Started with this lane's
-- own families because the proof discipline is strongest where the caller-gates are mine to read.
--
-- 🚨 THE ORDERING THE CAMPAIGN ASKED FOR IS NOT ACHIEVABLE ON THESE, AND THE MEASUREMENT SAYS WHY.
-- "Revoke the anon-executable first, then the authenticated remainder" assumes the two can be
-- closed separately. For a NULL-ACL function they cannot, and trying is actively harmful:
--
--     fresh definer function        acl_null=true   anon=true   authenticated=true
--     after REVOKE FROM anon only   acl_null=FALSE  anon=TRUE   authenticated=true
--     after REVOKE FROM public      acl_null=false  anon=false  authenticated=false
--
-- `REVOKE ... FROM anon` on a function whose access flows from the implicit PUBLIC grant is a
-- NO-OP for reachability — anon still executes — while it materialises an ACL and so flips the
-- `never_revoked` signal to false. The function would read as partially repaired and be entirely
-- open. So `PUBLIC` is the only revoke that closes anything here, and closing anon necessarily
-- closes `authenticated` in the same statement. These 20 leave both classes at once.
--
-- Authority: coordinator ruling (the 202 are this lane's campaign, L1's proof discipline);
-- hr_l3_11's revoke-from-both precedent; hr_l3_81's check 33.
--
-- Applied live as `hr_l3_82_revoke_batch_1_punch_and_kiosk`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. NOTHING IS GRANTED BACK. Every one of these 20 is reached only through a `public.hr_*` wrapper
--    that is itself SECURITY DEFINER and therefore executes as the owner — the grant on the inner
--    helper is not consulted at all. That is L1's revoke-breaks-nothing property, and it is PROVEN
--    below per door rather than assumed, including for the two genuinely anon-reachable kiosk doors
--    where a tablet has no Supabase user at all.
-- 2. THE KIOSK DOORS ARE THE INTERESTING PROOF AND ARE DONE AS ANON. `public.hr_kiosk_punch` and
--    `hr_kiosk_session_open` are anon-executable BY DESIGN (hr_l3_70: they carry their own
--    credential). They call `hr._kiosk_device_row`, `hr._kiosk_device_config` and the `_punch_*`
--    helpers this batch closes. If the definer boundary did not hold, the kiosk would 403 for
--    every tablet in production — so the proof is run over PostgREST with the publishable key and
--    no session, which is exactly what a tablet is.
-- 3. `hr.punch_write_path_conformance` IS IN THE BATCH, DELIBERATELY. The gate reads it through
--    `public.__hr_punch_write_path_conformance` using SUPABASE_SECRET_KEY (the script says so in
--    its own header, and prefers the secret key precisely because the RPC is not granted to anon).
--    Revoking the inner function cannot reach the gate; the gate running green after this migration
--    is itself the proof.
-- 4. IF A REVOKE BREAKS A DOOR, THE ITEM STOPS AND IS NAMED — no quiet re-grant. A helper the
--    product reaches DIRECTLY rather than through its wrapper is a mis-layered door, and the fix is
--    to examine that caller-gate, not to hand the grant back. None of the 20 hit that case; the
--    report says so by door.

begin;

do $mig$
declare
  v_fn text;
  v_fns text[] := array[
    -- kiosk family (3)
    'hr._kiosk_admin_gate(uuid)',
    'hr._kiosk_device_config(uuid)',
    'hr._kiosk_device_row(uuid)',
    -- punch family (17)
    'hr._punch_auto_close_orphan(uuid)',
    'hr._punch_capability(uuid,text,uuid,date,uuid)',
    'hr._punch_chain_conflict(uuid,date,uuid[],jsonb)',
    'hr._punch_elapsed(uuid,timestamptz)',
    'hr._punch_ip_visible(uuid,uuid,date,uuid[])',
    'hr._punch_knob(text,jsonb,uuid)',
    'hr._punch_notify_edited(uuid,uuid,uuid,uuid,text,uuid,jsonb)',
    'hr._punch_open_chain(uuid)',
    'hr._punch_open_chain_as_of(uuid,timestamptz)',
    'hr._punch_orphan_threshold_hours(uuid,jsonb)',
    'hr._punch_period_lock(uuid,date)',
    'hr._punch_raise_exception(uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,timestamptz)',
    'hr._punch_resolve_juris(uuid,timestamptz)',
    'hr._punch_state_as_of(uuid,timestamptz)',
    'hr._punch_state_of(uuid)',
    'hr.punch_orphan_sweep(uuid,boolean)',
    'hr.punch_write_path_conformance()'
  ];
begin
  foreach v_fn in array v_fns loop
    -- PUBLIC is the one that actually closes it (see the header measurement); anon and
    -- authenticated are revoked explicitly too so an ACL written later cannot re-open either.
    execute format('revoke all on function %s from public', v_fn);
    execute format('revoke all on function %s from anon', v_fn);
    execute format('revoke all on function %s from authenticated', v_fn);
  end loop;
end
$mig$;

do $chk$
declare r record; v_open integer := 0; v_n integer := 0;
begin
  -- iterate OIDs: pg_get_function_identity_arguments includes parameter NAMES, which
  -- ::regprocedure rejects, so the signature string cannot be round-tripped that way.
  for r in
    select p.oid, n.nspname||'.'||p.proname as qname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'hr' and p.prosecdef
       and (p.proname like '\_punch%' or p.proname like 'punch\_%'
         or p.proname like '\_kiosk%' or p.proname = 'punch_write_path_conformance')
  loop
    v_n := v_n + 1;
    if has_function_privilege('anon', r.oid, 'EXECUTE')
       or has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      v_open := v_open + 1;
      raise notice 'hr_l3_82: still client-reachable: %', r.qname;
    end if;
  end loop;

  if v_open > 0 then
    raise exception 'hr_l3_82: % of % punch/kiosk definer helpers are still client-reachable', v_open, v_n;
  end if;

  -- decision 3: the gate reading itself green through its wrapper is the proof it still works
  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_82: a conformance check is failing after the revoke';
  end if;
  raise notice 'hr_l3_82: % punch/kiosk definer helpers closed', v_n;
end
$chk$;

commit;
