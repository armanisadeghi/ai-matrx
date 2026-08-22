-- D231 — the storage_uri lockdown stops being re-broken, and files.files /
-- files.file_versions are re-locked for the THIRD time
-- =====================================================================
-- db-rules §6d-2 (THE COLUMN-GRANT RAIL) + §6a (the security philosophy: a
-- legitimate user blocked from their own data is as serious as a stranger let
-- in — both failure modes are weighed here).
--
-- THE LEAK, measured live before writing (aclexplode over pg_class.relacl):
--
--   files.files          authenticated=arwd    0 of 26 column grants
--   files.file_versions  authenticated=arwd    0 of 11 column grants
--
-- i.e. any signed-in browser client could SELECT and UPDATE the server-only
-- `storage_uri` — the native s3:// object path — on both tables. That is the
-- exact IDOR channel `db/migrations/0147` (read) and `0149` (write) closed, that
-- `0156_storage_uri_grant_relock.sql` re-closed after the 2026 schema reorg had
-- silently reverted it, and that `scripts/validate_storage_uri_isolation.py`
-- exists to scream about. It reverted a THIRD time. Filed as matrx-frontend
-- FOUND_DEFECTS D231 and left open because "re-closing it is a live grant
-- change"; re-confirmed live 2026-08-21 while executing the NO NULL ORG ruling
-- on rag.library_docs, and closed here.
--
-- 🚨 THE POINT OF THIS MIGRATION IS PART 1, NOT PART 2. Re-locking is four
-- lines. It has now been done three times, and it will be undone a fourth
-- unless the thing that undoes it stops undoing it.
--
-- WHY IT KEEPS DYING. `iam.apply_table_grants` — which `iam.apply_rls` calls at
-- the end of every canonical policy application — opens with
-- `revoke all on <tbl> from authenticated` and then issues a TABLE-level
-- `grant select, insert, update, delete`. A table-level grant subsumes every
-- column grant, so one `apply_rls` erases a column-exclusion design completely.
-- The §6d-2 rail was added to stop exactly this, and it works — but it detects
-- the design by LOOKING FOR IT: it refuses only while `authenticated`'s column
-- grants are a STRICT SUBSET of the live columns. Once a table has already been
-- flattened, `granted_cols = 0`, the subset test is false, the rail is silent,
-- and every subsequent `apply_rls` re-flattens it. **The rail protects a living
-- design and cannot protect a dead one — so the first accident is permanent.**
-- files.files and files.file_versions had already been flattened when the rail
-- shipped, which is exactly why they are the two tables it never defended.
--
-- ── THE DESIGN MUST BE DECLARED, AND HERE IS THE PROOF THAT IT MUST ─────────
-- The obvious fix is for `apply_table_grants` to SNAPSHOT the exclusion set
-- from the catalog before it revokes and re-apply it after. That was written
-- first, and a live rolled-back test killed it:
--
--     alter table rag.library_docs add column zzz_new_col text;
--     select iam.apply_rls('rag','library_docs','library_doc','entity');
--     -- excluded from authenticated: storage_uri, ZZZ_NEW_COL
--
-- `ADD COLUMN` leaves `attacl` NULL, so a brand-new column is indistinguishable
-- from a deliberately-excluded one when you read only the ACLs. A snapshot
-- therefore makes every future column silently unreadable to clients — the
-- access-denial failure §6a weighs equally with a leak, and the exact reflex
-- that cost two days on the marketing platform. **An exclusion is INTENT, and
-- intent cannot be recovered from the artifact it produced. It has to be
-- written down.**
--
-- WHERE IT IS WRITTEN DOWN: `platform.entity_types.client_excluded_columns`,
-- beside `governed_columns` — the registry already carries per-table column
-- policy that the generator reads, and this is one more of exactly that kind.
-- No new table, no new concept, one more column on the row that already
-- decides how a table's RLS is generated.
--
-- WHAT THE GENERATOR DOES NOW:
--   * declaration present  -> grant every column EXCEPT the declared ones.
--     Idempotent, survives regeneration forever, and a column added later is
--     granted normally because it simply is not in the list.
--   * declaration absent, but an undeclared ACL design detected -> RAISE, as
--     the rail does today, and the message now names the fix (declare it).
--     Unchanged protection for anything not yet migrated.
--   * `iam.allow_column_grant_override = 'on'` still means DELIBERATELY RETIRE:
--     it clears the declaration for that call and flattens to table grants,
--     loudly.
--
-- SCOPE NOTE, stated rather than glossed: three more tables run a column design
-- and are NOT registered in `platform.entity_types` —
-- `users.user_secrets` / `users.credential_attachments` /
-- `users.integration_connections` (value_encrypted / vault_secret_key +
-- credential_item_id). `apply_table_grants` is only ever reached through
-- `iam.apply_rls`, which requires a registered token, so nothing regenerates
-- them today and their designs are not at risk. If any of them is ever
-- registered, the RAISE lane above is what will stop the flattening and ask for
-- the declaration. They are deliberately left alone here.
--
-- `anon` is not touched by this function and is barely touched here: its own
-- column design on both files tables is INTACT (25 of 26 / 9 of 11, storage_uri
-- excluded), which is why `files.files`' `pub_read` lane still works — verified
-- live, anon sees 1,779 public files. The one anon change is in Part 2.
--
-- Live census of every column-grant design on the platform, before this ran:
--   docproc.processed_documents   32/33  excluded: storage_uri            (registered)
--   rag.library_docs              18/19  excluded: storage_uri            (registered)
--   users.credential_attachments  15/16  excluded: value_encrypted        (unregistered)
--   users.integration_connections 16/18  excluded: vault_secret_key, credential_item_id (unregistered)
--   users.user_secrets            23/24  excluded: value_encrypted        (unregistered)
--   files.files                    0/26  DEAD -> storage_uri              (registered)
--   files.file_versions            0/11  DEAD -> storage_uri              (registered)

