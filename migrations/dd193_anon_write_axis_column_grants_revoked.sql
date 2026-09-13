-- dd193_anon_write_axis_column_grants_revoked — THE COLUMN-SHAPED HALF OF THE ANON WRITE AXIS
-- (DD-193. SECURITY P0. db-rules §0/§6d/§9. GRANTS only; no policy is created, altered or dropped.)
--
-- ═══ WHY THERE IS A SECOND FILE ═══════════════════════════════════════════════════════════════
-- `dd193_anon_write_axis_revoked.sql` revoked INSERT / UPDATE / DELETE / MAINTAIN from `anon` on
-- 286 relations, and asserted its own completeness — by counting `aclexplode(pg_class.relacl)`.
-- That is only half the catalog. A privilege can also be held per COLUMN, in
-- `pg_attribute.attacl`, and **a table-level REVOKE does not remove a column grant**. So the sweep,
-- the assertion and the new guard were all written against the same incomplete definition of the
-- surface, and all three certified a table that was still writable-by-privilege to zero.
--
-- The independent verifier (V-56) found it. One relation survived:
--
--     docproc.processed_documents   anon   INSERT on 32 columns
--     docproc.processed_documents   anon   UPDATE on 32 columns
--
-- Re-measured here across EVERY non-vendor schema, table ACLs and column ACLs together: that one
-- relation is the entire residue. `PUBLIC` holds no write anywhere, in either shape.
--
-- THE LESSON WAS ALREADY WRITTEN DOWN, ABOUT THIS EXACT TABLE. `dd186_anon_select_revoked_where_no_
-- reader_can_exist.sql` calls it out — "the only one of the 74 whose grant is COLUMN-level (32 of
-- 35): a table-level REVOKE does not remove a column grant, so its columns are revoked by name" —
-- and its assertion hint says the same. DD-193 read the finding and not the mechanism. Fixing the
-- class one hop short of the catalog is still fixing the instance.
--
-- ═══ WHAT IT IS, MEASURED ═════════════════════════════════════════════════════════════════════
-- The 32 granted columns are every column of the table EXCEPT `storage_uri`, `created_by` and
-- `updated_by` — the same three DD-186 withheld from `anon`'s SELECT. So this is one historical
-- grant issued over an explicit 32-column list, not a table grant that decayed.
--
-- It is NOT re-issued by the generator: `iam.apply_table_grants` grants only to `authenticated` and
-- `service_role` and names `anon` in exactly one place — a `revoke all` in its `restricted` variant.
-- So this revoke is durable against a regeneration, and the assertion at the bottom says so.
--
-- Nothing anonymous succeeded through it: all five policies on the table are `TO authenticated`
-- (plus `svc_all` for `service_role`). But it is the one place on this database where a signed-out
-- caller got PAST the privilege gate, and the database said so out loud — over HTTPS with the
-- publishable key and no JWT, the anonymous POST answered
--     42501  new row violates row-level security policy for table "processed_documents"
-- where every other table on the axis answered `permission denied for table <name>`. One arm of one
-- policy reaching `anon` or PUBLIC, on any future day, and that INSERT lands.
--
-- ═══ WHY A LOOP AND NOT 64 REVOKE LINES ═══════════════════════════════════════════════════════
-- The revoke below is written against the CATALOG, not against a list of names copied out of it: it
-- finds every column-shaped write privilege held by `anon` or PUBLIC in every non-vendor schema and
-- revokes it by name. A hand-copied list is a photograph of the database at the moment someone read
-- it, and a sibling lane creating a table between that read and this apply would leave the file
-- silently short. Each revoke is announced by name so the migration log says exactly what moved.

do $$
declare
  v_row record;
  v_n integer := 0;
begin
  for v_row in
    select n.nspname as sch,
           c.relname as rel,
           a.attname as col,
           case when x.grantee = 0 then 'public' else pg_get_userbyid(x.grantee) end as grantee,
           x.privilege_type as priv
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    cross join lateral aclexplode(a.attacl) x
    where c.relkind in ('r','p','v','m','f')
      and x.privilege_type in ('INSERT','UPDATE','REFERENCES')
      and (x.grantee = 0 or pg_get_userbyid(x.grantee) = 'anon')
      and n.nspname not in ('pg_catalog','information_schema','storage','realtime','net','cron',
                            'extensions','graphql','graphql_public','auth','vault','pgsodium',
                            'pgsodium_masks','supabase_migrations','supabase_functions')
    order by 1, 2, 5, 3
  loop
    execute format('revoke %s (%I) on %I.%I from %I',
                   v_row.priv, v_row.col, v_row.sch, v_row.rel, v_row.grantee);
    v_n := v_n + 1;
    raise notice 'dd193: revoked % (%) on %.% from %',
      v_row.priv, v_row.col, v_row.sch, v_row.rel, v_row.grantee;
  end loop;
  raise notice 'dd193: % column-shaped write grant(s) revoked from anon/PUBLIC.', v_n;
