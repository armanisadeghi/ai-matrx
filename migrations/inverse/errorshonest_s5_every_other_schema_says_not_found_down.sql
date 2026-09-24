-- chair-step: this restores the 39 live bodies in schemas platform, iam, hr, esign, files, rag, mandate, provider, content_ir, web, crm, scheduler, workbench and custom that errorshonest_s5_every_other_schema_says_not_found.sql replaced, byte-for-byte as read from production on 2026-09-24. Undoing it returns each of their not-found refusals to HTTP 500 through PostgREST; called directly nothing changes either way. The 13 platform.client_callable_door declarations the up wrote are left standing: they state what those functions already were, and provision_shape_guard needs them for these very bodies to be restored.
-- lane: ERRORS-HONEST
-- based-on: content_ir.edit_kind_instance_value(uuid, text, jsonb) 08f3214eee3d89fadbefce3d8c10bac64091aab51176ace13b779b2fcdb0f018
-- based-on: crm.issue_unsubscribe_token(uuid, uuid, uuid) 3a060438252d7e4a3f05bf55571a290dc4d4e5f54ce919ca82ab0f2c886b7e91
-- based-on: custom.record_write_graph(uuid, uuid, jsonb, jsonb, jsonb) d40de1b2d7f7c8c8df875df04a914af426f02c7c4e5b6a2e55afaf329ec9ec77
-- based-on: esign._ctx_internal(uuid, inet, text) 6e33cc28e615308523c378d906c5cc68bb9395a646402fce1caeeb5591c0ae39
-- based-on: esign._event(uuid, text, text, uuid, uuid, uuid, uuid, text, text, inet, text, text, jsonb, text) 1e7b52a0bf23914b12cec115c6a51fcb22125555bcdd2637381fe7b067794e45
-- based-on: esign._notify(uuid, text, uuid, uuid, text, uuid, text, text, text, jsonb, text) 896bcbe4b92e05b4ee193fedfa732c15ebd248f4f7d02016c1adad7f44ca9fa0
-- based-on: esign.generate_certificate(uuid) 344dcbd6c7d159867c18f86128ae72dd2371b7f2d64345027e3cec0ba169defa
-- based-on: files.file_path_matches_parent(uuid) 5da7a617348db3ccf62f0a81ff4e03e24669f214d20bb1655c248fd844605de2
-- based-on: files.webhook_rotate_secret(uuid) 12030a640434f6f8fd27d2869185c891046a5efc50ae8f6b51da7342269ce27b
-- based-on: hr._door_verdict(uuid, text, uuid, boolean) 23852dd5fd0a5fdbff4a0ea401e86115c678f0d18c44772a829f00edda23da12
-- based-on: hr.export_finish(uuid, uuid, jsonb, uuid, text, text, text, uuid[], jsonb) b8172720ef3194e2adb4ebbad624c1b40bcf72073249a23f34d068ef7209e464
-- based-on: hr.export_transition(uuid, uuid, text, text, timestamp with time zone, text) 8ba9b039de7af042afdb9cb64c3357fef4452259597d8361df105249c3815111
-- based-on: hr.reveal_ssn(uuid, text, text) 0b626f8005afe87f4d45c1e745c0d2690c5b4e8f7a4732aca81b444d74934c5c
-- based-on: hr.transfer_restricted_note(uuid, uuid) 6aa5dc037bada9b221312f915010312929a9c4ae06c75ab11fad9df300f63741
-- based-on: hr.wf_request(text, text, uuid, uuid, jsonb, uuid, boolean, text) 436cfbeaaf7d005aa4b89ed2a24762a6868f13e97a9455d3a3954e75257fef8f
-- based-on: hr.wf_resolve_approvers(uuid, uuid[]) 0625c8b1c3e0265759db15ac740463ff2e67c885bd4adcf55e160daf0c15aedf
-- based-on: iam._managed_invitation(uuid) 7b4f203da0d62a701782a3fdd9983e63ea2370a1afaac5d6d8cfb90f1a9234e0
-- based-on: iam.emergency_door_approve(uuid, text) 1e2314b6b5eee580f972923128659b1c1b93dae3765166dae820290cbb638a8e
-- based-on: iam.emergency_door_deny(uuid, text) ad2830aa5e39bb7f79dec5cff7e4ac276fbe1f9aeb835e7acb74f3498079ce7b
-- based-on: iam.emergency_door_open(text, uuid, text, text) 8239cf2feb1b6325efd5587cd985f8f9c1b75b514c744d03daf8f8821214de6c
-- based-on: iam.organization_archive(uuid, text, text) 1da2329a8040b6cd35b43e077fc73f39dd051637f602c7a898ee3faf44d749fa
-- based-on: iam.organization_restore(uuid, text) 305ef105e8fd191cfbc23a2175f9c326867338bd348a531cbf616306518ba00a
-- based-on: mandate.duplicate_mandate(uuid, boolean, uuid) 52c899f5478c46fdb4191a821b83002ce9e2ac4edba866667dd792e547ac6941
-- based-on: mandate.submit_scan_report(jsonb) 5521ef8919edb9c377cef7ce79355ea15be925242a6bab0495702314558f1abc
-- based-on: platform.admin_db_cron_job_update(bigint, text, boolean, uuid) e3c228cc8bb5b1a118dd4ad717e1523b6c8554106ce55c9baace026464c28e63
-- based-on: platform.admin_db_cron_job_update(bigint, text, boolean) ebca46b4f644f7274aa9971e9c6af236c9285950a5c5ba2dd85837a2b0021319
-- based-on: platform.knob_unarchive(text, text) e6aa31f867d65f1da4602b1b1ad21a5d2fe8e466c528c8dd66199f075883a6a1
-- based-on: platform.lifecycle_file_custody_finalize_delete(uuid, uuid) db58ca65912e28e80a8348e8ffbacb85d61f7421037896e26a043a2bcc8d5cb0
-- based-on: platform.lifecycle_meet_custody_stage(uuid, uuid, uuid, uuid, timestamp with time zone, timestamp with time zone) c66506165cec615b59972e7fc238c3e95b1b9443d509243efc9b2bf5a00bef57
-- based-on: platform.provision_grant_open(uuid, text, text) b41649dd70932df29a540446961a93e738970983ea4bbc5ae581f13ca1fd24b2
-- based-on: platform.resolve_change_handling(text, uuid) da8c78b23afc1d2343b8adffcd593180e56689a71260eb2359168053c18c10d5
-- based-on: platform.upsert_unit_purpose(text, uuid, text, text, text, jsonb, jsonb, jsonb, integer) da9aae29cad5a6098267cfeae90726aa306460c90b60f14a90bab276801e73be
-- based-on: provider.attach_credential(uuid, uuid, text) 9f5ca92f8bd52ccbba0c3290793c5ba68546330fc475f0147f8d660b8951ccab
-- based-on: provider.set_account_status(uuid, text, text, timestamp with time zone, uuid) 15fdfae88271428324f91086fde8566a39715e0073d166e5a41dcacfba532111
-- based-on: rag.fn_get_library_full_page(uuid, integer) b674167094a0234412b089e9b91f45c7bc064b95ccbe10afe5b56df4f6d9740b
-- based-on: rag.fn_list_library_chunks(uuid, integer, integer, boolean, boolean, integer) 32e0ad4176a4a650377ccf0093d3c309f1b011e0e319e9a03101e87f95d34c46
-- based-on: scheduler.sch_run_claim(uuid, text, uuid, text, integer) e5247c0c63a61722f64cc110a278369982e56a607ba74a367b650229036fcdfc
-- based-on: web.set_site_offering_availability(uuid, uuid, uuid[], boolean, text) d2a09d968d44bdd79d45bf35a883ec111c73a8669e447f151575c5276ce5c7a0
-- based-on: workbench.note_folder_get_or_create(uuid, text) 4c037bf9e3ea4c26ff3698ff59fd3e28baff58c63feeb625624dee22f3cc5f3c

CREATE OR REPLACE FUNCTION content_ir.edit_kind_instance_value(p_id uuid, p_key text, p_value jsonb)
 RETURNS TABLE(id uuid, data jsonb, confirmation text, confirmed_by uuid, confirmed_at timestamp with time zone, confirmed_by_this_edit boolean)
 LANGUAGE plpgsql
AS $function$
DECLARE
  actor       uuid := coalesce(nullif(current_setting('app.user_id', true), '')::uuid, auth.uid());
  row_org     uuid;
  was_unconf  boolean;
  kd          record;
  title_key   text;
  do_confirm  boolean;
  tbl_scope   uuid;
