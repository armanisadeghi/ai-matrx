-- target: branch
--
-- w0_sync2_masterwork_source_and_definer_lint — the branch catches up with production,
-- second sync of 2026-09-17.
--
-- Production moved while the night ran: `platform.masterwork_source` landed at 19:44 UTC
-- (aidream 0807), with its six policies and six triggers, and two new lint helpers
-- `platform.definer_access_decision_regex_strong()` and
-- `platform.definer_identity_is_a_decision(text)` came with the definer-door work. Fifteen
-- objects in the three schemas this campaign RULES on. A lane rehearsing `platform` against
-- a branch that lacks them rehearses a system nobody is going to ship — the `custom.record`
-- class, exactly.
--
-- GENERATED, not typed: `pnpm check:branch-schema-drift --sync-plan`. Every body is
-- production's own catalog read SELECT-only inside "begin transaction read only" —
-- pg_get_functiondef, pg_get_triggerdef, pg_get_constraintdef, pg_get_indexdef,
-- pg_get_expr — so nothing here is paraphrased. The generator emits an `-- UNSUPPORTED:`
-- line rather than a nearly-right statement; this file carries none.
--
-- THE REGISTRY ROW COMES FIRST, AND THAT IS THE WHOLE TRICK. `provision_shape_guard`
-- refuses an entity-shaped table created outside `platform.provision()` unless
-- `platform.entity_types` already names it (lane (d)), and the 26 columns of
-- `platform.masterwork_source` include seven of the shape columns it counts. The row below
-- is production's own row, column for column, with `table_ref` left to the branch's own
-- `entity_types_set_ref` trigger — it is a regclass and the table does not exist yet — and
-- set to production's value by the UPDATE after the CREATE TABLE. No grandfather row, no
-- disabled guard, no invented spec.
--
-- The four foreign keys all lead an index (`rulebook_id` through `masterwork_source_identity`,
-- `organization_id`, `created_by`, `updated_by` through their own), so the guard's
-- `fk_without_index` lane charges no debt; both functions are SECURITY INVOKER, so its
-- `definer_no_door` lane charges none either. The guard stays ON for this file.
--
--   uv run python db/apply_migrations.py --source campaign \
--     --only w0_sync2_masterwork_source_and_definer_lint.sql \
--     --target branch --lane W0-SYNC --no-generate

-- ============================ RELATIONS (1)

-- platform.entity_types row FIRST: provision_shape_guard refuses an entity-shaped
-- table created outside platform.provision() unless the registry already names it,
-- and this row is production's own, column for column.
insert into platform.entity_types (id, label, notes, token, origin, category, base_tier, is_active, is_listed, is_module, data_class, table_name, audit_class, rls_variant, schema_name, content_role, is_component, is_versioned, title_column, allow_preview, relation_kind, version_store, agent_writable, projects_token, has_soft_delete, client_read_only, governed_columns, taxonomy_node_id, agent_write_notes, data_class_reason, default_scopeable, version_store_ref, audit_class_reason, default_list_scope, default_visibility, lifecycle_enlisted, lifecycle_hot_days, reference_category, reference_pickable, user_artifact_kind, default_auto_ingest, confirmation_enabled, default_needs_approval, retention_owner_column, client_excluded_columns, default_members_can_add, suppress_platform_admin_lane, reference_candidate_predicates, component_anon_read_via_public_parent) values ('0969f502-20d8-4360-a21c-3a84060a7869'::uuid, 'Masterwork Source'::text, null::text, 'masterwork_source'::text, 'standard'::text, null::text, '1'::smallint, 'true'::boolean, 'false'::boolean, 'false'::boolean, null::platform.data_class, 'masterwork_source'::text, 'entity'::text, 'component'::text, 'platform'::text, null::text, 'true'::boolean, 'false'::boolean, null::text, 'true'::boolean, 'table'::text, 'history'::text, 'false'::boolean, null::text, 'true'::boolean, 'false'::boolean, null::text[], null::uuid, null::text, null::text, 'true'::boolean, null::regclass, null::text, null::platform.list_scope, null::platform.visibility, 'false'::boolean, null::integer, null::text, 'false'::boolean, null::text, 'false'::boolean, 'false'::boolean, 'false'::boolean, null::text, null::text[], 'true'::boolean, 'false'::boolean, '{}'::jsonb, 'false'::boolean) on conflict do nothing;

