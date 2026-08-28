-- HR domain L5 — migration 24 (register item HRB-017, lane L5 Leave & PTO).
--
-- THE DOOR STATES THE FACT; THE CLIENT STATES WHAT IT DID ABOUT IT.
--
-- `hr_l5_23` gave the stale-selection refusals a sentence ending *"Reload the page to see the
-- leave types you can use now."* Proven in the browser, and immediately wrong: the surface reads
-- the `stale_selection` flag and **refetches by itself**, so by the time a person reads that
-- sentence the list has already been updated and the instruction tells them to do something
-- pointless. A door cannot know whether its caller refetches — a phone app, an export script and
-- this page all get the same envelope — so **prescribing a client action is the server guessing
-- about a surface it cannot see.**
--
-- The split: the door says *what is true* (this policy is off / this policy no longer exists), the
-- flag says *what kind of problem it is* (`stale_selection`), and the client says *what it did*
-- ("The list has been updated"). A caller that does not refetch is free to say "reload" instead,
-- and neither has to be edited when the other changes.
--
-- Authority: SPEC-UI-IA §4.1 (a refusal renders in words); the display-pinned-to-door law.
-- Applied live as `hr_l5_24_the_door_states_the_fact_the_client_states_the_remedy`. Idempotent.

do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_request_submit';

  if v_def not like '%Reload the page%' then
    raise notice 'hr_l5_24: the client-instruction sentences are already gone — nothing to do.';
    return;
  end if;

  -- Matched against the LIVE source lines, read off pg_get_functiondef rather than reconstructed
  -- from the migration that wrote them — the body is stored with its own line breaks and `||`
  -- continuations, and a guessed literal does not match. The first attempt guessed and the
  -- guard below caught it, which is why the guard exists.
  v_new := replace(v_def,
    E'             || ''was open. Reload the page and pick from the current list.'');',
    E'             || ''was open.'');');

  v_new := replace(v_new,
    E'                      || ''Reload the page to see the leave types you can use now.'', v_pol.name));',
    E'                      , v_pol.name));');

  if v_new = v_def then
    raise exception 'hr_l5_24: neither stale sentence matched — re-derive them from the live body';
  end if;
  execute v_new;
end $$;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_request_submit';

  -- The server must state the fact and stop there.
  if v_def like '%Reload the page%' then
    raise exception 'hr_l5_24: the door still tells a client how to fix its own screen';
  end if;
  -- …but it must still SAY which fact, and still flag the kind, or the client has nothing to act on.
  if v_def not like '%no longer exists%' or v_def not like '%switched off%' then
    raise exception 'hr_l5_24: a stale refusal lost its sentence';
  end if;
  if v_def not like '%stale_selection%' then
    raise exception 'hr_l5_24: the stale-selection flag was lost';
  end if;
end $$;
