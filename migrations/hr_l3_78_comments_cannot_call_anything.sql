-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 F1's REACHABILITY GRAPH COUNTED COMMENTS AS CALLS.
--
-- `hr.stable_doors_that_write()` builds its caller→callee edges with a bare substring test over the
-- WHOLE function body:
--
--     from all_fns f join writers w on f.qname <> w.qname and f.prosrc like '%' || w.qname || '%'
--
-- so a COMMENT that names a writer schema-qualified invents an edge. That is what happened: a
-- comment in `public.hr_pending_changes` mentioning the `hr.wf_request` door produced one phantom
-- edge and six transitive ones, and F1 went red on a door that calls nothing. The L1 lane cut the
-- phantom by DE-QUALIFYING the name in the comment — a correct workaround, correctly left here.
--
-- THE REPAIR IS CONSERVATIVE ON PURPOSE. Comments cannot call anything, so stripping them before
-- the substring test kills the entire false-positive class without weakening the test. The
-- tempting alternative — matching call-SHAPED text like `hr.wf_request(` — is REJECTED: this
-- codebase builds calls through `execute format(...)`, where the callee's name appears inside a
-- string literal and never in call shape, so a call-shaped regex would silently stop seeing real
-- writers. A detector that over-fires is an annoyance; a detector that can miss a writer is the
-- defect it exists to prevent. The substring keeps its no-false-negative bite.
--
-- Authority: coordinator ruling (L1's finding, conservative repair); hr_l3_15's F1 invariant.
--
-- Applied live as `hr_l3_78_comments_cannot_call_anything`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. STRIPPED ONCE, IN `all_fns`, AND USED BY BOTH CONSUMERS. The same false positive exists in the
--    WRITERS test, not only in the edges: a comment containing the words "insert into" would mark a
--    read-only function as a writer and put it on the graph as a root. Stripping in one place and
--    feeding both `writers` and `edges` fixes both and cannot let them disagree about what the code
--    of a function is.
-- 2. BLOCK COMMENTS FIRST, THEN LINE COMMENTS. `/* -- */` would otherwise leave a stray `--` that
--    swallows the rest of its line. Both are replaced with a SPACE, never with the empty string:
--    `a/*x*/b` is two tokens, and deleting the comment outright would fuse them into `ab`.
-- 3. 🚨 THE KNOWN LIMITATION, STATED RATHER THAN DISCOVERED LATER. This is a lexer-free strip, so a
--    `--` or `/*` INSIDE a string literal is treated as a comment start. The realistic cost is a
--    false NEGATIVE — a callee named after a `--` inside a literal on the same line would stop
--    being seen. No live function does that today (asserted below by comparing the edge count
--    before and after on real bodies, not by assuming). A true lexer is the fix if that ever
--    changes; it is not worth writing for a case that does not exist.
-- 4. THE WORKAROUND IS REMOVED IN THE SAME MIGRATION THAT MAKES IT UNNECESSARY. `hr_pending_changes`
--    gets its natural, schema-qualified wording back. A standing "don't name writers in comments"
--    trap outliving the defect is how a codebase accumulates rules nobody can explain — and the
--    only way to prove the fix is to restore the exact text that used to break it.

begin;

create or replace function hr._strip_sql_comments(p_src text)
returns text
language sql
immutable
as $fn$
  -- decision 2: block comments first, then line comments; each becomes a SPACE, never nothing
  select regexp_replace(
           regexp_replace(coalesce(p_src, ''), '/\*.*?\*/', ' ', 'g'),
           '--[^' || chr(10) || ']*', ' ', 'g');
$fn$;

revoke all on function hr._strip_sql_comments(text) from public;
revoke all on function hr._strip_sql_comments(text) from anon;

do $mig$
declare v_def text := pg_get_functiondef('hr.stable_doors_that_write()'::regprocedure);
begin
  if position('_strip_sql_comments' in v_def) > 0 then
    return;                                     -- already repaired; replay is a no-op
  end if;
  if position(E'and f.prosrc like ''%'' || w.qname || ''%''' in v_def) = 0 then
    raise exception 'hr_l3_78: the edge builder is not in the expected shape — refusing to guess';
  end if;

  -- decision 1: strip once, in all_fns
  v_def := replace(v_def,
    E'    select p.oid, n.nspname, p.proname, p.provolatile, p.prosrc,\n'
 || E'           n.nspname || ''.'' || p.proname as qname',
    E'    select p.oid, n.nspname, p.proname, p.provolatile, p.prosrc,\n'
 || E'           -- hr_l3_78: comments cannot call anything, so the graph reads CODE, not prose\n'
 || E'           hr._strip_sql_comments(p.prosrc) as code,\n'
 || E'           n.nspname || ''.'' || p.proname as qname');

  -- both consumers move onto the stripped text
  v_def := replace(v_def, E'             where f.prosrc ~* pt.p) as forms',
                          E'             where f.code ~* pt.p) as forms');
  v_def := replace(v_def, E'     where exists (select 1 from pat, lateral unnest(pat.pats) u(p) where f.prosrc ~* u.p)',
                          E'     where exists (select 1 from pat, lateral unnest(pat.pats) u(p) where f.code ~* u.p)');
  v_def := replace(v_def, E'and f.prosrc like ''%'' || w.qname || ''%''',
                          E'and f.code like ''%'' || w.qname || ''%''');
  execute v_def;
end
$mig$;

-- ── decision 4: the workaround dies with the defect ─────────────────────────────────────────
do $mig$
declare v_def text := pg_get_functiondef('public.hr_pending_changes(uuid)'::regprocedure);
begin
  if position('the `hr.wf_request` door' in v_def) > 0 then
    return;                                     -- already restored
  end if;
  if position('the wf_request door' in v_def) = 0 then
    raise exception 'hr_l3_78: hr_pending_changes no longer carries the de-qualified comment';
  end if;
  execute replace(v_def, 'the wf_request door', 'the `hr.wf_request` door');
end
$mig$;

-- ── prove it in the same transaction that changed it ────────────────────────────────────────
do $chk$
declare v_f1 integer; v_src text;
begin
  -- the restored natural wording is present AND the gate is still green: the two facts together
  -- are the proof, either alone proves nothing
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_pending_changes';
  if position('the `hr.wf_request` door' in v_src) = 0 then
    raise exception 'hr_l3_78: the natural wording was not restored';
  end if;

  select count(*) into v_f1 from hr.stable_doors_that_write();
  if v_f1 <> 0 then
    raise exception 'hr_l3_78: F1 is % after the repair, expected 0', v_f1;
  end if;

  -- decision 3: stripping must not have blinded the detector on real bodies. A writer named in
  -- CODE is still seen — asserted positively against a function that genuinely writes.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hr' and p.proname = 'punch_record'
                    and hr._strip_sql_comments(p.prosrc) ~* '(^|[^a-z_])insert[[:space:]]+into[[:space:]]') then
    raise exception 'hr_l3_78: stripping hid a real INSERT — the detector lost its bite';
  end if;

  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_78: a conformance check is failing';
  end if;
end
$chk$;

commit;
