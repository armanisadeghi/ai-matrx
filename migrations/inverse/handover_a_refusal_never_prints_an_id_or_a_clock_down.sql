-- Inverse of handover_a_refusal_never_prints_an_id_or_a_clock.sql: the 75 bodies it replaced, byte for byte.
-- based-on: custom._action_check(uuid, uuid, jsonb) 0eb64113311fab8fdcbfef2354c889ad9deec1606bad2db8e89894fe42d4f07b
-- based-on: custom._doc_signature_immutable() fcca545403b0070341b396d26cc5d34e437183c40a14a2c870caa8b008d25605
-- based-on: custom._read_record_with(uuid, uuid, boolean, jsonb, jsonb) 8bf31b77b73800a4ff938342112363f1088d07b8cd5ce398003e6617125f1592
-- based-on: custom.action_run(uuid, uuid, uuid[]) 5df6f9799ef6b3a7920f271f4a6dffe0ff9d66402fa7a3a19c58bd72b0a1e29a
-- based-on: custom.agg_digest_assemble(uuid, uuid, timestamp with time zone, timestamp with time zone) 778ef9b4a7f3dabaa3438d3662753921ea7dcfd98437761ff568be6b680c9841
-- based-on: custom.anon_publish(uuid, uuid, boolean) 782b6808ed9d3ca9d0ff0e4c5f3741e17f79f0584563e4b04fde8903ca8bb341
-- based-on: custom.anon_rate_take(uuid, uuid, text, uuid) 65a75f9dfce4ca58a46b9682d0c172251ed3afb04bcfd3794a8678b74671207c
-- based-on: custom.anon_token_issue(uuid, text, jsonb, uuid, uuid, uuid, timestamp with time zone) 646ca8c86fa46e09b0334eb65bf661bd2f070f9a98de6b2076b0dfe7d7ca18b9
-- based-on: custom.anon_token_verify(text, text, text) d124735f21e5c4fec831875b738052c2ba6c16d1ce26b745b126c5c72b563954
-- based-on: custom.booking_declare(uuid, uuid, text, jsonb, jsonb, jsonb, integer, uuid, uuid, uuid, text, uuid) daa60da66cb442d1e1f42444f86b671588de39761ae5f3a3bc1988334ffe8edc
-- based-on: custom.capture_publish(uuid, uuid, boolean) d5fd2e0393d69db52b1cb8bc4a827a73c50461c3a6453d06373251f5c88fa89f
-- based-on: custom.context_item_write(uuid, uuid, jsonb) f26d4aecd864dcab2ba87fe73b85821ed8af7ab2adffaf9aea4f60e0dab6c526
-- based-on: custom.context_template_apply(uuid, uuid) a777712ad700cdb1449dd681370bced894d20d175f549a5692cd92c1dafb37ff
-- based-on: custom.conversation_scope_bind(uuid, uuid, uuid) c3ce02d9250f9fb017371337c76b7b6d44fa9f12f2f4a806e7e52b0bbc9adf8a
-- based-on: custom.dashboard_declare(uuid, uuid, text, jsonb, jsonb, uuid) e47f19a09082757df4e1bc233fda1e16cdfdf751a930b6575460c876e83171ed
-- based-on: custom.dashboard_delete(uuid, uuid) cf92fb3667a02eecd342d0574ef8194ec08da55bf8ccbac6bd800e56b053a1b4
-- based-on: custom.dashboard_restore(uuid, uuid) 1fee010963f3f508d8438e42bdb58a796fd9ec2a6cbc67468d48f5ccc4a02ed1
-- based-on: custom.dashboard_run(uuid, uuid, jsonb, jsonb, text) 78bdf5b2d69aacebea2647f3011a716f627bc5579c7e3f96dc3df9e48cc71c26
-- based-on: custom.doc_render_body(uuid, uuid, uuid) b2ce1db8e700cdbe86193d2ffafc96a35f418ee9bd39a22fc5612cdb6389beda
-- based-on: custom.doc_render_document(uuid, uuid, uuid) 97c0bda76b870c85d15f4de1f0d4eebb4affdfdcd6a05e479d481621be22cc35
-- based-on: custom.doc_render_read(uuid, uuid) a0b2a079ac9caee58fbccc7d52e1d111ca58c5edd540cb6f7ded608d260d0689
-- based-on: custom.doc_sign(uuid, uuid, text, text, uuid) 1cb5c8d2e9eb0521ec6175518ed04e52dec3943b512e0968dfae1c5be4fc36d6
-- based-on: custom.doc_signature_intact(uuid, uuid) 3231aaeaf7e6740adf7c0716c4826d6bc37380fbde9ff73a2ae45fc6f931fbb8
-- based-on: custom.doc_signature_read(uuid, uuid) 8cd848c3532de1ba46ce51a76b7a87ea479722139de0efe564e58011931726a2
-- based-on: custom.doc_signature_write(uuid, uuid, uuid, text, text, uuid, text, integer) d575a2554614ff7a06961868d6376ac4a100fd180620e2bd36451be92c274ede
-- based-on: custom.doc_template_delete(uuid, uuid) 0e64a81a458c3b8a1b6f07624c70a3160e79ef3b755326d8ac22cb7aafe1cbdd
-- based-on: custom.doc_template_read(uuid, uuid) ddacd2bf330f85cd578c20a7ead3e8c81843eb0806a3d9f510a78ccc97782351
-- based-on: custom.doc_template_restore(uuid, uuid) c24ccc5efd4508eb7049e6e89a02e97a5d8fc5cbceb441e31cf2eeec6e71b30d
-- based-on: custom.doc_template_save(uuid, uuid, text, text, uuid) d86a4d78da2dc26b12239d3e41bc7687e1d75c457fae6772e0b7a4b228d03fa4
-- based-on: custom.enrich_pin(uuid, uuid, text, boolean) 65eac6b1d587984a206da03494185de56e2a08610eec9cc92e408602194b3358
-- based-on: custom.external_history_event(uuid, uuid, text) 542853074ef7e1c375639766cacdfa60e5746d5978c1c2967acae8d5645d48ec
-- based-on: custom.external_rows(uuid, uuid) a91a674cadaa149b1e9871df7be7e4861e4787c4108f8a6f4ade617c4e7f08ed
-- based-on: custom.external_stub_upsert(uuid, uuid, uuid, text, text, text) cb5c6cc2c97da8079a67cf9dafce8ccc1a2684a3cbe6b2ecc94a608bc55dee00
-- based-on: custom.external_write_through(uuid, uuid, jsonb) 227fc664968d84823227ea01aecb20bff720faaa21da83705629b81927228561
-- based-on: custom.external_writes_set(uuid, uuid, boolean) 7083314995be411e83c1e5f28217098f477f942c55dcdd0d9ba8a22c2a4072dd
-- based-on: custom.form_declare(uuid, uuid, text, jsonb, jsonb, integer, uuid, uuid, uuid, text) e854dc1aeac2c11ea9d978ce727e093bd663fa2ca322b320c3a1338fc013f403
-- based-on: custom.grid_layout(uuid, uuid, uuid) 222aa7ae2fbecb182dfc43828e8fac39a21b9a02e86d2cb8aa8fa5cc504701f3
-- based-on: custom.io_comment_write(uuid, uuid, text, jsonb, uuid) f4d44ce291dac1279b062a0afea27a7e7d67c6d3a1e481d3f17049a4e213c4db
-- based-on: custom.io_import_rows(uuid, uuid, jsonb, jsonb) 8210c8c9f72d678ef0600ca7f2534c6ca8b4aaecf256ed89dd6e8c616af67132
-- based-on: custom.io_proposal_accept(uuid, uuid, text, text, text) ca727e1464f563584b7c6f5d979ba626b10d1649110895e48adac0a825758dfa
-- based-on: custom.migrate_delete(uuid, uuid, text) a04b9297c06dc739d80a8b9e243f87d00e5168407d301c8774b22b1eab198dfb
-- based-on: custom.migrate_extract_parent(uuid, uuid, uuid, text[], text) a1bb131a16e0444cc253b2a009bb2bcda22301397717d057ec9c5d27970328e5
-- based-on: custom.migrate_reclass(uuid, uuid, text, text) 7e7ed37b49b27a7562f764e3c43d02244f94613a418f0ff51398a9be1bf6413e
-- based-on: custom.migrate_rename(uuid, uuid, text, text) caeb22704d4114b9091721a9ad2c539e60397c9831f3fc335a6802633598f84e
-- based-on: custom.migrate_reparent(uuid, uuid, uuid, text) c98574893717cc42ba2b84c307285bcf080028410604b4dc3a4230bd83e86c7a
-- based-on: custom.migrate_retype(uuid, uuid, text, text) 2a1ee031c7e08d1977730a62585ef70747747c948cd73a0edd0d1f66e446cee3
-- based-on: custom.migrate_split(uuid, uuid, text[], text) a50b1dc33fbf655858fe20af83b48c84f2ca6e04e4d2f16fc4365c5c8f7617a1
-- based-on: custom.migrate_undo(uuid, uuid) e62c8be9ced4b5fe1b0aa0e2b74eb0f8685846267db879aa5a6cd22fdd708adb
-- based-on: custom.organization_clear(uuid, text, boolean) d9017757b477575df5495ad1e33fc234cb5daf0cb35f844cf0a0ba6926b6910e
-- based-on: custom.read_records_in_view_order(uuid, uuid, boolean, integer, integer, jsonb) 18ec7ead8b1279d83f8d70567f86f980496fb5e4fd9e8c290d0d0dbd62465f53
-- based-on: custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer) 67cb15328375da7c6a9983e0c757ff092c7d3c909cc364afef26f8101b10c916
-- based-on: custom.record_delete(uuid, uuid) 93794b4c52f131b8c3705b1060b33306898b12e51842bc7454eb37311cd3df1e
-- based-on: custom.record_restore(uuid, uuid) c816b39b78c3a14ee258022d9a877092c6b9406234da6ae8bf49a28fb70476aa
-- based-on: custom.record_table(uuid, uuid) 8a1962344dee43951b28e72a4044cc8f664062435315645fb74239d91803aed2
-- based-on: custom.record_update(uuid, uuid, jsonb, integer) f7c0d7515fe21200c0291177808a3b1e526b3ebcaea195862b5ca1b7f9e03a93
-- based-on: custom.record_write_graph(uuid, uuid, jsonb, jsonb, jsonb) 6723c9553f24f283665bb5f68f9cea71941f6e7a2599dea0a7e369380785ee5e
-- based-on: custom.relation_halves_repair(uuid, uuid) 444428b8a50c1bfe9c0500ead8871137e56e0cdc8d7356f06bf2aa17d932a559
-- based-on: custom.relation_own(uuid, uuid, uuid) fdb1201fd44728e4ae5b895b394cb082013878377e493f46ce7898190034b6c4
-- based-on: custom.rule_declare(uuid, jsonb, uuid) 19866b39c3263bcd15e42fab1168d30987fa4a7d9ddc73337537f055c6d007b7
-- based-on: custom.sign_request_cancel(uuid, uuid, text) 0d9820e49613ee35cc8e801775b77ce13f7f1ce3b043e3543fb71eb291c7b05f
-- based-on: custom.sign_request_create(uuid, uuid, text, text, text, interval) 84eff6ed66303f75a0243249b63859740d155a85a84cd1fcd7eeb2e0e0459d0b
-- based-on: custom.sign_request_remind(uuid, uuid) ff2b261999d8b3f2f008ec2ce439a8a5cec4a8d0d08ddef2d93ab9f5fdf9fa59
-- based-on: custom.sign_request_unchanged(uuid, uuid) 1e8bc4d6a706b589d4a250372b40ce72bbc8c0dbb044fb9c651896cbef2b9a7d
-- based-on: custom.subscription_mute(uuid, uuid, boolean) bae8788e0b0cec5236e3aaae6d45707d5f88d11ae64784ee1b447126c3a860bf
-- based-on: custom.subscription_preview(uuid, uuid) d3d4c3dd6c05661b4ce64a5d1fc13f547796b007cb8f1aadb9bd0c0a33a63366
-- based-on: custom.table_archive(uuid, uuid, integer, boolean) 521e2eee35d2e14c737d5fac99bd5af0a3ccf442d483f86a1ce9d79d89de2b99
-- based-on: custom.table_webhook_archive(uuid, uuid) c78e263db4f557edad5a379360f85f2f0ed3126e2ed85c6f497d78f23d0f5a60
-- based-on: custom.view_declare(uuid, uuid, jsonb) d941e70bcd0f0d3094964c0c544a12b8d50210453819ec5631050139949fd21e
-- based-on: custom.view_designate(uuid, uuid, uuid, text) 6b2affc7213b7ab0ba392e3ccdbb810c10e9687e190322f78f56ce1fcd73a929
-- based-on: custom.view_look_set(uuid, uuid, uuid, jsonb) 6a4d7c3d69c84d7944de1e1c4bf20f8b85d324db7eabb2fcacc6501ceecf15ed
-- based-on: custom.view_record_order_set(uuid, uuid, uuid[]) 22c9eb39e249a07b318d61915f551bdcc7bf2ae8361d891f1a5973c2001b5d30
-- based-on: custom.visibility_as_of(uuid, uuid, timestamp with time zone) f9553cf388dcff107127b6d7a46f11ecd54a7d09846b90be28e6aa0edd42b31c
-- based-on: custom.whole_value_complete(uuid, uuid, text, uuid) 757548f2985ddcc0ea2df205a5e4dfeffcdbca20f3a5fcadf1415a00e83ce893
-- based-on: custom.work_approval_decide(uuid, uuid, boolean, text) d6131be3a46b05f3eeac95c8c06e0ccc81479d7a0b4ccd209038e3a4b9add8d0
-- based-on: custom.work_approval_read(uuid, uuid) 63f0ce3ec11ba36202f5c56be7cf5067180121cdb413b322f100216c168bf9ee
-- chair-step: restores the 75 custom.* bodies whose refusals printed an id or a clock (handover_a_refusal_never_prints_an_id_or_a_clock.sql)
CREATE OR REPLACE FUNCTION custom._action_check(p_organization_id uuid, p_table_id uuid, p_actions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_a      jsonb;
  v_s      jsonb;
  v_out    jsonb := '[]'::jsonb;
  v_steps  jsonb;
  v_names  text[] := '{}';
  v_ids    text[] := '{}';
  v_seen   text[];
  v_name   text;
  v_kind   text;
  v_set    text;
  v_field  jsonb;
  v_parsed jsonb;
  v_max_a  integer := coalesce((platform.knob_resolve('custom', 'row_actions_max', p_organization_id) #>> '{}')::integer, 24);
  v_max_s  integer := coalesce((platform.knob_resolve('custom', 'row_action_steps_max', p_organization_id) #>> '{}')::integer, 60);
  v_id     text;
begin
  if p_actions is null or jsonb_typeof(p_actions) = 'null' then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_actions) <> 'array' then
    raise exception 'A table''s row actions are a list, and what was sent is a %.', jsonb_typeof(p_actions)
      using errcode = '22023', hint = 'Send the whole list; an empty list removes every action. Nothing was written.';
  end if;
  if jsonb_array_length(p_actions) > v_max_a then
    raise exception 'A table can have at most % row actions, and % were sent.', v_max_a, jsonb_array_length(p_actions)
      using errcode = '22023', hint = 'The ceiling is the organization knob custom/row_actions_max. Nothing was written.';
  end if;

  for v_a in select e from jsonb_array_elements(p_actions) e loop
    if jsonb_typeof(v_a) <> 'object' then
      raise exception 'Each row action is a button with a name, and one of these is not.' using errcode = '22023';
    end if;
    v_name := btrim(coalesce(v_a ->> 'name', ''));
    if v_name = '' then
      raise exception 'A row action needs a name — it is the words on the button.' using errcode = '22023';
    end if;
    if char_length(v_name) > 80 then
      raise exception 'The row action "%…" has a name longer than 80 characters.', left(v_name, 20) using errcode = '22023';
    end if;
    if lower(v_name) = any (v_names) then
      raise exception 'Two row actions are called "%".', v_name
        using errcode = '22023', hint = 'Two buttons with the same words cannot be told apart. Nothing was written.';
    end if;
    v_names := v_names || lower(v_name);
    v_id := coalesce(nullif(v_a ->> 'id', ''), gen_random_uuid()::text);
    if v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'A row action is found by its id, and "%" is not one the store gave out.', v_id
        using errcode = '22023', hint = 'Leave id out for a new action; keep the id the store returned for an existing one.';
    end if;
    if v_id = any (v_ids) then
      raise exception 'Two row actions share the id %.', v_id using errcode = '22023';
    end if;
    v_ids := v_ids || v_id;
    if nullif(v_a ->> 'color', '') is not null and not ((v_a ->> 'color') = any (custom.decoration_colors())) then
      raise exception 'The button "%" is colored "%", which is not one of the table colors.', v_name, v_a ->> 'color'
        using errcode = '22023', hint = format('The colors are %s, or none. Nothing was written.', array_to_string(custom.decoration_colors(), ', '));
    end if;
    v_kind := coalesce(nullif(v_a ->> 'kind', ''), 'update');
    if v_kind not in ('update', 'agent') then
      raise exception 'The row action "%" is a "%", and an action either changes the record or asks an agent.', v_name, v_kind
        using errcode = '22023', hint = 'kind is "update" or "agent". Nothing was written.';
    end if;

    if v_kind = 'agent' then
      if btrim(coalesce(v_a ->> 'prompt', '')) = '' then
        raise exception 'The row action "%" asks an agent, and does not say what to ask.', v_name
          using errcode = '22023', hint = 'Say what the agent should do with the record — it opens the record''s chat with those words. Nothing was written.';
      end if;
      v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id', v_id, 'name', v_name, 'kind', 'agent', 'prompt', btrim(v_a ->> 'prompt'),
        'color', nullif(v_a ->> 'color', ''), 'icon', left(nullif(btrim(v_a ->> 'icon'), ''), 64),
        'confirm', coalesce((v_a ->> 'confirm')::boolean, false))));
      continue;
    end if;

    if jsonb_typeof(v_a -> 'steps') is distinct from 'array' or jsonb_array_length(v_a -> 'steps') = 0 then
      raise exception 'The row action "%" changes nothing yet — add at least one change.', v_name using errcode = '22023';
    end if;
    if jsonb_array_length(v_a -> 'steps') > v_max_s then
      raise exception 'The row action "%" changes more than % columns.', v_name, v_max_s
        using errcode = '22023', hint = 'The ceiling is the organization knob custom/row_action_steps_max. Nothing was written.';
    end if;
    v_steps := '[]'::jsonb;
    v_seen := '{}';
    for v_s in select e from jsonb_array_elements(v_a -> 'steps') e loop
      select jsonb_build_object('id', f.id, 'key', f.data ->> 'key', 'label', f.data ->> 'label',
                                'type', f.data ->> 'type', 'source', f.data ->> 'source', 'config', f.data -> 'config')
        into v_field
        from custom.record f
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and f.data_class = 'field'
         and f.deleted_at is null
         and f.data ->> 'entity_definition_id' = p_table_id::text
         and (v_s ->> 'field') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and f.id = (v_s ->> 'field')::uuid;
      if v_field is null then
        raise exception 'The row action "%" changes a column that is not in this table.', v_name
          using errcode = '23503', hint = 'REC-17: a step names a column of this Table by its id. Nothing was written.';
      end if;
      if v_field ->> 'type' = 'formula' or v_field ->> 'source' = 'formula' then
        raise exception 'The row action "%" sets "%", which is worked out by the store and cannot be set.', v_name, v_field ->> 'label'
          using errcode = '22023', hint = 'FLD-9. Nothing was written.';
      end if;
      if (v_field ->> 'id') = any (v_seen) then
        raise exception 'The row action "%" changes "%" twice.', v_name, v_field ->> 'label' using errcode = '22023';
      end if;
      v_seen := v_seen || (v_field ->> 'id');
      v_set := coalesce(v_s ->> 'set', '');
      if v_set = 'value' then
        if custom._fx_blank(v_s -> 'value') then
          raise exception 'The row action "%" sets "%" to nothing — type the value, or choose Clear.', v_name, v_field ->> 'label'
            using errcode = '22023';
        end if;
        v_steps := v_steps || jsonb_build_array(jsonb_build_object('field', v_field ->> 'id', 'set', 'value', 'value', v_s -> 'value'));
      elsif v_set = 'clear' then
        v_steps := v_steps || jsonb_build_array(jsonb_build_object('field', v_field ->> 'id', 'set', 'clear'));
      elsif v_set in ('compute', 'formula') then
        if nullif(btrim(coalesce(v_s ->> 'formula_text', v_s ->> 'expression', '')), '') is not null then
          v_parsed := custom.formula_parse(p_organization_id, p_table_id, coalesce(v_s ->> 'formula_text', v_s ->> 'expression'));
          if not coalesce((v_parsed ->> 'ok')::boolean, false) then
            raise exception 'The row action "%" works "%" out with a formula that cannot be read: %', v_name, v_field ->> 'label', v_parsed ->> 'error'
              using errcode = '22023', hint = format('At character %s. Nothing was written.', coalesce((v_parsed ->> 'position')::integer, 0) + 1);
          end if;
          v_steps := v_steps || jsonb_build_array(jsonb_build_object('field', v_field ->> 'id', 'set', 'compute',
                       'formula_text', coalesce(v_s ->> 'formula_text', v_s ->> 'expression'), 'expr', v_parsed -> 'expr'));
        elsif jsonb_typeof(v_s -> 'expr') = 'object' then
          v_steps := v_steps || jsonb_build_array(jsonb_build_object('field', v_field ->> 'id', 'set', 'compute', 'expr', v_s -> 'expr'));
        else
          raise exception 'The row action "%" works "%" out, and does not say how.', v_name, v_field ->> 'label'
            using errcode = '22023', hint = 'Give the step formula_text (like {Visit fee} - {Deposit taken}) or an expr. Nothing was written.';
        end if;
      else
        raise exception 'A step of "%" says "%", and a step sets a value, clears, or computes.', v_name, coalesce(nullif(v_set, ''), 'nothing')
          using errcode = '22023';
      end if;
    end loop;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', v_id, 'name', v_name, 'kind', 'update', 'steps', v_steps,
      'color', nullif(v_a ->> 'color', ''), 'icon', left(nullif(btrim(v_a ->> 'icon'), ''), 64),
      'confirm', coalesce((v_a ->> 'confirm')::boolean, false))));
  end loop;
  return v_out;
end
$function$;
CREATE OR REPLACE FUNCTION custom._doc_signature_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row record := coalesce(new, old);   -- `new` is unassigned on DELETE; reading it raises
begin
  -- THE DOOR. One call to the ONE predicate, exactly as every other RETURNS trigger in this
  -- schema. The switch decides WHO may write and never which check runs: everything below
  -- runs whether it is on or off, because "immutable once signed" is not a product option.
  perform custom.assert_store_door(v_row.organization_id, 'custom.doc_signature');

  if tg_op = 'INSERT' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'this signature was made on % and cannot be changed', to_char(old.signed_at, 'FMDD Month YYYY "at" HH24:MI')
      using errcode = '42501',
            hint = 'VAL-10: a signature is immutable once signed - that is the whole of what a signature is worth. Nothing changes a seal, and the store''s own switch custom/system_enabled does not open this either. If the document needs signing again, render it again: custom.doc_render_document gives a new document version, and a signature on THAT version is a new seal standing beside this one.';
  end if;

  raise exception 'this signature was made on % and cannot be removed', to_char(old.signed_at, 'FMDD Month YYYY "at" HH24:MI')
    using errcode = '42501',
          hint = 'VAL-10: a seal is the evidence that somebody agreed to something, and evidence that can be deleted by whoever it inconveniences is not evidence. It names its signer, its time, its hash and the document version it signed, and it keeps naming them.';
end;
$function$;

CREATE OR REPLACE FUNCTION custom._read_record_with(p_organization_id uuid, p_record_id uuid, p_by_id boolean, p_levels jsonb, p_cache jsonb, OUT o_doc jsonb, OUT o_cache jsonb)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_table    uuid;
  v_doc      jsonb;
  v_mask     jsonb;
  v_visible  text[];
  v_declared text[];
  v_now      uuid;
  v_alts     jsonb;
  v_retired  jsonb;
  v_out      jsonb;
  v_wv_values  jsonb;
  v_wv_sources jsonb;
  v_row      custom.record;
  v_vs       record;
  v_ck       text;
  v_known    boolean;
  v_key_ids  jsonb;
begin
  o_cache := coalesce(p_cache, '{}'::jsonb);
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  -- ARGS-RULED (2026-09-21). THE WALL IS DECIDED FIRST, AND IT WAS NOT DECIDED AT ALL.
  -- REC-29: "organizations are hard walls, and a door decides who may reach one before it
  -- decides anything else" — every other door in this store obeys it and DOOR-1, the one read
  -- door, did not. It made no membership decision about the organization it was handed.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_record');

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE — a redirect, never a silent substitution.
  v_now := custom.resolve_id(p_organization_id, p_record_id);
  -- STORE-READ-PERF-2: a set door that already asked the ladder about this record for the whole
  -- set (custom.levels_of) hands the answer in; alone, the door asks it here as it always did.
  v_known := coalesce(p_levels ? v_now::text, false);

  -- AND THE LADDER BEFORE EXISTENCE. This used to raise 02000 "there is no record % in this
  -- organization" BEFORE asking custom.has_visibility, so the two answers differed: a caller who
  -- guessed a record uuid learned whether it existed in that organization (02000) or not
  -- (42501). One bit per guess, and the store's own rule is that a record you may not open and a
  -- record that is not there answer the same thing. `custom.has_visibility` answers false for an
  -- id that is not there, so this ordering makes the two identical without a second read.
  if not (case when v_known then (p_levels -> v_now::text ->> 's')::boolean
               else custom.has_visibility(v_me, 'record', v_now, 'viewer') end) then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an agent, not an export. Ask somebody who holds it to share it with you.';
  end if;

  select r.* into v_row
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_now and r.deleted_at is null;
  if not found then
    -- Only somebody the ladder has already admitted reaches this sentence, so it now tells a
    -- person who holds the record that it is in the trash — and tells a stranger nothing.
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000', hint = 'It was deleted, or it never existed here.';
  end if;
  v_table := v_row.table_id;
  v_wv_values := v_row.data -> '_values';
  v_wv_sources := v_row.data -> '_sources';
  -- custom.record_values_of(r), with the Table's plan carried from record to record.
  select * into v_vs from custom.record_values_step(v_row, o_cache);
  v_doc := v_vs.o_doc;
  o_cache := v_vs.o_cache;

  -- THE ONE FACT. `custom.read_mask` is the whole of what this door used to work out privately.
  v_mask := custom.read_mask_at(v_now, v_known, (p_levels -> v_now::text ->> 'l')::public.permission_level, 'read');
  -- STORE-READ-PERF-2 / DOOR-N-5: id-keyed on request means EVERY declared Field's key, as the
  -- page doors have always done — not only the hidden ones.
  v_key_ids := coalesce(v_mask -> 'all_key_ids', v_mask -> 'key_ids');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;

  v_out := custom.mask_document(v_doc, v_visible, v_mask -> 'notices', p_by_id,
                                v_key_ids, v_declared);

  -- CHOICE-VALUE. Rendered AFTER masking, so a field this reader may not see keeps its notice
  -- and is never resolved.
  if v_table is not null then
    v_ck := 'cr:' || p_organization_id::text || ':' || v_table::text;
    if not (o_cache ? v_ck) then
      o_cache := o_cache || jsonb_build_object(v_ck, custom.choice_render_plan(p_organization_id, v_table));
    end if;
    v_out := custom.choice_render_with(p_organization_id, v_table, v_out, o_cache -> v_ck);
  end if;

  -- BIG-VALUES-READERS. A value too big for one cell keeps its first words here and its whole
  -- text in a file; the pointer (`_values.<key>.src` -> `_sources.<ptr>`, the file fields only)
  -- rides along for the keys this reader may see, so a screen opens the file and an agent's
  -- context reads the whole text. Nothing else of the provenance block is carried.
  v_out := custom.with_whole_value_pointers(v_out, v_wv_values, v_wv_sources, v_visible, p_by_id,
                                            v_key_ids);

  -- T5 / REC-N-11. THE ALTERNATES THE MERGE KEPT — only for keys this reader may see.
  select jsonb_object_agg(k, alts) into v_alts
    from (
      select e.key as k,
             (select jsonb_agg(jsonb_build_object(
                       'value',  a -> 'value',
                       'rank',   a -> 'rank',
                       'source', r.data -> '_sources' -> (a ->> 'src'))
                     order by (a ->> 'rank')::int)
                from jsonb_array_elements(coalesce(e.value -> 'alternates', '[]'::jsonb)) a) as alts
        from custom.record r
        cross join lateral jsonb_each(coalesce(r.data -> '_values', '{}'::jsonb)) e
       where r.organization_id = p_organization_id and r.id = v_now
         and e.key = any (v_visible)
         and jsonb_array_length(coalesce(e.value -> 'alternates', '[]'::jsonb)) > 0
    ) x
   where x.alts is not null;

  if v_alts is not null and v_alts <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_alternates', v_alts);
  end if;

  -- SEAT-SUITES / T5+T12. THE VALUES THE STORE KEPT AND THE DOOR THREW AWAY, masked exactly
  -- like the value they used to be.
  select jsonb_agg(x order by x ->> 'key') into v_retired
    from custom.record r
    cross join lateral jsonb_array_elements(coalesce(r.data -> '_retired', '[]'::jsonb)) x
   where r.organization_id = p_organization_id and r.id = v_now
     and ((x ->> 'key') = any (v_visible) or not ((x ->> 'key') = any (v_declared)));

  if v_retired is not null and jsonb_array_length(v_retired) > 0 then
    v_out := v_out || jsonb_build_object('_retired', v_retired);
  end if;

  if v_now is distinct from p_record_id then
    v_out := v_out || jsonb_build_object(
      '_redirected_from', p_record_id,
      '_redirect_says', 'That record was merged into this one, so its id now answers with this record. REC-21: the merged id resolves to the survivor for good — undoing the merge puts both records and both ids back.');
  end if;

  o_doc := v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.action_run(p_organization_id uuid, p_action_id uuid, p_record_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table    uuid;
  v_tdoc     jsonb;
  v_action   jsonb;
  v_step     jsonb;
  v_fields   jsonb;
  v_field    jsonb;
  v_rid      uuid;
  v_rec      custom.record;
  v_patch    jsonb;
  v_val      jsonb;
  v_values   jsonb;
  v_ctx      jsonb;
  v_refused  jsonb := '[]'::jsonb;
  v_one      jsonb;
  v_done     jsonb := '[]'::jsonb;
  v_ver      integer;
  v_msg      text;
  v_hint     text;
  v_state    text;
  v_whole    text;
  v_named    boolean;
  v_title    text;
  v_max      integer;
  v_n        integer;
  k          text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.action_run');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.action_run');

  -- The action is found inside THIS organization's Tables only, and only on a Table this
  -- person may know; any other id answers exactly as an invented one.
  select t.id, t.data into v_table, v_tdoc
    from custom.record t
   where t.organization_id = p_organization_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null
     and t.data -> 'row_actions' @> jsonb_build_array(jsonb_build_object('id', p_action_id::text))
   limit 1;
  if v_table is null then
    raise exception 'There is no row action % here.', p_action_id
      using errcode = '23503', hint = 'It may have been removed from its table, or it belongs to another organization. Nothing was changed.';
  end if;
  perform custom.assert_may_know_table(p_organization_id, v_table, 'custom.action_run');
  select a into v_action from jsonb_array_elements(v_tdoc -> 'row_actions') a where a ->> 'id' = p_action_id::text;

  if v_action ->> 'kind' = 'agent' then
    raise exception '"%" asks an agent, and an agent is not a fixed change, so it does not run here.', v_action ->> 'name'
      using errcode = '22023',
            hint = 'Open the record''s chat with the action''s prompt (the record-chat launcher does); the agent proposes its changes and a person confirms them. Nothing was changed.';
  end if;

  v_n := coalesce(cardinality(p_record_ids), 0);
  if v_n = 0 then
    raise exception '"%" was run on no records.', v_action ->> 'name'
      using errcode = '22023', hint = 'Select the records it should change. Nothing was changed.';
  end if;
  v_max := coalesce((platform.knob_resolve('custom', 'action_run_records_max', p_organization_id) #>> '{}')::integer, 5000);
  if v_n > v_max then
    raise exception '"%" can run on at most % records at once, and % were selected.', v_action ->> 'name', v_max, v_n
      using errcode = '54000',
            hint = 'Run it on a filtered view in parts. The ceiling is the organization knob custom/action_run_records_max. Nothing was changed.';
  end if;

  -- The columns the steps name, read once.
  select coalesce(jsonb_object_agg(f.id::text, jsonb_build_object('key', f.data ->> 'key', 'label', f.data ->> 'label',
                                   'type', f.data ->> 'type', 'config', f.data -> 'config')), '{}'::jsonb)
    into v_fields
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_table::text;
  for v_step in select e from jsonb_array_elements(v_action -> 'steps') e loop
    if not (v_fields ? (v_step ->> 'field')) then
      raise exception '"%" changes a column that is gone, so it cannot run until it is edited.', v_action ->> 'name'
        using errcode = '23503', hint = 'custom.row_actions names the step under stale. Nothing was changed.';
    end if;
  end loop;
  v_title := coalesce(nullif(v_tdoc ->> 'title_field', ''), 'name');

  foreach v_rid in array p_record_ids loop
    select * into v_rec from custom.record r
     where r.organization_id = p_organization_id and r.id = v_rid and r.table_id = v_table
       and r.data_class = 'record' and r.deleted_at is null;
    if v_rec.id is null then
      v_refused := v_refused || jsonb_build_array(jsonb_build_object('record_id', v_rid, 'record', null, 'field_id', null, 'field', null,
                     'says', format('This record is not a live record of %s.', coalesce(v_tdoc ->> 'name', 'this table'))));
      continue;
    end if;

    -- The patch, worked out against THIS record's own values (row-actions.ts compileRowAction).
    v_values := custom.record_values(p_organization_id, v_rid);
    v_ctx := coalesce(custom.rule_context(p_organization_id, v_rid), '{}'::jsonb)
             || jsonb_build_object('fx_self_id', v_rid, 'fx_table_id', v_table);
    v_patch := '{}'::jsonb;
    begin
      for v_step in select e from jsonb_array_elements(v_action -> 'steps') e loop
        v_field := v_fields -> (v_step ->> 'field');
        v_val := case v_step ->> 'set'
                   when 'clear' then 'null'::jsonb
                   when 'value' then v_step -> 'value'
                   else custom.formula_eval(p_organization_id, v_step -> 'expr', v_values, v_ctx) end;
        v_patch := v_patch || jsonb_build_object(v_field ->> 'key', custom._action_coerce(v_field, v_val));
      end loop;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_refused := v_refused || jsonb_build_array(jsonb_build_object('record_id', v_rid,
                     'record', v_rec.data ->> v_title, 'field_id', v_step ->> 'field', 'field', v_field ->> 'label',
                     'says', format('"%s": %s', v_field ->> 'label', v_msg)));
      continue;
    end;

    -- The write, through the store's own door. A refusal is tried again one column at a time
    -- so it names the FIELD; only this record's attempt is rolled back.
    begin
      v_ver := custom.record_update(p_organization_id, v_rid, v_patch);
      v_done := v_done || jsonb_build_array(jsonb_build_object('record_id', v_rid, 'version', v_ver));
    exception when others then
      get stacked diagnostics v_whole = message_text, v_hint = pg_exception_hint, v_state = returned_sqlstate;
      v_named := false;
      -- A record this person may not change is refused as a RECORD, not column by column.
      for k in select x from jsonb_object_keys(v_patch) x where v_state <> '42501' loop
        begin
          perform custom.record_update(p_organization_id, v_rid, jsonb_build_object(k, v_patch -> k));
          raise exception using errcode = 'P0001', message = 'gridprim action probe passed';
        exception when others then
          get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
          if v_msg <> 'gridprim action probe passed' then
            v_named := true;
            select value into v_field from jsonb_each(v_fields) where value ->> 'key' = k;
            v_refused := v_refused || jsonb_build_array(jsonb_build_object('record_id', v_rid,
                           'record', v_rec.data ->> v_title,
                           'field_id', (select key from jsonb_each(v_fields) where value ->> 'key' = k),
                           'field', v_field ->> 'label', 'code', v_state, 'says', v_msg));
          end if;
        end;
      end loop;
      if not v_named then
        -- The columns pass one by one and fail together (a rule that compares two of them).
        v_refused := v_refused || jsonb_build_array(jsonb_build_object('record_id', v_rid,
                       'record', v_rec.data ->> v_title, 'field_id', null, 'field', null, 'code', v_state, 'says', v_whole));
      end if;
    end;
  end loop;

  if jsonb_array_length(v_refused) > 0 then
    v_one := v_refused -> 0;
    raise exception '"%" changed nothing: % of the % selected records refused it. First: %',
      v_action ->> 'name', (select count(distinct r ->> 'record_id') from jsonb_array_elements(v_refused) r), v_n,
      case when v_one ->> 'record' is not null then (v_one ->> 'record') || ' — ' else '' end
      || case when v_one ->> 'field' is not null then (v_one ->> 'field') || ': ' || (v_one ->> 'says') else v_one ->> 'says' end
      using errcode = '23514',
            detail = v_refused::text,
            hint = 'The selection is one change: it happens for every record or for none. DETAIL lists every record and field that refused and why; fix those (or run the action on the others) and run it again.';
  end if;

  return jsonb_build_object('action_id', p_action_id, 'action', v_action ->> 'name', 'table_id', v_table,
                            'ran', jsonb_array_length(v_done), 'records', v_done);
end
$function$;

CREATE OR REPLACE FUNCTION custom.agg_digest_assemble(p_organization_id uuid, p_rule_id uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_rule    custom.record;
  v_sub     jsonb;
  v_who     uuid;
  v_view    uuid;
  v_def     jsonb;
  v_table   uuid;
  v_cadence text;
  v_since   timestamptz;
  v_until   timestamptz := coalesce(p_until, now());
  v_name    text;
  c         record;
  v_then    jsonb;
  v_now     jsonb;
  v_live    boolean;
  v_in_now  boolean;
  v_in_then boolean;
  v_entered jsonb := '[]'::jsonb;
  v_left    jsonb := '[]'::jsonb;
  v_changed jsonb := '[]'::jsonb;
  v_total   bigint := null;
  v_claims  text;
  v_subject text;
  v_body    text;
  v_link    text;
begin
  select * into v_rule from custom.record r
   where r.organization_id = p_organization_id and r.id = p_rule_id
     and r.data_class = 'rule' and r.deleted_at is null;
  if not found or not (v_rule.data ? 'subscription') then
    raise exception 'There is no subscription % here.', p_rule_id
      using errcode = '23503',
            hint = 'It may have been removed, or it may belong to another organization — organizations are hard walls (REC-29).';
  end if;

  v_sub     := v_rule.data -> 'subscription';
  v_who     := nullif(v_sub ->> 'recipient_user_id', '')::uuid;
  v_view    := nullif(v_sub ->> 'saved_view_id', '')::uuid;
  v_cadence := custom.agg_cadence_normalize(v_sub ->> 'cadence');
  v_name    := coalesce(v_rule.data ->> 'name', 'Subscription');

  select sv.definition into v_def from platform.saved_view sv
   where sv.id = v_view and sv.organization_id = p_organization_id and sv.deleted_at is null;

  v_table := coalesce(nullif(v_def ->> 'table_id', '')::uuid,
                      nullif(v_rule.data ->> 'scope_table_id', '')::uuid);

  -- The window starts at the last summary this subscription sent, and on the first
  -- run at one period back — never at "the beginning of time", which would make a
  -- first Monday summary a full export of the table.
  v_since := coalesce(p_since, custom.agg_last_digest_at(p_organization_id, p_rule_id),
                      v_until - case v_cadence when 'hourly' then interval '1 hour'
                                               when 'weekly' then interval '7 days'
                                               else interval '1 day' end);

  if v_def is not null and v_table is not null and v_who is not null then
    for c in
      select distinct o.record_id
        from custom.io_outbox o
       where o.organization_id = p_organization_id
         and o.table_id = v_table
         and o.deleted_at is null
         and o.created_at > v_since
         and o.created_at <= v_until
    loop
      -- THE SUBSCRIBER'S LADDER, asked for the subscriber by name.
      if not custom.has_visibility(v_who, 'record', c.record_id, 'viewer'::public.permission_level) then
        continue;
      end if;

      select r.data, (r.deleted_at is null) into v_now, v_live
        from custom.record r
       where r.organization_id = p_organization_id and r.id = c.record_id;

      v_in_now := coalesce(v_live, false) and custom.agg_view_admits_state(v_def, v_now);

      begin
        select a.state into v_then
          from custom.record_as_of(p_organization_id, c.record_id, v_since) a;
      exception when others then
        v_then := null;              -- history it cannot replay reads as "was not here"
      end;
      v_in_then := custom.agg_view_admits_state(v_def, v_then);

      if v_in_now and not v_in_then then
        v_entered := v_entered || jsonb_build_object(
          'record_id', c.record_id, 'name', custom.agg_record_name(p_organization_id, c.record_id, v_now));
      elsif v_in_then and not v_in_now then
        -- IT LEFT, AND THE SUMMARY SAYS SO. A lead whose stage moved out of the
        -- view is the single most useful line in a Monday summary, and it is the
        -- line a count-based digest can never produce.
        v_left := v_left || jsonb_build_object(
          'record_id', c.record_id, 'name', custom.agg_record_name(p_organization_id, c.record_id, coalesce(v_now, v_then)));
      elsif v_in_now then
        v_changed := v_changed || jsonb_build_object(
          'record_id', c.record_id, 'name', custom.agg_record_name(p_organization_id, c.record_id, v_now));
      end if;
    end loop;

    -- HOW MANY ARE IN THE VIEW ALTOGETHER, from the eighth verb, under the
    -- SUBSCRIBER's seat — so the number in the summary is the number the dashboard
    -- shows, produced by the same code rather than by a second count here.
    v_claims := current_setting('request.jwt.claims', true);
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', v_who)::text, true);
      select coalesce(sum(a.row_count), 0) into v_total
        from custom.record_aggregate(p_organization_id, v_table, '[]'::jsonb,
               jsonb_build_array(jsonb_build_object('op', 'count')),
               null,
               -- THE VIEW'S OWN FILTERS, handed to the eighth verb. Without them the
               -- number was the whole TABLE: a summary that had just named one lead
               -- leaving said "3 in the view now" while the view held two.
               coalesce(v_def -> 'filters', '{}'::jsonb)) a;
    exception when others then
      v_total := null;
    end;
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  end if;

  -- The click-through: the grid, filtered by the very view this subscription is over.
  v_link := case when v_table is not null
                 then format('/data-v2/%s%s', v_table,
                             case when v_view is not null then format('?view=%s', v_view) else '' end)
            end;

  v_subject := case
    when jsonb_array_length(v_entered) > 0
      then format('%s: %s new', v_name, jsonb_array_length(v_entered))
    when jsonb_array_length(v_left) + jsonb_array_length(v_changed) > 0
      then format('%s: %s update(s)', v_name,
                  jsonb_array_length(v_left) + jsonb_array_length(v_changed))
    else format('%s: nothing new', v_name) end;

  v_body := btrim(concat_ws(' ',
    case when jsonb_array_length(v_entered) > 0 then
      format('%s arrived: %s.', jsonb_array_length(v_entered),
             (select string_agg(e ->> 'name', ', ') from jsonb_array_elements(v_entered) e)) end,
    case when jsonb_array_length(v_left) > 0 then
      format('%s left the view: %s.', jsonb_array_length(v_left),
             (select string_agg(e ->> 'name', ', ') from jsonb_array_elements(v_left) e)) end,
    case when jsonb_array_length(v_changed) > 0 then
      format('%s changed: %s.', jsonb_array_length(v_changed),
             (select string_agg(e ->> 'name', ', ') from jsonb_array_elements(v_changed) e)) end,
    case when v_total is not null then format('%s in the view now.', v_total) end,
    format('Since %s.', to_char(v_since at time zone 'utc', 'FMDay DD FMMonth YYYY HH24:MI') || ' UTC')));

  return jsonb_build_object(
    'rule_id', p_rule_id, 'name', v_name, 'cadence', v_cadence,
    'schedule', nullif(v_sub ->> 'schedule', ''),
    'quiet_hours', case when jsonb_typeof(v_sub -> 'quiet_hours') = 'object'
                        then v_sub -> 'quiet_hours' else null end,
    'channel', coalesce(v_sub ->> 'channel', 'in_app'),
    'recipient_user_id', v_who,
    'muted', coalesce((v_sub ->> 'muted')::boolean, false),
    'table_id', v_table, 'saved_view_id', v_view,
    'window_start', v_since, 'window_end', v_until,
    'entered', v_entered, 'left', v_left, 'changed', v_changed,
    'counts', jsonb_build_object('entered', jsonb_array_length(v_entered),
                                 'left', jsonb_array_length(v_left),
                                 'changed', jsonb_array_length(v_changed),
                                 'in_view', v_total),
    'link', v_link, 'subject', v_subject, 'body', v_body,
    -- NOTHING FAILS SILENTLY: a subscription that cannot produce a summary says
    -- which piece is missing, in the words a person reads on the screen.
    'incomplete', case
      when v_who is null then 'This subscription has nobody to tell, so it sends nothing.'
      when v_view is null then 'This subscription names no saved view, so nothing is ever admitted to it.'
      when v_def is null then 'The saved view this subscription watches has been deleted, so it sends nothing.'
      when v_table is null then 'The saved view does not say which table it is over, so nothing can be summarised.'
      else null end);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.anon_publish(p_organization_id uuid, p_form_id uuid, p_published boolean DEFAULT true)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user  uuid := custom.query_principal();
  v_table uuid;
  v_at    timestamptz;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_publish');
  select f.table_id into v_table from custom.anon_form f
   where f.organization_id = p_organization_id and f.id = p_form_id and f.deleted_at is null;
  if v_table is null then
    raise exception 'custom.anon_publish: no form % in this organization', p_form_id
      using errcode = '23503';
  end if;
  -- PUBLISHING A FORM OPENS A WRITE PATH FOR PEOPLE WITH NO ACCOUNT. That is an admin act on
  -- the Table, not an editor act: whoever may publish is deciding that strangers may add rows.
  if not custom.has_visibility(v_user, 'record', v_table, 'admin'::public.permission_level) then
    raise exception 'You may not publish this form.'
      using errcode = '42501',
            hint = 'Publishing opens a write path for people with no account, so it needs the admin level on the Table the form writes into — the same level that decides who may reach the Table at all.';
  end if;

  v_at := case when p_published then now() else null end;
  update custom.anon_form
     set published_at = v_at,
         published_by = case when p_published then v_user else published_by end,
         closed_at    = case when p_published then null else now() end
   where organization_id = p_organization_id and id = p_form_id;
  return v_at;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.anon_rate_take(p_organization_id uuid, p_form_id uuid, p_bucket text, p_token_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_form   custom.anon_form;
  v_start  timestamptz;
  v_hits   integer;
begin
  select * into v_form from custom.anon_form
   where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
  if not found then
    raise exception 'custom.anon_rate_take: no form % in this organization', p_form_id
      using errcode = '23503';
  end if;

  -- The window is a FLOOR of now(), so every request in the same window lands on the same row
  -- and the unique index makes the count atomic. Reading a count and then writing it back is
  -- the classic way two simultaneous requests both become the nth.
  v_start := to_timestamp(floor(extract(epoch from now())
                                / greatest(1, extract(epoch from v_form.rate_limit_window)))
                          * greatest(1, extract(epoch from v_form.rate_limit_window)));

  insert into custom.anon_hit (organization_id, form_id, token_id, bucket, window_start, hits)
  values (p_organization_id, p_form_id, p_token_id, p_bucket, v_start, 1)
  on conflict (organization_id, form_id, bucket, window_start) where deleted_at is null
    do update set hits = custom.anon_hit.hits + 1
  returning hits into v_hits;

  if v_hits > v_form.rate_limit_per_window then
    raise exception 'Too many submissions. This form takes % per %.',
      v_form.rate_limit_per_window, v_form.rate_limit_window
      using errcode = '53400',
            hint = 'Wait for the window to pass and send it again; nothing was lost. If this form should take more, raise its limit — it is a setting on the form, not a number in code.';
  end if;
  return v_hits;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.anon_token_issue(p_organization_id uuid, p_mode text, p_allowed_origins jsonb, p_form_id uuid DEFAULT NULL::uuid, p_saved_view_id uuid DEFAULT NULL::uuid, p_record_id uuid DEFAULT NULL::uuid, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(token_id uuid, secret text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user   uuid := custom.query_principal();
  v_table  uuid;
  v_secret text;
  v_id     uuid;
  v_n      integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_token_issue');
  if coalesce(p_mode, '') not in ('read', 'write') then
    raise exception 'custom.anon_token_issue: mode is read or write, not "%". A token carrying both would be one credential holding two decisions, and the second is always the one nobody meant to grant.', p_mode
      using errcode = '22023';
  end if;

  select count(*) into v_n from jsonb_array_elements_text(coalesce(p_allowed_origins, '[]'::jsonb));
  if v_n = 0 then
    -- An empty origin list is refused at ISSUE rather than silently meaning "everywhere".
    raise exception 'custom.anon_token_issue: name the origins this token works from.'
      using errcode = '22004',
            hint = 'An embed token with no origin list is a token that works from any page on the internet, including an attacker''s. Pass the exact origins, scheme and host and port: ["https://example.com"].';
  end if;

  if p_mode = 'write' then
    if p_form_id is null then
      raise exception 'custom.anon_token_issue: a write token must name the form it writes to'
        using errcode = '22004';
    end if;
    select f.table_id into v_table from custom.anon_form f
     where f.organization_id = p_organization_id and f.id = p_form_id and f.deleted_at is null;
    if v_table is null then
      raise exception 'custom.anon_token_issue: no form % in this organization', p_form_id
        using errcode = '23503';
    end if;
    if not custom.has_visibility(v_user, 'record', v_table, 'admin'::public.permission_level) then
      raise exception 'You may not issue a write token for this form.'
        using errcode = '42501',
              hint = 'Issuing a write token hands a stranger a way in, so it needs the admin level on the Table the form writes into.';
    end if;
  elsif p_record_id is not null then
    if not custom.has_visibility(v_user, 'record', p_record_id, 'admin'::public.permission_level) then
      raise exception 'You may not issue a read token for this record.'
        using errcode = '42501',
              hint = 'A read token lets anyone holding it read the record from an allowed origin, so issuing one needs the admin level on that record.';
    end if;
  end if;

  -- ARGS-RULED (2026-09-21). AND THE SAVED VIEW, ON THE SAME LADDER AS THE RECORD BESIDE IT.
  -- `p_saved_view_id` was written into custom.anon_token with nothing asked about it, and the
  -- token this door mints grants ANONYMOUS reads — so a member could issue a public token over a
  -- saved view they do not hold. The record arm above has asked `admin` since the day it was
  -- written; a saved view is a Record of this store like any other and takes the same question.
  if p_saved_view_id is not null
     and not custom.has_visibility(v_user, 'record', p_saved_view_id, 'admin'::public.permission_level) then
    raise exception 'You may not issue a token for this saved view.'
      using errcode = '42501',
            hint = 'A token over a saved view lets anyone holding it read that view from an allowed origin, so issuing one needs the admin level on the view - the same level the record arm of this door has always asked for.';
  end if;

  -- The secret is minted here and returned ONCE. Only its digest is stored, so a database read
  -- — a backup, a support query, a leaked dump — cannot produce a working token.
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  insert into custom.anon_token (organization_id, form_id, saved_view_id, record_id, mode,
                                 secret_hash, allowed_origins, expires_at, created_by)
  values (p_organization_id, p_form_id, p_saved_view_id, p_record_id, p_mode,
          encode(extensions.digest(v_secret, 'sha256'), 'hex'),
          coalesce(p_allowed_origins, '[]'::jsonb), p_expires_at, v_user)
  returning id into v_id;

  token_id := v_id; secret := v_secret; return next;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.anon_token_verify(p_secret text, p_origin text, p_required_mode text)
 RETURNS TABLE(token_id uuid, organization_id uuid, form_id uuid, saved_view_id uuid, record_id uuid, mode text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_hash text := encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex');
  v_tok  custom.anon_token;
begin
  select * into v_tok from custom.anon_token t
   where t.secret_hash = v_hash and t.deleted_at is null;
  if not found then
    raise exception 'This embed link is not valid.'
      using errcode = '42501',
            hint = 'The token does not match any issued token. It may have been mistyped, or it may have been rotated — issue a new embed and replace the old one.';
  end if;
  if v_tok.revoked_at is not null then
    raise exception 'This embed link was revoked on %.', to_char(v_tok.revoked_at, 'YYYY-MM-DD')
      using errcode = '42501',
            hint = 'Whoever owns the form or view revoked it. A new embed has to be issued; the old link will never work again.';
  end if;
  if v_tok.expires_at is not null and v_tok.expires_at < now() then
    raise exception 'This embed link expired on %.', to_char(v_tok.expires_at, 'YYYY-MM-DD')
      using errcode = '42501',
            hint = 'Issue a new embed. The expiry is a property of the token, so extending it is not possible — that is what makes an expiry mean something.';
  end if;
  -- THE ORIGIN CHECK, AND IT IS EXACT. Not a suffix match, not a wildcard: an attacker's
  -- `https://example.com.evil.test` passes a suffix check and fails this one.
  if not exists (select 1 from jsonb_array_elements_text(v_tok.allowed_origins) o
                  where o = p_origin) then
    raise exception 'This embed does not work on %.', coalesce(p_origin, '(no origin)')
      using errcode = '42501',
            hint = 'The token names the exact sites it works from. Add this origin to the embed, or use the embed that was issued for this site.';
  end if;
  if p_required_mode is not null and v_tok.mode <> p_required_mode then
    raise exception 'This embed is a %-only link.', v_tok.mode
      using errcode = '42501',
            hint = 'A read token cannot write and a write token cannot read. Issue the one you need; a token carrying both would be one credential holding two decisions.';
  end if;

  update custom.anon_token set last_used_at = now()
   where custom.anon_token.id = v_tok.id
     and custom.anon_token.organization_id = v_tok.organization_id;

  token_id := v_tok.id; organization_id := v_tok.organization_id; form_id := v_tok.form_id;
  saved_view_id := v_tok.saved_view_id; record_id := v_tok.record_id; mode := v_tok.mode;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.booking_declare(p_organization_id uuid, p_table_id uuid, p_title text, p_questions jsonb, p_availability jsonb DEFAULT '{}'::jsonb, p_presentation jsonb DEFAULT '{}'::jsonb, p_submission_cap integer DEFAULT NULL::integer, p_quarantine_rule_id uuid DEFAULT NULL::uuid, p_notify_rule_id uuid DEFAULT NULL::uuid, p_form_id uuid DEFAULT NULL::uuid, p_slug text DEFAULT NULL::text, p_home_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user   uuid := custom.query_principal();
  v_avail  jsonb;
  v_slug   text;
  v_slots  uuid;
  v_made   jsonb;
  v_keys   text[];
  v_q      jsonb;
  v_all    jsonb;
  v_home   uuid;
  v_form   uuid;
  v_t0     timestamptz := clock_timestamp();
  v_hidden integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.booking_declare');
  if v_user is null then
    raise exception 'Nobody is signed in, so no booking page can be made.'
      using errcode = '42501',
            hint = 'custom.booking_declare is the owner''s side. The public side — custom.booking_public, custom.booking_hold and custom.booking_confirm — is the one that has no principal.';
  end if;
  -- A BOOKING PAGE DECIDES WHAT A STRANGER MAY WRITE INTO A TABLE and what hours of an
  -- organization's week are on offer, so it is the same ADMIN act custom.form_declare is.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.booking_declare',
                                          'admin'::public.permission_level, 'table');

  v_avail := custom._booking_availability(p_organization_id, p_availability);

  select array_agg(f ->> 'name') into v_keys
    from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_keys is null then
    raise exception 'There is no table % in this organization to take bookings into.', p_table_id
      using errcode = '23503',
            hint = 'A booking page is a view on a real Table (SCR-29). Make the Table first — every question is one of its Fields and every booking is one of its records.';
  end if;

  -- THE THREE THE STORE FILLS IN. Declared on the Table if they are not there yet, so a
  -- booking page can be put over a Table that was made for something else.
  --
  -- 🚨 RED-SUITES 2026-09-21 — `::text`, AND WITHOUT IT THIS DOOR COULD NOT DECLARE A BOOKING
  -- PAGE AT ALL OVER ANY TABLE MISSING ONE OF THE THREE — which is every Table "made for
  -- something else", the case the comment above is about. `v_keys` is `text[]`, and for
  -- `anyarray || <untyped literal>` Postgres resolves the ARRAY || ARRAY operator and casts
  -- the literal to `text[]`, so the statement dies:
  --     ERROR:  malformed array literal: "slot"
  --     CONTEXT: PL/pgSQL function custom.booking_declare(…) line 46 at assignment
  -- VERIFIER-8 recorded it against `booking_green` AND `booking_red` — both twins died on the
  -- same line, which is the tell that it was the door and not the suites. The cast names the
  -- element type and the append means what it reads as.
  if not ('slot' = any (v_keys)) then
    perform custom.field_declare(p_organization_id, p_table_id, jsonb_build_object(
      'key', 'slot', 'label', 'Appointment', 'type', 'text', 'required', true, 'sort', 900));
    v_keys := v_keys || 'slot'::text;   -- ::text — RED-SUITES 2026-09-21, see the note above
  end if;
  if not ('status' = any (v_keys)) then
    perform custom.field_declare(p_organization_id, p_table_id, jsonb_build_object(
      'key', 'status', 'label', 'Status', 'type', 'text', 'required', false, 'sort', 910));
    v_keys := v_keys || 'status'::text;   -- ::text — RED-SUITES 2026-09-21, see the note above
  end if;
  if not ('booked_with' = any (v_keys)) then
    perform custom.field_declare(p_organization_id, p_table_id, jsonb_build_object(
      'key', 'booked_with', 'label', 'With', 'type', 'text', 'required', false, 'sort', 920));
    v_keys := v_keys || 'booked_with'::text;   -- ::text — RED-SUITES 2026-09-21, see the note above
  end if;

  -- ─────────────────────────────────────────────────────────────────────────
  -- A STATUS THAT CANNOT HOLD THE WORDS THIS PAGE WILL WRITE (walk 2, 2026-09-21).
  --
  -- The three columns above are declared as plain text when the Table has none.
  -- But a Table made for something else usually ALREADY has a `status`, and on
  -- a real one it is a CHOICE LIST — Ironclad Mobile Mechanic's Service Calls
  -- offers Scheduled, Completed, Cancelled and nothing else. This door reused
  -- it happily, the page published, a customer picked a time, her slot was
  -- HELD, and `custom.booking_confirm` was then refused at the last step with
  -- "Status does not have a choice called \"booked\"." She lost the booking and
  -- the owner never heard about it.
  --
  -- The refusal was right and it arrived in the wrong PLACE. Whether this Table
  -- can hold a booking is knowable when the page is DECLARED, so it is decided
  -- here — once, with the remedy named and the choices that do exist listed —
  -- rather than once per visitor, after a hold, at the end.
  -- ─────────────────────────────────────────────────────────────────────────
  declare
    v_opts   uuid;
    v_words  text[];
    v_missing text[] := array[]::text[];
  begin
    select nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid into v_opts
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'key' = 'status'
       and nullif(f.data ->> 'table_id', '')::uuid = p_table_id
     limit 1;

    if v_opts is not null then
      -- A CHOICE ROW IS AN ORDINARY RECORD AND ITS WORD LIVES IN `title` —
      -- reading `name`/`label` first found nothing on every real choices Table
      -- and would have refused a Table that CAN hold the words. Caught before
      -- it ever refused anybody (lane BUILDERS, 2026-09-21).
      select array_agg(lower(btrim(coalesce(c.data ->> 'title', c.data ->> 'name', c.data ->> 'label', ''))))
        into v_words
        from custom.record c
       where c.organization_id = p_organization_id
         and c.table_id = v_opts
         and c.deleted_at is null;
      v_words := coalesce(v_words, array[]::text[]);

      if not ('booked' = any (v_words)) then
        v_missing := v_missing || 'booked'::text;
      end if;
      if not ('cancelled' = any (v_words)) then
        v_missing := v_missing || 'cancelled'::text;
      end if;

      if array_length(v_missing, 1) is not null then
        raise exception 'This table''s Status is a list of choices, and it has no choice called %.',
                        array_to_string(v_missing, ' or ')
          using errcode = '23514',
                hint = format(
                  'A booking page writes "booked" onto an appointment when somebody takes a time and "cancelled" when they give it back, so Status has to be able to hold both words. Its choices today are: %s. Add the missing ones to that list and make the page again — otherwise a visitor would pick a time, hold it, and be refused at the last step.',
                  case when array_length(v_words, 1) is null then '(none)'
                       else array_to_string(v_words, ', ') end);
      end if;
    end if;
  end;

  if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'A booking page has to ask the person something — at least who they are.'
      using errcode = '22004',
            hint = 'questions is a list of {"field": "<the field''s key on this table>", "ask": "…", "required": true}. Name and email are what Calendly and Cal.com ask, and they are the minimum for being able to confirm an appointment with somebody.';
  end if;

  -- The visitor's questions first, in their order, then the three the store fills in.
  v_all := '[]'::jsonb;
  for v_q in select value from jsonb_array_elements(p_questions) loop
    if coalesce(v_q ->> 'field', v_q ->> 'key', '') in ('slot', 'status', 'booked_with') then
      -- Asking a visitor for the time they already picked is how a booking ends up with
      -- two different times on it.
      raise exception 'A booking page never asks for "%": the store fills it in from the slot that was held.',
                      coalesce(v_q ->> 'field', v_q ->> 'key')
        using errcode = '22023',
              hint = 'slot, status and booked_with are set by custom.booking_confirm, custom.booking_reschedule and custom.booking_cancel. Ask for the things only the person knows.';
    end if;
    v_all := v_all || jsonb_build_array(v_q);
  end loop;
  v_all := v_all
    || jsonb_build_array(
         jsonb_build_object('field', 'slot', 'ask', 'The time you picked',
                            'hidden', true, 'required', true),
         jsonb_build_object('field', 'status', 'ask', 'Status', 'hidden', true, 'required', false),
         jsonb_build_object('field', 'booked_with', 'ask', 'With', 'hidden', true, 'required', false));
  v_hidden := 3;

  -- ── the slots Table: ONE per bookings Table, found before it is made ───────────────
  -- Two booking pages over one Table must hold against the SAME slots Table, or each has
  -- its own private idea of what is free and the unique index protects nothing.
  v_slug := 'booking_slots_' || replace(p_table_id::text, '-', '');
  select r.id into v_slots from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.table_kernel_id()
     and r.deleted_at is null
     and r.data ->> 'slug' = v_slug;
  if v_slots is null then
    -- The slots Table lives wherever the bookings Table lives, so the two are found in
    -- one place rather than one of them landing in the default home on its own.
    v_home := p_home_id;
    if v_home is null then
      select nullif(r.data ->> 'parent_id', '')::uuid into v_home from custom.record r
       where r.organization_id = p_organization_id and r.id = p_table_id
         and r.table_id = custom.table_kernel_id() and r.deleted_at is null;
    end if;
    v_made := custom.work_slots_declare(p_organization_id,
                                        'Slots for ' || coalesce(nullif(btrim(p_title), ''), 'bookings'),
                                        v_slug, v_home);
    v_slots := (v_made ->> 'table_id')::uuid;
  end if;

  v_form := custom.form_declare(
    p_organization_id, p_table_id, p_title, v_all,
    coalesce(p_presentation, '{}'::jsonb)
      || jsonb_build_object('booking', v_avail || jsonb_build_object('slot_table_id', v_slots)),
    p_submission_cap, p_quarantine_rule_id, p_notify_rule_id, p_form_id, p_slug);

  return jsonb_build_object(
    'form_id', v_form,
    'slot_table_id', v_slots,
    'availability', v_avail,
    'questions_asked', jsonb_array_length(v_all) - v_hidden,
    'questions_filled_in', v_hidden,
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.capture_publish(p_organization_id uuid, p_sheet_id uuid, p_open boolean DEFAULT true)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f custom.anon_form;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.capture_publish');

  select * into v_f from custom.anon_form
   where organization_id = p_organization_id and id = p_sheet_id and deleted_at is null;
  if not found then
    raise exception 'There is no capture sheet % in this organization.', p_sheet_id
      using errcode = '23503';
  end if;
  if v_f.audience <> 'crew' then
    raise exception 'That is a public form, not a capture sheet.'
      using errcode = '23514',
            hint = 'A public form is opened with custom.anon_publish and answered by strangers with the link. A capture sheet is opened here and answered by members of this organization on their phones.';
  end if;

  -- OPENING A WRITE PATH INTO A TABLE IS AN ADMIN ACT, the same rung declaring it asks for.
  perform custom.assert_client_may_change(p_organization_id, v_f.table_id, 'custom.capture_publish',
                                          'admin'::public.permission_level, 'table');

  update custom.anon_form
     set capture_opened_at = case when p_open then coalesce(capture_opened_at, now()) else null end,
         capture_opened_by = case when p_open then coalesce(capture_opened_by, custom.query_principal()) else null end
   where organization_id = p_organization_id and id = p_sheet_id
  returning capture_opened_at into v_f.capture_opened_at;

  return v_f.capture_opened_at;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_item_write(p_item_id uuid, p_scope_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  jsonb;
  s jsonb := coalesce(p_spec, '{}'::jsonb);
  v_org  uuid;
  v_rowupdate boolean;
begin
  if p_item_id is null then
    v_row := public.create_context_item(
      p_scope_type_id, s ->> 'key', s ->> 'display_name', coalesce(s ->> 'value_type', 'string')::public.context_value_type,
      coalesce(s ->> 'description', ''), s ->> 'category',
      coalesce(s ->> 'fetch_hint', 'on_demand')::public.context_fetch_hint,
      coalesce(s ->> 'sensitivity', 'internal')::public.context_sensitivity,
      coalesce(array(select jsonb_array_elements_text(s -> 'tags')), '{}'::text[]),
      nullif(s ->> 'slug', ''), (s ->> 'sort_order')::smallint,
      case when jsonb_typeof(s -> 'allowed_reference_types') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_reference_types')) end,
      (s ->> 'max_items')::int,
      case when jsonb_typeof(s -> 'allowed_scope_type_ids') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_scope_type_ids'))::uuid[] end,
      case when jsonb_typeof(s -> 'reference_source') = 'object' then s -> 'reference_source' end);
  else
    v_rowupdate := exists (select 1 from jsonb_each(s) e where jsonb_typeof(e.value) = 'null')
                   or s ?| array['custom_component', 'review_interval_days', 'allowed_reference_types', 'max_items',
                                 'allowed_scope_type_ids', 'reference_source'];
    if v_rowupdate then
      update context.context_items i
         set display_name = case when s ? 'display_name' then s ->> 'display_name' else i.display_name end,
             description = case when s ? 'description' then s ->> 'description' else i.description end,
             category = case when s ? 'category' then s ->> 'category' else i.category end,
             value_type = case when s ? 'value_type' then (s ->> 'value_type')::public.context_value_type else i.value_type end,
             fetch_hint = case when s ? 'fetch_hint' then (s ->> 'fetch_hint')::public.context_fetch_hint else i.fetch_hint end,
             sensitivity = case when s ? 'sensitivity' then (s ->> 'sensitivity')::public.context_sensitivity else i.sensitivity end,
             tags = case when s ? 'tags' then coalesce(array(select jsonb_array_elements_text(s -> 'tags')), '{}'::text[]) else i.tags end,
             sort_order = case when s ? 'sort_order' then (s ->> 'sort_order')::smallint else i.sort_order end,
             status = case when s ? 'status' then (s ->> 'status')::public.context_item_status else i.status end,
             status_note = case when s ? 'status_note' then s ->> 'status_note' else i.status_note end,
             custom_component = case when s ? 'custom_component' then case when jsonb_typeof(s -> 'custom_component') = 'null' then null else s -> 'custom_component' end else i.custom_component end,
             review_interval_days = case when s ? 'review_interval_days' then (s ->> 'review_interval_days')::int else i.review_interval_days end,
             allowed_reference_types = case when s ? 'allowed_reference_types' then case when jsonb_typeof(s -> 'allowed_reference_types') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_reference_types')) end else i.allowed_reference_types end,
             max_items = case when s ? 'max_items' then coalesce((s ->> 'max_items')::int, 1) else i.max_items end,
             allowed_scope_type_ids = case when s ? 'allowed_scope_type_ids' then case when jsonb_typeof(s -> 'allowed_scope_type_ids') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_scope_type_ids'))::uuid[] end else i.allowed_scope_type_ids end,
             reference_source = case when s ? 'reference_source' then case when jsonb_typeof(s -> 'reference_source') = 'null' then null else s -> 'reference_source' end else i.reference_source end
       where i.id = p_item_id
      returning to_jsonb(i.*) into v_row;
      if v_row is null then
        raise exception 'There is no context field % you may change.', p_item_id using errcode = '42501';
      end if;
    else
      v_row := public.update_context_item(
        p_item_id, s ->> 'display_name', s ->> 'description', s ->> 'category',
        (s ->> 'value_type')::public.context_value_type, (s ->> 'fetch_hint')::public.context_fetch_hint,
        (s ->> 'sensitivity')::public.context_sensitivity,
        case when s ? 'tags' then array(select jsonb_array_elements_text(s -> 'tags')) end,
        (s ->> 'sort_order')::smallint, (s ->> 'status')::public.context_item_status, s ->> 'status_note');
    end if;
  end if;
  select t.organization_id into v_org from context.scope_types t where t.id = (v_row ->> 'scope_type_id')::uuid;
  return custom._ctx_answer(v_org, (v_row ->> 'id')::uuid, v_row);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_template_apply(p_organization_id uuid, p_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_def jsonb;
begin
  perform custom.assert_scope_door(p_organization_id, 'custom.context_template_apply');
  if not exists (select 1 from context.templates t where t.id = p_template_id and t.is_active) then
    raise exception 'There is no template % to apply; it may have been retired.', p_template_id using errcode = 'P0002';
  end if;
  -- THE PLATFORM'S TEMPLATE CATALOGUE STAYS REFERENCE DATA (SCOPES-CONTEXT D10); applying one is a
  -- store operation, through the same doors as any other scope type and field.
  select jsonb_build_object('scope_types', coalesce(jsonb_agg(jsonb_build_object(
           'key', st.id::text,
           'singular', st.label_singular, 'plural', st.label_plural,
           'icon', st.icon, 'description', st.description, 'sort_order', st.sort_order,
           'max_assignments_per_entity', st.max_assignments_per_entity,
           'parent_key', st.parent_template_type_id::text,
           'slug', context.slugify(st.label_plural),
           'fields', (select coalesce(jsonb_agg(jsonb_build_object(
                               'key', ti.key, 'display_name', ti.display_name, 'description', ti.description,
                               'value_type', ti.value_type::text, 'sort_order', ti.sort_order) order by ti.sort_order, ti.key), '[]'::jsonb)
                        from context.template_context_items ti where ti.template_scope_type_id = st.id))
           order by st.sort_order, st.id), '[]'::jsonb))
    into v_def
    from context.template_scope_types st
   where st.template_id = p_template_id;
  return jsonb_build_object('template_id', p_template_id)
         || custom.context_template_define(p_organization_id, v_def);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.conversation_scope_bind(p_organization_id uuid, p_conversation_id uuid, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := auth.uid();
  v_table uuid;
  v_name  text;
  v_title text;
  v_meta  jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.conversation_scope_bind');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.conversation_scope_bind');

  -- THE RECORD, ON THE ONE LADDER. A person who may not open the record may not point a
  -- conversation at it, because the binding is what puts the record into a prompt.
  if not custom.has_visibility(v_me, 'record', p_record_id, 'viewer') then
    raise exception 'You do not have access to that record, so a conversation cannot be about it.'
      using errcode = '42501',
            hint = 'AGT-N-9: the binding is what puts a record into a prompt, so it takes the same '
                   'viewer level the read door takes. Ask somebody who holds it to share it with you.';
  end if;

  -- THE CONVERSATION, ON ITS OWN LADDER — and deliberately not the store's. A conversation
  -- is not a Record of this store; `custom.has_visibility` cannot decide a row it has never
  -- heard of, and `iam.has_access` is the platform ladder that owns `chat.conversation`.
  if not coalesce(iam.has_access('conversation', p_conversation_id, 'editor'::public.permission_level), false) then
    raise exception 'That conversation is not yours to point at a record.'
      using errcode = '42501',
            hint = 'A conversation is bound by somebody who may write in it.';
  end if;

  select r.table_id,
         coalesce(nullif(t.data ->> 'label_singular', ''), nullif(t.data ->> 'name', ''), 'Record'),
         coalesce(nullif(btrim(coalesce(r.data ->> nullif(t.data ->> 'title_field', ''), '')), ''), 'Untitled')
    into v_table, v_name, v_title
    from custom.record r
    left join custom.record t
      on t.organization_id = r.organization_id and t.id = r.table_id
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;

  if not found then
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000';
  end if;

  v_meta := jsonb_build_object('scope_type', v_name, 'scope_type_id', v_table,
                               'bound_by_door', 'custom.conversation_scope_bind');

  -- ONE SCOPE PER CONVERSATION. Pointing a conversation at a DIFFERENT record retires the
  -- old edge rather than leaving two, because "what is this chat about" may only have one
  -- answer.
  update platform.associations a
     set deleted_at = now(), deleted_via_type = 'conversation', deleted_via_id = p_conversation_id
   where a.source_type = 'conversation'
     and a.source_id = p_conversation_id
     and a.target_type in ('record', 'custom_record')   -- SC-4: `record` is the store's token; a
     and a.role = 'record_scope'                         -- binding left under the retired one is retired too
     and a.deleted_at is null
     and (a.target_id is distinct from p_record_id or a.target_type = 'custom_record');

  -- REVIVE-OR-WRITE, in two statements. A tombstoned edge coming back IS a write and is
  -- judged as one by `platform.enforce_client_association_endpoint_access` — which this
  -- SECURITY DEFINER body stands outside, having already made both decisions above itself.
  update platform.associations a
     set deleted_at = null, deleted_via_type = null, deleted_via_id = null,
         label = v_title, metadata = v_meta, created_by = coalesce(a.created_by, v_me)
   where a.source_type = 'conversation'
     and a.source_id = p_conversation_id
     and a.target_type = 'record'
     and a.target_id = p_record_id
     and a.role = 'record_scope';

  if not found then
    insert into platform.associations
      (source_type, source_id, target_type, target_id, role, organization_id, label, metadata, created_by)
    values
      ('conversation', p_conversation_id, 'record', p_record_id, 'record_scope',
       p_organization_id, v_title, v_meta, v_me);
  end if;

  return jsonb_build_object('bound', true, 'readable', true,
                            'record_id', p_record_id, 'table_id', v_table,
                            'scope_type', v_name, 'title', v_title);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.dashboard_declare(p_organization_id uuid, p_table_id uuid, p_name text, p_blocks jsonb DEFAULT '[]'::jsonb, p_presentation jsonb DEFAULT '{}'::jsonb, p_dashboard_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_blocks jsonb := '[]'::jsonb;
  v_name   text;
  v_doc    jsonb;
  v_id     uuid;
  b        jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.dashboard_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboard_declare');

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then
    raise exception 'A dashboard has to be called something.'
      using errcode = '22004',
            hint = 'SCR-16: the name is what a person clicks to switch between dashboards.';
  end if;

  if p_table_id is null then
    raise exception 'A dashboard has to say what it is a dashboard about.'
      using errcode = '22004',
            hint = 'p_table_id names the Table most of its blocks ask about. A single block may still name another table_id of its own.';
  end if;

  -- SAME RUNG AS A FORM AND A RULE, AND FOR THE SAME REASON: this publishes something
  -- about a Table that everybody in the organization then sees on that Table's own page.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.dashboard_declare',
                                          'admin'::public.permission_level, 'table');

  if jsonb_typeof(coalesce(p_blocks, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'A dashboard''s blocks are a list.'
      using errcode = '22004',
            hint = 'Send [] for a dashboard with no blocks yet, or a list of block objects.';
  end if;

  for b in select e from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) e loop
    v_blocks := v_blocks || custom.dashboard_block_normalize(p_organization_id, p_table_id, b);
  end loop;

  v_doc := jsonb_build_object(
    'name', v_name,
    'subject_table_id', p_table_id,
    'blocks', v_blocks,
    'presentation', case when jsonb_typeof(coalesce(p_presentation, '{}'::jsonb)) = 'object'
                         then coalesce(p_presentation, '{}'::jsonb) else '{}'::jsonb end);

  if p_dashboard_id is null then
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, custom.presentation_kernel_id(), custom.dashboard_class(), v_doc)
    returning id into v_id;
    return v_id;
  end if;

  -- RE-STATING A DASHBOARD, not patching one. The whole document moves at once so a save
  -- that dropped a block cannot half-land, and the version moves so History names who did
  -- it — the same shape custom.form_declare's update arm has.
  update custom.record
     set data = v_doc, updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_dashboard_id
     and table_id = custom.presentation_kernel_id()
     and data_class = custom.dashboard_class()
     and deleted_at is null
  returning id into v_id;
  if v_id is null then
    raise exception 'There is no dashboard % in this organization.', p_dashboard_id
      using errcode = '23503',
            hint = 'A dashboard id from another organization reads as absent — organizations are hard walls (REC-29).';
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.dashboard_delete(p_organization_id uuid, p_dashboard_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_exists boolean;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.dashboard_delete');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboard_delete');

  select true into v_exists
    from custom.record d
   where d.organization_id = p_organization_id
     and d.id = p_dashboard_id
     and d.table_id = custom.presentation_kernel_id()
     and d.data_class = custom.dashboard_class()
     and d.deleted_at is null;
  if not coalesce(v_exists, false) then
    raise exception 'There is no dashboard % in this organization.', p_dashboard_id
      using errcode = '02000',
            hint = 'It may already have been removed. A dashboard id from another organization reads as absent (REC-29).';
  end if;

  -- ADMIN ON THE DASHBOARD ITSELF, which is the rung the store asks for throwing a record
  -- away anywhere else. Removing a dashboard removes nothing else: the records it counted
  -- are untouched, which is the whole reason a dashboard is safe to make.
  perform custom.assert_client_may_change(p_organization_id, p_dashboard_id, 'custom.dashboard_delete',
                                          'admin'::public.permission_level, 'dashboard');

  update custom.record
     set deleted_at = now(), updated_at = now()
   where organization_id = p_organization_id
     and id = p_dashboard_id
     and deleted_at is null;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.dashboard_restore(p_organization_id uuid, p_dashboard_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- lane STORE-RESTORE-DOORS. THE UNDO OF custom.dashboard_delete, on the same rung: admin on the
-- dashboard itself. Removing a dashboard removed nothing else, so bringing it back brings back only it.
declare
  v_at    timestamptz;
  v_name  text;
  v_table uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.dashboard_restore');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboard_restore');

  select d.deleted_at, d.data ->> 'name', nullif(d.data ->> 'subject_table_id', '')::uuid
    into v_at, v_name, v_table
    from custom.record d
   where d.organization_id = p_organization_id and d.id = p_dashboard_id
     and d.table_id = custom.presentation_kernel_id()
     and d.data_class = custom.dashboard_class();
  if not found then
    raise exception 'There is no dashboard % in this organization, so nothing was brought back.', p_dashboard_id
      using errcode = '02000', hint = 'A dashboard id from another organization reads as absent (REC-29).';
  end if;
  if v_at is null then
    raise exception 'The dashboard "%" was not removed, so there was nothing to bring back.', custom.said(v_name, 'that one')
      using errcode = '02000', hint = 'REC-23: it is already here.';
  end if;
  if v_table is not null and not exists (select 1 from custom.record t
                                          where t.organization_id = p_organization_id and t.id = v_table
                                            and t.table_id = custom.table_kernel_id() and t.deleted_at is null) then
    raise exception 'The dashboard "%" counts a table that is archived, so it cannot come back on its own.', custom.said(v_name, 'that one')
      using errcode = '23514', hint = 'Restore the table from Trash first.';
  end if;

  perform custom.assert_client_may_change(p_organization_id, p_dashboard_id, 'custom.dashboard_restore',
                                          'admin'::public.permission_level, 'dashboard');

  update custom.record
     set deleted_at = null, updated_at = now()
   where organization_id = p_organization_id and id = p_dashboard_id and deleted_at = v_at;
  return found;
end
$function$;

CREATE OR REPLACE FUNCTION custom.dashboard_run(p_organization_id uuid, p_dashboard_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_compare jsonb DEFAULT NULL::jsonb, p_grain text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc     jsonb;
  v_name    text;
  v_subject uuid;
  v_out     jsonb := '[]'::jsonb;
  v_rows    jsonb;
  v_block   jsonb;
  v_merged  jsonb;
  v_started timestamptz;
  v_grain   text;
  v_cmp     jsonb;
  v_windows jsonb;
  v_note    text;
  v_extra   jsonb;
  v_tgt     jsonb;
  v_mk      text;
  v_op      text;
  v_cur     numeric;
  v_pri     numeric;
  v_additive boolean;
  v_tval    numeric;
  v_tnote   text;
  b         jsonb;
  k         text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.dashboard_run');

  select d.data into v_doc
    from custom.record d
   where d.organization_id = p_organization_id
     and d.id = p_dashboard_id
     and d.table_id = custom.presentation_kernel_id()
     and d.data_class = custom.dashboard_class()
     and d.deleted_at is null;
  if v_doc is null then
    raise exception 'There is no dashboard % in this organization.', p_dashboard_id
      using errcode = '02000',
            hint = 'A dashboard id from another organization reads as absent — organizations are hard walls (REC-29).';
  end if;

  v_name    := v_doc ->> 'name';
  v_subject := nullif(v_doc ->> 'subject_table_id', '')::uuid;

  -- READING A DASHBOARD IS KNOWING ITS TABLE, and nothing more, because a dashboard holds no
  -- record: every number below is produced by custom.record_aggregate under THIS caller's own
  -- principal, and this caller could ask that door the same question about the same Table
  -- directly. Asking about the dashboard RECORD instead protected nothing and, under
  -- custom/member_default_visibility = shared_only, refused an organization's own members
  -- their own organization's dashboard (measured 2026-09-20).
  perform custom.assert_may_know_table(p_organization_id, v_subject, 'custom.dashboard_run');

  -- S3: THE CANVAS'S DATE GRAIN AND COMPARISON, judged once for the whole run — a picker that
  -- sends a grain the store does not cut is the caller's mistake, not eight blocks' mistakes.
  v_grain := lower(nullif(btrim(coalesce(p_grain, '')), ''));
  if v_grain is not null and not (v_grain = any (custom.agg_buckets())) then
    raise exception '"%" is not a date grain', v_grain
      using errcode = '22023',
            hint = format('A dashboard can be cut by %s.', array_to_string(custom.agg_buckets(), ', '));
  end if;
  if p_compare is not null and jsonb_typeof(p_compare) <> 'null' then
    perform custom.agg_compare_windows(p_organization_id,
      case when jsonb_typeof(p_compare) = 'object' and not (p_compare ? 'key')
           then p_compare || '{"key": "created_at"}'::jsonb else p_compare end, null);
  end if;

  for b in select e from jsonb_array_elements(coalesce(v_doc -> 'blocks', '[]'::jsonb)) e loop
    -- RE-JUDGED ON THE WAY OUT, NOT TRUSTED BECAUSE IT WAS JUDGED ON THE WAY IN. A Field
    -- can be deleted or renamed after a block was saved, and a block naming a Table THIS
    -- caller may not know is refused here by the same wall — so a canvas that reaches
    -- somebody else's Table loses that ONE block and answers the rest.
    begin
      v_block := custom.dashboard_block_normalize(p_organization_id, v_subject, b);
    exception when others then
      v_out := v_out || jsonb_build_object(
        'title', coalesce(b ->> 'title', 'Block'),
        'kind', coalesce(b ->> 'kind', 'number'),
        'refused', sqlerrm,
        'sqlstate', sqlstate);
      continue;
    end;

    -- ONE FILTER BAR ACROSS EVERY PANEL (SCR-16, Linear Insights). The canvas's filter is
    -- merged over each block's own, and the block's own wins on a key they share.
    v_merged := coalesce(v_block -> 'filter', '{}'::jsonb);
    if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
      for k in select kk from jsonb_object_keys(p_filter) kk loop
        if not (v_merged ? k) then
          v_merged := v_merged || jsonb_build_object(k, p_filter -> k);
        end if;
      end loop;
    end if;

    -- S3: the canvas's grain re-cuts every bucketed block; the block's own comparison wins over
    -- the canvas's, as its own filter does.
    if v_grain is not null and jsonb_typeof(v_block -> 'bucket') = 'object' then
      v_block := jsonb_set(v_block, '{bucket,by}', to_jsonb(v_grain));
    end if;
    v_cmp := null; v_windows := null; v_note := null;
    if v_block ->> 'kind' <> 'stuck' then
      v_cmp := coalesce(v_block -> 'compare',
                        case when p_compare is not null and jsonb_typeof(p_compare) = 'object' then p_compare end);
      if v_cmp is not null and nullif(v_cmp ->> 'key', '') is null
         and jsonb_typeof(v_block -> 'bucket') is distinct from 'object' then
        v_note := 'This block has no date to compare along, so it shows this period alone. Give it a bucket, or give its comparison a date field.';
        v_cmp := null;
      end if;
    end if;

    v_started := clock_timestamp();
    begin
      if v_cmp is not null then
        v_windows := custom.agg_compare_windows(p_organization_id, v_cmp,
                       case when jsonb_typeof(v_block -> 'bucket') = 'object' then v_block -> 'bucket' end);
      end if;
      if v_block ->> 'kind' = 'stuck' then
        select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_rows
          from custom.dashboard_stuck(p_organization_id,
                                      (v_block ->> 'table_id')::uuid,
                                      v_block ->> 'state_key',
                                      (v_block ->> 'days')::integer,
                                      v_merged,
                                      (v_block ->> 'limit')::integer,
                                      'viewer') s;
      else
        select coalesce(jsonb_agg(
                 jsonb_build_object('groups', a.groups, 'measures', a.measures, 'row_count', a.row_count)
                 || case when v_cmp is null then '{}'::jsonb else jsonb_build_object(
                      'prior_groups', a.prior_groups, 'prior_measures', a.prior_measures,
                      'prior_row_count', a.prior_row_count, 'delta', a.delta,
                      'position', a.compare -> 'position') end), '[]'::jsonb)
          into v_rows
          from custom.record_aggregate(p_organization_id,
                                       (v_block ->> 'table_id')::uuid,
                                       coalesce(v_block -> 'group_by', '[]'::jsonb),
                                       coalesce(v_block -> 'measures', '[]'::jsonb),
                                       v_block -> 'bucket',
                                       v_merged,
                                       (v_block ->> 'limit')::integer,
                                       'viewer',
                                       v_cmp) a;
      end if;
    exception when others then
      -- NOTHING FAILS SILENTLY: one block that refuses is one block that says why, and the
      -- other seven still answer. A canvas that went blank because one Field was renamed
      -- would be the screen telling a lie about the whole organization.
      v_out := v_out || (v_block || jsonb_build_object('refused', sqlerrm, 'sqlstate', sqlstate));
      continue;
    end;

    -- ── S3: the totals and the target, worked out HERE from the rows the store just answered,
    -- so the tile, the chart and the ring can never disagree with each other ─────────────
    v_extra := '{}'::jsonb;
    if v_block ->> 'kind' <> 'stuck' then
      v_tgt := v_block -> 'target';
      v_mk := coalesce(v_tgt ->> 'measure',
                       case when (v_block -> 'measures' -> 0 ->> 'op') = 'count' or (v_block -> 'measures' -> 0 ->> 'op') is null
                            then 'count' else (v_block -> 'measures' -> 0 ->> 'op') || '_' || (v_block -> 'measures' -> 0 ->> 'key') end);
      v_op := split_part(v_mk, '_', 1);
      -- A total across groups is a sum only for a measure that adds up; an average of averages
      -- is not the average, so a one-row answer is the only total such a measure has.
      v_additive := v_op in ('count', 'sum', 'filled', 'empty');
      if v_additive or jsonb_array_length(v_rows) = 1 then
        select sum(case when jsonb_typeof(r -> 'measures' -> v_mk) = 'number' then (r -> 'measures' ->> v_mk)::numeric end),
               sum(case when jsonb_typeof(r -> 'prior_measures' -> v_mk) = 'number' then (r -> 'prior_measures' ->> v_mk)::numeric end)
          into v_cur, v_pri
          from jsonb_array_elements(v_rows) r;
        v_cur := coalesce(v_cur, case when v_additive then 0 end);
        if v_cmp is not null then
          v_pri := coalesce(v_pri, case when v_additive then 0 end);
        else
          v_pri := null;
        end if;
        v_extra := v_extra || jsonb_build_object('totals', jsonb_build_object(
          'measure', v_mk, 'current', v_cur, 'prior', v_pri,
          'change', v_cur - v_pri,
          'change_pct', case when v_pri is null or v_cur is null or v_pri = 0 then null
                             else round((v_cur - v_pri) / abs(v_pri) * 100, 1) end));
      else
        v_cur := null;
      end if;
      if v_tgt is not null then
        -- S3: A TARGET READ FROM A GOAL COLUMN is that column added up over exactly the records
        -- this block's own number read — the same merged filter, the same current window, the
        -- same reader through the same door — so the goal and the number cannot disagree about
        -- which jobs they are about. A column this reader may not read refuses the TARGET by
        -- name and the block still draws its number.
        v_tval := null; v_tnote := null;
        if v_tgt ? 'field' then
          begin
            perform custom.dashboard_target_field_assert(p_organization_id, (v_block ->> 'table_id')::uuid, v_tgt ->> 'field');
            select case when jsonb_typeof(a.measures -> ((v_tgt ->> 'op') || '_' || (v_tgt ->> 'field'))) = 'number'
                        then (a.measures ->> ((v_tgt ->> 'op') || '_' || (v_tgt ->> 'field')))::numeric end
              into v_tval
              from custom.record_aggregate(p_organization_id,
                                           (v_block ->> 'table_id')::uuid,
                                           '[]'::jsonb,
                                           jsonb_build_array(jsonb_build_object('op', v_tgt ->> 'op', 'key', v_tgt ->> 'field')),
                                           null,
                                           v_merged,
                                           1,
                                           'viewer',
                                           case when v_cmp is null then null
                                                else v_cmp || jsonb_build_object('key',
                                                       coalesce(nullif(v_cmp ->> 'key', ''), v_block -> 'bucket' ->> 'key')) end) a
             limit 1;
            if v_tval is null and v_tgt ->> 'op' = 'sum' then v_tval := 0; end if;
          exception when others then
            v_tval := null;
            v_tnote := sqlerrm;
          end;
        else
          v_tval := (v_tgt ->> 'value')::numeric;
        end if;
        v_extra := v_extra || jsonb_build_object('target', v_tgt || jsonb_build_object(
          'value', v_tval,
          'current', v_cur,
          'progress', case when v_cur is null or v_tval is null or v_tval = 0 then null
                           else round(v_cur / v_tval, 4) end,
          'pace', case
            when v_tval is null then null
            when jsonb_typeof(v_block -> 'bucket') is distinct from 'object' then null
            when v_tgt ->> 'per' = 'bucket' then v_tval
            when coalesce((v_windows ->> 'bucket_count')::integer, 0) > 0
              then round(v_tval / (v_windows ->> 'bucket_count')::integer, 2)
            else null end)
          || case when v_tnote is null then '{}'::jsonb else jsonb_build_object('refused', v_tnote) end);
      end if;
    end if;

    v_out := v_out || (v_block || v_extra || jsonb_build_object(
      'rows', v_rows,
      'filter', v_merged,
      'compare', v_windows,
      'ms', round(extract(epoch from (clock_timestamp() - v_started)) * 1000.0, 1))
      || case when v_note is null then '{}'::jsonb else jsonb_build_object('compare_refused', v_note) end);
  end loop;

  return jsonb_build_object(
    'dashboard_id', p_dashboard_id,
    'name', v_name,
    'subject_table_id', v_subject,
    'presentation', coalesce(v_doc -> 'presentation', '{}'::jsonb),
    'filter', coalesce(p_filter, '{}'::jsonb),
    'grain', v_grain,
    'compare', case when jsonb_typeof(p_compare) = 'object' then p_compare end,
    'calendar', custom.agg_calendar(p_organization_id),
    'blocks', v_out);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.doc_render_body(p_organization_id uuid, p_template_id uuid, p_record_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tpl    record;
  v_rec    record;
  v_values jsonb;
  v_out    text;
  v_tok    record;
  v_field  jsonb;
begin
  select t.data ->> 'body' as body,
         (t.data ->> 'renders_table_id')::uuid as renders_table_id
    into v_tpl
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_template_id
     and t.data_class = 'doc_template' and t.deleted_at is null;
  if v_tpl.renders_table_id is null then
    raise exception 'there is no document template % in this organization', p_template_id
      using errcode = '02000';
  end if;

  select r.table_id into v_rec
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id
     and r.deleted_at is null;
  if v_rec.table_id is null then
    raise exception 'there is no record % in this organization', p_record_id
      using errcode = '02000';
  end if;
  if v_rec.table_id is distinct from v_tpl.renders_table_id then
    raise exception 'this template renders a different kind of record than %', p_record_id
      using errcode = '22023',
            hint = 'REC-68: a template''s tokens are the Fields of ONE Table, so it renders the records of that Table and of no other. Pick the template that belongs to this record''s table.';
  end if;

  -- The record's own values, through the store's own read — which folds in computed and
  -- derived Values, so a formula Field merges as the answer a reader sees.
  v_values := coalesce(custom.record_values(p_organization_id, p_record_id), '{}'::jsonb);

  v_out := v_tpl.body;
  for v_tok in
    select distinct t.raw, t.field_id from custom.doc_tokens(v_tpl.body) t
  loop
    select f.data into v_field
      from custom.field f
     where f.organization_id = p_organization_id and f.id = v_tok.field_id;
    -- A token that reaches here and resolves to nothing cannot happen through
    -- custom.doc_template_save, which refuses it at save (REC-68). It can happen when the
    -- FIELD was deleted after the template was saved, and then the honest render is an
    -- empty space: a document that prints {{field:...}} to a client is the merge lying
    -- about what the record holds.
    v_out := replace(v_out, v_tok.raw,
                     case when v_field is null then ''
                          -- FIXED: a signature Field never merges its live value into the
                          -- body. The value IS the thing `doc_sign` writes onto the record,
                          -- so baking it back into the same content the seal hashes would
                          -- make every signed document self-invalidating the instant it was
                          -- signed. The signature is carried as the Value and the seal, never
                          -- as body text a hash depends on (DocuSign's own separation).
                          when nullif(v_field ->> 'format', '') = 'signature' then ''
                          else custom.doc_format_value(v_field, v_values -> (v_field ->> 'key'))
                     end);
  end loop;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.doc_render_document(p_organization_id uuid, p_template_id uuid, p_record_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_body text;
  v_ver  integer;
  v_tbl  uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_render_document');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.doc_render_document', 'viewer'::public.permission_level, 'record');
  -- THE DOOR. One call to the ONE predicate, which resolves this file's guard
  -- (custom/system_enabled) through platform.knob_resolve and judges custom.caller_role().
  perform custom.assert_store_door(p_organization_id, 'custom.doc_render_document');

  select coalesce((t.data ->> 'template_version')::integer, 1),
         (t.data ->> 'renders_table_id')::uuid
    into v_ver, v_tbl
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_template_id
     and t.data_class = 'doc_template' and t.deleted_at is null;
  if v_ver is null then
    raise exception 'there is no document template % in this organization', p_template_id
      using errcode = '02000';
  end if;

  v_body := custom.doc_render_body(p_organization_id, p_template_id, p_record_id);

  return custom.doc_render_write(p_organization_id, p_template_id, p_record_id, v_tbl,
                                 v_ver, v_body, custom.doc_content_hash(v_body));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.doc_render_read(p_organization_id uuid, p_render_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_d record; v_org_name text;
begin
  -- A DOCUMENT IS FOUND BY ITS ID, AND ONLY BY ITS ID (2026-09-23). This used to look for the
  -- document inside p_organization_id — which every client filled with the person's currently
  -- SELECTED organization — so the link `document_propose` hands a person failed for its own
  -- author whenever another organization happened to be selected. Access is decided by the
  -- PERSON (organization-is-the-container rule 5): the organization checked is the one the
  -- document actually lives in, and p_organization_id is accepted and ignored so no caller breaks.
  select d.id, d.organization_id, d.template_id, d.record_id, d.table_id, d.template_version,
         d.body, d.content_hash, d.rendered_at
    into v_d
    from custom.doc_render d
   where d.id = p_render_id and d.deleted_at is null;
  if v_d.id is null then
    raise exception 'There is no document %.', p_render_id
      using errcode = '02000';
  end if;
  -- THE ACCESS QUESTION IS ASKED ABOUT THE RECORD, IN ITS OWN ORGANIZATION, which is where the
  -- words came from. Whoever may open the record may read what it says.
  -- THE DECISION, IN THIS BODY (lane SUITE-HEALTH-2): the wall of the document's own organization
  -- is named here, then the ladder on its record. assert_client_may_open asks the same wall first,
  -- with the same arguments, so this is the store's one order written out, not a second rule.
  perform custom.assert_client_may_reach(v_d.organization_id, 'custom.doc_render_read');
  perform custom.assert_client_may_open(v_d.organization_id, v_d.record_id, 'custom.doc_render_read',
                                        'viewer'::public.permission_level, 'record');
  select o.name into v_org_name from iam.organizations o where o.id = v_d.organization_id;
  return jsonb_build_object('render_id', v_d.id, 'template_id', v_d.template_id,
                            'record_id', v_d.record_id, 'table_id', v_d.table_id,
                            'document_version', v_d.template_version, 'body', v_d.body,
                            'content_hash', v_d.content_hash, 'rendered_at', v_d.rendered_at,
                            'organization_id', v_d.organization_id,
                            'organization_name', v_org_name,
                            -- Whether this person belongs to that organization, so the page offers
                            -- "switch to it" only to a member and never to somebody it was shared with.
                            'viewer_is_member', iam.has_org_access(v_d.organization_id));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.doc_sign(p_organization_id uuid, p_render_id uuid, p_field_key text, p_signer_name text, p_signer_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc    record;
  v_field  jsonb;
  v_have   jsonb;
  v_prior  uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_sign');
  -- THE DOOR. One call to the ONE predicate.
  perform custom.assert_store_door(p_organization_id, 'custom.doc_sign');
  -- ── SEAT-SUITES, 2026-09-19: EDITOR ON THE RECORD IS ASKED WHERE THE RECORD IS KNOWN. ──
  -- This line used to sit here and name `p_record_id`, which is not a parameter of this
  -- function — this door takes a RENDER id and reads the record out of it. So every call to
  -- `custom.doc_sign`, from every seat, died on its ninth line with
  -- `42703 column "p_record_id" does not exist` before it had looked at anything. The only
  -- door for signing a document could not sign one. It went unseen because the suite that
  -- covers it ran on the rehearsal copy, where this prologue does not exist.
  -- The question is unchanged — EDITOR on the record, on the one ladder — and it is now asked
  -- three statements further down, the moment the render row says which record that is.

  if p_organization_id is null or p_render_id is null then
    raise exception 'custom.doc_sign: organization_id and the document version are both required'
      using errcode = '22004';
  end if;

  -- ARGS-RULED (2026-09-21). A SIGNATURE IS SIGNED BY WHOEVER SIGNED IT.
  -- `p_signer_user_id` is written through custom.doc_signature_write onto the signature row as
  -- the account that signed, and nothing compared it to the caller — so somebody with editor on
  -- the record could seal a document version in another person's name. This is the
  -- stamp-from-an-argument class: GUARD-STAMPS closed it on custom.portal_principal_bind, and
  -- ARGS-RULED closed it on platform.unified_data_store_set the same day.
  -- NULL stays legal and means exactly what custom.doc_signature_write's own rule says it
  -- means: "an outside signer with no account of ours". The server lane is unchanged.
  if p_signer_user_id is not null
     and not custom.query_is_store_owner()
     and custom.query_principal() is not null
     and p_signer_user_id <> custom.query_principal() then
    raise exception 'A signature is signed by whoever signed it, so it cannot be recorded in somebody else''s name.'
      using errcode = '42501',
            hint = 'Leave the signer account empty for an outside signer with no account here, or sign it yourself. Whose name appears on a sealed document is not a field the person sealing it gets to choose.';
  end if;

  select d.record_id, d.table_id, d.content_hash, d.template_version, d.template_id
    into v_doc
    from custom.doc_render d
   where d.organization_id = p_organization_id and d.id = p_render_id
     and d.deleted_at is null;
  if v_doc.record_id is null then
    raise exception 'there is no document % in this organization to sign', p_render_id
      using errcode = '02000',
            hint = 'A signature seals a rendered document version. Render one first: custom.doc_render_document(organization, template, record).';
  end if;

  perform custom.assert_client_may_change(p_organization_id, v_doc.record_id, 'custom.doc_sign',
                                         'editor'::public.permission_level, 'record');

  -- VAL-10: the Value a signature IS. It lives on a Field of the record's own Table, and
  -- that Field is a text Field whose format is signature — FLD-1's closed behaviour set,
  -- unwidened. A Field that is not one is refused BY NAME, naming the ones that are.
  select f.data into v_field
    from custom.field f
   where f.organization_id = p_organization_id
     and f.entity_definition_id = v_doc.table_id
     and f.key = p_field_key;
  if v_field is null then
    raise exception 'there is no field "%" on the table this document was rendered from', p_field_key
      using errcode = '23503', hint = 'VAL-10: a signature is a Value, so it belongs to a Field.';
  end if;
  if not custom.doc_signature_field_ok(v_field) then
    raise exception '"%" is a % field, and a signature is written on a text field whose format is signature',
                    coalesce(v_field ->> 'label', p_field_key), coalesce(v_field ->> 'type', 'nothing')
      using errcode = '23514',
            hint = format('VAL-10 through FLD-1''s closed set: one of list, range, text, relation, formula, and a signature is text. The signature fields on this table are: %s.',
                          coalesce((select string_agg(format('%s (%s)', g.label, g.key), ', ' order by g.sort, g.key)
                                      from custom.field g
                                     where g.organization_id = p_organization_id
                                       and g.entity_definition_id = v_doc.table_id
                                       and custom.doc_signature_field_ok(g.data)),
                                   'none yet - declare one with type text and format signature'));
  end if;

  -- ③ THE DOOR REFUSES TO OVERWRITE A SIGNED VALUE. A seal already standing behind this
  -- Field's value on this record is what makes it immutable through every door this lane
  -- owns; ④ in this file's header names the one path that is not covered and who owns it.
  select s.id into v_prior
    from custom.doc_signature s
   where s.organization_id = p_organization_id
     and s.record_id = v_doc.record_id
     and s.field_key = p_field_key
     and s.deleted_at is null
   limit 1;
  if v_prior is not null then
    raise exception '"%" on this record is already signed, and a signature is immutable once signed',
                    coalesce(v_field ->> 'label', p_field_key)
      using errcode = '23505',
            hint = 'VAL-10. Every seal on this record stays exactly as it was made. A further agreement is a further Field with its own signature, or a further document version with its own seal - never a rewriting of this one.';
  end if;

  -- THE VALUE. Written through the store's OWN door, so the envelope law stamps its version,
  -- its author and its time exactly as it does for every other Value, and the interned
  -- provenance carries the two facts the CLOSED envelope has no key for: the document
  -- version this signature sealed, and its hash.
  perform custom.record_update(p_organization_id, v_doc.record_id,
    jsonb_build_object(
      '_actor', 'user',
      p_field_key, to_jsonb(btrim(p_signer_name)),
      '_values', jsonb_build_object(
        p_field_key, jsonb_build_object(
          'src', jsonb_build_object(
            'kind',             'signed_document',
            'render_id',        p_render_id,
            'template_id',      v_doc.template_id,
            'document_version', v_doc.template_version,
            'document_hash',    v_doc.content_hash)))));

  -- THE SEAL, through this table's one write door.
  return custom.doc_signature_write(p_organization_id, p_render_id, v_doc.record_id,
                                    p_field_key, p_signer_name, p_signer_user_id,
                                    v_doc.content_hash, v_doc.template_version);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.doc_signature_intact(p_organization_id uuid, p_signature_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_sig   record;
  v_doc   record;
  v_now   text;
  v_hash  text;
  v_value jsonb;
  v_ver   integer;
begin
  select s.render_id, s.record_id, s.field_key, s.signer_name, s.signed_at,
         s.document_hash, s.document_version
    into v_sig
    from custom.doc_signature s
   where s.organization_id = p_organization_id and s.id = p_signature_id;
  if v_sig.render_id is null then
    raise exception 'there is no signature % in this organization', p_signature_id
      using errcode = '02000';
  end if;

  select d.template_id, d.body, d.content_hash, d.template_version into v_doc
    from custom.doc_render d
   where d.organization_id = p_organization_id and d.id = v_sig.render_id;

  -- What the same template says about this record NOW.
  v_now  := custom.doc_render_body(p_organization_id, v_doc.template_id, v_sig.record_id);
  v_hash := custom.doc_content_hash(v_now);

  -- And what the record now says the signature Value is — ④'s loud half.
  select vr.value, vr.value_version into v_value, v_ver
    from custom.value_read(p_organization_id, v_sig.record_id, v_sig.field_key) vr;

  return jsonb_build_object(
    'signature_id',      p_signature_id,
    'signer',            v_sig.signer_name,
    'signed_at',         v_sig.signed_at,
    'document_version',  v_sig.document_version,
    'sealed_hash',       v_sig.document_hash,
    'document_hash_now', v_hash,
    'document_unchanged', v_hash = v_sig.document_hash,
    'value_unchanged',   coalesce(v_value #>> '{}', '') = v_sig.signer_name,
    'value_now',         v_value,
    'intact',            v_hash = v_sig.document_hash
                         and coalesce(v_value #>> '{}', '') = v_sig.signer_name,
    'verdict',
      case
        when v_hash <> v_sig.document_hash
             and coalesce(v_value #>> '{}', '') <> v_sig.signer_name
          then format('broken: the record has changed since %s signed this on %s, and the signature value on the record no longer says "%s" either.',
                      v_sig.signer_name, to_char(v_sig.signed_at, 'FMDD Month YYYY'), v_sig.signer_name)
        when v_hash <> v_sig.document_hash
          then format('broken: the record has changed since %s signed this on %s, so the document no longer says what was signed. The seal itself is untouched - render the document again and have it signed again.',
                      v_sig.signer_name, to_char(v_sig.signed_at, 'FMDD Month YYYY'))
        when coalesce(v_value #>> '{}', '') <> v_sig.signer_name
          then format('value_tampered: the document still says exactly what %s signed, but the signature value on the record has been changed to %s. The seal is what stands.',
                      v_sig.signer_name, coalesce(v_value::text, 'nothing'))
        else format('intact: the record still says exactly what %s signed on %s.',
                    v_sig.signer_name, to_char(v_sig.signed_at, 'FMDD Month YYYY'))
      end);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.doc_signature_read(p_organization_id uuid, p_signature_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_s record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_signature_read');
  select s.id, s.render_id, s.record_id, s.field_key, s.signer_name, s.signer_user_id,
         s.signed_at, s.document_hash, s.document_version
    into v_s
    from custom.doc_signature s
   where s.organization_id = p_organization_id and s.id = p_signature_id;
  if v_s.id is null then
    raise exception 'There is no signature % in this organization.', p_signature_id
      using errcode = '02000';
  end if;
  perform custom.assert_client_may_open(p_organization_id, v_s.record_id, 'custom.doc_signature_read',
                                        'viewer'::public.permission_level, 'record');
  -- THE SEAL AND THE VERDICT IN ONE ANSWER. A seal a person can read and a verdict they
  -- cannot is how a changed agreement keeps wearing somebody's signature: the two belong on
  -- the same screen, so they come back together. `custom.doc_signature_intact` compares the
  -- sealed hash with what the same template says about the record NOW.
  return jsonb_build_object('signature_id', v_s.id, 'render_id', v_s.render_id,
                            'record_id', v_s.record_id, 'field_key', v_s.field_key,
                            'signer_name', v_s.signer_name, 'signer_user_id', v_s.signer_user_id,
                            'signed_at', v_s.signed_at, 'document_hash', v_s.document_hash,
                            'document_version', v_s.document_version)
         || custom.doc_signature_intact(p_organization_id, p_signature_id);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.doc_signature_write(p_organization_id uuid, p_render_id uuid, p_record_id uuid, p_field_key text, p_signer_name text, p_signer_user_id uuid, p_document_hash text, p_document_version integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id     uuid;
  v_prior  record;
begin
  -- THE DOOR. The same one call to the same one predicate, for the same reason.
  perform custom.assert_store_door(p_organization_id, 'custom.doc_signature_write');

  if p_organization_id is null or p_render_id is null or p_record_id is null then
    raise exception 'custom.doc_signature_write: organization_id, the document version and the record are all required'
      using errcode = '22004';
  end if;
  if coalesce(btrim(p_signer_name), '') = '' then
    raise exception 'a signature has to name who signed'
      using errcode = '23514', hint = 'VAL-10: its signer.';
  end if;
  if coalesce(btrim(p_field_key), '') = '' then
    raise exception 'a signature has to say which value on the record it is'
      using errcode = '23514',
            hint = 'VAL-10: a signature IS a Value. field_key names the Field whose Value this seal belongs to.';
  end if;
  if coalesce(p_document_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'a signature seals the document''s SHA-256, and this is not one'
      using errcode = '22023', hint = 'VAL-10: its hash.';
  end if;

  -- VAL-10, WRITTEN ONCE. A second write against the SAME DOCUMENT VERSION is refused BY
  -- NAME, and it says who already signed it and when rather than quoting a constraint. The
  -- unique index on (organization_id, render_id) is what makes it impossible rather than
  -- merely checked; this refusal is what makes it legible.
  select s.signer_name, s.signed_at into v_prior
    from custom.doc_signature s
   where s.organization_id = p_organization_id and s.render_id = p_render_id
     and s.deleted_at is null;
  if v_prior.signer_name is not null then
    raise exception 'this document version was already signed by % on %, so it cannot be signed again',
                    v_prior.signer_name, to_char(v_prior.signed_at, 'FMDD Month YYYY "at" HH24:MI')
      using errcode = '23505',
            hint = 'VAL-10: a signature is written once and is immutable once signed. To have somebody sign again, render the document again - custom.doc_render_document gives a new document version, and a signature on THAT version is a new seal rather than a rewriting of this one.';
  end if;

  insert into custom.doc_signature
    (organization_id, render_id, record_id, field_key, signer_name, signer_user_id,
     signed_at, document_hash, document_version)
  values
    (p_organization_id, p_render_id, p_record_id, btrim(p_field_key), btrim(p_signer_name),
     p_signer_user_id, now(), p_document_hash, p_document_version)
  returning id into v_id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.doc_template_delete(p_organization_id uuid, p_template_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table uuid;
  v_name  text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_template_delete');

  select (r.data ->> 'renders_table_id')::uuid, r.data ->> 'name'
    into v_table, v_name
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_template_id
     and r.data_class = 'doc_template'
     and r.deleted_at is null;
  if v_table is null then
    raise exception 'There is no document template % in this organization.', p_template_id
      using errcode = '02000',
            hint = 'It may already have been removed, or it may belong to another organization - organizations are hard walls (REC-29).';
  end if;

  -- A TEMPLATE IS THE TABLE''S WORDING, so removing it is an edit of the Table, not of a
  -- record. Whoever may add a column may retire a proposal template; whoever may not, may
  -- not - and is told by name which authority it takes.
  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.doc_template_delete',
                                          'editor'::public.permission_level, 'table');
  perform custom.assert_store_door(p_organization_id, 'custom.doc_template_delete');

  -- Soft, like every other record. VAL-10: documents ALREADY rendered from it keep their
  -- body, their hash and their seal - a template going away can never invalidate a
  -- signature over bytes that were frozen at render time.
  update custom.record r
     set deleted_at = now(), updated_at = now(), version = r.version + 1
   where r.organization_id = p_organization_id and r.id = p_template_id;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.doc_template_read(p_organization_id uuid, p_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_t record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_template_read');
  perform custom.assert_client_may_open(p_organization_id, p_template_id, 'custom.doc_template_read',
                                        'viewer'::public.permission_level, 'record');
  select t.id, t.renders_table_id, t.name, t.body, t.template_version, t.token_count
    into v_t
    from custom.doc_template t
   where t.organization_id = p_organization_id and t.id = p_template_id;
  if v_t.id is null then
    raise exception 'There is no document template % in this organization.', p_template_id
      using errcode = '02000';
  end if;
  return jsonb_build_object('template_id', v_t.id, 'renders_table_id', v_t.renders_table_id,
                            'name', v_t.name, 'body', v_t.body,
                            'template_version', v_t.template_version, 'token_count', v_t.token_count);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.doc_template_restore(p_organization_id uuid, p_template_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- lane STORE-RESTORE-DOORS. THE UNDO OF custom.doc_template_delete. A template is its Table's
-- wording, so bringing one back is an edit of the Table — editor on it, the rung the removal climbs.
declare
  v_table uuid;
  v_name  text;
  v_at    timestamptz;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_template_restore');

  select nullif(r.data ->> 'renders_table_id', '')::uuid, r.data ->> 'name', r.deleted_at
    into v_table, v_name, v_at
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_template_id
     and r.data_class = 'doc_template';
  if v_table is null then
    raise exception 'There is no document template % in this organization, so nothing was brought back.', p_template_id
      using errcode = '02000', hint = 'Organizations are hard walls (REC-29).';
  end if;
  if v_at is null then
    raise exception 'The template "%" was not removed, so there was nothing to bring back.', custom.said(v_name, 'that one')
      using errcode = '02000', hint = 'REC-23: it is already here.';
  end if;
  if not exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id and t.id = v_table
                    and t.table_id = custom.table_kernel_id() and t.deleted_at is null) then
    raise exception 'The template "%" belongs to a table that is archived, so it cannot come back on its own.', custom.said(v_name, 'that one')
      using errcode = '23514', hint = 'Restore the table from Trash first.';
  end if;

  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.doc_template_restore',
                                          'editor'::public.permission_level, 'table');
  perform custom.assert_store_door(p_organization_id, 'custom.doc_template_restore');

  update custom.record r
     set deleted_at = null, updated_at = now(), version = r.version + 1
   where r.organization_id = p_organization_id and r.id = p_template_id
     and r.data_class = 'doc_template' and r.deleted_at = v_at;
  return found;
end
$function$;

CREATE OR REPLACE FUNCTION custom.doc_template_save(p_organization_id uuid, p_table_id uuid, p_name text, p_body text, p_template_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id      uuid;
  v_bad     record;
  v_tname   text;
  v_ver     integer;
  v_labels  text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_template_save');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.doc_template_save', 'editor'::public.permission_level, 'table');
  -- THE DOOR. One call to the ONE predicate. This is a SECURITY DEFINER door, so
  -- `current_user` in here is already the definer; `custom.assert_store_door` judges
  -- `custom.caller_role()` — what the caller actually held — and resolves the guard this
  -- file is headed with, custom/system_enabled, through platform.knob_resolve.
  perform custom.assert_store_door(p_organization_id, 'custom.doc_template_save');

  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.doc_template_save: organization_id and the table the template renders are both required'
      using errcode = '22004';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'a document template needs a name - it is what a person picks it by'
      using errcode = '23514', hint = 'REC-68.';
  end if;

  select t.data ->> 'name' into v_tname
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_tname is null then
    raise exception 'this template says it renders records of something that is not a table of this organization'
      using errcode = '23503',
            hint = 'REC-68: a template renders the records of ONE Table, and its tokens are that Table''s Fields.';
  end if;

  -- ── REC-68, THE REFUSAL. A token naming no Field is refused AT SAVE, BY NAME. ──────
  -- It names the token it refused and the Fields that ARE available, because a refusal
  -- that does not say what to write instead is a dead end.
  select * into v_bad
    from custom.doc_unresolved_tokens(p_organization_id, p_table_id, p_body)
   order by raw
   limit 1;
  if v_bad.raw is not null then
    select string_agg(format('%s (%s)', f.label, f.id), ', ' order by f.sort, f.key)
      into v_labels
      from custom.field f
     where f.organization_id = p_organization_id
       and f.entity_definition_id = p_table_id;
    raise exception 'the template "%" points at % and %', btrim(p_name), v_bad.raw, v_bad.why
      using errcode = '23503',
            hint = format('REC-68: a token names a Field of %s by its id, never by a name, so renaming a field never breaks a template. The fields you can merge here are: %s.',
                          v_tname, coalesce(v_labels, 'none - this table has declared no fields yet'));
  end if;

  -- ── the positive path: it is a Record, written the way every Record is written ─────
  if p_template_id is null then
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, null, 'doc_template', jsonb_build_object(
      'renders_table_id', p_table_id,
      'name', btrim(p_name),
      'body', coalesce(p_body, ''),
      'template_version', 1))
    returning id into v_id;
    return v_id;
  end if;

  -- REC-68 + VAL-10: EVERY SAVE OF AN EXISTING TEMPLATE IS A NEW TEMPLATE VERSION. A
  -- signature seals a document version (VAL-10), so a template whose body could move under
  -- a sealed document without the version moving would make the seal meaningless.
  select coalesce((r.data ->> 'template_version')::integer, 1) into v_ver
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_template_id
     and r.data_class = 'doc_template' and r.deleted_at is null;
  if v_ver is null then
    raise exception 'there is no document template % in this organization', p_template_id
      using errcode = '02000';
  end if;

  update custom.record r
     set data = r.data
                || jsonb_build_object('renders_table_id', p_table_id,
                                      'name', btrim(p_name),
                                      'body', coalesce(p_body, ''),
                                      'template_version', v_ver + 1)
   where r.organization_id = p_organization_id and r.id = p_template_id
  returning r.id into v_id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.enrich_pin(p_organization_id uuid, p_record_id uuid, p_field_key text, p_pinned boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc   jsonb;
  v_table uuid;
  v_src   text;
  v_env   jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.enrich_pin');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.enrich_pin');

  select rec.data, rec.table_id into v_doc, v_table
    from custom.record rec
   where rec.organization_id = p_organization_id and rec.id = p_record_id and rec.deleted_at is null;
  if v_doc is null then
    raise exception 'There is no record % in this organization any more.', p_record_id
      using errcode = '02000', hint = 'It was deleted, or it never existed here.';
  end if;

  select f.data ->> 'source' into v_src
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table
     and f.data ->> 'key' = p_field_key;
  if v_src is null then
    raise exception 'This table has no column called "%".', p_field_key
      using errcode = '22023', hint = 'Pinning holds a particular cell against the model that fills the column; the column has to exist.';
  end if;
  if v_src is distinct from 'agent' then
    raise exception 'Nothing fills "%" in automatically, so there is nothing to hold it against.', p_field_key
      using errcode = '22023',
            hint = 'AGT-6: pinning is what stops an ENRICHMENT from writing over a cell. A column people type into themselves is never written over in the first place.';
  end if;

  v_env := coalesce(v_doc -> '_values' -> p_field_key, '{}'::jsonb);
  if jsonb_typeof(v_env) <> 'object' then v_env := '{}'::jsonb; end if;
  -- `false` is written out EXPLICITLY, which is what tells custom.pin_agent_cells this is a
  -- deliberate un-pin rather than a write that merely forgot to mention the pin.
  v_env := v_env || jsonb_build_object('pinned', coalesce(p_pinned, true));

  update custom.record
     set data = (v_doc || jsonb_build_object('_values',
                   coalesce(v_doc -> '_values', '{}'::jsonb) || jsonb_build_object(p_field_key, v_env))),
         updated_at = now(),
         version = version + 1
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null;

  return jsonb_build_object(
    'record_id', p_record_id, 'field_key', p_field_key,
    'pinned', coalesce(p_pinned, true),
    'says', case when coalesce(p_pinned, true)
                 then 'This one is yours now — the model will leave it alone until you say otherwise.'
                 else 'The model may fill this one in again the next time it runs.' end);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.external_history_event(p_organization_id uuid, p_link_id uuid, p_operation text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_link custom.external_link%rowtype;
  v_src  custom.external_source%rowtype;
  v_id   bigint;
begin
  -- THE DOOR, and it is ONE CALL. This is a SECURITY DEFINER door, so
  -- `current_user` in here is already the definer; `custom.assert_store_door`
  -- judges `custom.caller_role()` instead, which is what the caller held.
  perform custom.assert_store_door(p_organization_id, 'custom.external_history_event');

  if p_organization_id is null or p_link_id is null or p_operation is null then
    raise exception 'custom.external_history_event: organization_id, link_id and operation are all required'
      using errcode = '22004';
  end if;
  if p_operation not in ('linked', 'refreshed', 'unlinked') then
    raise exception 'custom.external_history_event: operation % is not one of linked, refreshed, unlinked', p_operation
      using errcode = '22023';
  end if;
  select * into v_link from custom.external_link
   where organization_id = p_organization_id and id = p_link_id and deleted_at is null;
  if not found then
    raise exception 'custom.external_history_event: no external link % in organization %', p_link_id, p_organization_id
      using errcode = '02000';
  end if;
  select * into v_src from custom.external_source
   where organization_id = p_organization_id and id = v_link.source_id;

  insert into history.row_versions
    (entity_type, row_id, organization_id, version, operation, row_data, actor_id, occurred_at)
  values
    ('external_link', null, p_organization_id, 1, p_operation,
     jsonb_build_object(
       'about', 'external_link',
       'link_id', v_link.id,
       'stub_record_id', v_link.record_id,
       'target_ref', v_link.target_ref,
       'tier', v_src.tier,
       'connection_token', v_src.connection_token,
       'external_table', v_src.external_table,
       'external_key', v_link.external_key,
       'fetched_at', v_link.fetched_at,
       'foreign_row_copied', false),
     auth.uid(), now())
  returning id into v_id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.external_rows(p_organization_id uuid, p_source_id uuid)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_src custom.external_source%rowtype;
  v_rel regclass;
  v_row jsonb;
begin
  if p_organization_id is null or p_source_id is null then
    raise exception 'custom.external_rows: organization_id and source_id are required'
      using errcode = '22004';
  end if;
  select * into v_src from custom.external_source
   where organization_id = p_organization_id and id = p_source_id and deleted_at is null;
  if not found then
    raise exception 'custom.external_rows: no external source % in organization %', p_source_id, p_organization_id
      using errcode = '02000';
  end if;
  v_rel := to_regclass(format('custom_external.%I', v_src.external_table));
  if v_rel is null then
    raise exception 'custom.external_rows: custom_external.% does not exist', v_src.external_table
      using errcode = '0A000',
            hint = 'DOOR-N-6: an external relation lives in the private schema custom_external and nowhere else. No foreign server is provisioned by this campaign (D-14), so this is the expected state until a connection is bought.';
  end if;
  -- THE CONTRACT, STATED BEFORE IT IS RELIED ON. The door joins the private relation to our
  -- stubs on `external_key`; a relation without that column used to produce a bare 42703 from
  -- inside a dynamic string, which names the symptom and not the requirement.
  if not exists (
    select 1 from pg_attribute a
     where a.attrelid = v_rel and a.attname = 'external_key' and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'custom.external_rows: custom_external.% has no external_key column', v_src.external_table
      using errcode = '0A000',
            hint = 'DOOR-N-6: a relation in custom_external is joined to our stub Records on external_key, so it must expose that column (text) carrying the outside system''s own key. Add it to the foreign-table definition, or register the source against the relation that does.';
  end if;
  for v_row in execute format(
      'select to_jsonb(t) from custom_external.%I t join custom.external_link l on l.external_key = t.external_key and l.organization_id = $1 and l.source_id = $2 and l.deleted_at is null where iam.has_access(''record'', l.record_id, ''viewer''::public.permission_level)',
      v_src.external_table)
    using p_organization_id, p_source_id
  loop
    return next v_row;
  end loop;
  return;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.external_stub_upsert(p_organization_id uuid, p_source_id uuid, p_table_id uuid, p_external_key text, p_link_url text, p_cached_title text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_src    custom.external_source%rowtype;
  v_rec_id uuid;
  v_link   uuid;
begin
  -- THE DOOR, and it is ONE CALL. This is a SECURITY DEFINER door, so
  -- `current_user` in here is already the definer; `custom.assert_store_door`
  -- judges `custom.caller_role()` instead, which is what the caller held.
  perform custom.assert_store_door(p_organization_id, 'custom.external_stub_upsert');

  if p_organization_id is null or p_source_id is null or p_external_key is null then
    raise exception 'custom.external_stub_upsert: organization_id, source_id and external_key are all required'
      using errcode = '22004';
  end if;
  if btrim(p_external_key) = '' then
    raise exception 'custom.external_stub_upsert: external_key may not be blank'
      using errcode = '22023';
  end if;
  select * into v_src from custom.external_source
   where id = p_source_id and organization_id = p_organization_id and deleted_at is null;
  if not found then
    raise exception 'custom.external_stub_upsert: no external source % in organization %', p_source_id, p_organization_id
      using errcode = '02000';
  end if;

  select l.record_id into v_rec_id from custom.external_link l
   where l.organization_id = p_organization_id
     and l.source_id = p_source_id
     and l.external_key = p_external_key
     and l.deleted_at is null;

  if v_rec_id is null then
    -- THE NATIVE DOOR. The stub is an ordinary Record: no new data_class, no second path.
    v_rec_id := custom.record_write(p_organization_id, p_table_id, '{}'::jsonb);
    insert into custom.external_link
      (organization_id, record_id, source_id, external_key, target_ref, link_url, cached_title, fetched_at)
    values
      (p_organization_id, v_rec_id, p_source_id, p_external_key,
       custom.relation_target_external(v_src.connection_token, v_src.external_table, p_external_key),
       coalesce(p_link_url, replace(v_src.link_template, '{key}', p_external_key)),
       p_cached_title, now())
    returning id into v_link;
  else
    update custom.external_link l
       set link_url     = coalesce(p_link_url, replace(v_src.link_template, '{key}', p_external_key), l.link_url),
           cached_title = p_cached_title,
           fetched_at   = now()
     where l.organization_id = p_organization_id
       and l.source_id = p_source_id
       and l.external_key = p_external_key
    returning l.id into v_link;
  end if;
  return v_rec_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.external_write_through(p_organization_id uuid, p_record_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_src custom.external_source%rowtype;
begin
  -- THE DOOR, and it is ONE CALL. This is a SECURITY DEFINER door, so
  -- `current_user` in here is already the definer; `custom.assert_store_door`
  -- judges `custom.caller_role()` instead, which is what the caller held.
  perform custom.assert_store_door(p_organization_id, 'custom.external_write_through');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.external_write_through: organization_id and record_id are required'
      using errcode = '22004';
  end if;
  select s.* into v_src
    from custom.external_link l
    join custom.external_source s
      on s.organization_id = l.organization_id and s.id = l.source_id
   where l.organization_id = p_organization_id and l.record_id = p_record_id
     and l.deleted_at is null and s.deleted_at is null;
  if not found then
    raise exception 'custom.external_write_through: record % in organization % is not an external stub', p_record_id, p_organization_id
      using errcode = '22023',
            hint = 'A stub Record has a row in custom.external_link. A native record is written through its own door.';
  end if;
  if not v_src.writes_enabled then
    raise exception 'custom.external_write_through: writing to % is not permitted for this organization', v_src.external_table
      using errcode = '42501',
            hint = format('The external tier is READ-ONLY until an organization opts in, per table: select custom.external_writes_set(%L, %L, true). It defaults to off (REC-N-11) and is turned on only after the read path is proven for that table.',
                          p_organization_id, v_src.id);
  end if;
  raise exception 'custom.external_write_through: the opt-in for % is ON and there is still no write connection to write through', v_src.external_table
    using errcode = '0A000',
          hint = 'Provisioning, credential custody and billing for an external connection are DEFERRED (D-14); the trigger is the first customer who asks, with the spend approved by Arman. The opt-in is honoured: this is no longer a privilege refusal.';
end;
$function$;

CREATE OR REPLACE FUNCTION custom.external_writes_set(p_organization_id uuid, p_source_id uuid, p_enabled boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_now boolean;
begin
  -- THE DOOR, and it is ONE CALL. This is a SECURITY DEFINER door, so
  -- `current_user` in here is already the definer; `custom.assert_store_door`
  -- judges `custom.caller_role()` instead, which is what the caller held.
  perform custom.assert_store_door(p_organization_id, 'custom.external_writes_set');

  if p_organization_id is null or p_source_id is null or p_enabled is null then
    raise exception 'custom.external_writes_set: organization_id, source_id and enabled are all required'
      using errcode = '22004';
  end if;
  update custom.external_source
     set writes_enabled = p_enabled
   where organization_id = p_organization_id
     and id = p_source_id
     and deleted_at is null
  returning writes_enabled into v_now;
  if not found then
    raise exception 'custom.external_writes_set: no external source % in organization %', p_source_id, p_organization_id
      using errcode = '02000';
  end if;
  return v_now;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.form_declare(p_organization_id uuid, p_table_id uuid, p_title text, p_questions jsonb, p_presentation jsonb DEFAULT '{}'::jsonb, p_submission_cap integer DEFAULT NULL::integer, p_quarantine_rule_id uuid DEFAULT NULL::uuid, p_notify_rule_id uuid DEFAULT NULL::uuid, p_form_id uuid DEFAULT NULL::uuid, p_slug text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user     uuid := custom.query_principal();
  v_keys     text[];
  v_q        jsonb;
  v_key      text;
  v_exposed  text[] := array[]::text[];
  v_required text[] := array[]::text[];
  v_slug     text;
  v_id       uuid;
  v_hp       text;
  v_present  jsonb;
  -- The accept Rule this door makes when the caller brought none.
  v_accept   uuid := p_quarantine_rule_id;
  v_ids      uuid[] := array[]::uuid[];
  v_fid      uuid;
  v_expr     jsonb;
  v_args     jsonb := '[]'::jsonb;
  v_aname    text;
  v_redirect text;
  v_said     text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.form_declare');

  -- A FORM DECIDES WHAT STRANGERS MAY WRITE INTO A TABLE, so declaring one is an admin
  -- act on that Table — the same rung custom.anon_publish already asks for. Asking less
  -- here and more at publish would let anyone assemble the loaded gun and only check who
  -- pulls the trigger.
  if v_user is null then
    raise exception 'Nobody is signed in, so no form can be made.'
      using errcode = '42501',
            hint = 'custom.form_declare is the owner''s side of a form. The public side — custom.form_public and custom.form_submit — is the one that has no principal.';
  end if;
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.form_declare',
                                          'admin'::public.permission_level, 'table');

  -- The subject has to be a TABLE of this organization, and the fields it declares are
  -- the only things a question may ask for.
  select array_agg(f ->> 'name') into v_keys
    from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_keys is null then
    raise exception 'There is no table % in this organization to make a form for.', p_table_id
      using errcode = '23503',
            hint = 'A form is a view on a real Table (SCR-13). Make the Table first — every question is one of its Fields and every answer is one of its records.';
  end if;

  if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'A form has to ask something.'
      using errcode = '22004',
            hint = 'questions is a list of {"field": "<the field''s key on this table>", "ask": "…", "help": "…", "required": true|false}. The field key is the address; ask and help are this form''s own words for it.';
  end if;

  for v_q in select value from jsonb_array_elements(p_questions) loop
    v_key := nullif(btrim(coalesce(v_q ->> 'field', v_q ->> 'key', '')), '');
    if v_key is null then
      raise exception 'One of this form''s questions does not say which field it asks for.'
        using errcode = '22004',
              hint = 'Every question names a Field of the subject table by key. The table''s fields are: ' || array_to_string(v_keys, ', ') || '.';
    end if;
    if not (v_key = any (v_keys)) then
      raise exception 'This table has no field called "%", so the form cannot ask for it.', v_key
        using errcode = '23503',
              hint = format('Its fields are: %s. Add the Field first, or ask for one that is there — a question with nowhere to land is an answer nobody can read.',
                            array_to_string(v_keys, ', '));
    end if;
    if not (v_key = any (v_exposed)) then
      v_exposed := v_exposed || v_key;
    end if;
    if coalesce((v_q ->> 'required')::boolean, false) and not (v_key = any (v_required)) then
      v_required := v_required || v_key;
    end if;
  end loop;

  -- ─────────────────────────────────────────────────────────────────────────
  -- THE ACCEPT RULE, WHEN NOBODY BROUGHT ONE.
  --
  -- Without it `custom.form_submit` holds every answer for a person and the
  -- form is a drawer. The Rule is REC-15's own shape, referencing Fields BY ID
  -- (REC-17) — a Rule naming a field by its KEY is refused, and it is right to.
  -- With nothing required the test is honestly a constant, and it says so in
  -- its own name rather than pretending to check something.
  -- ─────────────────────────────────────────────────────────────────────────
  if v_accept is null then
    foreach v_key in array v_required loop
      select r.id into v_fid
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.field_kernel_id()
         and r.deleted_at is null
         and r.data ->> 'key' = v_key
         and nullif(r.data ->> 'table_id', '')::uuid = p_table_id
       limit 1;
      if v_fid is not null then
        v_ids := v_ids || v_fid;
      end if;
    end loop;

    if array_length(v_ids, 1) is null then
      v_expr := jsonb_build_object('const', true);
      v_aname := coalesce(nullif(btrim(p_title), ''), 'This form') || ': take every answer';
    else
      foreach v_fid in array v_ids loop
        v_args := v_args || jsonb_build_array(
          jsonb_build_object('op', 'present',
                             'args', jsonb_build_array(jsonb_build_object('field', v_fid))));
      end loop;
      if jsonb_array_length(v_args) = 1 then
        v_expr := v_args -> 0;
      else
        v_expr := jsonb_build_object('op', 'and', 'args', v_args);
      end if;
      v_aname := coalesce(nullif(btrim(p_title), ''), 'This form')
                 || ': every answer it asks for is there';
    end if;

    v_accept := custom.rule_declare(p_organization_id, jsonb_build_object(
      'name', v_aname,
      'kind', 'predicate',
      -- V11-C (2026-09-22): `membership`, NOT `validate`. See this file's header.
      'uses', jsonb_build_array('membership'),
      'scope_table_id', p_table_id,
      'applies_to_types', '[]'::jsonb,
      'expr', v_expr,
      'description',
        'DOOR-17: an anonymous answer lands quarantined and becomes a record only when '
        || 'this Rule admits it. It is the form''s validation and its release in one '
        || 'object, so the two cannot disagree. Made by custom.form_declare because the '
        || 'caller brought none — without it every answer is held for a person forever. '
        || 'V11-C: its use is `membership` — it says which SUBMISSIONS this form admits, '
        || 'which is what custom.anon_clear asks it through custom.rule_run. A `validate` '
        || 'use would enlist it in the table''s write-time checks and make the form''s '
        || 'questions compulsory for every record anybody writes by any route.'
    ), null);
  end if;

  -- The presentation carries the questions as the form WORDS them; the answerable key
  -- list is what the door enforces. One object, two readers, no third place to drift.
  v_present := coalesce(p_presentation, '{}'::jsonb) || jsonb_build_object('questions', p_questions);

  -- ─────────────────────────────────────────────────────────────────────────
  -- S7': WHAT THE STRANGER SEES AFTER SENDING, JUDGED HERE, ONCE.
  --
  -- `thank_you` is {title, body, redirect_url}. The message is the form's own words. The
  -- redirect is optional and it is an ADDRESS a stranger's browser is sent to, so it is held
  -- to one rule: a secure page on one of this organization's own sites — its website, and the
  -- list it keeps in `custom/form_redirect_domains`. Anything else is refused by name with the
  -- list it may use, never quietly dropped: the owner typed it and expects it to work.
  -- ─────────────────────────────────────────────────────────────────────────
  if jsonb_typeof(v_present -> 'thank_you') is not null
     and jsonb_typeof(v_present -> 'thank_you') not in ('object', 'null') then
    raise exception 'The thank-you screen has to be a title, a message and an optional address, not %.',
                    jsonb_typeof(v_present -> 'thank_you')
      using errcode = '22023',
            hint = 'presentation.thank_you is {"title": "…", "body": "…", "redirect_url": "https://…"}; every part may be left out.';
  end if;
  if jsonb_typeof(v_present -> 'thank_you') = 'object' then
    v_redirect := nullif(btrim(coalesce(v_present #>> '{thank_you,redirect_url}', '')), '');
    if v_redirect is null then
      v_present := v_present #- '{thank_you,redirect_url}';
    else
      v_said := custom.form_redirect_refusal(p_organization_id, v_redirect);
      if v_said is not null then
        raise exception '%', v_said
          using errcode = '22023',
                hint = 'Leave the address empty and the thank-you message is shown instead. An organization''s own sites are its website and the list in its forms settings (custom/form_redirect_domains).';
      end if;
      v_present := jsonb_set(v_present, '{thank_you,redirect_url}', to_jsonb(v_redirect));
    end if;
  end if;

  if p_form_id is not null then
    select honeypot_key into v_hp from custom.anon_form
     where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
    if v_hp is null and not found then
      raise exception 'There is no form % in this organization.', p_form_id
        using errcode = '23503';
    end if;
  end if;
  -- ONE decoy per form, minted once and kept, so a bot cannot learn the name by watching
  -- two forms. `extensions.` is written out because search_path is pg_catalog here.
  v_hp := coalesce(v_hp, 'confirm_' || encode(extensions.gen_random_bytes(5), 'hex'));
  v_slug := coalesce(nullif(btrim(p_slug), ''), custom.form_slug(p_organization_id, p_title, p_form_id));

  if p_form_id is null then
    insert into custom.anon_form (organization_id, table_id, slug, title, exposed_field_keys,
                                  required_field_keys, presentation, submission_cap,
                                  quarantine_rule_id, notify_rule_id, honeypot_key)
    values (p_organization_id, p_table_id, v_slug, nullif(btrim(p_title), ''),
            to_jsonb(v_exposed), to_jsonb(v_required), v_present, p_submission_cap,
            v_accept, p_notify_rule_id, v_hp)
    returning id into v_id;
  else
    update custom.anon_form
       set table_id = p_table_id,
           slug = v_slug,
           title = nullif(btrim(p_title), ''),
           exposed_field_keys = to_jsonb(v_exposed),
           required_field_keys = to_jsonb(v_required),
           presentation = v_present,
           submission_cap = p_submission_cap,
           quarantine_rule_id = v_accept,
           notify_rule_id = p_notify_rule_id,
           honeypot_key = v_hp
     where organization_id = p_organization_id and id = p_form_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'There is no form % in this organization.', p_form_id
        using errcode = '23503';
    end if;
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.grid_layout(p_organization_id uuid, p_table_id uuid, p_view_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_platform jsonb;
  v_org      jsonb;
  v_view     jsonb := '{}'::jsonb;
  v_layout   jsonb;
  v_source   jsonb := '{}'::jsonb;
  v_refused  jsonb := '[]'::jsonb;
  e          record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.grid_layout');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.grid_layout');

  select k.value into v_platform from platform.feature_knob k where k.feature = 'custom' and k.key = 'grid_layout';
  v_platform := coalesce(v_platform,
    '{"mode":"auto","fit_max_columns":8,"row_height":"normal","freeze_first_column":false,"wrap":false}'::jsonb);
  v_org := platform.knob_resolve('custom', 'grid_layout', p_organization_id);

  v_layout := v_platform;
  for e in select key from jsonb_object_keys(v_platform) key loop
    v_source := v_source || jsonb_build_object(e.key, 'platform');
  end loop;

  -- The organization's own default, choice by choice. A choice that is not one the grid can
  -- honour is left at the platform's and NAMED — an organization's setting is never
  -- silently ignored.
  if jsonb_typeof(v_org) = 'object' then
    for e in select key, value from jsonb_each(v_org) loop
      begin
        v_layout := v_layout || custom.grid_layout_check(jsonb_build_object(e.key, e.value), 'organization');
        if (v_platform -> e.key) is distinct from e.value then
          v_source := v_source || jsonb_build_object(e.key, 'organization');
        end if;
      exception when invalid_parameter_value then
        v_refused := v_refused || jsonb_build_array(jsonb_build_object('from', 'organization', 'choice', e.key,
                       'value', e.value, 'says', sqlerrm));
      end;
    end loop;
  end if;

  if p_view_id is not null then
    -- G7: the grid's choices are `definition.grid`; `definition.layout` is the view's kind
    -- (grid / kanban / calendar / gallery) and is not a grid setting. A G1-shaped object under
    -- `layout` is still read, so no rehearsal view goes silent.
    select coalesce(case when jsonb_typeof(v.definition -> 'grid') = 'object' then v.definition -> 'grid' end,
                    case when jsonb_typeof(v.definition -> 'layout') = 'object' then v.definition -> 'layout' end,
                    '{}'::jsonb)
      into v_view
      from platform.saved_view v
     where v.id = p_view_id
       and v.organization_id = p_organization_id
       and v.subject_id = p_table_id
       and v.deleted_at is null;
    if v_view is null then
      raise exception 'There is no saved view % of this table.', p_view_id
        using errcode = '23503',
              hint = 'It may have been removed, or it is a view of another table. The organization''s own layout still applies.';
    end if;
    if jsonb_typeof(v_view) = 'object' then
      for e in select key, value from jsonb_each(v_view) loop
        begin
          v_layout := v_layout || custom.grid_layout_check(jsonb_build_object(e.key, e.value), 'view');
          v_source := v_source || jsonb_build_object(e.key, 'view');
        exception when invalid_parameter_value then
          v_refused := v_refused || jsonb_build_array(jsonb_build_object('from', 'view', 'choice', e.key,
                         'value', e.value, 'says', sqlerrm));
        end;
      end loop;
    end if;
  end if;

  return jsonb_build_object('layout', v_layout, 'source', v_source, 'view_id', p_view_id,
                            'refused', v_refused);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_comment_write(p_organization_id uuid, p_record_id uuid, p_body text, p_anchor jsonb DEFAULT '{}'::jsonb, p_parent_comment_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user  uuid := custom.query_principal();
  v_doc   jsonb;
  v_table uuid;
  v_id    uuid;
  v_org_of_record uuid;
  v_field text;
  v_extra jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_comment_write');
  -- THE ORGANIZATION WALL, IN THIS DOOR'S OWN BODY (STORE-DOORS-DECIDE-RED, 2026-09-26). RC-A2h
  -- moved the row question to platform.detail_parent_access_for, which is right and stays; this
  -- is the first half of DOOR-1's one order (the wall, then the row) that custom.read_record and
  -- custom.comment_thread already ask. Members, portal principals, people a Table of this
  -- organization is shared with and scope members pass it exactly as before (memoised per
  -- transaction); a stranger now hears a sentence instead of a door that trusted its argument.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_comment_write');
  if coalesce(btrim(coalesce(p_body, '')), '') = '' then
    raise exception 'custom.io_comment_write: a comment with no body is not a comment'
      using errcode = '22004';
  end if;

  -- THE LEVEL: commenter on the record (viewer < commenter < editor < admin), asked of the store's
  -- one answer. The refusal sentence matches the fact (lane LEAK-T10): the lower rung is asked
  -- before telling anybody they may read a record.
  if not platform.detail_parent_access_for(v_user, 'record', p_record_id, 'commenter'::public.permission_level) then
    if platform.detail_parent_access_for(v_user, 'record', p_record_id, 'viewer'::public.permission_level) then
      raise exception 'You may read this record but not comment on it.'
        using errcode = '42501',
              hint = 'Commenting needs the commenter level on the record (viewer < commenter < editor < admin). Ask whoever shared it with you to raise your level; nothing about the record itself has to change.';
    end if;
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'REC-29 / VIS-1: this is the same answer every other door gives about a record you do not hold, and it is deliberately the same whether the record exists or not. Ask whoever owns it to share it with you at the commenter level.';
  end if;

  -- THE ORGANIZATION IS THE RECORD'S (ARGS-RULED 2026-09-21), never the caller's to choose.
  v_org_of_record := custom._organization_of_record(p_record_id);
  if v_org_of_record is null then
    raise exception 'custom.io_comment_write: record % is not in this organization, or is deleted', p_record_id
      using errcode = '23503';
  end if;
  if v_org_of_record <> p_organization_id then
    raise exception 'That record belongs to a different organization, so the comment was not written.'
      using errcode = '23514',
            hint = format('A comment is filed where its record lives. This record belongs to organization %s; you named %s. Switch to that organization and comment there — being shared a record does not move it.',
                          v_org_of_record, p_organization_id);
  end if;

  -- THE ONE READ DOOR for the table id (a convenience copy; absent when the read door declines).
  begin
    v_doc := custom.read_record(p_organization_id, p_record_id, true);
  exception when sqlstate '42501' then
    v_doc := null;
  end;
  v_table := (v_doc ->> 'table_id')::uuid;

  if p_parent_comment_id is not null
     and not exists (select 1 from platform.comments c
                      where c.organization_id = p_organization_id
                        and c.id = p_parent_comment_id
                        and c.entity_type = 'record'
                        and c.entity_id = p_record_id
                        and c.deleted_at is null) then
    -- A reply to a comment on ANOTHER record would put one conversation in two places.
    raise exception 'custom.io_comment_write: comment % is not a comment on record %', p_parent_comment_id, p_record_id
      using errcode = '23503';
  end if;

  -- 🚨 RC-A2e: THE ONE COMMENT STORE. A record comment is a platform.comments row on
  -- (record, id); the field it points at is a record_field_anchor kind, mentions and the table id
  -- ride in metadata, and any other key the caller sent is kept, never dropped.
  v_field := nullif(btrim(coalesce(p_anchor ->> 'field_key', '')), '');
  v_extra := nullif(coalesce(p_anchor, '{}'::jsonb) - 'field_key' - 'mentions', '{}'::jsonb);
  insert into platform.comments (organization_id, entity_type, entity_id, parent_id, body, anchor,
                                 metadata, created_by, updated_by)
  values (p_organization_id, 'record', p_record_id, p_parent_comment_id, btrim(p_body),
          case when v_field is not null
               then jsonb_build_object('__kind', 'record_field_anchor', 'field_key', v_field) end,
          jsonb_strip_nulls(jsonb_build_object(
            'table_id', v_table,
            'mentions', case when jsonb_typeof(p_anchor -> 'mentions') = 'array' then p_anchor -> 'mentions' end,
            'anchor_extra', v_extra)),
          v_user, v_user)
  returning id into v_id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_import_rows(p_organization_id uuid, p_import_id uuid, p_rows jsonb, p_mapping jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_keep    constant integer := 500;   -- the cap on kept refusals / duplicates, said out loud
  v_run     custom.io_import;
  v_map     jsonb;
  v_fields  jsonb := '{}'::jsonb;      -- field key -> the Field document
  v_f       record;
  v_row     jsonb;
  v_doc     jsonb;
  v_values  jsonb;
  v_src     jsonb;
  v_key     text;
  v_val     jsonb;
  v_word    text;
  v_mapped  text;
  v_cell    jsonb;
  v_order   text;
  v_dk      text;
  v_dkvals  text[];
  v_exist   jsonb := '{}'::jsonb;      -- duplicate-key value -> the record already holding it
  v_seen    integer := 0;
  v_landed  integer := 0;
  v_dupes   integer := 0;
  v_bad     integer := 0;
  v_out     jsonb := '[]'::jsonb;      -- this batch's per-row outcomes
  v_ref     jsonb := '[]'::jsonb;
  v_dup     jsonb := '[]'::jsonb;
  v_unmap   jsonb := '{}'::jsonb;
  v_props   jsonb := '[]'::jsonb;
  v_patch   jsonb;
  v_reason  text;
  v_index   integer;
  v_mode    text;
  v_made    jsonb := '[]'::jsonb;      -- the columns this call had to declare after all
  v_decl    jsonb;
  -- THE PLAN. One entry per row of this batch, in file order, decided before anything is
  -- written; `ord` is a row's place in the batched statement, which is also where its id is.
  v_plan    jsonb := '[]'::jsonb;
  v_entry   jsonb;
  v_ord     integer := 0;
  v_docs    jsonb[] := array[]::jsonb[];
  v_ids     uuid[] := array[]::uuid[];
  v_id      uuid;
  v_fell    text := null;              -- why the batched statement was refused, if it was
  v_failed  jsonb := '{}'::jsonb;      -- ord -> why THAT row could not be written on its own
  -- THE UNIQUE RULE, HELD INSIDE THE BATCH (see the migration header, (c)).
  v_uq      text[] := array[]::text[]; -- the keys of the columns carrying a unique rule
  v_uqlab   jsonb := '{}'::jsonb;      -- key -> the word a person reads
  v_uqseen  jsonb := '{}'::jsonb;      -- "key|lowered value" -> the row that took it
  v_u       text;
  -- IMPORT-2: how long the WRITING phase of this call took, and what that makes a comfortable
  -- number of rows for the next one. Measured, never assumed.
  c_comfort numeric;                   -- the milliseconds of MEASURED writing work a call aims at:
                                       -- HALF of knob copy/max_auth_lock_ms (lane FOLLOW-BATCH-2;
                                       -- it was a fixed 2000). Every call locks the sign-in table
                                       -- from its first insert to its COMMIT (each row names who
                                       -- created it), so a call is a step of a copy; half leaves
                                       -- room for the outcome phase after the writes and for a
                                       -- database that gets twice as busy between two calls.
  v_t0      timestamptz;
  v_wrote   numeric;
  v_perrow  numeric;
  v_next    integer;
begin
  c_comfort := greatest(100, 0.5 * (platform.knob_resolve('copy', 'max_auth_lock_ms', p_organization_id) #>> '{}')::numeric);
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_rows');
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_rows');

  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'There is no import run here to add rows to.'
      using errcode = '23503',
            hint = 'Open one with custom.io_import_begin first. Nothing was written.';
  end if;
  if v_run.state = 'finished' then
    raise exception 'That import was finished on %, so no more rows go into it.',
                    to_char(coalesce(v_run.finished_at, v_run.updated_at) at time zone 'utc', 'FMDay FMDD FMMonth, HH24:MI')
      using errcode = '23514',
            hint = 'Start a new import for the rest of the file. Nothing was written.';
  end if;
  -- THE RUNG, ON THE TABLE THIS RUN BELONGS TO, on every batch.
  perform custom.assert_client_may_change(p_organization_id, v_run.table_id, 'custom.io_import_rows',
                                          'editor'::public.permission_level, 'table');

  v_map   := coalesce(v_run.mapping, '{}'::jsonb) || coalesce(p_mapping, '{}'::jsonb);
  v_order := lower(coalesce(nullif(v_run.policy ->> 'date_order', ''), 'mdy'));
  v_dk    := nullif(btrim(coalesce(v_run.dedupe_key, '')), '');
  v_mode  := lower(coalesce(nullif(v_run.policy ->> 'unmapped', ''), 'propose'));

  -- ── THE COLUMNS. A run whose wizard took the `io_import_declare_columns` step finds every
  --    column already here and declares NOTHING; a caller that skipped it still lands its
  --    rows, because FIX-10B's pre-pass is the safety net rather than the normal path.
  if v_mode = 'create' then
    v_decl := custom._io_declare_unmapped(p_organization_id, v_run.table_id, p_rows, v_map);
    v_map  := v_decl -> 'mapping';
    v_made := (select coalesce(jsonb_agg(c || jsonb_build_object('import_id', p_import_id::text)), '[]'::jsonb)
                 from jsonb_array_elements(v_decl -> 'columns_added') c);
  end if;

  -- THE TABLE'S OWN COLUMNS, READ ONCE FOR THE WHOLE BATCH — after any declaration above, so
  -- the batch is written against what the table actually has.
  for v_f in select f.data as data from custom.applicable_fields(p_organization_id, v_run.table_id, null) f
  loop
    v_fields := v_fields || jsonb_build_object(v_f.data ->> 'key', v_f.data);
    if exists (select 1 from jsonb_array_elements(coalesce(v_f.data -> 'rules', '[]'::jsonb)) x
                where x ->> 'kind' = 'unique') then
      v_uq    := v_uq || (v_f.data ->> 'key');
      v_uqlab := v_uqlab || jsonb_build_object(v_f.data ->> 'key',
                              coalesce(nullif(v_f.data ->> 'label', ''), v_f.data ->> 'key'));
    end if;
  end loop;

  -- WHAT IS ALREADY HERE, for exactly the key values this batch carries.
  if v_dk is not null then
    select array_agg(distinct w) into v_dkvals
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r,
           lateral (select btrim(coalesce(
                      r.value ->> coalesce((select k from jsonb_each_text(v_map) m(k, val) where val = v_dk limit 1), v_dk),
                      r.value ->> v_dk, '')) as w) s
     where s.w <> '';
    if v_dkvals is not null and cardinality(v_dkvals) > 0 then
      select coalesce(jsonb_object_agg(t.w, t.id), '{}'::jsonb) into v_exist
        from (select r.data ->> v_dk as w, min(r.id::text) as id
                from custom.record r
               where r.organization_id = p_organization_id
                 and r.table_id = v_run.table_id
                 and r.data_class = 'record'
                 and r.deleted_at is null
                 and r.data ->> v_dk = any (v_dkvals)
               group by 1) t;
    end if;
  end if;

  -- THE SOURCE EVERY VALUE OF THIS RUN POINTS AT.
  v_src := jsonb_strip_nulls(jsonb_build_object(
             'kind',      'import',
             'import_id', p_import_id::text,
             'file',      v_run.source_name,
             'hash',      v_run.file_hash,
             'format',    v_run.format));

  -- ══ PHASE ONE — THE PLAN. Nothing is written here. ═══════════════════════════════════════
  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_seen  := v_seen + 1;
    v_index := coalesce(v_run.rows_seen, 0) + v_seen;
    v_doc   := '{}'::jsonb;
    v_values:= '{}'::jsonb;
    v_reason:= null;

    for v_key, v_val in select key, value from jsonb_each(v_row) loop
      v_mapped := coalesce(v_map ->> v_key,
                           case when v_fields ? v_key then v_key else null end);
      if v_mapped is null then
        -- SCR-N-7: not an error, an OFFER.
        v_unmap := v_unmap || jsonb_build_object(
          v_key, coalesce(v_unmap -> v_key, '[]'::jsonb) ||
                 case when jsonb_array_length(coalesce(v_unmap -> v_key, '[]'::jsonb)) < 12
                        and coalesce(v_val #>> '{}', '') <> ''
                      then jsonb_build_array(v_val) else '[]'::jsonb end);
        continue;
      end if;
      if not (v_fields ? v_mapped) then
        v_reason := format('This table has no column called "%s", so "%s" has nowhere to go.', v_mapped, v_key);
        exit;
      end if;
      v_word := v_val #>> '{}';
      v_cell := custom.io_cell(p_organization_id, v_fields -> v_mapped, v_word, v_order);
      if not (v_cell ->> 'ok')::boolean then
        v_reason := v_cell ->> 'reason';
        exit;
      end if;
      if coalesce((v_cell ->> 'skip')::boolean, false) then
        continue;
      end if;
      v_doc    := v_doc    || jsonb_build_object(v_mapped, v_cell -> 'value');
      v_values := v_values || jsonb_build_object(v_mapped, jsonb_build_object('src', v_src));
    end loop;

    -- LIMITS-FIX 2026-09-21: A ROW WITH NOTHING IN IT IS NOT A RECORD.
    if v_reason is null and v_doc = '{}'::jsonb then
      v_reason := case
        when jsonb_typeof(v_row) = 'object' and (select count(*) from jsonb_object_keys(v_row)) = 0
          then 'This row is empty, so there is nothing to save.'
        when v_unmap = '{}'::jsonb
          then 'Every column in this row was blank, so there is nothing to save.'
        else format('None of this row''s columns go anywhere in this table, so there is nothing to save. Unmatched: %s.',
                    (select string_agg(k, ', ' order by k) from jsonb_object_keys(v_unmap) k))
      end;
    end if;

    if v_reason is not null then
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                  'kind', 'refused', 'row', v_index, 'reason', v_reason, 'source', v_row));
      continue;
    end if;

    -- ALREADY HERE? The duplicate key decides, and the policy decides what that means.
    -- A key this batch has already PLANNED counts, exactly as a key it had already written
    -- counted before — `v_exist` carries `pending:<ord>` for those, because the id is minted
    -- in the plan and `custom.record_write_many` gives the rows back in input order.
    if v_dk is not null then
      v_word := v_doc ->> v_dk;
      if v_word is not null and v_exist ? v_word then
        v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                    'kind', 'duplicate', 'row', v_index, 'key', v_word,
                    'hit', v_exist ->> v_word, 'doc', v_doc, 'values', v_values, 'source', v_row));
        continue;
      end if;
    end if;

    -- THE UNIQUE RULE, INSIDE THIS BATCH. custom._unique_rule_holds asks custom.record, and a
    -- row written earlier in the SAME statement is not there to be found, so the door holds
    -- the line for the batch with that trigger's own sentence and SQLSTATE. Anything this
    -- batch cannot see — another session, an earlier batch, a record already here — is still
    -- the trigger's to refuse.
    if cardinality(v_uq) > 0 then
      foreach v_key in array v_uq loop
        v_word := v_doc ->> v_key;
        if v_word is null then continue; end if;
        v_u := lower(btrim(v_word));
        if v_u = '' then continue; end if;
        if v_uqseen ? (v_key || '|' || v_u) then
          v_reason := format('Another record here already has %s "%s", and %s has to be different on every record.',
                             v_uqlab ->> v_key, btrim(v_word), v_uqlab ->> v_key);
          exit;
        end if;
      end loop;
    end if;

    if v_reason is not null then
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                  'kind', 'refused', 'row', v_index, 'reason', v_reason, 'source', v_row));
      continue;
    end if;

    v_ord  := v_ord + 1;
    v_id   := gen_random_uuid();
    v_ids  := v_ids  || v_id;
    v_docs := v_docs || (
                v_doc
                || case when v_values = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('_values', v_values) end
                || jsonb_build_object('_actor', 'system',
                                      '_source', jsonb_strip_nulls(jsonb_build_object(
                                        'via', 'import', 'import_id', p_import_id::text,
                                        'file', v_run.source_name, 'row', v_index))));
    v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                'kind', 'write', 'row', v_index, 'ord', v_ord, 'source', v_row));
    if v_dk is not null and v_doc ->> v_dk is not null then
      v_exist := v_exist || jsonb_build_object(v_doc ->> v_dk, 'pending:' || v_ord::text);
    end if;
    if cardinality(v_uq) > 0 then
      foreach v_key in array v_uq loop
        v_word := v_doc ->> v_key;
        if v_word is null then continue; end if;
        v_u := lower(btrim(v_word));
        if v_u <> '' then v_uqseen := v_uqseen || jsonb_build_object(v_key || '|' || v_u, v_ord); end if;
      end loop;
    end if;
  end loop;

  -- ══ PHASE TWO — ONE STATEMENT. ═══════════════════════════════════════════════════════════
  v_t0 := clock_timestamp();
  if cardinality(v_ids) > 0 then
    begin
      perform custom.record_write_many(p_organization_id, v_run.table_id, v_docs, v_ids);
    exception when others then
      -- A BAD ROW REFUSES THE WHOLE STATEMENT, WHICH IS RIGHT FOR A PASTE AND WRONG FOR AN
      -- IMPORT. The plan is replayed through the single-row door so every row carries its own
      -- outcome and the good rows still land. Only a refused batch pays for this.
      v_fell := sqlerrm;
    end;
  end if;

  if v_fell is not null then
    v_ids := array_fill(null::uuid, array[cardinality(v_ids)]);
    for v_entry in select value from jsonb_array_elements(v_plan) where value ->> 'kind' = 'write' loop
      v_ord := (v_entry ->> 'ord')::integer;
      begin
        v_ids[v_ord] := custom.record_write(p_organization_id, v_run.table_id, v_docs[v_ord]);
      exception when others then
        v_ids[v_ord] := null;
        v_failed := v_failed || jsonb_build_object(v_ord::text,
                      jsonb_build_object('reason', sqlerrm, 'sqlstate', sqlstate));
      end;
    end loop;
  end if;

  -- HOW MANY ROWS THIS DATABASE CAN COMFORTABLY TAKE IN ONE CALL, from what it just did.
  -- Only the writing phase is measured, because that is the part that scales with the batch.
  v_wrote  := extract(epoch from clock_timestamp() - v_t0) * 1000;
  v_perrow := case when cardinality(v_ids) > 0 then v_wrote / cardinality(v_ids) else null end;
  v_next   := case when coalesce(v_perrow, 0) <= 0 then null
                   else greatest(25, least(1000, floor(c_comfort / v_perrow)::integer)) end;

  -- ══ PHASE THREE — WHAT HAPPENED TO EVERY ROW, IN FILE ORDER. ═════════════════════════════
  for v_entry in select value from jsonb_array_elements(v_plan) loop
    v_index := (v_entry ->> 'row')::integer;

    if v_entry ->> 'kind' = 'refused' then
      v_bad := v_bad + 1;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
                 'row', v_index, 'outcome', 'refused', 'reason', v_entry ->> 'reason', 'source', v_entry -> 'source'));
      if jsonb_array_length(v_ref) < c_keep then
        v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'sqlstate', '22023', 'reason', v_entry ->> 'reason', 'source', v_entry -> 'source'));
      end if;

    elsif v_entry ->> 'kind' = 'write' then
      v_ord := (v_entry ->> 'ord')::integer;
      if v_ids[v_ord] is null then
        v_bad := v_bad + 1;
        v_out := v_out || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'outcome', 'refused',
                   'reason', coalesce(v_failed -> v_ord::text ->> 'reason', v_fell), 'source', v_entry -> 'source'));
        if jsonb_array_length(v_ref) < c_keep then
          v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                     'row', v_index, 'sqlstate', coalesce(v_entry ->> 'sqlstate', '22023'),
                     'reason', coalesce(v_failed -> v_ord::text ->> 'reason', v_fell), 'source', v_entry -> 'source'));
        end if;
      else
        v_landed := v_landed + 1;
        v_out := v_out || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'outcome', 'landed', 'record_id', v_ids[v_ord]));
      end if;

    else  -- a duplicate of something already here, or of a row this very batch planned
      v_word := v_entry ->> 'hit';
      if left(v_word, 8) = 'pending:' then
        v_ord := substr(v_word, 9)::integer;
        if v_ids[v_ord] is null then
          -- The row this one repeats was refused after all, so this copy is not a repeat of
          -- anything that exists. It is written on its own, exactly as it would have been.
          begin
            v_id := custom.record_write(p_organization_id, v_run.table_id,
                      (v_entry -> 'doc')
                      || case when (v_entry -> 'values') = '{}'::jsonb then '{}'::jsonb
                              else jsonb_build_object('_values', v_entry -> 'values') end
                      || jsonb_build_object('_actor', 'system',
                                            '_source', jsonb_strip_nulls(jsonb_build_object(
                                              'via', 'import', 'import_id', p_import_id::text,
                                              'file', v_run.source_name, 'row', v_index))));
            v_landed := v_landed + 1;
            v_out := v_out || jsonb_build_array(jsonb_build_object(
                       'row', v_index, 'outcome', 'landed', 'record_id', v_id));
          exception when others then
            v_bad := v_bad + 1;
            v_out := v_out || jsonb_build_array(jsonb_build_object(
                       'row', v_index, 'outcome', 'refused', 'reason', sqlerrm, 'source', v_entry -> 'source'));
            if jsonb_array_length(v_ref) < c_keep then
              v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                         'row', v_index, 'sqlstate', sqlstate, 'reason', sqlerrm, 'source', v_entry -> 'source'));
            end if;
          end;
          continue;
        end if;
        v_word := v_ids[v_ord]::text;
      end if;

      v_dupes := v_dupes + 1;
      v_patch := (v_entry -> 'doc') - v_dk;
      if lower(coalesce(v_run.policy ->> 'on_duplicate', 'skip')) = 'update' then
        begin
          if v_patch <> '{}'::jsonb then
            perform custom.record_update(p_organization_id, v_word::uuid,
                      v_patch || jsonb_build_object('_values', (v_entry -> 'values') - v_dk, '_actor', 'system'), null);
          end if;
          v_out := v_out || jsonb_build_array(jsonb_build_object(
                     'row', v_index, 'outcome', 'duplicate', 'record_id', v_word::uuid,
                     'updated', v_patch <> '{}'::jsonb,
                     'reason', format('A record with %s = "%s" was already here, and it was brought up to date.', v_dk, v_entry ->> 'key')));
        exception when others then
          v_bad := v_bad + 1; v_dupes := v_dupes - 1;
          v_out := v_out || jsonb_build_array(jsonb_build_object(
                     'row', v_index, 'outcome', 'refused', 'reason', sqlerrm, 'source', v_entry -> 'source'));
          if jsonb_array_length(v_ref) < c_keep then
            v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                       'row', v_index, 'sqlstate', sqlstate, 'reason', sqlerrm, 'source', v_entry -> 'source'));
          end if;
          continue;
        end;
      else
        v_out := v_out || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'outcome', 'duplicate', 'record_id', v_word::uuid, 'updated', false,
                   'reason', format('A record with %s = "%s" was already here, and it was left alone.', v_dk, v_entry ->> 'key')));
      end if;
      if jsonb_array_length(v_dup) < c_keep then
        v_dup := v_dup || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'key', v_dk, 'value', v_entry ->> 'key',
                   'record_id', v_word::uuid, 'source', v_entry -> 'source'));
      end if;
    end if;
  end loop;

  -- THE PROPOSALS, built from everything this batch saw and MERGED with what earlier batches saw.
  select coalesce(jsonb_agg(p), '[]'::jsonb) into v_props
    from (
      select jsonb_build_object('column', u.key,
                                'samples', u.value,
                                'import_id', p_import_id::text)
             || (custom.io_infer_column(p_organization_id, v_run.table_id, u.key, u.value)
                   - 'header' - 'matched')
             || jsonb_build_object('state', 'proposed') as p
        from jsonb_each(v_unmap) u
       where not exists (select 1 from jsonb_array_elements(v_run.proposals) q
                          where q ->> 'column' = u.key)
    ) s;

  update custom.io_import
     set rows_seen      = rows_seen + v_seen,
         rows_written   = rows_written + v_landed,
         rows_duplicate = rows_duplicate + v_dupes,
         refusals       = refusals || v_ref,
         duplicates     = duplicates || v_dup,
         proposals      = proposals || v_made || v_props,
         mapping        = v_map,
         state          = 'written'
   where organization_id = p_organization_id and id = p_import_id;

  return jsonb_build_object(
    'import_id',      p_import_id,
    'rows_seen',      v_seen,
    'rows_written',   v_landed,
    'rows_duplicate', v_dupes,
    'rows_refused',   v_bad,
    'outcomes',       v_out,
    'proposals',      v_props,
    'columns_added',  v_made,
    -- Said out loud rather than hidden: this batch could not be written as one statement, so
    -- every row was written on its own and the refusals below name the rows that could not be.
    'one_statement',  v_fell is null,
    -- The measurement, said out loud: what the writing phase of THIS call cost a row, and how
    -- many rows that makes three seconds' worth. A caller that ignores them loses nothing.
    'write_ms',       round(v_wrote),
    'ms_per_row',     round(coalesce(v_perrow, 0), 2),
    'rows_per_call',  v_next,
    'refusals',       v_ref);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_proposal_accept(p_organization_id uuid, p_import_id uuid, p_column text, p_type text DEFAULT NULL::text, p_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run      custom.io_import;
  v_proposal jsonb;
  v_type     text;
  v_word     text;
  v_format   text;
  v_key      text;
  v_field_id uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_proposal_accept');
  perform custom.assert_store_door(p_organization_id, 'custom.io_proposal_accept');
  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'custom.io_proposal_accept: no import run % for this organization', p_import_id
      using errcode = '23503';
  end if;

  select p into v_proposal
    from jsonb_array_elements(v_run.proposals) p
   where p ->> 'column' = p_column
   limit 1;
  if v_proposal is null then
    raise exception 'custom.io_proposal_accept: import run % proposed no column "%". Its proposals are %.',
      p_import_id, p_column, coalesce((select string_agg(p ->> 'column', ', ')
                                         from jsonb_array_elements(v_run.proposals) p), '(none)')
      using errcode = '23503';
  end if;
  if v_proposal ->> 'state' = 'accepted' then
    raise exception 'custom.io_proposal_accept: "%" was already accepted on this run. Accepting twice would mint a second Field with the same key.', p_column
      using errcode = '23505';
  end if;

  -- THE PROPOSAL SPEAKS HUMAN; THE FIELD SPEAKS BEHAVIOUR. What a person sees offered is
  -- "this looks like a number" — but `custom._field_shape_guard` holds a Field's `type` to
  -- exactly five BEHAVIOURS (list, range, text, relation, formula), because "number",
  -- "currency" and "percent" are one behaviour wearing three units. So the human word is
  -- translated here, once, and the flavour is kept where the store keeps flavour: `format`.
  -- 🚨 RED-SUITES 2026-09-21 — THE KEY IS `type`, AND `inferred_type` WAS NEVER WRITTEN BY
  -- ANYBODY. `custom.io_infer_column` answers
  --     {"why": "Every value is a number.", "type": "number", "label": "Lead score", …}
  -- and `custom.io_import_rows` stores that object, minus `header` and `matched`, as the
  -- proposal. This line read `inferred_type`, which no door has ever produced, so the
  -- coalesce fell through to `'text'` EVERY TIME: the screen offered the person "this looks
  -- like a number", they accepted it, and the store minted a TEXT column. Measured through
  -- `w4_io_green` DOOR-14 on the main database — the accepted Field came back
  -- `"type": "text"` and the next import wrote the string "60" into it, which is precisely
  -- the "it is a label and not a type" the suite exists to catch.
  v_word := coalesce(nullif(btrim(coalesce(p_type, '')), ''),
                     nullif(btrim(coalesce(v_proposal ->> 'type', '')), ''),
                     'text');
  if v_word in ('list', 'range', 'text', 'relation', 'formula') then
    v_type := v_word;                    -- the caller named a behaviour outright
    v_format := null;
  elsif v_word = 'number' then
    v_type := 'range'; v_format := null;
  elsif v_word = 'date' then
    v_type := 'range'; v_format := 'date';
  elsif v_word = 'email' then
    v_type := 'text';  v_format := 'email';
  elsif v_word = 'url' then
    v_type := 'text';  v_format := 'url';
  elsif v_word = 'phone' then
    v_type := 'text';  v_format := 'phone';
  elsif v_word in ('checkbox', 'boolean', 'bool', 'yes_no', 'toggle') then
    -- LIMITS-FIX 2026-09-21: a tick box is now a BEHAVIOUR of its own and needs no options
    -- Table, so the conservative answer and the right answer are finally the same one. This
    -- arm used to fall through to TEXT with the note below; the note is kept in the file's
    -- header so the reason it existed is not lost.
    v_type := 'boolean'; v_format := null;
  else
    -- Everything else: TEXT. Conservative here costs one dropdown a person fixes in a
    -- second; wrong here costs a data repair.
    v_type := 'text';  v_format := null;
  end if;
  -- The key is the column's own name, lowered and de-spaced, because that is what the next
  -- import of the same file will match on without anyone authoring a mapping.
  v_key := regexp_replace(lower(btrim(p_column)), '[^a-z0-9]+', '_', 'g');
  v_key := btrim(v_key, '_');
  if v_key = '' then
    raise exception 'custom.io_proposal_accept: column "%" leaves no usable Field key', p_column
      using errcode = '22023';
  end if;

  -- DOOR-14 IS "ADD THIS AS A FIELD", AND THERE IS EXACTLY ONE DOOR THAT DOES BOTH HALVES.
  --
  -- 🚨 RED-SUITES 2026-09-21 — THIS BODY DEADLOCKED BETWEEN TWO CORRECT GUARDS, and accepting
  -- an imported column stopped working on the live database:
  --     Leads says it has a column called "lead_score", and there is no such field.
  --     HINT: REC-1 / REC-51 … Define it with custom.field_declare, which adds the name and
  --           the definition together, or leave the name off the table.
  -- It used to write the NAME onto the Table first and mint the Field second, because
  -- `custom._field_definition_write` refuses a Field whose Table has not declared its key.
  -- Lane FIELD-TRUTH then landed `custom.assert_columns_are_defined`, which refuses a Table
  -- that declares a column with no Field behind it — and it is right: a column nobody defined
  -- has no type, no rules and no validation, and 53 such names were found live. Both guards
  -- are correct and together they leave no order the two-step can run in: whichever half goes
  -- first, the other guard refuses it. `w4_io_green` PART 4 caught it.
  --
  -- The remedy is the one the refusal itself names. `custom.field_declare` writes the name
  -- and the definition in ONE transaction through `custom._field_document_for`, the builder
  -- both doors already share, so neither guard ever sees a half-made column. It is also the
  -- same door a hand-made Field goes through, which is what this body's next comment always
  -- said it wanted: an accepted proposal is a Field, not a second kind of Field, and nothing
  -- downstream has to ask where a Field came from.
  --
  -- A FIELD DOCUMENT IS NOT THREE KEYS. `custom._field_shape_guard` requires every Field to
  -- SAY the things a Field has to say — what it is a field OF, whether it holds one value or
  -- many, whether it is required, whether it is dated, its rules (even empty), where its
  -- values come from, and how sensitive they are — so the whole document is spelled out here
  -- exactly as it was before, and only the two calls that wrote it became one.
  --
  -- ALREADY THERE IS NOT AN ERROR. Re-accepting the same proposal answers the Field that
  -- exists rather than raising, which is what a person clicking twice deserves.
  select f.id into v_field_id
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and (f.data ->> 'entity_definition_id')::uuid = v_run.table_id
     and f.data ->> 'key' = v_key
     and f.deleted_at is null
   limit 1;
  if v_field_id is null then
    v_field_id := custom.field_declare(
      p_organization_id, v_run.table_id,
      jsonb_build_object('key', v_key,
                                                  -- RED-SUITES 2026-09-21: and the LABEL the same door worked out —
                         -- "Lead score", not the raw header key "lead_score". Same class as
                         -- the type above: the inference was made, shown, accepted, and then
                         -- dropped on the floor.
                         'label', coalesce(nullif(btrim(coalesce(p_label, '')), ''),
                                           nullif(btrim(coalesce(v_proposal ->> 'label', '')), ''),
                                           btrim(p_column)),
                         'type', v_type,
                         'format', v_format,
                         'multi', false,
                         'required', false,
                         'dated', false,
                         'sort', 0,
                         'rules', '[]'::jsonb,
                         'config', '{}'::jsonb,
                         'depends_on', '[]'::jsonb,
                         'applies_to_types', '[]'::jsonb,
                         -- `manual`, because that is the closed vocabulary's word for "a person
                         -- fills this in". WHERE it came from is source_config, below.
                         'source', 'manual',
                         'source_config', jsonb_build_object('origin', 'import_proposal',
                                                             'import_id', p_import_id,
                                                             'source_column', p_column),
                         -- `internal` is the conservative default: a column nobody has classified
                         -- is the organization's business and not the world's.
                         'sensitivity', 'internal',
                         'context_policy', 'include',
                         '_actor', 'system'));
  end if;

  update custom.io_import
     set proposals = (select jsonb_agg(case when p ->> 'column' = p_column
                                            then p || jsonb_build_object('state', 'accepted',
                                                                         'field_id', v_field_id)
                                            else p end)
                        from jsonb_array_elements(proposals) p),
         mapping   = mapping || jsonb_build_object(p_column, v_key)
   where organization_id = p_organization_id and id = p_import_id;

  return v_field_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.migrate_delete(p_organization_id uuid, p_record_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row     custom.record%rowtype;
  v_cascade uuid[];
  v_log     uuid;
  v_took    uuid[] := '{}';
  v_child   uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_delete');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.migrate_delete', 'editor'::public.permission_level, 'record');
  -- THE SWITCH. Every line below is behind custom/system_enabled: custom.assert_store_door
  -- resolves that knob and, while it is false, this store takes writes only from the role that
  -- owns custom.record. The switch never removes a check; it closes the door.
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_delete');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to delete.', p_record_id
      using errcode = '02000',
            hint = 'REC-23: a record already deleted is still here and still reversible — custom.record_restore(organization, record) brings it back until its Table''s retention runs out.';
  end if;

  -- THE SAME RULE THE DOOR WILL APPLY, asked not to change anything, so the inverse names
  -- exactly the records the door is about to take. It raises the refusals here too, before
  -- a Migration row exists for a delete that is not going to happen.
  v_cascade := custom.delete_cascade_closure(p_organization_id, p_record_id);

  v_log := history.migration_record(p_organization_id, 'delete', v_row.data_class, p_record_id,
             jsonb_build_object('kind', 'restore', 'record_id', p_record_id::text,
                                'also', to_jsonb(v_cascade)),
             coalesce(p_note, format('deleted with %s record(s) it contained or owned', coalesce(array_length(v_cascade, 1), 0))));

  perform custom.record_delete(p_organization_id, p_record_id);

  foreach v_child in array v_cascade loop
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is not null) then
      v_took := v_took || v_child;
    end if;
  end loop;

  return jsonb_build_object('verb', 'delete', 'record_id', p_record_id,
                            'migration_id', v_log, 'took_with_it', to_jsonb(v_took),
                            'cascaded', coalesce(array_length(v_took, 1), 0),
                            'reversible_until', 'the end of this table''s retention (REC-23)',
                            'at', now());
end;
$function$;

CREATE OR REPLACE FUNCTION custom.migrate_extract_parent(p_organization_id uuid, p_id uuid, p_parent_table_id uuid, p_moved_keys text[], p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row    custom.record%rowtype;
  v_parent uuid;
  v_data   jsonb := '{}'::jsonb;
  v_was    uuid;
  v_key    text;
  v_log    uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_extract_parent');
  perform custom.assert_client_may_change(p_organization_id, p_id, 'custom.migrate_extract_parent', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_extract_parent');
  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to extract a parent from.', p_id using errcode = '02000';
  end if;
  v_was := nullif(v_row.data ->> 'parent_id', '')::uuid;

  foreach v_key in array coalesce(p_moved_keys, '{}') loop
    if v_row.data ? v_key then
      v_data := v_data || jsonb_build_object(v_key, v_row.data -> v_key);
    end if;
  end loop;

  -- T5: extracting a Person parent from Practitioner Chen COPIES the shared facts up rather
  -- than moving them, because the Practitioner record is still a Practitioner and still has a
  -- phone number. The two Persons that result are two records — which is exactly why the next
  -- verb in T5 is a merge.
  v_parent := custom.record_write(p_organization_id, p_parent_table_id,
                v_data || case when v_was is null then '{}'::jsonb
                               else jsonb_build_object('parent_id', v_was::text) end);

  v_log := history.migration_record(p_organization_id, 'extract_parent', 'record', p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', jsonb_build_object('parent_id', v_was),
                                'delete_after', v_parent::text),
             coalesce(p_note, format('a parent was extracted above this record as %s', v_parent)));

  perform custom.record_reparent(p_organization_id, p_id, v_parent);

  return jsonb_build_object('verb', 'extract_parent', 'record_id', p_id, 'parent', v_parent,
                            'was_under', v_was, 'migration_id', v_log, 'at', now());
end;
$function$;

CREATE OR REPLACE FUNCTION custom.migrate_reclass(p_organization_id uuid, p_id uuid, p_to text DEFAULT 'field'::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row custom.record%rowtype;
  v_log uuid;
  v_ok  text;
begin
  -- OWNER-ONLY, ON PURPOSE, AND THEREFORE NOT GRANTED TO `authenticated`. This is the store
  -- repairing its OWN bookkeeping marker on a row whose document nobody is changing. A person
  -- has no verb that can put the wrong class on a row any more (custom._field_class_guard),
  -- so a person needs no verb to take it off.
  if not custom.query_is_store_owner() then
    raise exception 'custom.migrate_reclass repairs the store''s own bookkeeping and is not a verb a person calls.'
      using errcode = '42501',
            hint = 'Declare a column with custom.field_declare and it is written with the right class to begin with.';
  end if;
  if p_organization_id is null or p_id is null then
    raise exception 'custom.migrate_reclass: the organization and the row are both required — the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id;
  if v_row.id is null then
    raise exception 'There is no row % here to reclass.', p_id using errcode = '02000';
  end if;

  -- THE CLASS A ROW MAY BE GIVEN IS DECIDED BY THE TABLE IT IS IN, never by the caller. A
  -- verb that took any word would be the hole it exists to close.
  v_ok := case when v_row.table_id = custom.field_kernel_id() then 'field' else null end;
  if v_ok is null then
    raise exception 'custom.migrate_reclass knows how to reclass a row of the Field kernel, and this row is not one.'
      using errcode = '22023',
            hint = 'Every other kernel writes its own class through its own declaring door.';
  end if;
  if p_to is distinct from v_ok then
    raise exception 'A row of the Field kernel is a % and nothing else, so it cannot be reclassed to %.',
                    v_ok, custom.said(p_to, 'nothing')
      using errcode = '22023';
  end if;

  -- IDEMPOTENT, AND IT SAYS SO. Running this over the same organization twice changes nothing
  -- the second time and records no second Migration — a repair that logs work it did not do
  -- is a repair nobody can audit.
  if v_row.data_class = v_ok then
    return jsonb_build_object('verb', 'reclass', 'record_id', p_id, 'was', v_row.data_class,
                              'now', v_ok, 'changed', false, 'at', now());
  end if;

  -- HIS-8: the Migration is on the record BEFORE the write. Its inverse is recorded as `none`
  -- — one-way DELIBERATELY — because putting a Field row back to `'record'` is exactly the
  -- defect this closes and `custom._field_class_guard` now refuses it. The note carries the
  -- class it held, so what happened is fully readable even though it will not be put back.
  v_log := history.migration_record(p_organization_id, 'reclass', 'field', p_id,
             jsonb_build_object('kind', 'none'),
             coalesce(p_note, format(
               'this row of the Field kernel was marked %L and is a %L; its document is unchanged. '
               'It was written before the field door existed, through custom.record_write, whose '
               'data_class defaults to %L — so it was invisible to every reader that asks for a '
               'Field by class, including custom.field_declare''s duplicate check. One-way: the '
               'wrong class cannot be written again.', v_row.data_class, v_ok, 'record')));

  update custom.record r
     set data_class = v_ok
   where r.organization_id = p_organization_id and r.id = p_id;

  return jsonb_build_object('verb', 'reclass', 'record_id', p_id, 'was', v_row.data_class,
                            'now', v_ok, 'changed', true, 'migration_id', v_log, 'at', now());
end
$function$;

CREATE OR REPLACE FUNCTION custom.migrate_rename(p_organization_id uuid, p_id uuid, p_to text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row custom.record%rowtype;
  v_key text;
  v_was text;
  v_log uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_rename');
  perform custom.assert_client_may_change(p_organization_id, p_id, 'custom.migrate_rename', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_rename');
  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to rename.', p_id using errcode = '02000';
  end if;

  -- What "the name" IS depends on what this row is: a Table and a Field carry `name`/`label`
  -- of their own, and a record is named by its Table's title field (REC-1).
  v_key := case v_row.data_class
             when 'record' then coalesce(custom.table_type_field(p_organization_id, v_row.table_id), null)
             else null end;
  v_key := case when v_row.data_class = 'record'
                then coalesce((select t.data ->> 'title_field' from custom.record t
                                where t.organization_id = p_organization_id and t.id = v_row.table_id), 'name')
                when v_row.data ? 'name'  then 'name'
                when v_row.data ? 'label' then 'label'
                else 'name' end;
  v_was := v_row.data ->> v_key;

  v_log := history.migration_record(p_organization_id, 'rename', v_row.data_class, p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', jsonb_build_object(v_key, v_was)),
             coalesce(p_note, format('%s renamed from "%s" to "%s"', v_key, coalesce(v_was, 'nothing'), p_to)));
  perform custom.record_update(p_organization_id, p_id, jsonb_build_object(v_key, p_to));

  return jsonb_build_object('verb', 'rename', 'record_id', p_id, 'field', v_key,
                            'was', v_was, 'now', p_to, 'migration_id', v_log, 'at', now());
end;
$function$;

CREATE OR REPLACE FUNCTION custom.migrate_reparent(p_organization_id uuid, p_id uuid, p_parent_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_was uuid;
  v_log uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_reparent');
  perform custom.assert_client_may_change(p_organization_id, p_id, 'custom.migrate_reparent', 'editor'::public.permission_level, 'record');
  perform custom.assert_client_may_change(p_organization_id, p_parent_id, 'custom.migrate_reparent', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_reparent');
  select nullif(r.data ->> 'parent_id', '')::uuid into v_was
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if not found then
    raise exception 'There is no record % here to move.', p_id using errcode = '02000';
  end if;

  v_log := history.migration_record(p_organization_id, 'reparent', 'record', p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', jsonb_build_object('parent_id', v_was)),
             coalesce(p_note, format('moved from %s to %s', coalesce(v_was::text, 'nothing'), coalesce(p_parent_id::text, 'nothing'))));

  -- REC-24: ONE statement, so the containment edge and every Visibility answer that reads it
  -- change in the same commit. There is no window in which the old audience still reaches it.
  perform custom.record_reparent(p_organization_id, p_id, p_parent_id);

  return jsonb_build_object('verb', 'reparent', 'record_id', p_id, 'was', v_was,
                            'now', p_parent_id, 'migration_id', v_log,
                            'atomic_with_visibility', true, 'at', now());
end;
$function$;

CREATE OR REPLACE FUNCTION custom.migrate_retype(p_organization_id uuid, p_id uuid, p_to text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row     custom.record%rowtype;
  v_log     uuid;
  v_keep    jsonb;
  v_misfit  jsonb := '{}'::jsonb;
  v_ok      text[];
  v_key     text;
  v_to_tbl  uuid;
  v_was     text;
  v_conv    integer;
  v_ret     integer;
begin
  -- THE CALLER AND THE ROW, on the one ladder, exactly as the other verbs ask it — this verb
  -- is executable by `authenticated` and a door that decides nothing is not a door. Then the
  -- switch: custom.assert_store_door resolves custom/system_enabled.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_retype');
  perform custom.assert_client_may_change(p_organization_id, p_id, 'custom.migrate_retype', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_retype');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to retype.', p_id using errcode = '02000';
  end if;

  -- ── ARM TWO FIRST, because it is the smaller one: a FIELD changes what it behaves as
  --    (FLD-4 / T12). The values already written are CONVERTED where they convert and kept in
  --    `_retired` with their reason where they do not — by the trigger on the Field row, so
  --    this verb and an ordinary write behave identically.
  if v_row.data_class = 'field' then
    v_was := v_row.data ->> 'type';
    if v_was = p_to then
      return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                                'changed', false, 'at', now());
    end if;
    v_log := history.migration_record(p_organization_id, 'retype', 'field', p_id,
               jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                  'patch', jsonb_build_object('type', v_was)),
               coalesce(p_note, format('%s behaves as %s instead of %s; values that fit are converted and values that do not are kept in _retired with the reason, neither coerced nor deleted (FLD-4)', coalesce(v_row.data ->> 'label', v_row.data ->> 'key'), p_to, v_was)));
    perform custom.record_update(p_organization_id, p_id, jsonb_build_object('type', p_to));
    select count(*) filter (where true) into v_ret
      from custom.record x, lateral jsonb_array_elements(coalesce(x.data -> '_retired', '[]'::jsonb)) e
     where x.organization_id = p_organization_id
       and x.table_id = nullif(v_row.data ->> 'entity_definition_id', '')::uuid
       and x.deleted_at is null
       and e ->> 'key' = (v_row.data ->> 'key');
    select count(*) into v_conv
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = nullif(v_row.data ->> 'entity_definition_id', '')::uuid
       and x.deleted_at is null
       and x.data ? (v_row.data ->> 'key');
    return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                              'changed', true, 'migration_id', v_log,
                              'records_still_holding_a_value', v_conv,
                              'values_in_retired_for_this_field', v_ret,
                              'values', 'converted where they convert; kept in _retired with the reason where they do not (FLD-4 / T12)',
                              'at', now());
  end if;

  -- ── ARM ONE: a RECORD moves to another Table (REC-N-18 / T9). The id does not change, so
  --    every relation to it still resolves — that is the whole point of the verb.
  select t.id into v_to_tbl from custom.record t
   where t.organization_id = p_organization_id and t.data_class = 'table'
     and t.deleted_at is null
     and (t.id::text = p_to or t.data ->> 'slug' = p_to or t.data ->> 'name' = p_to)
   limit 1;
  if v_to_tbl is null then
    raise exception 'There is no table "%" in this organization to retype it to.', p_to
      using errcode = '02000', hint = 'REC-N-18: name the table by id, slug or name.';
  end if;

  select coalesce(array_agg(f.data ->> 'key'), '{}')
    into v_ok
    from custom.applicable_fields(p_organization_id, v_to_tbl, null) f;

  v_keep := v_row.data;
  for v_key in select jsonb_object_keys(v_row.data) loop
    if left(v_key, 1) = '_' or v_key in ('parent_id') then
      continue;
    end if;
    if not (v_key = any (v_ok)) then
      v_misfit := v_misfit || jsonb_build_object(v_key, v_row.data -> v_key);
      v_keep := v_keep - v_key;
      -- THE ENVELOPE GOES WITH THE VALUE. A record saying where a value it no longer holds
      -- came from is orphan provenance, and W1-VAL refuses it by name — correctly.
      v_keep := case when v_keep ? '_values'
                     then jsonb_set(v_keep, array['_values'], (v_keep -> '_values') - v_key)
                     else v_keep end;
    end if;
  end loop;

  v_log := history.migration_record(p_organization_id, 'retype', 'record', p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', v_row.data, 'table_id', v_row.table_id::text),
             coalesce(p_note, format('retyped to %s; %s value(s) did not fit and are in History with this reason, neither coerced nor deleted',
                                     coalesce((select t.data ->> 'name' from custom.record t
                                                where t.organization_id = p_organization_id and t.id = v_to_tbl), p_to),
                                     (select count(*) from jsonb_object_keys(v_misfit)))));

  update custom.record r
     set table_id = v_to_tbl, data = v_keep
   where r.organization_id = p_organization_id and r.id = p_id;

  return jsonb_build_object('verb', 'retype', 'record_id', p_id, 'kept_the_id', true,
                            'from_table', v_row.table_id, 'to_table', v_to_tbl,
                            'migration_id', v_log,
                            'misfits', v_misfit,
                            'misfits_are', 'in History with the reason, on migration ' || v_log::text,
                            'at', now());
end;
$function$;

CREATE OR REPLACE FUNCTION custom.migrate_split(p_organization_id uuid, p_record_id uuid, p_moved_keys text[], p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  custom.record%rowtype;
  v_new  uuid;
  v_keep jsonb;
  v_side jsonb := '{}'::jsonb;
  v_key  text;
  v_log  uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_split');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.migrate_split', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_split');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to split.', p_record_id using errcode = '02000';
  end if;
  if p_moved_keys is null or array_length(p_moved_keys, 1) is null then
    raise exception 'A split has to say what moves to the other side.'
      using errcode = '22004',
            hint = 'REC-22: name the fields that go to the new record. Everything else stays where it is, on the id that everything already points at.';
  end if;

  v_keep := v_row.data;
  foreach v_key in array p_moved_keys loop
    if v_row.data ? v_key then
      v_side := v_side || jsonb_build_object(v_key, v_row.data -> v_key);
      v_keep := v_keep - v_key;
      -- The value's envelope goes with the value. Leaving it behind would be a record
      -- carrying provenance for something it no longer holds.
      v_keep := case when v_keep ? '_values'
                     then jsonb_set(v_keep, array['_values'], (v_keep -> '_values') - v_key)
                     else v_keep end;
    end if;
  end loop;

  -- REC-22: ONE SIDE KEEPS THE ID, and it is the original record — never a new pair of ids
  -- with the old one pointing at one of them, because every relation, bookmark and citation
  -- out there already names it.
  v_new := custom.record_write(p_organization_id, v_row.table_id,
             v_side || jsonb_build_object('parent_id', nullif(v_row.data ->> 'parent_id', '')));

  v_log := history.migration_record(p_organization_id, 'split', v_row.data_class, p_record_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_record_id::text,
                                'patch', v_row.data, 'delete_after', v_new::text),
             coalesce(p_note, format('split %s off into %s', array_to_string(p_moved_keys, ', '), v_new)));

  -- A SPLIT MOVES. `custom.record_update` is `data || patch`, so a shortened document handed
  -- to it removes nothing and the value stays on both sides — measured 2026-09-18. The write
  -- is direct, and every BEFORE trigger on custom.record still runs on it.
  update custom.record r
     set data = v_keep
   where r.organization_id = p_organization_id and r.id = p_record_id;

  -- The NEW side is recorded as having come from the keeper. The keeper's own id is NOT
  -- aliased: `custom.resolve_id` answers with it, because it never stopped being a record.
  insert into custom.record_alias (organization_id, old_id, new_id, verb, reason, migration_id)
  values (p_organization_id, v_new, p_record_id, 'split',
          coalesce(p_note, 'split off from the record that kept the id'), v_log)
  on conflict (organization_id, old_id) do nothing;

  return jsonb_build_object('verb', 'split', 'kept_the_id', p_record_id, 'new_record', v_new,
                            'migration_id', v_log, 'moved', to_jsonb(p_moved_keys),
                            'old_id_resolves_to', custom.resolve_id(p_organization_id, p_record_id),
                            'at', now());
end;
$function$;

CREATE OR REPLACE FUNCTION custom.migrate_undo(p_organization_id uuid, p_log_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_target uuid;
  v_verb   text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_undo');
  if p_log_id is null then
    raise exception 'custom.migrate_undo: which Migration?' using errcode = '22004';
  end if;

  select coalesce(nullif(l.inverse ->> 'record_id', '')::uuid, l.target_id), l.verb
    into v_target, v_verb
    from history.migration_log l
   where l.organization_id = p_organization_id and l.id = p_log_id;
  if v_target is null and v_verb is null then
    raise exception 'There is no Migration % on the record for this organization.', p_log_id
      using errcode = '02000';
  end if;

  -- THE ONE LADDER, on the record the Migration was about. Undoing a merge WRITES — it
  -- restores the loser and revokes its alias — so it asks the same question every other
  -- write in this store asks, at the same level.
  perform custom.assert_client_may_change(p_organization_id, v_target, 'custom.migrate_undo',
                                          'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_undo');

  -- The undo itself is unchanged: `history.migration_undo` writes through the store's own
  -- verbs, and schema `history` stays closed to clients — this door is the reach into it.
  return history.migration_undo(p_organization_id, p_log_id);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.organization_clear(p_organization_id uuid, p_confirm text, p_and_destroy boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me        uuid := custom.query_principal();
  v_boss      boolean := custom.query_is_store_owner();
  v_name      text;
  v_table     uuid;
  v_logs      uuid[] := '{}';
  v_retired   integer := 0;
  v_left      uuid;
  v_floor     integer;
  v_holder    record;
  v_gone      bigint;
  v_destroyed jsonb := '[]'::jsonb;
  v_total     bigint := 0;
  v_purged    bigint := 0;
  v_waiting   bigint := 0;
  v_free_on   timestamptz;
  v_res       jsonb;
  v_out       jsonb;
  -- STORE-TAILS-2: what the (now archiving) purge took on in step two.
  v_archived_now bigint := 0;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.organization_clear');
  -- THE SWITCH. While `custom/system_enabled` resolves false this store belongs to the
  -- campaign that owns it, and nothing outside that campaign empties an organization in it.
  perform custom.assert_store_door(p_organization_id, 'custom.organization_clear');

  if p_organization_id is null then
    raise exception 'custom.organization_clear: which organization?'
      using errcode = '22004',
            hint = 'A null organization would empty the whole store.';
  end if;

  select o.name into v_name from iam.organizations o where o.id = p_organization_id;
  if v_name is null then
    raise exception 'There is no organization % here.', p_organization_id
      using errcode = '02000';
  end if;

  -- OWNER ONLY, the same person iam.organizations.org_delete_policy lets delete it. Being
  -- able to edit this organization's records is not the same permission as emptying it.
  if not v_boss and not (v_me is not null and iam.is_org_owner(p_organization_id, v_me)) then
    raise exception 'Only the owner of % can empty it.', v_name
      using errcode = '42501',
            hint = 'This removes every table and record the organization holds. Ask an owner of this organization to do it, or have an owner transfer ownership to you first. An admin of the organization is not enough.';
  end if;

  -- THE CONFIRMATION, character for character — the same one the Danger Zone asks for, asked
  -- again HERE, so a caller that never drew a dialog cannot empty an organization by accident.
  if p_confirm is distinct from v_name then
    raise exception 'Nothing was removed: the confirmation did not match this organization''s name.'
      using errcode = '22023',
            hint = format('Type the organization''s name exactly — %s — to confirm.', v_name);
  end if;

  v_floor := history.retention_floor_days(p_organization_id);

  -- STEP ONE, ALWAYS RUN: RETIRE, THROUGH THE STORE'S OWN DOOR. custom.migrate_delete takes a
  -- Table's records, saved views, Rules and Fields with it as ONE history.migration_log entry,
  -- and custom.migrate_undo puts the whole set back. Nothing here is hard-deleted.
  for v_table in
    select r.id from custom.record r
     where r.organization_id = p_organization_id
       and r.data_class = 'table'
       and r.deleted_at is null
     order by r.created_at
  loop
    -- A Table may already have gone with an earlier one in this loop (a Table that lives in
    -- another Table's Home). Asking the store again is cheaper than guessing the order.
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = v_table and r.deleted_at is null) then
      v_out := custom.migrate_delete(p_organization_id, v_table,
                 format('retired while emptying organization %s', v_name));
      v_logs := v_logs || (v_out ->> 'migration_id')::uuid;
      v_retired := v_retired + 1;
    end if;
  end loop;

  -- Anything live that no Table owned — a stranded row, this organization's Home — goes the
  -- same way, through the same door, one entry each.
  for v_left in
    select r.id from custom.record r
     where r.organization_id = p_organization_id and r.deleted_at is null
     order by r.created_at
  loop
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = v_left and r.deleted_at is null) then
      v_out := custom.migrate_delete(p_organization_id, v_left,
                 format('retired while emptying organization %s', v_name));
      v_logs := v_logs || (v_out ->> 'migration_id')::uuid;
      v_retired := v_retired + 1;
    end if;
  end loop;

  if not p_and_destroy then
    return jsonb_build_object(
      'function', 'custom.organization_clear',
      'organization_id', p_organization_id, 'name', v_name,
      'destroyed', false,
      'retired_operations', v_retired,
      'migrations', to_jsonb(v_logs),
      'recoverable_until', now() + make_interval(days => v_floor),
      'sentence', format(
        'Everything in %s is retired. Nothing was destroyed — you can put all of it back until %s.',
        v_name, to_char(now() + make_interval(days => v_floor), 'FMDD FMMonth YYYY')),
      'at', now());
  end if;

  -- STEP TWO: ARCHIVE WHATEVER IS SOMEHOW STILL LIVE, AND DESTROY NOTHING. Under the owner's
  -- law of 2026-09-20 `custom.migrate_purge` archives rather than deletes, in resumable
  -- chunks, so this step is now a belt on step one rather than the thing that ends records.
  -- Step one has normally taken everything already, and then this answers "done" and changes
  -- nothing. Destroying records for good is `custom.migrate_purge_hard`, a separate compliance
  -- door with a written reason and a thirty-day window, and no screen reaches it.
  v_res := custom.migrate_purge(p_organization_id, null, false);
  v_purged := 0;
  v_archived_now := coalesce((v_res ->> 'archived')::bigint, 0);
  v_retired := v_retired + v_archived_now::integer;

  -- The rest of what an organization holds in this store is WORK LOG, not records under a
  -- retention window: the outbox, imports, comments, document renders and signatures, the
  -- anonymous lane's tokens and hits, the merge provenance. Asked of the catalog rather than
  -- named, so a foreign key added after this file is written is cleared too; custom.record and
  -- history.migration_log are left to the purge and to the organization's own delete.
  for v_holder in
    select q.s, q.t from (
      select distinct rn.nspname as s, rc.relname as t
        from pg_constraint con
        join pg_class rc on rc.oid = con.conrelid
        join pg_namespace rn on rn.oid = rc.relnamespace
       where con.contype = 'f'
         and con.confrelid = 'iam.organizations'::regclass
         and rn.nspname in ('custom', 'history')
         and rc.relkind in ('r', 'p')
         and rc.relispartition = false
         and rn.nspname || '.' || rc.relname not in ('custom.record', 'history.migration_log')) q
     order by q.s, q.t
  loop
    execute format('delete from %I.%I where organization_id = $1', v_holder.s, v_holder.t)
      using p_organization_id;
    get diagnostics v_gone = row_count;
    if v_gone > 0 then
      v_destroyed := v_destroyed || jsonb_build_object('where', v_holder.s || '.' || v_holder.t, 'rows', v_gone);
      v_total := v_total + v_gone;
    end if;
  end loop;

  -- STEP THREE: SAY WHAT IS LEFT, AND WHEN. A retired record inside its window is not a
  -- failure and it is not a foreign key — it is the undo somebody was promised, and the only
  -- honest answer is the DATE.
  select count(*), min(r.deleted_at + make_interval(days => greatest(history.retention_days(p_organization_id, r.table_id), v_floor)))
    into v_waiting, v_free_on
    from custom.record r
   where r.organization_id = p_organization_id;

  -- THE MIGRATION LOG IS THE UNDO, so it goes LAST and only when there is nothing left to
  -- undo. Sweeping it with the other work logs threw away the very entry this door had just
  -- promised the person, which the green suite caught on its first run.
  if v_waiting = 0 then
    delete from history.migration_log m where m.organization_id = p_organization_id;
    get diagnostics v_gone = row_count;
    if v_gone > 0 then
      v_destroyed := v_destroyed || jsonb_build_object('where', 'history.migration_log', 'rows', v_gone);
      v_total := v_total + v_gone;
    end if;
  end if;

  return jsonb_build_object(
    'function', 'custom.organization_clear',
    'organization_id', p_organization_id, 'name', v_name,
    'destroyed', false,
    'archived', true,
    'retired_operations', v_retired,
    'migrations', to_jsonb(v_logs),
    'rows_destroyed', v_total,
    'destroyed_from', v_destroyed,
    'rows_waiting', v_waiting,
    'removable_on', v_free_on,
    'is_empty', v_waiting = 0,
    'sentence', case
      when v_waiting = 0 then
        format('%s is empty — %s row(s) of working logs were cleared, and the organization can now be deleted.',
               v_name, v_total)
      else
        -- THE HONEST ANSWER, AND IT IS NO LONGER A DATE TO WAIT FOR. Nothing here is destroyed
        -- on a timer any more: the records stay archived and restorable until somebody asks for
        -- a compliance erasure in writing. Saying "removable on <date>" would be a promise this
        -- door no longer keeps.
        format('Everything in %s is archived — %s record(s), all of which can still be brought back. Nothing was destroyed, so the organization still holds them and cannot be removed yet. Destroying them for good is a separate compliance step that needs a written reason and thirty days.',
               v_name, v_waiting)
      end,
    'at', now());
end;
$function$;

CREATE OR REPLACE FUNCTION custom.read_records_in_view_order(p_organization_id uuid, p_view_id uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0, p_filter jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(id uuid, document jsonb, level permission_level, "position" numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
declare
  v_view   record;
  v_table  uuid;
  v_ids    uuid[];
  v_pos    numeric[];
  v_filter jsonb;
  v_sql    text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_in_view_order');

  select * into v_view from platform.saved_view sv
   where sv.id = p_view_id and sv.organization_id = p_organization_id
     and sv.surface_key = 'custom/records' and sv.deleted_at is null;
  if v_view.id is null then
    raise exception 'There is no saved view % here.', p_view_id
      using errcode = '23503',
            hint = 'It may have been removed, or it may belong to another organization — organizations are hard walls (REC-29).';
  end if;
  v_table := coalesce(v_view.subject_id, nullif(v_view.definition ->> 'table_id', '')::uuid);
  perform custom.assert_client_may_open(p_organization_id, v_table, 'custom.read_records_in_view_order');
  if v_view.definition ->> 'order' is distinct from 'manual' then
    raise exception 'This view is ordered by its sort, not by hand.' using errcode = '22023',
      hint = 'Read it with custom.read_records (or read_records_matching). A view takes a hand-set order through custom.view_record_order_set.';
  end if;

  -- ORDER-FILTER: THE LIST DOOR'S QUESTION, THE LIST DOOR'S WAY. A flat map is normalised to the
  -- stored choice keys first (CHOICE-VALUE); a Rule expression is compiled as-is. Both become
  -- one WHERE fragment from the one builder, asked over this reader's columns. Nothing asked
  -- (null, {}) is `true`.
  v_filter := coalesce(p_filter, '{}'::jsonb);
  -- THE ONE PAGE-SIZE DOOR (SUITE-HEALTH-3). The page is custom.page_size's answer: the
  -- organization's page_size_ceiling knob, and a page asked beyond it (or below one row) is
  -- refused with the ceiling in the sentence and in DETAIL, rather than quietly served as 500
  -- rows or 1. Nothing about a hand-set order needs a ceiling of its own.
  v_sql := format($q$
    select array_agg(q.id order by q.n), array_agg(q.pos order by q.n)
      from (select r.id, ($1 ->> r.id::text)::numeric as pos,
                   row_number() over (order by ($1 ->> r.id::text)::numeric nulls last,
                                               r.created_at, r.id) as n
              from custom.record r
             where r.organization_id = %L::uuid
               and r.table_id = %L::uuid
               and r.deleted_at is null
               and r.id in (select v from custom.query_visible_ids(%L::uuid, %L::uuid, 'viewer') v)
               and %s
             order by n
             limit %s offset %s) q
  $q$,
    p_organization_id, v_table, p_organization_id, v_table,
    custom.record_filter_sql(p_organization_id, v_table,
      case when custom.filter_is_rule(v_filter) then v_filter
           else custom.choice_filter_normalize(custom.choice_field_map(p_organization_id, v_table), v_filter) end),
    custom.page_size(p_organization_id, 'custom.read_records_in_view_order', p_limit),
    greatest(coalesce(p_offset, 0), 0));
  execute v_sql into v_ids, v_pos using coalesce(v_view.metadata -> 'record_positions', '{}'::jsonb);

  if v_ids is null then
    return;
  end if;
  return query
    select d.id, d.document, d.level, v_pos[o.n]
      from unnest(v_ids) with ordinality o(rid, n)
      join custom.read_records_by_ids(p_organization_id, v_table, v_ids, coalesce(p_by_id, false)) d on d.id = o.rid
     order by o.n;
end
$function$;

CREATE OR REPLACE FUNCTION custom.read_records_page(p_organization_id uuid, p_table_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_search text DEFAULT NULL::text, p_sort jsonb DEFAULT '[]'::jsonb, p_view_id uuid DEFAULT NULL::uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me        uuid := auth.uid();
  v_level     public.permission_level;
  v_mask      jsonb;
  v_visible   text[];
  v_computed  text[];
  v_choices   jsonb;
  v_limit     integer;
  v_offset    integer := greatest(coalesce(p_offset, 0), 0);
  v_where     text;
  v_order     text := '';
  v_term      text := nullif(btrim(coalesce(p_search, '')), '');
  v_pattern   text;
  v_search    text;
  v_hits      text[];
  v_sort      jsonb;
  v_key       text;
  v_dir       text;
  v_as        text;
  v_expr      text;
  v_labels    jsonb;
  v_view      record;
  v_positions jsonb := null;
  v_total     bigint;
  v_ids       uuid[];
  v_rows      jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  -- THE ORGANIZATION WALL, THEN THE TABLE — the same two questions, in the same order, that
  -- custom.read_records_matching asks on its first lines.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_page');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_page');
  v_limit := custom.page_size(p_organization_id, 'custom.read_records_page', p_limit, 50);

  -- The field question, once: which columns this reader may see (search and sort read ONLY these).
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);
  v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  -- A column worked out on every read keeps no value in the record, so nothing can sort by it.
  select coalesce(array_agg(k.key), '{}'::text[]) into v_computed
    from jsonb_each_text(coalesce(v_mask -> 'all_key_ids', '{}'::jsonb)) k
    join custom.record f on f.id = k.value::uuid
   where f.data ->> 'type' = 'formula'
     and coalesce(f.data ->> 'compute_on', 'read') = 'read';
  v_choices := coalesce(custom.choice_field_map(p_organization_id, p_table_id), '{}'::jsonb);

  -- ── the rows this reader may see that answer the question ──
  v_where := format($w$
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
       and %s$w$,
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    custom.record_filter_sql(p_organization_id, p_table_id,
      case when custom.filter_is_rule(coalesce(p_filter, '{}'::jsonb)) then p_filter
           else custom.choice_filter_normalize(v_choices, coalesce(p_filter, '{}'::jsonb)) end));

  -- ── the search: the older door's ILIKE, over the visible columns and the choice words ──
  if v_term is not null then
    v_pattern := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_search := format(
      $s$exists (select 1 from jsonb_each(r.data) e
                  where e.key = any (%L::text[])
                    and (case jsonb_typeof(e.value) when 'string' then e.value #>> '{}'
                              else e.value::text end) ilike %L)$s$,
      v_visible, v_pattern);
    for v_key in select k from jsonb_object_keys(v_choices) k where k = any (v_visible) loop
      select coalesce(array_agg(o.key), '{}'::text[]) into v_hits
        from jsonb_each(coalesce(v_choices -> v_key -> 'options', '{}'::jsonb)) o
       where coalesce(o.value ->> 'label', '') ilike v_pattern;
      if cardinality(v_hits) > 0 then
        v_search := v_search || format(' or (r.data -> %L) ?| %L::text[]', v_key, v_hits);
      end if;
    end loop;
    v_where := v_where || ' and (' || v_search || ')';
  end if;

  -- ── the order ──
  if p_sort is not null and jsonb_typeof(p_sort) = 'array' and jsonb_array_length(p_sort) > 0 then
    for v_sort in select s from jsonb_array_elements(p_sort) s loop
      v_key := v_sort ->> 'field';
      v_dir := case when lower(coalesce(v_sort ->> 'direction', 'asc')) = 'desc' then 'desc' else 'asc' end;
      v_as  := lower(coalesce(v_sort ->> 'as', 'text'));
      if v_key is null or not (v_key = any (v_visible)) then
        raise exception 'This table has no column called "%" that you can see, so it cannot be sorted by it.', coalesce(v_key, '')
          using errcode = '22023',
                hint = 'Sort by one of the columns the table shows you. Nothing was read.';
      end if;
      if v_key = any (v_computed) then
        raise exception 'The column "%" is worked out each time it is read, so the store keeps no value to sort the whole table by.', v_key
          using errcode = '0A000',
                hint = 'Sort by one of the columns it is worked out from, or have the column worked out when a record is saved (compute_on: write) so its value is kept. Nothing was read.';
      end if;
      if v_choices ? v_key then
        select coalesce(jsonb_object_agg(o.key, o.value ->> 'label'), '{}'::jsonb) into v_labels
          from jsonb_each(coalesce(v_choices -> v_key -> 'options', '{}'::jsonb)) o;
        v_expr := format('lower(coalesce(%L::jsonb ->> (r.data ->> %L), r.data ->> %L))', v_labels, v_key, v_key);
      elsif v_as in ('number', 'integer') then
        v_expr := format($x$case when (r.data ->> %L) ~ '^-?[0-9]+\.?[0-9]*$' then (r.data ->> %L)::numeric end$x$, v_key, v_key);
      elsif v_as in ('date', 'datetime') then
        -- An ISO date or instant sorts as its own text; anything else is not a date and sorts last.
        v_expr := format($x$case when (r.data ->> %L) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (r.data ->> %L) end$x$, v_key, v_key);
      else
        v_expr := format('lower(r.data ->> %L)', v_key);
      end if;
      v_order := v_order || v_expr || ' ' || v_dir || ' nulls last, ';
    end loop;
    v_order := v_order || 'r.id';
  elsif p_view_id is not null then
    select sv.* into v_view from platform.saved_view sv
     where sv.id = p_view_id and sv.organization_id = p_organization_id
       and sv.surface_key = 'custom/records' and sv.deleted_at is null
       and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id;
    if v_view.id is null then
      raise exception 'There is no saved view % on this table.', p_view_id
        using errcode = '23503',
              hint = 'It may have been removed, or it may belong to another table or organization. Nothing was read.';
    end if;
    if v_view.definition ->> 'order' is distinct from 'manual' then
      raise exception 'This view is ordered by its sort, not by hand.' using errcode = '22023',
        hint = 'Ask for its sort in p_sort instead of naming the view. Nothing was read.';
    end if;
    v_positions := coalesce(v_view.metadata -> 'record_positions', '{}'::jsonb);
    v_order := '($1 ->> r.id::text)::numeric nulls last, r.created_at, r.id';
  else
    -- No question about order: the read door's own order.
    v_order := 'r.created_at desc, r.id';
  end if;

  execute 'select count(*) ' || v_where into v_total;

  execute format('select array_agg(q.id order by q.n) from (select r.id, row_number() over (order by %s) as n %s order by n limit %s offset %s) q',
                 v_order, v_where, v_limit, v_offset)
     into v_ids
    using v_positions;

  if v_ids is null then
    v_rows := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'document', d.document, 'level', d.level) order by o.n), '[]'::jsonb)
      into v_rows
      from unnest(v_ids) with ordinality o(rid, n)
      join custom.read_records_by_ids(p_organization_id, p_table_id, v_ids, coalesce(p_by_id, false)) d on d.id = o.rid;
  end if;

  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.record_delete(p_organization_id uuid, p_record_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_at    timestamptz;
  v_plan  jsonb;
  v_child uuid;
  v_first boolean;
  v_depth integer;
  v_prev  text;
  -- STORE-TAILS-3: THE ARCHIVE EVENT this call belongs to, and what it took.
  v_event     uuid;
  v_own_event boolean := false;
  v_took      uuid[];
  v_class     text;
begin
  -- THE SWITCH. Every line below is behind custom/system_enabled: custom.assert_store_door
  -- resolves that knob and, while it is false, this store takes writes only from the role that
  -- owns custom.record. The switch never removes a check; it closes the door.
  perform custom.assert_store_door(p_organization_id, 'custom.record_delete');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_delete');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_delete: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  -- HOW DEEP THIS HAS GONE. A cascade that nests past 64 is a cycle somebody built, and
  -- saying so beats recursing until the server runs out of stack.
  v_depth := coalesce(nullif(current_setting('custom.delete_depth', true), '')::integer, 0);
  if v_depth > 64 then
    raise exception 'this delete reaches through more than 64 levels of containment, which is a loop rather than a hierarchy'
      using errcode = '54001',
            hint = 'REC-12: something contains one of its own containers. Break that link and delete again.';
  end if;

  -- STORE-TAILS-3: THE TOP OF ONE ARCHIVE. Everything this call and its cascade take is written
  -- down, in order, so the restore can bring back exactly this set. A Table's archive opens its
  -- event HERE, before the first row moves, so every History version this statement writes
  -- carries the event's id; `custom.table_archive` opens one for all of its chunks and says so
  -- in `custom.archive_event`.
  if v_depth = 0 then
    perform set_config('custom.archive_took', '', true);
    v_event := nullif(current_setting('custom.archive_event', true), '')::uuid;
    select r.data_class into v_class
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
    if v_event is null
       and exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = p_record_id
                      and r.table_id = custom.table_kernel_id() and r.data_class <> 'kernel'
                      and r.deleted_at is null) then
      v_event := history.migration_record(p_organization_id, 'archive', 'table', p_record_id,
                   jsonb_build_object('kind', 'restore', 'record_id', p_record_id::text,
                                      'also', '[]'::jsonb, 'took', '[]'::jsonb, 'open', true),
                   'STORE-TAILS-3: a table archived as one unit — its fields, saved views, rules and records with it; restoring the table brings back exactly this set.');
      v_own_event := true;
    end if;
  end if;
  perform set_config('custom.delete_depth', (v_depth + 1)::text, true);

  -- THE RULE, BEFORE ANYTHING IS WRITTEN. It raises the refusals by name (a Field a formula
  -- reads, a Home its Tables live in, a Table whose fields something outside still reads, a
  -- relation set to refuse), detaches the set_null edges, and hands back everything this
  -- delete has to take with it.
  v_plan  := custom.delete_rule(p_organization_id, p_record_id, true);
  v_first := coalesce((v_plan ->> 'contents_first')::boolean, false);

  -- A TABLE FIRST TAKES WHAT IS IN IT. Its records, its saved views, its Rules and then its
  -- Fields all go while the Table is still there, so every guard on custom.record still has
  -- the Table and the Fields it validates against in front of it. Nothing is switched off.
  if v_first then
    -- THE WHOLE SET, SAID OUT LOUD BEFORE THE FIRST ROW GOES. REC-18 refuses a Field something
    -- still reads; inside this table, what reads it is going too, so it is not something that
    -- still reads it. Transaction-local, and put back exactly as it was afterwards.
    v_prev := coalesce(current_setting('custom.delete_set', true), '');
    perform set_config('custom.delete_set',
      v_prev || ',' || p_record_id::text || ',' ||
      coalesce((select string_agg(x #>> '{}', ',')
                  from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x), ''),
      true);
    for v_child in select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x loop
      if v_child <> p_record_id
         and exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_child);
      end if;
    end loop;
    perform set_config('custom.delete_set', v_prev, true);
  end if;

  update custom.record
     set deleted_at = now()
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
  returning deleted_at into v_at;

  if v_at is null then
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was already deleted, so nothing changed.'
        using errcode = '02000',
              hint = 'REC-23: it is still here and still reversible - custom.record_restore(organization, record) brings it back.';
    end if;
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was deleted. The store is keyed (organization_id, id), so a record of another organization is not found by this one.';
  end if;

  -- STORE-TAILS-3: this row is part of what this archive took, in the order it went.
  perform set_config('custom.archive_took',
                     coalesce(current_setting('custom.archive_took', true), '') || p_record_id::text || ',',
                     true);

  -- THE CASCADE GOES THROUGH THIS SAME DOOR — so every record it takes is judged by the
  -- caller's own access, gets its own history capture, and applies its own rule in turn. The
  -- container is marked deleted first, which is also what stops a containment loop here.
  if not v_first then
    for v_child in select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x loop
      if exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_child);
      end if;
    end loop;
  end if;

  perform set_config('custom.delete_depth', v_depth::text, true);

  -- STORE-TAILS-3: THE BOTTOM OF ONE ARCHIVE. Write down what it took. A single row that took
  -- nothing with it needs no event (bringing it back was always exact); anything more — a table,
  -- a record that took what it contained, a row archived inside a table's chunked archive —
  -- is written to its event, each row with the exact moment it was archived.
  if v_depth = 0 then
    v_took := coalesce(string_to_array(rtrim(coalesce(current_setting('custom.archive_took', true), ''), ','), ',')::uuid[],
                       '{}'::uuid[]);
    perform set_config('custom.archive_took', '', true);
    if v_event is null and cardinality(v_took) > 1 then
      v_event := history.migration_record(p_organization_id, 'archive', coalesce(v_class, 'record'), p_record_id,
                   jsonb_build_object('kind', 'restore', 'record_id', p_record_id::text,
                                      'also', '[]'::jsonb, 'took', '[]'::jsonb, 'open', true),
                   format('STORE-TAILS-3: archived with %s row(s) it contained or cascaded to; restoring it brings back exactly this set.',
                          cardinality(v_took) - 1));
      v_own_event := true;
    end if;
    if v_event is not null and cardinality(v_took) > 0 then
      update history.migration_log m
         set inverse = m.inverse || jsonb_build_object(
               'also', coalesce(m.inverse -> 'also', '[]'::jsonb)
                       || coalesce((select jsonb_agg(t.x::text order by t.o)
                                      from unnest(v_took) with ordinality as t(x, o)
                                     where t.x::text is distinct from m.inverse ->> 'record_id'), '[]'::jsonb),
               'took', coalesce(m.inverse -> 'took', '[]'::jsonb)
                       || (select jsonb_agg(jsonb_build_array(t.x::text, v_at) order by t.o)
                             from unnest(v_took) with ordinality as t(x, o)),
               'open', case when v_own_event then 'false'::jsonb else coalesce(m.inverse -> 'open', 'true'::jsonb) end,
               'archived_at', case when v_own_event then to_jsonb(v_at) else m.inverse -> 'archived_at' end)
       where m.organization_id = p_organization_id and m.id = v_event;
    end if;
  end if;
  return v_at;
end
$function$;

CREATE OR REPLACE FUNCTION custom.record_restore(p_organization_id uuid, p_record_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_rows  bigint;
  e       history.migration_log;       -- STORE-TAILS-3: the archive event this restore undoes
  m       record;
  v_back  integer := 0;
  v_left  integer := 0;
  v_wait  uuid[] := '{}';              -- structure rows whose guard wants another row back first
  v_again uuid[];
  v_round integer := 0;
  v_why   text;
  v_whose text;
  v_root_at timestamptz;               -- the moment the root was archived
  v_back_ids uuid[] := '{}';           -- every row this restore brought back (root included)
  v_back_at  timestamptz[] := '{}';    -- ... and the moment each had been archived
  a        record;
  v_joined integer := 0;
  v_kept   integer := 0;
  v_recon  boolean := false;           -- an event reconstructed for an archive made before events existed
  v_refused integer := 0;
  v_refused_why text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_restore');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_restore');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_restore: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  -- STORE-TAILS-3: WHAT THIS ARCHIVE TOOK WITH IT, read before the row moves (the event names
  -- the row by the `deleted_at` it carries now).
  e := custom.archive_event_of(p_organization_id, p_record_id);
  if e.id is not null
     and coalesce(nullif(current_setting('history.mark_at', true), ''), '') <> statement_timestamp()::text then
    -- The History versions this restore writes read "undo of archive" and carry the event's id.
    perform set_config('history.mark_at',   statement_timestamp()::text, true);
    perform set_config('history.mark_id',   e.id::text,                  true);
    perform set_config('history.mark_verb', 'undo of archive',           true);
  end if;

  select r.deleted_at into v_root_at
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  update custom.record
     set deleted_at = null
   where organization_id = p_organization_id and id = p_record_id and deleted_at is not null;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was not deleted, so there was nothing to bring back.'
        using errcode = '02000', hint = 'REC-23: it is already here.';
    end if;
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000',
            hint = 'REC-23: a record is reversible while its table still keeps its history, and this one is not in this organization at all.';
  end if;

  v_back_ids := array[p_record_id];
  v_back_at  := array[v_root_at];
  v_recon := coalesce((e.inverse ->> 'reconstructed')::boolean, false);

  if e.id is not null then
  -- EVERYTHING THE ARCHIVE TOOK, EXACTLY. Structure first — tables, then fields, then rules,
  -- then saved views — so every guard on a returning record has its table and its columns in
  -- front of it; then the records in the order they went (a container before what it
  -- contained). A row that is no longer archived at the moment this event archived it was
  -- brought back, or archived again, on its own since: it is not this event's, and it is left.
  --
  -- A column can depend on another column of the same set (a rollup reads through a relation
  -- column; a formula reads another formula), and the order the archive took them in says
  -- nothing about that. So a structure row whose own guard refuses it NOW is asked again after
  -- the rest of the structure is back, round by round, until a round brings nothing more back;
  -- one still refused then is refused by name, and nothing of this restore is kept.
  for m in
    select t.id, t.at, r.deleted_at as now_at,
           case when r.table_id = custom.table_kernel_id() then 1
                when r.table_id = custom.field_kernel_id() then 2
                when r.table_id = custom.rule_kernel_id() then 3
                when r.data ? 'layout' then 4
                else 5 end as pass,
           t.o
      from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at, o
              from jsonb_array_elements(coalesce(e.inverse -> 'took', '[]'::jsonb)) with ordinality as j(x, o)) t
      join custom.record r
        on r.organization_id = p_organization_id and r.id = t.id
     where t.id <> p_record_id
     order by pass, t.o
  loop
    -- The structure is not all back yet: the records wait for it (below).
    exit when m.pass = 5 and cardinality(v_wait) > 0;
    if m.now_at is null or m.now_at <> m.at then
      v_left := v_left + 1;
      continue;
    end if;
    perform custom.assert_client_may_change(p_organization_id, m.id, 'custom.record_restore');
    if m.pass < 5 then
      begin
        update custom.record
           set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
        v_back := v_back + 1;
        v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
      exception when check_violation or foreign_key_violation or raise_exception
                  or invalid_parameter_value or not_null_violation then
        v_wait := v_wait || m.id;
      end;
    else
      -- The structure is all back by now, so a record that is refused is refused for itself.
      -- A RECONSTRUCTED event (an archive made before events existed, rebuilt by a rule) names
      -- records by inference, so one of them refused on its own (a unique value that another
      -- record now holds) is left archived and counted, not a reason to bring back nothing.
      if v_recon then
        begin
          update custom.record
             set deleted_at = null
           where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
          v_back := v_back + 1;
          v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
        exception when check_violation or unique_violation or foreign_key_violation or raise_exception
                    or invalid_parameter_value or not_null_violation then
          get stacked diagnostics v_refused_why = message_text;
          v_refused := v_refused + 1;
        end;
      else
        update custom.record
           set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
        v_back := v_back + 1;
        v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
      end if;
    end if;
  end loop;

  while cardinality(v_wait) > 0 loop
    v_round := v_round + 1;
    v_again := '{}';
    v_why := null;
    for m in select t.id, t.at
               from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at, o
                       from jsonb_array_elements(e.inverse -> 'took') with ordinality as j(x, o)) t
              where t.id = any (v_wait)
              order by t.o loop
      begin
        update custom.record
           set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
        v_back := v_back + 1;
        v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
      exception when check_violation or foreign_key_violation or raise_exception
                  or invalid_parameter_value or not_null_violation then
        get stacked diagnostics v_why = message_text;
        v_again := v_again || m.id;
      end;
    end loop;
    if cardinality(v_again) = cardinality(v_wait) then
      select coalesce(nullif(r.data ->> 'label', ''), nullif(r.data ->> 'name', ''), r.data ->> 'key', r.id::text)
        into v_whose
        from custom.record r where r.organization_id = p_organization_id and r.id = v_wait[1];
      raise exception 'This could not be brought back as it was archived: "%" is refused on its own (%), so nothing was brought back.', v_whose, v_why
        using errcode = '23514',
              hint = 'STORE-TAILS-3: a restore brings back the whole of what its archive took, or none of it. Change what the refusal names (it changed after the archive), then bring it back again.';
    end if;
    v_wait := v_again;
    if cardinality(v_wait) = 0 then
      -- The structure is complete: now the records, in the order they went.
      for m in
        select t.id, t.at, r.deleted_at as now_at
          from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at, o
                  from jsonb_array_elements(e.inverse -> 'took') with ordinality as j(x, o)) t
          join custom.record r on r.organization_id = p_organization_id and r.id = t.id
         where t.id <> p_record_id
           and r.table_id is distinct from custom.table_kernel_id()
           and r.table_id is distinct from custom.field_kernel_id()
           and r.table_id is distinct from custom.rule_kernel_id()
           and not (r.data ? 'layout')
         order by t.o
      loop
        if m.now_at is not null and m.now_at = m.at then
          perform custom.assert_client_may_change(p_organization_id, m.id, 'custom.record_restore');
          -- A RECONSTRUCTED event (an archive made before events existed, rebuilt by a rule) names
          -- records by inference, so one of them refused on its own (a unique value that another
          -- record now holds) is left archived and counted, not a reason to bring back nothing.
          if v_recon then
            begin
              update custom.record
                 set deleted_at = null
               where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
              v_back := v_back + 1;
              v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
            exception when check_violation or unique_violation or foreign_key_violation or raise_exception
                        or invalid_parameter_value or not_null_violation then
              get stacked diagnostics v_refused_why = message_text;
              v_refused := v_refused + 1;
            end;
          else
            update custom.record
               set deleted_at = null
             where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
            v_back := v_back + 1;
            v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
          end if;
        else
          v_left := v_left + 1;
        end if;
      end loop;
    end if;
  end loop;

  end if;

  -- THE POINTERS THE ARCHIVE TOOK OUT OF OTHER RECORDS GO BACK IN. A relation set to "clear it"
  -- (`set_null`, `platform.relation_on_delete`) took this row's id out of every live record that
  -- pointed at it and tombstoned that edge in the same transaction — the tombstone (`deleted_at`
  -- = the moment this row was archived, no `deleted_via`, a relation field) is the record of it.
  -- For every row this restore brought back, each such pointer is written back into the record
  -- that held it, if that record is still here, the relation column still exists, and the
  -- pointer's place is still free (a single-value relation that now points somewhere else was
  -- changed on purpose since, and is left). The relation's own triggers put the edge back.
  for a in
    select x.id as edge_id, x.source_id, x.role, x.target_id
      from unnest(v_back_ids, v_back_at) as b(id, at)
      join platform.associations x
        on x.organization_id = p_organization_id
       and x.target_type = 'record' and x.target_id = b.id
       and x.source_type = 'record'
       and x.relation_field_id is not null
       and x.deleted_at = b.at
       and x.deleted_via_type is null
     order by x.created_at
  loop
    if exists (select 1 from custom.record s
                where s.organization_id = p_organization_id and s.id = a.source_id and s.deleted_at is null)
       and platform.relation_edge_has_a_live_field(p_organization_id,
             (select x.relation_field_id from platform.associations x where x.id = a.edge_id)) then
      update custom.record s
         set data = case
               when jsonb_typeof(s.data -> a.role) = 'array' then
                 case when s.data -> a.role @> to_jsonb(array[a.target_id::text]) then s.data
                      else jsonb_set(s.data, array[a.role], (s.data -> a.role) || to_jsonb(a.target_id::text)) end
               when jsonb_typeof(s.data -> a.role) = 'string' then s.data
               else jsonb_set(s.data, array[a.role],
                              case when coalesce((select (f.data ->> 'multi')::boolean
                                                    from custom.record f
                                                   where f.organization_id = p_organization_id
                                                     and f.id = (select x.relation_field_id from platform.associations x where x.id = a.edge_id)), false)
                                   then jsonb_build_array(a.target_id::text)
                                   else to_jsonb(a.target_id::text) end)
             end
       where s.organization_id = p_organization_id and s.id = a.source_id
         and jsonb_typeof(s.data -> a.role) is distinct from 'string';
      if found then v_joined := v_joined + 1; else v_kept := v_kept + 1; end if;
    else
      v_kept := v_kept + 1;
    end if;
  end loop;

  if e.id is null then
    if v_joined > 0 or v_kept > 0 then
      raise notice 'Linked back: % record(s) that pointed at it%.', v_joined,
        case when v_kept > 0 then format('; %s had changed since and were left as they are', v_kept) else '' end;
    end if;
    return;
  end if;

  update history.migration_log l
     set undone_at = now(),
         undone_by = coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid()))
   where l.organization_id = p_organization_id and l.id = e.id;

  raise notice '%', format('Brought back with it: %s row(s) this archive took%s%s; %s record(s) that pointed at them linked back%s.',
    v_back,
    case when v_left > 0
         then format('; %s it also took had already come back or been archived again on their own since, and were left as they are', v_left)
         else '' end,
    case when v_refused > 0
         then format('; %s record(s) this reconstructed archive named were refused on their own and left archived (the last said: %s)', v_refused, v_refused_why)
         else '' end,
    v_joined,
    case when v_kept > 0 then format(' (%s had changed since and were left)', v_kept) else '' end);
end
$function$;

CREATE OR REPLACE FUNCTION custom.record_table(p_organization_id uuid, p_record_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid;
  v_table  uuid;
begin
  -- THE SWITCH, THEN THE WALL, THEN THE ROW — the store's one order. The wall first, so
  -- somebody in the wrong organization is told that, and not that they may not read a record.
  perform custom.assert_store_door(p_organization_id, 'custom.record_table');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_table');

  -- DELETED ROWS COUNT. A record in the trash still lives in a table, and the question
  -- "should this be put back" is asked about that table.
  --
  -- `found` AND NOT AN INTO-TARGET: a SELECT that finds nothing sets every into-target to NULL,
  -- so a `v_found boolean := false` that the SELECT also targets is NULL here, and `if not null`
  -- never fires. `found` is set by the statement and cannot be overwritten by it.
  select r.table_id into v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  if not found then
    raise exception 'There is no record % in this organization, here or in the trash.', p_record_id
      using errcode = '02000',
            hint = 'The id belongs to another organization or to nothing at all — organizations are hard walls (REC-29).';
  end if;

  -- THE ONE LADDER, AT VIEWER ON THE RECORD, IN THIS DOOR'S OWN BODY (MIRROR-PERF, 2026-09-20).
  -- Naming the Table a record lives in is reading that record, so it is the reading rung. The
  -- two ways through are the store's standing two: the role that owns the store (every campaign
  -- and server lane), and no signed-in person at all (the anonymous doors, which have already
  -- decided the request against the form's own token).
  if not custom.query_is_store_owner() then
    v_me := custom.query_principal();
    if v_me is not null
       and not custom.has_visibility(v_me, 'record', p_record_id, 'viewer'::public.permission_level)
    then
      raise exception 'You do not have access to this record, so custom.record_table has nothing to show you.'
        using errcode = '42501',
              hint = 'DOOR-1 decides reading and writing with the SAME question: a record you may not open is a record you may not change. This needs the viewer level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization.';
    end if;
  end if;

  return v_table;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.record_update(p_organization_id uuid, p_record_id uuid, p_patch jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_new       integer;
  v_current   integer;
  v_contested jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_update');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_update');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_update: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'custom.record_update: the patch must be an object of field key -> value, and it is a %', coalesce(jsonb_typeof(p_patch), 'nothing')
      using errcode = '22023';
  end if;

  -- THE ENVELOPE KEY COMES OFF BEFORE THE MERGE. `data || p_patch` would otherwise write it
  -- straight into the record, where it would then be a column nobody declared, forever.
  p_patch := custom._take_op_id(p_patch, 'custom.record_update');
  if p_patch = '{}'::jsonb then
    raise exception 'custom.record_update: the patch is empty once the platform envelope keys are taken off it, so there is nothing to write.'
      using errcode = '22023',
            hint = 'Nothing was written. Send at least one field key -> value beside _op_id.';
  end if;

  -- THE OPT-IN POSTURE, KEPT. A write that declares no base revision behaves exactly as a
  -- direct UPDATE always has: last-write-wins.
  if p_expected_version is null then
    update custom.record
       set data = data || p_patch
     where organization_id = p_organization_id and id = p_record_id and deleted_at is null
    returning version into v_new;
    if v_new is null then
      raise exception 'There is no record % in this organization any more.', p_record_id
        using errcode = '02000',
              hint = 'It was deleted, or it never existed here. The store is keyed (organization_id, id), so a record from another organization is not found by this one.';
    end if;
    perform custom.assert_columns_are_defined(p_organization_id, p_record_id, p_patch);
    return v_new;
  end if;

  -- THE COMPARE-AND-SWAP.
  update custom.record
     set data = data || p_patch
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
     and version = p_expected_version
  returning version into v_new;
  if v_new is not null then
    perform custom.assert_columns_are_defined(p_organization_id, p_record_id, p_patch);
    return v_new;
  end if;

  select r.version into v_current
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_current is null then
    raise exception 'There is no record % in this organization any more - somebody deleted it while you were working on it.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was written. The record is gone, so there is nothing to merge into: keep your work somewhere else, or write it as a new record.';
  end if;

  select jsonb_object_agg(k.key, r.data -> k.key) into v_contested
    from custom.record r, lateral jsonb_object_keys(p_patch) k(key)
   where r.organization_id = p_organization_id and r.id = p_record_id;

  raise exception 'Someone else changed this record while you were working on it. You wrote against version %, and version % is the one that won.',
                  p_expected_version, v_current
    using errcode = 'PT409',
          detail = jsonb_build_object('expected_version', p_expected_version,
                                      'current_version',  v_current,
                                      'contested_fields', coalesce(v_contested, '{}'::jsonb))::text,
          hint = format('Nothing was overwritten and nothing was lost - their work is still there and yours is still in your hands. Look at what changed (it is in this error, field by field), decide keep-mine, keep-theirs or merged, and write it again against version %s. Resolution is just another write.', v_current);
end
$function$;

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
    if v_state = 'PGRST' then
      -- ERRORS-HONEST: a not-found raised by platform.refuse_not_found inside a PostgREST request
      -- arrives here in PostgREST's own shape (the message is the JSON error body). Re-raising it
      -- under errcode PGRST with a plain sentence would be an unreadable fault, so it is unwrapped,
      -- the member of the graph that refused is named in front of it exactly as below, and it is
      -- raised again the one way a not-found is raised.
      perform platform.refuse_not_found(
        format('custom.record_write_graph refused the WHOLE graph on %s: %s', v_where, platform.refusal_message(v_state, v_msg)),
        coalesce(nullif((v_msg::jsonb) ->> 'hint', '') || ' ', '')
          || 'NOTHING WAS WRITTEN — not the parent, not one edge and not one child. A graph is all of it or none of it, which is the only reason this door exists.',
        coalesce(nullif((v_msg::jsonb) ->> 'details', ''), format('%s children and %s edges were in flight under parent %s.',
                                                                  jsonb_array_length(coalesce(p_children, '[]'::jsonb)),
                                                                  jsonb_array_length(coalesce(p_edges, '[]'::jsonb)),
                                                                  v_parent_id)));
    end if;
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

CREATE OR REPLACE FUNCTION custom.relation_halves_repair(p_organization_id uuid, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rows      jsonb;
  v_keys      text[];
  v_key       text;
  v_before    jsonb;
  v_targets   jsonb;
  v_multi     boolean;
  v_withdrawn int := 0;
  v_set       int := 0;
  v_unrepair  text;
  v_note      text;
  v_log       uuid;
begin
  if not custom.query_is_store_owner() then
    raise exception 'Repairing a relation whose two halves disagree is the store''s own work, not a caller''s.'
      using errcode = '42501',
            hint = 'This door rewrites a record a person may never have been shown, to undo a '
                || 'writer''s defect. It answers only to the role that owns custom.record. A '
                || 'person changes their own links through platform.relation_set and '
                || 'platform.relation_unset, which have written both halves since 2026-09-22.';
  end if;
  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.relation_halves_repair: which record, in which organization?'
      using errcode = '22004';
  end if;

  -- THE CENSUS IS THE INPUT. There is no second opinion about what is wrong with this record:
  -- the door repairs exactly what custom.relation_halves_disagreements names, or nothing.
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
    into v_rows
    from custom.relation_halves_disagreements(p_organization_id, p_record_id) d;

  if jsonb_array_length(v_rows) = 0 then
    return jsonb_build_object('record_id', p_record_id, 'repaired', 0,
                              'detail', 'the two halves of every relation on this record already agree');
  end if;

  -- A HALF THIS DOOR CANNOT PUT RIGHT STOPS THE WHOLE REPAIR AND SAYS WHICH ONE. A repair that
  -- fixed four halves and shrugged at the fifth would leave the record still unsavable and the
  -- census still red, with a green-looking report in front of it.
  select string_agg(format('%s → %s (%s)', x.field_key, x.target_id, x.why), '; ')
    into v_unrepair
    from jsonb_to_recordset(v_rows) as x(field_key text, target_id uuid, remedy text, why text)
   where x.remedy not in ('write_the_edge', 'write_the_value', 'withdraw_the_value');
  if v_unrepair is not null then
    raise exception 'This record has a relation half no door here can put right: %', v_unrepair
      using errcode = '23514';
  end if;

  select array_agg(distinct x.field_key)
    into v_keys
    from jsonb_to_recordset(v_rows) as x(field_key text);

  -- THE INVERSE, WORKED OUT BEFORE THE FIRST WRITE (HIS-8). Every key this repair is about to
  -- touch, exactly as the document holds it now — so history.migration_undo can put the
  -- document back, including the one value this repair withdraws.
  select coalesce(jsonb_object_agg(k, coalesce(r.data -> k, 'null'::jsonb)), '{}'::jsonb)
    into v_before
    from custom.record r, unnest(v_keys) as k
   where r.organization_id = p_organization_id and r.id = p_record_id
   group by r.id;
  if v_before is null then
    raise exception 'custom.relation_halves_repair: record % is not in organization %.',
                    p_record_id, p_organization_id
      using errcode = '02000';
  end if;

  select format('STORE-TXN-4: %s relation half(s) that disagreed were reconciled on this record — %s.',
                jsonb_array_length(v_rows),
                string_agg(format('%s %s → %s', x.remedy, x.field_key, x.target_id), ', '))
    into v_note
    from jsonb_to_recordset(v_rows) as x(field_key text, target_id uuid, remedy text);

  -- ONE HISTORY LINE PER REPAIR, and it MARKS the row versions this call goes on to write, so
  -- they reach history as `relation_halves_repair` and not as `UPDATE`.
  v_log := history.migration_record(
             p_organization_id, 'relation_halves_repair', 'record', p_record_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_record_id, 'values', v_before),
             v_note);

  foreach v_key in array v_keys loop
    -- ── WITHDRAW FIRST. A value the store refuses cannot survive the relation_set below (the
    --    door validates the WHOLE cell), so it leaves before anything else on this key moves.
    perform platform.relation_unset(p_organization_id, p_record_id, v_key, x.target_id)
       from jsonb_to_recordset(v_rows) as x(field_key text, target_id uuid, remedy text)
      where x.field_key = v_key and x.remedy = 'withdraw_the_value';

    select v_withdrawn + count(*)::int into v_withdrawn
      from jsonb_to_recordset(v_rows) as x(field_key text, remedy text)
     where x.field_key = v_key and x.remedy = 'withdraw_the_value';

    -- ── THEN THE UNION. Every target this key holds after the withdrawals — the ids still in
    --    the document AND the ids that live associations index — handed to the one link door,
    --    which writes both halves and is additive on a many-valued field.
    select coalesce(jsonb_agg(distinct t.target_id::text), '[]'::jsonb)
      into v_targets
      from (
        select e.target_id
          from custom.record r
          cross join lateral custom.record_relation_edges(r.organization_id, r.id, r.table_id,
                                                          r.data_class, r.data, r.deleted_at) e
         where r.organization_id = p_organization_id and r.id = p_record_id
           and e.edge_role = v_key
        union
        select a.target_id
          from platform.associations a
         where a.organization_id = p_organization_id
           and a.source_type = 'record' and a.source_id = p_record_id
           and a.target_type = 'record' and a.role = v_key
           and a.relation_field_id is not null and a.deleted_at is null
      ) t
     where not exists (select 1 from jsonb_to_recordset(v_rows) as x(field_key text, target_id uuid, remedy text)
                        where x.field_key = v_key and x.remedy = 'withdraw_the_value'
                          and x.target_id = t.target_id);

    if jsonb_array_length(v_targets) > 0 then
      -- REL-7: a single-valued relation that ends up with two targets is a CONFLICT, not a
      -- repair. Picking one would invent a fact; this door refuses and names both.
      select coalesce((f.data ->> 'multi')::boolean, false)
               or coalesce((f.data ->> 'relation_max')::integer, 1) > 1
        into v_multi
        from custom.record f
       where f.deleted_at is null
         and f.table_id = custom.field_kernel_id()
         and (f.organization_id = p_organization_id or f.data_class = 'kernel')
         and nullif(f.data ->> 'entity_definition_id', '')::uuid =
             (select r.table_id from custom.record r
               where r.organization_id = p_organization_id and r.id = p_record_id)
         and coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name') = v_key
       limit 1;

      if not coalesce(v_multi, false) and jsonb_array_length(v_targets) > 1 then
        raise exception
          'The relation "%" holds one value, and its two halves disagree about WHICH: the document '
          'and the index between them name %. Nothing was repaired on this record.',
          v_key, v_targets
          using errcode = '23514',
                hint = 'REL-7: a repair may add a half that is missing; it may not choose between '
                    || 'two facts. Decide which target is right on the record''s own screen, and '
                    || 'run this door again.';
      end if;

      v_set := v_set + platform.relation_set(p_organization_id, p_record_id, v_key, v_targets);
    end if;
  end loop;

  return jsonb_build_object(
    'record_id',     p_record_id,
    'repaired',      jsonb_array_length(v_rows),
    'withdrawn',     v_withdrawn,
    'edges_written', v_set,
    'migration_log', v_log,
    'halves',        v_rows);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.relation_own(p_organization_id uuid, p_owner_id uuid, p_target_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id     uuid;
  v_parent uuid;
  v_name   text;
  v_found  boolean := false;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_own');
  perform custom.assert_client_may_change(p_organization_id, p_target_id, 'custom.relation_own', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.relation_own');
  if p_organization_id is null or p_owner_id is null or p_target_id is null then
    raise exception 'custom.relation_own: the organization, the owner and the target are all required'
      using errcode = '22004';
  end if;

  -- REC-7, BEFORE ANYTHING IS WRITTEN. A record has zero or one parent, never two — so a
  -- second call with a different owner is a REQUEST FOR A SECOND PARENT, and the only two
  -- honest answers are "refused" and "that is a move, ask for a move". It used to be neither:
  -- the old parent was overwritten in silence.
  -- ARGS-RULED (2026-09-21). THE PARENT IS A RECORD YOU MAY OPEN, IN THIS ORGANIZATION.
  -- `parent_id` is a CARRYING edge: `custom.visibility_ancestors` walks it and
  -- `custom.reaches_directly` arm 3 says an ancestor conveys its level to what is inside it. So
  -- this argument decides WHO ELSE can reach the record being moved — and it was never asked
  -- about. A caller could put their record inside a container they cannot see (handing it to
  -- whoever holds that container, and adding a row to a list its owner never added to), or name
  -- an id in another organization entirely and leave a pointer to nothing.
  -- `viewer` and not `editor`: filing something into a container is not changing the container,
  -- and the store already decides changing it separately.
  perform custom.assert_client_may_open(p_organization_id, p_owner_id, 'custom.relation_own',
                                        'viewer'::public.permission_level, 'record');

  select true, custom.containment_parent(r.data)
    into v_found, v_parent
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_target_id and r.deleted_at is null;
  if not coalesce(v_found, false) then
    raise exception 'that record is not in this organization'
      using errcode = '23503';
  end if;

  if v_parent is not null and v_parent = p_owner_id then
    raise exception 'That record is already inside this one.'
      using errcode = '23505',
            hint = 'REC-7: a record is inside one record, once. Nothing was written and nothing moved.';
  end if;

  if v_parent is not null then
    v_name := custom.record_words(p_organization_id, v_parent);
    raise exception 'That record is already inside "%", and a record is inside one record at a time — so nothing was moved.',
      coalesce(v_name, v_parent::text)
      using errcode = '23514',
            hint = format(
              'REC-7 / T3: a Record has zero or one parent, never two. To MOVE it out of "%s" and into this one, ask for the move — custom.record_reparent, or custom.migrate_reparent, which records it so it can be undone. To leave it where it is and ALSO make it reachable from this one, link the two instead: custom.relation_carry, a carrying link, which is the way T3 names to get a record into both places.',
              coalesce(v_name, v_parent::text));
  end if;

  -- REC-10: an owned relation MAKES ITS TARGET CONTAINED. The containment edge and the
  -- relation are written in one transaction, so the target cannot be owned without being
  -- contained. Every REC-7 / REC-8 / REC-N-4 refusal applies, because the edge goes in
  -- through custom._containment_guard like any other write.
  update custom.record r
     set data = r.data || jsonb_build_object('parent_id', p_owner_id::text)
   where r.organization_id = p_organization_id and r.id = p_target_id;
  if not found then
    raise exception 'that record is not in this organization'
      using errcode = '23503';
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'relation',
          jsonb_build_object('kind', 'owned', 'carrying', true,
                             'from', p_owner_id, 'to', p_target_id))
  returning id into v_id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.rule_declare(p_organization_id uuid, p_spec jsonb, p_rule_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_scope uuid;
  v_id    uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.rule_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.rule_declare');

  if jsonb_typeof(p_spec) is distinct from 'object' then
    raise exception 'A rule has to be written down before it can be saved.'
      using errcode = '22004',
            hint = 'REC-15: the spec is {name, kind: predicate|expression, uses: [...], scope_table_id, applies_to_types: [], expr: {...}}. A subscription Rule (DOOR-18) carries a `subscription` block beside those.';
  end if;

  v_scope := nullif(p_spec ->> 'scope_table_id', '')::uuid;
  if v_scope is null then
    raise exception 'A rule has to say what it is a rule about.'
      using errcode = '22004',
            hint = 'REC-15: scope_table_id names the Table record whose records this Rule speaks about. custom._rule_shape_guard refuses it otherwise, in its own words.';
  end if;

  -- A RULE DECIDES WHAT A TABLE WILL ACCEPT, so writing one is an admin act on that
  -- Table — the same rung custom.field_declare asks for, and for the same reason: this
  -- is the table's shape, not one of its rows.
  perform custom.assert_client_may_change(p_organization_id, v_scope, 'custom.rule_declare',
                                          'admin'::public.permission_level, 'table');

  if p_rule_id is null then
    -- `data_class = 'rule'` is the whole point of this door. Everything else about the
    -- document is judged by custom._rule_shape_guard on the way in.
    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, custom.rule_kernel_id(), 'rule', p_spec)
    returning id into v_id;
    return v_id;
  end if;

  -- REC-19: a Rule has versions, and History knows which version produced a Value. The
  -- version moves here for the same reason it moves on any other record.
  update custom.record
     set data = p_spec, updated_at = now(), version = version + 1
   where organization_id = p_organization_id
     and id = p_rule_id
     and table_id = custom.rule_kernel_id()
     and deleted_at is null
  returning id into v_id;
  if v_id is null then
    raise exception 'There is no rule % in this organization.', p_rule_id
      using errcode = '23503',
            hint = 'A rule id from another organization reads as absent — organizations are hard walls (REC-29).';
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.sign_request_cancel(p_organization_id uuid, p_request_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_r record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.sign_request_cancel');
  perform custom.assert_store_door(p_organization_id, 'custom.sign_request_cancel');

  select r.id, r.data into v_r
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_request_id
     and r.data_class = 'sign_request' and r.deleted_at is null;
  if v_r.id is null then
    raise exception 'there is no signature request % in this organization', p_request_id
      using errcode = '02000';
  end if;
  perform custom.assert_client_may_change(p_organization_id, (v_r.data ->> 'record_id')::uuid,
                                          'custom.sign_request_cancel',
                                          'editor'::public.permission_level, 'record');

  -- A FINISHED ANSWER IS NOT CANCELLED. Signed is signed; declined is an answer too.
  if custom.sign_request_state(v_r.data) in ('signed', 'declined') then
    raise exception 'this request was already answered - %', custom.sign_request_sentence(v_r.data)
      using errcode = '23505',
            hint = 'VAL-10: a signature is immutable once signed, and a decline is an answer rather than a failure. Ask again with a new document version if the agreement changed.';
  end if;

  update custom.record r
     set data = r.data || jsonb_build_object(
           'invalidated_at', now(),
           'invalidation_reason', coalesce(nullif(btrim(p_reason), ''),
             'This signature request was withdrawn by the organization that sent it, so the link no longer works.'))
   where r.organization_id = p_organization_id and r.id = p_request_id;

  return jsonb_build_object('request_id', p_request_id, 'state', 'invalidated');
end;
$function$;

CREATE OR REPLACE FUNCTION custom.sign_request_create(p_organization_id uuid, p_render_id uuid, p_field_key text, p_signer_email text, p_signer_name text, p_expires_in interval DEFAULT '14 days'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc     record;
  v_field   jsonb;
  v_secret  bytea;
  v_id      uuid;
  v_token   text;
  v_expires timestamptz;
  v_signer  uuid;
  v_email   text := lower(btrim(coalesce(p_signer_email, '')));
  v_name    text := btrim(coalesce(p_signer_name, ''));
  v_prior   uuid;
  v_tmpl    text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.sign_request_create');
  perform custom.assert_store_door(p_organization_id, 'custom.sign_request_create');

  if p_organization_id is null or p_render_id is null then
    raise exception 'custom.sign_request_create: organization_id and the document version are both required'
      using errcode = '22004';
  end if;

  select d.record_id, d.table_id, d.template_id, d.template_version, d.content_hash
    into v_doc
    from custom.doc_render d
   where d.organization_id = p_organization_id and d.id = p_render_id
     and d.deleted_at is null;
  if v_doc.record_id is null then
    raise exception 'there is no document % in this organization to ask anybody to sign', p_render_id
      using errcode = '02000',
            hint = 'A signature request is over a rendered document version. Render one first: custom.doc_render_document(organization, template, record).';
  end if;

  -- THE LADDER, ASKED WHERE THE RECORD IS KNOWN — the lesson W3-DOC's own door learned the
  -- hard way (`custom.doc_sign` once named a parameter it did not have and died on line nine).
  perform custom.assert_client_may_change(p_organization_id, v_doc.record_id,
                                          'custom.sign_request_create',
                                          'editor'::public.permission_level, 'record');

  -- VAL-10: THE FIELD IS NAMED WHEN THE ASK IS MADE, not when the signature arrives, so
  -- nobody can be asked for one signature and made to give another.
  select f.data into v_field
    from custom.field f
   where f.organization_id = p_organization_id
     and f.entity_definition_id = v_doc.table_id
     and f.key = p_field_key;
  if v_field is null then
    raise exception 'there is no field "%" on the table this document was rendered from', p_field_key
      using errcode = '23503', hint = 'VAL-10: a signature is a Value, so it belongs to a Field.';
  end if;
  if not custom.doc_signature_field_ok(v_field) then
    raise exception '"%" is a % field, and a signature is written on a text field whose format is signature',
                    coalesce(v_field ->> 'label', p_field_key), coalesce(v_field ->> 'type', 'nothing')
      using errcode = '23514',
            hint = format('The signature fields on this table are: %s.',
                          coalesce((select string_agg(format('%s (%s)', g.label, g.key), ', ' order by g.sort, g.key)
                                      from custom.field g
                                     where g.organization_id = p_organization_id
                                       and g.entity_definition_id = v_doc.table_id
                                       and custom.doc_signature_field_ok(g.data)),
                                   'none yet - declare one with type text and format signature'));
  end if;

  -- ALREADY SIGNED IS NOT A THING TO ASK ABOUT. `custom.doc_sign` would refuse at the end of
  -- the journey; refusing here means the client never gets a link that was never going to work.
  select s.id into v_prior
    from custom.doc_signature s
   where s.organization_id = p_organization_id
     and s.record_id = v_doc.record_id
     and s.field_key = p_field_key
     and s.deleted_at is null
   limit 1;
  if v_prior is not null then
    raise exception '"%" on this record is already signed, so there is nothing left to ask for',
                    coalesce(v_field ->> 'label', p_field_key)
      using errcode = '23505',
            hint = 'VAL-10: a signature is immutable once signed. A further agreement is a further Field with its own signature, or a further document version with its own seal.';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'a signature request has to be addressed to somebody, and "%" is not an email address', p_signer_email
      using errcode = '23514';
  end if;
  if v_name = '' then
    raise exception 'a signature request has to name who is being asked to sign'
      using errcode = '23514',
            hint = 'The name is shown on the signing page so the person opening the link can see they are the one who was meant to.';
  end if;

  v_expires := now() + coalesce(p_expires_in, interval '14 days');
  if v_expires <= now() then
    raise exception 'a signing link has to expire in the future, and % is not', v_expires
      using errcode = '22023';
  end if;

  -- THE SIGNER'S ACCOUNT, IF THERE IS ONE. A member signing in the app and an outsider
  -- (VIS-31's external principal) reach the same link; the difference is only that we can tell
  -- the first one about it through the notification system. No account is the normal case and
  -- is never an obstacle.
  select u.id into v_signer from auth.users u where lower(u.email) = v_email limit 1;

  select coalesce(r.data ->> 'name', 'a document') into v_tmpl
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_doc.template_id
     and r.data_class = 'doc_template';

  v_secret := extensions.gen_random_bytes(32);
  v_id := extensions.gen_random_uuid();

  insert into custom.record (organization_id, id, table_id, data_class, data)
  values (p_organization_id, v_id, null, 'sign_request', jsonb_strip_nulls(jsonb_build_object(
    'render_id',        p_render_id,
    'record_id',        v_doc.record_id,
    'table_id',         v_doc.table_id,
    'template_id',      v_doc.template_id,
    'document_title',   v_tmpl,
    'field_key',        p_field_key,
    'signer_email',     v_email,
    'signer_name',      v_name,
    'signer_user_id',   v_signer,
    'token_hash',       encode(sha256(convert_to(
                          custom.sign_token_encode(
                            decode(replace(p_organization_id::text, '-', ''), 'hex')
                            || decode(replace(v_id::text, '-', ''), 'hex')
                            || v_secret), 'UTF8')), 'hex'),
    'document_hash',    v_doc.content_hash,
    'document_version', v_doc.template_version,
    'sent_at',          now(),
    'expires_at',       v_expires,
    'bad_attempts',     0,
    'reminder_count',   0)));

  v_token := custom.sign_token_encode(
               decode(replace(p_organization_id::text, '-', ''), 'hex')
               || decode(replace(v_id::text, '-', ''), 'hex')
               || v_secret);

  -- THE ONE AND ONLY TIME THE SECRET EXISTS OUTSIDE THE SIGNER'S EMAIL.
  return jsonb_build_object(
    'request_id',       v_id,
    'token',            v_token,
    'path',             '/sign/' || v_token,
    'signer_email',     v_email,
    'signer_name',      v_name,
    'signer_has_account', v_signer is not null,
    'document_title',   v_tmpl,
    'document_version', v_doc.template_version,
    'document_hash',    v_doc.content_hash,
    'expires_at',       v_expires,
    'state',            'sent');
end;
$function$;

CREATE OR REPLACE FUNCTION custom.sign_request_remind(p_organization_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_r     record;
  v_state text;
  v_n     uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.sign_request_remind');
  perform custom.assert_store_door(p_organization_id, 'custom.sign_request_remind');

  select r.id, r.data into v_r
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_request_id
     and r.data_class = 'sign_request' and r.deleted_at is null;
  if v_r.id is null then
    raise exception 'there is no signature request % in this organization', p_request_id
      using errcode = '02000';
  end if;
  perform custom.assert_client_may_change(p_organization_id, (v_r.data ->> 'record_id')::uuid,
                                          'custom.sign_request_remind',
                                          'editor'::public.permission_level, 'record');

  v_state := custom.sign_request_state(v_r.data);
  if v_state not in ('sent', 'viewed') then
    -- NOTHING FAILS SILENTLY, AND NOTHING PRETENDS EITHER. There is nothing to remind about.
    return jsonb_build_object('reminded', false, 'state', v_state,
                              'message', custom.sign_request_sentence(v_r.data));
  end if;

  -- REMINDERS GO THROUGH THE NOTIFICATION SYSTEM THAT ALREADY EXISTS — `custom.agg_deliver`,
  -- which writes `communication.notification`, the one sender with the one retry policy. Its
  -- dedupe key is (rule, record, day), so passing the REQUEST as the rule holds this to one
  -- reminder per request per day without a counter anybody has to trust.
  if (v_r.data ->> 'signer_user_id') is null then
    -- ABSENT, NEVER DEAD. We cannot notify somebody who has no account here, and the store
    -- says so in words rather than returning a cheerful null.
    return jsonb_build_object(
      'reminded', false, 'state', v_state,
      'message', format('%s does not have an account here, so there is nothing to send them through the app. Send them the signing link again yourself - it is the same link, and it works until %s.',
                        v_r.data ->> 'signer_email',
                        to_char((v_r.data ->> 'expires_at')::timestamptz, 'FMDD FMMonth YYYY')));
  end if;

  v_n := custom.agg_deliver(
    p_organization_id, p_request_id, (v_r.data ->> 'record_id')::uuid, 'in_app',
    (v_r.data ->> 'signer_user_id')::uuid, 'custom.signature.reminder',
    format('Still waiting on your signature: %s', coalesce(v_r.data ->> 'document_title', 'a document')),
    format('%s is waiting for you to sign %s. The link works until %s.',
           coalesce(v_r.data ->> 'signer_name', 'Somebody'),
           coalesce(v_r.data ->> 'document_title', 'a document'),
           to_char((v_r.data ->> 'expires_at')::timestamptz, 'FMDD FMMonth YYYY')),
    jsonb_build_object('sign_request_id', p_request_id, 'source', 'signature'));

  update custom.record r
     set data = r.data || jsonb_build_object(
           'reminded_at', now(),
           'reminder_count', coalesce((r.data ->> 'reminder_count')::integer, 0) + 1)
   where r.organization_id = p_organization_id and r.id = p_request_id;

  return jsonb_build_object('reminded', true, 'state', v_state, 'notification_id', v_n,
                            'message', 'Reminder sent.');
end;
$function$;

CREATE OR REPLACE FUNCTION custom.sign_request_unchanged(p_organization_id uuid, p_request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_data  jsonb;
  v_asker uuid;
  v_held  text;
  v_hash  text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.sign_request_unchanged');

  select r.data, r.created_by into v_data, v_asker
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_request_id
     and r.data_class = 'sign_request' and r.deleted_at is null;
  if v_data is null then
    raise exception 'there is no signature request % in this organization', p_request_id
      using errcode = '02000';
  end if;

  -- THE BORROW, AND ONLY FOR THIS. The merge asks a membership question
  -- (custom.table_type_field -> custom.assert_client_may_reach) and the signing doors are
  -- server-lane, so the session carries no principal. The person who ASKED had editor on
  -- this record when they asked; re-rendering their own record to decide whether their own
  -- ask still stands is their authority, not the signer''s. AGT-N-5, and the same shape
  -- custom.anon_clear uses for a stranger''s form answer.
  v_held := current_setting('request.jwt.claims', true);
  begin
    if custom.query_principal() is null and v_asker is not null then
      perform set_config('request.jwt.claims',
                         jsonb_build_object('sub', v_asker, 'role', 'authenticated')::text, true);
    end if;
    v_hash := custom.doc_content_hash(
                custom.doc_render_body(p_organization_id,
                                       (v_data ->> 'template_id')::uuid,
                                       (v_data ->> 'record_id')::uuid));
    perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
    raise;
  end;

  -- A BOOLEAN AND NOTHING ELSE. No borrowed row, no rendered text and no field value
  -- leaves this function, so the borrow cannot become a read.
  return v_hash is not distinct from (v_data ->> 'document_hash');
end;
$function$;

CREATE OR REPLACE FUNCTION custom.subscription_mute(p_organization_id uuid, p_rule_id uuid, p_muted boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := custom.query_principal();
  v_rule  custom.record;
  v_who   uuid;
  v_table uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.subscription_mute');
  -- THE SWITCH, BEFORE THE WRITE. Muting a subscription writes a row of this store, and while
  -- `custom/system_enabled` is off this store answers a sentence rather than taking the write
  -- quietly. It was the one thing this door never asked.
  perform custom.assert_store_door(p_organization_id, 'custom.subscription_mute');
  select * into v_rule from custom.record r
   where r.organization_id = p_organization_id and r.id = p_rule_id
     and r.data_class = 'rule' and r.deleted_at is null;
  if not found or not (v_rule.data ? 'subscription') then
    raise exception 'There is no subscription % here.', p_rule_id
      using errcode = '23503',
            hint = 'It may have been removed, or it may belong to another organization — organizations are hard walls (REC-29).';
  end if;

  v_who := nullif(v_rule.data -> 'subscription' ->> 'recipient_user_id', '')::uuid;
  v_table := (v_rule.data ->> 'scope_table_id')::uuid;

  -- YOUR OWN NOTIFICATION IS YOURS TO SWITCH OFF. Requiring an administrator for that is
  -- how an organization ends up with a rule nobody reads and nobody can kill. Somebody
  -- else's is an admin act on the Table it is about, which is where that authority lives.
  -- The rung, unchanged and on the one ladder: your own notification is yours, and somebody
  -- else's takes admin on the Table it is about. The store owner (a migration, an operator at a
  -- terminal) is named rather than slipping through `has_visibility` returning false for a
  -- caller with no session.
  if v_who is distinct from v_me
     and not custom.query_is_store_owner()
     and not custom.has_visibility(v_me, 'record', v_table, 'admin'::public.permission_level) then
    raise exception 'That notification is not addressed to you, so you cannot switch it off.'
      using errcode = '42501',
            hint = 'A notification you receive is always yours to stop. Switching off somebody else''s takes the admin level on the table it is about — ask whoever holds it.';
  end if;

  update custom.record
     set data = jsonb_set(data, '{subscription,muted}', to_jsonb(coalesce(p_muted, true)), true),
         updated_at = now(), version = version + 1
   where organization_id = p_organization_id and id = p_rule_id;
  return coalesce(p_muted, true);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.subscription_preview(p_organization_id uuid, p_rule_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := custom.query_principal();
  v_rule  custom.record;
  v_who   uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.subscription_preview');
  select * into v_rule from custom.record r
   where r.organization_id = p_organization_id and r.id = p_rule_id
     and r.data_class = 'rule' and r.deleted_at is null;
  if not found or not (v_rule.data ? 'subscription') then
    raise exception 'There is no subscription % here.', p_rule_id
      using errcode = '23503';
  end if;

  v_who := nullif(v_rule.data -> 'subscription' ->> 'recipient_user_id', '')::uuid;
  -- SHOWING SOMEBODY ELSE'S SUMMARY WOULD SHOW THEM THEIR RECORDS. The same rung
  -- muting takes: your own is yours, and somebody else's takes admin on the Table.
  if v_who is distinct from v_me
     and not custom.query_is_store_owner()
     and not custom.has_visibility(v_me, 'record', (v_rule.data ->> 'scope_table_id')::uuid,
                                   'admin'::public.permission_level) then
    raise exception 'That summary is addressed to somebody else, so it is not yours to read.'
      using errcode = '42501',
            hint = 'A summary is assembled under the person it is sent to, so reading one means reading their records. Ask whoever holds admin on the table.';
  end if;

  -- It ASSEMBLES and returns. Nothing is sent and nothing is recorded, so pressing
  -- "show me one now" does not move the watermark and does not cost somebody a text.
  return custom.agg_digest_assemble(p_organization_id, p_rule_id, null, now());
end;
$function$;

CREATE OR REPLACE FUNCTION custom.table_archive(p_organization_id uuid, p_table_id uuid, p_chunk integer DEFAULT 50, p_include_table boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- THE MOST ONE CALL WILL TAKE ON. Not the most a SCREEN should ask for: a client call goes
  -- through PostgREST, which cancels at ~8 s whatever this function would have been happy to
  -- do, so `p_chunk`'s DEFAULT (50) is the honest number and this cap is for a caller with a
  -- real budget.
  c_max     constant integer := 1000;
  v_chunk   integer;
  v_id      uuid;
  v_did     integer := 0;
  v_live    integer;
  v_gone    integer;
  v_name    text;
  v_table   boolean;                   -- is the Table record itself still live?
  v_whole   boolean;                   -- was this call asked to archive the Table too?
  v_done    boolean := false;
  v_table_now boolean := false;      -- did THIS call archive the Table record itself?
  v_event   uuid;                    -- STORE-TAILS-3: the one archive event of this operation
  v_prev_event text;
begin
  -- THE SWITCH, THE WALL, THE RUNG — all three by name, before anything is read or written.
  -- The rung is the one `custom.record_delete` asks of the Table record, asked ONCE here so a
  -- person who may not do this is told before the first row moves rather than after.
  perform custom.assert_store_door(p_organization_id, 'custom.table_archive');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_archive');

  if p_organization_id is null or p_table_id is null then
    raise exception 'Archiving a table needs the organization and the table, and this call does not say which.'
      using errcode = '22004';
  end if;

  select coalesce(nullif(r.data ->> 'name', ''), 'this table'), r.deleted_at is null
    into v_name, v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
     and r.data_class = 'table';
  if not found then
    raise exception 'There is no table % in this organization, so there is nothing to archive.', p_table_id
      using errcode = '02000',
            hint = 'The store is keyed (organization_id, id), so a table of another organization is not found by this one. Nothing was changed.';
  end if;

  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.table_archive');

  v_whole := coalesce(p_include_table, true);
  -- HOW MUCH THIS CALL TAKES ON. 0 means "tell me, change nothing" — which is what a screen
  -- asks before it shows a person a number and a button. Above c_max is clamped rather than
  -- refused, because a caller asking for too much wants the work done, not a lecture; the
  -- answer says what it actually did.
  v_chunk := least(greatest(coalesce(p_chunk, 50), 0), c_max);

  -- STORE-TAILS-3: ONE EVENT FOR THE WHOLE OPERATION. A screen calls this door until `done`;
  -- every call's rows are written to the SAME open event, so the restore brings back the records
  -- chunk one archived together with the columns the last call archived. Opened only when this
  -- call is going to archive something.
  if v_chunk > 0
     and (exists (select 1 from custom.record r
                   where r.organization_id = p_organization_id and r.table_id = p_table_id
                     and r.data_class = 'record' and r.deleted_at is null)
          or (v_whole and v_table)) then
    select m.id into v_event
      from history.migration_log m
     where m.organization_id = p_organization_id
       and m.verb = 'archive'
       and m.target_kind = 'table'
       and m.target_id = p_table_id
       and m.undone_at is null
       and coalesce((m.inverse ->> 'open')::boolean, false)
     order by m.applied_at desc
     limit 1;
    if v_event is null then
      v_event := history.migration_record(p_organization_id, 'archive', 'table', p_table_id,
                   jsonb_build_object('kind', 'restore', 'record_id', p_table_id::text,
                                      'also', '[]'::jsonb, 'took', '[]'::jsonb, 'open', true,
                                      'whole', v_whole),
                   format('STORE-TAILS-3: %s archived as one unit — its records, fields, saved views and rules with it; restoring it brings back exactly this set.', v_name));
    end if;
    v_prev_event := coalesce(current_setting('custom.archive_event', true), '');
    perform set_config('custom.archive_event', v_event::text, true);
  end if;

  if v_chunk > 0 then
    for v_id in select r.id
                  from custom.record r
                 where r.organization_id = p_organization_id
                   and r.table_id = p_table_id
                   and r.data_class = 'record'
                   and r.deleted_at is null
                 order by r.created_at, r.id
                 limit v_chunk
    loop
      -- A RECORD THAT CONTAINS OTHER RECORDS TAKES THEM WITH IT, so a row this loop is about
      -- to reach may already have gone with an earlier one. That is not an error and it is
      -- not a second delete; it is simply already done.
      if exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_id and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_id);
        v_did := v_did + 1;
      end if;
    end loop;
  end if;

  select count(*) filter (where r.deleted_at is null),
         count(*) filter (where r.deleted_at is not null)
    into v_live, v_gone
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.data_class = 'record';

  -- THE TABLE GOES LAST, AND ONLY WHEN IT IS EMPTY. By now its own cascade is the Fields, the
  -- saved views and the Rules it carries — tens of rows, not thousands — so the one call that
  -- could not finish before is now the cheapest one in the run.
  -- … AND ONLY WHEN THIS CALL WAS ASKED TO CHANGE SOMETHING. `p_chunk = 0` means "tell me,
  -- change nothing" (ARGS-RULED-2, 2026-09-23): until this line an empty Table with the table
  -- included was archived by the very call that promised to change nothing.
  if v_chunk > 0 and v_live = 0 and v_whole and v_table then
    perform custom.record_delete(p_organization_id, p_table_id);
    v_table := false;
    v_table_now := true;
  end if;

  v_done := v_live = 0 and (not v_whole or not v_table);

  -- STORE-TAILS-3: THE EVENT CLOSES WHEN THE OPERATION IS DONE — the table archived, or (for
  -- "empty it but keep it") every record archived. From then on a restore of the table brings
  -- back exactly what it names, and a later archive is a new event.
  if v_event is not null then
    perform set_config('custom.archive_event', v_prev_event, true);
    if v_done then
      update history.migration_log m
         set inverse = m.inverse || jsonb_build_object(
               'open', false,
               'archived_at', (select to_jsonb(r.deleted_at) from custom.record r
                                where r.organization_id = p_organization_id and r.id = p_table_id))
       where m.organization_id = p_organization_id and m.id = v_event;
    end if;
  end if;

  return jsonb_build_object(
    'table_id',   p_table_id,
    'table_name', v_name,
    'archived',   v_did,                 -- what THIS call archived
    'remaining',  v_live,                -- records still live in this table
    'total',      v_live + v_gone,       -- records this table has ever held
    'archived_total', v_gone,            -- records of this table already archived, all runs
    'table_archived', not v_table,
    'done',       v_done,
    'chunk',      v_chunk,
    'archive_event', v_event,            -- STORE-TAILS-3: what "Bring it back" will restore
    'message',    case
      when v_chunk = 0 and v_live > 0 then
        format('%s record%s in %s would be archived. Nothing has been changed yet.',
               v_live, case when v_live = 1 then '' else 's' end, v_name)
      -- SAY WHAT THIS CALL DID (ARGS-RULED-2). An empty Table archived by THIS call used to be
      -- told "is already archived. Nothing was changed." — the opposite of what had happened.
      when v_chunk = 0 and v_whole and v_table then
        format('%s has no records left, so archiving it now would archive the table itself. Nothing has been changed yet.', v_name)
      when v_table_now and v_did = 0 then
        format('%s had no records left to archive, so the table itself is now archived — it can be brought back.', v_name)
      when v_done and v_did = 0 and not v_whole then
        format('Nothing is left to archive in %s. Nothing was changed.', v_name)
      when v_done and v_did = 0 then
        format('%s is already archived. Nothing was changed.', v_name)
      -- WHICH OF THE TWO ACTUALLY HAPPENED. Archiving everything IN a table is not archiving
      -- the table, and a screen that says it is has lied to the person who kept it on purpose.
      when v_done and not v_whole then
        format('%s record%s archived. %s is now empty and still here, and everything in it can be brought back.',
               v_did, case when v_did = 1 then '' else 's' end, v_name)
      when v_done then
        format('%s record%s archived. %s is archived, and everything in it can still be brought back.',
               v_did, case when v_did = 1 then '' else 's' end, v_name)
      else
        format('%s record%s archived, %s to go in %s. Call again to carry on — it picks up where this left off.',
               v_did, case when v_did = 1 then '' else 's' end, v_live, v_name)
    end);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.table_webhook_archive(p_organization_id uuid, p_webhook_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_webhook_archive');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_webhook_archive');
  select custom.record_source_table(r) into v_table
    from files.webhooks w, unnest(w.resource_types) r
   where w.id = p_webhook_id and w.organization_id = p_organization_id
     and custom.record_source_table(r) is not null
   limit 1;
  if v_table is null then
    raise exception 'There is no table webhook % here.', p_webhook_id
      using errcode = '23503', hint = 'It may belong to another organization. Nothing was changed.';
  end if;
  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.table_webhook_archive',
                                          'admin'::public.permission_level, 'table');
  update files.webhooks set is_active = false, updated_at = now()
   where id = p_webhook_id and organization_id = p_organization_id;
  return true;
end
$function$;

CREATE OR REPLACE FUNCTION custom.view_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id      uuid := nullif(p_spec ->> 'view_id', '')::uuid;
  v_name    text := nullif(btrim(p_spec ->> 'name'), '');
  v_filters jsonb := case when jsonb_typeof(p_spec -> 'filters') = 'object'
                          then p_spec -> 'filters' else '{}'::jsonb end;
  -- What the caller sent as the definition. Never the table and never the filters (both have
  -- their own place above), and never the hand-set order (custom.view_record_order_set's).
  v_in      jsonb := coalesce(case when jsonb_typeof(p_spec -> 'definition') = 'object'
                                   then (p_spec -> 'definition') - 'table_id'::text - 'filters'::text
                                        - 'order'::text
                              end, '{}'::jsonb);
  v_row     record;
  v_def     jsonb;
  v_cleared text[];
  v_set     jsonb;
  v_keys    jsonb;
  v_levels  integer;
  v_old     jsonb := '{}'::jsonb;
  -- VIEW-SWITCH: whether the view being written IS the table's default (its designation).
  v_was_default boolean := false;
  -- ORDER-FIX: the one order word a caller may send. A hand-set order is written by placing
  -- the rows (custom.view_record_order_set); a caller may only turn it off ("sorted").
  v_order_in text := case when jsonb_typeof(p_spec -> 'definition') = 'object'
                          then nullif(p_spec -> 'definition' ->> 'order', '') end;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.view_declare');
  perform custom.assert_store_door(p_organization_id, 'custom.view_declare');
  -- VIEWER, not editor. Writing down a question about a Table is not changing it.
  perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.view_declare');

  if p_table_id is null then
    raise exception 'A saved view is a view OF something — name the table.'
      using errcode = '22004';
  end if;

  -- ── ORDER-FIX: A VIEW'S ORDER IS ITS SORT OR ITS HAND-SET ORDER, NEVER BOTH. A caller may say
  -- "sorted" (stop using the hand-set order); "manual" is written only by placing the rows.
  if v_order_in is not null and v_order_in <> 'sorted' then
    raise exception 'A view is put in a hand-set order by placing its rows, not by naming the word "%".', v_order_in
      using errcode = '22023',
            hint = 'Place the rows with custom.view_record_order_set; send order "sorted" (or a sort) to go back to a sort. Nothing was written.';
  end if;

  -- ── GRID-PRIMITIVES G7: `layout` IS THE VIEW'S KIND; THE GRID'S CHOICES ARE `grid`. A settings
  -- OBJECT sent as `layout` (G1's shape) is moved under `grid` rather than refused.
  if jsonb_typeof(v_in -> 'layout') = 'object' then
    v_in := (v_in - 'layout'::text)
            || jsonb_build_object('grid', coalesce(case when jsonb_typeof(v_in -> 'grid') = 'object'
                                                        then v_in -> 'grid' end, '{}'::jsonb)
                                          || (v_in -> 'layout'));
  end if;

  -- A key sent as JSON null means "clear it"; every other key sent replaces that one key.
  select coalesce(array_agg(e.key) filter (where jsonb_typeof(e.value) = 'null'), '{}'::text[]),
         coalesce(jsonb_object_agg(e.key, e.value) filter (where jsonb_typeof(e.value) <> 'null'), '{}'::jsonb)
    into v_cleared, v_set
    from jsonb_each(v_in) e;

  -- ── S1-PRIME VIEW-KEYS: A KEY CLEARED MUST BE A KEY. Clearing a setting no view has is the same
  -- misspelling as setting one.
  if exists (select 1 from unnest(v_cleared) c(k)
              where not exists (select 1 from custom.view_keys() r where r.path = c.k)) then
    raise exception 'A saved view has no setting called "%", so there is nothing to clear.',
                    (select c.k from unnest(v_cleared) c(k)
                      where not exists (select 1 from custom.view_keys() r where r.path = c.k) limit 1)
      using errcode = '22023', hint = 'The settings a view keeps are listed by custom.view_keys(). Nothing was written.';
  end if;

  -- ONE HIDDEN-COLUMN LIST. A caller that names hidden columns by Field ID (`hidden_fields`, the
  -- mover's shape) has them written where the grid and the gallery read them —
  -- `presentation.hiddenFields`, by Field KEY; the ids stay only as provenance under
  -- `moved_from.hidden_fields` when the view was moved in. Two lists of one thing drift.
  if jsonb_typeof(v_set -> 'hidden_fields') = 'array' then
    select coalesce(jsonb_agg(distinct f.data ->> 'key'), '[]'::jsonb) into v_keys
      from jsonb_array_elements_text(v_set -> 'hidden_fields') x(fid)
      join custom.record f
        on f.organization_id = p_organization_id and f.id::text = x.fid
       and f.data_class = 'field' and f.data ->> 'key' is not null
       and f.data ->> 'entity_definition_id' = p_table_id::text;
    if jsonb_typeof(v_set -> 'moved_from') = 'object' then
      v_set := jsonb_set(v_set, '{moved_from,hidden_fields}', v_set -> 'hidden_fields', true);
    end if;
    v_set := jsonb_set(v_set - 'hidden_fields'::text, '{presentation}',
                       coalesce(case when jsonb_typeof(v_set -> 'presentation') = 'object'
                                     then v_set -> 'presentation' end, '{}'::jsonb)
                       || jsonb_build_object('hiddenFields', v_keys), true);
  end if;

  if v_id is not null then
    select sv.* into v_row
      from platform.saved_view sv
     where sv.id = v_id and sv.organization_id = p_organization_id and sv.deleted_at is null
       and sv.surface_key = 'custom/records'
       and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id
       for update;
    if v_row.id is null then
      raise exception 'There is no saved view % here.', v_id
        using errcode = '23503',
              hint = 'It may have been removed, it may be a view of another table, or it may belong to another organization — organizations are hard walls (REC-29).';
    end if;
    v_old := coalesce(v_row.definition, '{}'::jsonb);
  end if;

  -- ── S1-PRIME VIEW-KEYS: EVERY KEY SENT IS JUDGED BY THE REGISTRY, AND THE FILTER BY THE ONE
  -- COMPILER, BEFORE ANYTHING IS WRITTEN. `moved_from` is the server's and is not judged here.
  v_set := (custom.view_keys_check(p_organization_id, p_table_id, v_set - 'moved_from'::text,
                                   v_old))
           || coalesce(case when v_set ? 'moved_from' then jsonb_build_object('moved_from', v_set -> 'moved_from') end, '{}'::jsonb);
  -- ── VIEW-SWITCH-NOT-DESIGNATION (VERIFIER-21, 2026-09-25): LOOKING AT A TABLE IS NOT DECIDING
  -- HOW IT OPENS. The table's default view — its `is_default` and its `layout` — is the
  -- table's DESIGNATION: how it opens for everyone. It is changed by one deliberate act, by someone
  -- who may edit the table: `custom.view_designate`. This door (VIEWER on the table) keeps every
  -- other setting of every view, but never the designation, so pressing Kanban or Calendar can
  -- never again open a member's table in the owner's last look.
  if v_id is not null then
    v_was_default := coalesce(v_row.is_default, false) or (v_old -> 'is_default') = 'true'::jsonb;
    if v_was_default
       and ((v_set ? 'layout' and (v_set ->> 'layout') is distinct from coalesce(v_old ->> 'layout', 'grid'))
            or 'layout' = any(v_cleared)) then
      raise exception 'Looking at this table as a % does not change how it opens for everyone, so it was not saved onto its default view.',
                      coalesce(v_set ->> 'layout', 'grid')
        using errcode = '22023',
              hint = 'The table''s default layout is changed only by "Make this the default" (custom.view_designate), by someone who can edit the table. Nothing was written.';
    end if;
    if (v_set ? 'is_default' and (v_set -> 'is_default') is distinct from to_jsonb(v_was_default))
       or ('is_default' = any(v_cleared) and v_was_default) then
      raise exception 'Which view a table opens on is chosen with "Make this the default", not by saving a view.'
        using errcode = '22023',
              hint = 'Use custom.view_designate, by someone who can edit the table. Nothing was written.';
    end if;
  elsif (v_set -> 'is_default') = 'true'::jsonb
        and exists (select 1 from platform.saved_view sv
                     where sv.organization_id = p_organization_id and sv.deleted_at is null
                       and sv.surface_key = 'custom/records'
                       and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id
                       and (sv.is_default or (sv.definition -> 'is_default') = 'true'::jsonb)) then
    raise exception 'This table already has a default view, so a new view cannot be saved as it.'
      using errcode = '22023',
            hint = 'Save the view, then use "Make this the default" (custom.view_designate), by someone who can edit the table. Nothing was written.';
  end if;

  -- ── VIEW-LOOK (VERIFIER-23 item 1, 2026-09-25): A LOOK IS YOURS UNTIL YOU SAVE IT. A saved view
  -- is how everybody who opens it sees the table; choosing a board's grouping, a calendar's date
  -- field, a sort, a filter, a hidden column or a width while looking is the person's OWN look
  -- (custom.view_look_set) until someone who may EDIT the table saves it onto the view. So a
  -- change to a view that already exists needs editor on the table — or the view is the caller's
  -- own and is not the table's default. Saving a NEW view is unchanged (viewer).
  if v_id is not null then
    if not custom.query_is_store_owner()
       and custom.query_principal() is not null
       and not (v_row.created_by is not distinct from custom.query_principal() and not v_was_default)
       and not custom.has_visibility(custom.query_principal(), 'record', p_table_id, 'editor'::public.permission_level) then
      raise exception 'Only someone who can edit this table saves a change onto its view "%" for everyone, so your change was not saved onto it.', v_row.name
        using errcode = '42501',
              hint = 'Your own look at this view is kept for you alone (custom.view_look_set) and "Reset to view" returns to it; someone who can edit the table presses "Save to view". Nothing was written.';
    end if;
  end if;

  -- `filters` is the FLAT map the digests and the notifier read (custom.agg_view_admits); a Rule
  -- expression there would be refused by name the first time a subscription asks it, so it is
  -- refused here, with where it belongs.
  if p_spec ? 'filters' and v_filters <> '{}'::jsonb then
    if custom.filter_is_rule(v_filters) then
      raise exception 'A view''s filters are the flat Field-to-value map, and this is a Rule expression.'
        using errcode = '22023', hint = 'Send a nested question as definition.where (S2-PRIME); the digests and the notifier read filters. Nothing was written.';
    end if;
    perform custom.record_filter_sql(p_organization_id, p_table_id, v_filters);
  end if;

  if v_id is not null then
    -- MERGE. What the caller did not send stays exactly as it was.
    v_def := coalesce(v_row.definition, '{}'::jsonb);
    v_set := v_set - 'moved_from'::text;
    v_cleared := array_remove(v_cleared, 'moved_from');
    if jsonb_typeof(v_set -> 'grid') = 'object' and jsonb_typeof(v_def -> 'grid') = 'object' then
      v_set := jsonb_set(v_set, '{grid}', (v_def -> 'grid') || (v_set -> 'grid'));
    end if;
    v_def := (v_def - v_cleared) || v_set;
    if p_spec ? 'filters' then
      v_def := jsonb_set(v_def, '{filters}', v_filters, true);
    end if;
    -- The table is the view's for life.
    v_def := jsonb_set(v_def, '{table_id}', to_jsonb(p_table_id), true);
    if not (v_def ? 'filters') then
      v_def := jsonb_set(v_def, '{filters}', '{}'::jsonb, true);
    end if;
    if v_def ? 'grid' then
      v_def := jsonb_set(v_def, '{grid}', custom.grid_layout_check(v_def -> 'grid', 'view'));
    end if;
  else
    -- THE ONE SHAPE THE NOTIFIER READS. `custom.agg_view_admits` and
    -- `custom.agg_view_admits_state` both take `{"table_id": …, "filters": {…}}`, so a
    -- view saved here needs no translation before a subscription can be written over it.
    -- THE CASTS ARE NOT DECORATION (42725 without them: `jsonb - text` vs `jsonb - text[]`).
    v_def := jsonb_build_object('table_id', p_table_id, 'filters', v_filters) || v_set;
    if v_def ? 'grid' then
      v_def := jsonb_set(v_def, '{grid}', custom.grid_layout_check(v_def -> 'grid', 'view'));
    end if;
  end if;

  -- ── ORDER-FIX: CHOOSING A SORT REPLACES THE HAND-SET ORDER (Airtable's rule: a manual order is
  -- one of a view's sorts, and picking a column sort replaces it). The positions stay on the
  -- view's row, so placing the rows again starts from the order the person last kept.
  if v_def ->> 'order' = 'manual'
     and (v_order_in = 'sorted'
          or (jsonb_typeof(v_set -> 'sorts') = 'array' and jsonb_array_length(v_set -> 'sorts') > 0)) then
    v_def := jsonb_set(v_def, '{order}', '"sorted"'::jsonb, true);
  end if;

  -- ── S1-PRIME VIEW-KEYS: THE KEYS THAT MUST AGREE, ASKED OF THE VIEW AS IT WILL BE STORED.
  if nullif(v_def ->> 'swimlane_field', '') is not null
     and v_def ->> 'swimlane_field' = v_def ->> 'group_field' then
    raise exception 'The swimlanes and the columns are both %, so every lane would hold one column.', v_def ->> 'swimlane_field'
      using errcode = '22023', hint = 'A swimlane cuts the board by a second field. Nothing was written.';
  end if;
  v_levels := case when jsonb_typeof(v_def -> 'presentation' -> 'grouping') = 'object'
                   then 1 + coalesce(case when jsonb_typeof(v_def -> 'presentation' -> 'grouping' -> 'then') = 'array'
                                          then jsonb_array_length(v_def -> 'presentation' -> 'grouping' -> 'then') end, 0)
                   else 0 end;
  if v_levels > 3 then
    raise exception 'A view groups at most three levels deep, and this one would group %.', v_levels
      using errcode = '22023', hint = 'Nothing was written.';
  end if;

  if v_id is not null then
    update platform.saved_view
       set name = coalesce(v_name, name), definition = v_def, updated_at = now(), version = version + 1
     where id = v_id and organization_id = p_organization_id;
    return v_id;
  end if;

  insert into platform.saved_view
    (name, surface_key, subject_id, definition, organization_id, created_by, visibility)
  values (coalesce(v_name, 'Saved view'), 'custom/records', p_table_id, v_def, p_organization_id,
          custom.query_principal(), 'internal'::platform.visibility)
  returning id into v_id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.view_designate(p_organization_id uuid, p_table_id uuid, p_view_id uuid, p_layout text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row record;
  v_set jsonb := '{}'::jsonb;
  v_me  uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.view_designate');
  perform custom.assert_store_door(p_organization_id, 'custom.view_designate');
  -- EDITOR, not viewer: how a table opens is how it opens for everyone who can open it.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.view_designate',
                                          'editor'::public.permission_level, 'table');

  if p_table_id is null or p_view_id is null then
    raise exception 'Name the table and the view that should be its default.'
      using errcode = '22004';
  end if;

  select sv.* into v_row
    from platform.saved_view sv
   where sv.id = p_view_id and sv.organization_id = p_organization_id and sv.deleted_at is null
     and sv.surface_key = 'custom/records'
     and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id
     for update;
  if v_row.id is null then
    raise exception 'There is no saved view % here.', p_view_id
      using errcode = '23503',
            hint = 'It may have been removed, it may be a view of another table, or it may belong to another organization — organizations are hard walls (REC-29).';
  end if;

  -- The layout is a view setting like any other, judged by the one registry (grid, kanban,
  -- calendar, gallery, sheet; anything else refused by name).
  if nullif(btrim(p_layout), '') is not null then
    v_set := custom.view_keys_check(p_organization_id, p_table_id,
                                    jsonb_build_object('layout', btrim(p_layout)),
                                    coalesce(v_row.definition, '{}'::jsonb));
  end if;

  -- ONE DEFAULT PER TABLE: every other default view of this table stops being it.
  update platform.saved_view sv
     set is_default = false,
         definition = jsonb_set(coalesce(sv.definition, '{}'::jsonb), '{is_default}', 'false'::jsonb, true),
         updated_at = now(), updated_by = coalesce(v_me, sv.updated_by), version = sv.version + 1
   where sv.organization_id = p_organization_id and sv.deleted_at is null
     and sv.surface_key = 'custom/records'
     and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id
     and sv.id <> p_view_id
     and (sv.is_default or (sv.definition -> 'is_default') = 'true'::jsonb);

  update platform.saved_view sv
     set is_default = true,
         definition = coalesce(sv.definition, '{}'::jsonb)
                      || jsonb_build_object('is_default', true, 'table_id', p_table_id)
                      || v_set,
         updated_at = now(), updated_by = coalesce(v_me, sv.updated_by), version = sv.version + 1
   where sv.id = p_view_id and sv.organization_id = p_organization_id;
  return p_view_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.view_look_set(p_organization_id uuid, p_table_id uuid, p_view_id uuid, p_look jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- The settings a person may hold as her own look. Never the view's designation (is_default),
  -- its Rule, the flat filters the digests read, or what only the server writes.
  c_keys  constant text[] := array['layout', 'where', 'group_field', 'swimlane_field', 'collapsed_columns',
                                   'measure', 'date_field', 'image_field', 'sorts', 'presentation', 'grid'];
  v_me    uuid := custom.query_principal();
  v_view  record;
  v_look  record;
  v_bad   text;
  v_set   jsonb;
  v_null  jsonb;
  v_doc   jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.view_look_set');
  perform custom.assert_store_door(p_organization_id, 'custom.view_look_set');
  -- VIEWER, and it writes nothing anybody else reads.
  perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.view_look_set');

  if p_table_id is null or p_view_id is null then
    raise exception 'Name the table and the view this look is a look at.' using errcode = '22004';
  end if;
  if v_me is null then
    raise exception 'A look is kept for a signed-in person, and nobody is signed in.'
      using errcode = '42501', hint = 'Sign in; a look is kept per person. Nothing was written.';
  end if;

  select sv.* into v_view
    from platform.saved_view sv
   where sv.id = p_view_id and sv.organization_id = p_organization_id and sv.deleted_at is null
     and sv.surface_key = 'custom/records'
     and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id;
  if v_view.id is null then
    raise exception 'There is no saved view % here.', p_view_id
      using errcode = '23503',
            hint = 'It may have been removed, it may be a view of another table, or it may belong to another organization — organizations are hard walls (REC-29).';
  end if;

  -- One look per person per view: two tabs pressing at once never make two.
  perform pg_advisory_xact_lock(hashtextextended('custom.view_look:' || v_me::text || ':' || p_view_id::text, 0));
  select l.* into v_look
    from platform.saved_view l
   where l.subject_id = p_view_id and l.surface_key = 'custom/records/look'
     and l.created_by = v_me and l.deleted_at is null
   order by l.updated_at desc
   limit 1
   for update;

  -- RESET TO VIEW: no look (or an empty one) — the view as it is saved, again. Archived, never deleted.
  if p_look is null or jsonb_typeof(p_look) = 'null' or p_look = '{}'::jsonb then
    update platform.saved_view l
       set deleted_at = now(), updated_at = now()
     where l.subject_id = p_view_id and l.surface_key = 'custom/records/look'
       and l.created_by = v_me and l.deleted_at is null;
    return null;
  end if;
  if jsonb_typeof(p_look) <> 'object' then
    raise exception 'A look is the settings of a view, as an object.' using errcode = '22023',
      hint = 'Send {"group_field": "status"} and the like; send null to go back to the view. Nothing was written.';
  end if;

  select k into v_bad from jsonb_object_keys(p_look) k where not (k = any (c_keys)) limit 1;
  if v_bad is not null then
    raise exception 'A look keeps how you are looking at a view, and "%" is not one of those settings.', v_bad
      using errcode = '22023',
            hint = 'A look may hold: layout, where, group_field, swimlane_field, collapsed_columns, measure, date_field, image_field, sorts, presentation, grid. Whether a view is the default is custom.view_designate; the rest is saved onto the view. Nothing was written.';
  end if;

  -- A setting cleared in the look (JSON null) HIDES the view's own ("no grouping, for me"). Every
  -- other key is judged by the one registry, exactly as the view would judge it.
  select coalesce(jsonb_object_agg(e.key, e.value) filter (where jsonb_typeof(e.value) <> 'null'), '{}'::jsonb),
         coalesce(jsonb_object_agg(e.key, e.value) filter (where jsonb_typeof(e.value) = 'null'), '{}'::jsonb)
    into v_set, v_null
    from jsonb_each(p_look) e;
  v_set := custom.view_keys_check(p_organization_id, p_table_id, v_set, coalesce(v_view.definition, '{}'::jsonb));
  if v_set ? 'grid' then
    v_set := jsonb_set(v_set, '{grid}', custom.grid_layout_check(v_set -> 'grid', 'view'));
  end if;
  v_doc := v_set || v_null;

  if v_look.id is not null then
    update platform.saved_view
       set definition = v_doc, updated_at = now(), version = version + 1
     where id = v_look.id;
  else
    insert into platform.saved_view
      (name, surface_key, subject_id, definition, organization_id, created_by, visibility)
    values (coalesce(v_view.name, 'Saved view'), 'custom/records/look', p_view_id, v_doc,
            p_organization_id, v_me, 'personal'::platform.visibility);
  end if;
  return v_doc;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.view_record_order_set(p_organization_id uuid, p_view_id uuid, p_record_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_view   record;
  v_table  uuid;
  v_max    integer := coalesce((platform.knob_resolve('custom', 'view_record_order_max', p_organization_id) #>> '{}')::integer, 20000);
  v_named  integer := coalesce(cardinality(p_record_ids), 0);
  v_bad    integer;
  v_pos    jsonb;
  v_total  integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.view_record_order_set');
  perform custom.assert_store_door(p_organization_id, 'custom.view_record_order_set');

  select * into v_view from platform.saved_view
   where id = p_view_id and organization_id = p_organization_id
     and surface_key = 'custom/records' and deleted_at is null;
  if v_view.id is null then
    raise exception 'There is no saved view % here.', p_view_id
      using errcode = '23503',
            hint = 'It may have been removed, or it may belong to another organization — organizations are hard walls (REC-29).';
  end if;
  v_table := coalesce(v_view.subject_id, nullif(v_view.definition ->> 'table_id', '')::uuid);
  perform custom.assert_client_may_open(p_organization_id, v_table, 'custom.view_record_order_set');
  -- ── VIEW-LOOK (VERIFIER-23 item 1): A HAND-SET ORDER IS THE VIEW'S SORT, SO IT IS SAVED FOR
  -- EVERYBODY WHO OPENS THE VIEW — by someone who may EDIT the table, the same rule as "Save to
  -- view" (custom.view_declare). Looking at the rows in another order is the person's own.
  if not custom.query_is_store_owner()
     and custom.query_principal() is not null
     and not custom.has_visibility(custom.query_principal(), 'record', v_table, 'editor'::public.permission_level) then
    raise exception 'Only someone who can edit this table puts its view "%" in an order by hand for everyone, so the order was not saved.', v_view.name
      using errcode = '42501',
            hint = 'Sort the rows for yourself with a column sort (your own look); someone who can edit the table saves a hand-set order. Nothing was changed.';
  end if;

  if v_named = 0 then
    raise exception 'Name the records in the order you want them.' using errcode = '22023',
      hint = 'custom.view_record_order_set takes the record ids of this view''s table, first to last. Nothing was changed.';
  end if;
  if v_named > v_max then
    raise exception 'This order names % records; a view holds a hand-set order for at most %.', v_named, v_max
      using errcode = '54000', hint = 'The ceiling is the organization knob custom/view_record_order_max. Nothing was changed.';
  end if;
  if (select count(distinct x) from unnest(p_record_ids) x) <> v_named then
    raise exception 'The same record is named twice in this order.' using errcode = '22023',
      hint = 'Each record takes one place. Nothing was changed.';
  end if;

  select count(*) into v_bad
    from unnest(p_record_ids) x(id)
   where x.id not in (select v from custom.query_visible_ids(p_organization_id, v_table, 'viewer') v);
  if v_bad > 0 then
    raise exception '% of the records named are not rows of this view''s table that you can see.', v_bad
      using errcode = '22023', hint = 'Order only the rows the view shows you. Nothing was changed.';
  end if;

  -- The named first, in the order given; then the rows the view had already placed and this
  -- call did not name, in their old order (only while they still live in the Table); re-spaced.
  with named as (
    select x.id, x.n::numeric as k from unnest(p_record_ids) with ordinality x(id, n)
  ),
  kept as (
    select (e.key)::uuid as id, (e.value #>> '{}')::numeric as old
      from jsonb_each(coalesce(v_view.metadata -> 'record_positions', '{}'::jsonb)) e
     where (e.key)::uuid not in (select id from named)
       and exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = (e.key)::uuid
                      and r.table_id = v_table and r.deleted_at is null)
  ),
  ordered as (
    select id, row_number() over (order by grp, k, id) as n
      from (select id, 0 as grp, k from named
            union all
            select id, 1 as grp, old from kept) u
  )
  select jsonb_object_agg(id::text, n * 1024), count(*) into v_pos, v_total from ordered;

  update platform.saved_view
     set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{record_positions}', v_pos, true),
         -- ORDER-FIX: the hand-set order IS the view's sort, so the sort it replaces goes.
         definition = (definition - 'sorts'::text) || jsonb_build_object('order', 'manual'),
         updated_at = now()
   where id = p_view_id and organization_id = p_organization_id;

  return jsonb_build_object('view_id', p_view_id, 'table_id', v_table, 'order', 'manual',
                            'named', v_named, 'positioned', v_total,
                            'replaced_sorts', coalesce(v_view.definition -> 'sorts', '[]'::jsonb));
end
$function$;

CREATE OR REPLACE FUNCTION custom.visibility_as_of(p_organization_id uuid, p_record_id uuid, p_at timestamp with time zone)
 RETURNS TABLE(principal_kind text, principal_id uuid, level permission_level, through_kind text, through_id uuid, reason text, replayed boolean, held_from timestamp with time zone, held_to timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_max_depth constant integer := 32;
  c_max_nodes constant integer := 1024;
  v_me        uuid := custom.query_principal();
  v_from_rec  timestamptz;
  v_from_grn  timestamptz;
  v_from      timestamptz;
  v_state     jsonb;
  v_replayed  boolean;
  v_nodes     uuid[] := '{}';
  v_flags     boolean[] := '{}';
  v_frontier  uuid[];
  v_next      uuid[];
  v_depth     integer := 0;
  v_parent    uuid;
  v_id        uuid;
  v_capped    boolean := false;
  v_vis       text;
  r           record;
  v_member_default public.permission_level;
  v_lane_open boolean;
  v_lane_replayed  boolean;
  v_level_replayed boolean;
  v_table_id  uuid;
  v_born      timestamptz;
  -- SHARE-TAILS (2026-09-25): the moment "mine means only the people named" took effect, and the
  -- repair that went with it (custom._share_tails_mine_repair).
  c_mine_rule_from constant timestamptz := '2026-09-25 15:04:50.358246+00'::timestamptz;
  v_rep_vis   text;
  v_rep_at    timestamptz;
  v_personal_then boolean := false;
begin
  -- THE WALL, then the authority. Reading who ELSE could see something is an audit question.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.visibility_as_of');
  if not (custom.query_is_store_owner()
          or (v_me is not null and public.is_org_admin_for(v_me, p_organization_id))) then
    raise exception 'Only an owner or admin of this organization can ask who could see a record.'
      using errcode = '42501',
            hint = 'VIS-16 / VIS-N-3: "who could see this on that day" is an audit question about other people. A member can ask what THEY can see (custom.query_can_see); this door answers about everybody.';
  end if;

  if p_at is null then
    raise exception 'Asking who could see a record needs a moment to ask about.'
      using errcode = '22023', hint = 'Pass a timestamp, for example custom.visibility_as_of(org, record, ''2026-09-19 12:00Z'').';
  end if;

  -- BEFORE HISTORY BEGINS, IT REFUSES. Answering from the live tables would report today's
  -- grants as that day's, which is the one wrong answer this door must never give.
  select w.opened_at into v_from_rec from history.capture_window w where w.entity_type = 'custom.record';
  select w.opened_at into v_from_grn from history.capture_window w where w.entity_type = 'iam.permissions';
  v_from := greatest(coalesce(v_from_rec, 'infinity'::timestamptz), coalesce(v_from_grn, 'infinity'::timestamptz));
  if v_from is null or p_at < v_from then
    raise exception 'History for this store starts at %, so who could see a record on % cannot be answered.',
      coalesce(to_char(v_from, 'YYYY-MM-DD HH24:MI TZ'), 'no date at all — no capture window is open'),
      to_char(p_at, 'YYYY-MM-DD HH24:MI TZ')
      using errcode = '22023',
            hint = 'VIS-16: the answer is replayed from history.row_versions, never read from the live tables. Reading the live tables for an older date would report today''s grants as that day''s, which is worse than no answer. Ask about a moment at or after the date above.';
  end if;

  select s.state, s.replayed into v_state, v_replayed
    from custom.record_state_as_of(p_record_id, p_at) s;
  if v_state is null or (v_state ->> 'organization_id')::uuid is distinct from p_organization_id then
    raise exception 'There was no record % in this organization at %.',
      p_record_id, to_char(p_at, 'YYYY-MM-DD HH24:MI TZ')
      using errcode = '02000',
            hint = 'It had not been created yet, it belonged to another organization then, or it never existed.';
  end if;
  v_vis := v_state ->> 'visibility';
  v_table_id := nullif(v_state ->> 'table_id', '')::uuid;
  v_born := nullif(v_state ->> 'created_at', '')::timestamptz;

  -- 🚨 SHARE-TAILS — REPLAY KNOWS THE REPAIR. Three records on the explicit "mine" lane were still
  -- `internal` until the repair moved them to `personal`. When their state is replayed from
  -- history the visibility of the moment is already right; when it is NOT (no capture that far
  -- back, so custom.record_state_as_of fell back to TODAY's row), today's `personal` would be
  -- reported for a moment when every member could in fact read it. The repair table says what it
  -- was, and a note row says why.
  select k.visibility_before::text, k.repaired_at into v_rep_vis, v_rep_at
    from custom._share_tails_mine_repair k where k.record_id = p_record_id;
  if v_rep_at is not null and p_at < v_rep_at then
    if not coalesce(v_replayed, false) then
      v_vis := v_rep_vis;
    end if;
    principal_kind := 'note';
    principal_id   := null;
    level          := null;
    through_kind   := 'repair';
    through_id     := p_record_id;
    reason         := format('At that moment its owner had chosen "Only people I share it with", but the store still left it readable by every member of the organization (its visibility said %s). That mismatch was repaired at %s. The rows below are what really held at that moment.',
                             v_rep_vis, to_char(v_rep_at, 'YYYY-MM-DD HH24:MI TZ'));
    replayed       := true;
    held_from      := null;
    held_to        := v_rep_at;
    return next;
  end if;
  -- From the moment the rule took effect, a personal record is carried by no container
  -- (custom.reaches_directly, SHARE-TAILS); before it, the ladder of that day carried it.
  v_personal_then := p_at >= c_mine_rule_from
                     and coalesce(nullif(v_vis, ''), 'internal')::platform.visibility < 'internal'::platform.visibility;

  -- ARM 1 — THE OWNER, as the record recorded them then (VIS-25). Their reach began when the
  -- record did and no grant row ever ended it, which is what an open interval says.
  if nullif(v_state ->> 'created_by', '') is not null then
    principal_kind := 'user';
    principal_id   := (v_state ->> 'created_by')::uuid;
    level          := iam.top_content_level();
    through_kind   := 'ownership';
    through_id     := p_record_id;
    reason         := 'They created this record, which is the top rung of the ladder and needs no grant row.';
    replayed       := v_replayed;
    held_from      := v_born;
    held_to        := null;
    return next;
  end if;

  -- THE WALK UP, REPLAYED. Containment parents and carrying relations as they stood then.
  v_nodes := array[p_record_id]; v_flags := array[v_replayed];
  v_frontier := array[p_record_id];
  while coalesce(array_length(v_frontier, 1), 0) > 0 and v_depth < c_max_depth loop
    v_depth := v_depth + 1;
    v_next := '{}';
    foreach v_id in array v_frontier loop
      select s.state, s.replayed into v_state, v_replayed
        from custom.record_state_as_of(v_id, p_at) s;
      continue when v_state is null;

      v_parent := custom.containment_parent(v_state -> 'data');
      if v_parent is not null and not (v_nodes @> array[v_parent]) then
        v_next := v_next || v_parent; v_nodes := v_nodes || v_parent; v_flags := v_flags || v_replayed;
      end if;

      for r in
        select distinct (x.state -> 'data' ->> 'from')::uuid as container
          from custom.record c
          cross join lateral custom.record_state_as_of(c.id, p_at) x
         where c.organization_id = p_organization_id
           and c.data_class = 'relation'
           and x.state is not null
           and x.state ->> 'data_class' = 'relation'
           and coalesce((x.state -> 'data' ->> 'carrying')::boolean, false)
           and coalesce(x.state -> 'data' ->> 'kind', 'referenced') <> 'owned'
           and nullif(x.state -> 'data' ->> 'to', '') = v_id::text
           and nullif(x.state ->> 'deleted_at', '') is null
      loop
        if r.container is not null and not (v_nodes @> array[r.container]) then
          v_next := v_next || r.container; v_nodes := v_nodes || r.container; v_flags := v_flags || true;
        end if;
      end loop;
    end loop;
    if coalesce(array_length(v_nodes, 1), 0) > c_max_nodes then
      v_capped := true;
      exit;
    end if;
    v_frontier := v_next;
  end loop;
  if v_depth >= c_max_depth and coalesce(array_length(v_frontier, 1), 0) > 0 then
    v_capped := true;
  end if;

  if v_capped then
    principal_kind := 'ceiling';
    principal_id   := null;
    level          := null;
    through_kind   := 'walk';
    through_id     := p_record_id;
    reason         := format('The replayed walk up from this record hit its ceiling (%s hops or %s containers), so the answer below may be SHORT: a grant on a container further up would not be listed. It is reported rather than hidden.',
                             c_max_depth, c_max_nodes);
    replayed       := true;
    held_from      := null;
    held_to        := null;
    return next;
  end if;

  -- ARM 2 — THE GRANTS, replayed on the record and on every container it was inside then,
  -- EACH WITH THE INTERVAL IT WAS HELD. `held_from` is when the version in force at p_at was
  -- written; `held_to` is the first later version that ENDS it — a DELETE, a status that is
  -- no longer active, or the grant's own expiry, whichever comes first. Null means the grant
  -- was still held, as far as history knows.
  return query
    with live as (
      select distinct on (h.row_id) h.row_id, h.row_data, h.operation, h.occurred_at
        from history.row_versions h
       where h.entity_type = 'iam.permissions'
         and h.occurred_at <= p_at
       order by h.row_id, h.occurred_at desc, h.id desc
    ), held as (
      select l.row_id, l.row_data as g, l.occurred_at as since
        from live l
       where l.operation <> 'DELETE'
         and coalesce(l.row_data ->> 'status', 'active') = 'active'
         and (nullif(l.row_data ->> 'expires_at', '') is null
              or (l.row_data ->> 'expires_at')::timestamptz > p_at)
         and l.row_data ->> 'resource_type' = 'record'
         and (l.row_data ->> 'resource_id')::uuid = any (v_nodes)
         and (not v_personal_then or (l.row_data ->> 'resource_id')::uuid = p_record_id)
    ), ended as (
      select h.row_id,
             (select min(n.occurred_at)
                from history.row_versions n
               where n.entity_type = 'iam.permissions'
                 and n.row_id = h.row_id
                 and n.occurred_at > p_at
                 and (n.operation = 'DELETE'
                      or coalesce(n.row_data ->> 'status', 'active') <> 'active'
                      or nullif(n.row_data ->> 'deleted_at', '') is not null)) as gone_at
        from held h
    )
    select case when nullif(h.g ->> 'granted_to_user_id', '') is not null then 'user'
                when nullif(h.g ->> 'granted_to_organization_id', '') is not null then 'organization'
                else 'everyone' end,
           coalesce(nullif(h.g ->> 'granted_to_user_id', '')::uuid,
                    nullif(h.g ->> 'granted_to_organization_id', '')::uuid),
           (h.g ->> 'permission_level')::public.permission_level,
           case when (h.g ->> 'resource_id')::uuid = p_record_id then 'grant' else 'container' end,
           (h.g ->> 'resource_id')::uuid,
           case when (h.g ->> 'resource_id')::uuid = p_record_id
                then 'A grant held directly on this record at that moment.'
                else 'A grant held at that moment on a container this record was inside, which carried down to it. What each edge conveys (custom.carrying_rule.conveys_max) is a live registry with no history, so the level shown is the grant''s own and VIS-3''s minimum-along-the-path is not applied here.' end,
           true,
           h.since,
           least(e.gone_at, nullif(h.g ->> 'expires_at', '')::timestamptz)
      from held h
      left join ended e on e.row_id = h.row_id;

  -- ARM 3 — MEMBERSHIP, as the organization stood then, and only where the record's own
  -- visibility admitted the organization lane at all (DD-136). The interval is the membership
  -- row's own: when the version in force at p_at was written, and the first later version that
  -- removed, soft-deleted or deactivated it.
  if coalesce(nullif(v_vis, ''), 'internal')::platform.visibility >= 'internal'::platform.visibility then
    select l.lane_open, l.replayed into v_lane_open, v_lane_replayed
      from iam.member_lane_open_as_of(p_organization_id, p_at) l;
    select d.level, d.replayed into v_member_default, v_level_replayed
      from iam.member_default_level_as_of(p_organization_id, v_table_id, p_at) d;
    return query
      with live as (
        select distinct on (h.row_id) h.row_id, h.row_data, h.operation, h.occurred_at
          from history.row_versions h
         where h.entity_type = 'membership'
           and h.occurred_at <= p_at
         order by h.row_id, h.occurred_at desc, h.id desc
      ), mem as (
        select l.row_id, l.row_data as m, l.occurred_at as since
          from live l
         where l.operation not in ('DELETE', 'SOFT_DELETE')
           and nullif(l.row_data ->> 'deleted_at', '') is null
           and coalesce(l.row_data ->> 'status', 'active') = 'active'
           and l.row_data ->> 'container_type' = 'organization'
           and (l.row_data ->> 'container_id')::uuid = p_organization_id
      ), ended as (
        select m.row_id,
               (select min(n.occurred_at)
                  from history.row_versions n
                 where n.entity_type = 'membership'
                   and n.row_id = m.row_id
                   and n.occurred_at > p_at
                   and (n.operation in ('DELETE', 'SOFT_DELETE')
                        or nullif(n.row_data ->> 'deleted_at', '') is not null
                        or coalesce(n.row_data ->> 'status', 'active') <> 'active')) as gone_at
          from mem m
      )
      select 'user',
             (m.m ->> 'user_id')::uuid,
             case when m.m ->> 'role' in ('owner', 'admin') then iam.top_content_level()
                  else v_member_default end,
             'organization',
             p_organization_id,
             case when m.m ->> 'role' in ('owner', 'admin')
                  then format('They were an %s of this organization at that moment, which reaches every record the organization can see.', m.m ->> 'role')
                  when not v_lane_open and coalesce(v_lane_replayed, false)
                  then 'They were a member of this organization at that moment, and this organization said then that membership alone shows nothing (its "What members can see by default" setting, replayed from the settings history as it stood that day).'
                  when not v_lane_open
                  then 'They were a member of this organization at that moment. This organization NOW says membership alone shows nothing (its "What members can see by default" setting), and the settings history does not reach back that far — so this is today''s answer applied to that day, not a replay.'
                  when coalesce(v_level_replayed, false)
                  then 'They were a member of this organization at that moment, and membership alone reached this record. What membership conferred is replayed from the settings as they stood that day.'
                  else 'They were a member of this organization at that moment, and membership alone reached this record. The settings history does not reach back that far, so the level shown is today''s, applied to that day.' end,
             case when m.m ->> 'role' in ('owner', 'admin') then true
                  else coalesce(v_level_replayed, false) end,
             greatest(m.since, v_born),
             e.gone_at
        from mem m
        left join ended e on e.row_id = m.row_id
       where m.m ->> 'role' in ('owner', 'admin')
          or (v_lane_open and v_member_default is not null);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.whole_value_complete(p_organization_id uuid, p_record_id uuid, p_field_key text, p_file_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_p           custom.whole_value_parked%rowtype;
  v_file        record;
  v_file_record uuid;
  v_current     jsonb;
  v_source      jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.whole_value_complete');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.whole_value_complete');

  if p_organization_id is null or p_record_id is null or p_file_id is null
     or nullif(btrim(coalesce(p_field_key, '')), '') is null then
    raise exception 'custom.whole_value_complete needs the organization, the record, the field and the file.'
      using errcode = '22004';
  end if;

  select * into v_p
    from custom.whole_value_parked
   where organization_id = p_organization_id and record_id = p_record_id and field_key = p_field_key
   for update;
  if v_p.id is null then
    raise exception 'Nothing of % on this record is waiting for its file, so there is nothing to complete.', p_field_key
      using errcode = 'P0002',
            hint = 'The whole text may already be in its file (the follower completes a browser''s write within seconds). Read the record again.';
  end if;

  select f.id, f.organization_id, f.created_by, f.checksum, f.deleted_at
    into v_file
    from files.files f
   where f.id = p_file_id;
  if v_file.id is null or v_file.deleted_at is not null then
    raise exception 'The file % is not there, so the whole text of % has nowhere to live. Nothing was changed.', p_file_id, p_field_key
      using errcode = '23503';
  end if;
  if v_file.organization_id is distinct from p_organization_id then
    raise exception 'The file % belongs to another organization, so % of this record may not point at it. Nothing was changed.', p_file_id, p_field_key
      using errcode = '42501';
  end if;
  if v_file.checksum is distinct from v_p.sha256 then
    raise exception 'The file % does not hold the text that was saved in % (its SHA-256 differs), so the cell was not pointed at it. Nothing was changed.', p_file_id, p_field_key
      using errcode = '23514';
  end if;
  if v_p.owner_id is not null and v_file.created_by is distinct from v_p.owner_id then
    raise exception 'The file % is not owned by the person who owns this record, so % may not point at it. Nothing was changed.', p_file_id, p_field_key
      using errcode = '42501';
  end if;

  v_current := (select r.data from custom.record r
                 where r.organization_id = p_organization_id and r.id = p_record_id);
  if v_current is null
     or v_current -> '_values' -> p_field_key ->> 'src' is distinct from v_p.pointer
     or v_current -> '_sources' -> v_p.pointer ->> 'sha256' is distinct from v_p.sha256 then
    raise exception 'The cell % of this record no longer points at the text that is waiting, so its file was not attached. Nothing was changed.', p_field_key
      using errcode = '40001';
  end if;

  v_file_record := custom.relation_kernel_record(p_organization_id, custom.file_kernel_id(), p_file_id);
  if v_file_record is null then
    raise exception 'The file % could not be given a File record in this organization. Nothing was changed.', p_file_id
      using errcode = '23503';
  end if;
  update custom.record
     set created_by = coalesce(created_by, v_p.owner_id),
         visibility = coalesce(v_p.record_visibility, visibility)
   where organization_id = p_organization_id and id = v_file_record
     and ((created_by is null and v_p.owner_id is not null)
          or (v_p.record_visibility is not null and visibility is distinct from v_p.record_visibility));

  v_source := ((v_current -> '_sources' -> v_p.pointer) - 'pending')
              || jsonb_build_object('file_id', p_file_id, 'file_record', v_file_record);
  update custom.record
     set data = jsonb_set(data, array['_sources', v_p.pointer], v_source) || '{"_actor": "system"}'::jsonb
   where organization_id = p_organization_id and id = p_record_id;

  perform set_config('app.actor_system', 'matrx_records.big_values', true);
  insert into platform.associations
         (source_type, source_id, target_type, target_id, organization_id, role, label,
          metadata, created_by, origin, updated_by_tier)
  values ('record', p_record_id, 'record', v_file_record, p_organization_id, 'references', p_field_key,
          jsonb_build_object('whole_value_of', p_field_key, 'version', v_p.value_version), v_p.owner_id,
          'matrx_records.big_values', 'code')
  on conflict (source_type, source_id, target_type, target_id, role) do nothing;

  delete from custom.whole_value_parked where id = v_p.id;
  return v_source || jsonb_build_object('pointer', v_p.pointer, 'version', v_p.value_version, 'key', p_field_key);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.work_approval_decide(p_organization_id uuid, p_approval_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me      uuid := custom.query_principal();
  v_row     custom.record;
  v_change  jsonb;
  v_kind    text;
  v_subject uuid;
  v_outcome text;
  v_key     text;
  v_fields  jsonb;
  v_spec    jsonb;
  v_field   uuid;
  v_version integer;
  v_written uuid[] := '{}';
  v_one     uuid;
  v_doc     jsonb;
  v_table   uuid;
  v_conv    uuid;
  v_at      timestamptz;
  v_why     text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_approval_decide');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_approval_decide');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_approval_id
     and r.data_class = 'work_approval' and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such approval in this organization.' using errcode = '02000';
  end if;
  -- LANE S5-PRIME: A WITHDRAWN APPROVAL SAYS WHY. Nobody decided it; the store closed it when the
  -- thing it would change was archived, and the reason is on the approval itself.
  if v_row.data ->> 'state' = 'withdrawn' then
    raise exception 'That was withdrawn on %. %', left(coalesce(v_row.data ->> 'decided_at', 'an earlier day'), 10),
                    coalesce(v_row.data ->> 'withdrawn_reason', '')
      using errcode = '23505',
            hint = 'A withdrawn approval is closed. Bring the record back from the archive and ask again if the change still needs making.';
  end if;
  if coalesce(v_row.data ->> 'state', 'pending') <> 'pending' then
    raise exception 'That was already %, on %.', v_row.data ->> 'state',
                    coalesce(v_row.data ->> 'decided_at', 'an earlier day')
      using errcode = '23505',
            hint = 'An approval is decided once. Ask for the change again if it still needs making.';
  end if;

  if not custom.work_approval_may_decide(p_organization_id, p_approval_id) then
    raise exception 'You are not one of the people who can approve this.'
      using errcode = '42501',
            hint = 'AGT-4: an approval is decided by the person it was addressed to, by anybody with admin on the thing being changed, or by an owner or admin of this organization. Ask one of them.';
  end if;
  -- THE SECOND PAIR OF EYES IS FOR A PERSON'S REQUEST. An agent's call runs as the person it
  -- is working for, so `requested_by` on an agent request names THAT person — the very one
  -- `ask` exists to consult. Holding the bar there would have made every agent wait
  -- undecidable by the only person looking at it. It still holds for `origin = 'person'`.
  if v_me is not null and nullif(v_row.data ->> 'requested_by', '')::uuid = v_me
     and coalesce(v_row.data ->> 'origin', 'person') <> 'agent'
     and not custom.query_is_store_owner() then
    raise exception 'You asked for this change, so somebody else approves it.'
      using errcode = '42501',
            hint = 'The point of asking is that a second person says yes. If nobody else needs to, make the change directly instead.';
  end if;

  -- LANE S5-PRIME: NOTHING IS DECIDED ABOUT AN ARCHIVED THING. Archiving withdraws the
  -- approvals waiting on it (custom._work_approvals_withdraw_on_archive); this is the door's own
  -- refusal for any that reach it anyway, in the store's words, before anything is applied.
  v_why := custom.work_approval_withdrawal(p_organization_id, v_row.data);
  if v_why is not null then
    raise exception '%', v_why
      using errcode = '55000',
            hint = 'Nothing was changed. Bring it back from the archive first; then ask for the change again.';
  end if;

  v_subject := nullif(v_row.data ->> 'subject_id', '')::uuid;
  v_change  := v_row.data -> 'change';
  v_kind    := lower(coalesce(v_change ->> 'kind', ''));
  v_conv    := nullif(v_row.data ->> 'conversation_id', '')::uuid;

  if p_approve then
    if v_kind = 'record_patch' then
      -- STAGE-RULES: THE GATE THAT ASKED FOR THIS APPROVAL STEPS ASIDE FOR THIS ONE WRITE.
      -- A stage gate whose on_fail is `require_approval` refuses the write by raising, which
      -- is HOW this change got into the queue at all. Applying the yes has to get past the
      -- same gate, and it gets past it by NAMING THE RECORD it is applying an approved
      -- change to, for the length of that one statement and no longer. Every plain refusal,
      -- every other validator and the whole value envelope still run, so an approver is
      -- never told yes over a write the store itself would refuse.
      perform set_config('custom.applying_approval_for', v_subject::text, true);
      v_version := custom.record_update(p_organization_id, v_subject, v_change -> 'patch', null);
      perform set_config('custom.applying_approval_for', '', true);
      v_outcome := format('Applied. %s is now at version %s.',
                          coalesce(v_row.data ->> 'subject_title', 'That record'), v_version);
    elsif v_kind = 'record_add' then
      -- THE SAME DOOR THE UNATTENDED PATH USES, once per row, in THIS transaction. Every
      -- guard, every validator and the value envelope run per row exactly as they would for
      -- an agent that was never asked; the difference is whose name is on the history row.
      -- One refused row rolls the whole decision back, which is what a person means by
      -- saying yes to a batch.
      for v_doc in select value from jsonb_array_elements(v_change -> 'rows')
      loop
        v_one := custom.record_write(p_organization_id, v_subject, v_doc);
        v_written := v_written || v_one;
      end loop;
      v_outcome := format('Applied. %s %s now in %s.',
                          cardinality(v_written),
                          case when cardinality(v_written) = 1 then 'record is' else 'records are' end,
                          coalesce(v_row.data ->> 'subject_title', 'that table'));
    elsif v_kind = 'record_delete' then
      -- THE STORE'S OWN DELETE, AS THE APPROVER, IN THIS TRANSACTION. custom.record_delete
      -- runs custom.delete_rule first, so a record something still reads is refused here in
      -- the store's own words and the decision rolls back — an approver is never told yes
      -- over a delete the store would have refused.
      v_at := custom.record_delete(p_organization_id, v_subject);
      v_outcome := format('Removed. %s was deleted on %s and can be put back.',
                          coalesce(v_row.data ->> 'subject_title', 'That record'),
                          to_char(v_at at time zone 'utc', 'YYYY-MM-DD HH24:MI'));
    elsif v_kind = 'record_restore' then
      perform custom.record_restore(p_organization_id, v_subject);
      v_outcome := format('Put back. %s is here again.',
                          coalesce(v_row.data ->> 'subject_title', 'That record'));
    elsif v_kind = 'table_add' then
      -- EXACTLY WHAT THE DIRECT PATH RUNS, IN EXACTLY THAT ORDER: custom.table_declare with
      -- the spec that was shown, then custom.field_declare once per column. Not a re-derived
      -- spec and not a second way of making a table — the same two doors, so an approved
      -- table and an unasked one are the same bytes.
      v_table := custom.table_declare(p_organization_id, v_change -> 'table');
      for v_doc in select value from jsonb_array_elements(coalesce(v_change -> 'fields', '[]'::jsonb))
      loop
        v_field := custom.field_declare(p_organization_id, v_table, v_doc);
      end loop;
      -- THE CONVERSATION'S CLAIM TRAVELS WITH THE APPROVAL. A table a person said yes to is
      -- still the table this conversation made, so the agent's next change to it is not a
      -- change to somebody's pre-existing table.
      if v_conv is not null then
        perform custom.agent_table_claim(p_organization_id, v_table, v_conv);
      end if;
      v_field := null;
      v_outcome := format('Created. %s is now a table in %s, with %s column%s.',
                          coalesce(nullif(v_change #>> '{table,name}', ''), 'That table'),
                          coalesce(v_row.data ->> 'subject_title', 'this organization'),
                          jsonb_array_length(coalesce(v_change -> 'fields', '[]'::jsonb)),
                          case when jsonb_array_length(coalesce(v_change -> 'fields', '[]'::jsonb)) = 1
                               then '' else 's' end);
    elsif v_kind = 'doc_template_add' then
      -- THE SAME DOOR THE UNASKED PATH USES, with the bytes that were shown on the card.
      -- `custom.doc_template_save` re-runs every one of its own refusals here, as the
      -- approver — including the one that names a token pointing at no column — so an
      -- approved template and one written directly are the same template.
      v_written := array[custom.doc_template_save(
                           p_organization_id, v_subject,
                           v_change #>> '{template,name}',
                           coalesce(v_change #>> '{template,body}', ''),
                           nullif(v_change #>> '{template,template_id}', '')::uuid)];
      v_outcome := format('Saved. %s is now a document template on %s.',
                          coalesce(nullif(v_change #>> '{template,name}', ''), 'That template'),
                          coalesce(v_row.data ->> 'subject_title', 'that table'));
    else
      v_spec := v_change -> 'field';
      v_key  := coalesce(nullif(v_spec ->> 'key', ''), nullif(v_spec ->> 'name', ''));
      if v_key is null then
        raise exception 'That column has no name, so it cannot be added.' using errcode = '22004';
      end if;
      -- ── FIELD-TRUTH 2026-09-21: THE NAME AND THE DEFINITION GO ON TOGETHER. ─────────
      -- This used to write the NAME into the table's `fields` list in one statement and
      -- then define the column in the next. Between those two statements the table claimed
      -- a column that no Field record backed — a name with no type, no rules and no
      -- validation, which `custom.applicable_fields` never answers with and no grid can
      -- draw. `custom.assert_columns_are_defined` refuses exactly that shape now, and it
      -- refused this door: *"Estimates says it has a column called "rate_card", and there
      -- is no such field"* when an agent's Rate card proposal was approved.
      -- The pre-add was also REDUNDANT: `custom.field_declare` appends the name to the
      -- table's list itself, in the same call that writes the definition, which is the
      -- whole point of there being one door for a column.
      v_field := custom.field_declare(p_organization_id, v_subject,
                   v_spec || jsonb_build_object('key', v_key));
      v_outcome := format('%s is now a column on %s.',
                          coalesce(nullif(v_spec ->> 'label', ''), v_key),
                          coalesce(v_row.data ->> 'subject_title', 'that table'));
    end if;
  else
    v_outcome := case
                   when v_kind = 'field_add'
                     then format('The column %s was not added.',
                                 coalesce(nullif(v_change #>> '{field,label}', ''),
                                          nullif(v_change #>> '{field,key}', ''), 'asked for'))
                   when v_kind = 'record_add'
                     then format('%s %s not written to %s.',
                                 jsonb_array_length(coalesce(v_change -> 'rows', '[]'::jsonb)),
                                 case when jsonb_array_length(coalesce(v_change -> 'rows', '[]'::jsonb)) = 1
                                      then 'record was' else 'records were' end,
                                 coalesce(v_row.data ->> 'subject_title', 'that table'))
                   when v_kind = 'record_delete'
                     then format('%s was not deleted, and is still here.',
                                 coalesce(v_row.data ->> 'subject_title', 'That record'))
                   when v_kind = 'record_restore'
                     then format('%s was not put back, and is still deleted.',
                                 coalesce(v_row.data ->> 'subject_title', 'That record'))
                   when v_kind = 'table_add'
                     then format('The table %s was not created.',
                                 coalesce(nullif(v_change #>> '{table,name}', ''), 'asked for'))
                   when v_kind = 'doc_template_add'
                     then format('The document template %s was not saved.',
                                 coalesce(nullif(v_change #>> '{template,name}', ''), 'asked for'))
                   else format('%s was left as it was.',
                               coalesce(v_row.data ->> 'subject_title', 'That record')) end;
  end if;

  update custom.record r
     set data = r.data || jsonb_strip_nulls(jsonb_build_object(
           'state',         case when p_approve then 'approved' else 'declined' end,
           'decided_by',    v_me::text,
           'decided_at',    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'decision_note', nullif(btrim(coalesce(p_note, '')), ''),
           'applied_field_id', v_field::text,
           'applied_table_id', v_table::text,
           'applied_record_ids', case when cardinality(v_written) > 0
                                      then to_jsonb(v_written) end,
           'outcome',       v_outcome))
   where r.organization_id = p_organization_id and r.id = p_approval_id;

  return jsonb_build_object(
    'approval_id', p_approval_id,
    'state',       case when p_approve then 'approved' else 'declined' end,
    'subject_id',  v_subject,
    'applied',     coalesce(p_approve, false),
    'field_id',    v_field,
    'table_id',    v_table,
    'record_ids',  case when cardinality(v_written) > 0 then to_jsonb(v_written) end,
    'version',     v_version,
    'message',     v_outcome);
end
$function$;

CREATE OR REPLACE FUNCTION custom.work_approval_read(p_organization_id uuid, p_approval_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row custom.record;
  v_who jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_approval_read');
  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_approval_id
     and r.data_class = 'work_approval' and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such approval in this organization.' using errcode = '02000';
  end if;
  if not custom.work_approval_may_decide(p_organization_id, p_approval_id)
     and nullif(v_row.data ->> 'requested_by', '')::uuid is distinct from custom.query_principal() then
    raise exception 'That approval was not addressed to you and you did not ask for it, so there is nothing to show you.'
      using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', a.name, 'why', a.why)), '[]'::jsonb)
    into v_who
    from custom.work_approval_approvers(p_organization_id,
           nullif(v_row.data ->> 'subject_id', '')::uuid,
           nullif(v_row.data ->> 'approver_id', '')::uuid) a;
  return v_row.data
         || jsonb_build_object('approval_id', p_approval_id,
                               'approvers', v_who,
                               'may_decide', custom.work_approval_may_decide(p_organization_id, p_approval_id));
end
$function$;