BEGIN
  SELECT k.organization_id, (k.confirmation = 'unconfirmed')
    INTO row_org, was_unconf
    FROM content_ir.kind_instance k WHERE k.id = p_id AND k.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That record does not exist, or it has been deleted.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT iam.has_access('content_ir_kind_instance', p_id, 'editor'::public.permission_level) THEN
    RAISE EXCEPTION 'You need edit access to change a value on this record. Nothing changed.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The key must be one the kind actually declares. Writing an undeclared key would put data in a
  -- row that no column, no filter and no reader will ever see again -- silent loss wearing a
  -- success message.
  SELECT d.emitted_json_schema -> 'properties' ? p_key AS known,
         d.metadata ->> 'title_key' AS tkey
    INTO kd
    FROM content_ir.kind_definition d
    JOIN content_ir.kind_instance k ON k.kind_definition_id = d.id
   WHERE k.id = p_id;
  IF kd.known IS NOT TRUE THEN
    RAISE EXCEPTION 'This shape has no field called "%". Add it to the shape first, or edit one of the fields it declares.', p_key
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  title_key := kd.tkey;

  -- Knob 3, default ON, overridable at organization and table (REVIEW-FLAG-DESIGN §4.2 key 3).
  -- DD-198: the rung this read stands on is THIS table, named the way knob_resolve
  -- reads it -- an ARRAY of {kind, id}. It used to pass '{}'::jsonb, an OBJECT, which
  -- named no rung and raised `cannot extract elements from an object` the moment any
  -- table-rung override on this key existed.
  tbl_scope := platform._confirmation_admission('content_ir.kind_instance'::regclass);
  do_confirm := was_unconf
    AND coalesce((platform.knob_resolve('records', 'confirmation.confirm_on_human_edit',
                    row_org, actor,
                    CASE WHEN tbl_scope IS NULL THEN NULL
                         ELSE jsonb_build_array(jsonb_build_object('kind', 'table', 'id', tbl_scope)) END
                  ))::text::boolean, true);

  RETURN QUERY
  UPDATE content_ir.kind_instance k
     SET data  = jsonb_set(k.data, ARRAY[p_key], p_value, true),
         title = CASE WHEN title_key IS NOT NULL AND p_key = title_key
                      THEN coalesce(p_value #>> '{}', k.title) ELSE k.title END,
         confirmation = CASE WHEN do_confirm THEN 'confirmed'::platform.confirmation ELSE k.confirmation END,
         confirmed_by = CASE WHEN do_confirm THEN actor ELSE k.confirmed_by END,
         confirmed_at = CASE WHEN do_confirm THEN now() ELSE k.confirmed_at END
   WHERE k.id = p_id
  RETURNING k.id, k.data, k.confirmation::text, k.confirmed_by, k.confirmed_at, do_confirm;
END
$function$;

CREATE OR REPLACE FUNCTION crm.issue_unsubscribe_token(p_contact_medium_id uuid, p_outreach_list_id uuid DEFAULT NULL::uuid, p_sending_identity_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public', 'pg_temp'
AS $function$
declare
  v_token text; v_org uuid; v_party uuid;
begin
  -- ACCESS BEFORE EXISTENCE. The token this mints is a BEARER CAPABILITY: with it,
  -- public.outreach_unsubscribe_preview (anon) names the contact and the organization
  -- and public.outreach_unsubscribe (anon) suppresses that contact. Measured on
  -- production 2026-09-17: the non-member test account minted a token for another
  -- organization's contact medium and read back "Castellano & Reyes, LLP" and
  -- "i***@acmerobotics.com". A medium in an organization this caller cannot reach and
  -- a medium id that was never issued now answer identically.
  if iam.is_client_lane() then
    if p_contact_medium_id is null then
      raise exception 'issue_unsubscribe_token: p_contact_medium_id is required (got NULL)'
        using errcode = '22023';
    end if;
    if not exists (select 1 from crm.contact_medium cm
                    where cm.id = p_contact_medium_id
                      and (public.is_platform_admin() or iam.has_org_access(cm.organization_id))) then
      raise exception 'contact_medium_access_denied: no access to that contact medium'
        using errcode = '42501';
    end if;
  end if;

  select organization_id into v_org from crm.contact_medium where id = p_contact_medium_id;
  if v_org is null then
    raise exception 'unsubscribe token: contact medium % not found', p_contact_medium_id
      using errcode = 'no_data_found';
  end if;

  -- THE LIST AND THE MAILBOX ARE THIS ORGANIZATION'S (0850). Proven live: the non-member
  -- test account minted a token on its own medium that named another organization's
  -- outreach list and another organization's sending identity, while an invented list id
  -- answered with a foreign-key error — an existence oracle over every list id. Both are
  -- bound to the medium's organization before anything is read or minted; a foreign id
  -- and an invented id answer with one sentence.
  if p_outreach_list_id is not null and not exists (
       select 1 from crm.outreach_list ol
        where ol.id = p_outreach_list_id and ol.organization_id = v_org and ol.deleted_at is null) then
    raise exception 'unsubscribe token: outreach list not found in this organization'
      using errcode = '22023';
  end if;
  if p_sending_identity_id is not null and not exists (
       select 1 from crm.sending_identity si
        where si.id = p_sending_identity_id and si.organization_id = v_org and si.deleted_at is null) then
    raise exception 'unsubscribe token: sending identity not found in this organization'
      using errcode = '22023';
  end if;

  select token into v_token from crm.unsubscribe_token
   where contact_medium_id = p_contact_medium_id
     and coalesce(outreach_list_id,'00000000-0000-0000-0000-000000000000'::uuid)
       = coalesce(p_outreach_list_id,'00000000-0000-0000-0000-000000000000'::uuid);
  if v_token is not null then return v_token; end if;

  select pcp.party_id into v_party from crm.party_contact_point pcp
   where pcp.medium_id = p_contact_medium_id and pcp.deleted_at is null
   order by pcp.is_primary desc nulls last, pcp.created_at asc limit 1;

  v_token := replace(replace(replace(
    encode(extensions.gen_random_bytes(32),'base64'), '+','-'), '/','_'), '=','');

  insert into crm.unsubscribe_token
    (token, contact_medium_id, outreach_list_id, party_id, organization_id, sending_identity_id)
  values (v_token, p_contact_medium_id, p_outreach_list_id, v_party, v_org, p_sending_identity_id)
  on conflict (contact_medium_id, coalesce(outreach_list_id,'00000000-0000-0000-0000-000000000000'::uuid))
    do update set updated_at = now()
  returning token into v_token;

  return v_token;
end $function$;

CREATE OR REPLACE FUNCTION custom.record_write_graph(p_organization_id uuid, p_table_id uuid, p_parent jsonb, p_edges jsonb DEFAULT '[]'::jsonb, p_children jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_parent_id  uuid;
  v_existing   boolean := false;
  v_kind       text;
  v_table      uuid;
  v_child_ids  uuid[] := '{}'::uuid[];
  v_edge_ids   uuid[] := '{}'::uuid[];
  v_op_id      text;
  v_item       jsonb;
  v_data       jsonb;
  v_ord        integer := 0;
  v_run_rows   jsonb[] := '{}'::jsonb[];
  v_run_ids    uuid[] := '{}'::uuid[];
  v_run_table  uuid;
  v_run_open   boolean := false;
  v_this_table uuid;
  v_children   jsonb[];
  v_n          integer;
  v_edge_id    uuid;
  v_role       text;
  v_targets    jsonb;
  v_relations  integer := 0;
  v_dir        text;
  v_where      text;
  v_state      text;
  v_msg        text;
  v_detail     text;
  v_hint       text;
begin
  -- THE SHAPE IS CHECKED BEFORE ANYTHING IS WRITTEN, because a refusal halfway through a graph
  -- is the one outcome this door exists to make impossible, and a caller that handed in the
  -- wrong shape deserves to be told so before it has paid for a single insert.
  if p_organization_id is null then
    raise exception 'custom.record_write_graph: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  -- A PARENT IS EITHER THE DOCUMENT TO MINT OR A REFERENCE TO THE ONE THAT IS ALREADY THERE,
  -- and `_record_id` says which. It is an ENVELOPE key, in the family the store already
  -- reserves (`_op_id`, `_actor`, `_on_behalf_of`; `custom.undeclared_keys` exempts every
  -- `_`-prefixed key), and never `id`, which is an ordinary FIELD of an ordinary document.
  v_kind := coalesce(jsonb_typeof(p_parent), 'null');
  if v_kind <> 'object' then
    raise exception 'custom.record_write_graph: a graph is a PARENT and everything that belongs to it, and no parent document was handed in (got %)', v_kind
      using errcode = '22004',
            hint = 'NOTHING WAS WRITTEN. To MINT the parent, hand it in as one jsonb object, exactly as custom.record_write takes it. To hang these lines on a parent that ALREADY stands, hand in {"_record_id": "<uuid>"}.';
  end if;
  v_existing := nullif(p_parent ->> '_record_id', '') is not null;
  if v_existing then
    -- A REFERENCE IS NOT A DOCUMENT. A caller that handed in both thinks it is minting AND
    -- repairing, and only one of those can happen — so it is told, rather than having one half
    -- of its intention silently dropped.
    if exists (select 1 from jsonb_object_keys(p_parent) k where left(k, 1) <> '_') then
      raise exception 'custom.record_write_graph: the parent names an existing record (_record_id) and also carries the document keys %', (select string_agg(k, ', ' order by k) from jsonb_object_keys(p_parent) k where left(k, 1) <> '_')
        using errcode = '22023',
              hint = 'NOTHING WAS WRITTEN. `_record_id` says "hang these lines on the parent that already stands", so there is no document to write and those keys would be thrown away. Either drop them, or drop `_record_id` and mint a new parent from the whole document.';
    end if;
    begin
      v_parent_id := (p_parent ->> '_record_id')::uuid;
    exception when others then
      raise exception 'custom.record_write_graph: _record_id is %, which is not a record id', left(p_parent ->> '_record_id', 64)
        using errcode = '22004',
              hint = 'NOTHING WAS WRITTEN. `_record_id` is the id of the record these lines belong to; leave the key out entirely to mint a new parent from this document.';
    end;
  else
    v_parent_id := gen_random_uuid();
  end if;
  v_where := case when v_existing then format('the existing parent %s', v_parent_id) else 'the parent record' end;
  if p_edges is not null and jsonb_typeof(p_edges) <> 'array' then
    raise exception 'custom.record_write_graph: p_edges is the list of edges this parent stands on, and this is %', jsonb_typeof(p_edges)
      using errcode = '22023',
            hint = 'NOTHING WAS WRITTEN. One edge is a list of one.';
  end if;
  if p_children is not null and jsonb_typeof(p_children) <> 'array' then
    raise exception 'custom.record_write_graph: p_children is the list of rows that belong to this parent, and this is %', jsonb_typeof(p_children)
      using errcode = '22023',
            hint = 'NOTHING WAS WRITTEN. One child is a list of one.';
  end if;
  if v_existing
     and coalesce(jsonb_array_length(coalesce(p_children, '[]'::jsonb)), 0) = 0
     and coalesce(jsonb_array_length(coalesce(p_edges, '[]'::jsonb)), 0) = 0 then
    raise exception 'custom.record_write_graph: names the existing parent % and nothing to hang on it', v_parent_id
      using errcode = '22004',
            hint = 'NOTHING WAS WRITTEN, and nothing was going to be. The `_record_id` arm exists to give a parent that already stands the lines it never got; a call with no children and no edges would open a transaction, take the parent''s locks and change nothing, which reads to its caller exactly like a graph that landed.';
  end if;

  -- THE SWITCH, THEN THE ORGANIZATION, THEN THE TABLE — the same two predicates
  -- `custom.record_write` asks and `custom.record_write_many` asks once for a batch, asked ONCE
  -- here for the whole graph. They are asked BY THIS BODY and not only by the door it calls,
  -- because they are questions about the caller, the organization and the Table, none of which
  -- can change between the parent and child nineteen — and because a door that only ever
  -- decided inside something it calls is a door whose own text says nothing about who may open
  -- it. `custom.record_write_many` asks them again per statement; that is the same two reads,
  -- and the second answer is the one that governs, so nothing here weakens or replaces it.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write_graph');

  v_table := p_table_id;
  if v_existing then
    -- THE PARENT HAS TO REALLY BE THERE, and the answer to "it is not" is the same answer as
    -- "it is not yours" and "it has been archived" — one sqlstate, one sentence. A door that
    -- told those three apart would let a caller learn which record ids exist by trying them.
    select r.table_id into v_table
      from custom.record r
     where r.organization_id = p_organization_id
       and r.id = v_parent_id
       and r.deleted_at is null;
    if not found then
      raise exception 'custom.record_write_graph: there is no live record % you may write to, so there is no parent to hang these lines on', v_parent_id
        using errcode = '42501',
              hint = 'NOTHING WAS WRITTEN. A record that is not there, one that belongs to another organization and one that has been archived all answer this way on purpose. Check the id, the organization, and whether the parent was archived — an archived parent is restored before its lines are written, never given children while it is away.';
    end if;
    -- THE SAME LADDER, ASKED ABOUT THE PARENT ITSELF. Giving a record lines IS changing it, so
    -- it is the editor rung on THAT record — not merely membership of the organization and not
    -- merely the rung on the children's Table. This is `custom.assert_client_may_change`, the
    -- one predicate every structural door in the store asks; `platform.relation_set` asks it
    -- again per field a moment later and the second answer governs, so nothing here replaces or
    -- weakens it. It is asked HERE as well because a refusal after the children are written is
    -- exactly the half-write this door exists to make impossible.
    perform custom.assert_client_may_change(p_organization_id, v_parent_id, 'custom.record_write_graph',
                                            'editor'::public.permission_level, 'record');
    -- The children default to the PARENT'S OWN Table when the caller named none, which is the
    -- ordinary repair: the lines of a record live where the record lives.
    v_table := coalesce(p_table_id, v_table);
  end if;
  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.record_write_graph',
                                          'editor'::public.permission_level, 'table');

  -- ONE GRAPH IS ONE CLIENT OPERATION, so the parent's op id is the whole graph's op id. Read
  -- here and NOT removed: `custom.record_write_many` lifts it off through `custom._take_op_id`,
  -- which is the one place the envelope key is validated and the one place it is stripped.
  -- On the existing-parent arm there is no parent document to carry it, so it is read off the
  -- FIRST child and handed to all of them — the same rule, from the only row that can hold it.
  if v_existing then
    v_op_id := case when (p_children -> 0 -> 'data') ? '_op_id'
                    then p_children -> 0 -> 'data' ->> '_op_id' else null end;
  else
    v_op_id := case when p_parent ? '_op_id' then p_parent ->> '_op_id' else null end;
  end if;

  begin
    -- ── THE PARENT ────────────────────────────────────────────────────────────────────────
    -- Through the batch door with a batch of one and an id handed in, so the parent's id is
    -- known before its edges are written and every predicate, guard and trigger is the one
    -- `custom.record_write` would have run.
    if not v_existing then
      perform custom.record_write_many(p_organization_id, v_table,
                                       array[p_parent]::jsonb[], array[v_parent_id]::uuid[]);
    end if;

    -- ── THE EDGES THE PARENT STANDS ON ───────────────────────────────────────────────────
    v_ord := 0;
    for v_item in select * from jsonb_array_elements(coalesce(p_edges, '[]'::jsonb)) loop
      v_ord := v_ord + 1;
      v_where := format('edge %s of %s', v_ord, jsonb_array_length(coalesce(p_edges, '[]'::jsonb)));
      if jsonb_typeof(v_item) <> 'object'
         or nullif(v_item ->> 'entity', '') is null
         or nullif(v_item ->> 'id', '') is null then
        raise exception 'custom.record_write_graph: %s names no entity or no row', v_where
          using errcode = '22004',
                hint = 'An edge is {"entity": <entity token>, "id": <uuid>, "direction": "in"|"out"}. NOTHING WAS WRITTEN.';
      end if;
      v_dir := coalesce(nullif(v_item ->> 'direction', ''), 'in');
      if v_dir not in ('in', 'out') then
        raise exception 'custom.record_write_graph: % says direction %, and an edge points either "in" (that thing produced this record) or "out" (this record points at that thing)', v_where, v_dir
          using errcode = '22023', hint = 'NOTHING WAS WRITTEN.';
      end if;

      -- THE ONE ASSOCIATION WRITER. `public.assoc_add` decides access at BOTH endpoints, derives
      -- the edge's organization from a real endpoint rather than trusting the caller, and revives
      -- a tombstoned edge in place instead of duplicating it. A raw insert here would skip all
      -- three, which is the whole reason the assoc_* family exists.
      if v_dir = 'in' then
        v_edge_id := public.assoc_add(
          p_source_type => v_item ->> 'entity',
          p_source_id   => (v_item ->> 'id')::uuid,
          p_target_type => 'record',
          p_target_id   => v_parent_id,
          p_org_id      => p_organization_id,
          p_label       => nullif(v_item ->> 'label', ''),
          p_metadata    => coalesce(v_item -> 'metadata', '{}'::jsonb),
          p_role        => nullif(v_item ->> 'role', ''),
          p_position    => nullif(v_item ->> 'position', '')::integer);
      else
        v_edge_id := public.assoc_add(
          p_source_type => 'record',
          p_source_id   => v_parent_id,
          p_target_type => v_item ->> 'entity',
          p_target_id   => (v_item ->> 'id')::uuid,
          p_org_id      => p_organization_id,
          p_label       => nullif(v_item ->> 'label', ''),
          p_metadata    => coalesce(v_item -> 'metadata', '{}'::jsonb),
          p_role        => nullif(v_item ->> 'role', ''),
          p_position    => nullif(v_item ->> 'position', '')::integer);
      end if;
      v_edge_ids := v_edge_ids || v_edge_id;
    end loop;

    -- ── THE ROWS THAT BELONG TO THE PARENT ───────────────────────────────────────────────
    select array_agg(e order by n) into v_children
      from jsonb_array_elements(coalesce(p_children, '[]'::jsonb)) with ordinality t(e, n);
    v_n := coalesce(cardinality(v_children), 0);

    if v_n > 0 then
      -- A CHILD THAT NAMES NO FIELD IS REFUSED, and it is refused BEFORE the parent exists
      -- rather than left as a row nothing points at. A graph is a parent and the lines it
      -- promised; a line that cannot say which promise it fills is not one of them.
      for v_ord in 1..v_n loop
        if nullif(v_children[v_ord] ->> 'role', '') is null then
          v_where := format('child %s of %s', v_ord, v_n);
          raise exception 'custom.record_write_graph: % names no field of its parent', v_where
            using errcode = '23514',
                  hint = 'REL-10 / T7: a relation on a record IS a declared field of the parent''s Table, and `role` is that field''s key. Declare the relation field (custom.field_declare) and hand its key in as the child''s `role`. NOTHING WAS WRITTEN.';
        end if;
      end loop;
      for v_ord in 1..v_n loop
        v_item := v_children[v_ord];
        v_where := format('child %s of %s', v_ord, v_n);
        if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'data') <> 'object' then
          raise exception 'custom.record_write_graph: % carries no document', v_where
            using errcode = '22004',
                  hint = 'A child is {"data": {...}, "table_id": ?, "role": ?, "position": ?}. NOTHING WAS WRITTEN.';
        end if;
        v_this_table := coalesce(nullif(v_item ->> 'table_id', '')::uuid, v_table);
        v_data := v_item -> 'data';
        -- The graph's op id rides every row of the graph: one operation announces itself once,
        -- and `custom.record_write_many` refuses a batch carrying two different ids by name.
        if v_op_id is not null then
          v_data := v_data || jsonb_build_object('_op_id', v_op_id);
        end if;

        -- A CONTIGUOUS RUN OF ONE TABLE IS ONE STATEMENT. The ordinary graph — one parent, N
        -- children of one kind — costs two statements against `custom.record`, not N+1.
        if v_run_open and v_this_table is not distinct from v_run_table then
          v_run_rows := v_run_rows || v_data;
          v_run_ids  := v_run_ids || gen_random_uuid();
        else
          if v_run_open then
            perform custom.record_write_many(p_organization_id, v_run_table, v_run_rows, v_run_ids);
            v_child_ids := v_child_ids || v_run_ids;
          end if;
          v_run_table := v_this_table;
          v_run_rows  := array[v_data]::jsonb[];
          v_run_ids   := array[gen_random_uuid()]::uuid[];
          v_run_open  := true;
        end if;
      end loop;
      if v_run_open then
        perform custom.record_write_many(p_organization_id, v_run_table, v_run_rows, v_run_ids);
        v_child_ids := v_child_ids || v_run_ids;
      end if;

      -- THE PARENT'S OWN RELATION, NAMED BY ITS FIELD — through `platform.relation_set`, the
      -- store's ONE relation writer. Not `public.assoc_add`: an association OUT OF a record
      -- that carries a role and no `relation_field_id` is refused by
      -- `custom._store_relation_edge_names_its_field` (REL-10 / T7, measured on the clone
      -- 2026-09-22), and it is right to refuse — without the field nothing can read what the
      -- relation does when a target is deleted, how many targets it allows, or which tables it
      -- may point at, so the delete rules, the cardinality and the organization wall all
      -- silently do nothing. `relation_set` names the field itself, asks viewer on every target
      -- and editor on the parent, and writes the index into `position` so a parent with TWO
      -- array fields of the same child shape keeps its slots apart (DD-178).
      --
      -- ONE CALL PER FIELD, with that field's children in the order they were handed in.
      for v_role in
        select distinct on (c.role) c.role
          from (select v_children[s] ->> 'role' as role, s
                  from generate_subscripts(v_children, 1) s) c
         where nullif(c.role, '') is not null
         order by c.role, c.s
      loop
        v_where := format('the %I relation from this parent to its children', v_role);
        v_targets := '[]'::jsonb;
        for v_ord in 1..v_n loop
          if nullif(v_children[v_ord] ->> 'role', '') = v_role then
            v_targets := v_targets || jsonb_build_array(
              jsonb_build_object('entity', 'record', 'row_id', v_child_ids[v_ord]::text));
          end if;
        end loop;
        v_relations := v_relations + platform.relation_set(p_organization_id, v_parent_id,
                                                           v_role, v_targets);
      end loop;

    end if;

  exception when others then
    -- ONE REFUSAL REFUSES THE WHOLE GRAPH, BY NAME. The block above is one subtransaction, so
    -- reaching here has already undone the parent, every edge and every child; re-raising
    -- carries that up to the caller's transaction too. The store's OWN sqlstate, message,
    -- detail and hint are carried out whole — a door that re-worded the refusal it caught would
    -- be hiding the one sentence the caller can act on — with the member of the graph that
    -- refused named in front of it, because "a record was refused" is not an answer when
    -- nineteen rows were in flight.
    get stacked diagnostics
      v_state  = returned_sqlstate,
      v_msg    = message_text,
      v_detail = pg_exception_detail,
      v_hint   = pg_exception_hint;
    raise exception 'custom.record_write_graph refused the WHOLE graph on %: %', v_where, v_msg
      using errcode = v_state,
            detail  = coalesce(nullif(v_detail, ''), format('%s children and %s edges were in flight under parent %s.',
                                                            jsonb_array_length(coalesce(p_children, '[]'::jsonb)),
                                                            jsonb_array_length(coalesce(p_edges, '[]'::jsonb)),
                                                            v_parent_id)),
            hint    = coalesce(nullif(v_hint, ''), '')
                      || case when coalesce(v_hint, '') = '' then '' else ' ' end
                      || 'NOTHING WAS WRITTEN — not the parent, not one edge and not one child. A graph is all of it or none of it, which is the only reason this door exists.';
  end;

  return jsonb_build_object(
    'parent_id',  v_parent_id::text,
    'parent',     case when v_existing then 'existing' else 'minted' end,
    'table_id',   v_table::text,
    'child_ids',  to_jsonb(v_child_ids::text[]),
    'edge_ids',   to_jsonb(v_edge_ids::text[]),
    'children',   coalesce(cardinality(v_child_ids), 0),
    'edges',      coalesce(cardinality(v_edge_ids), 0) + v_relations,
    'relations',  v_relations,
    'how',        case when v_existing
                       then 'the lines a parent that already stands never got — its children and their edges through custom.record_write_many, public.assoc_add and platform.relation_set in ONE transaction, with the editor rung asked about that parent before anything was written. The same doors, every guard, all or nothing.'
                       else 'one parent, its edges and its children through custom.record_write_many, public.assoc_add and platform.relation_set in ONE transaction — the same doors, every guard, all or nothing.' end);
end
$function$;

CREATE OR REPLACE FUNCTION esign._ctx_internal(p_signer_id uuid, p_ip inet, p_ua text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare s esign.envelope_signer%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('granted', false, 'reason', 'not_authenticated');
  end if;
  select * into s from esign.envelope_signer where id = p_signer_id;
  if not found then
    raise exception 'esign: signer % does not exist', p_signer_id using errcode = 'P0002';
  end if;
  if s.actor_type <> 'internal_user' or s.signer_user_id is distinct from auth.uid() then
    -- §8.4 case 23, the internal half: you may act on YOUR signer row and no other.
    return jsonb_build_object('granted', false, 'reason', 'not_your_signer_row');
  end if;
  return jsonb_build_object(
    'granted', true, 'signer_id', s.id, 'envelope_id', s.envelope_id,
    'organization_id', s.organization_id,
    'actor_type', 'employee', 'actor_user_id', auth.uid(),
    'actor_token_id', null, 'session_id', null,
    'actor_label', s.full_name || ' <' || s.email || '>',
    'auth_method', 'session', 'verification_factor', 'session', 'verification_passed', true,
    'ip', host(p_ip), 'user_agent', p_ua);
end $function$;

CREATE OR REPLACE FUNCTION esign._event(p_envelope_id uuid, p_event_type text, p_actor_type text, p_signer_id uuid DEFAULT NULL::uuid, p_document_id uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid, p_actor_token_id uuid DEFAULT NULL::uuid, p_actor_label text DEFAULT NULL::text, p_auth_method text DEFAULT NULL::text, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_device_hint text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb, p_provider_event_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare v_org uuid; v_id uuid; v_ip inet := p_ip; v_ua text := p_user_agent; v_dh text := p_device_hint;
begin
  select organization_id into v_org from esign.envelope where id = p_envelope_id;
  if v_org is null then
    -- A programming error, not a refusal: nothing was reached, so there is nothing to attribute.
    raise exception 'esign._event: envelope % does not exist', p_envelope_id using errcode = 'P0002';
  end if;

  -- THE CAPTURE RULE, both directions.
  if p_event_type in ('reminded','expired','certificate_generated') then
    v_ip := null; v_ua := null; v_dh := null;
  elsif p_event_type in ('opened','viewed','consent_given','signature_adopted','signed','declined','downloaded')
        and p_ip is null then
    raise exception 'esign._event: % is a human-interaction event and must carry an IP (§2.5 the capture rule)', p_event_type
      using errcode = '22023';
  end if;

  insert into esign.envelope_event
    (organization_id, envelope_id, signer_id, document_id, event_type, occurred_at, actor_type,
     actor_user_id, actor_token_id, actor_label, auth_method, ip_address, user_agent, device_hint,
     payload, provider_event_id)
  values (v_org, p_envelope_id, p_signer_id, p_document_id, p_event_type, now(), p_actor_type,
          p_actor_user_id, p_actor_token_id, p_actor_label, p_auth_method, v_ip, v_ua, v_dh,
          coalesce(p_payload,'{}'::jsonb), p_provider_event_id)
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION esign._notify(p_envelope_id uuid, p_event_key text, p_signer_id uuid DEFAULT NULL::uuid, p_to_user uuid DEFAULT NULL::uuid, p_to_address text DEFAULT NULL::text, p_actor_token_id uuid DEFAULT NULL::uuid, p_subject text DEFAULT NULL::text, p_body text DEFAULT NULL::text, p_deep_link text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb, p_channel text DEFAULT 'email'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare v_org uuid; v_id uuid; v_kind text;
begin
  select organization_id into v_org from esign.envelope where id = p_envelope_id;
  if v_org is null then
    raise exception 'esign._notify: envelope % does not exist', p_envelope_id using errcode = 'P0002';
  end if;
  v_kind := case when p_to_user is not null then 'user'
                 when p_actor_token_id is not null then 'actor_token'
                 else 'address' end;
  if v_kind <> 'user' and p_to_address is null then
    -- SPEC-NOTIFICATIONS §3.2, as HRB-001 landed it: a resolver that finds no address writes a
    -- terminal `skipped` row carrying an error_code — VISIBLE, not silent — and never a raise and
    -- never a placeholder address, which would corrupt the one column the evidence rests on.
    insert into communication.notification
      (organization_id, event_key, channel, recipient_kind, recipient_user_id, to_address,
       status, error_code, error_message, subject, payload, target_kind, target_id)
    values (v_org, p_event_key, p_channel, 'address', null, null,
            'skipped', 'no_address',
            'esign could not address this notice', p_subject,
            coalesce(p_payload,'{}'::jsonb) || jsonb_build_object('envelope_id', p_envelope_id, 'signer_id', p_signer_id),
            'esign_envelope', p_envelope_id)
    returning id into v_id;
    return v_id;
  end if;

  insert into communication.notification
    (organization_id, event_key, channel, recipient_kind, recipient_user_id, recipient_actor_token_id,
     to_address, subject, body, payload, target_kind, target_id, deep_link, dedupe_key)
  values (v_org, p_event_key, p_channel, v_kind, p_to_user, p_actor_token_id,
          p_to_address, p_subject, p_body,
          coalesce(p_payload,'{}'::jsonb) || jsonb_build_object('envelope_id', p_envelope_id, 'signer_id', p_signer_id),
          'esign_envelope', p_envelope_id, p_deep_link,
          p_event_key || ':' || p_envelope_id::text || ':' || coalesce(p_signer_id::text,'-') || ':' ||
          to_char(now(), 'YYYYMMDDHH24MISSMS'))
  returning id into v_id;

  -- 🚨 THE READ REFERENCE, FOR INTERNAL (user) ROWS ONLY (D286; the esign twin of hr_c4_47's
  -- DEFECT-1 fix). The link is built BEFORE the row id exists, so it is folded in AFTER the insert.
  -- §5.2: following the link stamps read_at — and only a `user` notice reads via the spine
  -- (mark_notification_read gates on recipient_user_id = auth.uid(), so this points at the viewer's
  -- OWN row and cross-viewer stamping cannot happen). 🚨 OUTSIDER (actor_token) rows are LEFT
  -- UNTOUCHED: their read signal is the esign.envelope_event ledger, and their link carries the
  -- secret in the URL FRAGMENT (§5.4) — a query param would push it past the `#`. The `#`-guard
  -- makes that impossible even for a user row that somehow carried a fragment.
  if v_kind = 'user' and p_deep_link is not null and position('#' in p_deep_link) = 0 then
    update communication.notification
       set deep_link = p_deep_link
                    || case when p_deep_link like '%?%' then '&' else '?' end
                    || 'notice=' || v_id::text
     where id = v_id;
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION esign.generate_certificate(p_envelope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype; k esign.signing_key%rowtype;
        v_payload jsonb; v_hash text; v_sig text; v_id uuid; v_sign boolean;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    raise exception 'esign.generate_certificate: envelope % does not exist', p_envelope_id using errcode = 'P0002';
  end if;
  if exists (select 1 from esign.envelope_certificate where envelope_id = p_envelope_id) then
    return jsonb_build_object('granted', true, 'already_generated', true,
                              'certificate_id', (select id from esign.envelope_certificate where envelope_id = p_envelope_id));
  end if;

  v_payload := esign._certificate_payload(p_envelope_id);
  v_hash    := encode(sha256(convert_to(v_payload::text, 'UTF8')), 'hex');   -- RECORDED DECISION 1

  v_sign := coalesce((esign.config_resolve(e.organization_id,'esign.certificate.sign_payload'))::boolean, true);
  select * into k from esign.signing_key where is_current limit 1;
  if v_sign and k.id is null then
    return jsonb_build_object('granted', false, 'reason', 'no_signing_key');
  end if;
  v_sig := case when v_sign
                then encode(pgsodium.crypto_sign_detached(convert_to(v_hash,'UTF8'), k.secret_key), 'base64')
                else '' end;

  insert into esign.envelope_certificate
    (organization_id, envelope_id, payload, payload_hash, signature, key_id, generated_at)
  values (e.organization_id, p_envelope_id, v_payload, v_hash, v_sig, k.key_id, now())
  returning id into v_id;

  update esign.envelope set certificate_id = v_id where id = p_envelope_id;
  perform esign._event(p_envelope_id, 'certificate_generated', 'automation',
                       p_payload => jsonb_build_object('certificate_id', v_id, 'payload_hash', v_hash,
                                                       'key_id', k.key_id, 'algorithm', k.algorithm));
  return jsonb_build_object('granted', true, 'certificate_id', v_id, 'payload_hash', v_hash,
                            'key_id', k.key_id);
end $function$;

CREATE OR REPLACE FUNCTION files.file_path_matches_parent(p_file_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_path text; v_name text; v_parent uuid; v_found boolean;
        v_folder_path text; v_folder_found boolean; v_expected text;
BEGIN
  SELECT true, file_path, file_name, parent_folder_id
    INTO v_found, v_path, v_name, v_parent
    FROM files.files WHERE id = p_file_id;
  IF NOT coalesce(v_found, false) THEN
    -- Never NULL: a silent NULL disappears from every `WHERE NOT ...` census
    -- this guard exists to feed.
    RAISE EXCEPTION 'file % not found', p_file_id USING ERRCODE='no_data_found';
  END IF;

  IF v_parent IS NULL THEN
    -- No parent, no claim. 1,666 alive rows carry a nested file_path with
    -- parent_folder_id IS NULL (VERIFIED live) -- a SEPARATE, known shape the
    -- spec handles at move time (S20: move_file flattens a/b/c.txt to c.txt and
    -- REPORTS both paths), not drift between a file and a parent it has. This
    -- guard answers exactly the question its name asks; folding a second shape
    -- into it would make it permanently red and therefore useless.
    RETURN true;
  END IF;

  SELECT true, folder_path INTO v_folder_found, v_folder_path
    FROM files.folders WHERE id = v_parent;
  IF NOT coalesce(v_folder_found, false) THEN
    RETURN false;   -- a parent that does not exist IS the drift
  END IF;
  v_folder_path := trim(both '/' from coalesce(v_folder_path, ''));
  v_expected := CASE WHEN v_folder_path = '' THEN v_name
                     ELSE v_folder_path || '/' || v_name END;

  RETURN v_path IS NOT DISTINCT FROM v_expected;
END; $function$;

CREATE OR REPLACE FUNCTION files.webhook_rotate_secret(p_webhook_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_secret text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to rotate a webhook secret.' using errcode = '42501';
  end if;
  select owner_id into v_owner from files.webhooks where id = p_webhook_id;
  if v_owner is null then
    raise exception 'That webhook no longer exists.' using errcode = 'P0002';
  end if;
  if v_owner is distinct from v_uid then
    raise exception 'That webhook is not yours to rotate.' using errcode = '42501';
  end if;

  v_secret := 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');
  update files.webhooks
     set secret = v_secret, updated_at = now()
   where id = p_webhook_id;
  return v_secret;
end;
$function$;

CREATE OR REPLACE FUNCTION hr._door_verdict(p_user uuid, p_token text, p_id uuid, p_break_glass boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  d record; v_schema text; v_table text; v_org uuid; v_subject uuid; v_owner uuid;
  v_caps text[]; v_bg_ok boolean; v_note_kind text; nk record; v_is_self boolean := false;
  v_cap text; v_allowed boolean := false; v_basis text; v_veto boolean := false;
begin
  select * into d from hr._door_spec(p_token);
  if not found then
    raise exception 'hr audited door: % is not an audited-tier token', p_token
      using errcode = '22023',
            hint = 'Add it to hr._door_spec with the capability set that opens it. An unlisted token is refused by construction.';
  end if;
  -- 🚨 THE ORG IS RESOLVED BEFORE ANY EARLY RETURN, AND A PROBE CAUGHT IT BEING RESOLVED AFTER.
  -- The doorless branch below used to return first, so a refusal on hr_eeo_response reached
  -- hr._record_access_audit with a NULL organization_id and died on the NOT NULL constraint —
  -- turning a clean, auditable refusal into a raise, which is exactly the failure mode the
  -- refusal-envelope law exists to prevent. Resolving first also preserves tranche 4's finding:
  -- a MISSING subject raises P0002 and writes NO phantom audit row, because nothing was reached
  -- and there is nothing to attribute.
  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e where e.token = p_token;

  execute format('select organization_id from %I.%I where id = $1', v_schema, v_table)
     into v_org using p_id;
  if v_org is null then
    raise exception 'hr audited door: no % row with id %', p_token, p_id using errcode = 'P0002';
  end if;

  if d.caps is null then
    return jsonb_build_object('allowed', false, 'basis', 'no_door', 'reason', d.no_door_reason,
                              'tier', d.tier, 'organization_id', v_org,
                              'schema', v_schema, 'table', v_table);
  end if;

  -- the subject of the row, where the token has one
  begin
    execute format('select %s from %I.%I where id = $1',
      case
        when p_token in ('hr_compensation','hr_separation','hr_corrective_action','hr_leave_case',
                         'hr_tax_withholding','hr_i9','hr_accommodation_request',
                         'hr_verification_letter_request') then 'employment_id'
        when p_token = 'hr_employee_private' then
             '(select em.id from hr.employment em where em.employee_id = ' || quote_ident(v_table) || '.employee_id order by em.hire_date desc limit 1)'
        when p_token = 'hr_emergency_contact' then
             '(select em.id from hr.employment em where em.employee_id = ' || quote_ident(v_table) || '.employee_id order by em.hire_date desc limit 1)'
        when p_token = 'hr_incident' then 'subject_employment_id'
        else 'null::uuid'
      end, v_schema, v_table) into v_subject using p_id;
  exception when others then v_subject := null;
  end;

  -- the owner lane: `created_by` is the SUBJECT on a confidential row (§3), so a self-read is
  -- stamped is_self_access and is EXCLUDED from the anomaly queue — auditing a person for reading
  -- their own salary is noise, not signal.
  begin
    execute format('select created_by from %I.%I where id = $1', v_schema, v_table)
       into v_owner using p_id;
  exception when others then v_owner := null;
  end;

  -- 🚨 THE OWNER ARM IS OFF FOR THE INCIDENT FAMILY, AND THE REASON IS THAT ITS PREMISE IS FALSE
  -- THERE (hr_l1_75b). On `hr.incident`, `created_by` is the person who FILED the report, not the
  -- person it is about — so the arm above does not mean "the subject reading their own record",
  -- it means "the reporter reading a case about somebody else". Walked live 2026-08-30: an
  -- employee with zero capabilities filed a harassment complaint about their manager and then
  -- read the whole case back — summary, accused name, everything — `basis: self`. SPEC-ACCESS §5:
  -- *"A reporter is not an investigator. They reach hr_incident_status … and no
  -- investigation-class hr.restricted_note row."* The SUBJECT arm stays, on every token including
  -- these two: it is what lets the subject of a NON-excluded safety incident read their own
  -- record (§4.9b C3), and §5's veto is still evaluated FIRST, above, so an excluded subject
  -- never reaches either arm. On `hr_incident_party` the same arm let whoever added a party keep
  -- reading it after losing the case; a component is conveyed by its parent's reach or not at
  -- all.
  v_is_self := (v_subject is not null and v_subject = any(hr.employments_of(p_user)))
               or (p_token not in ('hr_incident','hr_incident_party')
                   and v_owner is not null and v_owner = p_user);

  -- 🚨 §5's VETO IS EVALUATED BEFORE EVERY ALLOW LANE FOR THE TOKENS IT COVERS, INCLUDING THE SELF
  -- LANE — and a probe caught it being evaluated after. §5 says the veto is checked "after every
  -- allow lane" because it must OVERRIDE them; implementing that as a late check let the SELF
  -- short-circuit answer first, and the subject of a harassment case read the case about
  -- themselves (granted=true, basis=self). §3.2 is unambiguous: Employee (self) × hr.incident is
  -- "— (veto)" EVEN WHEN THEY ARE THE REPORTER. Overriding everything and being checked first are
  -- the same thing for an absolute veto; being checked first is the one that cannot be
  -- accidentally bypassed by a lane added later.
  if p_token in ('hr_incident','hr_incident_party')
     or (p_token = 'hr_restricted_note'
         and (select rn.subject_token from hr.restricted_note rn where rn.id = p_id) = 'hr_incident')
  then
    declare v_inc0 uuid;
    begin
      v_inc0 := case
        when p_token = 'hr_incident' then p_id
        when p_token = 'hr_incident_party' then (select incident_id from hr.incident_party where id = p_id)
        else (select rn.subject_id from hr.restricted_note rn where rn.id = p_id) end;
      if v_inc0 is not null and hr.incident_excluded(p_user, v_inc0) then
        return jsonb_build_object('allowed', false, 'basis', 'subject_excluded',
          'reason', 'SPEC-ACCESS §5: the caller is the subject of, or an accused party to, this investigation. The veto overrides incident.read, it overrides hr_owner, it overrides the self lane, and it overrides break-glass.',
          'organization_id', v_org, 'subject_employment_id', v_subject, 'tier', d.tier,
          'schema', v_schema, 'table', v_table);
      end if;
    end;
  end if;

  if v_is_self then
    return jsonb_build_object('allowed', true, 'basis', 'self', 'is_self', true,
                              'subject_employment_id', v_subject, 'organization_id', v_org,
                              'tier', d.tier, 'schema', v_schema, 'table', v_table);
  end if;

  -- ---------- §3.1a: hr.restricted_note resolves its capability PER CLASS, never by the token
  v_caps  := d.caps;
  v_bg_ok := d.allows_break_glass;
  if p_token = 'hr_restricted_note' then
    execute 'select note_kind from hr.restricted_note where id = $1' into v_note_kind using p_id;
    select * into nk from hr._note_kind_caps(v_note_kind);
    if not found then
      return jsonb_build_object('allowed', false, 'basis', 'unmapped_note_kind',
        'reason', format('note_kind %s has no reader mapping; a class nobody assigned a reader to must not fall through to the widest lane', v_note_kind),
        'organization_id', v_org, 'tier', 'restricted', 'schema', v_schema, 'table', v_table);
    end if;
    v_caps  := nk.caps;
    v_bg_ok := nk.allows_break_glass;
    v_veto  := nk.veto_applies;
  end if;

  -- ---------- the capability check, ANY-OF, population-scoped to the row's subject
  foreach v_cap in array v_caps loop
    if hr.capability(p_user, v_cap, v_subject, current_date, v_org) then
      v_allowed := true; v_basis := 'role';
      exit;
    end if;
  end loop;

  -- ---------- §5's investigator lane: a party with role='investigator' reaches the case
  if not v_allowed and p_token in ('hr_incident','hr_incident_party') then
    if exists (select 1 from hr.incident_party ip
                where ip.party_role = 'investigator' and ip.deleted_at is null
                  and ip.employment_id = any(hr.employments_of(p_user))
                  and ip.incident_id = case when p_token = 'hr_incident' then p_id
                       else (select ip2.incident_id from hr.incident_party ip2 where ip2.id = p_id) end)
    then v_allowed := true; v_basis := 'authority'; end if;
  end if;

  -- ---------- break-glass, if this token and class permit it at all
  if not v_allowed and p_break_glass and v_bg_ok
     and hr._break_glass_active(p_user, p_token, p_id) then
    v_allowed := true; v_basis := 'break_glass';
  end if;
  if not v_allowed and not p_break_glass and hr._break_glass_active(p_user, p_token, p_id)
     and v_bg_ok then
    v_allowed := true; v_basis := 'break_glass';
  end if;

  -- ---------- 🚨 §5's VETO, EVALUATED LAST AND UNCONDITIONALLY.
  -- It is checked AFTER every allow lane, it overrides incident.read, it overrides hr_owner, and
  -- it overrides break-glass. An investigation record cannot be modelled additively — the accused
  -- would otherwise reach it through the HR-admin lane.
  if p_token in ('hr_incident','hr_incident_party') or v_veto then
    declare v_inc uuid;
    begin
      v_inc := case
        when p_token = 'hr_incident' then p_id
        when p_token = 'hr_incident_party' then (select incident_id from hr.incident_party where id = p_id)
        else (select rn.subject_id from hr.restricted_note rn
               where rn.id = p_id and rn.subject_token = 'hr_incident') end;
      if v_inc is not null and hr.incident_excluded(p_user, v_inc) then
        return jsonb_build_object('allowed', false, 'basis', 'subject_excluded',
          'reason', 'SPEC-ACCESS §5: the caller is the subject of, or a party to, this investigation. The veto overrides incident.read, it overrides hr_owner, and it overrides break-glass.',
          'organization_id', v_org, 'subject_employment_id', v_subject, 'tier', d.tier,
          'schema', v_schema, 'table', v_table);
      end if;
    end;
  end if;

  return jsonb_build_object('allowed', v_allowed, 'basis', coalesce(v_basis,'none'),
    'is_self', false, 'subject_employment_id', v_subject, 'organization_id', v_org,
    'tier', d.tier, 'schema', v_schema, 'table', v_table,
    'reason', case when v_allowed then null else
      format('the caller holds none of %s over this row''s population', array_to_string(v_caps, ', ')) end);
end
$function$;

CREATE OR REPLACE FUNCTION hr.export_finish(p_organization_id uuid, p_export_id uuid, p_lines jsonb, p_artifact_file_id uuid, p_artifact_sha256 text, p_total_hours text, p_total_amount text, p_adjustment_ids uuid[], p_disputes_carried jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_export hr.payroll_export%rowtype;
  v_count  integer;
begin
  select * into v_export from hr.payroll_export pe
   where pe.id = p_export_id and pe.organization_id = p_organization_id;
  if not found then
    raise exception 'not_found: export %', p_export_id using errcode = 'P0002';
  end if;
  if v_export.delivery_state <> 'generated' then
    raise exception 'hr_state_conflict: export % is %, and lines are written once at generation',
      p_export_id, v_export.delivery_state using errcode = 'P0001';
  end if;
  if exists (select 1 from hr.payroll_export_line pel where pel.payroll_export_id = p_export_id) then
    raise exception 'hr_state_conflict: export % already has lines; the line set is append-only and written once',
      p_export_id using errcode = 'P0001';
  end if;

  perform hr.arm_write();

  insert into hr.payroll_export_line (
    payroll_export_id, employment_id, employee_number, external_employee_id, work_date,
    workweek_id, position_assignment_id, job_title_snapshot, earning_code, external_earning_code,
    hours_category, hours, rate, amount, jurisdiction_key, original_pay_period_id,
    source_work_interval_ids, source_version, rule_version_ids, engine_key, engine_version,
    calc, computed_at, organization_id, created_by)
  select p_export_id,
         (l ->> 'employment_id')::uuid,
         l ->> 'employee_number',
         l ->> 'external_employee_id',
         (l ->> 'work_date')::date,
         (l ->> 'workweek_id')::uuid,
         nullif(l ->> 'position_assignment_id','')::uuid,
         l ->> 'job_title_snapshot',
         l ->> 'earning_code',
         l ->> 'external_earning_code',
         l ->> 'hours_category',
         (l ->> 'hours')::numeric,
         nullif(l ->> 'rate','')::numeric,
         nullif(l ->> 'amount','')::numeric,
         l ->> 'jurisdiction_key',
         nullif(l ->> 'original_pay_period_id','')::uuid,
         coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(
                     coalesce(l -> 'source_work_interval_ids','[]'::jsonb)) x), '{}'::uuid[]),
         coalesce((l ->> 'source_version')::integer, 1),
         coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(
                     coalesce(l -> 'rule_version_ids','[]'::jsonb)) x), '{}'::uuid[]),
         coalesce(l ->> 'engine_key', 'hr.export'),
         coalesce(l ->> 'engine_version', 'v1'),
         '{}'::jsonb,
         now(),
         p_organization_id,
         auth.uid()
    from jsonb_array_elements(p_lines) l;

  get diagnostics v_count = row_count;

  update hr.payroll_export
     set line_count = v_count,
         total_hours = nullif(p_total_hours,'')::numeric,
         total_amount = nullif(p_total_amount,'')::numeric,
         artifact_file_id = p_artifact_file_id,
         artifact_sha256 = p_artifact_sha256,
         includes_adjustment_ids = coalesce(p_adjustment_ids, '{}'::uuid[]),
         metadata = coalesce(metadata,'{}'::jsonb)
                    || jsonb_build_object('disputes_carried', coalesce(p_disputes_carried,'[]'::jsonb))
   where id = p_export_id;

  -- §4.4 — a generated export moves the period to `exported`. The transition trigger allows
  -- approved → exported and nothing else, so a period already `exported` is left alone rather
  -- than re-transitioned (a second attempt before acknowledgment is legitimate; §4.5).
  update hr.pay_period
     set state = 'exported', exported_at = now()
   where id = v_export.pay_period_id
     and organization_id = p_organization_id
     and state = 'approved';

  perform set_config('hr.privileged_write', '', true);
  return v_count;
end
$function$;

CREATE OR REPLACE FUNCTION hr.export_transition(p_organization_id uuid, p_export_id uuid, p_action text, p_acknowledgement_ref text DEFAULT NULL::text, p_acknowledged_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_failure_reason text DEFAULT NULL::text)
 RETURNS TABLE(export_id uuid, delivery_state text, acknowledged_at timestamp with time zone, failure_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare v_export hr.payroll_export%rowtype;
begin
  select * into v_export from hr.payroll_export pe
   where pe.id = p_export_id and pe.organization_id = p_organization_id
   for update;
  if not found then
    raise exception 'not_found: export %', p_export_id using errcode = 'P0002';
  end if;

  -- 🚨 §4.5, at every door and not only at supersede: an acknowledged export is finished.
  if v_export.delivery_state = 'acknowledged' and p_action <> 'acknowledge' then
    raise exception 'hr_export_already_acknowledged: export % was acknowledged at % (ref %)',
      p_export_id, v_export.acknowledged_at, coalesce(v_export.acknowledgement_ref,'-')
      using errcode = 'P0001',
            hint = 'The only correction path is an hr.time_adjustment in the next export, tagged to the original period.';
  end if;

  perform hr.arm_write();

  if p_action = 'acknowledge' then
    if v_export.delivery_state = 'acknowledged' then
      -- Idempotent by design: a second acknowledgment with the same ref is a retry, not a state
      -- change, and raising here would make a lost response unrecoverable.
      perform set_config('hr.privileged_write', '', true);
      return query select v_export.id, v_export.delivery_state, v_export.acknowledged_at, v_export.failure_reason;
      return;
    end if;
    if v_export.delivery_state not in ('generated','sent') then
      perform set_config('hr.privileged_write', '', true);
      raise exception 'hr_state_conflict: export % is %, and only a generated or sent export can be acknowledged',
        p_export_id, v_export.delivery_state using errcode = 'P0001';
    end if;
    update hr.payroll_export pe
       set delivery_state = 'acknowledged',
           acknowledged_at = coalesce(p_acknowledged_at, now()),
           acknowledgement_ref = p_acknowledgement_ref,
           sent_at = coalesce(pe.sent_at, now())
     where pe.id = p_export_id;

  elsif p_action = 'fail' then
    if v_export.delivery_state not in ('generated','sent') then
      perform set_config('hr.privileged_write', '', true);
      raise exception 'hr_state_conflict: export % is %, and only a generated or sent export can be recorded as failed',
        p_export_id, v_export.delivery_state using errcode = 'P0001';
    end if;
    update hr.payroll_export
       set delivery_state = 'failed', failure_reason = p_failure_reason
     where id = p_export_id;

  elsif p_action = 'send' then
    if v_export.delivery_state <> 'generated' then
      perform set_config('hr.privileged_write', '', true);
      raise exception 'hr_state_conflict: export % is %, not generated', p_export_id, v_export.delivery_state
        using errcode = 'P0001';
    end if;
    update hr.payroll_export set delivery_state = 'sent', sent_at = now() where id = p_export_id;

  elsif p_action = 'supersede' then
    if v_export.delivery_state not in ('generated','failed') then
      perform set_config('hr.privileged_write', '', true);
      raise exception 'hr_state_conflict: export % is %, and only a generated or failed export may be superseded',
        p_export_id, v_export.delivery_state using errcode = 'P0001';
    end if;
    update hr.payroll_export pe
       set delivery_state = 'superseded',
           failure_reason = coalesce(p_failure_reason, pe.failure_reason)
     where pe.id = p_export_id;

  else
    perform set_config('hr.privileged_write', '', true);
    raise exception 'hr_validation_error: unknown export transition %', p_action using errcode = 'P0001';
  end if;

  perform set_config('hr.privileged_write', '', true);

  select * into v_export from hr.payroll_export pe where pe.id = p_export_id;
  return query select v_export.id, v_export.delivery_state, v_export.acknowledged_at, v_export.failure_reason;
end
$function$;

CREATE OR REPLACE FUNCTION hr.reveal_ssn(p_employee_id uuid, p_purpose text, p_justification text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_audit uuid; v_priv uuid; v_subject uuid;
  v_last4 text; v_threshold int; v_today int;
begin
  if v_uid is null then
    raise exception 'hr.reveal_ssn: no authenticated caller' using errcode = '42501';
  end if;
  select organization_id into v_org from hr.employee where id = p_employee_id;
  if v_org is null then
    raise exception 'hr.reveal_ssn: no hr.employee row with id %', p_employee_id using errcode = 'P0002';
  end if;
  select p.id, p.ssn_last4 into v_priv, v_last4
    from hr.employee_private p where p.employee_id = p_employee_id and p.deleted_at is null limit 1;
  select em.id into v_subject from hr.employment em
   where em.employee_id = p_employee_id and em.deleted_at is null order by em.hire_date desc limit 1;

  -- ---- the gate: the ssn.reveal capability over THIS person, or the subject themselves
  if not (hr.capability(v_uid, 'ssn.reveal', v_subject, current_date, v_org)
          or (v_subject is not null and v_subject = any(hr.employments_of(v_uid)))) then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => 'hr_employee_private',
      p_purpose => coalesce(p_purpose,'(none given)'), p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_employee_id], p_sensitivity_tier => 'restricted',
      p_field_key => 'ssn', p_subject_employment_id => v_subject,
      p_justification => p_justification,
      p_denial_reason => 'the caller holds no ssn.reveal capability over this person');
    return jsonb_build_object('granted', false, 'reason', 'no_capability', 'audit_id', v_audit);
  end if;

  -- ---- §4.5 requires a justification for a reveal, always
  if p_justification is null or length(trim(p_justification)) = 0 then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => 'hr_employee_private',
      p_purpose => coalesce(p_purpose,'(none given)'), p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_employee_id], p_sensitivity_tier => 'restricted',
      p_field_key => 'ssn', p_subject_employment_id => v_subject,
      p_denial_reason => 'a reveal without a justification is refused (SPEC-ACCESS §4.5)');
    return jsonb_build_object('granted', false, 'reason', 'justification_required', 'audit_id', v_audit);
  end if;

  -- ---- §4.5's volume alarm, measured from the log this function writes
  v_threshold := (hr._hr_knob('hr.access','ssn_reveal_daily_alert_threshold', v_org, null) #>> '{}')::integer;
  select count(*) into v_today from hr.access_audit
   where actor_user_id = v_uid and action = 'reveal_field' and field_key = 'ssn'
     and occurred_at >= date_trunc('day', now());

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'reveal_field', p_target_token => 'hr_employee_private',
    p_purpose => coalesce(p_purpose,'payroll'),
    -- 🚨 THE BASIS MUST AGREE WITH is_self_access. hr.access_audit carries
    -- CHECK ((NOT is_self_access) OR (basis = 'self')), and this branch used to pass a
    -- constant 'role' alongside a computed is_self_access — so the SELF caller, the one
    -- the gate above deliberately admits, hit 23514 and the endpoint answered 500. An
    -- employee could not read their own number.
    p_basis => case when (v_subject is not null and v_subject = any(hr.employments_of(v_uid)))
                    then 'self' else 'role' end,
    p_granted => true,
    p_target_ids => ARRAY[p_employee_id], p_row_count => 1, p_sensitivity_tier => 'restricted',
    p_field_key => 'ssn', p_subject_employment_id => v_subject,
    p_is_self_access => (v_subject is not null and v_subject = any(hr.employments_of(v_uid))),
    p_justification => p_justification);

  -- 🚨 THE PLAINTEXT IS NOT AVAILABLE IN POSTGRES AND MUST NOT BE FAKED. §4.5 is explicit: there
  -- is NO in-database encryption precedent on this platform, every encrypted application column is
  -- an opaque bytea written and read BY AIDREAM IN PYTHON, and the full value is served by the
  -- aidream endpoint POST /hr/identity/{id}/ssn/reveal under acting_as_user. This function is the
  -- GATE and the AUDIT — it returns the hint plus a decrypt ticket, and the envelope says so
  -- rather than pretending a value it cannot produce.
  return jsonb_build_object(
    'granted', true, 'audit_id', v_audit, 'ssn_last4', v_last4,
    'employee_private_id', v_priv,
    'decrypt_via', 'aidream POST /hr/identity/{id}/ssn/reveal (acting_as_user); the envelope key is held there, never in Postgres',
    'reveals_today', v_today + 1,
    'volume_alarm', (v_today + 1) > v_threshold,
    'alert_event', case when (v_today + 1) > v_threshold then 'hr.access.ssn_reveal_threshold' end);
end
$function$;

CREATE OR REPLACE FUNCTION hr.transfer_restricted_note(p_id uuid, p_new_owner uuid)
 RETURNS hr.restricted_note
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare v_note hr.restricted_note; v_uid uuid := auth.uid();
begin
  select * into v_note from hr.restricted_note where id = p_id;
  if v_note.id is null then
    raise exception 'hr.transfer_restricted_note: note % not found', p_id using errcode = 'P0002';
  end if;

  if not (coalesce(public.is_super_admin(), false) or v_note.created_by = v_uid) then
    perform hr._record_access_audit(
      p_organization_id => v_note.organization_id, p_action => 'denied',
      p_target_token => 'hr_restricted_note', p_purpose => 'ownership transfer',
      p_basis => 'refused', p_granted => false, p_target_ids => ARRAY[p_id],
      p_sensitivity_tier => 'restricted',
      p_denial_reason => 'caller is neither the note owner nor a platform super-admin');
    raise exception 'hr.transfer_restricted_note: only the current owner or a platform super-admin may transfer a restricted note'
      using errcode = '42501';
  end if;

  perform set_config('hr.privileged_write', 'on', true);
  update hr.restricted_note
     set created_by = p_new_owner, transferred_from = v_note.created_by, transferred_at = now()
   where id = p_id
  returning * into v_note;

  perform hr._record_access_audit(
    p_organization_id => v_note.organization_id, p_action => 'read',
    p_target_token => 'hr_restricted_note', p_purpose => 'ownership transfer',
    p_basis => case when v_note.transferred_from = v_uid then 'owner' else 'platform_super_admin' end,
    p_granted => true, p_target_ids => ARRAY[p_id], p_sensitivity_tier => 'restricted');

  return v_note;
end
$function$;

CREATE OR REPLACE FUNCTION hr.wf_request(p_flow_key text, p_target_token text, p_target_id uuid, p_organization_id uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_subject_employment_id uuid DEFAULT NULL::uuid, p_as_draft boolean DEFAULT false, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  ft hr.workflow_flow_type%rowtype; defn hr.workflow_definition%rowtype;
  v_uid uuid := auth.uid(); v_requester uuid; v_inst uuid; v_existing uuid;
  v_tbl text; v_subject uuid; v_digest text; v_version integer; sd record; v_org uuid;
  v_pf_action text; v_pf_step text; v_pf_any boolean;
  v_target_deleted boolean; v_target_soft_deletes boolean; v_target_noun text;
begin
  if v_uid is null then
    return jsonb_build_object('granted', false, 'reason', 'no_caller',
                              'detail', 'hr.wf_request requires an authenticated caller');
  end if;
  if p_organization_id is null then
    return jsonb_build_object('granted', false, 'reason', 'no_organization',
                              'detail', 'organization_id is explicit on every HR write (NO-NULL-ORG)');
  end if;

  -- ---- the flow type, nearest-wins (org row, else the platform row in the system org)
  select * into ft from hr.workflow_flow_type
   where flow_key = p_flow_key and deleted_at is null
   order by (organization_id = p_organization_id) desc limit 1;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'unknown_flow_type',
                              'detail', format('no flow type %s is declared', p_flow_key));
  end if;
  if not ft.is_active then
    return jsonb_build_object('granted', false, 'reason', 'flow_type_inactive',
      'detail', coalesce(ft.inactive_reason, format('flow type %s is not active', p_flow_key)));
  end if;
  if ft.target_token <> p_target_token then
    return jsonb_build_object('granted', false, 'reason', 'target_token_mismatch',
      'detail', format('flow %s targets %s, not %s', p_flow_key, ft.target_token, p_target_token));
  end if;

  -- ---- idempotency: a replay RETURNS the existing instance, it does not error (§4.2)
  if p_idempotency_key is not null then
    select id into v_existing from hr.workflow_instance
     where organization_id = p_organization_id and flow_key = p_flow_key
       and idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return jsonb_build_object('granted', true, 'instance_id', v_existing, 'replayed', true);
    end if;
  end if;

  v_tbl := hr._wf_target_table(p_target_token);
  if v_tbl is null then
    return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
      'detail', format('%s is not a registered active entity type', p_target_token));
  end if;

  -- ---- the target must exist, and its org must be the caller's org
  -- 🚨 EXISTS INCLUDES "HAS NOT BEEN ARCHIVED". Whether this row can be soft-deleted at all is
  -- asked of platform.entity_types — the registry that already declares it — never of a second
  -- allowlist kept here, which would be one more thing to drift. `label` supplies the noun the
  -- refusal sentence uses, so the words a person reads come from the same registry row.
  select e.has_soft_delete,
         case when e.label ~ '^[A-Z][a-z]'
              then lower(left(e.label, 1)) || substr(e.label, 2)
              else e.label end
    into v_target_soft_deletes, v_target_noun
    from platform.entity_types e
   where e.token = p_target_token and e.is_active;

  execute format('select organization_id, version, %s from %I.%I where id = $1',
                 case when coalesce(v_target_soft_deletes, false)
                      then 'deleted_at is not null' else 'false' end,
                 split_part(v_tbl,'.',1), split_part(v_tbl,'.',2))
     into v_org, v_version, v_target_deleted using p_target_id;
  if v_org is null then
    return jsonb_build_object('granted', false, 'reason', 'target_missing',
                              'detail', format('no %s row with id %s', p_target_token, p_target_id));
  end if;
  if v_org <> p_organization_id then
    return jsonb_build_object('granted', false, 'reason', 'cross_org',
                              'detail', 'the target belongs to a different organization');
  end if;
  -- 🚨 hr_l1_77: A DELETED TARGET IS NAMED, NEVER SUBSTITUTED. This refusal is placed AFTER the
  -- cross-org check on purpose — another organization's archived row must read as cross_org, not
  -- as "no longer exists", which would confirm it once existed.
  --
  -- WHAT IT REPLACES: the row survives a soft delete, so `select organization_id` above found it
  -- and the door walked on. hr._approval_subject then returned NULL (its hr.employment branch
  -- requires `deleted_at is null`) and the subject seam below stamped THE REQUESTER as
  -- subject_employment_id — after which never-approve-yourself fired and the instance died
  -- `sole_actor_deadlock` with "is_subject" pointing at a person the request was never about.
  -- Reproduced twice in production (instances a7fd791c…, 4be6ae4f…), both terminations of an
  -- employment archived on 2026-08-28.
  if coalesce(v_target_deleted, false) then
    return jsonb_build_object('granted', false, 'reason', 'target_deleted',
      'detail', format('That %s no longer exists.',
                       coalesce(v_target_noun, replace(p_target_token, '_', ' '))),
      'flow_key', p_flow_key, 'target_token', p_target_token, 'target_id', p_target_id,
      'remedy', 'Nothing was submitted. If this record was archived by mistake, restore it first; '
             || 'otherwise pick a record that still exists.');
  end if;

  -- ---- the requester is an EMPLOYMENT, never a bare person (§0.1 seam)
  select em.id into v_requester from hr.employment em
    join hr.employee e on e.id = em.employee_id
   where e.login_user_id = v_uid and em.organization_id = p_organization_id
     and em.deleted_at is null
   order by case em.status when 'active' then 0 else 1 end, em.created_at desc limit 1;
  if v_requester is null and ft.requester_kind = 'employment' then
    return jsonb_build_object('granted', false, 'reason', 'requester_not_employed',
      'detail', 'the caller holds no employment in this organization');
  end if;

  -- 🚨 THE FIRST PLACE THE DOOR TOUCHES THE SUBJECT, AND IT MUST NOT THROW.
  -- hr._approval_subject RAISES for a target table it cannot map, so an unguarded call here threw
  -- an exception out of hr.wf_request for any registered flow whose target is off that allowlist —
  -- past the refusal-envelope law and past every caller. It now returns the SAME named refusal the
  -- resolver's RECORDED DECISION 5 gives, so all three layers tell one story.
  -- An explicit subject is honoured first and never needs the allowlist at all.
  -- ARGS-RULED (2026-09-21). THE SUBJECT IS EMPLOYED BY THIS ORGANIZATION. `p_target_id` IS
  -- compared to `p_organization_id` a few lines up ("if v_org <> p_organization_id"); the subject
  -- handed in beside it was taken as given, and the subject is who the whole approval is ABOUT.
  if p_subject_employment_id is not null
     and not exists (select 1 from hr.employment em
                      where em.id = p_subject_employment_id and em.organization_id = p_organization_id
                        and em.deleted_at is null) then
    return jsonb_build_object('granted', false, 'reason', 'subject_not_in_this_organization',
      'detail', 'the person an approval is about is employed by the organization it is raised in');
  end if;
  if p_subject_employment_id is not null then
    v_subject := p_subject_employment_id;
  else
    begin
      -- assigned INSIDE the block: a nested declare's variables die with the block, so reading one
      -- after `end;` is a scope trap that only shows up once some path actually gets past it.
      v_subject := hr._approval_subject(v_tbl, p_target_id);
      if v_subject is null then
        -- 🚨 hr_l1_82: TWO DIFFERENT FACTS WEAR ONE NULL, AND ONLY ONE OF THEM IS AN ERROR.
        -- hr._approval_subject_required names the targets whose subject is PROMISED — an
        -- employment, or a person and their spell. A NULL there is a FAILED RESOLUTION: the person
        -- exists but holds no live employment, so the request is about nobody, and standing the
        -- requester in produces hr_l1_77's exact ending one layer up (`sole_actor_deadlock` naming
        -- a person the request was never about). It is named instead.
        if hr._approval_subject_required(v_tbl) then
          return jsonb_build_object('granted', false, 'reason', 'subject_unresolved',
            'detail', case when v_tbl = 'hr.employment'
                           then 'That employment spell no longer exists.'
                           else format('That %s holds no current employment in this organization, '
                                    || 'so this request has nobody to be about.',
                                       coalesce(v_target_noun, replace(p_target_token, '_', ' '))) end,
            'flow_key', p_flow_key, 'target_token', p_target_token, 'target_id', p_target_id,
            'remedy', 'Nothing was submitted. If their employment was archived by mistake, restore '
                   || 'it first; otherwise this request cannot be made about them.');
        end if;
        -- 🚨 THE hr_l1_77 FALL-BACK-TO-SELF, DELIBERATELY KEPT. For a requisition, an offer, a
        -- schedule or an esign envelope the resolver maps NO subject column at all and returns
        -- NULL BY CONTRACT; and an OPEN SHIFT's employment_id is NULL exactly because nobody holds
        -- it yet. Standing the requester in is the correct reading of a request about nobody but
        -- themselves. "The resolver has nobody to name" and "the person you named has nobody to
        -- be" are two different facts, and only the second is an error.
        v_subject := v_requester;
      end if;
    exception when others then
      return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
        'detail', format('approval_subject_unmapped: hr.can_approve cannot resolve a subject for %s (%s)',
                         v_tbl, sqlerrm),
        'flow_key', p_flow_key, 'target_token', p_target_token,
        'remedy', 'Add this target table to hr._approval_subject''s allowlist together with the column that names its subject employment, or pass p_subject_employment_id explicitly.');
    end;
  end if;

  -- ---- the definition: the org's latest published one, else the platform default (§1.2)
  select * into defn from hr.workflow_definition
   where flow_key = p_flow_key and status = 'published' and deleted_at is null
     and organization_id in (p_organization_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
   order by (organization_id = p_organization_id) desc, definition_version desc limit 1;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'no_published_definition',
      'detail', format('flow %s has no published routing definition in this org or the platform default', p_flow_key));
  end if;

  -- ---- 🚨 PRE-FLIGHT (hr_c4_21): A REQUEST NOBODY COULD EVER APPROVE IS REFUSED AT THE FRONT
  -- DOOR, not minted and then failed `approver_ineligible` a moment later. The question is put to
  -- hr.can_approve — THE PREDICATE, never a re-derived copy of the resolver — for the first human
  -- step of the pinned definition. Self-steps and modes 1-2 are skipped on purpose: the subject is
  -- always the approver of the former, and the latter never resolve an approver at all (§7.1).
  -- The post-hoc machinery stays for concurrent revocation between submit and a later activation.
  select sd2.authority_action, sd2.step_key into v_pf_action, v_pf_step
    from hr.workflow_step_definition sd2
   where sd2.workflow_definition_id = defn.id and sd2.deleted_at is null
     and sd2.authority_action is not null
     and not sd2.allows_self
     and coalesce(sd2.autonomy_mode, 4) not in (1, 2)
   order by sd2.step_order, sd2.step_key
   limit 1;
  if v_pf_action is not null then
   -- 🚨 RECORDED DECISION 5 AT THE DOOR. hr.can_approve RAISES for a target table
   -- hr._approval_subject cannot map to a subject employment, and this pre-flight calls it
   -- DIRECTLY — before hr.wf_resolve_approvers, whose `begin … exception` block is where that
   -- guarantee used to live. Without this the raise escapes hr.wf_request entirely, which is a
   -- broken refusal-envelope law and is what hr_c4_21 accidentally introduced.
   begin
     select exists (
       select 1 from hr.employment em2
         join hr.employee e2 on e2.id = em2.employee_id
        where em2.organization_id = p_organization_id
          and em2.deleted_at is null and em2.status = 'active'
          and e2.login_user_id is not null
          -- §2.2 eligibility rule 2: where the flow type marks the requester an interested party,
          -- the resolver will strike them. A pre-flight that counted them would wave through
          -- exactly the case it exists to catch.
          and not (coalesce(ft.requester_is_interested_party, false)
                   and v_requester is not null
                   and em2.id = v_requester
                   and v_requester is distinct from v_subject)
          and hr.can_approve(e2.login_user_id, v_pf_action, v_tbl, p_target_id))
       into v_pf_any;
   exception when others then
     -- the resolver's EXACT reason and detail shape, so a caller cannot tell which layer caught
     -- it and the two can never drift into two stories about one condition. sqlerrm is carried,
     -- so nothing is swallowed — it is reported where a person can read it.
     return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
       'detail', format('approval_subject_unmapped: hr.can_approve cannot resolve a subject for %s (%s)',
                        v_tbl, sqlerrm),
       'flow_key', p_flow_key, 'target_token', p_target_token, 'action_type', v_pf_action);
   end;
   if not v_pf_any then
    return jsonb_build_object(
      'granted', false, 'reason', 'WF_NO_POSSIBLE_APPROVER',
      -- 🚨 THE ARTICLE AGREES WITH THE NOUN. The flow key is substituted into this
      -- sentence, so a hard-coded "a %s" produced "a address change" the moment the noun
      -- began with a vowel. This string is not a log line — it is the sentence a person
      -- reads when their own edit will not go through, and broken grammar there reads as
      -- carelessness about their request.
      'detail', format('Nobody in this organization can approve %s yet. Grant the authority first, then submit again.',
                       (select case when noun ~* '^[aeiou]' then 'an ' else 'a ' end || noun
                          from (select replace(replace(p_flow_key, '_', ' '), ' request', '') as noun) q)),
      'action_type', v_pf_action, 'step_key', v_pf_step, 'flow_key', p_flow_key,
      'door', 'hr_authority_grant',
      'remedy', 'An organization owner or HR administrator grants this approval authority to somebody; the request can then be submitted and will route to them.');
   end if;
  end if;

  -- ---- 🚨 D275: THE EXCLUSIVE BINDING IS CHECKED BEFORE ANYTHING IS WRITTEN. A refusal must
  -- leave nothing behind, and a workflow instance is evidence that is never deleted (§1.3) — so an
  -- orphan `validating` row from a refused request could never be cleaned up afterwards.
  select b.workflow_instance_id into v_existing
    from hr.workflow_binding b
   where b.target_token = p_target_token and b.target_id = p_target_id
     and b.flow_key = p_flow_key and b.is_open and b.exclusive
   limit 1;
  if v_existing is not null then
    return jsonb_build_object('granted', false, 'reason', 'WF_BINDING_OPEN',
      'detail', format('an open %s already exists on this %s', p_flow_key, p_target_token),
      'existing_instance_id', v_existing);
  end if;

  v_digest := hr._wf_call_digest(p_flow_key, p_organization_id, p_target_token, p_target_id);

  perform hr.arm_write();
  -- 🚨 THE INSTANCE AND ITS BINDING SHARE ONE EXCEPTION BLOCK, so the binding's unique_violation
  -- rolls the instance row back with it. The pre-check above cannot answer two CONCURRENT requests
  -- — both read no open binding, both insert, one loses on the partial unique index — and the
  -- loser must not strand an instance either. §1.6 is unchanged: exclusivity is still enforced by
  -- the database, by the same index.
  begin
    insert into hr.workflow_instance
      (organization_id, flow_key, workflow_definition_id, definition_version,
       target_token, target_id, target_version, target_digest,
       requester_employment_id, subject_employment_id, requester_actor_type,
       state, payload, idempotency_key, sensitivity_tier, created_by, updated_by)
    values (p_organization_id, p_flow_key, defn.id, defn.definition_version,
            p_target_token, p_target_id, v_version, v_digest,
            v_requester, v_subject, 'employee',
            case when p_as_draft then 'draft' else 'validating' end,
            coalesce(p_payload,'{}'::jsonb), p_idempotency_key, ft.sensitivity_tier, v_uid, v_uid)
    returning id into v_inst;

    insert into hr.workflow_binding (organization_id, workflow_instance_id, target_token, target_id,
                                     flow_key, is_open, exclusive)
    values (p_organization_id, v_inst, p_target_token, p_target_id, p_flow_key, true, true);
  exception when unique_violation then
    -- plpgsql variables are not transactional, so v_inst survives this block's rollback and tells
    -- the two collisions apart: NULL = the instance's idempotency index (a replay), non-NULL = the
    -- binding's exclusivity index (a refusal, whose instance row is already gone with it).
    if v_inst is null then
      select id into v_existing from hr.workflow_instance
       where organization_id = p_organization_id and flow_key = p_flow_key
         and idempotency_key = p_idempotency_key;
      if v_existing is not null then
        return jsonb_build_object('granted', true, 'instance_id', v_existing, 'replayed', true);
      end if;
      raise;
    end if;
    return jsonb_build_object('granted', false, 'reason', 'WF_BINDING_OPEN',
      'detail', format('an open %s already exists on this %s', p_flow_key, p_target_token),
      'existing_instance_id', (select workflow_instance_id from hr.workflow_binding
                                where target_token = p_target_token and target_id = p_target_id
                                  and flow_key = p_flow_key and is_open and exclusive));
  end;

  -- ---- materialise the steps from the pinned definition version (§1.2 publishing rule)
  for sd in select * from hr.workflow_step_definition
             where workflow_definition_id = defn.id and deleted_at is null
             order by step_order, step_key
  loop
    insert into hr.workflow_step
      (organization_id, workflow_instance_id, step_definition_id, step_key, step_order,
       parallel_group, state, quorum_kind, quorum_n, autonomy_mode)
    values (p_organization_id, v_inst, sd.id, sd.step_key, sd.step_order, sd.parallel_group,
            'pending', sd.quorum_kind, sd.quorum_n, sd.autonomy_mode);
  end loop;

  perform hr._wf_event(v_inst, null, 'created', null,
                       case when p_as_draft then 'draft' else 'validating' end,
                       'employee', v_uid, v_requester,
                       jsonb_build_object('definition_id', defn.id,
                                          'definition_version', defn.definition_version,
                                          'target_digest', v_digest));

  if p_as_draft then
    return jsonb_build_object('granted', true, 'instance_id', v_inst, 'state', 'draft');
  end if;
  return hr.wf_submit(v_inst);