-- platform.masterwork_source — production's shape, from its own catalog.
create table "platform"."masterwork_source" (
  "id" uuid default gen_random_uuid() not null,
  "rulebook_id" uuid not null,
  "source_key" text not null,
  "approach_key" text not null,
  "run_id" uuid,
  "label" text,
  "medium" text not null,
  "content" text,
  "turns" jsonb default '[]'::jsonb not null,
  "transcript_id" uuid,
  "file_id" uuid,
  "url" text,
  "captured_at" timestamp with time zone default now() not null,
  "word_count" integer default 0 not null,
  "turn_count" integer default 0 not null,
  "speaker_count" integer default 0 not null,
  "truncated" boolean default false not null,
  "source_meta" jsonb default '{}'::jsonb not null,
  "organization_id" uuid not null,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "deleted_at" timestamp with time zone,
  "version" integer default 1 not null,
  "metadata" jsonb default '{}'::jsonb not null
);
alter table "platform"."masterwork_source" add constraint "masterwork_source_pkey" PRIMARY KEY (id);
alter table "platform"."masterwork_source" add constraint "masterwork_source_medium_check" CHECK ((medium = ANY (ARRAY['turns'::text, 'document'::text, 'text'::text, 'exchange'::text])));
alter table "platform"."masterwork_source" add constraint "masterwork_source_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table "platform"."masterwork_source" add constraint "masterwork_source_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES iam.organizations(id);
alter table "platform"."masterwork_source" add constraint "masterwork_source_rulebook_id_fkey" FOREIGN KEY (rulebook_id) REFERENCES platform.rulebook(id) ON DELETE CASCADE;
alter table "platform"."masterwork_source" add constraint "masterwork_source_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id);
CREATE INDEX masterwork_source_created_by ON platform.masterwork_source USING btree (created_by);
CREATE INDEX masterwork_source_created_by_idx ON platform.masterwork_source USING btree (created_by);
CREATE UNIQUE INDEX masterwork_source_identity ON platform.masterwork_source USING btree (rulebook_id, source_key) WHERE (deleted_at IS NULL);
CREATE INDEX masterwork_source_lane ON platform.masterwork_source USING btree (rulebook_id, approach_key, captured_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX masterwork_source_organization_id_idx ON platform.masterwork_source USING btree (organization_id);
CREATE INDEX masterwork_source_updated_by ON platform.masterwork_source USING btree (updated_by);
alter table "platform"."masterwork_source" enable row level security;
grant delete, insert, select, update on "platform"."masterwork_source" to "authenticated";
grant delete, insert, maintain, references, select, trigger, truncate, update on "platform"."masterwork_source" to "service_role";

-- The registry row's table_ref, now that the relation it points at exists.
update platform.entity_types set table_ref = to_regclass('platform.masterwork_source')
 where schema_name = 'platform' and table_name = 'masterwork_source';

-- ============================ FUNCTIONS (2)

CREATE OR REPLACE FUNCTION platform.definer_access_decision_regex_strong()
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_full text := platform.definer_access_decision_regex();
  v_strong text;
begin
  -- DERIVED from the ONE list, never a second copy of it: the identity alternatives are
  -- removed, everything else is whatever that function says today. If the alternatives
  -- are ever renamed this RAISES rather than silently returning the full list, which
  -- would make the lint accept a stamp again — the exact defect this file closes.
  v_strong := replace(v_full, '|auth\s*\.\s*uid|request\.jwt\.claims', '');
  if v_strong = v_full then
    raise exception 'definer_access_decision_regex_strong: the identity alternatives are '
                    'no longer spelled the way this function removes them. Fix this '
                    'function in the same change that renamed them.'
      using errcode = 'P0001';
  end if;
  return v_strong;
end;
$function$
;

CREATE OR REPLACE FUNCTION platform.definer_identity_is_a_decision(p_src text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- The predicate keywords: what stands before an identity that is being COMPARED.
  c_gate  constant text := '\m(where|if|elsif|elseif|when|having|on|and|or|not|exists|case|check|filter|using|return)\M';
  -- The assignment and value keywords: what stands before an identity being WRITTEN.
  c_stamp constant text := '(\m(set|values|insert|returning|default|into)\M|:=|,)';
  c_ident constant text := '(auth\s*\.\s*uid\s*\(\s*\)|request\.jwt\.claims)';
  v_src   text;
  v_needle text;
  v_alias text;
  v_stmt  text;
  v_pos   integer;
  v_n     integer;
  v_prefix text;
  v_gi    integer;
  v_si    integer;
  v_i     integer;
begin
  if p_src is null then return false; end if;
  v_src := lower(p_src);

  -- (1) `(select auth.uid())` is a WRAPPER, not a position — see this file's header.
  --     Without this line the rule produces 34 false positives for every true one.
  v_src := regexp_replace(v_src,
             '\(\s*select\s+(auth\s*\.\s*uid\s*\(\s*\)|current_setting\s*\(\s*''request\.jwt\.claims''[^)]*\))\s*(as\s+[a-z_][a-z0-9_]*\s*)?\)',
             '\1', 'g');

  -- (2) follow the identity into whatever variable it was put in. THREE shapes, because
  --     `declare v_uid uuid := auth.uid()` puts a TYPE between the name and the `:=` —
  --     reading only the token before `:=` captures the word "uuid" and misses the
  --     variable entirely, which is how the first cut of this rule called
  --     `where created_by = v_uid` a stamp. The type-word blacklist below exists for the
  --     same reason: a needle of "uuid" would match every `::uuid` cast in the body.
  v_needle := c_ident;
  for v_alias in
    -- a declaration with a type:  v_uid uuid := auth.uid()  — and the identity may be
    -- WRAPPED on the way in (`:= coalesce(auth.uid(), p_actor)` is the live shape in
    -- public.library_unsubscribe), so the tail is "anywhere in this assignment", not
    -- "immediately after the :=".
    select m[1] from regexp_matches(v_src,
      '\m([a-z_][a-z0-9_]*)\s+[a-z_][a-z0-9_.\[\]]*\s*:=[^;]{0,60}?' || c_ident, 'g') m
    union
    -- a bare assignment at the start of a statement:  v_uid := auth.uid()
    select m[1] from regexp_matches(v_src,
      '(?:^|;|\n)\s*([a-z_][a-z0-9_]*)\s*:=[^;]{0,60}?' || c_ident, 'g') m
    union
    -- select auth.uid() into v_uid
    select m[2] from regexp_matches(v_src,
      'select\s+' || c_ident || '\s+into\s+(?:strict\s+)?([a-z_][a-z0-9_]*)', 'g') m
  loop
    if v_alias is not null and length(v_alias) > 1
       and v_alias not in ('uuid','text','int','int4','int8','integer','bigint','boolean',
                           'bool','jsonb','json','numeric','date','record','timestamptz',
                           'timestamp','constant','declare','begin') then
      v_needle := v_needle || '|\m' || v_alias || '\M';
    end if;
  end loop;
  v_needle := '(' || v_needle || ')';

  if v_src !~ v_needle then
    return false;   -- no identity here at all; the caller decides what that means
  end if;

  -- (3) judge every occurrence, statement by statement. ONE gate occurrence anywhere is
  --     enough: a body that compares the caller's identity even once has decided.
  foreach v_stmt in array string_to_array(v_src, ';')
  loop
    v_n := 1;
    loop
      v_pos := regexp_instr(v_stmt, v_needle, 1, v_n);
      exit when v_pos = 0 or v_pos is null;
      v_prefix := left(v_stmt, v_pos - 1);
      -- the LAST gate keyword and the LAST stamp keyword before this occurrence
      v_gi := 0; v_si := 0;
      for v_i in 1..200 loop
        exit when regexp_instr(v_prefix, c_gate, 1, v_i) = 0;
        v_gi := regexp_instr(v_prefix, c_gate, 1, v_i);
      end loop;
      for v_i in 1..200 loop
        exit when regexp_instr(v_prefix, c_stamp, 1, v_i) = 0;
        v_si := regexp_instr(v_prefix, c_stamp, 1, v_i);
      end loop;
      -- an assignment OF the identity is never itself the decision; the alias carries it
      if v_gi > v_si and v_prefix !~ '(:=|\minto\M)\s*(\(\s*select\s+)?$' then
        return true;
      end if;
      v_n := v_n + 1;
      exit when v_n > 200;
    end loop;
  end loop;
  return false;
end;
$function$
;

-- ============================ POLICIES (6)

drop policy if exists "platform_admin_all" on "platform"."masterwork_source";
create policy "platform_admin_all" on "platform"."masterwork_source"
  as permissive for all to "authenticated"
  using (( SELECT is_platform_admin() AS is_platform_admin))
  with check (( SELECT is_platform_admin() AS is_platform_admin));

drop policy if exists "std_delete" on "platform"."masterwork_source";
create policy "std_delete" on "platform"."masterwork_source"
  as permissive for delete to "authenticated"
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (rulebook_id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('rulebook'::text, 'editor'::permission_level)) AS unnest_uuids)) OR iam.has_access('masterwork_source'::text, id, 'editor'::permission_level)));

