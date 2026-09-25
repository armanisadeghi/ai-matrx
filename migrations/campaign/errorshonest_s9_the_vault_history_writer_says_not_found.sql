-- chair-step: this REPLACES the body of ONE live function, history.vault_write_revision(uuid, uuid, uuid, integer, jsonb), changing ONE statement: its raise with errcode P0002 becomes perform platform.refuse_not_found(the same sentence). Called directly the refusal is byte-for-byte what it was (SQLSTATE P0002); through PostgREST it answers HTTP 404 with code P0002 instead of HTTP 500. It grants vault_history_writer (the owner the writer runs as) EXECUTE on platform.refuse_not_found, and takes the owner membership only inside the transaction, as 1034 did, asserting the 1035 and 1036 membership invariant before COMMIT. No table, column, policy or trigger is touched; nothing is written. Needs errorshonest_s1_one_way_to_say_not_found.sql first. Inverse: migrations/inverse/errorshonest_s9_the_vault_history_writer_says_not_found_down.sql restores the body verbatim.
-- lane: ERRORS-HONEST
-- based-on: history.vault_write_revision(uuid, uuid, uuid, integer, jsonb) 91a8de7db88465766b6dadcaebc22ade8f7915a75d67fbd36235ec7753800551
--
-- LANE ERRORS-HONEST. The one function that started raising P0002 after the 2026-09-24 morning
-- census: 1034, 1035 and 1036 (vault history private writer) landed it on production the same day,
-- and pnpm check:not-found-is-honest --target production named it. Based on the production body.

-- The function is owned by vault_history_writer (1034). Only a member that inherits the owner may
-- replace it, and the admin-only membership 1035 and 1036 allow cannot inherit. So, exactly as 1034
-- did, that membership exists only inside this transaction and is removed before COMMIT, and the
-- invariant 1035 and 1036 assert is asserted again at the end.
GRANT vault_history_writer TO CURRENT_USER WITH INHERIT TRUE;

CREATE OR REPLACE FUNCTION history.vault_write_revision(p_item_id uuid, p_actor_id uuid, p_organization_id uuid, p_expected_revision integer, p_row_data jsonb)
 RETURNS TABLE(history_revision integer, snapshot_id uuid, occurred_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_item users.credential_items%ROWTYPE; v_next integer; v_snapshot_id uuid; v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_item_id IS NULL OR p_actor_id IS NULL OR p_organization_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0 THEN RAISE EXCEPTION 'Vault revision identity and expected revision are required' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_row_data) <> 'object' OR NOT (p_row_data ?& ARRAY['schema_version','snapshot_id','mutation_kind','original_ownership','audit_organization_id','capture_started_at','component_manifest','changed_components'])
     OR jsonb_typeof(p_row_data->'schema_version') <> 'number' OR jsonb_typeof(p_row_data->'original_ownership') <> 'object' OR jsonb_typeof(p_row_data->'component_manifest') <> 'array' OR jsonb_typeof(p_row_data->'changed_components') <> 'array' OR coalesce(p_row_data->>'mutation_kind','')='' THEN
    RAISE EXCEPTION 'Vault revision payload is not the v1 snapshot shape' USING ERRCODE='22023';
  END IF;
  BEGIN v_snapshot_id := (p_row_data->>'snapshot_id')::uuid; PERFORM (p_row_data->>'audit_organization_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Vault revision payload has an invalid UUID' USING ERRCODE='22023'; END;
  IF (p_row_data->>'audit_organization_id')::uuid IS DISTINCT FROM p_organization_id THEN RAISE EXCEPTION 'Vault revision audit organization does not match admitted organization' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_item FROM users.credential_items WHERE id=p_item_id FOR UPDATE;
  IF NOT FOUND THEN perform platform.refuse_not_found(format('credential item %s does not exist', p_item_id)); END IF;
  IF (v_item.user_id IS NOT NULL AND (v_item.user_id IS DISTINCT FROM p_actor_id OR NOT iam.has_org_access_for(p_actor_id,p_organization_id))) OR (v_item.organization_id IS NOT NULL AND (v_item.organization_id IS DISTINCT FROM p_organization_id OR NOT iam.has_org_access_for(p_actor_id,p_organization_id))) THEN RAISE EXCEPTION 'actor is not admitted to this credential item organization' USING ERRCODE='42501'; END IF;
  IF v_item.history_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'Vault revision conflict: expected %, current %',p_expected_revision,v_item.history_revision USING ERRCODE='40001'; END IF;
  IF v_item.history_revision=2147483647 THEN RAISE EXCEPTION 'Vault revision counter overflow' USING ERRCODE='22003'; END IF;
  v_next:=v_item.history_revision+1;
  IF EXISTS (SELECT 1 FROM history.row_versions WHERE entity_type='credential_item' AND row_id=p_item_id AND version=v_next) THEN RAISE EXCEPTION 'Vault revision % already exists for credential item %',v_next,p_item_id USING ERRCODE='23505'; END IF;
  INSERT INTO history.row_versions(entity_type,row_id,organization_id,version,operation,row_data,actor_id,occurred_at) VALUES ('credential_item',p_item_id,p_organization_id,v_next,'VAULT_REVISION',p_row_data,p_actor_id,v_now);
  UPDATE users.credential_items SET history_revision=v_next WHERE id=p_item_id;
  RETURN QUERY SELECT v_next,v_snapshot_id,v_now;
END $function$;

-- The writer runs as its owner (SECURITY DEFINER), so the owner must be able to say not-found.
GRANT EXECUTE ON FUNCTION platform.refuse_not_found(text, text, text) TO vault_history_writer;

REVOKE vault_history_writer FROM CURRENT_USER;
DO $writer_membership_eh_up$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.roleid='vault_history_writer'::regrole AND (m.member<>CURRENT_USER::regrole OR m.inherit_option OR m.set_option)) THEN
    RAISE EXCEPTION 'vault_history_writer has an unexpected effective member after errorshonest_s9' USING ERRCODE='P0001';
  END IF;
END $writer_membership_eh_up$;