end $function$;

CREATE OR REPLACE FUNCTION hr.wf_resolve_approvers(p_step_id uuid, p_exclude_employment_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  st          hr.workflow_step%rowtype;
  sd          hr.workflow_step_definition%rowtype;
  inst        hr.workflow_instance%rowtype;
  defn        hr.workflow_definition%rowtype;
  v_at        date;
  v_subject   uuid;
  v_target_tbl text;
  v_action    text;
  v_action_id uuid;
  v_two_actor boolean := false;
  v_rung      text;
  v_cands     uuid[] := '{}';
  v_path      text;
  v_rows      uuid[] := '{}';        -- matched hr.approval_authority ids
  v_holders   jsonb  := '[]'::jsonb;
  v_refused   jsonb  := '[]'::jsonb;
  v_absent    jsonb  := '[]'::jsonb;
  v_noreach   jsonb  := '[]'::jsonb;
  v_sole      jsonb  := '[]'::jsonb;   -- subjects kept under §1.4 rule 3's carve-out   -- resolved, but holds no login: no grant, no inbox row
  v_users     uuid[] := '{}';
  v_delegated boolean := false;
  v_retains   boolean;
  v_had_holders boolean := false;    -- distinguishes unroutable from approver_ineligible
  aa          record;
  emp         uuid;
  v_uid       uuid;
  v_mgr       uuid;
  v_guard     integer;
  v_seen      uuid[];
  v_requester_interested boolean;
  -- hr_c4_33 — hoisted into the FUNCTION's declare, never a nested one (the hr_c4_25/26 P0).
  v_ent       jsonb;                   -- what READ entitlement this request's change content needs
  v_unentitled jsonb := '[]'::jsonb;   -- candidates struck because they could not see that change
  -- hr_c4_40 — the rungs this pass ACTUALLY iterated, as against sd.fallback_chain's declaration.
  v_walked    jsonb  := '[]'::jsonb;
begin
  select * into st from hr.workflow_step where id = p_step_id;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'step_not_found',
                              'detail', format('no hr.workflow_step with id %s', p_step_id));
  end if;
  select * into sd   from hr.workflow_step_definition where id = st.step_definition_id;
  select * into inst from hr.workflow_instance        where id = st.workflow_instance_id;
  select * into defn from hr.workflow_definition      where id = inst.workflow_definition_id;

  -- effective dating is resolved AS-OF the request's submission, never "current" (§2.2)
  v_at        := coalesce(inst.submitted_at, inst.created_at, now())::date;
  v_subject   := inst.subject_employment_id;
  v_target_tbl := hr._wf_target_table(inst.target_token);
  v_action    := sd.authority_action;
  v_retains   := (hr._hr_knob('hr.workflow', 'delegation_principal_retains', (select ws.organization_id from hr.workflow_step ws where ws.id = p_step_id), null) #>> '{}')::boolean;
  select f.requester_is_interested_party into v_requester_interested
    from hr.workflow_flow_type f
   where f.flow_key = inst.flow_key and f.deleted_at is null
   order by (f.organization_id = inst.organization_id) desc limit 1;

  if v_target_tbl is null then
    return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
      'detail', format('target token %s is not a registered active entity type', inst.target_token));
  end if;

  -- 🚨 WHAT WOULD A DECIDER HAVE TO BE ABLE TO READ TO DECIDE THIS? Derived ONCE, before the
  -- chain is walked, and NULL for everything that carries no confidential change content — a
  -- leave request pays a single `payload ? 'patch'` test and nothing else changes about it,
  -- evidence included. Over-tightening is this engine's recorded textbook defect.
  v_ent := hr._wf_change_entitlement(inst.id);

  -- §2.1: the action slug is resolved against the hr_approval_action dimension ONCE, here, and the
  -- resolved category id is recorded in resolution_evidence. An unresolvable slug is
  -- definition_invalid — a definition problem, never a routing problem.
  if v_action is not null then
    v_two_actor := hr._wf_two_actor_action(v_action);
    select c.id into v_action_id from platform.categories c
     where c.dimension = 'hr_approval_action' and c.slug = v_action
       and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid and c.deleted_at is null;
    if v_action_id is null then
      return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
        'detail', format('authority_action %s is not a registered hr_approval_action', v_action));
    end if;
  end if;

  -- ---------------------------------------------------------------- walk the fallback chain
  foreach v_rung in array (
    case
      when sd.resolver_kind = 'authority' then sd.fallback_chain
      -- a non-authority resolver_kind IS the chain: §2.2's rung list and the resolver_kind
      -- enumeration are the same vocabulary, and a fixed_user step has no fallback by definition.
      else ARRAY[sd.resolver_kind]
    end
  ) loop
    -- 🚨 RECORDED WHERE THE LOOP TURNS, so this is rungs REACHED and not rungs planned. A chain
    -- that exits on its first rung records exactly one entry — the distinction whose absence let
    -- two diagnoses conclude a fixed_user self-step had been routed through an approver chain.
    v_walked := v_walked || to_jsonb(v_rung);
    v_cands := '{}'; v_rows := '{}'; v_holders := '[]'::jsonb; v_delegated := false;

    if v_rung in ('authority','substitute','fixed_authority_scope') then
      if v_action is null then continue; end if;
      for aa in
        select a.* from hr.approval_authority a
         where a.organization_id = inst.organization_id
           and a.action_type = v_action
           and a.is_active
           and a.effective_from <= v_at
           and (a.effective_to is null or a.effective_to >= v_at)
           and (v_subject is null
                or hr.population_contains(a.scope_kind, a.scope_id, v_subject, v_at,
                                          case when a.holder_kind = 'employment'
                                               then a.holder_id::uuid else null end,
                                          a.scope_employment_ids, a.organization_id))
           and hr._limits_satisfied(a.limits, v_target_tbl, inst.target_id)
           -- §2.1: a delegated row SUPERSEDES the row it substitutes for, for the window. The
           -- principal reclaims by ending the delegation early, not by racing the delegate.
           and (v_retains or not exists (
                 select 1 from hr.approval_authority d
                  where d.organization_id = a.organization_id
                    and d.source = 'delegated' and d.delegated_from_id = a.id
                    and d.is_active and d.effective_from <= v_at
                    and (d.effective_to is null or d.effective_to >= v_at)))
           -- 🚨 THE `authority` RUNG YIELDS ONLY THE BEST RANK, AND `substitute` YIELDS THE REST.
           -- §2.2's pseudocode reads `order by rank` and returns every match, but that makes the
           -- `substitute` rung — "the NEXT-RANK holder in the same scope for the same action, used
           -- when every rank-0 holder is ineligible or absent" — unreachable, because its holders
           -- are already in the rung above it. Worse, with the default `all` quorum it would make
           -- every org-scoped backstop holder a MANDATORY co-approver of every ordinary request.
           -- SPEC-ACCESS §1.3 settles it in the same words from the other side: "the rank+1 holder
           -- in the same population is a holder's implicit standing substitute". So: authority =
           -- min rank, substitute = strictly greater. OWED: SPEC-WORKFLOW-ENGINE §2.2's `authority`
           -- rung records the rank restriction.
           and (v_rung not in ('authority','fixed_authority_scope')
                or a.rank = (select min(b.rank) from hr.approval_authority b
                              where b.organization_id = a.organization_id
                                and b.action_type = a.action_type and b.is_active
                                and b.effective_from <= v_at
                                and (b.effective_to is null or b.effective_to >= v_at)
                                and (v_subject is null
                                     or hr.population_contains(b.scope_kind, b.scope_id, v_subject, v_at,
                                          case when b.holder_kind = 'employment'
                                               then b.holder_id::uuid else null end,
                                          b.scope_employment_ids, b.organization_id))))
           and (v_rung <> 'substitute'
                or a.rank > (select min(b.rank) from hr.approval_authority b
                              where b.organization_id = a.organization_id
                                and b.action_type = a.action_type and b.is_active))
           and (v_rung <> 'fixed_authority_scope'
                or (sd.resolver_config ->> 'scope_kind' is null
                    or a.scope_kind = sd.resolver_config ->> 'scope_kind'))
         order by a.rank, a.created_at
      loop
        foreach emp in array hr._wf_holder_employments(aa.holder_kind, aa.holder_id,
                                                       aa.organization_id, v_at) loop
          v_had_holders := true;
          if not (emp = any(v_cands)) then v_cands := v_cands || emp; end if;
        end loop;
        v_rows := v_rows || aa.id;
        if aa.source = 'delegated' then v_delegated := true; end if;
        v_holders := v_holders || jsonb_build_object(
          'authority_id', aa.id, 'holder_kind', aa.holder_kind, 'holder_id', aa.holder_id,
          'scope_kind', aa.scope_kind, 'scope_id', aa.scope_id, 'rank', aa.rank,
          'source', aa.source, 'delegated_from_id', aa.delegated_from_id,
          'limits', aa.limits);
      end loop;
      v_path := case when v_delegated then 'delegated'
                     when v_rung = 'substitute' then 'substitute'
                     else 'authority' end;

    elsif v_rung = 'reporting_line' then
      -- climb manager-to-manager until an eligible employment is found. Arbitrary depth (D24f):
      -- nothing counts levels; the walk carries a visited path so a cycle terminates (§1.3c).
      v_mgr := v_subject; v_seen := '{}'; v_guard := 0;
      loop
        exit when v_mgr is null;
        exit when v_mgr = any(v_seen);
        v_seen := v_seen || v_mgr;
        v_guard := v_guard + 1;
        v_mgr := hr.manager_as_of(v_mgr, v_at);
        exit when v_mgr is null;
        v_had_holders := true;
        v_cands := ARRAY[v_mgr];
        exit;                       -- one rung per pass; escalation calls us again to climb further
      end loop;
      -- honour an explicit climb depth for escalation re-resolution
      if (sd.escalation_config ->> 'climb_to') is not null and v_cands <> '{}' then
        for v_guard in 2 .. (sd.escalation_config ->> 'climb_to')::integer loop
          v_mgr := hr.manager_as_of(v_cands[1], v_at);
          exit when v_mgr is null or v_mgr = any(v_seen);
          v_seen := v_seen || v_mgr; v_cands := ARRAY[v_mgr];
        end loop;
      end if;
      v_path := 'reporting_line';

    elsif v_rung = 'top_of_chart' then
      -- RECORDED DECISION 2: §2.6's org-scoped holders UNION hr.can_approve's own knob-resolved
      -- top-of-chart set. The predicate filter below settles which of them may actually act.
      for aa in
        select a.* from hr.approval_authority a
         where a.organization_id = inst.organization_id and a.action_type = v_action
           and a.is_active and a.scope_kind = 'org'
           and a.effective_from <= v_at
           and (a.effective_to is null or a.effective_to >= v_at)
         order by a.rank, a.created_at
      loop
        foreach emp in array hr._wf_holder_employments(aa.holder_kind, aa.holder_id,
                                                       aa.organization_id, v_at) loop
          v_had_holders := true;
          if not (emp = any(v_cands)) then v_cands := v_cands || emp; end if;
        end loop;
        v_rows := v_rows || aa.id;
        v_holders := v_holders || jsonb_build_object('authority_id', aa.id, 'scope_kind', 'org',
                                                     'rank', aa.rank, 'source', aa.source);
      end loop;
      for emp in
        select em.id from hr.employment em
          join hr.employee e on e.id = em.employee_id
         where em.organization_id = inst.organization_id and em.deleted_at is null
           and em.status = 'active'
           and (exists (select 1 from iam.organization_member om
                         where om.organization_id = em.organization_id
                           and om.user_id = e.login_user_id and om.role = 'owner')
                or exists (select 1 from hr.role_assignment ra
                            where ra.organization_id = em.organization_id
                              and ra.employment_id = em.id and ra.role_key = 'hr_owner'
                              and ra.is_active and ra.revoked_at is null
                              and ra.effective_from <= v_at
                              and (ra.effective_to is null or ra.effective_to >= v_at)))
      loop
        v_had_holders := true;
        if not (emp = any(v_cands)) then v_cands := v_cands || emp; end if;
      end loop;
      v_path := 'top_of_chart';

    elsif v_rung = 'fixed_user' then
      -- RECORDED DECISION 7: `{"employment_source":"subject"}` names the SUBJECT of the instance.
      -- This is CONFIG, not a new rung — §2.2's rung vocabulary is untouched.
      if sd.resolver_config ->> 'employment_source' = 'subject' then
        v_cands := case when v_subject is null then '{}'::uuid[] else ARRAY[v_subject] end;
      elsif sd.resolver_config ->> 'employment_source' = 'manager_of_subject' then
        v_cands := case when hr.manager_as_of(v_subject, v_at) is null then '{}'::uuid[]
                        else ARRAY[hr.manager_as_of(v_subject, v_at)] end;
      else
        select coalesce(array_agg((x)::uuid), '{}'::uuid[]) into v_cands
          from jsonb_array_elements_text(coalesce(sd.resolver_config -> 'employment_ids', '[]'::jsonb)) x;
      end if;
      if v_cands <> '{}' then v_had_holders := true; end if;
      v_path := 'fixed';

    elsif v_rung = 'requester' then
      -- self-steps only. §2.5's allows_self is checked in eligibility, not here.
      v_cands := case when inst.requester_employment_id is null then '{}'::uuid[]
                      else ARRAY[inst.requester_employment_id] end;
      if v_cands <> '{}' then v_had_holders := true; end if;
      v_path := 'requester';

    elsif v_rung = 'system' then
      v_cands := '{}'; v_path := 'system';

    elsif v_rung = 'external_result' then
      -- §0 law 5: no human approver. The step closes on result_fn, never on an event.
      return jsonb_build_object(
        'granted', true, 'resolution_path', 'external_result',
        'candidates', '[]'::jsonb, 'user_ids', '[]'::jsonb,
        'evidence', jsonb_build_object('rung', 'external_result', 'as_of', v_at,
                                       'note', 'no human approver; this step closes on a recorded, inspectable result'));
    end if;

    -- ------------------------------------------------------ eligible(c), in §2.2's exact order
    if v_cands <> '{}' then
      declare keep uuid[] := '{}'; c uuid; v_ok boolean;
      begin
        foreach c in array v_cands loop
          -- 1. the subject — unless the step definition allows self
          -- 🚨 RULE 1 ASKS THE PREDICATE INSTEAD OF PRE-EMPTING IT (§1.4 rule 3). Never-approve-
          -- yourself is untouched: hr.can_approve's own RULE 1 IS that rule, and it says yes for a
          -- subject only under `allows_self` or the sole-proprietor carve-out — auto_record, top of
          -- the chart, no second actor. Striking first meant the predicate granted a sole
          -- proprietor their own leave while the selector had already thrown them away, and the
          -- instance died sole_actor_deadlock in every fresh single-person org.
          if v_subject is not null and c = v_subject and not sd.allows_self then
            if hr._wf_subject_may_self_act(c, v_action, v_target_tbl, inst.target_id, v_at) then
              v_sole := v_sole || jsonb_build_object('employment_id', c, 'why', 'sole_authority');
            else
              v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'is_subject');
              continue;
            end if;
          end if;
          -- 2. the requester, when requester <> subject AND THE FLOW TYPE MARKS THE REQUESTER AS
          -- AN INTERESTED PARTY (§2.2 rule 2 — `pay_change` proposed by a manager). Applying this
          -- unconditionally is an over-tightening defect: the HR owner who FILES a termination is
          -- then struck off the only rung holding termination_approve. Proven by probe.
          if inst.requester_employment_id is not null and c = inst.requester_employment_id
             and inst.requester_employment_id is distinct from v_subject
             and coalesce(v_requester_interested, false)
             and v_rung <> 'requester' and not sd.allows_self then
            v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'is_requester');
            continue;
          end if;
          -- 🚨 A PRIOR DECIDER OF THIS INSTANCE IS STRUCK, exactly as the requester is, and by the
          -- same shape one rung up. `require_second_actor` means two ACTORS: one person taking both
          -- the manager step and the executive step of the same request yields an audit that READS
          -- as two-level control and is not one, which is worse than no second step, because the
          -- second step is what everybody downstream trusts. Scoped to that mode only —
          -- auto_record's sole-proprietor carve-out exists for exactly the opposite case and says
          -- so in the record. The decide door refuses the same people; both arms call the same
          -- hr._wf_prior_deciders, so there is nothing to drift.
          -- 🚨 THE SEQUENTIAL LADDER ONLY (`parallel_group is null`). A parallel group is not a
          -- level of review — §3.2/§8.3 open its branches AT ONCE, after the decision is already
          -- made, so approving the exit interview is a task that follows the termination, not a
          -- second review of it. Struck everywhere, a single termination would need six distinct
          -- people and the flow would be undeliverable; struck on the ladder, the case that
          -- produced this rule (manager_approval then executive_approval, one human) is still
          -- refused. The decide door carries the same predicate.
          if v_two_actor and st.parallel_group is null
             and c = any(hr._wf_prior_deciders(inst.id)) then
            v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'is_prior_decider');
            continue;
          end if;
          -- an explicit exclusion (escalation moving off the previous holder)
          if c = any(coalesce(p_exclude_employment_ids, '{}'::uuid[])) then
            v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'excluded_by_caller');
            continue;
          end if;
          -- 3. terminated / inactive employments AT now()
          if not exists (select 1 from hr.employment em
                          where em.id = c and em.deleted_at is null
                            and em.status in ('active','on_leave','suspended','pending')) then
            v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'not_active');
            continue;
          end if;
          -- 4. absent approvers, when the definition says to skip them (§2.3)
          if defn.skip_absent_approver and hr._wf_absent(c) then
            v_absent := v_absent || jsonb_build_object('employment_id', c, 'why', 'absent');
            continue;
          end if;
          -- 5. vacant seats never reach here: they were dereferenced away (RECORDED DECISION 4).

          -- 🚨 RECORDED DECISION 1 — THE PREDICATE HAS THE LAST WORD. This is T-21b by
          -- construction: nothing this function returns can be something hr.can_approve refuses.
          v_uid := hr._wf_login_of(c);
          if v_uid is null then
            -- 🚨 A SELF-STEP RESOLVES ON THE EMPLOYMENT, BECAUSE THE PERSON MAY HAVE NO LOGIN.
            -- §5.1: "kiosk-only staff have no login at all (AD-10)", and there the login is a
            -- PROJECTION filter ("for each resolved approver who has a login") — §2.2's eligible()
            -- list contains no login rule at all. hr.can_approve's FIRST rule is
            -- `if v_allows_self then return v_is_self`, and v_is_self is
            -- `subject = any(employments_of(user))`: when the candidate IS the subject employment
            -- that is TRUE for whoever holds it, login or not. So the predicate's own condition is
            -- evaluated here directly and T-21b still holds — the selector returns only what
            -- hr.can_approve would accept. The candidate is kept and RECORDED as unreachable.
            if sd.allows_self and v_subject is not null and c = v_subject then
              v_noreach := v_noreach || jsonb_build_object('employment_id', c, 'why', 'no_login',
                'detail', 'resolved as the subject of a self-step; no login, so no iam.permissions grant and no workspace.tasks row');
              keep := keep || c;
              continue;
            end if;
            -- every OTHER rung: hr.can_approve asks about a PERSON and cannot judge a login-less
            -- candidate, and no reach can be granted to one either. Still a refusal, still named.
            v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'no_login');
            continue;
          end if;
          if v_action is not null then
            begin
              v_ok := hr.can_approve(v_uid, v_action, v_target_tbl, inst.target_id, v_at);
            exception when others then
              -- the six unmapped target tables (RECORDED DECISION 5) land here. Fail closed and
              -- name it; never route on a guess.
              return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
                'detail', format('approval_subject_unmapped: hr.can_approve cannot resolve a subject for %s (%s)',
                                 v_target_tbl, sqlerrm));
            end;
            if not v_ok then
              v_refused := v_refused || jsonb_build_object('employment_id', c, 'why', 'predicate_refused');
              continue;
            end if;
          end if;
          -- 🚨 DECIDING REQUIRES SEEING, SO A CANDIDATE WHO CANNOT SEE IS NOT A CANDIDATE.
          -- hr._wf_display withholds the change from a reader who is not entitled — but its
          -- entitlement test is "are you on this step", so being ASSIGNED the step was itself the
          -- entitlement, and an approver with no identity.read was shown a Confidential home
          -- address because somebody routed it to them. The answer is never to blind the decider:
          -- an approval taken without sight of the change is a rubber stamp the record then
          -- reports as a review. So the ineligibility is decided HERE, before the assignment
          -- exists — struck exactly as the subject is struck, recorded, and the fallback chain
          -- climbs on. If nobody entitled exists at all, the step fails closed to the HR admin
          -- queue as approver_not_entitled rather than routing to somebody who may not look.
          if v_ent is not null then
            v_ok := hr._wf_may_see_change(v_uid, v_ent);
            if not v_ok then
              v_unentitled := v_unentitled || jsonb_build_object(
                'employment_id', c, 'why', 'not_entitled_to_change',
                'token', v_ent ->> 'token', 'tier', v_ent ->> 'tier',
                'caps', v_ent -> 'caps', 'fields', v_ent -> 'fields');
              continue;
            end if;
          end if;
          keep := keep || c;
        end loop;
        v_cands := keep;
      end;
    end if;

    exit when v_cands <> '{}';
  end loop;

  -- ---------------------------------------------------------------- the two named failures
  if v_cands = '{}' then
    -- §2.2: holders existed but every one was disqualified -> approver_ineligible (name a
    -- substitute); nobody held the authority at all -> unroutable (grant somebody authority).
    -- The fixes differ, which is the whole reason the distinction is drawn.
    return jsonb_build_object(
      'granted', false,
      -- 🚨 when the ONLY thing the chain produced was the subject themselves, the honest name is
      -- not the generic one: §1.4 rule 3's sole-actor case has its own resolutions (an audited
      -- `record_without_approval`, or giving somebody else the authority), and a queue that cannot
      -- say which problem it has cannot offer the right way out.
      'reason', case
        -- 🚨 "the only person who holds this already used it on THIS request" and "nobody else
        -- holds it at all" have different fixes, so they get different names. The distinct-actor
        -- case is checked first because it is the more specific of the two.
        when exists (select 1 from jsonb_array_elements(v_refused) r
                      where r ->> 'why' = 'is_prior_decider')
          then 'distinct_actor_required'
        when v_refused <> '[]'::jsonb
             and not exists (select 1 from jsonb_array_elements(v_refused) r
                              where r ->> 'why' is distinct from 'is_subject')
          then 'sole_actor_deadlock'
        -- 🚨 "everybody who may act is barred from LOOKING at it" has its own fix — grant the
        -- read capability the door names, or move the action to a role that holds both — so it
        -- gets its own name. approver_ineligible would send an admin hunting for a substitute
        -- who does not exist.
        when v_unentitled <> '[]'::jsonb then 'approver_not_entitled'
        when v_had_holders then 'approver_ineligible'
        else 'unroutable' end,
      'detail', case when v_had_holders
                     then 'every candidate the fallback chain produced was disqualified'
                     else 'the fallback chain was exhausted and nobody holds this authority' end,
      'evidence', jsonb_build_object('as_of', v_at, 'action_type', v_action,
                                     'action_type_id', v_action_id,
                                     'fallback_chain', sd.fallback_chain, 'rungs_walked', v_walked,
                                     'refused', v_refused, 'absent', v_absent,
                                     'no_reach', v_noreach)
        || case when v_ent is null then '{}'::jsonb
                else jsonb_build_object('change_entitlement', v_ent,
                                        'not_entitled', v_unentitled) end);
  end if;

  select coalesce(array_agg(u), '{}'::uuid[]) into v_users
    from (select distinct hr._wf_login_of(c) u from unnest(v_cands) c) s where u is not null;

  return jsonb_build_object(
    'granted', true,
    'resolution_path', v_path,
    'candidates', to_jsonb(v_cands),
    'user_ids', to_jsonb(v_users),
    'evidence', jsonb_build_object(
      'rung', v_path, 'as_of', v_at,
      'action_type', v_action, 'action_type_id', v_action_id,
      'authority_ids', to_jsonb(v_rows), 'holders', v_holders,
      'fallback_chain', sd.fallback_chain, 'rungs_walked', v_walked,
      'predicate_refused', v_refused, 'absent', v_absent, 'no_reach', v_noreach,
      'sole_authority', v_sole,
      'delegation_principal_retains', v_retains)
    -- RD 6: emitted ONLY when the gate armed, so an unarmed flow's evidence is byte-identical.
    || case when v_ent is null then '{}'::jsonb
            else jsonb_build_object('change_entitlement', v_ent,
                                    'not_entitled', v_unentitled) end);
