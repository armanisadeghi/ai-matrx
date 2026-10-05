-- chair-step: INVERSE of migrations/campaign/scopesfts1f_the_old_scope_rows_lose_their_triggers.sql (lane FINISH-THE-SWITCH, FTS-1f): re-creates the 7 old-row trigger functions and the 58 old-row triggers on the six context.* tables as production held them on 2026-10-05.
-- lane: FINISH-THE-SWITCH (FTS-1f)
-- window-class: 58 CREATE TRIGGER on context.* (milliseconds each); 01:00-04:00 Pacific at production.
-- lock: context,public


CREATE OR REPLACE FUNCTION public._notify_suggestion_sweep_context_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
    IF NOT NEW.is_active THEN
        RETURN NULL;
    END IF;
    SELECT organization_id INTO v_org FROM context.scope_types WHERE id = NEW.scope_type_id;
    IF v_org IS NULL THEN
        RETURN NULL;
    END IF;
    INSERT INTO rag.kg_sweep_queue
        (change_type, entity_id, scope_type_id, organization_id, created_by)
    VALUES ('context_item', NEW.id, NEW.scope_type_id, v_org, NEW.created_by);
    PERFORM pg_notify('suggestion_sweep', json_build_object(
        'change_type', 'context_item',
        'entity_id',   NEW.id::text,
        'scope_type_id', NEW.scope_type_id::text,
        'organization_id', v_org::text,
        'created_by', NEW.created_by::text
    )::text);
    RETURN NULL;
END;
$function$
;
GRANT EXECUTE ON FUNCTION _notify_suggestion_sweep_context_item() TO PUBLIC;
GRANT EXECUTE ON FUNCTION _notify_suggestion_sweep_context_item() TO anon;
GRANT EXECUTE ON FUNCTION _notify_suggestion_sweep_context_item() TO authenticated;
GRANT EXECUTE ON FUNCTION _notify_suggestion_sweep_context_item() TO service_role;


CREATE OR REPLACE FUNCTION context._follow_to_the_copy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id   uuid  := (v_row ->> 'id')::uuid;
  v_org  uuid;
  v_type uuid;
  v_on   boolean;
