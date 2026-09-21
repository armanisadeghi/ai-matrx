-- additive: yes
--
-- chair-step: it REPLACES the live body of `custom.ladder_replanners` and adds ONE new
--   function, `custom._call_text(text)`. Nothing is dropped, nothing is revoked, no row is
--   touched. `custom.ladder_replanners()` returns the SAME rows on the live database before
--   and after (both empty today); what changes is which nodes its walk visits on the way.
--
-- TAILS — CENSUS 14 STOPS WALKING SENTENCES.
--
-- THE DEFECT, named by lane DOORS-GREEN. `custom.ladder_replanners` builds the ladder's
-- call graph with one regex over `pg_get_functiondef`, and a regex cannot tell a CALL from
-- a SENTENCE. `iam.has_access_for_base` only NAMES `platform.audit_carrying_cycles` inside
-- a `raise warning` remedy string - "run select platform.audit_carrying_cycles() to file
-- it" - and the census walked it as if the ladder called it, dragging four more functions
-- and `public.system_org_id` into a graph none of them is on.
--
-- WHY THE OBVIOUS REPAIR IS WRONG, measured rather than argued. Stripping `--` comments and
-- raise prose together drops the graph from 67 nodes to 57 and takes `iam.has_access` with
-- it, which IS on the path: inside these bodies it is named in a comment, and a comment that
-- names a function is the only record some edges have. DOORS-GREEN measured that and
-- correctly refused to ship it. A guard made blind is worse than a guard with a false edge.
--
-- WHAT `custom._call_text` ACTUALLY DOES, and why it is in three steps:
--   1. The `--` comments are set ASIDE (not discarded) and appended back at the end. They
--      have to come out before the scan because a lone apostrophe in one of them - "the
--      caller's frame" - desynchronises any quote-parity scan of everything after it, which
--      is exactly why a first attempt at this changed nothing at all.
--   2. The rest is split on the quote character, so the parts alternate CODE, LITERAL,
--      CODE, … (a doubled `''` splits to an empty part and flips the state back).
--   3. A literal is blanked only when the statement it belongs to is a `raise` - the
--      statement being whatever follows the last bare `;`. Every other literal is KEPT,
--      because `execute format('… custom.f(…)')` is code, and blinding the walk to dynamic
--      SQL would be the same mistake in the other direction.
--
-- MEASURED ON THE LIVE DATABASE, both walks run side by side from the same four roots:
--   · before: 67 nodes · after: 62 · GAINED: none
--   · `iam.has_access` is still found (the whole point)
--   · `platform.audit_carrying_cycles` is gone, and with it exactly the four functions and
--     `public.system_org_id` that no remaining node calls in code - the false edge's own
--     subtree, which is what removing a false edge means
--   · none of the five is LANGUAGE sql, so `custom.ladder_replanners()` returns the same
--     (empty) verdict before and after: strictly less to walk, nothing less to find.
--
-- based-on: custom.ladder_replanners(text[]) 9086acf48c44cf18c54a1e36d48af6e9c92ae8d4c517bba6739f5fdf8c6745ee

create or replace function custom._call_text(p_body text)
returns text
language plpgsql
immutable
set search_path to ''
as $calltext$
declare
  v_src   text := pg_catalog.regexp_replace(p_body, '--[^\n]*', '', 'g');
  v_notes text;
  v_parts text[];
  v_out   text := '';
  v_raise boolean := false;
  v_i     integer;
  v_part  text;
  v_tail  text;
begin
  select coalesce(pg_catalog.string_agg(m[1], ' '), '') into v_notes
    from pg_catalog.regexp_matches(p_body, '(--[^\n]*)', 'g') m;

  v_parts := pg_catalog.regexp_split_to_array(v_src, '''');
  for v_i in 1 .. coalesce(pg_catalog.array_length(v_parts, 1), 0) loop
    v_part := v_parts[v_i];
    if v_i % 2 = 1 then
      -- CODE.
      v_out := v_out || v_part;
      if pg_catalog.strpos(v_part, ';') > 0 then
        v_tail := pg_catalog.regexp_replace(v_part, '^.*;', '', 's');
        v_raise := v_tail ~* '\mraise\M';
      else
        v_raise := v_raise or (v_part ~* '\mraise\M');
      end if;
    else
      -- LITERAL. Prose only when it belongs to a `raise`; otherwise it may be code.
      if not v_raise then v_out := v_out || ' ' || v_part || ' '; end if;
    end if;
  end loop;

  return v_out || ' ' || v_notes;
end
$calltext$;

CREATE OR REPLACE FUNCTION custom.ladder_replanners(p_roots text[] DEFAULT ARRAY['custom.has_visibility'::text, 'custom.effective_level'::text, 'custom.reaches_directly'::text, 'custom.visible_set'::text])
 RETURNS TABLE(fn text, lang text, why text, remedy text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_front text[];
  v_seen  text[] := '{}'::text[];
  v_cur   text;
  v_head  integer := 1;
  v_body  text;
  rec     record;
begin
  v_front := coalesce(p_roots, '{}'::text[]);
  while v_head <= coalesce(array_length(v_front, 1), 0) and v_head <= 1000 loop
    v_cur  := v_front[v_head];
    v_head := v_head + 1;
    continue when v_seen @> array[v_cur];
    v_seen := v_seen || v_cur;
    select string_agg(pg_catalog.pg_get_functiondef(pr.oid), E'\n')
      into v_body
      from pg_catalog.pg_proc pr
      join pg_catalog.pg_namespace ns on ns.oid = pr.pronamespace
     where ns.nspname || '.' || pr.proname = v_cur;
    continue when v_body is null;
    -- A SENTENCE NAMING A FUNCTION IS NOT A CALL TO IT (lane TAILS, 2026-09-21).
    v_body := custom._call_text(v_body);
    for rec in
      select distinct mm[1] || '.' || mm[2] as callee
        from pg_catalog.regexp_matches(
               v_body,
               '(custom|iam|platform|public|history)[.]([a-z0-9_]+)[[:space:]]*[(]', 'g') as mm
    loop
      if not (v_seen @> array[rec.callee]) then
        v_front := v_front || rec.callee;
      end if;
    end loop;
  end loop;

  return query
  select ns.nspname || '.' || pr.proname,
         'sql'::text,
         'LANGUAGE sql and not inlinable ('
           || case when pr.prosecdef then 'SECURITY DEFINER' else '' end
           || case when pr.prosecdef and pr.proconfig is not null then ' + ' else '' end
           || case when pr.proconfig is not null then 'SET' else '' end
           || '), so PostgreSQL re-plans its body on every call - the plan cache of a '
           || 'non-inlined SQL-language function lives for the calling query, not the session.',
         'Move the identical body into plpgsql: begin return query <body>; end. '
           || 'LADDER-PERF measured 7.24 ms -> 1.36 ms on custom.carrying_edges_of doing exactly that.'
    from pg_catalog.pg_proc pr
    join pg_catalog.pg_namespace ns on ns.oid = pr.pronamespace
    join pg_catalog.pg_language l   on l.oid  = pr.prolang
   where l.lanname = 'sql'
     and (pr.prosecdef or pr.proconfig is not null)
     and pr.provolatile <> 'i'
     and ns.nspname || '.' || pr.proname = any (v_seen)
   group by 1, 2, 3, 4
   order by 1;
end;
$function$

;