BEGIN;

-- ═════════════════════════════════════════════════════════════════════
-- PART 1 — the design becomes DECLARED, and the generator honours it
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE platform.entity_types
  ADD COLUMN IF NOT EXISTS client_excluded_columns text[];

COMMENT ON COLUMN platform.entity_types.client_excluded_columns IS
  'Columns that must NEVER be granted to the `authenticated` client role — a '
  'server-only storage path, a ciphertext column, a vault key. '
  '`iam.apply_table_grants` grants every OTHER column instead of a table-level '
  'grant, so the exclusion survives every policy regeneration and a column '
  'added later is granted normally. NULL/empty = no design; an UNDECLARED '
  'design found in the catalog makes apply_table_grants RAISE (db-rules §6d-2).';

-- Declare the four registered designs (two live, two being revived in Part 2).
UPDATE platform.entity_types SET client_excluded_columns = ARRAY['storage_uri']
 WHERE (schema_name, table_name) IN
       (('files','files'), ('files','file_versions'),
        ('docproc','processed_documents'), ('rag','library_docs'));

-- The quoted column list lives in one function so the identifier quoting exists
-- in exactly one place: a GRANT column list is interpolated as SQL text, and
-- `quote_ident` is the only thing standing between a column named `my col` and
-- a syntax error.
CREATE OR REPLACE FUNCTION iam._client_grant_column_list(p_rel regclass, p_excluded text[])
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
  from pg_attribute a
  where a.attrelid = p_rel and a.attnum > 0 and not a.attisdropped
    and not (a.attname = any(p_excluded));
$function$;

COMMENT ON FUNCTION iam._client_grant_column_list(regclass, text[]) IS
  'Quoted, attnum-ordered column list for a client GRANT, minus the excluded '
  'names. Helper for iam.apply_table_grants (db-rules §6d-2).';

