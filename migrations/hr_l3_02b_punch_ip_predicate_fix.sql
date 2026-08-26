-- HR domain L3 — migration 2b of 9 (register item HRB-015, lane L3 punch + kiosk).
--
-- DEFECT FOUND BY EXECUTION, NOT BY READING. `hr_l3_02`'s IP-allowlist predicate was
--   `where v_ip << c::inet or v_ip = host(c)::inet`
-- and `host()` takes `inet`, not `text` — so `host(c)` is `function host(text) does not exist`.
-- The whole arm only runs when the mode is `warn`/`block` AND the allowlist is non-empty, which is
-- not the platform default, so nothing on the read paths ever reached it. The FIRST punch written
-- by an org that turned IP verification on would have 42883'd — i.e. the clock would have gone down
-- for exactly the customer who configured the security feature.
--
-- The fix also removes the second clause rather than repairing it: `<<=` ("contained within or
-- equals") covers a CIDR block and a bare host address in one operator, which is what the
-- allowlist actually holds. `<<` alone was already wrong for a single-host entry — it is STRICT
-- containment, so `203.0.113.5` would never have matched an allowlist entry of `203.0.113.5`.
-- Two defects, one operator.
--
-- Applied by rewriting the live definition in place so the other ~400 lines of `hr.punch_record`
-- are provably byte-identical rather than re-pasted; `hr_l3_02_punch_record.sql` on disk carries
-- the same correction, so a re-apply of file 02 cannot reintroduce it.
-- Applied live as `hr_l3_02b_punch_ip_predicate_fix`. Idempotent.

do $outer$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where oid = 'hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)'::regprocedure;

  v_new := replace(v_def,
    'where v_ip << c::inet or v_ip = host(c)::inet)',
    'where v_ip <<= c::inet)');

  if v_new = v_def then
    if v_def like '%v_ip <<= c::inet%' then
      raise notice 'hr_l3_02b: already applied';
      return;
    end if;
    raise exception 'hr_l3_02b: the predicate to fix was not found in hr.punch_record — the source moved';
  end if;

  execute v_new;
end $outer$;

do $$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where oid = 'hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)'::regprocedure;
  if v_def like '%host(c)%' then
    raise exception 'hr_l3_02b: host(c) is still present in hr.punch_record';
  end if;
  if v_def not like '%v_ip <<= c::inet%' then
    raise exception 'hr_l3_02b: the corrected predicate is not present in hr.punch_record';
  end if;
end $$;