end $$;

-- ── THE ASSERTION, now reading BOTH halves of the catalog. This is the check the first file should
--    have carried: `relacl` UNION ALL `attacl`. A relation is on the anon write axis if a signed-out
--    caller holds the privilege in EITHER shape, and `has_any_column_privilege` — which is blind to
--    which shape it is — is the third, independent way of asking, so it is asked too.
do $$
declare
  v_acl      integer;
  v_names    text;
  v_effective integer;
  v_eff_names text;
  v_generator integer;
begin
  select count(*), string_agg(distinct obj, ', ' order by obj)
    into v_acl, v_names
  from (
    select n.nspname || '.' || c.relname || ' (table ' || x.privilege_type || ')' as obj
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) x
    where c.relkind in ('r','p','v','m','f')
      and x.privilege_type in ('INSERT','UPDATE','DELETE','MAINTAIN','REFERENCES')
      and (x.grantee = 0 or pg_get_userbyid(x.grantee) = 'anon')
      and n.nspname not in ('pg_catalog','information_schema','storage','realtime','net','cron',
                            'extensions','graphql','graphql_public','auth','vault','pgsodium',
                            'pgsodium_masks','supabase_migrations','supabase_functions')
    union all
    select n.nspname || '.' || c.relname || ' (column ' || x.privilege_type || ')' as obj
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    cross join lateral aclexplode(a.attacl) x
    where c.relkind in ('r','p','v','m','f')
      and x.privilege_type in ('INSERT','UPDATE','REFERENCES')
      and (x.grantee = 0 or pg_get_userbyid(x.grantee) = 'anon')
      and n.nspname not in ('pg_catalog','information_schema','storage','realtime','net','cron',
                            'extensions','graphql','graphql_public','auth','vault','pgsodium',
                            'pgsodium_masks','supabase_migrations','supabase_functions')
  ) t;
  if v_acl > 0 then
    raise exception
      'dd193: % anon/PUBLIC write privilege(s) survive in the catalog: %. A table-level REVOKE does not remove a column grant — revoke the column grant by name. Nothing was committed.',
      v_acl, v_names;
  end if;

  -- The same question asked a completely different way, so a mistake in the ACL
  -- query above cannot pass twice.
  select count(*), string_agg(obj, ', ' order by obj)
    into v_effective, v_eff_names
  from (
    select n.nspname || '.' || c.relname as obj
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r','p','v','m','f')
      and n.nspname not in ('pg_catalog','information_schema','storage','realtime','net','cron',
                            'extensions','graphql','graphql_public','auth','vault','pgsodium',
                            'pgsodium_masks','supabase_migrations','supabase_functions')
      and (has_any_column_privilege('anon', c.oid, 'INSERT')
        or has_any_column_privilege('anon', c.oid, 'UPDATE')
        or has_table_privilege('anon', c.oid, 'DELETE'))
  ) t;
  if v_effective > 0 then
    raise exception
      'dd193: anon still holds an EFFECTIVE write on %: %. Nothing was committed.',
      v_effective, v_eff_names;
  end if;

  -- And the durability claim this file makes in its header, asserted rather than asserted-in-prose:
  -- the canonical grant generator must not name `anon` as a grantee anywhere, or a regeneration of
  -- any table would quietly re-open what this file just closed.
  select count(*) into v_generator
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'iam' and p.proname = 'apply_table_grants'
    and p.prosrc ~* 'grant[^;]*to\s+anon';
  if v_generator > 0 then
    raise exception
      'dd193: iam.apply_table_grants now GRANTS to anon — every regeneration would re-open the write axis this file just closed. Nothing was committed.';
  end if;

  raise notice 'dd193: anon holds no write privilege on any relation in either catalog shape, and the grant generator never grants to anon.';
end $$;
