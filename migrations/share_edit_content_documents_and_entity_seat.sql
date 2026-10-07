-- Lane SHARE-EDIT-CONTENT, part 2: `edit_content` ("Can edit content") on Spaces pages (content.document)
-- and on the entity-value doors.
--
-- 1. iam._guard_edit_content_structure(token, 'col,col,...') - a BEFORE UPDATE guard: a person who holds
--    edit_content but not editor on the row may change its CONTENT columns and none of the STRUCTURE
--    columns named for the table. The policy generator (iam.apply_rls) writes one update rule for every
--    table and cannot express a per-column rule, so the column rule is this trigger, as the governance
--    guard (iam._guard_governance_columns) already is. Runs first (name sorts before _a0_...) so it sees
--    what the person sent, not what other triggers derived. Owners, editors, admins and platform admins
--    pass untouched; the server lane (not the `authenticated` role) is not tiered.
-- 2. content.document: one ADDITIVE permissive update policy for edit_content (policies are OR'd, so the
--    existing editor rule is unchanged) and the guard with the page's structure columns. NOTE: a later
--    full `iam.apply_rls` regeneration of content.document drops this extra policy; re-run this file's
--    last statement after one.
-- 3. custom.entity_seat_level answers `edit_content` for a holder of it. custom.entity_value_write stays
--    SECURITY INVOKER (its registered contract): the table's own update policy decides, so it writes
--    custom values on every table whose update rule admits edit_content (content.document today) and
--    refuses by name on any other, exactly as before.
create or replace function iam._guard_edit_content_structure()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_token text := TG_ARGV[0];
  v_cols  text[] := string_to_array(TG_ARGV[1], ',');
  v_old   jsonb := to_jsonb(OLD);
  v_new   jsonb := to_jsonb(NEW);
  v_uid   uuid;
  v_col   text;
begin
  if current_user <> 'authenticated' then return NEW; end if;
  v_uid := coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid()));
  if v_uid is null then return NEW; end if;
  if (v_old ->> 'created_by') is not null and (v_old ->> 'created_by')::uuid = v_uid then return NEW; end if;
  foreach v_col in array v_cols loop
    if (v_new -> v_col) is not distinct from (v_old -> v_col) then continue; end if;
    if coalesce(iam.has_access(v_token, (v_old ->> 'id')::uuid, 'editor'::public.permission_level), false)
       or coalesce(public.is_platform_admin(), false) then
      return NEW;
    end if;
    raise exception using
      errcode = '42501',
      message = format('Edit-content access does not include changing "%s" on this %s.', v_col, v_token),
      detail  = format('"%s" is part of how this %s is organised, shared or published, not its content.', v_col, v_token),
      hint    = 'Ask the owner to make this change, or ask them for editor access to this item.';
  end loop;
  return NEW;
end
$fn$;

do $patch$
declare v_def text; v_new text; v_n int;
begin
  v_def := pg_get_functiondef(to_regprocedure('custom.entity_seat_level(uuid,text,uuid)'));
  v_n := regexp_count(v_def, $rx$(return 'editor'::public\.permission_level;\s+end if;)(\s+exception when others then)$rx$);
  if v_n <> 1 then raise exception 'SHARE-EDIT-CONTENT: custom.entity_seat_level no longer has the text this edits (found % place(s)); nothing was patched', v_n; end if;
  v_new := regexp_replace(v_def, $rx$(return 'editor'::public\.permission_level;\s+end if;)(\s+exception when others then)$rx$,
    $rp$\1
    if iam.has_access(t.token, p_record_id, 'edit_content'::public.permission_level) then
      return 'edit_content'::public.permission_level;
    end if;\2$rp$);
  execute v_new;
end
$patch$;

create trigger _a00_guard_edit_content_structure
  before update on content.document
  for each row execute function iam._guard_edit_content_structure(
    'document',
    'document_type_id,data_class,slug,format,folder_id,archived_at,sealed_at,deleted_at,organization_id,created_by,visibility,shown_to,published_content_version,published_at,published_to_web,published_to_web_at,published_to_web_by,search_engine_indexed,web_include_sub_pages,web_allow_duplicate,file_path,source_uri,source_hash');

-- LAST: a policy statement holds locks on sign-in tables to COMMIT, so nothing follows it.
create policy edit_content_update on content.document
  for update
  using (iam.has_access('document'::text, id, 'edit_content'::public.permission_level))
  with check (iam.has_access('document'::text, id, 'edit_content'::public.permission_level));
