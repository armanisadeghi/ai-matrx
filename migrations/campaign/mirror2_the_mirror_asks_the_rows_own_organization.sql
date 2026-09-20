-- chair-step: it ALTERs the live std_select policy on custom.record, which no knob can hold OFF, so a `-- guard:` line here would be a comment pretending to be a switch. It is not a rewrite: the new text is BUILT FROM THE LIVE TEXT by deleting exactly one candidate SELECT and OR-ing the same question back as its own arm, and the file refuses to run unless the live policy still hashes to a040a84df93b3ff2e8ebdbb0d260823f. `id in (C1 union C2…C6) and H` is `(id in C1 and H) or (id in (C2…C6) and H)`, so the answer cannot move by a row; measured beside it, the 5,000-pair parity of the two bounds. Its inverse is migrations/inverse/mirror2_the_mirror_asks_the_rows_own_organization_down.sql.
--
-- MIRROR-2, FILE 2 — THE POLICY ON custom.record ASKS ABOUT THE ROW'S OWN ORGANIZATION.
--
-- The mirror's last arm is `id in (C1 union C2 … union C6) and iam.has_access('record', id,
-- 'viewer')`, and C1 — `iam.unnest_uuids(iam.accessible_entity_ids('record','viewer',0,true))` —
-- is the whole-database record set (file 1's header measures it: 6,729.602 ms for a hundred
-- records of ONE organization).
--
-- WHAT THIS FILE DOES, AND WHY IT CANNOT MOVE AN ANSWER. An `IN` over a UNION distributes:
--
--     id in (C1 ∪ C2…C6) ∧ H   ≡   (id in C1 ∧ H)  ∨  (id in (C2…C6) ∧ H)
--
-- so this file takes C1 OUT of the union and puts `id in C1 ∧ H` back as its own top-level OR
-- arm — written as `iam.record_visible_in_org(…)`, which file 1 proves equal to `id in C1` for
-- a LIVE record (`deleted_at is null` is in the arm because `custom.visible_record_ids`, which
-- IS C1, returns live rows only). Every other character of the policy is untouched: the new
-- text is BUILT FROM THE LIVE TEXT by deleting exactly one candidate SELECT, and the file
-- refuses to run if that text is not the text it was written against.
--
-- WHY NOT REGENERATE THE POLICY FROM `iam.entity_read_expr`? Because today it would change two
-- other things at once, and neither is this lane's to change:
--   * `iam.entity_read_kernel_expected()` still disagrees with the live kernel fingerprint
--     (SHARED-ONLY "Left behind"), so the generator emits an UNBOUNDED `iam.has_access` lane —
--     3.16 ms per row scanned, the opposite of this lane;
--   * the generator has since gained SHARED-ONLY's member-knob guard on the organization-member
--     arm, which the live policy does not carry. It NARROWS the mirror. Right or not, landing
--     it here would change answers, and this lane's whole clause is that answers do not move.
-- Both are named in the report. File 3 teaches the generator this lane's shape so a future
-- regeneration inherits it.

do $mirror2$
declare
  v_qual   text;
  v_needle text;
  v_new    text;
  v_hits   integer;
begin
  select p.qual into v_qual
    from pg_catalog.pg_policies p
   where p.schemaname = 'custom' and p.tablename = 'record' and p.policyname = 'std_select';

  if v_qual is null then
    raise exception 'MIRROR-2: custom.record has no std_select policy to bound.';
  end if;

  -- THE POLICY'S OWN `-- based-on:` LINE. A policy is not a function, so `db:apply` cannot check
  -- it; this is the same promise in the same place — if the text moved, nothing happens.
  if pg_catalog.md5(v_qual) <> 'a040a84df93b3ff2e8ebdbb0d260823f' then
    raise exception 'MIRROR-2: custom.record std_select is not the text this file was written '
      'against (md5 % , expected a040a84df93b3ff2e8ebdbb0d260823f). Re-read the live policy, '
      're-derive the arm, and update this file — do not force it.', pg_catalog.md5(v_qual);
  end if;

  v_needle := 'SELECT iam.unnest_uuids(iam.accessible_entity_ids(''record''::text, '
           || '''viewer''::permission_level, 0, true)) AS unnest_uuids' || chr(10)
           || 'UNION' || chr(10);

  v_hits := (pg_catalog.length(v_qual) - pg_catalog.length(pg_catalog.replace(v_qual, v_needle, '')))
            / pg_catalog.length(v_needle);
  if v_hits <> 1 then
    raise exception 'MIRROR-2: expected exactly one whole-database record candidate in the '
      'policy text, found %.', v_hits;
  end if;

  v_new := '(' || pg_catalog.replace(v_qual, v_needle, '') || ')'
        || ' or (deleted_at is null'
        || '     and iam.record_visible_in_org(organization_id, table_id, id, visibility,'
        || '                                    created_by, ''viewer''::public.permission_level)'
        || '     and iam.has_access(''record'', id, ''viewer''::public.permission_level))';

  execute pg_catalog.format('alter policy std_select on custom.record using (%s)', v_new);
end
$mirror2$;
