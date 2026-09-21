-- lane: SECURITY-SWEEP
-- THE SECOND HALF of secsweep_the_webhook_secret_is_minted_behind_a_door.sql: with both doors
-- live and every caller moved (`features/files/webhooks/service.ts` — `createWebhook` calls
-- `webhook_create`, `rotateWebhookSecret` calls `webhook_rotate_secret`, `updateWebhook` reads
-- the named column list instead of `select("*")`, and `generateWebhookSecret()` is deleted),
-- the column leaves the client grant. It refuses to run if those doors are not there.
--
-- Why exclusion and not a pin: the value IS the credential. There is no value of
-- `files.webhooks.secret` a client may legitimately choose, so there is no pin to write —
-- the door is removed, which is the same ruling `iam.api_keys` got.
--
-- ADDITIVE for the app. Inverse:
-- migrations/inverse/secsweep_the_webhook_secret_leaves_the_client_grant.inverse.sql
-- Guard: `pnpm check:unpinned-security-columns` — files.webhooks|std_insert|a|secret and its
-- std_update twin leave the baseline.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('files','webhooks','secret','entity')
    ) as t(schema_name, table_name, column_name, variant)
  loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = r.schema_name and table_name = r.table_name
         and column_name = r.column_name
    ) then
      raise exception 'secsweep: %.% has no column % — the census is stale, stopping',
        r.schema_name, r.table_name, r.column_name;
    end if;
    -- The door must EXIST before the old path is withdrawn, or Create stops working. This is
    -- the "closing a class means removing the door" rule read the right way round: the safe
    -- path lands first, the unsafe one is removed second, and neither file is guesswork.
    if to_regprocedure('files.webhook_create(text, uuid, text, text[], text[])') is null
       or to_regprocedure('files.webhook_rotate_secret(uuid)') is null then
      raise exception
        'secsweep: files.webhook_create / files.webhook_rotate_secret are not present — apply secsweep_the_webhook_secret_is_minted_behind_a_door.sql first, or this file breaks the Create button';
    end if;

    update platform.entity_types
       set client_excluded_columns = (
             select array_agg(distinct x order by x)
               from unnest(coalesce(client_excluded_columns, '{}'::text[])
                           || array[r.column_name]) x)
     where schema_name = r.schema_name and table_name = r.table_name
       and not (r.column_name = any (coalesce(client_excluded_columns, '{}'::text[])));

    perform iam.apply_table_grants(r.schema_name, r.table_name, r.variant);

    if has_column_privilege('authenticated',
         format('%I.%I', r.schema_name, r.table_name)::regclass, r.column_name, 'INSERT')
       or has_column_privilege('authenticated',
         format('%I.%I', r.schema_name, r.table_name)::regclass, r.column_name, 'UPDATE') then
      raise exception
        'secsweep: %.%.% is STILL client-writable after the exclusion — refusing to report a fix that did not happen',
        r.schema_name, r.table_name, r.column_name;
    end if;

    raise notice 'secsweep: %.%.% is no longer writable or readable by a client role',
      r.schema_name, r.table_name, r.column_name;
  end loop;
end $$;

comment on column files.webhooks.secret is
  'The outbound webhook''s signing secret. Minted by files.webhook_create / files.webhook_rotate_secret and returned to the creator exactly once; withheld from every client role by platform.entity_types.client_excluded_columns, so a select("*") on this table is a 42501 and the named WEBHOOK_LIST_COLUMNS list is the only read. SECURITY-SWEEP, 2026-09-21.';