end
$function$;

CREATE OR REPLACE FUNCTION iam._managed_invitation(p_invitation_id uuid)
 RETURNS iam.invitations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_invitation iam.invitations;
  v_org uuid;
  v_personal boolean;
  v_actor_role text;
begin
  -- Read target identity first, acquire the same container lock as inv_create,
  -- then lock/re-read the row. This order avoids advisory/row-lock inversion.
  select invitation.*
  into v_invitation
  from iam.invitations as invitation
  where invitation.id = p_invitation_id
    and invitation.status = 'pending'
    and invitation.deleted_at is null;

  if v_invitation.id is null then
    raise exception 'pending invitation not found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_invitation.target_type || ':' || v_invitation.target_id::text,
      0
    )
  );

  select invitation.*
  into v_invitation
  from iam.invitations as invitation
  where invitation.id = p_invitation_id
    and invitation.status = 'pending'
    and invitation.deleted_at is null
  for update;

  if v_invitation.id is null then
    raise exception 'pending invitation not found' using errcode = 'P0002';
  end if;

  -- DD-191: strict. This helper is what inv_get_managed / inv_resend / inv_revoke run on, and its
  -- `not in` test had the same NULL fall-through as inv_list — a non-member could read, resend and
  -- revoke any pending invitation whose id they held. Proved live 2026-09-13.
  select
    container.resource_org_id,
    container.resource_is_personal,
    container.actor_role
  into v_org, v_personal, v_actor_role
  from iam._container_authz(
    v_invitation.target_type,
    v_invitation.target_id,
    v_uid
  ) as container;

  if not found
     or v_org is null
     or v_invitation.organization_id is distinct from v_org then
    raise exception 'invitation target/organization mismatch'
      using errcode = '42501';
  end if;

  if not v_service then
    if v_personal or coalesce(v_actor_role, 'none') not in ('owner', 'admin') then
      raise exception 'invitation manager role required' using errcode = '42501';
    end if;

    if v_invitation.role = 'owner' and coalesce(v_actor_role, 'none') <> 'owner' then
      raise exception 'only an owner may manage an owner invitation'
        using errcode = '42501';
    end if;
  end if;

  return v_invitation;