begin
  -- WHICH ORGANIZATION AND WHICH SCOPE TYPE (the copy's Table) this row belongs to.
  if tg_table_name = 'scope_types' then
    v_org  := (v_row ->> 'organization_id')::uuid;
    v_type := v_id;
  elsif tg_table_name = 'scopes' then
    v_org  := (v_row ->> 'organization_id')::uuid;
    v_type := (v_row ->> 'scope_type_id')::uuid;
  elsif tg_table_name = 'context_items' then
    v_type := (v_row ->> 'scope_type_id')::uuid;
    select t.organization_id into v_org from context.scope_types t where t.id = v_type;
  elsif tg_table_name = 'context_item_values' then
    select s.organization_id, s.scope_type_id into v_org, v_type
      from context.scopes s where s.id = (v_row ->> 'scope_id')::uuid;
  end if;
  if v_org is null then
    return null;
  end if;

  -- SCOPES-WRITE-THROUGH: IN AN ORGANIZATION WHOSE STORE IS THE WRITER, the record store is written
  -- in this same statement and its rules govern — a store refusal refuses the write. OUTSIDE the
  -- exception handler below on purpose: swallowing a refusal here would commit the old row and leave
  -- the store behind, silently. A scope door has already written the store for its own rows (marked).
  if custom.context_writer(v_org) = 'store' then
    -- LANE 9 W2-W: a store-first scope door has already written the store for the ONE row it names in
    -- custom.context_door_row (its image); every other row the old triggers write meanwhile (a provisioned
    -- value) is still carried here, as before.
    if not custom._ctx_marked()
       and v_id is distinct from nullif(current_setting('custom.context_door_row', true), '')::uuid then
      perform custom._ctx_bridge(tg_table_name, tg_op, v_row, v_org, v_type);
    end if;
    return null;
  end if;

  begin
    v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
    if not v_on then
      return null;
    end if;

    insert into custom.io_outbox (event_key, record_id, table_id, operation, dedupe_key, organization_id, actor)
    values ('context.follow', v_id, v_type,
            case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end,
            'context.follow:' || tg_table_name || ':' || v_id::text,
            v_org,
            jsonb_build_object('declared', 'context.' || tg_table_name, 'user_id', auth.uid()))
    on conflict (organization_id, dedupe_key) where deleted_at is null
    do update set consumed_at = null,
                  consumer    = null,
                  operation   = excluded.operation,
                  actor       = excluded.actor;
    -- RE-ARMED FOR EVERY CONSUMER (CHAIR-RECORD-CHANGED): once each consumer keeps its own
    -- consumption, a re-armed row is news again only when those rows go too.
    if custom.io_outbox_per_consumer() then
      perform custom.io_outbox_rearm(v_org, 'context.follow:' || tg_table_name || ':' || v_id::text);
    end if;
    -- A RE-ARMED ROW IS NEWS TOO. custom.io_outbox_announce fires on INSERT only, so the second
    -- edit of the same old row (an update of the outbox row) would wake nobody; say it here, in the
    -- announce's own shape (a pointer, never the row). The follow debounces, so a duplicate on the
    -- first insert costs nothing.
    perform pg_notify('records_changed',
                      jsonb_build_object('organization_id', v_org, 'record_id', v_id, 'table_id', v_type,
                                         'operation', 'updated', 'event_key', 'context.follow')::text);
  exception when others then
    -- NEVER FAIL THE OLD SIDE'S EDIT, NEVER FAIL IN SILENCE. The current screens are the writer;
    -- an edit there must land whether or not the copy could be told. The miss is recorded with its
    -- remedy, and the next change to the same organization (or any follow drain run for it)
    -- re-plans the whole organization, so nothing is lost for good.
    begin
      perform ops.record_system_error(jsonb_build_object(
      'kind', 'context_follow_enqueue_failure',
      'organization_id', v_org,
      'source_app', 'database',
      'source_feature', 'context-follow',
      'route', 'context._follow_to_the_copy',
      'error_type', sqlstate,
      'error_text', sqlerrm,
      'context', jsonb_build_object('table', 'context.' || tg_table_name, 'row_id', v_id, 'operation', tg_op,
                                 'remedy', 'run the follow for this organization: python -m matrx_records.movers.runner --follow-context --organization <id> --apply --i-know-this-writes')));
    exception when others then
      raise warning 'context._follow_to_the_copy: could not tell the copy about %.% (%), and could not record it: %',
        'context', tg_table_name, v_id, sqlerrm;
    end;
  end;
  return null;
end;
$function$
;



CREATE OR REPLACE FUNCTION context.enforce_context_item_reference_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org_id uuid;
begin
  -- IS DISTINCT FROM treats NULL correctly (NULL is not dataset_template).
  if new.reference_source->>'container_type' is distinct from 'dataset_template' then
    return new;
  end if;

  select organization_id into v_org_id
  from context.scope_types
  where id = new.scope_type_id and deleted_at is null;
  if v_org_id is null then
    raise exception 'active scope type not found' using errcode='22023',
            detail = jsonb_build_object('scope_type_id', new.scope_type_id)::text;
  end if;
  perform context.validate_dataset_template_source(new.reference_source, v_org_id);

  -- `table` is the reference noun whose resolver expands to the table's rows,
  -- and it is the noun `provision_scope_dataset` mints into this item's value.
  if new.value_type <> 'reference'
     or new.allowed_reference_types is null
     or cardinality(new.allowed_reference_types) <> 1
     or new.allowed_reference_types[1] <> 'table'
     or new.max_items <> 1 then
    raise exception 'dataset-template context items require value_type=reference, allowed_reference_types=[table], and max_items=1'
      using errcode='23514';
  end if;
  return new;
end;
$function$
;

REVOKE ALL ON FUNCTION context.enforce_context_item_reference_source() FROM PUBLIC;

CREATE OR REPLACE FUNCTION context.provision_scope_datasets_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; v_org uuid; v_home uuid;
begin
  -- An item carries no organization of its own; its scope type does (a scope's is the same).
  select st.organization_id into v_org from context.scope_types st where st.id = new.scope_type_id;
  -- POST-MOVE-DOORS: every organization provisions in the record store (the older store is in the deprecated);
  -- an organization with no Home yet gets one for the Table (custom.scope_table_provision).
  v_home := custom.organization_home_id(v_org);
  if tg_table_name='scopes' then
    for r in select id from context.context_items
      where scope_type_id=new.scope_type_id and is_active and deleted_at is null
        and reference_source->>'container_type'='dataset_template'
    loop
      perform custom.scope_table_provision(v_org, r.id, new.id, v_home);
    end loop;
  else
    if new.is_active and new.deleted_at is null and new.reference_source->>'container_type'='dataset_template' then
      for r in select id from context.scopes
        where scope_type_id=new.scope_type_id and deleted_at is null
      loop
        perform custom.scope_table_provision(v_org, new.id, r.id, v_home);
      end loop;
    end if;
  end if;
  return new;
end; $function$
;



CREATE OR REPLACE FUNCTION public.ctx_validate_scope_parent()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_type_parent_type_id uuid;
    v_parent_scope_type_id uuid;
BEGIN
    SELECT parent_type_id INTO v_type_parent_type_id
    FROM context.scope_types WHERE id = NEW.scope_type_id;

    IF v_type_parent_type_id IS NOT NULL THEN
        IF NEW.parent_scope_id IS NULL THEN
            RAISE EXCEPTION 'Scopes of this type require a parent scope (type-level rule)';
        END IF;
        SELECT scope_type_id INTO v_parent_scope_type_id
        FROM context.scopes WHERE id = NEW.parent_scope_id;
        IF v_parent_scope_type_id IS DISTINCT FROM v_type_parent_type_id THEN
            RAISE EXCEPTION 'Parent scope must be of the required parent type';
        END IF;
    ELSE
        IF NEW.parent_scope_id IS NOT NULL THEN
            SELECT scope_type_id INTO v_parent_scope_type_id
            FROM context.scopes WHERE id = NEW.parent_scope_id;
            IF v_parent_scope_type_id IS DISTINCT FROM NEW.scope_type_id THEN
                RAISE EXCEPTION 'Cross-type nesting is not allowed for this type';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;
GRANT EXECUTE ON FUNCTION ctx_validate_scope_parent() TO PUBLIC;
GRANT EXECUTE ON FUNCTION ctx_validate_scope_parent() TO anon;
GRANT EXECUTE ON FUNCTION ctx_validate_scope_parent() TO authenticated;
GRANT EXECUTE ON FUNCTION ctx_validate_scope_parent() TO service_role;


CREATE OR REPLACE FUNCTION public.ctx_validate_value_scope_type()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_item_type_id uuid;
  v_scope_type_id uuid;
BEGIN
  SELECT scope_type_id INTO v_item_type_id
  FROM context.context_items WHERE id = NEW.context_item_id;

  SELECT scope_type_id INTO v_scope_type_id
  FROM context.scopes WHERE id = NEW.scope_id;

  IF v_item_type_id IS NULL THEN
    raise exception 'context_item_id does not exist' using errcode = 'P0001', detail = jsonb_build_object('context_item_id', NEW.context_item_id)::text;
  END IF;

  IF v_scope_type_id IS NULL THEN
    raise exception 'scope_id does not exist' using errcode = 'P0001', detail = jsonb_build_object('scope_id', NEW.scope_id)::text;
  END IF;

  IF v_scope_type_id IS DISTINCT FROM v_item_type_id THEN
    raise exception 'Scope/item type mismatch: the scope is of another type than the one the item is defined on' using errcode = 'P0001', detail = jsonb_build_object('scope_type_id', v_scope_type_id, 'item_type_id', v_item_type_id)::text;
  END IF;

  RETURN NEW;
END;
$function$
;
GRANT EXECUTE ON FUNCTION ctx_validate_value_scope_type() TO PUBLIC;
GRANT EXECUTE ON FUNCTION ctx_validate_value_scope_type() TO anon;
GRANT EXECUTE ON FUNCTION ctx_validate_value_scope_type() TO authenticated;
GRANT EXECUTE ON FUNCTION ctx_validate_value_scope_type() TO service_role;


CREATE OR REPLACE FUNCTION public.ctx_version_context_item_value()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE next_version int;
BEGIN
  -- Demote previous current value for the same cell (item × scope)
  UPDATE context.context_item_values
  SET is_current = false
  WHERE context_item_id = NEW.context_item_id
    AND scope_id = NEW.scope_id
    AND is_current = true
    AND id <> NEW.id;

  -- Compute next version for this cell
  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
  FROM context.context_item_values
  WHERE context_item_id = NEW.context_item_id
    AND scope_id = NEW.scope_id
    AND id <> NEW.id;

  NEW.version := next_version;
  NEW.is_current := true;

  -- Compute char_count / data_point_count / has_nested_objects
  IF NEW.value_text IS NOT NULL THEN
    NEW.char_count := char_length(NEW.value_text);
  ELSIF NEW.value_json IS NOT NULL THEN
    NEW.char_count := char_length(NEW.value_json::text);
    IF jsonb_typeof(NEW.value_json) = 'object' THEN
      SELECT count(*) INTO NEW.data_point_count
      FROM jsonb_object_keys(NEW.value_json);
      NEW.has_nested_objects := EXISTS (
        SELECT 1 FROM jsonb_each(NEW.value_json)
        WHERE jsonb_typeof(value) IN ('object', 'array')
      );
    ELSIF jsonb_typeof(NEW.value_json) = 'array' THEN
      NEW.data_point_count := jsonb_array_length(NEW.value_json);
    END IF;
  ELSE
    NEW.char_count := 0;
  END IF;

  RETURN NEW;
END;
$function$
;
GRANT EXECUTE ON FUNCTION ctx_version_context_item_value() TO PUBLIC;
GRANT EXECUTE ON FUNCTION ctx_version_context_item_value() TO anon;
GRANT EXECUTE ON FUNCTION ctx_version_context_item_value() TO authenticated;
GRANT EXECUTE ON FUNCTION ctx_version_context_item_value() TO service_role;



REVOKE ALL ON FUNCTION context.enforce_context_item_reference_source() FROM PUBLIC;
REVOKE ALL ON FUNCTION context.enforce_context_item_reference_source() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _notify_suggestion_sweep_context_item() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ctx_validate_scope_parent() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ctx_validate_value_scope_type() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ctx_version_context_item_value() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION context._follow_to_the_copy() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION context.provision_scope_datasets_trigger() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER _stamp_actor_tier BEFORE INSERT OR UPDATE ON context.context_item_values FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor_tier();
CREATE TRIGGER custom_fields_validation BEFORE INSERT OR UPDATE OF custom_fields ON context.context_item_values FOR EACH ROW EXECUTE FUNCTION custom._entity_custom_fields_guard('context_item_value');
CREATE TRIGGER trg_ctx_validate_value_scope_type BEFORE INSERT OR UPDATE OF context_item_id, scope_id ON context.context_item_values FOR EACH ROW EXECUTE FUNCTION ctx_validate_value_scope_type();
CREATE TRIGGER trg_ctx_version_context_item_value BEFORE INSERT ON context.context_item_values FOR EACH ROW EXECUTE FUNCTION ctx_version_context_item_value();
CREATE TRIGGER zz_follow_to_the_copy AFTER INSERT OR DELETE OR UPDATE ON context.context_item_values FOR EACH ROW EXECUTE FUNCTION context._follow_to_the_copy();
CREATE TRIGGER _gc_assoc_harddelete AFTER DELETE ON context.context_items FOR EACH ROW EXECUTE FUNCTION platform._gc_entity_associations('context_item');
CREATE TRIGGER _gc_assoc_softdelete AFTER UPDATE OF deleted_at ON context.context_items FOR EACH ROW EXECUTE FUNCTION platform._gc_entity_associations('context_item');
CREATE TRIGGER _guard_soft_delete_parent BEFORE INSERT OR UPDATE ON context.context_items FOR EACH ROW EXECUTE FUNCTION platform._guard_soft_delete_parent();
CREATE TRIGGER _history AFTER INSERT OR DELETE OR UPDATE ON context.context_items FOR EACH ROW EXECUTE FUNCTION platform._version_capture('context_item');
CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON context.context_items FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();
CREATE TRIGGER _stamp_actor_tier BEFORE INSERT OR UPDATE ON context.context_items FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor_tier();
CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON context.context_items FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
CREATE TRIGGER context_items_compute_review BEFORE INSERT ON context.context_items FOR EACH ROW EXECUTE FUNCTION compute_context_item_review_date();
CREATE TRIGGER context_items_updated_at BEFORE UPDATE ON context.context_items FOR EACH ROW EXECUTE FUNCTION update_context_item_timestamp();
CREATE TRIGGER custom_fields_validation BEFORE INSERT OR UPDATE OF custom_fields ON context.context_items FOR EACH ROW EXECUTE FUNCTION custom._entity_custom_fields_guard('context_item');
CREATE TRIGGER enforce_context_item_reference_source BEFORE INSERT OR UPDATE OF reference_source, value_type, allowed_reference_types, max_items, scope_type_id ON context.context_items FOR EACH ROW EXECUTE FUNCTION context.enforce_context_item_reference_source();
CREATE TRIGGER ensure_slug BEFORE INSERT OR UPDATE ON context.context_items FOR EACH ROW EXECUTE FUNCTION context.ensure_slug();
CREATE TRIGGER provision_scope_datasets_on_item AFTER INSERT OR UPDATE OF reference_source, is_active, deleted_at ON context.context_items FOR EACH ROW EXECUTE FUNCTION context.provision_scope_datasets_trigger();
CREATE TRIGGER trg_sweep_notify_context_item AFTER INSERT ON context.context_items FOR EACH ROW EXECUTE FUNCTION _notify_suggestion_sweep_context_item();
CREATE TRIGGER zz_follow_to_the_copy AFTER INSERT OR DELETE OR UPDATE ON context.context_items FOR EACH ROW EXECUTE FUNCTION context._follow_to_the_copy();
CREATE TRIGGER _stamp_actor_tier BEFORE INSERT OR UPDATE ON context.context_value_refs FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor_tier();
CREATE TRIGGER custom_fields_validation BEFORE INSERT OR UPDATE OF custom_fields ON context.context_value_refs FOR EACH ROW EXECUTE FUNCTION custom._entity_custom_fields_guard('context_value_refs');
CREATE TRIGGER _stamp_actor_tier BEFORE INSERT OR UPDATE ON context.scope_dataset_instances FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor_tier();
CREATE TRIGGER custom_fields_validation BEFORE INSERT OR UPDATE OF custom_fields ON context.scope_dataset_instances FOR EACH ROW EXECUTE FUNCTION custom._entity_custom_fields_guard('scope_dataset_instance');
CREATE TRIGGER _cascade_softdelete AFTER UPDATE OF deleted_at ON context.scope_types FOR EACH ROW EXECUTE FUNCTION platform._cascade_soft_delete();
CREATE TRIGGER _gc_assoc_harddelete AFTER DELETE ON context.scope_types FOR EACH ROW EXECUTE FUNCTION platform._gc_entity_associations('scope_type');
CREATE TRIGGER _gc_assoc_softdelete AFTER UPDATE OF deleted_at ON context.scope_types FOR EACH ROW EXECUTE FUNCTION platform._gc_entity_associations('scope_type');
CREATE TRIGGER _guard_soft_delete_parent BEFORE INSERT OR UPDATE ON context.scope_types FOR EACH ROW EXECUTE FUNCTION platform._guard_soft_delete_parent();
CREATE TRIGGER _history AFTER INSERT OR DELETE OR UPDATE ON context.scope_types FOR EACH ROW EXECUTE FUNCTION platform._version_capture('scope_type');
CREATE TRIGGER _search_item_sync AFTER INSERT OR DELETE OR UPDATE ON context.scope_types FOR EACH ROW EXECUTE FUNCTION platform._search_item_sync_scope_type();
CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON context.scope_types FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();
CREATE TRIGGER _stamp_actor_tier BEFORE INSERT OR UPDATE ON context.scope_types FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor_tier();
CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON context.scope_types FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
CREATE TRIGGER custom_fields_validation BEFORE INSERT OR UPDATE OF custom_fields ON context.scope_types FOR EACH ROW EXECUTE FUNCTION custom._entity_custom_fields_guard('scope_type');
CREATE TRIGGER ensure_slug BEFORE INSERT OR UPDATE ON context.scope_types FOR EACH ROW EXECUTE FUNCTION context.ensure_slug();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON context.scope_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sweep_notify_scope_type AFTER INSERT ON context.scope_types FOR EACH ROW EXECUTE FUNCTION _notify_suggestion_sweep_scope_type();
CREATE TRIGGER zz_follow_to_the_copy AFTER INSERT OR DELETE OR UPDATE ON context.scope_types FOR EACH ROW EXECUTE FUNCTION context._follow_to_the_copy();
CREATE TRIGGER _a0_t13_dual_write BEFORE INSERT OR UPDATE ON context.scopes FOR EACH ROW EXECUTE FUNCTION platform._t13_transitional_dual_write('shown_to');
CREATE TRIGGER _cascade_softdelete AFTER UPDATE OF deleted_at ON context.scopes FOR EACH ROW EXECUTE FUNCTION platform._cascade_soft_delete();
CREATE TRIGGER _gc_assoc_harddelete AFTER DELETE ON context.scopes FOR EACH ROW EXECUTE FUNCTION platform._gc_entity_associations('scope');
CREATE TRIGGER _gc_assoc_softdelete AFTER UPDATE OF deleted_at ON context.scopes FOR EACH ROW EXECUTE FUNCTION platform._gc_entity_associations('scope');
CREATE TRIGGER _gc_scope_assoc AFTER DELETE ON context.scopes FOR EACH ROW EXECUTE FUNCTION platform._gc_scope_associations();
CREATE TRIGGER _guard_governance BEFORE UPDATE ON context.scopes FOR EACH ROW EXECUTE FUNCTION iam._guard_governance_columns('scope');
CREATE TRIGGER _guard_soft_delete_parent BEFORE INSERT OR UPDATE ON context.scopes FOR EACH ROW EXECUTE FUNCTION platform._guard_soft_delete_parent();
CREATE TRIGGER _history AFTER INSERT OR DELETE OR UPDATE ON context.scopes FOR EACH ROW EXECUTE FUNCTION platform._version_capture('scope');
CREATE TRIGGER _search_item_sync AFTER INSERT OR DELETE OR UPDATE ON context.scopes FOR EACH ROW EXECUTE FUNCTION platform._search_item_sync_scope();
CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON context.scopes FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();
CREATE TRIGGER _stamp_actor_tier BEFORE INSERT OR UPDATE ON context.scopes FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor_tier();
CREATE TRIGGER _t13_count_row_column_writes AFTER INSERT OR UPDATE ON context.scopes FOR EACH STATEMENT EXECUTE FUNCTION platform._t13_transitional_flush_writes();
CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON context.scopes FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
CREATE TRIGGER custom_fields_validation BEFORE INSERT OR UPDATE OF custom_fields ON context.scopes FOR EACH ROW EXECUTE FUNCTION custom._entity_custom_fields_guard('scope');
CREATE TRIGGER ensure_slug BEFORE INSERT OR UPDATE ON context.scopes FOR EACH ROW EXECUTE FUNCTION context.ensure_slug();
CREATE TRIGGER provision_scope_datasets_on_scope AFTER INSERT ON context.scopes FOR EACH ROW EXECUTE FUNCTION context.provision_scope_datasets_trigger();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON context.scopes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ctx_validate_scope_parent BEFORE INSERT OR UPDATE ON context.scopes FOR EACH ROW EXECUTE FUNCTION ctx_validate_scope_parent();
CREATE TRIGGER trg_sweep_notify_scope AFTER INSERT ON context.scopes FOR EACH ROW EXECUTE FUNCTION _notify_suggestion_sweep_scope();
CREATE TRIGGER zz_follow_to_the_copy AFTER INSERT OR DELETE OR UPDATE ON context.scopes FOR EACH ROW EXECUTE FUNCTION context._follow_to_the_copy();