CREATE OR REPLACE FUNCTION iam.apply_table_grants(p_schema text, p_table text, p_variant text DEFAULT 'entity'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_tbl text := format('%I.%I', p_schema, p_table);
  v_rel regclass := v_tbl::regclass;
  v_rls_on boolean;
  v_n_pol integer;
  v_live_cols integer;
  v_granted_cols integer;
  v_declared text[];
  v_missing text;
  v_excluded_now text;
  v_kept text;
  v_override text;
begin
  select c.relrowsecurity,
         (select count(*) from pg_policy p where p.polrelid = c.oid)
    into v_rls_on, v_n_pol
  from pg_class c where c.oid = v_rel;

  -- THE SAFETY RAIL. Never widen a table whose only protection is the absence
  -- of a grant.
  if not v_rls_on then
    raise exception
      'apply_table_grants: %.% has RLS DISABLED — refusing to grant. Enable RLS and apply policies first (this table is a hole, not a closed door).',
      p_schema, p_table;
  end if;
  if v_n_pol = 0 then
    raise exception
      'apply_table_grants: %.% has RLS enabled but ZERO policies — refusing to grant. Apply canonical policies first.',
      p_schema, p_table;
  end if;

  -- ── THE COLUMN-EXCLUSION DESIGN (db-rules §6d-2) ─────────────────────────
  -- Declared in the registry, never inferred from the catalog. `ADD COLUMN`
  -- leaves attacl NULL, so a new column and a deliberately-excluded one are
  -- indistinguishable in the ACLs; inferring the set would silently hide every
  -- future column from clients (proven live, 2026-08-21). The declaration is
  -- the intent; the ACLs are only its artifact.
  select et.client_excluded_columns into v_declared
  from platform.entity_types et
  where et.schema_name = p_schema and et.table_name = p_table
  limit 1;

  if v_declared is not null and cardinality(v_declared) = 0 then
    v_declared := null;
  end if;

  -- A declared name that is not a live column is a stale declaration, and a
  -- stale declaration is how an exclusion quietly stops excluding anything.
  if v_declared is not null then
    select string_agg(x, ', ') into v_missing
    from unnest(v_declared) x
    where not exists (select 1 from pg_attribute a
                       where a.attrelid = v_rel and a.attname = x
                         and a.attnum > 0 and not a.attisdropped);
    if v_missing is not null then
      raise exception
        'apply_table_grants: %.% declares client_excluded_columns that do not exist: % — fix or clear the declaration (db-rules §6d-2).',
        p_schema, p_table, v_missing;
    end if;
  end if;

  -- The override means, and has always meant, DELIBERATELY RETIRE this design.
  begin
    v_override := current_setting('iam.allow_column_grant_override', true);
  exception when others then
    v_override := null;
  end;

  if v_declared is not null
     and coalesce(v_override, '') in ('on', 'true', '1', 'yes') then
    raise notice
      'apply_table_grants: OVERRIDE ACCEPTED — %.% column-grant design (excluded: %) is being RETIRED for this call; table-level grants replace it. Clear entity_types.client_excluded_columns to make that permanent.',
      p_schema, p_table, array_to_string(v_declared, ', ');
    v_declared := null;
  end if;

  -- An UNDECLARED design still refuses, exactly as the rail did before — that
  -- is the lane protecting every table not yet migrated to a declaration.
  if v_declared is null then
    select count(*),
           count(*) filter (where a.attacl::text like '%authenticated=%')
      into v_live_cols, v_granted_cols
    from pg_attribute a
    where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped;

    if v_granted_cols > 0 and v_granted_cols < v_live_cols
       and coalesce(v_override, '') not in ('on', 'true', '1', 'yes') then
      select string_agg(a.attname, ', ' order by a.attnum) into v_excluded_now
      from pg_attribute a
      where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
        and (a.attacl is null or a.attacl::text not like '%authenticated=%');
      raise exception
        'apply_table_grants: %.% runs an UNDECLARED column-level grant design for `authenticated` (% of % columns granted; EXCLUDED: %) — refusing to issue table-level grants, which would silently REOPEN those columns. Declare it: UPDATE platform.entity_types SET client_excluded_columns = ARRAY[...] WHERE schema_name=%L AND table_name=%L; then re-run. To retire the design instead: set local iam.allow_column_grant_override = ''on''; (db-rules §6d-2)',
        p_schema, p_table, v_granted_cols, v_live_cols, v_excluded_now, p_schema, p_table;
    end if;
  end if;

  execute format('revoke all on %s from authenticated', v_tbl);

  if p_variant = 'ledger' then
    -- Append-only org log: reads only; writes belong to a SECURITY DEFINER writer.
    if v_declared is null then
      execute format('grant select on %s to authenticated', v_tbl);
    else
      execute format('grant select (%s) on %s to authenticated',
                     iam._client_grant_column_list(v_rel, v_declared), v_tbl);
    end if;
  else
    if v_declared is null then
      execute format('grant select, insert, update, delete on %s to authenticated', v_tbl);
    else
      v_kept := iam._client_grant_column_list(v_rel, v_declared);
      -- DELETE has no column form and needs none: removing a row you are
      -- already permitted to remove reveals nothing about an excluded column.
      execute format('grant select (%1$s), insert (%1$s), update (%1$s) on %2$s to authenticated',
                     v_kept, v_tbl);
      execute format('grant delete on %s to authenticated', v_tbl);
    end if;
  end if;

  if v_declared is not null then
    raise notice
      'apply_table_grants: %.% column-exclusion design PRESERVED (withheld from authenticated: %).',
      p_schema, p_table, array_to_string(v_declared, ', ');
  end if;

  -- service_role is the server's bypass lane and always needs full reach.
  execute format('grant all on %s to service_role', v_tbl);
end;
$function$;

-- ═════════════════════════════════════════════════════════════════════
-- PART 2 — D231: revive the two designs that were already dead
-- ═════════════════════════════════════════════════════════════════════
-- Through the generator, not by hand, so this is the last time anyone writes it
-- out. Both tables are declared above; `apply_rls` now does the rest and will
-- keep doing it on every future regeneration.

SELECT iam.apply_rls('files', 'files',         'file',         'entity');
SELECT iam.apply_rls('files', 'file_versions', 'file_version', 'component');

-- `anon` holds a bare `d`+`m` on both — the residue of an old blanket
-- `GRANT ALL TO anon` minus 0156's `REVOKE SELECT, UPDATE, INSERT`. It is inert
-- (neither table has an anon DELETE policy) but it is the D184 shape: one
-- policy away from anonymous deletion of every file row, and nothing reads it.
-- anon's own SELECT column design is deliberately NOT touched — it is what
-- makes `files.files`' `pub_read` lane work.
REVOKE DELETE, MAINTAIN ON files.files         FROM anon;
REVOKE DELETE, MAINTAIN ON files.file_versions FROM anon;

-- ═════════════════════════════════════════════════════════════════════
-- PART 3 — Assertions. This migration proves itself or it does not land.
-- ═════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_bad integer; v_n integer;
BEGIN
  -- (a) storage_uri is reachable by NO client role on any of the four tables
  --     validate_storage_uri_isolation.py guards — column grants...
  SELECT count(*) INTO v_bad
  FROM pg_attribute a
  WHERE a.attrelid IN ('files.files'::regclass, 'files.file_versions'::regclass,
                       'docproc.processed_documents'::regclass, 'rag.library_docs'::regclass)
    AND a.attname = 'storage_uri' AND NOT a.attisdropped
    AND (a.attacl::text LIKE '%authenticated=%' OR a.attacl::text LIKE '%anon=%');
  IF v_bad <> 0 THEN RAISE EXCEPTION 'storage_uri column-granted on % table(s)', v_bad; END IF;

  -- ...and table grants, which would subsume every column exclusion.
  SELECT count(*) INTO v_bad
  FROM (SELECT unnest(ARRAY['files.files'::regclass, 'files.file_versions'::regclass,
                            'docproc.processed_documents'::regclass, 'rag.library_docs'::regclass]) rel) t,
       aclexplode((SELECT relacl FROM pg_class WHERE oid = t.rel)) x
  WHERE x.grantee IN ('authenticated'::regrole, 'anon'::regrole)
    AND x.privilege_type IN ('SELECT', 'INSERT', 'UPDATE');
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'table-level SELECT/INSERT/UPDATE survived on % grant(s) — a table grant subsumes the column exclusion', v_bad;
  END IF;

  -- (b) the two revived tables grant everything ELSE — the leak is closed
  --     without closing anything the client legitimately reads.
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = 'files.files'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attacl::text LIKE '%authenticated=%';
  IF v_n <> 25 THEN RAISE EXCEPTION 'files.files: % of 25 columns granted to authenticated', v_n; END IF;

  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = 'files.file_versions'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attacl::text LIKE '%authenticated=%';
  IF v_n <> 10 THEN RAISE EXCEPTION 'files.file_versions: % of 10 columns granted to authenticated', v_n; END IF;

  -- (c) anon keeps its own intact design on files.files — pub_read must live.
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = 'files.files'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attacl::text LIKE '%anon=%';
  IF v_n <> 25 THEN RAISE EXCEPTION 'anon lost its files.files column design (% of 25)', v_n; END IF;

  -- (d) and anon can no longer DELETE.
  IF has_table_privilege('anon', 'files.files', 'delete')
     OR has_table_privilege('anon', 'files.file_versions', 'delete') THEN
    RAISE EXCEPTION 'anon still holds DELETE on a files table';
  END IF;

  -- (e) every declaration names live columns, everywhere in the registry.
  SELECT count(*) INTO v_bad
  FROM platform.entity_types et, unnest(et.client_excluded_columns) x
  WHERE et.client_excluded_columns IS NOT NULL
    AND to_regclass(format('%I.%I', et.schema_name, et.table_name)) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_attribute a
       WHERE a.attrelid = format('%I.%I', et.schema_name, et.table_name)::regclass
         AND a.attname = x AND a.attnum > 0 AND NOT a.attisdropped);
  IF v_bad <> 0 THEN RAISE EXCEPTION '% stale client_excluded_columns name(s) in the registry', v_bad; END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