end;
$function$;

CREATE OR REPLACE FUNCTION iam.emergency_door_approve(p_request_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'platform', 'communication', 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  q iam.emergency_door_request%rowtype;
  v_t record; v_class text; v_entity_schema text; v_entity_table text;
  v_requester_role text; v_approver_role text;
  v_ttl integer; v_perm uuid; v_audit uuid; v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'emergency_door_approve: no authenticated caller' using errcode = '42501';
  end if;

  -- The lock is the claim. A second decider waits, then observes the completed status and emits
  -- no second permission/audit/notification.
  select * into q
    from iam.emergency_door_request
   where id = p_request_id
   for update;
  if not found then
    raise exception 'emergency_door_approve: no request %', p_request_id using errcode = 'P0002';
  end if;

  if q.status <> 'pending' then
    return jsonb_build_object('granted', false, 'reason', 'not_pending',
      'message', format('This request was already %s.', q.status));
  end if;

  -- An elapsed request is no longer pending work. It transitions once under the claim, without
  -- creating a grant, an access audit, or a subject notification for an obsolete request.
  if q.request_expires_at <= now() then
    update iam.emergency_door_request
       set status = 'expired', updated_at = now()
     where id = q.id and status = 'pending';
    return jsonb_build_object('granted', false, 'reason', 'request_expired',
      'message', 'This request has lapsed. If the emergency is still live, ask again.');
  end if;

  -- Hold the entity-type row before resolving class/table. Reclassification or a table remap now
  -- waits until this decision commits.
  select et.schema_name, et.table_name into v_entity_schema, v_entity_table
    from platform.entity_types et
   where et.token = q.target_token
   for share;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'stale_request',
      'message', 'This request no longer matches a registered record, so it cannot be approved. If access is still needed, open a new request.');
  end if;

  -- `_door_target_lock` locks the actual row using the entity mapping now held above. Resolve the
  -- canonical facts only AFTER the row lock: a concurrent update before the lock is observed, and
  -- one after it waits for this transaction.
  if not iam._door_target_lock(q.target_token, q.target_id) then
    return jsonb_build_object('granted', false, 'reason', 'stale_request',
      'message', 'This request no longer matches a current record, so it cannot be approved. If access is still needed, open a new request.');
  end if;
  v_class := iam.emergency_door_class(q.target_token);
  select * into v_t from iam._door_target(q.target_token, q.target_id);
  if v_t.o_org is null
     or v_t.o_org is distinct from q.organization_id
     or v_t.o_subject is distinct from q.subject_user_id
     or v_class is distinct from q.data_class
     or v_class is distinct from 'private' then
    return jsonb_build_object('granted', false, 'reason', 'stale_request',
      'message', 'This request no longer matches the current record, so it cannot be approved. If access is still needed, open a new request.');
  end if;

  -- The eventual grantee must still be a current organization admin/owner — the same standing
  -- that was required to ask for the private door in the first place. FOR SHARE prevents removal
  -- or a role change between this decision and the grant.
  select om.role into v_requester_role
    from iam.organization_member om
   where om.user_id = q.requested_by and om.organization_id = v_t.o_org
   for share;
  if not found or coalesce(v_requester_role::text, 'none') not in ('owner', 'admin') then
    return jsonb_build_object('granted', false, 'reason', 'requester_no_longer_eligible',
      'message', 'The requester no longer has the organization standing required for this emergency grant, so it cannot be approved.');
  end if;

  select om.role into v_approver_role
    from iam.organization_member om
   where om.user_id = v_uid and om.organization_id = v_t.o_org
   for share;

  if not found or coalesce(v_approver_role::text, 'none') <> 'owner' then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', q.target_token, v_class, q.purpose, 'refused', false,
      ARRAY[q.target_id], null, v_t.o_subject, q.justification,
      'only an organization OWNER can approve a private-class emergency request', q.id,
      null, null, true, null, q.requested_by);
    perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_denied',
      v_t.o_subject,
      jsonb_build_object('token', q.target_token, 'target_id', q.target_id,
                         'requested_by', q.requested_by, 'denied_by', v_uid,
                         'purpose', q.purpose, 'note', 'the approver was not an organization owner',
                         'audit_id', v_audit),
      v_audit, '/me/access-log', 'edoor:deny:' || v_audit::text);
    return jsonb_build_object('granted', false, 'reason', 'not_an_org_owner',
      'message', 'Only an owner of this organization can approve emergency access to private data.',
      'audit_id', v_audit);
  end if;

  if q.requested_by = v_uid then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', q.target_token, v_class, q.purpose, 'refused', false,
      ARRAY[q.target_id], null, v_t.o_subject, q.justification,
      'the person who asked cannot also be the person who approves', q.id,
      null, null, true, null, q.requested_by);
    perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_denied',
      v_t.o_subject,
      jsonb_build_object('token', q.target_token, 'target_id', q.target_id,
                         'requested_by', q.requested_by, 'denied_by', v_uid,
                         'purpose', q.purpose,
                         'note', 'the person who asked tried to approve their own request',
                         'audit_id', v_audit),
      v_audit, '/me/access-log', 'edoor:deny:' || v_audit::text);
    return jsonb_build_object('granted', false, 'reason', 'same_person',
      'message', 'You asked for this access, so you cannot also approve it. Another owner has to.',
      'audit_id', v_audit);
  end if;

  v_ttl := iam._door_ttl_minutes(v_t.o_org);
  v_expires := now() + make_interval(mins => v_ttl);

  perform set_config('iam.emergency_door', 'on', true);
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level,
                               status, expires_at, created_by)
  values (q.target_token, q.target_id, q.requested_by, 'viewer', 'active', v_expires, v_uid)
  on conflict (resource_type, resource_id, granted_to_user_id) do update
     set permission_level = excluded.permission_level,
         expires_at = excluded.expires_at,
         status = 'active'
  returning id into v_perm;

  update iam.emergency_door_request
     set status = 'approved', decided_by = v_uid, decided_at = now(), decision_note = p_note,
         permission_id = v_perm, grant_expires_at = v_expires, updated_at = now()
   where id = q.id and status = 'pending';
  if not found then
    -- The claim means this is unreachable unless a new writer violates the row-lock protocol.
    -- Raise so PostgreSQL rolls back the permission rather than leaving a grant without its request.
    raise exception 'emergency_door_approve: claimed request % was no longer pending', q.id
      using errcode = '40001';
  end if;

  v_audit := iam._record_access_audit(
    v_t.o_org, 'approved', q.target_token, v_class, q.purpose, 'emergency_door', true,
    ARRAY[q.target_id], 1, v_t.o_subject, q.justification, null, q.id, v_perm, v_expires,
    true, null, q.requested_by);

  perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_opened',
    v_t.o_subject,
    jsonb_build_object('token', q.target_token, 'target_id', q.target_id,
                       'opened_by', q.requested_by, 'approved_by', v_uid, 'purpose', q.purpose,
                       'justification', q.justification, 'expires_at', v_expires,
                       'data_class', v_class, 'audit_id', v_audit),
    v_audit, '/me/access-log',
    'edoor:open:' || v_audit::text || ':' || coalesce(v_t.o_subject::text,'-'));

  return jsonb_build_object('granted', true, 'audit_id', v_audit, 'permission_id', v_perm,
    'permission_level', 'viewer', 'expires_at', v_expires,
    'message', format('Approved, read-only, until %s. The person whose data it is has been told.',
                      to_char(v_expires, 'HH24:MI')));
end $function$;

CREATE OR REPLACE FUNCTION iam.emergency_door_deny(p_request_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'platform', 'communication', 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  q iam.emergency_door_request%rowtype;
  v_t record; v_class text; v_entity_schema text; v_entity_table text;
  v_requester_role text; v_decider_role text; v_audit uuid;
begin
  if v_uid is null then
    raise exception 'emergency_door_deny: no authenticated caller' using errcode = '42501';
  end if;

  select * into q
    from iam.emergency_door_request
   where id = p_request_id
   for update;
  if not found then
    raise exception 'emergency_door_deny: no request %', p_request_id using errcode = 'P0002';
  end if;
  if q.status <> 'pending' then
    return jsonb_build_object('granted', false, 'reason', 'not_pending',
      'message', format('This request was already %s.', q.status));
  end if;
  if q.request_expires_at <= now() then
    update iam.emergency_door_request
       set status = 'expired', updated_at = now()
     where id = q.id and status = 'pending';
    return jsonb_build_object('granted', false, 'reason', 'request_expired',
      'message', 'This request has lapsed. If the emergency is still live, ask again.');
  end if;

  select et.schema_name, et.table_name into v_entity_schema, v_entity_table
    from platform.entity_types et
   where et.token = q.target_token
   for share;
  if not found or not iam._door_target_lock(q.target_token, q.target_id) then
    return jsonb_build_object('granted', false, 'reason', 'stale_request',
      'message', 'This request no longer matches a current record, so it cannot be denied.');
  end if;

  v_class := iam.emergency_door_class(q.target_token);
  select * into v_t from iam._door_target(q.target_token, q.target_id);
  if v_t.o_org is null
     or v_t.o_org is distinct from q.organization_id
     or v_t.o_subject is distinct from q.subject_user_id
     or v_class is distinct from q.data_class
     or v_class is distinct from 'private' then
    return jsonb_build_object('granted', false, 'reason', 'stale_request',
      'message', 'This request no longer matches the current record, so it cannot be denied.');
  end if;

  select om.role into v_requester_role
    from iam.organization_member om
   where om.user_id = q.requested_by and om.organization_id = v_t.o_org
   for share;
  if not found or coalesce(v_requester_role::text, 'none') not in ('owner', 'admin') then
    return jsonb_build_object('granted', false, 'reason', 'requester_no_longer_eligible',
      'message', 'The requester no longer has the organization standing required for this emergency request, so it cannot be denied.');
  end if;

  select om.role into v_decider_role
    from iam.organization_member om
   where om.user_id = v_uid and om.organization_id = v_t.o_org
   for share;
  if not found or coalesce(v_decider_role::text, 'none') <> 'owner' then
    return jsonb_build_object('granted', false, 'reason', 'not_an_org_owner',
      'message', 'Only an owner of this organization can answer an emergency access request.');
  end if;

  update iam.emergency_door_request
     set status = 'denied', decided_by = v_uid, decided_at = now(), decision_note = p_note,
         updated_at = now()
   where id = q.id and status = 'pending';
  if not found then
    raise exception 'emergency_door_deny: claimed request % was no longer pending', q.id
      using errcode = '40001';
  end if;

  v_audit := iam._record_access_audit(
    v_t.o_org, 'denied', q.target_token, v_class, q.purpose, 'refused', false,
    ARRAY[q.target_id], null, v_t.o_subject, q.justification,
    coalesce(p_note, 'the organization owner refused the request'), q.id,
    null, null, true, null, q.requested_by);
  perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_denied',
    v_t.o_subject,
    jsonb_build_object('token', q.target_token, 'target_id', q.target_id,
                       'requested_by', q.requested_by, 'denied_by', v_uid, 'purpose', q.purpose,
                       'note', p_note, 'audit_id', v_audit),
    v_audit, '/me/access-log', 'edoor:deny:' || v_audit::text);

  return jsonb_build_object('granted', false, 'reason', 'denied', 'audit_id', v_audit,
    'message', 'Refused, and recorded. The person whose data it is has been told it was asked for and refused.');
end $function$;

CREATE OR REPLACE FUNCTION iam.emergency_door_open(p_token text, p_id uuid, p_purpose text, p_justification text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'platform', 'communication', 'hr', 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_class text; v_t record; v_min integer; v_ttl integer; v_audit uuid; v_perm uuid;
  v_req uuid; v_is_admin boolean; v_is_owner boolean; v_expires timestamptz; v_rec record;
begin
  if v_uid is null then
    raise exception 'emergency_door_open: no authenticated caller' using errcode = '42501';
  end if;

  if exists (select 1 from hr._door_spec(p_token)) then
    return public.hr_break_glass(p_token, p_id, p_purpose, p_justification);
  end if;

  v_class := iam.emergency_door_class(p_token);
  select * into v_t from iam._door_target(p_token, p_id);

  if v_t.o_schema is null then
    raise exception 'emergency_door_open: % is not a registered entity token, so there is no row for this door to open. Register it in platform.entity_types first.', p_token
      using errcode = '22023';
  end if;
  if v_t.o_org is null then
    raise exception 'emergency_door_open: no % row with id %', p_token, p_id using errcode = 'P0002';
  end if;

  select bool_or(om.role in ('owner','admin')), bool_or(om.role = 'owner')
    into v_is_admin, v_is_owner
    from iam.organization_member om
   where om.user_id = v_uid and om.organization_id = v_t.o_org;
  v_is_admin := coalesce(v_is_admin, false);
  v_is_owner := coalesce(v_is_owner, false);

  if v_class is null then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, '(unclassified)', coalesce(p_purpose,'(none given)'), 'refused',
      false, ARRAY[p_id], null, v_t.o_subject, p_justification,
      format('%s has no data class yet, so this door cannot know how strictly to open it. Classify the token in platform.entity_types before asking for emergency access.', p_token));
    return jsonb_build_object('granted', false, 'reason', 'unclassified_token',
      'message', format('%s has no data class yet. Nobody can open it in an emergency until someone says how private it is.', p_token),
      'audit_id', v_audit);
  end if;

  if v_class not in ('private', 'confidential') then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, v_class, coalesce(p_purpose,'(none given)'), 'refused',
      false, ARRAY[p_id], null, v_t.o_subject, p_justification,
      format('%s is %s-class data, which is reached by ordinary access rather than by an emergency door.', p_token, v_class));
    return jsonb_build_object('granted', false, 'reason', 'no_door_needed',
      'message', format('%s is %s data. Ask for ordinary access to it — this door is for private data only.', p_token, v_class),
      'audit_id', v_audit);
  end if;

  if not v_is_admin then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, v_class, coalesce(p_purpose,'(none given)'), 'refused',
      false, ARRAY[p_id], null, v_t.o_subject, p_justification,
      'the caller is not an owner or admin of the organization that owns this row');
    return jsonb_build_object('granted', false, 'reason', 'not_an_org_admin',
      'message', 'Only an owner or admin of the organization that owns this data can open the emergency door on it.',
      'audit_id', v_audit);
  end if;

  v_min := iam._door_min_chars(v_t.o_org);
  if p_justification is null or length(btrim(p_justification)) < v_min then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, v_class, coalesce(p_purpose,'(none given)'), 'refused',
      false, ARRAY[p_id], null, v_t.o_subject, p_justification,
      format('justification is shorter than the %s-character floor', v_min));
    return jsonb_build_object('granted', false, 'reason', 'justification_too_short',
      'message', format('Say why, in at least %s characters. This sentence goes to the person whose data you are opening.', v_min),
      'audit_id', v_audit);
  end if;

  if not exists (select 1 from platform.categories cat
                  where cat.dimension = 'access_purpose' and cat.slug = p_purpose
                    and cat.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                    and cat.deleted_at is null) then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, v_class, '(unregistered)', 'refused',
      false, ARRAY[p_id], null, v_t.o_subject, p_justification,
      format('purpose %s is not in the access_purpose dimension', coalesce(p_purpose,'(null)')));
    return jsonb_build_object('granted', false, 'reason', 'unregistered_purpose',
      'message', 'Pick a reason from the list. A typed reason cannot be reported on, so it is not accepted.',
      'audit_id', v_audit);
  end if;

  if v_t.o_subject = v_uid then
    return jsonb_build_object('granted', false, 'reason', 'self',
      'message', 'This is your own data. You can already read it.');
  end if;

  if not exists (select 1 from platform.shareable_resource_registry srr
                  where srr.is_active and srr.resource_type = p_token) then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, v_class, p_purpose, 'refused', false, ARRAY[p_id], null,
      v_t.o_subject, p_justification,
      format('%s is not a registered sharing token, so no grant can be written for it', p_token));
    return jsonb_build_object('granted', false, 'reason', 'token_not_grantable',
      'message', format('%s cannot carry a grant, so the emergency door has nothing to open. Register it as a shareable resource first.', p_token),
      'audit_id', v_audit);
  end if;

  v_ttl := iam._door_ttl_minutes(v_t.o_org);

  if v_class = 'private' then
    insert into iam.emergency_door_request
      (organization_id, target_token, target_id, subject_user_id, data_class, purpose,
       justification, requested_by, status, request_expires_at, created_by, visibility)
    values (v_t.o_org, p_token, p_id, v_t.o_subject, v_class, p_purpose, p_justification, v_uid,
            'pending', now() + interval '24 hours', v_uid, 'personal'::platform.visibility)
    returning id into v_req;

    v_audit := iam._record_access_audit(
      v_t.o_org, 'requested', p_token, v_class, p_purpose, 'requested', false, ARRAY[p_id], null,
      v_t.o_subject, p_justification, null, v_req);

    perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_requested', v_t.o_subject,
      jsonb_build_object('token', p_token, 'target_id', p_id, 'requested_by', v_uid,
                         'purpose', p_purpose, 'justification', p_justification,
                         'request_id', v_req, 'data_class', v_class),
      v_req, '/me/access-log', 'edoor:req:' || v_req::text || ':' || coalesce(v_t.o_subject::text,'-'));

    for v_rec in select om.user_id from iam.organization_member om
                  where om.organization_id = v_t.o_org and om.role = 'owner' and om.user_id <> v_uid loop
      perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_approval_needed', v_rec.user_id,
        jsonb_build_object('token', p_token, 'target_id', p_id, 'requested_by', v_uid,
                           'purpose', p_purpose, 'justification', p_justification,
                           'request_id', v_req, 'subject_user_id', v_t.o_subject),
        v_req, '/organizations/emergency-access', 'edoor:appr:' || v_req::text || ':' || v_rec.user_id::text);
    end loop;

    return jsonb_build_object('granted', false, 'reason', 'awaiting_approval', 'request_id', v_req,
      'audit_id', v_audit, 'data_class', v_class,
      'message', 'This is private data, so one person cannot open it. The organization''s owner has been asked to approve, and the person whose data it is has been told you asked.');
  end if;

  v_expires := now() + make_interval(mins => v_ttl);
  perform set_config('iam.emergency_door', 'on', true);
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level,
                               status, expires_at, created_by)
  values (p_token, p_id, v_uid, 'viewer', 'active', v_expires, v_uid)
  on conflict (resource_type, resource_id, granted_to_user_id) do update
     set permission_level = excluded.permission_level,
         expires_at = excluded.expires_at,
         status = 'active'
  returning id into v_perm;

  v_audit := iam._record_access_audit(
    v_t.o_org, 'read', p_token, v_class, p_purpose, 'emergency_door', true, ARRAY[p_id], 1,
    v_t.o_subject, p_justification, null, null, v_perm, v_expires);

  perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_opened', v_t.o_subject,
    jsonb_build_object('token', p_token, 'target_id', p_id, 'opened_by', v_uid,
                       'purpose', p_purpose, 'justification', p_justification,
                       'expires_at', v_expires, 'data_class', v_class, 'audit_id', v_audit),
    v_audit, '/me/access-log', 'edoor:open:' || v_audit::text || ':' || coalesce(v_t.o_subject::text,'-'));

  return jsonb_build_object('granted', true, 'audit_id', v_audit, 'permission_id', v_perm,
    'permission_level', 'viewer', 'expires_at', v_expires, 'data_class', v_class,
    'alert_event', 'platform.access.emergency_door_opened', 'alert_tier', 'immediate',
    'message', format('Opened, read-only, until %s. The person whose data this is has been told who you are and why.',
                      to_char(v_expires, 'HH24:MI')));
end $function$;