drop policy if exists "std_insert" on "platform"."masterwork_source";
create policy "std_insert" on "platform"."masterwork_source"
  as permissive for insert to "authenticated"
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (rulebook_id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('rulebook'::text, 'editor'::permission_level)) AS unnest_uuids))));

drop policy if exists "std_select" on "platform"."masterwork_source";
create policy "std_select" on "platform"."masterwork_source"
  as permissive for select to "authenticated"
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (((rulebook_id IS NOT NULL) AND (rulebook_id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('rulebook'::text, 'viewer'::permission_level, 0, true)) AS unnest_uuids))) OR ((id IN ( SELECT p.resource_id
   FROM iam.permissions p
  WHERE ((p.resource_type = 'masterwork_source'::text) AND ((p.granted_to_user_id = ( SELECT auth.uid() AS uid)) OR (p.granted_to_organization_id IN ( SELECT iam.my_orgs() AS my_orgs))) AND (p.status <> 'rejected'::text) AND ((p.expires_at IS NULL) OR (p.expires_at > now())))
UNION
 SELECT m.container_id
   FROM iam.memberships m
  WHERE ((m.container_type = 'masterwork_source'::text) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.deleted_at IS NULL))
UNION
 SELECT r.item_id
   FROM platform.reachability r
  WHERE ((r.item_type = 'masterwork_source'::text) AND (r.max_level >= 'viewer'::permission_level) AND iam.has_access(r.container_type, r.container_id, 'viewer'::permission_level))
UNION
 SELECT a.source_id
   FROM platform.associations_live a
  WHERE ((a.source_type = 'masterwork_source'::text) AND (a.target_type = 'scope'::text) AND (a.role = 'assignment'::text))
UNION
 SELECT g.entity_id
   FROM platform.entity_grants g
  WHERE (g.entity_type = 'masterwork_source'::text))) AND iam.has_access('masterwork_source'::text, id, 'viewer'::permission_level)))));

