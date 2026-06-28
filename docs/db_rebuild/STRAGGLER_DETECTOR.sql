-- ============================================================================
-- STRAGGLER DETECTOR — finds tables left behind when their batch moved.
-- Run via the Supabase MCP (execute_sql), project txzxabzwovsujtloxrus.
-- Four detectors. A finding is a CANDIDATE, not a verdict — always characterize (rows,
-- FKs, function refs, code grep) before acting, because a name collision can be three
-- legitimately-distinct tables (e.g. public.category vs app.category vs skill.category).
-- ⚠️ A-C scan TABLES ONLY (relkind='r'). The #1 shim type is a leftover compat VIEW
-- (public.cx_conversation_summary -> chat.*, public.agx_context_menu_view -> agent.*) —
-- those hide from A-C. ALWAYS run Detector D too.
-- ============================================================================

-- ── DETECTOR A: cross-schema name collision ─────────────────────────────────
-- Same table name in `public` AND a domain schema = a half-finished move (the data
-- may be in either). HIGH precision for renames-in-place; MISSES renamed moves
-- (org_module_settings -> org_module_config) — those need Detector C / manual.
with t as (
  select n.nspname as schema, c.relname as tbl,
    (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint as rows
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r'
    and n.nspname in ('public','platform','iam','chat','agent','skill','tool','app','workflow',
                      'context','files','workspace','workbench','ai','runtime','users','scraper','rag','legal')
)
select pub.tbl, pub.rows as public_rows, dom.schema as also_lives_in, dom.rows as domain_rows
from t pub join t dom on pub.tbl = dom.tbl and pub.schema = 'public' and dom.schema <> 'public'
order by pub.tbl;

-- ── DETECTOR B: legacy/domain-prefixed tables still stuck in public ─────────
-- A table whose prefix names a schema its batch already moved to. Empty result =
-- the prefix-batches are clean (good). Extend the prefix->schema map as new
-- domains migrate.
select c.relname as tbl,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I', c.relname), false, true, '')))[1]::text::bigint as rows,
  case
    when c.relname ~ '^cx_'              then 'chat'
    when c.relname ~ '^(agx_|aga_|agc_)' then 'agent'
    when c.relname ~ '^skl_'             then 'skill'
    when c.relname ~ '^(cld_|file_)'     then 'files'
    when c.relname ~ '^ctx_'             then 'context'
    when c.relname ~ '^wr_'              then 'war-room'
    when c.relname ~ '^udt_'             then 'workbench'
    when c.relname ~ '^tool_'            then 'tool'
    when c.relname ~ '^wf_'              then 'workflow'
    else '?' end as prefix_implies_schema,
  exists(select 1 from platform.entity_types et where et.schema_name='public' and et.table_name=c.relname) as registered_in_public
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname = 'public'
  and c.relname ~ '^(cx_|agx_|aga_|agc_|skl_|cld_|file_|ctx_|wr_|udt_|tool_|wf_)'
order by prefix_implies_schema, c.relname;

-- ── DETECTOR C: empty canonical table whose old sibling is still live ────────
-- The org_module pattern: a registered/domain table sitting EMPTY while a similarly-
-- purposed public table holds the data + the consumers. Heuristic on a shared base
-- name (de-prefixed). Review each hit — the "empty" one may just be a new feature.
with d as (
  select n.nspname as schema, c.relname as tbl,
    regexp_replace(c.relname,'^(org_|cx_|agx_|aga_|agc_|skl_|cld_|file_|ctx_|wr_|udt_|tool_|wf_|user_)','') as base,
    (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint as rows
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind='r' and n.nspname <> 'graveyard' and n.nspname not in ('pg_catalog','information_schema','pg_toast','auth','storage','realtime','vault','extensions')
)
select dom.schema as empty_canonical_schema, dom.tbl as empty_canonical, dom.rows as canon_rows,
       pub.schema as live_old_schema, pub.tbl as live_old, pub.rows as old_rows
from d dom join d pub
  on dom.base = pub.base and dom.tbl <> pub.tbl and dom.schema <> pub.schema
where dom.rows = 0 and pub.rows > 0 and pub.schema = 'public'
order by old_rows desc;

-- ── DETECTOR D: leftover compat VIEWS over a moved schema (the shim hunter) ──
-- A public view whose body SELECTs from a domain schema is almost always a rename
-- shim (public.cx_conversation_summary = SELECT … FROM chat.conversation_summary).
-- Characterize each: a 1:1 `SELECT … FROM <schema>.<x>` is a pure shim (repoint
-- consumers + DROP); a multi-table aggregation that merely *joins* a domain table is
-- a real feature view (keep). Watch for divergence — two views (public copy vs the
-- moved one) read by different consumers can drift out of sync.
select c.relname as public_view,
  array(select distinct (m)[1] from regexp_matches(pg_get_viewdef(c.oid, true),
        '\m(chat|agent|skill|tool|app|workflow|context|files|workspace|workbench|iam|runtime)\.', 'g') m) as references_schemas
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('v','m') and n.nspname = 'public'
  and pg_get_viewdef(c.oid, true) ~* '\m(chat|agent|skill|tool|app|workflow|context|files|workspace|workbench|iam|runtime)\.'
order by c.relname;