CREATE OR REPLACE FUNCTION iam.organization_archive(p_org uuid, p_confirm_name text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid  uuid := (select auth.uid());
  v_org  iam.organizations%rowtype;
begin
  select * into v_org from iam.organizations where id = p_org;
  if not found then
    raise exception 'That organization no longer exists.' using errcode = 'P0002';
  end if;

  if not ((select public.is_platform_admin()) or iam.is_org_owner(p_org, v_uid)) then
    raise exception 'Only an owner of % can archive it.', v_org.name using errcode = '42501';
  end if;

  if coalesce(v_org.is_personal, false) then
    raise exception
      'Your personal workspace cannot be archived — it is where your own work lives.'
      using errcode = '23514';
  end if;

  if v_org.is_system then
    raise exception
      '% is a system organization and cannot be archived.', v_org.name using errcode = '23514';
  end if;

  if p_confirm_name is distinct from v_org.name then
    raise exception
      'Type the organization''s name exactly — % — to archive it.', v_org.name
      using errcode = '23514';
  end if;

  if v_org.archived_at is not null then
    return jsonb_build_object(
      'archived', true,
      'changed', false,
      'archived_at', v_org.archived_at,
      'sentence', format('%s was already archived on %s.',
                         v_org.name, to_char(v_org.archived_at, 'DD Month YYYY')));
  end if;

  update iam.organizations
     set archived_at    = now(),
         archived_by    = v_uid,
         archive_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_at     = now(),
         updated_by     = coalesce(v_uid, updated_by)
   where id = p_org
  returning * into v_org;

  insert into iam.org_admin_audit (organization_id, actor_user_id, action, detail)
  values (p_org, v_uid, 'organization.archived',
          jsonb_build_object('reason', v_org.archive_reason, 'name', v_org.name));

  return jsonb_build_object(
    'archived', true,
    'changed', true,
    'archived_at', v_org.archived_at,
    'sentence', format(
      '%s is archived. Its members cannot open it and nothing inside it runs, but nothing was '
      'deleted — an owner can restore it at any time.', v_org.name));
end
$function$;

CREATE OR REPLACE FUNCTION iam.organization_restore(p_org uuid, p_confirm_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_org iam.organizations%rowtype;
begin
  select * into v_org from iam.organizations where id = p_org;
  if not found then
    raise exception 'That organization no longer exists.' using errcode = 'P0002';
  end if;

  -- is_org_owner answers about YOURSELF without asking my_orgs(), so an owner can still be
  -- recognised as the owner of an organization the archive has taken out of my_orgs().
  if not ((select public.is_platform_admin()) or iam.is_org_owner(p_org, v_uid)) then
    raise exception
      'Only an owner of %, or a super admin, can restore it.', v_org.name using errcode = '42501';
  end if;

  if p_confirm_name is distinct from v_org.name then
    raise exception
      'Type the organization''s name exactly — % — to restore it.', v_org.name
      using errcode = '23514';
  end if;

  if v_org.archived_at is null then
    return jsonb_build_object(
      'archived', false, 'changed', false,
      'sentence', format('%s is not archived.', v_org.name));
  end if;

  update iam.organizations
     set archived_at    = null,
         archived_by    = null,
         archive_reason = null,
         updated_at     = now(),
         updated_by     = coalesce(v_uid, updated_by)
   where id = p_org
  returning * into v_org;

  insert into iam.org_admin_audit (organization_id, actor_user_id, action, detail)
  values (p_org, v_uid, 'organization.restored', jsonb_build_object('name', v_org.name));

  return jsonb_build_object(
    'archived', false, 'changed', true,
    'sentence', format(
      '%s is open again. Its members have their access back and everything inside it — records, '
      'agents, schedules — is exactly as they left it.', v_org.name));
end
$function$;

CREATE OR REPLACE FUNCTION mandate.duplicate_mandate(p_mandate_id uuid, p_as_system boolean DEFAULT false, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid    := (SELECT auth.uid());
  v_as_system boolean := COALESCE(p_as_system, false);
  v_src       mandate.definition%ROWTYPE;
  v_sys       uuid;
  v_home      uuid;
  v_new_id    uuid    := gen_random_uuid();
  v_new_key   text;
  v_holder    record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Not authenticated',
      hint    = 'Sign in and try again.';
  END IF;

  SELECT so.organization_id INTO v_sys
  FROM iam.system_orgs so WHERE so.key = 'system';
  IF v_sys IS NULL THEN
    RAISE EXCEPTION USING
      errcode = 'P0001',
      message = 'mandate: iam.system_orgs has no row with key ''system'', so nothing can be promoted.',
      hint    = 'Restore the iam.system_orgs row keyed ''system''.';
  END IF;

  SELECT * INTO v_src
  FROM mandate.definition d
  WHERE d.id = p_mandate_id AND d.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      errcode = 'P0002',
      message = 'No live mandate answers to that id, so there is nothing to copy.',
      hint    = 'Open the mandate from the list and try again — it may have been deleted.';
  END IF;

  -- READ ACCESS. SECURITY DEFINER read the row past RLS, so the visibility
  -- rule is re-stated here: a mandate is yours to copy when it is homed in the
  -- system org (globally readable) or in an organization you belong to.
  IF v_src.organization_id IS DISTINCT FROM v_sys
     AND NOT EXISTS (
       SELECT 1 FROM iam.organization_member om
       WHERE om.user_id = v_uid AND om.organization_id = v_src.organization_id
     )
  THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'That mandate is homed in an organization you do not belong to, so it is not yours to copy.',
      hint    = 'Ask a member of that organization to copy it, or open a mandate from one of your own organizations.';
  END IF;

  -- THE SUPER-ADMIN GATE, IN THE BODY (agx_duplicate_agent precedent).
  -- Deliberately strict so a forged client param can never produce a system
  -- mandate from a non-admin call.
  IF v_as_system AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Only a platform super administrator can promote a mandate to a system mandate.',
      detail  = 'A system mandate is homed in the Matrx System organization, so it decides for every user on the platform.',
      hint    = 'Ask a platform super administrator to promote it, or copy it into one of your own organizations instead.';
  END IF;

  IF v_as_system THEN
    v_home := v_sys;

    -- 🚨 THE HOLDER LAW.
    IF v_src.default_holder_id IS NOT NULL THEN
      IF v_src.default_holder_type IS DISTINCT FROM 'agent' THEN
        RAISE EXCEPTION USING
          errcode = '42501',
          message = format(
            'Mandate %L is held by a %s, and only a system agent can hold a system mandate.',
            v_src.mandate_key, v_src.default_holder_type),
          detail  = 'A system mandate runs for every user on the platform, so its default holder must be owned by the Matrx System organization.',
          hint    = 'Rebind this mandate to a system agent, then promote it.';
      END IF;

      SELECT a.name, a.agent_type, a.organization_id
        INTO v_holder
      FROM agent.definition a
      WHERE a.id = v_src.default_holder_id AND a.deleted_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION USING
          errcode = '42501',
          message = format(
            'Mandate %L is held by an agent that no longer exists, so it cannot become a system mandate.',
            v_src.mandate_key),
          detail  = format('default_holder_id = %L names no live agent.', v_src.default_holder_id),
          hint    = 'Rebind this mandate to a live system agent, then promote it.';
      END IF;

      IF v_holder.agent_type IS DISTINCT FROM 'builtin'
         OR v_holder.organization_id IS DISTINCT FROM v_sys
      THEN
        RAISE EXCEPTION USING
          errcode = '42501',
          message = format(
            'Mandate %L is held by %L, which is a personal agent, so it cannot become a system mandate.',
            v_src.mandate_key, v_holder.name),
          detail  = 'A system mandate runs for every user on the platform, so its default holder must be a system agent (agent_type=''builtin'', owned by the Matrx System organization).',
          hint    = 'Promote the agent first: agx_duplicate_agent(p_as_system) creates its system twin — rebind this mandate to that twin, then promote the mandate.';
      END IF;
    END IF;
  ELSE
    -- The non-system branch. There is no "no org": the column is NOT NULL, so
    -- the caller must NAME a home and be PROVED to belong to it. Membership is
    -- never trusted from the argument (SECURITY DEFINER).
    IF p_organization_id IS NULL THEN
      RAISE EXCEPTION USING
        errcode = '22004',
        message = 'A mandate copy needs a home, so name the organization to copy it into.',
        detail  = 'mandate.definition.organization_id is NOT NULL — a mandate''s home IS its scope (D-R3).',
        hint    = 'Pass p_organization_id, or pass p_as_system => true to promote it to the Matrx System organization.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM iam.organization_member om
      WHERE om.user_id = v_uid AND om.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION USING
        errcode = '42501',
        message = 'You are not a member of that organization, so a mandate cannot be copied into it.',
        hint    = 'Choose one of your own organizations.';
    END IF;
    v_home := p_organization_id;
  END IF;

  v_new_key := mandate.generate_copy_mandate_key(v_src.mandate_key);

  INSERT INTO mandate.definition (
    id, mandate_key, label, description,
    goal, goal_grounding,
    output_kind, required_output_keys, required_context_policies,
    accepts_user_input, input_waiver, output_waiver, input_source,
    provision_key, pinned_context, pins, draft_inputs, auto_context_disabled,
    default_holder_type, default_holder_id, default_holder_version_id,
    fallback_mandate_key,
    is_enabled, visibility,
    -- A copy is authored, never declared: origin='user' and code_path NULL, so
    -- `guard_code_declared_home` has nothing to say about it (a code-declared
    -- mandate must be system-homed; this one is homed by the branch above).
    origin, code_path,
    organization_id, created_by,
    source_mandate_id,
    metadata
  )
  VALUES (
    v_new_id, v_new_key, v_src.label || ' (Copy)', v_src.description,
    v_src.goal, v_src.goal_grounding,
    v_src.output_kind, v_src.required_output_keys, v_src.required_context_policies,
    v_src.accepts_user_input, v_src.input_waiver, v_src.output_waiver, v_src.input_source,
    v_src.provision_key, v_src.pinned_context, v_src.pins, v_src.draft_inputs, v_src.auto_context_disabled,
    v_src.default_holder_type, v_src.default_holder_id, v_src.default_holder_version_id,
    v_src.fallback_mandate_key,
    v_src.is_enabled, v_src.visibility,
    'user', NULL,
    v_home,
    v_uid,           -- the DRIVER (D-R3: created_by is audit, never scope)
    p_mandate_id,
    -- Strip the legacy provenance block: it addresses the legacy shortcut/app
    -- row this copy is NOT (see the header). Everything else rides along, so a
    -- future metadata key is carried by default rather than silently dropped.
    (v_src.metadata
       - 'legacy_id' - 'legacy_table'
       - 'shortcut_compat' - 'shortcut_created_at' - 'shortcut_created_by'
       - 'shortcut_updated_at' - 'shortcut_updated_by' - 'shortcut_version'
       - 'shortcut_metadata'
       - 'app_slug' - 'app_job' - 'app_use_latest'
       - 'app_created_at' - 'app_created_by')
  );

  -- NO BINDINGS ARE COPIED. Deliberate — see the header.

  RETURN v_new_id;
END
$function$;

CREATE OR REPLACE FUNCTION mandate.submit_scan_report(p_report jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_jwt_role   text;
  v_phase      text;
  v_repo       text;
  v_revision   text;
  v_kind       text;
  v_scanner    text;
  v_org        uuid;
  v_pkg        jsonb;
  v_batches    jsonb   := '[]'::jsonb;
  v_batch      jsonb;
  v_refs       jsonb;
  v_bad        text;
  v_scan_id    uuid;
  v_pkg_path   text;
  v_pkg_name   text;
  v_deployed   text;
  v_chunk      integer;
  v_expected   integer;
  v_received   integer[];
  v_missing    integer[];
  v_n          integer;
  v_scans      integer := 0;
  v_written    integer := 0;
  v_absent     integer := 0;
  v_unknown    integer := 0;
  v_orphan     integer := 0;
  v_stale      integer := 0;
  v_scan_ids   jsonb   := '{}'::jsonb;
  v_digest     text;
  v_prev_rev   text;
  v_cur_dep    text;
  v_unchanged  jsonb   := '[]'::jsonb;
BEGIN
  -- ── (1) THE LANE, read from the JWT, never from current_user ────────────
  BEGIN
    v_jwt_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  EXCEPTION WHEN others THEN
    v_jwt_role := 'authenticated';   -- unreadable claims → the browser lane
  END;

  IF coalesce(v_jwt_role, 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'REPORTER_NOT_TRUSTED: a scan report may only be submitted by a release check.',
      detail  = 'This report writes platform-wide evidence about what every repository''s code contains. It is accepted from aidream''s own server pool (matrx-orm, no JWT claims) and from a service/secret key, never from a signed-in browser session.',
      hint    = 'Run the check with the repository''s existing DB credential — SUPABASE_DB_URL in aidream, the SUPABASE_SECRET_KEY the other check:* gates already use in the TypeScript repos.';
  END IF;

  -- ── (2) THE FROZEN CONTRACT ─────────────────────────────────────────────
  IF coalesce(nullif(p_report->>'contract_version',''), '')::text IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = format('UNSUPPORTED_CONTRACT_VERSION: this door accepts contract_version 1, the report says %s.',
                       coalesce(p_report->>'contract_version', '<missing>')),
      detail  = 'The report contract is frozen in common-docs/projects/mandate-declaration-reporting/REGISTER.md. Changing it is a recorded amendment, never a silent edit.',
      hint    = 'Upgrade the scanner (matrx-mandate-scan) to a version that emits contract v1, or amend the contract in the register first.';
  END IF;

  -- ── (2b) THE PHASE. Absent = the whole report in one call, as before. ────
  v_phase := lower(coalesce(nullif(p_report->>'phase',''), 'full'));
  IF v_phase NOT IN ('full','open','references','finalize') THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = format('UNKNOWN_SUBMIT_PHASE: %s (expected open, references, finalize, or no phase at all for a single-call report).',
                       quote_literal(v_phase)),
      detail  = 'A chunked submission is open → references… → finalize. A misspelled phase is refused rather than silently treated as a full report, because a full report with no references would retire every reference in the repository as absent.';
  END IF;

  -- ── (3) THE REPO MUST BE REGISTERED, BY SLUG ────────────────────────────
  v_repo := p_report->>'repo_slug';
  IF v_repo IS NULL OR NOT EXISTS (SELECT 1 FROM platform.repo r WHERE r.slug = v_repo) THEN
    RAISE EXCEPTION USING
      errcode = '23503',
      message = format('UNKNOWN_REPO_SLUG: %s is not a registered repository.', coalesce(quote_literal(v_repo), '<missing>')),
      detail  = 'platform.repo is the registry of repository identity. A report from an unregistered repository is refused rather than written under a slug nothing else knows, because every board and every check filters by repo.',
      hint    = 'Register the repository in platform.repo (slug + github_full_name) and re-run the check.';
  END IF;

  v_revision := p_report->>'revision';
  v_kind     := p_report->>'revision_kind';
  v_scanner  := p_report->>'scanner_version';

  IF coalesce(v_revision,'') = '' OR coalesce(v_scanner,'') = '' THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = 'INCOMPLETE_REPORT: revision and scanner_version are both required.',
      detail  = 'Facts are per revision, and an unmeasured scanner version is UNMEASURED (DESIGN §4.5 step 1) — neither may be inferred here.';
  END IF;

  IF v_kind NOT IN ('candidate','deployed') THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = format('INVALID_REVISION_KIND: %s (expected candidate or deployed).', coalesce(quote_literal(v_kind),'<missing>'));
  END IF;

  SELECT so.organization_id INTO v_org FROM iam.system_orgs so WHERE so.key = 'system';
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'SYSTEM_ORG_MISSING: iam.system_orgs has no key=''system'' row; every row here is homed in the System Organization and NULL is never a scope.'
      USING errcode = 'P0002';
  END IF;

  -- ═════════════════════════════════════════════════════════════════════
  -- PHASE open / full — THE SCAN ROWS
  -- ═════════════════════════════════════════════════════════════════════
  IF v_phase IN ('full','open') THEN
    FOR v_pkg IN SELECT jsonb_array_elements(coalesce(p_report->'packages', '[]'::jsonb)) LOOP
      v_pkg_path := v_pkg->>'package_path';
      IF coalesce(v_pkg_path,'') = '' THEN
        RAISE EXCEPTION 'INCOMPLETE_REPORT: a package entry has no package_path.' USING errcode = '22023';
      END IF;

      -- DEPLOYED IS EARNED, NEVER ASSERTED (DESIGN §4.5 step 9). A deployed
      -- stamp with nothing complete behind it would let an observer invent
      -- facts about a revision nobody measured. An unfinalized chunked scan is
      -- `incomplete`, so it cannot satisfy this either — no extra clause needed.
      IF v_kind = 'deployed' AND NOT EXISTS (
        SELECT 1 FROM mandate.scan s
        WHERE s.repo_slug = v_repo
          AND s.package_path = v_pkg_path
          AND s.revision = v_revision
          AND s.revision_kind = 'candidate'
          AND s.verification_status = 'complete'
          AND s.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION USING
          errcode = '23514',
          message = format('DEPLOYED_WITHOUT_CANDIDATE: no complete candidate scan exists for %s / %s at revision %s.',
                           v_repo, v_pkg_path, v_revision),
          detail  = 'A deployed stamp records what an observer found on a live surface. Without a complete candidate scan of the same revision there is nothing measured to stamp, so the whole report is refused rather than half-written.',
          hint    = 'Run the candidate scan for this revision first (it must report verification_status=complete), then stamp deployed.';
      END IF;

      -- ═══════════════════════════════════════════════════════════════
      -- THE CONTENT DIGEST (contract amendment 6, 2026-09-21, lane POOL-SAT-2)
      -- ═══════════════════════════════════════════════════════════════
      -- A package whose REFERENCE SET is byte-for-byte the set already accepted
      -- at some earlier revision is not re-written. The digest the scanner sends
      -- is taken over exactly the rows this door would insert, so "the digest
      -- matches" and "the insert would change nothing" are the same sentence.
      --
      -- Measured on the main database, 2026-09-21: aidream's candidate scans
      -- covered 40,030 package-revisions and contained 133 DISTINCT reference
      -- contents. 2,849,000 reference rows were written to record 133 facts —
      -- 99.7% of them a re-statement of a fact the table already held, and the
      -- WAL for those writes was 37 GB in eleven days.
      --
      -- The SCAN row is still written at the new revision, always: the deployed
      -- stamp's DEPLOYED_WITHOUT_CANDIDATE check, the coverage boards and the
      -- finding counts all read `mandate.scan` at a revision, and skipping the
      -- scan row would break every one of them. It is the 3 million REFERENCE
      -- rows that are skipped, and the readers of those
      -- (`reference_identity_latest_idx`, latest-per-identity) are unaffected:
      -- the newest row for each identity is the same row, saying the same thing,
      -- and it now honestly names the revision at which that content was last
      -- NEW rather than the revision that happened to re-send it.
      --
      -- THE ABSENT LEG IS PART OF THE CONTENT. `absent_in_candidate` is computed
      -- against the latest DEPLOYED revision, so a candidate whose own content is
      -- unchanged can still owe a different absent set once the deployed side
      -- moves. The carry-forward therefore also requires that the earlier scan
      -- was reconciled against the SAME deployed revision this submission sees
      -- (`absent_against_revision`), which is recorded at finalize below. When
      -- the deployed side moves, the next candidate scan is NOT carried forward
      -- and the absent leg is recomputed in full.
      v_digest   := nullif(v_pkg->>'content_digest','');
      v_prev_rev := NULL;
      v_cur_dep  := NULL;

      IF v_digest IS NOT NULL
         AND v_kind = 'candidate'
         AND coalesce(v_pkg->>'verification_status', 'complete') = 'complete' THEN
        SELECT s.revision INTO v_cur_dep
        FROM mandate.scan s
        WHERE s.repo_slug = v_repo
          AND s.package_path = v_pkg_path
          AND s.revision_kind = 'deployed'
          AND s.deleted_at IS NULL
        ORDER BY coalesce(s.finished_at, s.created_at) DESC, s.created_at DESC
        LIMIT 1;

        SELECT s.revision INTO v_prev_rev
        FROM mandate.scan s
        WHERE s.repo_slug = v_repo
          AND s.package_path = v_pkg_path
          AND s.revision_kind = v_kind
          AND s.scanner_version = v_scanner
          AND s.content_digest = v_digest
          AND s.verification_status = 'complete'
          AND s.unchanged_from_revision IS NULL
          AND s.revision <> v_revision
          AND s.absent_against_revision IS NOT DISTINCT FROM v_cur_dep
          AND s.deleted_at IS NULL
        ORDER BY coalesce(s.finished_at, s.created_at) DESC, s.created_at DESC
        LIMIT 1;
      END IF;

      INSERT INTO mandate.scan (
        repo_slug, package_path, package_name, revision, revision_kind, scanner_version,
        languages, coverage, verification_status, finding_counts, observer,
        started_at, finished_at, expected_chunk_count, received_chunks, organization_id,
        content_digest, unchanged_from_revision, absent_against_revision)
      VALUES (
        v_repo, v_pkg_path, v_pkg->>'package_name', v_revision, v_kind, v_scanner,
        coalesce(
          (SELECT array_agg(x)::text[] FROM jsonb_array_elements_text(coalesce(v_pkg->'languages','[]'::jsonb)) AS t(x)),
          '{}'::text[]),
        coalesce(v_pkg->'coverage', '{}'::jsonb),
        -- AN UNFINALIZED SCAN IS NOT A MEASURED SCAN. This one line is what
        -- keeps DEPLOYED_WITHOUT_CANDIDATE and the admin board honest about a
        -- chunked submission without either of them learning a new concept.
        CASE WHEN v_prev_rev IS NOT NULL THEN 'complete'
             WHEN v_phase = 'open' THEN 'incomplete'
             ELSE coalesce(v_pkg->>'verification_status', 'incomplete') END,
        coalesce(v_pkg->'finding_counts', '{}'::jsonb),
        p_report->>'observer',
        nullif(p_report->>'started_at','')::timestamptz,
        nullif(p_report->>'finished_at','')::timestamptz,
        CASE WHEN v_prev_rev IS NOT NULL THEN 0
             WHEN v_phase = 'open' THEN nullif(v_pkg->>'chunk_count','')::integer
             ELSE NULL END,
        '{}'::integer[],
        v_org,
        v_digest,
        v_prev_rev,
        CASE WHEN v_prev_rev IS NOT NULL THEN v_cur_dep ELSE NULL END)
      ON CONFLICT (repo_slug, package_path, revision, revision_kind, scanner_version)
      DO UPDATE SET
        package_name         = excluded.package_name,
        languages            = excluded.languages,
        coverage             = excluded.coverage,
        verification_status  = excluded.verification_status,
        finding_counts       = excluded.finding_counts,
        observer             = excluded.observer,
        started_at           = excluded.started_at,
        finished_at          = excluded.finished_at,
        expected_chunk_count = excluded.expected_chunk_count,
        -- Re-opening restarts the ledger: a resubmission's chunks are ITS
        -- chunks, and a stale number left behind would let a short second run
        -- finalize on the first run's receipts.
        received_chunks      = '{}'::integer[],
        -- A resubmission REPLACES these three. A package that changed must not
        -- inherit a stale "unchanged" pointer from an earlier submission at the
        -- same revision, and a package that is now unchanged must not keep an
        -- old digest.
        content_digest          = excluded.content_digest,
        unchanged_from_revision = excluded.unchanged_from_revision,
        absent_against_revision = excluded.absent_against_revision
      RETURNING id INTO v_scan_id;

      v_scans    := v_scans + 1;
      v_scan_ids := v_scan_ids || jsonb_build_object(v_pkg_path, v_scan_id);

      -- UNCHANGED: the scan row is written, the references are not. The caller
      -- reads `unchanged` from this answer and skips the reference batches and
      -- the finalize entry for this package entirely.
      IF v_prev_rev IS NOT NULL THEN
        v_unchanged := v_unchanged || jsonb_build_array(v_pkg_path);
        CONTINUE;
      END IF;

      IF v_phase = 'full' THEN
        v_batches := v_batches || jsonb_build_array(jsonb_build_object(
          'scan_id',      v_scan_id,
          'package_path', v_pkg_path,
          'package_name', v_pkg->>'package_name',
          'references',   coalesce(v_pkg->'references', '[]'::jsonb)));
      END IF;
    END LOOP;
  END IF;

  -- ═════════════════════════════════════════════════════════════════════
  -- PHASE references — ONE NUMBERED BATCH UNDER AN ALREADY-OPEN SCAN
  -- ═════════════════════════════════════════════════════════════════════
  IF v_phase = 'references' THEN
    v_pkg_path := p_report->>'package_path';
    v_chunk    := nullif(p_report->>'chunk_index','')::integer;
    IF coalesce(v_pkg_path,'') = '' OR v_chunk IS NULL OR v_chunk < 0 THEN
      RAISE EXCEPTION USING
        errcode = '22023',
        message = 'INCOMPLETE_CHUNK: a references batch needs package_path and a chunk_index >= 0.',
        detail  = 'The chunk NUMBER is what makes a missing batch nameable at finalize. A batch with no number could only ever be counted, and a count cannot say which one is missing.';
    END IF;

    SELECT s.id INTO v_scan_id
    FROM mandate.scan s
    WHERE s.repo_slug = v_repo AND s.package_path = v_pkg_path
      AND s.revision = v_revision AND s.revision_kind = v_kind
      AND s.scanner_version = v_scanner AND s.deleted_at IS NULL;

    IF v_scan_id IS NULL THEN
      RAISE EXCEPTION USING
        errcode = 'P0002',
        message = format('CHUNK_WITHOUT_OPEN: no open scan for %s / %s at %s (%s, scanner %s).',
                         v_repo, v_pkg_path, v_revision, v_kind, v_scanner),
        detail  = 'A references batch names the scan it belongs to. Writing one under a scan that was never opened would produce references nothing can finalize, count or retire.',
        hint    = 'Send the open phase for this package first.';
    END IF;

    -- AN IDENTICAL DIGEST IS REFUSED THE CHEAP WAY: A NO-OP THAT SAYS SO.
    -- The open phase already told this caller the package was unchanged. A
    -- batch arriving anyway is an old scanner, a retry, or a race; writing it
    -- would restore exactly the duplication this door exists to stop, and
    -- RAISEing would fail a release over a report that is already complete.
    -- So the batch is dropped, named in `unchanged`, and the scan stays
    -- complete — the cheapest of the three, and the only one that is both
    -- honest and non-blocking (D23).
    SELECT s.unchanged_from_revision INTO v_prev_rev
    FROM mandate.scan s WHERE s.id = v_scan_id;

    IF v_prev_rev IS NOT NULL THEN
      RETURN jsonb_build_object(
        'contract_version',   1,
        'phase',              v_phase,
        'repo_slug',          v_repo,
        'revision',           v_revision,
        'revision_kind',      v_kind,
        'scanner_version',    v_scanner,
        'scans_written',      0,
        'scan_ids',           jsonb_build_object(v_pkg_path, v_scan_id),
        'references_written', 0,
        'marked_absent_in_candidate', 0,
        'unchanged',          jsonb_build_array(v_pkg_path),
        'findings',           '{}'::jsonb);
    END IF;

    v_batches := jsonb_build_array(jsonb_build_object(
      'scan_id',      v_scan_id,
      'package_path', v_pkg_path,
      'package_name', p_report->>'package_name',
      'references',   coalesce(p_report->'references', '[]'::jsonb)));

    UPDATE mandate.scan s
       SET received_chunks = ARRAY(SELECT DISTINCT g FROM unnest(s.received_chunks || v_chunk) AS g ORDER BY g)
     WHERE s.id = v_scan_id;

    v_scan_ids := jsonb_build_object(v_pkg_path, v_scan_id);
  END IF;

  -- ═════════════════════════════════════════════════════════════════════
  -- THE REFERENCE WRITER — ONE COPY, BOTH PATHS
  -- ═════════════════════════════════════════════════════════════════════
  -- The single-call path put every package in v_batches; the chunked path put
  -- exactly one batch there. Everything below runs identically for both, which
  -- is the point: an invariant written twice is two invariants.
  FOR v_batch IN SELECT jsonb_array_elements(v_batches) LOOP
    v_refs     := v_batch->'references';
    v_scan_id  := (v_batch->>'scan_id')::uuid;
    v_pkg_path := v_batch->>'package_path';
    v_pkg_name := v_batch->>'package_name';

    CONTINUE WHEN v_refs IS NULL
               OR jsonb_typeof(v_refs) <> 'array'
               OR jsonb_array_length(v_refs) = 0;

    -- (a) AN UNKNOWN REFERENCE TYPE IS A LOUD SCANNER ERROR, NEVER AN INSERT.
    -- Checked over the whole batch BEFORE anything is written, so the refusal
    -- is still all-or-nothing exactly as the row-by-row door's RAISE was.
    SELECT x.reference_type INTO v_bad
    FROM jsonb_to_recordset(v_refs) AS x(reference_type text)
    WHERE NOT EXISTS (
      SELECT 1 FROM platform.categories c
      WHERE c.dimension = 'mandate_reference_type'
        AND c.slug = x.reference_type
        AND c.deleted_at IS NULL)
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION USING
        errcode = '23503',
        message = format('UNKNOWN_REFERENCE_TYPE: %s is not a value of the mandate_reference_type vocabulary.',
                         coalesce(quote_literal(v_bad), '<missing>')),
        detail  = 'Classification is by carrier (DESIGN §3.8). An unknown type is a LOUD SCANNER ERROR, never an insert — a row filed under a made-up type would be evidence nobody can read.',
        hint    = 'Fix the scanner, or add the value to the platform.categories dimension mandate_reference_type in a migration and amend the register''s frozen contract.';
    END IF;

    -- (b) A REPORT MAY ONLY WRITE ROWS FOR THE REPO IT NAMES (DESIGN §4.3).
    SELECT x.repo_slug INTO v_bad
    FROM jsonb_to_recordset(v_refs) AS x(repo_slug text)
    WHERE x.repo_slug IS NOT NULL AND x.repo_slug <> v_repo
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION USING
        errcode = '42501',
        message = format('REPORT_REPO_MISMATCH: a report from %s tried to write a reference for %s.', v_repo, v_bad),
        detail  = 'Reference identity is computed with the repo the scan ran in. A report that could write another repository''s rows could silently retire them.';
    END IF;

    -- (c) IDENTITY IS THE WHOLE POINT — a reference without one cannot be
    -- reconciled at the next revision, so it is refused rather than written.
    PERFORM 1
    FROM jsonb_to_recordset(v_refs) AS x(identity_hash text)
    WHERE coalesce(x.identity_hash, '') = ''
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'INCOMPLETE_REPORT: a reference entry has no identity_hash.' USING errcode = '22023';
    END IF;

    -- THE WRITE. One statement per batch, where there used to be three per row.
    --   · DISTINCT ON (identity_hash) … ORDER BY ord DESC keeps the row-by-row
    --     door's behaviour when a payload names the same identity twice (the
    --     LAST one won, because each loop iteration upserted over the previous).
    --     A set-based ON CONFLICT without it would raise 21000 "cannot affect
    --     row a second time" — a duplicate in the payload is the scanner's
    --     problem to report, never a reason to refuse the whole repository.
    --   · mandate_id is still RE-RESOLVED from mandate_key on every submit: the
    --     key is the durable link, the id a convenience for the hot-path join.
    --     A plain LEFT JOIN is exact here because definition_mandate_key_uq is
    --     UNIQUE (mandate_key) WHERE deleted_at IS NULL — at most one live row
    --     per key, so the old `ORDER BY created_at ASC LIMIT 1` had nothing to
    --     choose between. (If that index were ever dropped, the DISTINCT ON
    --     above still collapses the fan-out; it cannot corrupt.)
    --   · occurrence_n / line are read as text and nullif-cast, byte for byte
    --     what `nullif(v_ref->>'occurrence_n','')::integer` did.
    INSERT INTO mandate.reference (
      identity_hash, mandate_key, mandate_id, reference_type_id, repo_slug,
      package_path, package_name, language, file_path, symbol, occurrence_n, line,
      scan_id, revision_kind, revision, presence, flag, caller_identity_hash, organization_id)
    SELECT
      s.identity_hash, s.mandate_key, s.mandate_id, s.reference_type_id, s.repo_slug,
      s.package_path, v_pkg_name, s.language, s.file_path, s.symbol, s.occurrence_n, s.line,
      v_scan_id, v_kind, v_revision, 'present', s.flag, s.caller_identity_hash, v_org
    FROM (
      SELECT DISTINCT ON (x.identity_hash)
        x.identity_hash                                                 AS identity_hash,
        coalesce(x.mandate_key, '')                                     AS mandate_key,
        d.id                                                            AS mandate_id,
        c.id                                                            AS reference_type_id,
        -- `db_authored` rows are the one legitimate repo-less class
        -- (DESIGN §4.1); everything else defaults to the reporting repo.
        -- A foreign slug was already refused above.
        CASE WHEN x.reference_type = 'db_authored' THEN x.repo_slug
             ELSE coalesce(x.repo_slug, v_repo) END                     AS repo_slug,
        coalesce(x.package_path, v_pkg_path)                            AS package_path,
        x.language                                                      AS language,
        x.file_path                                                     AS file_path,
        x.symbol                                                        AS symbol,
        nullif(x.occurrence_n, '')::integer                             AS occurrence_n,
        nullif(x.line, '')::integer                                     AS line,
        coalesce(nullif(x.flag, ''), 'ok')                              AS flag,
        x.caller_identity_hash                                          AS caller_identity_hash
      FROM ROWS FROM (
        jsonb_to_recordset(v_refs) AS (
          identity_hash        text,
          mandate_key          text,
          reference_type       text,
          repo_slug            text,
          package_path         text,
          language             text,
          file_path            text,
          symbol               text,
          occurrence_n         text,
          line                 text,
          flag                 text,
          caller_identity_hash text)
      ) WITH ORDINALITY AS x(
          identity_hash, mandate_key, reference_type, repo_slug, package_path,
          language, file_path, symbol, occurrence_n, line, flag,
          caller_identity_hash, ord)
      JOIN platform.categories c
        ON c.dimension = 'mandate_reference_type'
       AND c.slug = x.reference_type
       AND c.deleted_at IS NULL
      LEFT JOIN mandate.definition d
        ON d.mandate_key = x.mandate_key
       AND d.deleted_at IS NULL
      ORDER BY x.identity_hash, x.ord DESC
    ) s
    ON CONFLICT (identity_hash, revision_kind, revision)
    DO UPDATE SET
      mandate_key          = excluded.mandate_key,
      mandate_id           = excluded.mandate_id,
      reference_type_id    = excluded.reference_type_id,
      repo_slug            = excluded.repo_slug,
      package_path         = excluded.package_path,
      package_name         = excluded.package_name,
      language             = excluded.language,
      file_path            = excluded.file_path,
      symbol               = excluded.symbol,
      occurrence_n         = excluded.occurrence_n,
      line                 = excluded.line,
      scan_id              = excluded.scan_id,
      presence             = 'present',
      flag                 = excluded.flag,
      caller_identity_hash = excluded.caller_identity_hash;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_written := v_written + v_n;
  END LOOP;

  -- ═════════════════════════════════════════════════════════════════════
  -- PHASE finalize / full — CHUNK PROOF, STATUS, PRESENCE, SUMMARY
  -- ═════════════════════════════════════════════════════════════════════
  IF v_phase IN ('full','finalize') THEN
    FOR v_pkg IN SELECT jsonb_array_elements(coalesce(p_report->'packages', '[]'::jsonb)) LOOP
      v_pkg_path := v_pkg->>'package_path';
      IF coalesce(v_pkg_path,'') = '' THEN
        RAISE EXCEPTION 'INCOMPLETE_REPORT: a package entry has no package_path.' USING errcode = '22023';
      END IF;

      SELECT s.id, s.expected_chunk_count, s.received_chunks, s.unchanged_from_revision
        INTO v_scan_id, v_expected, v_received, v_prev_rev
      FROM mandate.scan s
      WHERE s.repo_slug = v_repo AND s.package_path = v_pkg_path
        AND s.revision = v_revision AND s.revision_kind = v_kind
        AND s.scanner_version = v_scanner AND s.deleted_at IS NULL;

      IF v_scan_id IS NULL THEN
        RAISE EXCEPTION USING
          errcode = 'P0002',
          message = format('FINALIZE_WITHOUT_OPEN: no scan for %s / %s at %s (%s, scanner %s).',
                           v_repo, v_pkg_path, v_revision, v_kind, v_scanner),
          hint    = 'Send the open phase (and the reference batches) before finalizing.';
      END IF;

      -- UNCHANGED: nothing to close and nothing to reconcile. The scan row is
      -- already `complete`, its references are the ones at
      -- `unchanged_from_revision`, and the absent leg below must NOT run —
      -- with no candidate rows at this revision it would mark every reference
      -- of the package `absent_in_candidate`, which is the exact lie this
      -- door's own chunk ledger exists to prevent: code that exists reported
      -- as code that was removed.
      IF v_prev_rev IS NOT NULL THEN
        v_unchanged := v_unchanged || jsonb_build_array(v_pkg_path);
        CONTINUE;
      END IF;

      IF v_phase = 'finalize' THEN
        -- A SCAN WITH A MISSING BATCH IS NEVER CLOSED, AND THE ERROR NAMES THE
        -- BATCH. Silently finalizing would publish a smaller reference set as a
        -- COMPLETE measurement — and every reference the lost batch carried
        -- would be computed `absent_in_candidate` at the next deploy, i.e. the
        -- board would report code that exists as code that was removed.
        IF v_expected IS NOT NULL THEN
          v_missing := ARRAY(
            SELECT g FROM generate_series(0, v_expected - 1) AS g
            WHERE NOT (g = ANY (coalesce(v_received, '{}'::integer[])))
            ORDER BY g);
          IF coalesce(array_length(v_missing, 1), 0) > 0 THEN
            RAISE EXCEPTION USING
              errcode = '23514',
              message = format('INCOMPLETE_CHUNKED_SUBMISSION: %s / %s at %s is missing reference batch(es) %s of %s (received %s).',
                               v_repo, v_pkg_path, v_revision, v_missing::text, v_expected,
                               coalesce(v_received, '{}'::integer[])::text),
              detail  = 'Every numbered batch of a chunked report must arrive before the scan may be called measured. Finalizing without them would record a partial reference set as complete, and the next deployed stamp would read the absent ones as code that had been removed.',
              hint    = 'Re-send the listed batch(es) with the same repo, revision, scanner_version and package_path, then finalize again. Re-sending an already-received batch is safe — the ledger is a set.';
          END IF;
        END IF;

        UPDATE mandate.scan s SET
          package_name        = v_pkg->>'package_name',
          languages           = coalesce(
            (SELECT array_agg(x)::text[] FROM jsonb_array_elements_text(coalesce(v_pkg->'languages','[]'::jsonb)) AS t(x)),
            '{}'::text[]),
          coverage            = coalesce(v_pkg->'coverage', '{}'::jsonb),
          verification_status = coalesce(v_pkg->>'verification_status', 'incomplete'),
          finding_counts      = coalesce(v_pkg->'finding_counts', '{}'::jsonb),
          observer            = p_report->>'observer',
          started_at          = nullif(p_report->>'started_at','')::timestamptz,
          finished_at         = nullif(p_report->>'finished_at','')::timestamptz
        WHERE s.id = v_scan_id;

        v_scans    := v_scans + 1;
        v_scan_ids := v_scan_ids || jsonb_build_object(v_pkg_path, v_scan_id);

        SELECT count(*) INTO v_n
        FROM mandate.reference r
        WHERE r.scan_id = v_scan_id AND r.presence = 'present' AND r.deleted_at IS NULL;
        v_written := v_written + v_n;
      END IF;

      -- ── PRESENCE IS COMPUTED, NOTHING IS EVER DELETED (§4.5 step 4) ──────
      -- A reference present at the latest deployed revision and absent from
      -- this candidate is recorded AT THE CANDIDATE REVISION as
      -- absent_in_candidate. The deployed row is never touched: `removed` is a
      -- fact about a deployed revision, and a rollback must recompute rather
      -- than resurrect.
      --
      -- The "absent from this candidate" test is now a NOT EXISTS against
      -- reference_identity_revision_uq instead of `= ANY (<array built in the
      -- loop>)`. Two reasons, and the second is the one that matters: a plpgsql
      -- parameter array is never a Const, so Postgres cannot hash it into a
      -- ScalarArrayOpExpr and scanned it linearly per candidate row (db-rules
      -- §6d) — AND an in-memory array can only describe the references THIS
      -- CALL saw, which in a chunked submission would mark every batch but the
      -- last as removed. Reading the candidate rows back is correct for both.
      IF v_kind = 'candidate' THEN
        SELECT s.revision INTO v_deployed
        FROM mandate.scan s
        WHERE s.repo_slug = v_repo
          AND s.package_path = v_pkg_path
          AND s.revision_kind = 'deployed'
          AND s.deleted_at IS NULL
        ORDER BY coalesce(s.finished_at, s.created_at) DESC, s.created_at DESC
        LIMIT 1;

        -- WHAT THE ABSENT LEG WAS COMPUTED AGAINST. A later submission of the
        -- same content may only be carried forward while this has not moved.
        UPDATE mandate.scan s SET absent_against_revision = v_deployed
         WHERE s.id = v_scan_id;

        IF v_deployed IS NOT NULL THEN
          INSERT INTO mandate.reference (
            identity_hash, mandate_key, mandate_id, reference_type_id, repo_slug,
            package_path, package_name, language, file_path, symbol, occurrence_n, line,
            scan_id, revision_kind, revision, presence, flag, caller_identity_hash, organization_id)
          SELECT
            r.identity_hash, r.mandate_key, r.mandate_id, r.reference_type_id, r.repo_slug,
            r.package_path, r.package_name, r.language, r.file_path, r.symbol, r.occurrence_n, r.line,
            v_scan_id, 'candidate', v_revision, 'absent_in_candidate', r.flag, r.caller_identity_hash, v_org
          FROM mandate.reference r
          WHERE r.repo_slug = v_repo
            AND r.package_path = v_pkg_path
            AND r.revision_kind = 'deployed'
            AND r.revision = v_deployed
            AND r.presence = 'present'
            AND r.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM mandate.reference cur
              WHERE cur.identity_hash = r.identity_hash
                AND cur.revision_kind = 'candidate'
                AND cur.revision = v_revision)
          ON CONFLICT (identity_hash, revision_kind, revision)
          DO UPDATE SET presence = 'absent_in_candidate', scan_id = excluded.scan_id;

          GET DIAGNOSTICS v_n = ROW_COUNT;
          v_absent := v_absent + v_n;
        END IF;
      END IF;
    END LOOP;

    -- ── THE FINDING SUMMARY (DESIGN §4.5 steps 2, 5, 7) ───────────────────
    -- UNKNOWN_MANDATE: a reference this report just wrote that maps to no live
    -- mandate — by exact key, or by family prefix for a family carrier — and is
    -- not one of the classes that legitimately names no single live mandate.
    -- Semantics unchanged; it now reaches this revision's rows through
    -- reference_repo_revision_idx instead of every row of the repository.
    SELECT count(*) INTO v_unknown
    FROM mandate.reference r
    JOIN platform.categories c ON c.id = r.reference_type_id
    WHERE r.repo_slug = v_repo
      AND r.revision_kind = v_kind
      AND r.revision = v_revision
      AND r.presence = 'present'
      AND r.deleted_at IS NULL
      AND r.mandate_id IS NULL
      AND c.slug NOT IN ('db_authored','passthrough','user_selected_agent','seed_holder','bypass','unclassified')
      AND NOT EXISTS (
        SELECT 1 FROM mandate.definition d
        WHERE d.deleted_at IS NULL
          AND left(d.mandate_key, length(r.mandate_key) + 1) = r.mandate_key || '.'
      );

    -- ORPHAN_DECLARATION: a code-owned mandate with no declaration reference in
    -- ANY complete scan. D21 — it stays in the inventory with a red flag.
    --
    -- SAME ANSWER, DERIVED ONCE. The old body asked the 2.2 M-row reference
    -- table this question once per code mandate — 422 correlated NOT EXISTS
    -- scans, 14,687 ms, and no index can answer
    -- `left(d.mandate_key, length(r.mandate_key)+1) = r.mandate_key || '.'`.
    -- The question is really "is any ANCESTOR-OR-SELF prefix of this key a
    -- declared key?", and a prefix test is a SET MEMBERSHIP test: expand each
    -- dotted key into its prefixes and hash-join the 363-key declaration set.
    -- 14,687 ms → 1,102 ms, verified head to head on live data: 34 = 34.
    WITH decl AS MATERIALIZED (
      SELECT DISTINCT r.mandate_key AS key
      FROM mandate.reference r
      JOIN platform.categories c ON c.id = r.reference_type_id
      JOIN mandate.scan s ON s.id = r.scan_id
      WHERE c.slug IN ('declaration','family_declaration')
        AND s.verification_status = 'complete'
        AND s.deleted_at IS NULL
        AND r.presence = 'present'
        AND r.deleted_at IS NULL
    ), code_def AS (
      SELECT d.id, string_to_array(d.mandate_key, '.') AS parts
      FROM mandate.definition d
      WHERE d.deleted_at IS NULL AND d.origin = 'code'
    ), def_prefix AS (
      SELECT cd.id, array_to_string(cd.parts[1:i], '.') AS key
      FROM code_def cd, generate_series(1, cardinality(cd.parts)) AS i
    ), covered AS (
      SELECT DISTINCT dp.id FROM def_prefix dp JOIN decl ON decl.key = dp.key
    )
    SELECT count(*) INTO v_orphan
    FROM code_def cd
    WHERE NOT EXISTS (SELECT 1 FROM covered cv WHERE cv.id = cd.id);

    -- STALE_DB_REFERENCE: a database column naming a key that no longer exists.
    SELECT count(*) INTO v_stale
    FROM mandate.definition d
    WHERE d.deleted_at IS NULL
      AND coalesce(d.fallback_mandate_key,'') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM mandate.definition e
        WHERE e.deleted_at IS NULL AND e.mandate_key = d.fallback_mandate_key
      );
  END IF;

  RETURN jsonb_build_object(
    'contract_version',   1,
    'phase',              v_phase,
    'repo_slug',          v_repo,
    'revision',           v_revision,
    'revision_kind',      v_kind,
    'scanner_version',    v_scanner,
    'scans_written',      v_scans,
    'scan_ids',           v_scan_ids,
    'references_written', v_written,
    'marked_absent_in_candidate', v_absent,
    'unchanged',          v_unchanged,
    'findings', CASE WHEN v_phase IN ('full','finalize')
      THEN jsonb_build_object(
        'UNKNOWN_MANDATE',     v_unknown,
        'ORPHAN_DECLARATION',  v_orphan,
        'STALE_DB_REFERENCE',  v_stale)
      ELSE '{}'::jsonb END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION platform.admin_db_cron_job_update(p_jobid bigint, p_schedule text DEFAULT NULL::text, p_active boolean DEFAULT NULL::boolean, p_taxonomy_node_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_job cron.job%rowtype;
begin
  select * into v_job from cron.job where jobid = p_jobid;
  if not found then
    raise exception 'no pg_cron job with jobid %', p_jobid using errcode = 'P0002';
  end if;

  if p_taxonomy_node_id is not null then
    if not exists (
      select 1
        from platform.taxonomy_node
       where id = p_taxonomy_node_id
         and status in ('canonical', 'proposed')
    ) then
      raise exception 'taxonomy node % is not active', p_taxonomy_node_id
        using errcode = '23503';
    end if;

    update platform.taxonomy_node n
       set anchors = jsonb_set(
         coalesce(n.anchors, '{}'::jsonb),
         '{db_cron_jobs}',
         coalesce(
           (
             select jsonb_agg(value)
               from jsonb_array_elements_text(
                 coalesce(n.anchors->'db_cron_jobs', '[]'::jsonb)
               ) value
              where value <> v_job.jobname
           ),
           '[]'::jsonb
         ),
         true
       )
     where coalesce(n.anchors->'db_cron_jobs', '[]'::jsonb) ? v_job.jobname;

    update platform.taxonomy_node n
       set anchors = jsonb_set(
         coalesce(n.anchors, '{}'::jsonb),
         '{db_cron_jobs}',
         coalesce(n.anchors->'db_cron_jobs', '[]'::jsonb) || to_jsonb(v_job.jobname),
         true
       )
     where n.id = p_taxonomy_node_id;
  end if;

  if p_schedule is not null or p_active is not null then
    perform cron.alter_job(
      job_id => p_jobid,
      schedule => p_schedule,
      active => p_active
    );
  end if;

  select * into v_job from cron.job where jobid = p_jobid;
  return jsonb_build_object(
    'jobid', v_job.jobid,
    'jobname', v_job.jobname,
    'schedule', v_job.schedule,
    'command', v_job.command,
    'active', v_job.active,
    'taxonomy_node_id', (
      select n.id::text
        from platform.taxonomy_node n
       where n.status in ('canonical', 'proposed')
         and coalesce(n.anchors->'db_cron_jobs', '[]'::jsonb) ? v_job.jobname
       limit 1
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION platform.admin_db_cron_job_update(p_jobid bigint, p_schedule text DEFAULT NULL::text, p_active boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_job cron.job%rowtype;
begin
  select * into v_job from cron.job where jobid = p_jobid;
  if not found then
    raise exception 'no pg_cron job with jobid %', p_jobid using errcode = 'P0002';
  end if;

  perform cron.alter_job(
    job_id => p_jobid,
    schedule => p_schedule,
    active => p_active
  );

  select * into v_job from cron.job where jobid = p_jobid;
  return jsonb_build_object(
    'jobid', v_job.jobid,
    'jobname', v_job.jobname,
    'schedule', v_job.schedule,
    'command', v_job.command,
    'active', v_job.active
  );
end;
$function$;

CREATE OR REPLACE FUNCTION platform.knob_unarchive(p_feature text, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'platform', 'public'
AS $function$
declare
  v_row platform.feature_knob%rowtype;
begin
  if not public.is_admin() then
    raise exception 'platform.knob_unarchive: bringing a registration back is a platform-admin act'
      using errcode = '42501';
  end if;

  select * into v_row from platform.feature_knob where feature = p_feature and key = p_key;
  if v_row.feature is null then
    raise exception 'platform.knob_unarchive: %.% is not a registered knob', p_feature, p_key
      using errcode = 'P0002';
  end if;
  if v_row.archived_at is null then
    return jsonb_build_object('outcome', 'already_live', 'feature', p_feature, 'key', p_key);
  end if;

  update platform.feature_knob
     set archived_at = null, archived_reason = null, archived_by = null, updated_at = now()
   where feature = p_feature and key = p_key;

  return jsonb_build_object('outcome', 'live_again', 'feature', p_feature, 'key', p_key);
end;
$function$;

CREATE OR REPLACE FUNCTION platform.lifecycle_file_custody_finalize_delete(p_file_id uuid, p_operation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'platform', 'files', 'communication', 'pg_temp'
AS $function$
DECLARE v_preflight jsonb;
BEGIN
  -- preflight takes policy-table SHARE then file FOR UPDATE.  It remains held
  -- by the caller's transaction across S3 and this final DELETE.
  v_preflight := platform.lifecycle_file_custody_preflight(p_file_id, p_operation_id);
  IF coalesce((v_preflight->>'already_deleted')::boolean, false) THEN RETURN true; END IF;
  DELETE FROM files.files WHERE id = p_file_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'file custody finalization lost its locked file row' USING errcode='P0002';
  END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION platform.lifecycle_meet_custody_stage(p_file_id uuid, p_recording_id uuid, p_operation_id uuid, p_policy_id uuid, p_policy_updated_at timestamp with time zone, p_due_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'platform', 'files', 'communication', 'pg_temp'
AS $function$
DECLARE
  v_file files.files%ROWTYPE;
  v_recording communication.meet_recordings%ROWTYPE;
  v_policy jsonb;
  v_policy_id uuid;
  v_policy_updated_at timestamptz;
  v_due_at timestamptz;
  v_now timestamptz := now();
BEGIN
  -- Take this before either file/recording row lock.  Every policy writer takes
  -- ROW EXCLUSIVE automatically, so this also serializes a newly created hold.
  LOCK TABLE platform.retention_policy IN SHARE MODE;

  SELECT * INTO v_file FROM files.files WHERE id = p_file_id FOR UPDATE;
  IF NOT FOUND OR v_file.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'file custody file unavailable' USING errcode='P0002';
  END IF;
  SELECT * INTO v_recording FROM communication.meet_recordings WHERE id = p_recording_id FOR UPDATE;
  IF NOT FOUND OR v_recording.state IS DISTINCT FROM 'available' OR v_recording.file_id IS DISTINCT FROM p_file_id THEN
    RAISE EXCEPTION 'Meet recording is no longer available on file' USING errcode='23503';
  END IF;
  IF v_file.metadata #>> '{external_object_custody,source_kind}' IS DISTINCT FROM 'meet_room_recording'
     OR v_file.metadata #>> '{external_object_custody,retention_policy}' IS DISTINCT FROM 'meet_recordings_30d'
     OR v_file.metadata #>> '{external_object_custody,retention_expires_at}' IS NULL
     OR v_file.metadata #>> '{external_object_custody,adopted_at}' IS NULL
     OR v_file.metadata #>> '{external_object_custody,source_event_key_hash}' IS DISTINCT FROM
        encode(extensions.digest(convert_to(
          format('livekit:meet-recording:%s:%s:ended', v_recording.meeting_id, v_recording.id), 'utf8'
        ), 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'file custody does not bind the exact Meet recording evidence' USING errcode='23503';
  END IF;

  -- Re-resolve under the policy-table lock; caller evidence is a compare-only
  -- optimistic token, never authority to stage an outdated policy decision.
  v_policy := platform.resolve_retention_policy('file', v_file.organization_id, v_file.created_by);
  IF v_policy->>'reason' = 'legal_hold' OR v_policy->>'mode' IS DISTINCT FROM 'purge'
     OR v_policy->>'retention_days' IS NULL OR v_policy->>'policy_id' IS NULL THEN
    RAISE EXCEPTION 'file custody stage refused by current policy/hold' USING errcode='22023';
  END IF;
  v_policy_id := (v_policy->>'policy_id')::uuid;
  SELECT updated_at INTO v_policy_updated_at
    FROM platform.retention_policy WHERE id = v_policy_id;
  v_due_at := (v_file.metadata #>> '{external_object_custody,adopted_at}')::timestamptz
    + make_interval(days => (v_policy->>'retention_days')::integer);
  IF v_now < v_due_at THEN
    RAISE EXCEPTION 'file custody stage is no longer due under the current policy' USING errcode='22023';
  END IF;
  IF p_policy_id IS DISTINCT FROM v_policy_id
     OR p_policy_updated_at IS DISTINCT FROM v_policy_updated_at
     OR p_due_at IS DISTINCT FROM v_due_at THEN
    RAISE EXCEPTION 'file custody stage caller policy receipt is stale' USING errcode='22023';
  END IF;

  PERFORM platform.lifecycle_file_custody_assert_no_references(p_file_id, p_recording_id);
  UPDATE communication.meet_recordings SET state = 'expired', file_id = NULL,
    metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{retention}', jsonb_build_object(
      'operation_id', p_operation_id, 'policy_id', v_policy_id,
      'policy_updated_at', v_policy_updated_at, 'phase', 'expired',
      'due_at', v_due_at, 'expired_at', v_now), true)
  WHERE id = p_recording_id;
  UPDATE files.files SET deleted_at = v_now,
    metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{lifecycle}', jsonb_build_object(
      'operation_id', p_operation_id, 'policy_id', v_policy_id,
      'policy_updated_at', v_policy_updated_at, 'phase', 'purge_pending',
      'storage_uri', v_file.storage_uri, 'due_at', v_due_at, 'expired_at', v_now), true)
  WHERE id = p_file_id;
  RETURN jsonb_build_object('file_id', p_file_id, 'storage_uri', v_file.storage_uri,
    'operation_id', p_operation_id);
END;
$function$;

CREATE OR REPLACE FUNCTION platform.provision_grant_open(p_organization_id uuid, p_schema_name text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor  uuid := auth.uid();
  v_by     text := coalesce(auth.uid()::text, current_setting('role', true), session_user);
  v_legal  boolean;
  v_reopen boolean;
begin
  perform platform.provision_grant_assert_operator('opening a schema to an organization');

  if p_organization_id is null then
    raise exception 'provision_grant_open: p_organization_id is required — a grant with no '
                    'organization would open the schema to nobody and read as success.'
      using errcode = '22023';
  end if;
  if btrim(coalesce(p_schema_name, '')) = '' then
    raise exception 'provision_grant_open: p_schema_name is required.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 20 then
    raise exception 'provision_grant_open: p_reason must say, in at least 20 characters, why '
                    'this organization may create tables in %L. The reason is the only thing '
                    'a later reader has.', p_schema_name
      using errcode = '22023';
  end if;

  if not exists (select 1 from iam.organizations o where o.id = p_organization_id) then
    raise exception 'provision_grant_open: no such organization.' using errcode = 'P0002';
  end if;

  select true into v_legal
    from platform.provision_legal_schemas(null) s
   where s.schema_name = p_schema_name;
  if not coalesce(v_legal, false) then
    raise exception 'provision_grant_open: %L is not a schema this platform may provision '
                    'into. A schema is legal only when BOTH repository generate lists carry '
                    'it (aidream db/matrx_orm.yaml and matrx-frontend package.json db-types); '
                    'otherwise a table created there is invisible to every model, type and '
                    'registry. Legal schemas: %.',
                    p_schema_name,
                    (select string_agg(s.schema_name, ', ' order by s.schema_name)
                       from platform.provision_legal_schemas(null) s)
      using errcode = 'check_violation';
  end if;

  select (g.revoked_at is not null) into v_reopen
    from platform.provision_grant g
   where g.organization_id = p_organization_id and g.schema_name = p_schema_name;

  insert into platform.provision_grant
    (organization_id, schema_name, granted_by, granted_at, reason)
  values (p_organization_id, p_schema_name, v_by, now(), btrim(p_reason))
  on conflict (organization_id, schema_name) do update
    set granted_by = excluded.granted_by,
        granted_at = excluded.granted_at,
        reason = excluded.reason,
        revoked_at = null, revoked_by = null, revoked_reason = null;

  insert into platform.activity_log (organization_id, action, actor_id, metadata)
  values (p_organization_id,
          case when coalesce(v_reopen, false) then 'provision_grant.reopened'
               else 'provision_grant.opened' end,
          v_actor,
          jsonb_build_object('schema_name', p_schema_name, 'reason', btrim(p_reason),
                             'by', v_by));

  return jsonb_build_object(
    'ok', true,
    'organization_id', p_organization_id,
    'schema_name', p_schema_name,
    'reopened', coalesce(v_reopen, false),
    'note', format('%s may now declare tables in %L through the restricted lane. Nothing '
                   'else changed: the lane still refuses SQL text, still writes only into '
                   'this organization, and still certifies every table it creates.',
                   (select o.name from iam.organizations o where o.id = p_organization_id),
                   p_schema_name));
end;
$function$;

CREATE OR REPLACE FUNCTION platform.resolve_change_handling(p_change_type_key text, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'platform', 'iam', 'public'
AS $function$
declare
  d platform.change_type_default%rowtype;
  o platform.org_change_policy%rowtype;
begin
  -- AN ORGANIZATION'S KNOBS ARE ITS OWN. The org rung is read by organization id; a
  -- caller who is not in that organization gets the platform rung, never another
  -- tenant's override.
  if p_organization_id is not null
     and iam.is_client_lane()
     and not iam.has_org_access(p_organization_id) then
    raise exception 'organization_access_denied: no access to that organization'
      using errcode = '42501';
  end if;

  -- ── THE ROW-38 STRUCTURAL FLOOR (research finding #4) ──────────────────
  -- "Change a change-type's own handling mode" is human-only, ALWAYS.
  -- Hard-coded here, before any table read, so no catalogue edit, seed drift,
  -- or org row can ever lift it. The system may never widen its own permissions.
  if p_change_type_key = 'change_own_handling_mode' then
    return jsonb_build_object(
      'change_type_key', p_change_type_key,
      'handling_mode', 'off',
      'timeout_minutes', null,
      'timeout_expiry', null,
      'tier', 6,
      'floored', true,
      'human_only', true,
      'source', 'structural_floor');
  end if;

  select * into d from platform.change_type_default where change_type_key = p_change_type_key;
  if not found then
    -- Loud-recovery law: an unknown key must never silently resolve to a
    -- permissive default. Register the key in the catalogue and reseed.
    raise exception '[change-policy] unknown change_type_key "%" — not in platform.change_type_default. Register it in CHANGE_TYPE_CATALOGUE (matrx-frontend features/change-policy/catalogue.ts) and apply the generated seed. Refusing to guess a handling mode.', p_change_type_key
      using errcode = 'P0002';
  end if;

  -- Defense in depth: any future floored row resolves like row 38 regardless
  -- of its stored mode or any org override.
  if d.floor_human_only then
    return jsonb_build_object(
      'change_type_key', p_change_type_key,
      'handling_mode', 'off',
      'timeout_minutes', null,
      'timeout_expiry', null,
      'tier', d.tier,
      'floored', true,
      'human_only', true,
      'source', 'structural_floor');
  end if;

  if p_organization_id is not null then
    select * into o from platform.org_change_policy
      where organization_id = p_organization_id and change_type_key = p_change_type_key;
    if found then
      return jsonb_build_object(
        'change_type_key', p_change_type_key,
        'handling_mode', o.handling_mode,
        'timeout_minutes', case when o.handling_mode = 'review_with_timeout'
                                then coalesce(o.timeout_minutes, d.default_timeout_minutes) end,
        'timeout_expiry', case when o.handling_mode = 'review_with_timeout'
                               then coalesce(o.timeout_expiry, d.default_timeout_expiry) end,
        'tier', d.tier,
        'floored', false,
        'human_only', false,
        'source', 'org_override');
    end if;
  end if;

  return jsonb_build_object(
    'change_type_key', p_change_type_key,
    'handling_mode', d.default_mode,
    'timeout_minutes', case when d.default_mode = 'review_with_timeout' then d.default_timeout_minutes end,
    'timeout_expiry', case when d.default_mode = 'review_with_timeout' then d.default_timeout_expiry end,
    'tier', d.tier,
    'floored', false,
    'human_only', false,
    'source', 'platform_default');
end;
$function$;

CREATE OR REPLACE FUNCTION platform.upsert_unit_purpose(p_unit_type text, p_unit_id uuid, p_title text, p_statement text, p_grounding_tag text, p_inputs jsonb DEFAULT NULL::jsonb, p_outputs jsonb DEFAULT NULL::jsonb, p_safe_conditions jsonb DEFAULT NULL::jsonb, p_position integer DEFAULT 0)
 RETURNS platform.purpose
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org        uuid;
  v_purpose_id uuid;
  v_row        platform.purpose;
  v_existing   platform.purpose;
begin
  -- (0447 diff #1) 'mandate' joins the whitelist.
  if p_unit_type not in ('agent','workflow','tool','mandate') then
    raise exception 'upsert_unit_purpose: % is not a unit that can carry a purpose (agent|workflow|tool|mandate)', p_unit_type
      using errcode = 'check_violation';
  end if;
  if p_grounding_tag not in ('H','V','A') then
    raise exception 'upsert_unit_purpose: grounding_tag must be H (human) | V (AI-drafted, human-verified) | A (AI-only), got %', p_grounding_tag
      using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_title),'') = '' or coalesce(btrim(p_statement),'') = '' then
    raise exception 'upsert_unit_purpose: a purpose needs both a title and a statement — an empty purpose is the same as none'
      using errcode = 'check_violation';
  end if;

  -- The unit owns the org; a purpose can never live in a different tenant than
  -- the thing it describes.
  -- (0447 diff #2) mandate rows live in agent.mandate.
  if p_unit_type = 'agent' then
    select organization_id into v_org from agent.definition where id = p_unit_id;
  elsif p_unit_type = 'workflow' then
    select organization_id into v_org from workflow.definition where id = p_unit_id;
  elsif p_unit_type = 'mandate' then
    select platform.purpose_mandate_organization(p_unit_id) into v_org;
  else
    select organization_id into v_org from tool.definition where id = p_unit_id;
  end if;

  if v_org is null then
    raise exception 'upsert_unit_purpose: no % with id % (or it carries no organization)', p_unit_type, p_unit_id
      using errcode = 'no_data_found';
  end if;

  -- A signed-in caller must be able to edit the unit. The server lane
  -- (service role, auth.uid() null) is already the trusted writer — the same
  -- posture every service-role write on this platform has.
  if auth.uid() is not null and not iam.has_access(p_unit_type, p_unit_id, 'editor') then
    raise exception 'upsert_unit_purpose: you cannot edit this %', p_unit_type
      using errcode = 'insufficient_privilege';
  end if;

  select a.source_id into v_purpose_id
    from platform.associations_live a
   where a.source_type = 'purpose'
     and a.target_type = p_unit_type
     and a.target_id   = p_unit_id
     and a.role        = 'served_by'
     and coalesce(a.position, 0) = p_position
   limit 1;

  if v_purpose_id is not null then
    select * into v_existing from platform.purpose where id = v_purpose_id;

    -- THE ANTI-STACKING GUARD (Engram §4.5). An AI-only statement never
    -- overwrites a human or human-verified one. Loud, and a no-op rather than a
    -- failure: the caller (a describer sweep) is doing its job correctly, the
    -- answer is simply "a human already grounded this one".
    if p_grounding_tag = 'A' and v_existing.grounding_tag in ('H','V') then
      raise warning '[purpose] refusing to overwrite % purpose % on %:% with an AI-only statement (anti-stacking, Engram 4.5)',
        v_existing.grounding_tag, v_existing.id, p_unit_type, p_unit_id;
      return v_existing;
    end if;

    update platform.purpose
       set title           = p_title,
           statement       = p_statement,
           grounding_tag   = p_grounding_tag,
           inputs          = coalesce(p_inputs,  inputs),
           outputs         = coalesce(p_outputs, outputs),
           safe_conditions = coalesce(p_safe_conditions, safe_conditions)
     where id = v_purpose_id
     returning * into v_row;
    return v_row;
  end if;

  -- No purpose at this position yet. One primary per unit: refuse to mint a
  -- SECOND position-0 purpose behind the caller's back.
  if p_position = 0 and exists (
    select 1 from platform.associations_live a
     where a.source_type='purpose' and a.target_type=p_unit_type
       and a.target_id=p_unit_id and a.role='served_by' and coalesce(a.position,0)=0
  ) then
    raise exception 'upsert_unit_purpose: %:% already has a primary purpose', p_unit_type, p_unit_id
      using errcode = 'unique_violation';
  end if;

  insert into platform.purpose (title, statement, grounding_tag, inputs, outputs, safe_conditions, organization_id)
  values (p_title, p_statement, p_grounding_tag,
          coalesce(p_inputs,'[]'::jsonb), coalesce(p_outputs,'[]'::jsonb),
          p_safe_conditions, v_org)
  returning * into v_row;

  insert into platform.associations (source_type, source_id, target_type, target_id, role, position, organization_id)
  values ('purpose', v_row.id, p_unit_type, p_unit_id, 'served_by', p_position, v_org);

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION provider.attach_credential(p_account_id uuid, p_credential_item_id uuid, p_credential_role text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'provider'
AS $function$
DECLARE v_org uuid; v_id uuid;
BEGIN
  SELECT organization_id INTO v_org FROM provider.account WHERE id = p_account_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN RAISE EXCEPTION 'provider account not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM provider._assert_org_admin(v_org);
  -- ARGS-RULED (2026-09-21). THE CREDENTIAL MUST BE REACHABLE BY WHOEVER IS ATTACHING IT.
  -- `p_account_id` is checked (the account's organization, then provider._assert_org_admin) and
  -- `p_credential_item_id` was not checked at all — so an organization admin could bind ANY
  -- credential item on the database to their own provider account, and attaching a credential is
  -- what lets an account USE it. 370 of the 406 credential items carry no organization at all:
  -- they are PERSONAL, so the rule is not "must be this organization's" but "this organization's,
  -- or the caller's own".
  IF NOT EXISTS (SELECT 1 FROM users.credential_items ci
                  WHERE ci.id = p_credential_item_id
                    AND (ci.organization_id = v_org OR ci.user_id = auth.uid())) THEN
    RAISE EXCEPTION 'That credential is not this organization''s and is not yours, so it was not attached.'
      USING ERRCODE = '42501',
            HINT = 'A credential is attached by somebody who already holds it: either it belongs to this organization, or it is your own personal one.';
  END IF;

  INSERT INTO provider.account_credential (organization_id, account_id, credential_item_id, credential_role)
  VALUES (v_org, p_account_id, p_credential_item_id, p_credential_role) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION provider.set_account_status(p_account_id uuid, p_status text, p_external_account_id text DEFAULT NULL::text, p_last_verified_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_duplicate_of_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'provider'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM provider.account WHERE id = p_account_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN RAISE EXCEPTION 'provider account not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM provider._assert_org_admin(v_org);
  -- ARGS-RULED (2026-09-21). A DUPLICATE POINTS AT AN ACCOUNT IN THE SAME ORGANIZATION.
  -- `p_duplicate_of_id` was written raw beside a `p_account_id` that IS checked, so one
  -- organization's account could be marked a duplicate of another organization's.
  IF p_duplicate_of_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM provider.account a
        WHERE a.id = p_duplicate_of_id AND a.organization_id = v_org AND a.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'The account this one is said to duplicate is not in this organization.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE provider.account SET status = p_status, external_account_id = coalesce(p_external_account_id, external_account_id),
    last_verified_at = coalesce(p_last_verified_at, last_verified_at), last_verified_by = auth.uid(),
    duplicate_of_id = p_duplicate_of_id WHERE id = p_account_id;
END;
$function$;

CREATE OR REPLACE FUNCTION rag.fn_get_library_full_page(p_id uuid, p_page_index integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'rag', 'docproc'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM docproc.processed_documents WHERE id = p_id) THEN
    RAISE EXCEPTION
      'document % is not available to this account — it may not exist, or your access may not reach it',
      p_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'page_index', p.page_index,
    'page_number', p.page_number,
    'raw_text', COALESCE(p.raw_text, ''),
    'raw_char_count', COALESCE(p.raw_char_count, 0),
    'cleaned_text', COALESCE(p.cleaned_text, ''),
    'cleaned_char_count', COALESCE(p.cleaned_char_count, 0),
    'extraction_method', p.extraction_method,
    'used_ocr', COALESCE(p.used_ocr, false),
    'section_kind', p.section_kind,
    'section_title', p.section_title,
    'is_continuation', COALESCE(p.is_continuation, false),
    'has_image', (p.image_cld_file_id IS NOT NULL)
  ) INTO v_result
  FROM docproc.processed_document_pages p
  WHERE p.processed_document_id = p_id AND p.page_index = p_page_index;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'page not found';
  END IF;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION rag.fn_list_library_chunks(p_id uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_parent_only boolean DEFAULT false, p_children_only boolean DEFAULT false, p_page_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'rag', 'docproc'
AS $function$
DECLARE
  v_limit int := GREATEST(1, LEAST(p_limit, 500));
  v_offset int := GREATEST(0, p_offset);
  v_total int;
  v_result jsonb;
BEGIN
  IF p_parent_only AND p_children_only THEN
    RAISE EXCEPTION 'parent_only and children_only are mutually exclusive';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM docproc.processed_documents WHERE id = p_id) THEN
    RAISE EXCEPTION
      'document % is not available to this account — it may not exist, or your access may not reach it',
      p_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*) INTO v_total FROM rag.kg_chunks
   WHERE processed_document_id = p_id AND valid_to IS NULL
     AND (NOT p_parent_only OR parent_chunk_id IS NULL)
     AND (NOT p_children_only OR parent_chunk_id IS NOT NULL)
     AND (p_page_number IS NULL OR p_page_number = ANY(page_numbers));

  SELECT jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'chunks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'chunk_index', c.chunk_index,
        'chunk_kind', c.chunk_kind,
        'parent_chunk_id', c.parent_chunk_id,
        'page_numbers', c.page_numbers,
        'token_count', c.token_count,
        'content_text', COALESCE(c.content_text, ''),
        'has_oai_embedding', EXISTS (SELECT 1 FROM rag.embeddings_voyage_4_large_1024 e WHERE e.chunk_id = c.id),
        'has_voyage_embedding', EXISTS (SELECT 1 FROM rag.embeddings_voyage_code_3_1024 e WHERE e.chunk_id = c.id),
        'section_kind', c.metadata->>'section_kind',
        'metadata', c.metadata
      ))
      FROM (
        SELECT * FROM rag.kg_chunks
        WHERE processed_document_id = p_id AND valid_to IS NULL
          AND (NOT p_parent_only OR parent_chunk_id IS NULL)
          AND (NOT p_children_only OR parent_chunk_id IS NOT NULL)
          AND (p_page_number IS NULL OR p_page_number = ANY(page_numbers))
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        ORDER BY chunk_index, created_at, id
        LIMIT v_limit OFFSET v_offset
      ) c
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION scheduler.sch_run_claim(p_task_id uuid, p_surface text, p_trigger_id uuid DEFAULT NULL::uuid, p_queue text DEFAULT NULL::text, p_lease_seconds integer DEFAULT 600)
 RETURNS scheduler.sch_run
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_task record;
  v_now timestamptz := now();
  v_lease integer := greatest(1, coalesce(p_lease_seconds, 600));
  v_row scheduler.sch_run;
begin
  if v_uid is null then
    raise exception 'You must be signed in to claim scheduled work.' using errcode = '42501';
  end if;

  select t.id, t.user_id, t.organization_id, t.next_due_at, t.queue
    into v_task
    from scheduler.sch_task t
   where t.id = p_task_id and t.deleted_at is null;

  if v_task.id is null then
    raise exception 'That scheduled task no longer exists.' using errcode = 'P0002';
  end if;
  -- "refusing to claim task %: task has no valid organization_id" — the same refusal both
  -- clients and the Python scanner already make, moved to where it cannot be skipped.
  if v_task.organization_id is null then
    raise exception 'Refusing to claim task %: it has no organization.', p_task_id
      using errcode = '23514';
  end if;
  -- The platform-admin arm leads, exactly as it does in every policy iam.apply_rls generates.
  -- Without it this door is stricter than the client write it replaced.
  if not ((select public.is_platform_admin()) or iam.has_org_access(v_task.organization_id)) then
    raise exception 'You are not a member of the organization that owns that task.'
      using errcode = '42501';
  end if;

  insert into scheduler.sch_run (
    task_id, trigger_id, user_id, organization_id, status, surface, queue,
    due_at, claimed_at, claim_token, claim_expires_at, metadata
  ) values (
    v_task.id,
    p_trigger_id,
    v_task.user_id,
    v_task.organization_id,
    'claimed',
    p_surface,
    coalesce(p_queue, v_task.queue),
    coalesce(v_task.next_due_at, v_now),
    v_now,
    -- THE MINT. The only place a claim token comes from.
    extensions.gen_random_uuid(),
    v_now + make_interval(secs => v_lease),
    jsonb_build_object('claim_protocol', 2)
  ) returning * into v_row;
  -- No exception handler on purpose: `sch_run_unique_active_per_task` must reach the caller
  -- as 23505 so the existing race classifier still works.

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION web.set_site_offering_availability(p_organization_id uuid, p_site_id uuid, p_offering_ids uuid[], p_available boolean, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(offering_id uuid, changed boolean, placements_removed bigint, placements_restored bigint, worth_removed bigint, worth_restored bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'web', 'seo', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_site web.site%ROWTYPE;
  v_id uuid;
  v_row web.site_offering%ROWTYPE;
  v_at timestamptz := clock_timestamp();
  -- THE one stamp: the same text goes on the availability row and on every
  -- fact it removes.
  v_stamp text := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"');
  v_removed_at timestamptz;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_bad uuid[];
  v_pr bigint; v_ps bigint; v_wr bigint; v_ws bigint; v_changed boolean;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT * INTO v_site FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_site.id IS NULL THEN
    RAISE EXCEPTION 'gsc_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;
  IF p_organization_id IS NULL OR v_site.organization_id <> p_organization_id OR v_site.brand_id IS NULL THEN
    RAISE EXCEPTION 'offering_availability_scope_mismatch: explicit organization and site brand are required';
  END IF;
  IF p_available IS NULL THEN
    RAISE EXCEPTION 'offering_availability_required: say whether this site offers it';
  END IF;
  IF p_offering_ids IS NULL OR cardinality(p_offering_ids) = 0 THEN
    RAISE EXCEPTION 'offering_availability_none: choose at least one offering';
  END IF;
  SELECT array_agg(x) INTO v_bad FROM unnest(p_offering_ids) x
  WHERE NOT EXISTS (SELECT 1 FROM web.brand_offering bo WHERE bo.id = x
                      AND bo.brand_id = v_site.brand_id AND bo.status = 'active' AND bo.deleted_at IS NULL);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'offering_availability_not_brand: % is not a live offering of this site''s brand', v_bad[1];
  END IF;
  v_at := v_stamp::timestamptz;

  FOR v_id IN SELECT DISTINCT x FROM unnest(p_offering_ids) x LOOP
    v_pr := 0; v_ps := 0; v_wr := 0; v_ws := 0; v_changed := false;
    v_row := NULL;
    SELECT * INTO v_row FROM web.site_offering so
    WHERE so.site_id = p_site_id AND so.brand_offering_id = v_id AND so.deleted_at IS NULL;

    IF v_row.id IS NOT NULL AND v_reason IS NOT NULL
       AND (v_row.status = 'active') = p_available THEN
      -- Availability does not move; the person's reason is still kept.
      UPDATE web.site_offering so
      SET metadata = so.metadata || jsonb_build_object('availability',
            COALESCE(so.metadata -> 'availability', '{}'::jsonb)
            || jsonb_build_object('reason', v_reason, 'reason_by', auth.uid(), 'reason_at', v_stamp)),
          updated_at = now(), updated_by = auth.uid()
      WHERE so.id = v_row.id;
    ELSIF p_available THEN
      IF v_row.id IS NULL THEN
        INSERT INTO web.site_offering (organization_id, site_id, brand_offering_id, status, metadata, created_by, updated_by)
        VALUES (p_organization_id, p_site_id, v_id, 'active',
                jsonb_build_object('availability', jsonb_build_object('at', v_stamp, 'by', auth.uid(), 'reason', v_reason, 'available', true)),
                auth.uid(), auth.uid());
        v_changed := true;
      ELSIF v_row.status <> 'active' THEN
        v_removed_at := (v_row.metadata #>> '{availability,at}')::timestamptz;
        -- Availability first: the fact-scope trigger admits the restores below
        -- only once the offering is active on the site again.
        UPDATE web.site_offering so
        SET status = 'active',
            metadata = so.metadata || jsonb_build_object('availability',
              jsonb_build_object('at', v_stamp, 'by', auth.uid(), 'reason', v_reason, 'available', true,
                                 'previous', so.metadata -> 'availability')),
            updated_at = now(), updated_by = auth.uid()
        WHERE so.id = v_row.id;
        v_changed := true;
        IF v_removed_at IS NOT NULL THEN
          -- Restore exactly what stopping this offering took, and nothing a
          -- person has changed since.
          WITH restored AS (
            UPDATE seo.site_keyword_offering k
            SET deleted_at = NULL, metadata = k.metadata - 'removed_with_availability',
                updated_at = now(), updated_by = auth.uid()
            WHERE k.site_id = p_site_id AND k.brand_offering_id = v_id AND k.deleted_at IS NOT NULL
              AND (k.metadata ->> 'removed_with_availability')::timestamptz = v_removed_at
              AND NOT EXISTS (SELECT 1 FROM seo.site_keyword_offering live
                              WHERE live.site_id = k.site_id AND live.keyword_id = k.keyword_id
                                AND live.deleted_at IS NULL
                                AND (live.brand_offering_id = k.brand_offering_id OR (k.is_primary AND live.is_primary)))
            RETURNING k.is_primary
          )
          SELECT count(*) FILTER (WHERE is_primary) INTO v_ps FROM restored;
          UPDATE seo.site_offering_value v
          SET deleted_at = NULL, metadata = v.metadata - 'removed_with_availability',
              updated_at = now(), updated_by = auth.uid()
          WHERE v.site_id = p_site_id AND v.brand_offering_id = v_id AND v.deleted_at IS NOT NULL
            AND (v.metadata ->> 'removed_with_availability')::timestamptz = v_removed_at
            AND NOT EXISTS (SELECT 1 FROM seo.site_offering_value live
                            WHERE live.site_id = v.site_id AND live.brand_offering_id = v.brand_offering_id
                              AND live.deleted_at IS NULL);
          GET DIAGNOSTICS v_ws = ROW_COUNT;
        END IF;
      END IF;
    ELSE
      IF v_row.id IS NOT NULL AND v_row.status = 'active' THEN
        -- Facts first: the fact-scope trigger admits a write only while the
        -- offering is still available on the site.
        WITH removed AS (
          UPDATE seo.site_keyword_offering k
          SET deleted_at = v_at,
              metadata = k.metadata || jsonb_build_object('removed_with_availability', v_stamp),
              updated_at = now(), updated_by = auth.uid()
          WHERE k.site_id = p_site_id AND k.brand_offering_id = v_id AND k.deleted_at IS NULL
          RETURNING k.is_primary
        )
        SELECT count(*) FILTER (WHERE is_primary) INTO v_pr FROM removed;
        UPDATE seo.site_offering_value v
        SET deleted_at = v_at,
            metadata = v.metadata || jsonb_build_object('removed_with_availability', v_stamp),
            updated_at = now(), updated_by = auth.uid()
        WHERE v.site_id = p_site_id AND v.brand_offering_id = v_id AND v.deleted_at IS NULL;
        GET DIAGNOSTICS v_wr = ROW_COUNT;
        UPDATE web.site_offering so
        SET status = 'inactive',
            metadata = so.metadata || jsonb_build_object('availability',
              jsonb_build_object('at', v_stamp, 'by', auth.uid(), 'reason', v_reason, 'available', false,
                                 'previous', so.metadata -> 'availability')),
            updated_at = now(), updated_by = auth.uid()
        WHERE so.id = v_row.id;
        v_changed := true;
      END IF;
    END IF;

    RETURN QUERY SELECT v_id, v_changed, v_pr, v_ps, v_wr, v_ws;
  END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION workbench.note_folder_get_or_create(p_organization_id uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_id    uuid;
begin
  if v_actor is null then
    raise exception using errcode = '28000',
      message = 'notes_folder_unauthenticated: sign in before creating a folder.';
  end if;
  if p_organization_id is null then
    raise exception using errcode = '22004',
      message = 'notes_folder_organization_required: a folder is created in an explicit organization.';
  end if;
  if v_name = '' then
    raise exception using errcode = '22023',
      message = 'notes_folder_name_required: a folder needs a name.';
  end if;

  select f.id into v_id
    from workbench.note_folders f
   where f.organization_id = p_organization_id
     and f.created_by = v_actor
     and f.name = v_name
     and f.deleted_at is null;
  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into workbench.note_folders (created_by, name, path, position, organization_id)
    values (v_actor, v_name, v_name, 0, p_organization_id)
    on conflict (organization_id, created_by, name) where deleted_at is null do nothing
    returning id into v_id;
  exception when unique_violation then
    -- The arbiter above absorbs a same-organization race. Anything that still collides is another
    -- key; the only other name key is the retired org-blind one.
    if exists (
      select 1 from workbench.note_folders f
       where f.created_by = v_actor and f.name = v_name
         and f.organization_id is distinct from p_organization_id
    ) then
      raise exception using errcode = '23505',
        message = 'notes_folder_cross_org_legacy_key: this person already owns a folder with this name in another organization, and the retired (created_by, name) key is still live.',
        hint = 'Apply chair_step_2026_09_18_note_folders_org_blind_name_key.sql.';
    end if;
    raise;
  end;

  if v_id is null then
    -- DO NOTHING fired: a concurrent call created it between the read and the insert.
    select f.id into v_id
      from workbench.note_folders f
     where f.organization_id = p_organization_id
       and f.created_by = v_actor
       and f.name = v_name
       and f.deleted_at is null;
  end if;
  if v_id is null then
    raise exception using errcode = 'P0002',
      message = 'notes_folder_not_visible: the folder exists but this caller cannot read it.';
  end if;
  return v_id;
end
$function$;