drop policy if exists "std_update" on "platform"."masterwork_source";
create policy "std_update" on "platform"."masterwork_source"
  as permissive for update to "authenticated"
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR (rulebook_id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('rulebook'::text, 'editor'::permission_level)) AS unnest_uuids)) OR iam.has_access('masterwork_source'::text, id, 'editor'::permission_level)))
  with check ((( SELECT is_platform_admin() AS is_platform_admin) OR (rulebook_id IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids('rulebook'::text, 'editor'::permission_level)) AS unnest_uuids)) OR iam.has_access('masterwork_source'::text, id, 'editor'::permission_level)));

drop policy if exists "svc_all" on "platform"."masterwork_source";
create policy "svc_all" on "platform"."masterwork_source"
  as permissive for all to "service_role"
  using (true)
  with check (true);

-- ============================ TRIGGERS (6)

CREATE OR REPLACE TRIGGER _gc_assoc_harddelete AFTER DELETE ON platform.masterwork_source FOR EACH ROW EXECUTE FUNCTION platform._gc_entity_associations('masterwork_source');

CREATE OR REPLACE TRIGGER _gc_assoc_softdelete AFTER UPDATE OF deleted_at ON platform.masterwork_source FOR EACH ROW EXECUTE FUNCTION platform._gc_entity_associations('masterwork_source');

CREATE OR REPLACE TRIGGER _metadata_guard BEFORE INSERT OR UPDATE OF metadata ON platform.masterwork_source FOR EACH ROW EXECUTE FUNCTION platform._metadata_guard('masterwork_source');

CREATE OR REPLACE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON platform.masterwork_source FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

CREATE OR REPLACE TRIGGER _stamp_actor_tier BEFORE INSERT OR UPDATE ON platform.masterwork_source FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor_tier();

CREATE OR REPLACE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON platform.masterwork_source FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

