-- iam_apply_table_grants_column_grant_guard.sql (2026-08-21)
--
-- TASK A of the DB drift-audit adjudication (2026-08-21), finding 3-4 of
-- common-docs/projects/archive/db-changeover-2026-08/architecture-drift-audit-2026-08-15.md.
-- Canon: common-docs/systems/platform/db-rules/FEATURE.md §6d-2.
--
-- THE HOLE THIS CLOSES.
-- `iam.apply_table_grants` is variant-keyed and TABLE-LEVEL. Its first act is
-- `revoke all on <tbl> from authenticated`, which also destroys any COLUMN-level
-- ACL on that table, and it then re-grants the whole table. Several tables carry a
-- DELIBERATE column-level grant design whose entire purpose is to EXCLUDE one
-- sensitive column from `authenticated`:
--
--   users.user_secrets            excludes value_encrypted   (aidream 0235, credential vault phase 1)
--   users.credential_attachments  excludes value_encrypted   (aidream 0264, vault family)
--   users.integration_connections excludes vault_secret_key, credential_item_id
--   docproc.processed_documents   excludes storage_uri
--   rag.library_docs              excludes storage_uri
--
-- Run plainly against any of those, the generator would SILENTLY reopen the
-- ciphertext / storage-location channel and report success. This adds a third
-- refusal alongside the two D184 safety rails (RLS-off, zero-policies): the
-- generator now REFUSES a table whose `authenticated` column grants form a
-- STRICT SUBSET of its live columns, and names the excluded columns in the error.
--
-- A full-coverage column-grant table (every live column granted — e.g.
-- users.integration_connection_resources, 11/11) is NOT a deliberate exclusion
-- design and is deliberately NOT refused: the table-level grant is equivalent.
--
-- OVERRIDE PATH (deliberate, auditable, session-scoped):
--   set local iam.allow_column_grant_override = 'on';
--   select iam.apply_table_grants('users','user_secrets','entity');
-- Only do that when the column-level design is genuinely being retired, and
-- record why in the migration that does it.
--
-- PURE GUARD. This migration changes NO grant and NO policy on any table. It
-- replaces one function body.

create or replace function iam.apply_table_grants(
  p_schema  text,
  p_table   text,
  p_variant text default 'entity'
)
returns void
language plpgsql
as $function$
declare
  v_tbl text := format('%I.%I', p_schema, p_table);
  v_rel regclass := v_tbl::regclass;
  v_rls_on boolean;
  v_n_pol integer;
  v_live_cols integer;
  v_granted_cols integer;
  v_excluded text;
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

  -- THE COLUMN-GRANT RAIL (db-rules §6d-2, 2026-08-21). A table whose
  -- `authenticated` column grants are a STRICT SUBSET of its live columns is
  -- running a deliberate exclusion design. Table-level grants would erase it.
  select count(*),
         count(*) filter (where a.attacl::text like '%authenticated=%')
    into v_live_cols, v_granted_cols
  from pg_attribute a
  where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped;

  if v_granted_cols > 0 and v_granted_cols < v_live_cols then
    select string_agg(a.attname, ', ' order by a.attnum)
      into v_excluded
    from pg_attribute a
    where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
      and (a.attacl is null or a.attacl::text not like '%authenticated=%');

    begin
      v_override := current_setting('iam.allow_column_grant_override', true);
    exception when others then
      v_override := null;
    end;

    if coalesce(v_override, '') not in ('on', 'true', '1', 'yes') then
      raise exception
        'apply_table_grants: %.% runs a deliberate COLUMN-LEVEL grant design for `authenticated` (% of % columns granted; EXCLUDED: %) — refusing to issue table-level grants, which would silently REOPEN those columns. If you are deliberately retiring that design, re-run with: set local iam.allow_column_grant_override = ''on''; (db-rules FEATURE.md §6d-2)',
        p_schema, p_table, v_granted_cols, v_live_cols, v_excluded;
    end if;

    raise notice
      'apply_table_grants: OVERRIDE ACCEPTED — %.% column-grant design (excluded: %) is being replaced by table-level grants.',
      p_schema, p_table, v_excluded;
  end if;

  execute format('revoke all on %s from authenticated', v_tbl);

  if p_variant = 'ledger' then
    -- Append-only org log: reads only; writes belong to a SECURITY DEFINER writer.
    execute format('grant select on %s to authenticated', v_tbl);
  else
    execute format('grant select, insert, update, delete on %s to authenticated', v_tbl);
  end if;

  -- service_role is the server's bypass lane and always needs full reach.
  execute format('grant all on %s to service_role', v_tbl);
end;
$function$;
