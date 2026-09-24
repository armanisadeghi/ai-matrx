-- chair-step: this REPLACES the bodies of 53 live functions in schema seo, changing ONE kind of statement and nothing else: every `raise exception … using errcode = 'P0002'` (67 of them) becomes `perform platform.refuse_not_found(<the same sentence>, <the same hint>, <the same detail>)`, and 3 functions that catch a caught error's sentence read it through platform.refusal_message. Called directly (the server, every suite, every other function) the refusal is byte-for-byte what it was: SQLSTATE P0002, same message, hint and detail. Called through PostgREST it answers HTTP 404 with error code P0002 instead of HTTP 500. No table, column, policy, trigger or grant is touched; the only rows written are 9 platform.client_callable_door declarations for SECURITY DEFINER bodies that had none (provision_shape_guard refuses a replaced definer without one), each declared as the non-client function it already is. Needs errorshonest_s1_one_way_to_say_not_found.sql first. Inverse: migrations/inverse/errorshonest_s3_the_seo_doors_say_not_found_down.sql restores every body verbatim.
-- lane: ERRORS-HONEST
-- based-on: seo._tm_knob_int(text, uuid, uuid, uuid, jsonb) c64131ca21488c1fdb5373dbdcc12d9fe84e8cf36405fb6dd4192a38836073fd
-- based-on: seo._tm_map(uuid, permission_level) a6125388f66874c906fa7f14a4f479448ce295c0046e6cf60764bc836f3b4011
-- based-on: seo._tm_reject_topics(uuid, uuid[], text) 062bde8da7f131ec5349b800433571cb4b833c0618ef901914a73031c7bbf5d8
-- based-on: seo._tm_remove_topics(uuid, uuid[], text, boolean) f1db19b8d6b0acf305fe79b010ff1c50207611908aac85b5a9d4605b8d75419d
-- based-on: seo._tm_site(uuid, permission_level, text) ef95be6a35401767f0862911cb3b1f733c30cd3b5c7e0a887c796f18b89e36d5
-- based-on: seo.create_map_facet_values(uuid, text, jsonb) dddf575b40aee2950be07f44b60434c43054a9768927c09ef6a2040d4937acf2
-- based-on: seo.dimension_matcher_upsert(uuid, uuid, text, text, uuid, uuid, uuid, text, text, boolean) da32646587408bfac7bd566c81dfee3b5f03179b6ffe4818c1735409ae4e29d4
-- based-on: seo.fn_autonomy_gate(uuid, text) 68a7f20f14f0321bf84884c6edf058365b57c76346a0e32bda82e4947f3784c8
-- based-on: seo.fn_ingest_keyword_research(jsonb, text, uuid, uuid) 3449d4cec78ab7b9ad9ac136b002548420fcf9159f5356c25b9e6dd956db1436
-- based-on: seo.fn_site_offering_for_topic(uuid, uuid) ec14937b2ef1c90c5828bb602de833794840dd2c0a28ae64bb395a7d85162519
-- based-on: seo.gsc_assert_site_editor(uuid) 08878ece94abd45a0cc5f6b6efd0559944b00b2e61918cbc7315753d0a0d37bc
-- based-on: seo.gsc_set_keyword_topic(uuid, uuid[], uuid, text) 2c0511be332267e580f13d5137d604d91d0a2486cd24282def4b57aa3987c026
-- based-on: seo.gsc_set_site_kw_guidelines(uuid, text) 5cfdbc97fa59d3833117611ed7d506ce89df80149381d8286a0fd86aefd5129a
-- based-on: seo.gsc_set_topic_value(uuid, uuid, numeric, text, text, text, boolean) 5f7f2585792d2c77f55970ea17d555b76703e2d36f1bbfcfc0329e8d4d7a559a
-- based-on: seo.gsc_topic_delete_impact(uuid, uuid) aeace308f965dfa98447e48a421d33494753522cb5cc6b2e52f86d6d97021152
-- based-on: seo.gsc_topic_delete(uuid, uuid, uuid) 9147cab104658f836c43925820537abddfb19fc0855c1ed5adbb9e9e02753ff5
-- based-on: seo.gsc_topic_placement_diff(uuid, integer) c7cc6bed188490335f882dc5e06096addbb3cbdede0603bde359605cacd159a4
-- based-on: seo.gsc_topic_save(uuid, uuid, text, text, text, uuid) dd90c07f21a456b1af0bcc452db4577998555e97e1c8c3e91d53bc555045ffee
-- based-on: seo.gsc_topic_set_parent(uuid, uuid, uuid) 86670b96242c018bb0ae6220446542d09a6abe3608f9de86647e042d05a0d67c
-- based-on: seo.keyword_meaning_suggest(uuid, jsonb, text, text, text, real, jsonb, jsonb) 6658220fee30aab91dc7b3ebac1ae07b6d059082338890b04e3af1d1b0393707
-- based-on: seo.keyword_placement_resolve(uuid, uuid[]) fec7aad6466c9b032dd878cf5fcdc5626c410f6dfe497ce2048ec89854d9331d
-- based-on: seo.list_page_intents(uuid, uuid, text, text, text, integer, integer) d3d9ffa52a4c9e5a34ca65631e0e352d9eaf3196ab29ad5d2cfe6d66588de605
-- based-on: seo.list_pages_without_topic(uuid, integer, integer) ab59f3a035e01ff053321e53bd1de5ccf6e1c6593b46ebaca2c066b9f59767c0
-- based-on: seo.map_outline(uuid, text, uuid, jsonb) 1d7ab3d1d12f3fb942c4e656543614152a66236e2dde5eade13a503b8d0968b8
-- based-on: seo.map_topic_associations(uuid, text, text[]) ef5f85785d30b57617ae6dca895cb14026deaf5bdd0ec104293d05e1e9932aa3
-- based-on: seo.map_topic_facets(uuid, text) f3c03fce6088c8a626cbdaa92edc2fd1613c6327253f38f62f1067ac1aae59cd
-- based-on: seo.map_tree(uuid, text, integer, text[], uuid) d2aed041e1046ebefb752fb4460e1dcb8d9d569e5b75008344d68ec23104ffc6
-- based-on: seo.merge_map_topics(uuid, text[], text) af83c7fe22e9804a10894a6abe4cfe538aa1a46c20235f3730807e345bc50ca7
-- based-on: seo.move_map_topic(uuid, text, text) d0a8e7e414a0091a8e9b9068fe51074b1a3931530d3dbbf4bfd0c357fdc83d10
-- based-on: seo.propose_site_offering_from_template(uuid, uuid, uuid[], numeric, text, text, jsonb) 9fb5d3bbbf92ddf9458ae5f356075aa83322bbf0ea4413135df52242e60a4a68
-- based-on: seo.reject_map_topics(uuid, text[], text) 42a15b72a5b3bc59fc62f25518e89d135d83c8d7ef26403b10144dd57ffe5638
-- based-on: seo.replace_map_section(uuid, text, jsonb, text) 789085cb086f3b02e75a26078b51ddfc1673c8b82341a2f65e5eaab0c2c339b8
-- based-on: seo.retire_map_topics(uuid, text[], text, boolean) cb0dbf1fcfb3da1b43659af614ae74ac3d8cebe0f3062fbf6888ca35b7f998ee
-- based-on: seo.set_ai_autonomy(text, uuid, text, text, integer, boolean) 314b8ffbcfcec2f0541e861a9ffee60e86f93df4f339330d73cc323dbd222216
-- based-on: seo.set_map_topic_facet(uuid, text, text, text, text) a1a7a39d59d8966ad86a206315a33ab53bd27e518c9b877a2c9daf6945ab64e7
-- based-on: seo.set_page_intents(uuid, jsonb, text) 325f99b8a1f0a6e4f5e286d495c0fc259fc90f1aef0f0dacf3f6b13cf32625f8
-- based-on: seo.set_page_map_facet(uuid, text, text, text) a487c6ceab0e8d5f79ba242905c252200a8668eb426624e286ce0343448a02bc
-- based-on: seo.set_page_map_topics(uuid, jsonb, text) 8f4592dfb20269979d755b3d1348e5d2eb5b2e339fa514dd7c0bbe05df6dc509
-- based-on: seo.set_pages_map_topics(uuid, jsonb, text) 2dbce2ee20c3456d1143007c2b8ee31778c58e7bd730f1c6f5a14cd229561868
-- based-on: seo.set_value_settings(text, uuid, numeric, jsonb, text[]) b43cadc6092c6e35aa15bff4fa308b09219631011eb82d3e0aa513a29908ee75
-- based-on: seo.site_keyword_value_copy(uuid, uuid, uuid[], boolean) e1eb73176184477f764b69dab3c80472cbc839acd7720645864f477d4dde6862
-- based-on: seo.site_meaning_copy(uuid, uuid, text[], boolean) 8032fdeec599b32604a8271a534644a73c994c3e8b5b7808d208f8cad1d56c59
-- based-on: seo.site_value_worth_upsert(uuid, uuid, text, numeric, text, text) 03bbe94ce805607fb908123392fc400fbfa2b9d590e9d0cfaaaf214c5f91fe5e
-- based-on: seo.split_map_topic(uuid, text, jsonb) 708fc1a450aa61df9a88cfb73c47e2b1df9fa5cf5050e30b531de48da442ce96
-- based-on: seo.starter_pack_set_status(uuid, text, text) a1ac2a91f365ed54ec387648556cff4cfb0f137f9f0b2351b2f356cfab310d6d
-- based-on: seo.update_backlink_human_ruling(uuid, jsonb) ba2d4bfb0dce6d45bd8fceddf284975dec8a5ba6953ca7ca6ba416d302eeec9e
-- based-on: seo.update_competitor_opportunity_status(uuid, text, text) c534b3cb4b51f69a206ff2ca7be5528c395627e8d3b0ae410ea8a09d9f668e30
-- based-on: seo.update_competitor_tracking(uuid, text, jsonb) 0895ff003579954c2b94fa532bd2781868dc5cb5923b4c80ba746aa8f8906759
-- based-on: seo.update_referring_domain_human_ruling(uuid, jsonb) 6aa9a8cab5b8f566f1b793fe2f9fd570066f7c3afaaec47cd41bb3075f02cef2
-- based-on: seo.upsert_map_topics(uuid, jsonb) 4db503e34a597519aa9e37d9d88a20ddde67fe9e917e6d4d4bb71016c4f1a5ee
-- based-on: seo.withdraw_page_intents(uuid, uuid[], text) 3c2ecb6708bdd2b3cd72784cb1fc49f73abb4781555c0abb31346c8ca689a6a5
-- based-on: seo.write_site_keyword_offering(uuid, uuid, uuid[], uuid, text, text, smallint, jsonb) eb16e6c0cb8c6e84bde2a9d9bbf54aa6095048d52d36c98286abd5be7244bcf8
-- based-on: seo.write_site_offering_value(uuid, uuid, uuid, numeric, text, text, text, boolean, text, text, text, jsonb) 4840cad66b7d538729ca397e27855dc132d3869bd3ebe053b33d26e41b0b6953
--
-- LANE ERRORS-HONEST — A THING THAT IS NOT THERE, OR NOT YOURS, ANSWERS "NOT FOUND", NEVER A SERVER FAULT.
--
-- THE USE CASE. Alex Hart (test@test.com) opens a link a teammate sent her to something she was
-- never given, or that was archived since. The door is right to refuse, and says so with SQLSTATE
-- P0002 — which PostgREST answers as HTTP 500, a server FAULT, so every client page shows the
-- "something broke" screen instead of the honest not-found / no-access one.
--
-- THE CONVENTION (errorshonest_s1_one_way_to_say_not_found.sql): a not-found is raised ONE way,
-- `perform platform.refuse_not_found(message, hint, detail)`. Inside a PostgREST request it raises
-- PostgREST's own error shape (SQLSTATE PGRST: body {code: P0002, message, details, hint},
-- status 404); everywhere else it raises exactly the P0002 it replaces. `pnpm check:not-found-is-honest`
-- fails on any function in the database that still raises P0002 itself.
--
-- Function by function (census 2026-09-24, production, read-only):
--   seo._tm_knob_int(text, uuid, uuid, uuid, jsonb) [not client-granted; reached through a door]: 1 not-found raise
--   seo._tm_map(uuid, permission_level) [not client-granted; reached through a door]: 1 not-found raise
--   seo._tm_reject_topics(uuid, uuid[], text) [not client-granted; reached through a door]: 2 not-found raises
--   seo._tm_remove_topics(uuid, uuid[], text, boolean) [not client-granted; reached through a door]: 2 not-found raises
--   seo._tm_site(uuid, permission_level, text) [not client-granted; reached through a door]: 1 not-found raise
--   seo.create_map_facet_values(uuid, text, jsonb): 3 not-found raises
--   seo.dimension_matcher_upsert(uuid, uuid, text, text, uuid, uuid, uuid, text, text, boolean): 1 not-found raise
--   seo.fn_autonomy_gate(uuid, text) [not client-granted; reached through a door]: 1 not-found raise
--   seo.fn_ingest_keyword_research(jsonb, text, uuid, uuid) [not client-granted; reached through a door]: 1 not-found raise
--   seo.fn_site_offering_for_topic(uuid, uuid) [not client-granted; reached through a door]: 2 not-found raises
--   seo.gsc_assert_site_editor(uuid) [not client-granted; reached through a door]: 1 not-found raise
--   seo.gsc_set_keyword_topic(uuid, uuid[], uuid, text): 1 not-found raise
--   seo.gsc_set_site_kw_guidelines(uuid, text): 1 not-found raise
--   seo.gsc_set_topic_value(uuid, uuid, numeric, text, text, text, boolean): 1 not-found raise
--   seo.gsc_topic_delete_impact(uuid, uuid): 1 not-found raise
--   seo.gsc_topic_delete(uuid, uuid, uuid): 1 not-found raise
--   seo.gsc_topic_placement_diff(uuid, integer): 1 not-found raise
--   seo.gsc_topic_save(uuid, uuid, text, text, text, uuid): 1 not-found raise
--   seo.gsc_topic_set_parent(uuid, uuid, uuid): 2 not-found raises
--   seo.keyword_meaning_suggest(uuid, jsonb, text, text, text, real, jsonb, jsonb): 1 not-found raise
--   seo.keyword_placement_resolve(uuid, uuid[]): 1 not-found raise
--   seo.list_page_intents(uuid, uuid, text, text, text, integer, integer): 1 not-found raise
--   seo.list_pages_without_topic(uuid, integer, integer): 1 not-found raise
--   seo.map_outline(uuid, text, uuid, jsonb): 1 not-found raise
--   seo.map_topic_associations(uuid, text, text[]): 1 not-found raise
--   seo.map_topic_facets(uuid, text): 1 not-found raise
--   seo.map_tree(uuid, text, integer, text[], uuid): 1 not-found raise
--   seo.merge_map_topics(uuid, text[], text): 2 not-found raises
--   seo.move_map_topic(uuid, text, text): 2 not-found raises
--   seo.propose_site_offering_from_template(uuid, uuid, uuid[], numeric, text, text, jsonb) [not client-granted; reached through a door]: 2 not-found raises
--   seo.reject_map_topics(uuid, text[], text): 1 not-found raise
--   seo.replace_map_section(uuid, text, jsonb, text): 1 not-found raise
--   seo.retire_map_topics(uuid, text[], text, boolean): 1 not-found raise
--   seo.set_ai_autonomy(text, uuid, text, text, integer, boolean): 1 not-found raise
--   seo.set_map_topic_facet(uuid, text, text, text, text): 3 not-found raises
--   seo.set_page_intents(uuid, jsonb, text): 2 not-found raises; the caught error's sentence (sqlerrm, 1 place) is read through platform.refusal_message, so a not-found caught inside a PostgREST request carries its sentence, never PostgREST's JSON error body
--   seo.set_page_map_facet(uuid, text, text, text): 3 not-found raises
--   seo.set_page_map_topics(uuid, jsonb, text): 2 not-found raises
--   seo.set_pages_map_topics(uuid, jsonb, text): the caught error's sentence (sqlerrm, 1 place) is read through platform.refusal_message, so a not-found caught inside a PostgREST request carries its sentence, never PostgREST's JSON error body
--   seo.set_value_settings(text, uuid, numeric, jsonb, text[]): 2 not-found raises
--   seo.site_keyword_value_copy(uuid, uuid, uuid[], boolean): 1 not-found raise
--   seo.site_meaning_copy(uuid, uuid, text[], boolean): 1 not-found raise
--   seo.site_value_worth_upsert(uuid, uuid, text, numeric, text, text): 1 not-found raise
--   seo.split_map_topic(uuid, text, jsonb): 1 not-found raise
--   seo.starter_pack_set_status(uuid, text, text): 1 not-found raise
--   seo.update_backlink_human_ruling(uuid, jsonb): 1 not-found raise
--   seo.update_competitor_opportunity_status(uuid, text, text): 1 not-found raise
--   seo.update_competitor_tracking(uuid, text, jsonb): 1 not-found raise
--   seo.update_referring_domain_human_ruling(uuid, jsonb): 1 not-found raise
--   seo.upsert_map_topics(uuid, jsonb): 1 not-found raise
--   seo.withdraw_page_intents(uuid, uuid[], text): the caught error's sentence (sqlerrm, 1 place) is read through platform.refusal_message, so a not-found caught inside a PostgREST request carries its sentence, never PostgREST's JSON error body
--   seo.write_site_keyword_offering(uuid, uuid, uuid[], uuid, text, text, smallint, jsonb) [not client-granted; reached through a door]: 1 not-found raise
--   seo.write_site_offering_value(uuid, uuid, uuid, numeric, text, text, text, boolean, text, text, text, jsonb) [not client-granted; reached through a door]: 1 not-found raise

CREATE OR REPLACE FUNCTION seo._tm_knob_int(p_key text, p_org uuid, p_brand uuid, p_site uuid, p_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v jsonb;
BEGIN
  v := seo._tm_knob(p_key, p_org, p_brand, p_site, p_overrides);
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN
    perform platform.refuse_not_found(format('topical map knob %s resolved to no value (register a default for seo.topical_map/%s)', p_key, p_key));
  END IF;
  RETURN (v #>> '{}')::integer;
END $function$;

CREATE OR REPLACE FUNCTION seo._tm_map(p_map_id uuid, p_level permission_level, OUT organization_id uuid, OUT brand_id uuid)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  -- Every door checks its own p_map_id first and names itself; this is the
  -- backstop, so a future caller that forgets cannot turn NULL into "denied".
  IF p_map_id IS NULL THEN
    RAISE EXCEPTION 'topical_map: p_map_id is required (got NULL)' USING ERRCODE = '22023';
  END IF;
  -- Arman, 2026-09-15: a topical map is a shareable resource. iam.has_access is
  -- THE canonical check for one; bare org membership is not a share.
  IF NOT (public.is_platform_admin()
          OR iam.has_access('seo_topical_map', p_map_id, p_level)) THEN
    RAISE EXCEPTION 'topical_map_denied: no % access to map %', p_level, p_map_id USING ERRCODE = '42501';
  END IF;
  SELECT m.organization_id, m.brand_id INTO organization_id, brand_id
    FROM seo.topical_map m WHERE m.id = p_map_id AND m.deleted_at IS NULL;
  IF organization_id IS NULL THEN
    perform platform.refuse_not_found(format('topical_map %s not found', p_map_id));
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION seo._tm_reject_topics(p_map_id uuid, p_ids uuid[], p_policy text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE r record; v_att jsonb; v_report jsonb := '[]'::jsonb; v_blocking jsonb := '[]'::jsonb;
        v_target uuid; v_target_slug text; v_org uuid; v_policy text;
BEGIN
  SELECT m.organization_id INTO v_org FROM seo.topical_map m WHERE m.id = p_map_id;
  IF v_org IS NULL THEN perform platform.refuse_not_found(format('topical_map %s not found', p_map_id)); END IF;
  v_policy := COALESCE(p_policy, 'error');
  IF v_policy LIKE 'merge_into:%' THEN
    v_target_slug := substr(v_policy, 12);
    -- ROUND 22: `merge_into:<slug>` names where the attachments GO. A hidden
    -- topic is not a destination — it is where they would disappear.
    v_target := seo._tm_live_topic_id(p_map_id, v_target_slug);
    IF v_target IS NULL OR v_target = ANY(p_ids) THEN
      perform platform.refuse_not_found(format('merge_into target %s not found or is itself being rejected', v_target_slug));
    END IF;
  ELSIF v_policy NOT IN ('error','reject','parent') THEN
    RAISE EXCEPTION 'unknown rejection policy %; use error | reject | parent | merge_into:<slug>', v_policy USING ERRCODE='22023';
  END IF;

  FOR r IN SELECT t.id, t.slug, t.parent_id, t.status FROM seo.map_topic t
            WHERE t.id = ANY(p_ids) AND t.map_id = p_map_id AND t.deleted_at IS NULL LOOP
    IF r.status <> 'proposed' THEN
      RAISE EXCEPTION 'only a proposed topic can be rejected; retire an active topic instead (% is %)',
        r.slug, r.status USING ERRCODE='22023';
    END IF;
    v_att := seo._tm_attachments(r.id);
    IF v_att <> '{}'::jsonb THEN
      IF v_policy = 'error' THEN
        v_blocking := v_blocking || jsonb_build_object('slug', r.slug, 'attachments', v_att);
        CONTINUE;
      ELSIF v_policy = 'parent' THEN
        IF r.parent_id IS NULL THEN
          v_blocking := v_blocking || jsonb_build_object('slug', r.slug, 'attachments', v_att,
                          'message', 'root topic has no parent to receive attachments');
          CONTINUE;
        END IF;
        v_target := r.parent_id;
      END IF;
      IF v_policy = 'parent' OR v_policy LIKE 'merge_into:%' THEN
        -- Every statement scoped to this map's organization (round 11's rule).
        -- ROUND 23: when the topic being removed AND the target BOTH hold an edge
        -- from the same row with the same role, only one survives the move. It
        -- used to be the target's, whoever wrote it — so a merge could silently
        -- drop a person's edge and keep a mapper's. The higher source wins; an
        -- equal one leaves the target untouched. The payload MOVES INTACT: no
        -- mover re-stamps `source`.
        UPDATE platform.associations t
           SET payload_kind = f.payload_kind, payload = f.payload
          FROM platform.associations f
         WHERE t.target_type='seo_map_topic' AND t.target_id = v_target AND t.organization_id = v_org
           AND f.target_type='seo_map_topic' AND f.target_id = r.id AND f.organization_id = v_org
           AND f.source_type = t.source_type AND f.source_id = t.source_id
           AND f.role IS NOT DISTINCT FROM t.role
           AND seo._tm_source_rank(f.payload->>'source') > seo._tm_source_rank(t.payload->>'source');
        UPDATE platform.associations t
           SET payload_kind = f.payload_kind, payload = f.payload
          FROM platform.associations f
         WHERE t.source_type='seo_map_topic' AND t.source_id = v_target AND t.organization_id = v_org
           AND f.source_type='seo_map_topic' AND f.source_id = r.id AND f.organization_id = v_org
           AND f.target_type = t.target_type AND f.target_id = t.target_id
           AND f.role IS NOT DISTINCT FROM t.role
           AND seo._tm_source_rank(f.payload->>'source') > seo._tm_source_rank(t.payload->>'source');
        UPDATE platform.associations SET target_id = v_target
         WHERE target_type='seo_map_topic' AND target_id = r.id AND organization_id = v_org
           AND NOT EXISTS (SELECT 1 FROM platform.associations x WHERE x.target_type='seo_map_topic' AND x.target_id=v_target
                             AND x.source_type=platform.associations.source_type AND x.source_id=platform.associations.source_id AND x.role=platform.associations.role);
        DELETE FROM platform.associations WHERE target_type='seo_map_topic' AND target_id = r.id AND organization_id = v_org;
        UPDATE platform.associations SET source_id = v_target
         WHERE source_type='seo_map_topic' AND source_id = r.id AND organization_id = v_org
           AND NOT EXISTS (SELECT 1 FROM platform.associations x WHERE x.source_type='seo_map_topic' AND x.source_id=v_target
                             AND x.target_type=platform.associations.target_type AND x.target_id=platform.associations.target_id AND x.role=platform.associations.role);
        DELETE FROM platform.associations WHERE source_type='seo_map_topic' AND source_id = r.id AND organization_id = v_org;
        UPDATE plan.node SET topic_id = v_target WHERE topic_id = r.id AND organization_id = v_org;
        UPDATE seo.site_keyword_value SET topic_id = v_target WHERE topic_id = r.id AND organization_id = v_org;
      END IF;
    END IF;
    -- Children of a rejected proposal are lifted to its parent, never left
    -- under a row every reader hides (round 17's lesson on retire).
    UPDATE seo.map_topic SET parent_id = r.parent_id
     WHERE parent_id = r.id AND map_id = p_map_id AND deleted_at IS NULL AND NOT (id = ANY(p_ids));
    UPDATE seo.map_topic SET status = 'rejected' WHERE id = r.id AND map_id = p_map_id;
    v_report := v_report || jsonb_build_object('slug', r.slug, 'action',
      CASE WHEN v_att = '{}'::jsonb THEN 'rejected'
           WHEN v_policy = 'reject' THEN 'rejected_with_attachments'
           WHEN v_policy = 'parent' THEN 'attachments_moved_to_parent'
           ELSE 'attachments_merged_into_'||v_target_slug END,
      'attachments', v_att);
  END LOOP;

  IF jsonb_array_length(v_blocking) > 0 THEN
    RAISE EXCEPTION 'attachment rule: % topic(s) to be rejected still carry attachments. Re-run with on_attachments = reject | parent | merge_into:<slug>. Details: %',
      jsonb_array_length(v_blocking), v_blocking::text USING ERRCODE='23514';
  END IF;
  RETURN v_report;
END $function$;

CREATE OR REPLACE FUNCTION seo._tm_remove_topics(p_map_id uuid, p_ids uuid[], p_policy text, p_lift_children boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE r record; v_att jsonb; v_report jsonb := '[]'::jsonb; v_blocking jsonb := '[]'::jsonb; v_target uuid; v_target_slug text; v_org uuid;
        v_policy text;
BEGIN
  SELECT m.organization_id INTO v_org FROM seo.topical_map m WHERE m.id = p_map_id;
  IF v_org IS NULL THEN perform platform.refuse_not_found(format('topical_map %s not found', p_map_id)); END IF;
  v_policy := COALESCE(p_policy, 'error');
  IF v_policy LIKE 'merge_into:%' THEN
    v_target_slug := substr(v_policy, 12);
    -- ROUND 22: `merge_into:<slug>` names where the attachments GO. A hidden
    -- topic is not a destination — it is where they would disappear.
    v_target := seo._tm_live_topic_id(p_map_id, v_target_slug);
    IF v_target IS NULL OR v_target = ANY(p_ids) THEN perform platform.refuse_not_found(format('merge_into target %s not found or is itself being removed', v_target_slug)); END IF;
  ELSIF v_policy NOT IN ('error','retire','parent') THEN
    RAISE EXCEPTION 'unknown removal policy %; use error | retire | parent | merge_into:<slug>', v_policy USING ERRCODE='22023';
  END IF;
  FOR r IN SELECT t.id, t.slug, t.parent_id FROM seo.map_topic t WHERE t.id = ANY(p_ids) AND t.map_id = p_map_id LOOP
    v_att := seo._tm_attachments(r.id);
    IF v_att <> '{}'::jsonb THEN
      IF v_policy = 'error' THEN
        v_blocking := v_blocking || jsonb_build_object('slug', r.slug, 'attachments', v_att);
        CONTINUE;
      ELSIF v_policy = 'parent' THEN
        IF r.parent_id IS NULL THEN
          v_blocking := v_blocking || jsonb_build_object('slug', r.slug, 'attachments', v_att, 'message', 'root topic has no parent to receive attachments');
          CONTINUE;
        END IF;
        v_target := r.parent_id;
      END IF;
      IF v_policy IN ('parent','merge_into:'||COALESCE(v_target_slug,'')) OR v_policy LIKE 'merge_into:%' THEN
        -- move everything the merge function moves, without retiring the target.
        -- EVERY statement is scoped to this map's organization.
        -- ROUND 23: when the topic being removed AND the target BOTH hold an edge
        -- from the same row with the same role, only one survives the move. It
        -- used to be the target's, whoever wrote it — so a merge could silently
        -- drop a person's edge and keep a mapper's. The higher source wins; an
        -- equal one leaves the target untouched. The payload MOVES INTACT: no
        -- mover re-stamps `source`.
        UPDATE platform.associations t
           SET payload_kind = f.payload_kind, payload = f.payload
          FROM platform.associations f
         WHERE t.target_type='seo_map_topic' AND t.target_id = v_target AND t.organization_id = v_org
           AND f.target_type='seo_map_topic' AND f.target_id = r.id AND f.organization_id = v_org
           AND f.source_type = t.source_type AND f.source_id = t.source_id
           AND f.role IS NOT DISTINCT FROM t.role
           AND seo._tm_source_rank(f.payload->>'source') > seo._tm_source_rank(t.payload->>'source');
        UPDATE platform.associations t
           SET payload_kind = f.payload_kind, payload = f.payload
          FROM platform.associations f
         WHERE t.source_type='seo_map_topic' AND t.source_id = v_target AND t.organization_id = v_org
           AND f.source_type='seo_map_topic' AND f.source_id = r.id AND f.organization_id = v_org
           AND f.target_type = t.target_type AND f.target_id = t.target_id
           AND f.role IS NOT DISTINCT FROM t.role
           AND seo._tm_source_rank(f.payload->>'source') > seo._tm_source_rank(t.payload->>'source');
        UPDATE platform.associations SET target_id = v_target
         WHERE target_type='seo_map_topic' AND target_id = r.id AND organization_id = v_org
           AND NOT EXISTS (SELECT 1 FROM platform.associations x WHERE x.target_type='seo_map_topic' AND x.target_id=v_target
                             AND x.source_type=platform.associations.source_type AND x.source_id=platform.associations.source_id AND x.role=platform.associations.role);
        DELETE FROM platform.associations WHERE target_type='seo_map_topic' AND target_id = r.id AND organization_id = v_org;
        UPDATE platform.associations SET source_id = v_target
         WHERE source_type='seo_map_topic' AND source_id = r.id AND organization_id = v_org
           AND NOT EXISTS (SELECT 1 FROM platform.associations x WHERE x.source_type='seo_map_topic' AND x.source_id=v_target
                             AND x.target_type=platform.associations.target_type AND x.target_id=platform.associations.target_id AND x.role=platform.associations.role);
        DELETE FROM platform.associations WHERE source_type='seo_map_topic' AND source_id = r.id AND organization_id = v_org;
        UPDATE plan.node SET topic_id = v_target WHERE topic_id = r.id AND organization_id = v_org;
        UPDATE seo.site_keyword_value SET topic_id = v_target WHERE topic_id = r.id AND organization_id = v_org;
      END IF;
    END IF;
    IF COALESCE(p_lift_children, false) THEN
      UPDATE seo.map_topic SET parent_id = r.parent_id WHERE parent_id = r.id AND map_id = p_map_id AND deleted_at IS NULL AND NOT (id = ANY(p_ids));
    END IF;
    UPDATE seo.map_topic SET status = 'retired' WHERE id = r.id AND map_id = p_map_id;
    v_report := v_report || jsonb_build_object('slug', r.slug, 'action', CASE WHEN v_att = '{}'::jsonb THEN 'retired' WHEN v_policy='retire' THEN 'retired_with_attachments' WHEN v_policy='parent' THEN 'attachments_moved_to_parent' ELSE 'attachments_merged_into_'||v_target_slug END, 'attachments', v_att);
  END LOOP;
  IF jsonb_array_length(v_blocking) > 0 THEN
    RAISE EXCEPTION 'attachment rule: % topic(s) to be removed still carry attachments. Re-run with on_removed = retire | parent | merge_into:<slug>. Details: %',
      jsonb_array_length(v_blocking), v_blocking::text USING ERRCODE='23514';
  END IF;
  RETURN v_report;
END $function$;

CREATE OR REPLACE FUNCTION seo._tm_site(p_site_id uuid, p_level permission_level, p_denied text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF p_site_id IS NULL THEN
    RAISE EXCEPTION '%: p_site_id is NULL; the site set for NULL is decided by seo._tm_visible_sites, never here', p_denied
      USING ERRCODE = '22023';
  END IF;
  IF NOT (public.is_platform_admin()
          OR iam.has_access('web_site', p_site_id, p_level)) THEN
    RAISE EXCEPTION '%: no % access to site %', p_denied, p_level, p_site_id USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL) THEN
    perform platform.refuse_not_found(format('site %s not found', p_site_id));
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION seo.create_map_facet_values(p_brand_id uuid, p_facet_key text, p_values jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_org uuid; v_fid uuid; r jsonb; v_id uuid; v_parent uuid; v_created text[] := '{}'; v_updated text[] := '{}';
        v_actor uuid; v_rt text; v_ri uuid;
BEGIN
  IF p_brand_id IS NULL THEN RAISE EXCEPTION 'create_map_facet_values: p_brand_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_facet_key IS NULL THEN RAISE EXCEPTION 'create_map_facet_values: p_facet_key is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_values IS NULL THEN RAISE EXCEPTION 'create_map_facet_values: p_values is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF NOT (public.is_platform_admin() OR iam.has_access('web_brand', p_brand_id, 'editor')) THEN
    RAISE EXCEPTION 'facet_values_denied' USING ERRCODE='42501';
  END IF;
  SELECT organization_id INTO v_org FROM web.brand WHERE id = p_brand_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN perform platform.refuse_not_found(format('brand %s not found', p_brand_id)); END IF;
  SELECT id INTO v_fid FROM seo.map_facet WHERE key = p_facet_key AND deleted_at IS NULL
     AND (organization_id = v_org OR organization_id IN (SELECT so.organization_id FROM iam.system_orgs so WHERE so.global_readable))
   ORDER BY (organization_id = v_org) DESC LIMIT 1;
  IF v_fid IS NULL THEN perform platform.refuse_not_found(format('facet %s not found', p_facet_key)); END IF;
  IF jsonb_typeof(p_values) <> 'array' THEN RAISE EXCEPTION 'p_values must be a JSON array' USING ERRCODE='22023'; END IF;

  v_actor := (SELECT auth.uid());
  IF v_actor IS NOT NULL AND NOT public.is_platform_admin() THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_values) LOOP
      v_rt := r->>'ref_type'; v_ri := (r->>'ref_id')::uuid;
      IF v_rt IS NOT NULL AND v_ri IS NOT NULL
         AND iam.has_access_for(v_actor, v_rt, v_ri, 'viewer'::public.permission_level) IS NOT TRUE THEN
        RAISE EXCEPTION 'create_map_facet_values: no viewer access to %/% referenced by value %',
          v_rt, v_ri, r->>'slug' USING ERRCODE='42501';
      END IF;
    END LOOP;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_values) LOOP
    SELECT id INTO v_id FROM seo.map_facet_value WHERE facet_id = v_fid AND brand_id = p_brand_id AND slug = r->>'slug' AND deleted_at IS NULL;
    IF v_id IS NULL THEN
      INSERT INTO seo.map_facet_value (organization_id, facet_id, brand_id, slug, name, ref_type, ref_id)
      VALUES (v_org, v_fid, p_brand_id, r->>'slug', COALESCE(r->>'name', r->>'slug'), r->>'ref_type', (r->>'ref_id')::uuid);
      v_created := v_created || (r->>'slug');
    ELSE
      UPDATE seo.map_facet_value SET name = COALESCE(r->>'name', name),
             ref_type = CASE WHEN r ? 'ref_type' THEN r->>'ref_type' ELSE ref_type END,
             ref_id   = CASE WHEN r ? 'ref_id' THEN (r->>'ref_id')::uuid ELSE ref_id END
       WHERE id = v_id;
      v_updated := v_updated || (r->>'slug');
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM jsonb_array_elements(p_values) WHERE value ? 'parent_slug' LOOP
    SELECT id INTO v_parent FROM seo.map_facet_value WHERE facet_id = v_fid AND brand_id = p_brand_id AND slug = r->>'parent_slug' AND deleted_at IS NULL;
    IF v_parent IS NULL AND (r->>'parent_slug') IS NOT NULL THEN
      perform platform.refuse_not_found(format('parent_slug %s not found for %s', r->>'parent_slug', r->>'slug'));
    END IF;
    UPDATE seo.map_facet_value SET parent_id = v_parent WHERE facet_id = v_fid AND brand_id = p_brand_id AND slug = r->>'slug' AND deleted_at IS NULL;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'created', to_jsonb(v_created), 'updated', to_jsonb(v_updated));
END $function$;

CREATE OR REPLACE FUNCTION seo.dimension_matcher_upsert(p_site_id uuid, p_value_id uuid, p_kind text, p_pattern text DEFAULT NULL::text, p_place_id uuid DEFAULT NULL::uuid, p_fact_value_id uuid DEFAULT NULL::uuid, p_condition_rule_id uuid DEFAULT NULL::uuid, p_origin text DEFAULT 'human'::text, p_notes text DEFAULT NULL::text, p_enabled boolean DEFAULT true)
 RETURNS TABLE(id uuid, site_id uuid, value_id uuid, kind text, pattern text, place_id uuid, fact_value_id uuid, condition_rule_id uuid, enabled boolean, origin text, notes text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'web', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_org  uuid;
  v_dim  record;
  v_text text := NULLIF(btrim(COALESCE(p_pattern, '')), '');
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_matcher_unauthenticated';
  END IF;
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  SELECT s.organization_id INTO v_org FROM web.site s
   WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_org IS NULL THEN
    perform platform.refuse_not_found(format('gsc_site_not_found: %s', p_site_id));
  END IF;

  IF p_origin NOT IN ('human','pack','agent','migration') THEN
    RAISE EXCEPTION 'seo_matcher_bad_origin: %', p_origin;
  END IF;

  -- The value must be a real VALUE of a seo_facet dimension, and a site
  -- dimension's values only accept matchers from their own site.
  SELECT v.id AS value_id,
         d.id AS dimension_id,
         d.slug AS dimension_slug,
         COALESCE(d.metadata->>'scope','platform') AS scope,
         (d.metadata->>'site_id')::uuid AS dim_site_id
    INTO v_dim
  FROM platform.categories v
  JOIN platform.categories d ON d.id = v.parent_id AND d.deleted_at IS NULL
  WHERE v.id = p_value_id AND v.deleted_at IS NULL AND v.dimension = 'seo_facet';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_matcher_unknown_value: % is not a value of any keyword dimension', p_value_id;
  END IF;
  IF v_dim.scope = 'site' AND v_dim.dim_site_id IS DISTINCT FROM p_site_id THEN
    RAISE EXCEPTION 'seo_matcher_forbidden: "%" belongs to another site', v_dim.dimension_slug;
  END IF;

  -- Find the live twin (the dvm_target_check constraint guarantees exactly one
  -- target column is populated, so this comparison is total).
  SELECT m.id INTO v_id
    FROM seo.dimension_value_matcher m
   WHERE m.deleted_at IS NULL
     AND m.site_id = p_site_id
     AND m.value_id = p_value_id
     AND m.kind = p_kind
     AND m.pattern IS NOT DISTINCT FROM v_text
     AND m.place_id IS NOT DISTINCT FROM p_place_id
     AND m.fact_value_id IS NOT DISTINCT FROM p_fact_value_id
     AND m.condition_rule_id IS NOT DISTINCT FROM p_condition_rule_id
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO seo.dimension_value_matcher
      (site_id, value_id, kind, pattern, place_id, fact_value_id, condition_rule_id,
       enabled, origin, notes, organization_id, created_by, updated_by)
    VALUES
      (p_site_id, p_value_id, p_kind, v_text, p_place_id, p_fact_value_id, p_condition_rule_id,
       COALESCE(p_enabled, true), p_origin, NULLIF(btrim(COALESCE(p_notes,'')),''),
       v_org, v_uid, v_uid)
    RETURNING dimension_value_matcher.id INTO v_id;
  ELSE
    UPDATE seo.dimension_value_matcher m
       SET enabled    = COALESCE(p_enabled, m.enabled),
           notes      = COALESCE(NULLIF(btrim(COALESCE(p_notes,'')),''), m.notes),
           origin     = p_origin,
           updated_by = v_uid,
           updated_at = now()
     WHERE m.id = v_id;
  END IF;

  RETURN QUERY
  SELECT m.id, m.site_id, m.value_id, m.kind, m.pattern, m.place_id,
         m.fact_value_id, m.condition_rule_id, m.enabled, m.origin, m.notes, m.created_at
    FROM seo.dimension_value_matcher m WHERE m.id = v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.fn_autonomy_gate(p_site_id uuid, p_capability text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'platform', 'public', 'pg_temp'
AS $function$
declare
  v_cap    record;
  v_ladder jsonb;
  v_mode   text;
begin
  select * into v_cap from seo.ai_capability where slug = p_capability;
  if not found then
    -- A runner naming a capability that does not exist cannot know its mode.
    -- Refusing loudly is the whole point of this item.
    raise exception 'seo_autonomy_unknown_capability: there is no AI step named "%" — a runner that cannot determine its mode must not act',
      coalesce(p_capability, 'null');
  end if;

  if p_site_id is not null
     and not exists (select 1 from web.site s where s.id = p_site_id and s.deleted_at is null) then
    perform platform.refuse_not_found(format('seo_autonomy_unknown_site: no live site %s to resolve the autonomy ladder against', p_site_id));
  end if;

  v_ladder := seo.fn_ai_autonomy(p_site_id, p_capability);
  v_mode   := v_ladder ->> 'mode';
  if v_mode is null then
    raise exception 'seo_autonomy_indeterminate: the ladder returned no mode for "%" — refusing rather than guessing', p_capability;
  end if;

  return v_ladder || jsonb_build_object(
    'decision', case v_mode
                  when 'auto_platform'   then 'apply'
                  when 'auto_org'        then 'apply'
                  when 'review_timeout'  then 'propose'
                  when 'review_required' then 'propose_only'
                  when 'off'             then 'off'
                  -- Unreachable while the CHECK holds; if it ever is reached the
                  -- honest answer is "do nothing", never "apply".
                  else 'off'
                end,
    'label', v_cap.label,
    'scope', case when p_site_id is null then 'platform' else 'site' end,
    -- The sentence a surface shows a human when the runner declines to act.
    'refusal', case v_mode
                 when 'off' then
                   v_cap.label || ' is turned off for this scope, so nothing ran. '
                   || 'Change it under How much the AI may do on its own.'
                 when 'review_required' then
                   v_cap.label || ' may not apply anything without you — what it found is waiting in Approvals.'
                 when 'review_timeout' then
                   v_cap.label || ' put what it found in Approvals; it applies on its own if nobody answers in '
                   || coalesce((v_ladder ->> 'timeout_hours'), '?') || ' hours.'
                 else null
               end);
end;
$function$;

CREATE OR REPLACE FUNCTION seo.fn_ingest_keyword_research(p_research jsonb, p_language text DEFAULT 'en'::text, p_research_doc_id uuid DEFAULT NULL::uuid, p_site_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'public'
AS $function$
declare
  v_doc jsonb;
  v_list jsonb;
  v_label text;
  v_phrase text;
  v_primary_id uuid;
  v_other_id uuid;
  v_created boolean;
  v_src uuid; v_tgt uuid; v_type text;
  v_detail jsonb;
  v_kw_created int := 0; v_kw_existing int := 0;
  v_edge_written int := 0; v_edge_rejected_skipped int := 0; v_edge_self_skipped int := 0;
  v_primaries jsonb := '[]'::jsonb;
  v_site_org uuid;
  v_keyword_ids uuid[] := '{}';
  v_site_values_created int := 0;
begin
  if p_site_id is not null then
    select organization_id into v_site_org from web.site where id = p_site_id and deleted_at is null;
    if v_site_org is null then
      perform platform.refuse_not_found(format('seo_research_site_not_found: site %s does not exist', p_site_id));
    end if;
  end if;

  for v_doc in
    select d from jsonb_array_elements(
      case when jsonb_typeof(p_research) = 'array' then p_research
           else jsonb_build_array(p_research) end) d
  loop
    continue when v_doc is null or v_doc->>'primary_keyword' is null;

    select o_id, o_created into v_primary_id, v_created
    from seo.fn_upsert_keyword(v_doc->>'primary_keyword', p_language);
    if v_created then v_kw_created := v_kw_created + 1; else v_kw_existing := v_kw_existing + 1; end if;
    v_primaries := v_primaries || to_jsonb(v_primary_id);
    v_keyword_ids := v_keyword_ids || v_primary_id;

    for v_list in select jsonb_array_elements(coalesce(v_doc->'keyword_lists','[]'::jsonb)) loop
      v_label := lower(coalesce(v_list->>'label',''));

      for v_phrase in
        select distinct btrim(x.value)
        from jsonb_array_elements_text(coalesce(v_list->'keywords','[]'::jsonb)) x
        where length(btrim(x.value)) > 0
      loop
        select o_id, o_created into v_other_id, v_created
        from seo.fn_upsert_keyword(v_phrase, p_language);
        if v_created then v_kw_created := v_kw_created + 1; else v_kw_existing := v_kw_existing + 1; end if;
        v_keyword_ids := v_keyword_ids || v_other_id;

        if v_label like 'parent%' then
          v_src := v_primary_id; v_tgt := v_other_id; v_type := 'refines';
        elsif v_label like 'child%' then
          v_src := v_other_id; v_tgt := v_primary_id; v_type := 'refines';
        elsif v_label like '%lsi%' then
          v_src := v_other_id; v_tgt := v_primary_id; v_type := 'variant_of';
        elsif v_label like 'related%' then
          v_src := least(v_primary_id, v_other_id); v_tgt := greatest(v_primary_id, v_other_id); v_type := 'related';
        else
          -- A list whose label this pour has no rule for maps to NO edge. That key is not lost:
          -- it stays on the record (the `keyword_list` child row keeps its own label and its
          -- keywords), which is exactly KINDS-DESIGN-V2's "unmapped keys stay on the record".
          continue;
        end if;

        if v_src = v_tgt then
          v_edge_self_skipped := v_edge_self_skipped + 1;
          continue;
        end if;

        v_detail := jsonb_build_object('list_label', v_list->>'label');
        if p_research_doc_id is not null then
          v_detail := v_detail
            || jsonb_build_object('research_id', p_research_doc_id)
            || jsonb_build_object('produced_by', jsonb_build_array(jsonb_build_object(
                 'record_id', p_research_doc_id,
                 'list_label', v_list->>'label',
                 'at', now())));
        end if;

        if exists (select 1 from seo.keyword_edge e
                   where e.source_keyword_id = v_src and e.target_keyword_id = v_tgt
                     and e.edge_type = v_type and e.status = 'rejected') then
          v_edge_rejected_skipped := v_edge_rejected_skipped + 1;
          continue;
        end if;

        insert into seo.keyword_edge (source_keyword_id, target_keyword_id, edge_type, origin, status, confidence, detail)
        values (v_src, v_tgt, v_type, 'ai_research', 'proposed', 60, v_detail)
        on conflict (source_keyword_id, target_keyword_id, edge_type) do update
          set confidence = greatest(coalesce(seo.keyword_edge.confidence,0), excluded.confidence),
              -- APPEND, never overwrite. The existing detail keeps every key it had (including
              -- the FIRST run's list_label and research_id); only `produced_by` grows, and only
              -- with an entry this record has not already contributed.
              detail = seo.keyword_edge.detail || jsonb_build_object('produced_by',
                coalesce(seo.keyword_edge.detail->'produced_by', '[]'::jsonb)
                || (select coalesce(jsonb_agg(e), '[]'::jsonb)
                      from jsonb_array_elements(coalesce(excluded.detail->'produced_by','[]'::jsonb)) e
                     where not exists (
                       select 1 from jsonb_array_elements(
                         coalesce(seo.keyword_edge.detail->'produced_by','[]'::jsonb)) p
                        where p->>'record_id' = e->>'record_id'
                          and p->>'list_label' is not distinct from e->>'list_label')))
          where seo.keyword_edge.status <> 'rejected';
        v_edge_written := v_edge_written + 1;
      end loop;
    end loop;
  end loop;

  if p_site_id is not null and array_length(v_keyword_ids, 1) > 0 then
    insert into seo.site_keyword_value (site_id, keyword_id, organization_id)
    select distinct p_site_id, kid, v_site_org
    from unnest(v_keyword_ids) as kid
    on conflict (site_id, keyword_id) do nothing;
    get diagnostics v_site_values_created = row_count;
  end if;

  return jsonb_build_object(
    'primary_keyword_ids', v_primaries,
    'keywords_created', v_kw_created,
    'keywords_already_existed', v_kw_existing,
    'edges_written', v_edge_written,
    'edges_skipped_rejected', v_edge_rejected_skipped,
    'edges_skipped_self', v_edge_self_skipped,
    'site_keyword_values_created', v_site_values_created);
end;
$function$;

CREATE OR REPLACE FUNCTION seo.fn_site_offering_for_topic(p_site_id uuid, p_topic_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
DECLARE
  v_site web.site%ROWTYPE;
  v_node record;
  v_parent uuid;
  v_bo uuid;
BEGIN
  SELECT * INTO v_site FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF NOT FOUND THEN
    perform platform.refuse_not_found(format('gsc_site_not_found: %s', p_site_id));
  END IF;
  IF v_site.brand_id IS NULL THEN
    RAISE EXCEPTION 'offering_site_has_no_brand: give this site a brand before placing keywords on its offerings';
  END IF;

  FOR v_node IN
    WITH RECURSIVE lineage AS (
      SELECT t.id, t.parent_id, t.name, t.slug, t.node_type, t.description, t.metadata,
             t.created_by, t.updated_by, 0 AS depth
      FROM seo.topic t
      WHERE t.id = p_topic_id AND t.deleted_at IS NULL AND t.node_type IN ('product', 'service')
      UNION ALL
      SELECT p.id, p.parent_id, p.name, p.slug, p.node_type, p.description, p.metadata,
             p.created_by, p.updated_by, c.depth + 1
      FROM lineage c
      JOIN seo.topic p ON p.id = c.parent_id AND p.deleted_at IS NULL AND p.node_type IN ('product', 'service')
      WHERE c.depth < 32
    )
    SELECT * FROM lineage ORDER BY depth DESC
  LOOP
    v_bo := NULL;
    SELECT bo.id INTO v_bo
    FROM web.brand_offering bo
    WHERE bo.brand_id = v_site.brand_id AND bo.deleted_at IS NULL
      AND (bo.template_id = v_node.id
        OR (bo.template_id IS NULL AND bo.metadata->>'source_topic_id' = v_node.id::text))
    ORDER BY (bo.template_id IS NULL), bo.created_at
    LIMIT 1;

    IF v_bo IS NULL THEN
      INSERT INTO web.brand_offering (
        organization_id, brand_id, template_id, parent_id, name, slug, kind, description,
        status, adopted_at, sort, metadata, created_by, updated_by
      ) VALUES (
        v_site.organization_id, v_site.brand_id,
        (SELECT ot.id FROM web.offering_template ot WHERE ot.id = v_node.id AND ot.deleted_at IS NULL),
        v_parent, v_node.name,
        CASE WHEN EXISTS (
               SELECT 1 FROM web.brand_offering x
               WHERE x.brand_id = v_site.brand_id AND x.slug = v_node.slug AND x.deleted_at IS NULL)
             THEN v_node.slug || '-' || left(v_node.id::text, 8) ELSE v_node.slug END,
        v_node.node_type, v_node.description, 'active', now(),
        COALESCE((v_node.metadata->>'sort')::integer, 0),
        jsonb_build_object('migrated_from', 'seo.topic', 'source_topic_id', v_node.id,
                           'adopted_through', 'legacy topic writer'),
        auth.uid(), auth.uid()
      ) RETURNING id INTO v_bo;
    END IF;

    INSERT INTO web.site_offering AS so (
      organization_id, site_id, brand_offering_id, status, metadata, created_by, updated_by
    ) VALUES (
      v_site.organization_id, p_site_id, v_bo, 'active',
      jsonb_build_object('adopted_through', 'legacy topic writer'), auth.uid(), auth.uid()
    )
    ON CONFLICT (site_id, brand_offering_id) WHERE deleted_at IS NULL
    DO UPDATE SET status = 'active', updated_at = now(), updated_by = auth.uid()
    WHERE so.status <> 'active';

    v_parent := v_bo;
  END LOOP;

  IF v_bo IS NULL THEN
    perform platform.refuse_not_found(format('offering_topic_not_found: %s is not a live product or service', p_topic_id));
  END IF;
  RETURN v_bo;
END
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_assert_site_editor(p_site_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'public', 'pg_temp'
AS $function$
DECLARE
  v_created_by uuid;
  v_deleted_at timestamptz;
  v_found boolean;
  v_editor boolean := false;
BEGIN
  IF p_site_id IS NULL THEN
    RAISE EXCEPTION 'gsc_assert_site_editor: p_site_id is required (got NULL)'
      USING ERRCODE = '22023';
  END IF;

  -- The row is read WITHOUT the liveness test, because the liveness answer is
  -- only allowed to reach a caller who has already proved editor authority.
  -- (seo.fn_is_site_editor filters deleted sites itself, which is why the
  -- predicate is spelled out here instead of delegated: it is the same one.)
  SELECT s.created_by, s.deleted_at INTO v_created_by, v_deleted_at
  FROM web.site s WHERE s.id = p_site_id;
  v_found := FOUND;

  IF v_found THEN
    v_editor := public.is_platform_admin()
             OR v_created_by = (SELECT auth.uid())
             OR iam.has_access('web_site', p_site_id, 'editor'::public.permission_level);
  END IF;

  IF NOT v_editor THEN
    RAISE EXCEPTION 'gsc_site_edit_denied: no editor access to that site'
      USING ERRCODE = '42501';
  END IF;

  -- Only an editor of this exact site ever gets here, so the honest "it is gone"
  -- is honest to the person it belongs to and discloses nothing to anyone else.
  IF v_deleted_at IS NOT NULL THEN
    perform platform.refuse_not_found(format('gsc_site_not_found: %s', p_site_id));
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_set_keyword_topic(p_site_id uuid, p_keyword_ids uuid[], p_topic_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(keyword_id uuid, value_band text, value_source text, value_score numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
-- The OUT parameter `keyword_id` shadows the column in ON CONFLICT without
-- this — the same pragma gsc_set_keyword_value already carries.
#variable_conflict use_column
DECLARE
  v_org uuid;
  v_notes text := NULLIF(btrim(p_notes), '');
  v_node_type text;
  v_offering uuid;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords';
  END IF;
  -- The same ceiling `gsc_set_keyword_stamps` carries, said the same way.
  IF array_length(p_keyword_ids, 1) > 5000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: up to 5,000 keywords in one go.';
  END IF;

  IF p_topic_id IS NOT NULL THEN
    SELECT t.node_type INTO v_node_type FROM seo.topic t WHERE t.id = p_topic_id AND t.deleted_at IS NULL;
    IF NOT FOUND THEN
      perform platform.refuse_not_found(format('seo_topic_not_found: no topic %s', p_topic_id));
    END IF;
  END IF;

  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  -- TRANSITION (brand-offerings cutover): the value resolver reads the
  -- canonical placement. An offering placement is written through THE
  -- placement writer; a taxonomy placement or a removal takes the keyword off
  -- this site's offerings. Deleted when every caller writes offerings directly.
  IF p_topic_id IS NOT NULL AND v_node_type IN ('product', 'service') THEN
    v_offering := seo.fn_site_offering_for_topic(p_site_id, p_topic_id);
    PERFORM 1 FROM seo.write_site_keyword_offering(v_org, p_site_id, p_keyword_ids, v_offering, v_notes, 'human');
  ELSE
    PERFORM 1 FROM seo.write_site_keyword_offering(v_org, p_site_id, p_keyword_ids, NULL, NULL, 'human');
  END IF;

  -- P30: placing a keyword while working a SITE states THAT SITE's opinion.
  -- Demotion (freeing the one-primary-per-scope index before the insert
  -- below) is scoped to this site's own rows only — a site placement can
  -- never demote, and therefore never overwrite, a brand/organization/system
  -- row for the same keyword.
  UPDATE seo.keyword_topic kt
  SET is_primary = false, updated_at = now(), updated_by = (SELECT auth.uid())
  WHERE kt.keyword_id = ANY (p_keyword_ids) AND kt.is_primary
    AND kt.scope_tier = 'site' AND kt.scope_site_id = p_site_id
    AND (p_topic_id IS NULL OR kt.topic_id <> p_topic_id);

  IF p_topic_id IS NULL THEN
    RETURN QUERY
    SELECT m.keyword_id, m.value_band, m.value_source, m.value_score
    FROM seo.keyword_value_map(p_site_id, p_keyword_ids) m;
    RETURN;
  END IF;

  -- The ON CONFLICT arbiter is uq_keyword_topic_site_scope
  -- (keyword_id, topic_id, scope_site_id) WHERE scope_tier='site' — it can
  -- only ever match another scope_tier='site' row for THIS site, so this
  -- upsert can never touch a higher tier's row even when that tier chose the
  -- exact same topic for the exact same keyword.
  INSERT INTO seo.keyword_topic AS kt
    (organization_id, created_by, keyword_id, topic_id, is_primary, assigned_by,
     notes, scope_tier, scope_site_id)
  SELECT v_org, (SELECT auth.uid()), kid, p_topic_id, true, 'human',
         v_notes, 'site', p_site_id
  FROM unnest(p_keyword_ids) AS kid
  ON CONFLICT (keyword_id, topic_id, scope_site_id) WHERE (scope_tier = 'site')
  DO UPDATE SET
    is_primary = true,
    deleted_at = NULL,
    assigned_by = 'human',
    -- A new reason replaces the old one; placing again WITHOUT a reason never
    -- erases the sentence someone already wrote.
    notes = COALESCE(EXCLUDED.notes, kt.notes),
    updated_at = now(),
    updated_by = (SELECT auth.uid());

  RETURN QUERY
  SELECT m.keyword_id, m.value_band, m.value_source, m.value_score
  FROM seo.keyword_value_map(p_site_id, p_keyword_ids) m;
EXCEPTION
  WHEN unique_violation THEN
    -- The table-wide keyword_id+topic_id constraint (kept for
    -- gsc_topic_delete's cross-tier merge) is the only other unique key that
    -- could still fire here — only when a higher tier already claimed the
    -- exact same topic for this exact keyword. Fail loud rather than let the
    -- upsert silently mutate that tier's row.
    RAISE EXCEPTION 'seo_topic_tier_conflict: keyword % already carries topic % at another tier — place it under a different Offering, or edit that tier''s placement directly', p_keyword_ids, p_topic_id
      USING ERRCODE = '23505';
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_set_site_kw_guidelines(p_site_id uuid, p_guidelines text)
 RETURNS TABLE(guidelines text, guidelines_version integer, updated_at timestamp with time zone, updated_by uuid, updated_by_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_text text := NULLIF(btrim(COALESCE(p_guidelines, '')), '');
  v_prev jsonb;
  v_next jsonb;
  v_now timestamptz := now();
  v_uid uuid := (SELECT auth.uid());
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  IF v_text IS NOT NULL AND length(v_text) > 40000 THEN
    RAISE EXCEPTION 'gsc_guidelines_too_long: % characters (limit 40000)', length(v_text);
  END IF;

  SELECT s.settings -> 'kw_guidelines' INTO v_prev
  FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;

  IF v_text IS NULL THEN
    UPDATE web.site s
       SET settings = COALESCE(s.settings, '{}'::jsonb) - 'kw_guidelines',
           updated_at = v_now,
           updated_by = COALESCE(v_uid, s.updated_by)
     WHERE s.id = p_site_id AND s.deleted_at IS NULL;
    RETURN QUERY SELECT NULL::text, 0, NULL::timestamptz, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  v_next := jsonb_build_object(
    'text', v_text,
    'version', COALESCE((v_prev ->> 'version')::int, 0) + 1,
    'updated_at', to_jsonb(v_now),
    'updated_by', to_jsonb(v_uid)
  );

  UPDATE web.site s
     SET settings = jsonb_set(COALESCE(s.settings, '{}'::jsonb), '{kw_guidelines}', v_next, true),
         updated_at = v_now,
         updated_by = COALESCE(v_uid, s.updated_by)
   WHERE s.id = p_site_id AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    perform platform.refuse_not_found(format('gsc_site_not_found: %s', p_site_id));
  END IF;

  RETURN QUERY
  SELECT v_text, (v_next ->> 'version')::int, v_now, v_uid,
         COALESCE(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', au.email)
  FROM (SELECT v_uid AS uid) ids
  LEFT JOIN auth.users au ON au.id = ids.uid;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_set_topic_value(p_site_id uuid, p_topic_id uuid, p_weight numeric DEFAULT NULL::numeric, p_lead_quality text DEFAULT NULL::text, p_offering_match text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_clear boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid;
  v_id uuid;
  v_node_type text;
  v_offering uuid;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  SELECT t.node_type INTO v_node_type FROM seo.topic t WHERE t.id = p_topic_id AND t.deleted_at IS NULL;
  IF NOT FOUND THEN
    perform platform.refuse_not_found(format('seo_topic_not_found: no topic %s', p_topic_id));
  END IF;

  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  IF NOT p_clear AND p_weight IS NOT NULL AND (p_weight < 0 OR p_weight > 100) THEN
    RAISE EXCEPTION 'seo_topic_weight_range: worth is 0–100, got %', p_weight;
  END IF;

  -- TRANSITION (brand-offerings cutover): offering worth is read from the
  -- canonical offering value and written through THE worth writer. A legacy
  -- call that leaves worth blank meant "50" to the resolver, so that is what
  -- is written, and the row says so.
  IF v_node_type IN ('product', 'service') THEN
    v_offering := seo.fn_site_offering_for_topic(p_site_id, p_topic_id);
    PERFORM seo.write_site_offering_value(
      v_org, p_site_id, v_offering, COALESCE(p_weight, 50), p_lead_quality, p_offering_match,
      p_notes, p_clear, NULL, NULL, NULL,
      jsonb_build_object('written_through', 'seo.gsc_set_topic_value',
                         'worth_points_from_resolver_default', p_weight IS NULL));
  END IF;

  IF p_clear THEN
    UPDATE seo.site_topic_value
    SET deleted_at = now(), updated_at = now(), updated_by = (SELECT auth.uid())
    WHERE site_id = p_site_id AND topic_id = p_topic_id AND deleted_at IS NULL
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  INSERT INTO seo.site_topic_value AS stv
    (organization_id, created_by, site_id, topic_id, weight, lead_quality, offering_match, notes)
  VALUES
    (v_org, (SELECT auth.uid()), p_site_id, p_topic_id, p_weight,
     p_lead_quality, p_offering_match, NULLIF(btrim(COALESCE(p_notes, '')), ''))
  ON CONFLICT (site_id, topic_id) DO UPDATE SET
    weight = EXCLUDED.weight,
    lead_quality = EXCLUDED.lead_quality,
    offering_match = EXCLUDED.offering_match,
    notes = EXCLUDED.notes,
    deleted_at = NULL,
    updated_at = now(),
    updated_by = (SELECT auth.uid())
  RETURNING stv.id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_topic_delete_impact(p_site_id uuid, p_topic_id uuid)
 RETURNS TABLE(topic_id uuid, topic_name text, associated_keywords bigint, keyword_links bigint, primary_keyword_links bigint, affected_organizations bigint, site_worth_rulings bigint, child_topics bigint, starter_pack_items bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform seo.gsc_assert_site_editor(p_site_id);

  if not exists (
    select 1
    from seo.topic t
    where t.id = p_topic_id
      and t.deleted_at is null
  ) then
    perform platform.refuse_not_found(format('seo_topic_not_found: no active topic %s', p_topic_id));
  end if;

  return query
  select
    t.id,
    t.name,
    count(distinct kt.keyword_id)::bigint,
    count(kt.id)::bigint,
    count(kt.id) filter (where kt.is_primary)::bigint,
    count(distinct kt.organization_id)::bigint,
    (select count(*)::bigint
       from seo.site_topic_value stv
      where stv.topic_id = t.id and stv.deleted_at is null),
    (select count(*)::bigint
       from seo.topic child
      where child.parent_id = t.id and child.deleted_at is null),
    (select count(*)::bigint
       from seo.starter_pack_item spi
      where spi.topic_id = t.id and spi.deleted_at is null)
  from seo.topic t
  left join seo.keyword_topic kt
    on kt.topic_id = t.id
   and kt.deleted_at is null
  where t.id = p_topic_id
    and t.deleted_at is null
  group by t.id, t.name;
end;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_topic_delete(p_site_id uuid, p_topic_id uuid, p_replacement_topic_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(topic_id uuid, topic_name text, associated_keywords bigint, keyword_links_removed bigint, keyword_links_reassigned bigint, affected_organizations bigint, child_topics_promoted bigint, site_worth_rulings_removed bigint, starter_pack_items_removed bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_topic seo.topic%rowtype;
  v_primary_keyword_ids uuid[] := array[]::uuid[];
  v_associated_keywords bigint := 0;
  v_keyword_links bigint := 0;
  v_organizations bigint := 0;
  v_children bigint := 0;
  v_worth bigint := 0;
  v_pack_items bigint := 0;
begin
  perform seo.gsc_assert_site_editor(p_site_id);

  select t.*
    into v_topic
    from seo.topic t
   where t.id = p_topic_id
     and t.deleted_at is null
   for update;

  if not found then
    perform platform.refuse_not_found(format('seo_topic_not_found: no active topic %s', p_topic_id));
  end if;

  if p_replacement_topic_id = p_topic_id then
    raise exception 'seo_topic_invalid_replacement: a topic cannot replace itself';
  end if;

  if p_replacement_topic_id is not null
     and not exists (
       select 1
         from seo.topic replacement
        where replacement.id = p_replacement_topic_id
          and replacement.deleted_at is null
     ) then
    raise exception 'seo_topic_invalid_replacement: replacement topic is not active';
  end if;

  select
    count(distinct kt.keyword_id)::bigint,
    count(*)::bigint,
    count(distinct kt.organization_id)::bigint,
    coalesce(
      array_agg(kt.keyword_id) filter (where kt.is_primary),
      array[]::uuid[]
    )
    into
      v_associated_keywords,
      v_keyword_links,
      v_organizations,
      v_primary_keyword_ids
    from seo.keyword_topic kt
   where kt.topic_id = p_topic_id
     and kt.deleted_at is null;

  update seo.keyword_topic kt
     set is_primary = false,
         updated_at = now(),
         updated_by = auth.uid()
   where kt.topic_id = p_topic_id
     and kt.deleted_at is null
     and kt.is_primary;

  if p_replacement_topic_id is not null then
    insert into seo.keyword_topic as destination (
      organization_id,
      created_by,
      keyword_id,
      topic_id,
      is_primary,
      assigned_by,
      confidence,
      notes,
      metadata,
      visibility,
      scope_tier,
      scope_site_id,
      scope_brand_id
    )
    select
      source.organization_id,
      auth.uid(),
      source.keyword_id,
      p_replacement_topic_id,
      source.keyword_id = any(v_primary_keyword_ids),
      source.assigned_by,
      source.confidence,
      source.notes,
      source.metadata,
      source.visibility,
      source.scope_tier,
      source.scope_site_id,
      source.scope_brand_id
    from seo.keyword_topic source
    where source.topic_id = p_topic_id
      and source.deleted_at is null
    on conflict (
      keyword_id,
      topic_id,
      scope_tier,
      COALESCE(scope_site_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(scope_brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) do update
      set is_primary = destination.is_primary or excluded.is_primary,
          deleted_at = null,
          assigned_by = coalesce(excluded.assigned_by, destination.assigned_by),
          confidence = coalesce(excluded.confidence, destination.confidence),
          notes = coalesce(excluded.notes, destination.notes),
          updated_at = now(),
          updated_by = auth.uid();
  end if;

  update seo.keyword_topic kt
     set is_primary = false,
         deleted_at = now(),
         updated_at = now(),
         updated_by = auth.uid()
   where kt.topic_id = p_topic_id
     and kt.deleted_at is null;

  with moved as (
    update seo.topic child
       set parent_id = v_topic.parent_id,
           updated_at = now(),
           updated_by = auth.uid()
     where child.parent_id = p_topic_id
       and child.deleted_at is null
     returning 1
  )
  select count(*)::bigint into v_children from moved;

  with removed as (
    update seo.site_topic_value stv
       set deleted_at = now(),
           updated_at = now(),
           updated_by = auth.uid()
     where stv.topic_id = p_topic_id
       and stv.deleted_at is null
     returning 1
  )
  select count(*)::bigint into v_worth from removed;

  with removed as (
    update seo.starter_pack_item spi
       set deleted_at = now(),
           updated_at = now(),
           updated_by = auth.uid()
     where spi.topic_id = p_topic_id
       and spi.deleted_at is null
     returning 1
  )
  select count(*)::bigint into v_pack_items from removed;

  update seo.topic t
     set deleted_at = now(),
         updated_at = now(),
         updated_by = auth.uid()
   where t.id = p_topic_id;

  return query
  select
    v_topic.id,
    v_topic.name,
    v_associated_keywords,
    case when p_replacement_topic_id is null then v_keyword_links else 0 end,
    case when p_replacement_topic_id is null then 0 else v_keyword_links end,
    v_organizations,
    v_children,
    v_worth,
    v_pack_items;
end;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_topic_placement_diff(p_site_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(keyword_id uuid, phrase text, scope_tier text, old_topic_id uuid, old_topic_name text, new_topic_id uuid, new_topic_name text, changed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'history', 'iam', 'public', 'pg_temp'
AS $function$
DECLARE
  v_brand_id uuid;
  v_org_id uuid;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  SELECT s.brand_id, s.organization_id INTO v_brand_id, v_org_id
    FROM web.site s
   WHERE s.id = p_site_id AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    perform platform.refuse_not_found(format('gsc_site_not_found: %s', p_site_id));
  END IF;

  RETURN QUERY
  WITH site_keywords AS (
    SELECT DISTINCT vskp.keyword_id
      FROM seo.v_site_keyword_performance vskp
     WHERE vskp.site_id = p_site_id
  ),
  winners AS (
    -- The row this site is CURRENTLY inheriting -- excluded outright if the
    -- site already has its own scope_tier='site' row for this keyword
    -- (P29/P30: a site's own ruling is never shown as drift).
    SELECT kt.keyword_id, kt.id AS row_id, kt.topic_id, kt.scope_tier,
           kt.version, kt.updated_at
      FROM seo.keyword_topic kt
      JOIN site_keywords sk ON sk.keyword_id = kt.keyword_id
     WHERE kt.deleted_at IS NULL
       AND kt.is_primary
       AND (
            (kt.scope_tier = 'brand' AND v_brand_id IS NOT NULL AND kt.scope_brand_id = v_brand_id)
         OR (kt.scope_tier = 'organization' AND kt.organization_id = v_org_id)
         OR (kt.scope_tier = 'system')
       )
       AND NOT EXISTS (
         SELECT 1 FROM seo.keyword_topic s2
          WHERE s2.keyword_id = kt.keyword_id
            AND s2.scope_tier = 'site' AND s2.scope_site_id = p_site_id
            AND s2.deleted_at IS NULL
       )
  ),
  ranked AS (
    -- Nearest tier wins even among candidates (mirrors keyword_placement_resolve).
    SELECT w.*, row_number() OVER (
             PARTITION BY w.keyword_id
             ORDER BY CASE w.scope_tier WHEN 'brand' THEN 0 WHEN 'organization' THEN 1 ELSE 2 END,
                      w.updated_at DESC
           ) AS rn
      FROM winners w
  ),
  with_history AS (
    SELECT r.keyword_id, r.topic_id AS new_topic_id, r.scope_tier, r.updated_at AS changed_at,
           (
             SELECT (rv.row_data ->> 'topic_id')::uuid
               FROM history.row_versions rv
              WHERE rv.entity_type = 'seo_keyword_topic'
                AND rv.row_id = r.row_id
                AND rv.version < r.version
              ORDER BY rv.version DESC
              LIMIT 1
           ) AS old_topic_id
      FROM ranked r
     WHERE r.rn = 1
  )
  SELECT wh.keyword_id, k.phrase, wh.scope_tier,
         wh.old_topic_id, ot.name,
         wh.new_topic_id, nt.name,
         wh.changed_at
    FROM with_history wh
    JOIN seo.keyword k ON k.id = wh.keyword_id
    JOIN seo.topic nt ON nt.id = wh.new_topic_id
    LEFT JOIN seo.topic ot ON ot.id = wh.old_topic_id
   WHERE wh.old_topic_id IS NOT NULL
     AND wh.old_topic_id <> wh.new_topic_id
   ORDER BY wh.changed_at DESC
   LIMIT LEAST(GREATEST(p_limit, 1), 200);
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_topic_save(p_site_id uuid, p_topic_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_node_type text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_parent_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid;
  v_name text := btrim(COALESCE(p_name, ''));
  v_slug text;
  v_base text;
  v_n int := 1;
  v_id uuid;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  IF p_topic_id IS NULL THEN
    IF v_name = '' THEN
      RAISE EXCEPTION 'seo_topic_name_required: a topic needs a name';
    END IF;
    IF p_node_type IS NULL THEN
      RAISE EXCEPTION 'seo_topic_type_required: choose what this topic is — that is what decides whether its traffic can ever become money';
    END IF;

    v_base := regexp_replace(
      regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)',
      '',
      'g'
    );
    IF v_base = '' THEN v_base := 'topic'; END IF;
    v_slug := v_base;
    WHILE EXISTS (SELECT 1 FROM seo.topic t WHERE t.slug = v_slug) LOOP
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    END LOOP;

    INSERT INTO seo.topic
      (organization_id, created_by, name, slug, node_type, description, is_builtin, metadata)
    VALUES
      (v_org, (SELECT auth.uid()), v_name, v_slug, p_node_type,
       NULLIF(btrim(COALESCE(p_description, '')), ''), false,
       jsonb_build_object('authored', jsonb_build_object(
         'origin', 'human', 'surface', 'topic-tree-builder', 'site_id', p_site_id,
         'created_at', now())))
    RETURNING id INTO v_id;

    IF p_parent_id IS NOT NULL THEN
      PERFORM seo.gsc_topic_set_parent(p_site_id, v_id, p_parent_id);
    END IF;
    RETURN v_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM seo.topic t WHERE t.id = p_topic_id AND t.deleted_at IS NULL) THEN
    perform platform.refuse_not_found(format('seo_topic_not_found: no topic %s', p_topic_id));
  END IF;

  UPDATE seo.topic t
  SET name = CASE WHEN v_name <> '' THEN v_name ELSE t.name END,
      node_type = COALESCE(p_node_type, t.node_type),
      description = CASE
        WHEN p_description IS NULL THEN t.description
        ELSE NULLIF(btrim(p_description), '') END,
      updated_at = now(),
      updated_by = (SELECT auth.uid())
  WHERE t.id = p_topic_id;

  RETURN p_topic_id;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_topic_set_parent(p_site_id uuid, p_topic_id uuid, p_parent_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
DECLARE
  v_name text;
  v_parent_name text;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  SELECT t.name INTO v_name FROM seo.topic t
  WHERE t.id = p_topic_id AND t.deleted_at IS NULL;
  IF NOT FOUND THEN
    perform platform.refuse_not_found(format('seo_topic_not_found: no topic %s', p_topic_id));
  END IF;

  IF p_parent_id IS NOT NULL THEN
    IF p_parent_id = p_topic_id THEN
      RAISE EXCEPTION 'seo_topic_cycle: "%" cannot be its own parent', v_name;
    END IF;

    SELECT t.name INTO v_parent_name FROM seo.topic t
    WHERE t.id = p_parent_id AND t.deleted_at IS NULL;
    IF NOT FOUND THEN
      perform platform.refuse_not_found(format('seo_topic_not_found: no topic %s', p_parent_id));
    END IF;

    -- Walking UP from the proposed parent must never reach this topic.
    IF EXISTS (
      WITH RECURSIVE up AS (
        SELECT t.id, t.parent_id, 0 AS depth
        FROM seo.topic t WHERE t.id = p_parent_id
        UNION ALL
        SELECT t.id, t.parent_id, up.depth + 1
        FROM seo.topic t JOIN up ON t.id = up.parent_id
        WHERE up.depth < 24
      )
      SELECT 1 FROM up WHERE up.id = p_topic_id
    ) THEN
      RAISE EXCEPTION
        'seo_topic_cycle: "%" already sits under "%" — pinning it as the parent would make a loop',
        v_parent_name, v_name;
    END IF;
  END IF;

  UPDATE seo.topic
  SET parent_id = p_parent_id, updated_at = now(), updated_by = (SELECT auth.uid())
  WHERE id = p_topic_id;

  RETURN p_topic_id;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.keyword_meaning_suggest(p_site_id uuid, p_proposal jsonb, p_title text, p_body text DEFAULT NULL::text, p_reasoning text DEFAULT NULL::text, p_confidence real DEFAULT NULL::real, p_evidence jsonb DEFAULT NULL::jsonb, p_provenance jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(assist_id uuid, status text, dedupe_key text, payload_hash text, addressee uuid, proposal jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'web', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_site      record;
  v_kind      text := p_proposal ->> 'proposal';
  v_p         jsonb := p_proposal;
  v_hash      text;
  v_dedupe    text;
  v_existing  record;
  v_action    jsonb;
  v_id        uuid;
  v_source    text;
  v_dim       record;
  v_val       record;
  v_fact      record;
  v_label     text;
  v_ids       uuid[];
  v_phrases   jsonb;
  v_by_agent  boolean;
  v_addressee uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_suggest_unauthenticated';
  END IF;
  PERFORM seo.gsc_assert_site_access(p_site_id);

  IF v_kind IS NULL OR v_kind NOT IN ('matcher','worth','stamp','guideline_edit','offering') THEN
    RAISE EXCEPTION 'seo_suggest_bad_proposal: proposal must be matcher | worth | stamp | guideline_edit | offering (got %)', COALESCE(v_kind,'null');
  END IF;
  IF NULLIF(btrim(COALESCE(p_title,'')),'') IS NULL THEN
    RAISE EXCEPTION 'seo_suggest_title_required: say in one line what you are proposing';
  END IF;

  SELECT s.id AS id, s.organization_id AS organization_id, s.created_by AS created_by,
         COALESCE(s.name, s.domain) AS label
    INTO v_site
    FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_site.id IS NULL THEN
    perform platform.refuse_not_found(format('gsc_site_not_found: %s', p_site_id));
  END IF;
  -- KI-034 — WHO IS ASKED TO APPROVE THIS.
  -- An agent's proposal always goes to the owner of the thing being changed.
  -- A person's own proposal goes to that person, provided they may edit the
  -- site. Before this every proposal was addressed to the site owner, so an
  -- agency employee who corrected a keyword was told to approve it in a queue
  -- they could not open — their own work was invisible to them.
  -- Agent origin is read off the provenance the tool layer stamps (tool call,
  -- run, agent name); a person acting in the product carries none of those.
  v_by_agent := COALESCE(p_provenance, '{}'::jsonb) ?| ARRAY['toolCallId','runId','agentName'];
  -- KI-031: a draft a PERSON asked for in the product comes back to that
  -- person, provided they may edit the site. `auth.uid()` still decides who
  -- that is; `requestedBy` only asserts that a human initiated the run.
  v_addressee := CASE
    WHEN (COALESCE(p_provenance, '{}'::jsonb) ? 'requestedBy')
         AND seo.fn_is_site_editor(p_site_id) THEN v_uid
    WHEN v_by_agent THEN v_site.created_by
    WHEN seo.fn_is_site_editor(p_site_id) THEN v_uid
    ELSE v_site.created_by
  END;
  IF v_addressee IS NULL THEN
    RAISE EXCEPTION 'seo_suggest_no_addressee: site % has no owner to approve this', p_site_id;
  END IF;

  IF v_kind IN ('matcher','worth','stamp') THEN
    SELECT d.id AS id, d.slug AS slug, d.name AS label,
           COALESCE(d.metadata->>'scope','platform') AS scope,
           (d.metadata->>'site_id')::uuid AS dim_site_id
      INTO v_dim
    FROM platform.categories d
    WHERE d.dimension = 'seo_facet' AND d.parent_id IS NULL AND d.deleted_at IS NULL
      AND d.slug = (v_p ->> 'dimensionSlug');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'seo_suggest_unknown_dimension: there is no dimension named "%"', COALESCE(v_p ->> 'dimensionSlug','(none)');
    END IF;
    IF v_dim.scope = 'site' AND v_dim.dim_site_id IS DISTINCT FROM p_site_id THEN
      RAISE EXCEPTION 'seo_suggest_forbidden: "%" belongs to another site', v_dim.slug;
    END IF;

    SELECT v.id AS id, v.name AS label
      INTO v_val
    FROM platform.categories v
    WHERE v.parent_id = v_dim.id AND v.deleted_at IS NULL
      AND v.slug = v_dim.slug || ':' || (v_p ->> 'valueSlug');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'seo_suggest_unknown_value: "%" is not a value of "%". Propose it on the dimension first.', COALESCE(v_p ->> 'valueSlug','(none)'), v_dim.slug;
    END IF;

    v_p := v_p || jsonb_build_object(
      'valueId',        v_val.id,
      'dimensionSlug',  v_dim.slug,
      'dimensionLabel', v_dim.label,
      'valueSlug',      v_p ->> 'valueSlug',
      'valueLabel',     v_val.label
    );
  END IF;

  IF v_kind = 'matcher' THEN
    IF (v_p ->> 'matcherKind') = 'place' AND (v_p ->> 'placeId') IS NOT NULL THEN
      SELECT g.name INTO v_label FROM seo.geo_place g
       WHERE g.id = (v_p ->> 'placeId')::uuid AND g.deleted_at IS NULL;
      IF v_label IS NULL THEN
        RAISE EXCEPTION 'seo_suggest_unknown_place: % is not a place in the gazetteer', v_p ->> 'placeId';
      END IF;
      v_p := v_p || jsonb_build_object('placeLabel', v_label);
    ELSIF (v_p ->> 'matcherKind') = 'fact' THEN
      SELECT v.id AS id, d.name || ' -> ' || v.name AS label
        INTO v_fact
      FROM platform.categories v
      JOIN platform.categories d ON d.id = v.parent_id AND d.deleted_at IS NULL
      WHERE v.deleted_at IS NULL AND v.dimension = 'seo_facet'
        AND d.slug = (v_p ->> 'factDimensionSlug')
        AND v.slug = (v_p ->> 'factDimensionSlug') || ':' || (v_p ->> 'factValueSlug');
      IF NOT FOUND THEN
        RAISE EXCEPTION 'seo_suggest_unknown_fact: "%:%" is not a dimension value', COALESCE(v_p ->> 'factDimensionSlug','(none)'), COALESCE(v_p ->> 'factValueSlug','(none)');
      END IF;
      v_p := v_p || jsonb_build_object('factValueId', v_fact.id, 'factLabel', v_fact.label);
    ELSIF (v_p ->> 'matcherKind') = 'condition' AND (v_p ->> 'conditionRuleId') IS NOT NULL THEN
      SELECT r.name INTO v_label FROM seo.gsc_dig_rule r
       WHERE r.id = (v_p ->> 'conditionRuleId')::uuid AND r.deleted_at IS NULL;
      IF v_label IS NULL THEN
        RAISE EXCEPTION 'seo_suggest_unknown_condition: % is not a Dig Here rule', v_p ->> 'conditionRuleId';
      END IF;
      v_p := v_p || jsonb_build_object('conditionLabel', v_label);
    END IF;
  END IF;

  IF v_kind = 'stamp' THEN
    SELECT array_agg(x::uuid) INTO v_ids
      FROM jsonb_array_elements_text(COALESCE(v_p -> 'keywordIds','[]'::jsonb)) AS t(x);
    IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
      RAISE EXCEPTION 'gsc_no_keywords: choose at least one keyword';
    END IF;
    SELECT jsonb_agg(k.phrase ORDER BY k.phrase) INTO v_phrases
      FROM seo.keyword k WHERE k.id = ANY(v_ids) AND k.deleted_at IS NULL;
    IF v_phrases IS NULL THEN
      RAISE EXCEPTION 'seo_suggest_unknown_keywords: none of those keyword ids exist';
    END IF;
    v_p := v_p || jsonb_build_object('keywordPhrases', v_phrases);
  END IF;

  IF v_kind = 'guideline_edit' THEN
    v_p := v_p || jsonb_build_object(
      'baseVersion',
      COALESCE((SELECT (s.settings -> 'kw_guidelines' ->> 'version')::int
                  FROM web.site s WHERE s.id = p_site_id), 0)
    );
    IF NULLIF(btrim(COALESCE(v_p ->> 'proposedText','')),'') IS NULL THEN
      RAISE EXCEPTION 'seo_suggest_empty_guidelines: send the FULL proposed document, not a patch';
    END IF;
  END IF;

  -- KI-040 step 6: an Offering the Business Discovery Ladder proposes.
  IF v_kind = 'offering' THEN
    IF NULLIF(btrim(COALESCE(v_p ->> 'name','')),'') IS NULL THEN
      RAISE EXCEPTION 'seo_suggest_offering_name_required: name the offering';
    END IF;
    IF COALESCE(v_p ->> 'offeringKind','') NOT IN ('product','service') THEN
      RAISE EXCEPTION 'seo_suggest_offering_kind: an offering is a product or a service (got %)', COALESCE(v_p ->> 'offeringKind','null');
    END IF;
    IF (v_p ? 'valueAdd') AND jsonb_typeof(v_p -> 'valueAdd') NOT IN ('number','null') THEN
      RAISE EXCEPTION 'seo_suggest_offering_value: valueAdd is a number of points or null';
    END IF;
    v_p := v_p || jsonb_build_object('name', btrim(v_p ->> 'name'));
  END IF;

  v_hash   := md5(v_p::text);
  v_dedupe := 'seo.keyword_meaning:' || p_site_id::text || ':' || v_hash;
  v_source := 'seo.keyword_meaning.' || v_kind;

  SELECT a.id AS id, a.status AS status INTO v_existing
    FROM platform.assists a
   WHERE a.dedupe_key = v_dedupe AND a.deleted_at IS NULL
   ORDER BY (a.status = 'pending') DESC, a.created_at DESC
   LIMIT 1;

  IF v_existing.id IS NOT NULL AND v_existing.status IN ('accepted','dismissed') THEN
    RETURN QUERY SELECT v_existing.id, 'already_decided'::text, v_dedupe, v_hash, v_addressee, v_p;
    RETURN;
  END IF;

  IF v_existing.id IS NOT NULL AND v_existing.status = 'pending' THEN
    UPDATE platform.assists a
       SET title       = p_title,
           body        = p_body,
           reasoning   = p_reasoning,
           confidence  = p_confidence,
           evidence    = p_evidence,
           occurrences = a.occurrences + 1,
           updated_at  = now()
     WHERE a.id = v_existing.id;
    RETURN QUERY SELECT v_existing.id, 'already_pending'::text, v_dedupe, v_hash, v_addressee, v_p;
    RETURN;
  END IF;

  v_action := jsonb_build_object(
    'kind',        'apply_keyword_meaning',
    'siteId',      p_site_id,
    'siteLabel',   v_site.label,
    'proposal',    v_p,
    'provenance',  COALESCE(p_provenance, '{}'::jsonb)
                     || jsonb_build_object('proposedBy', v_uid,
                                           'proposedByAgent', v_by_agent,
                                           'addressedTo', v_addressee),
    'payloadHash', v_hash
  );

  INSERT INTO platform.assists
    (user_id, entity_type, entity_id, surface_name, source_kind, source_key,
     title, body, reasoning, confidence, action, dedupe_key, expires_at,
     priority, organization_id, evidence, first_seen_at)
  VALUES
    (v_addressee, 'web_site', p_site_id,
     'matrx-user/keyword-meaning-review', 'agent', v_source,
     p_title, p_body, p_reasoning, p_confidence, v_action, v_dedupe,
     now() + interval '30 days',
     0, v_site.organization_id, p_evidence, now())
  RETURNING assists.id INTO v_id;

  RETURN QUERY SELECT v_id, 'created'::text, v_dedupe, v_hash, v_addressee, v_p;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.keyword_placement_resolve(p_site_id uuid, p_keyword_ids uuid[])
 RETURNS TABLE(keyword_id uuid, topic_id uuid, scope_tier text, organization_id uuid, confidence smallint, assigned_by text, row_id uuid, notes text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'public', 'pg_temp'
AS $function$
DECLARE
  v_site_id uuid;
  v_brand_id uuid;
  v_org_id uuid;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF array_length(p_keyword_ids, 1) > 2000 THEN
    RAISE EXCEPTION 'seo_too_many_keywords: up to 2,000 keywords per read — ask for the page you are showing.';
  END IF;

  SELECT s.id, s.brand_id, s.organization_id
    INTO v_site_id, v_brand_id, v_org_id
    FROM web.site s
   WHERE s.id = p_site_id
     AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    perform platform.refuse_not_found(format('seo_site_not_found: %s', p_site_id));
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT kt.keyword_id, kt.topic_id, kt.scope_tier, kt.organization_id,
           kt.confidence, kt.assigned_by, kt.notes, kt.updated_at, kt.id
      FROM seo.keyword_topic kt
     WHERE kt.keyword_id = ANY (p_keyword_ids)
       AND kt.deleted_at IS NULL
       -- A non-primary row is a DEMOTED PRIOR OPINION, never a placement.
       -- gsc_set_keyword_topic removes a placement by demoting it and never by
       -- deleting it; without this line the removed topic keeps governing from
       -- the nearest rung forever.
       AND kt.is_primary
       AND (
            (kt.scope_tier = 'site' AND kt.scope_site_id = v_site_id)
         OR (kt.scope_tier = 'brand' AND v_brand_id IS NOT NULL AND kt.scope_brand_id = v_brand_id)
         OR (kt.scope_tier = 'organization' AND kt.organization_id = v_org_id)
         OR (kt.scope_tier = 'system')
       )
  )
  SELECT k.kid,
         w.topic_id,
         w.scope_tier,
         w.organization_id,
         w.confidence,
         w.assigned_by,
         w.id,
         w.notes
    FROM unnest(p_keyword_ids) AS k(kid)
    LEFT JOIN LATERAL (
      SELECT c.*
        FROM candidates c
       WHERE c.keyword_id = k.kid
       ORDER BY CASE c.scope_tier
                  WHEN 'site' THEN 0
                  WHEN 'brand' THEN 1
                  WHEN 'organization' THEN 2
                  ELSE 3
                END,
                c.updated_at DESC,
                c.id
       LIMIT 1
    ) w ON true;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.list_page_intents(p_map_id uuid, p_site_id uuid DEFAULT NULL::uuid, p_topic_slug text DEFAULT NULL::text, p_disposition text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_sites uuid[]; v_limit int; v_offset int; v_total int; v_dupes int;
        v_tid uuid; v_days int; v_perf jsonb; v_ids uuid[]; v_items jsonb;
BEGIN
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'list_page_intents: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  v_map := seo._tm_map(p_map_id, 'viewer');
  -- p_site_id NULL = every site related to this map THAT I MAY VIEW; never "all sites".
  v_sites := seo._tm_visible_sites(p_map_id, p_site_id, 'list_page_intents_denied');
  IF p_disposition IS NOT NULL AND p_disposition NOT IN ('keep','move','merge','redirect','rewrite','delete') THEN
    RAISE EXCEPTION 'list_page_intents: p_disposition must be keep|move|merge|redirect|rewrite|delete' USING ERRCODE='22023';
  END IF;
  IF p_state IS NOT NULL AND p_state NOT IN ('proposed','accepted','done') THEN
    RAISE EXCEPTION 'list_page_intents: p_state must be proposed|accepted|done' USING ERRCODE='22023';
  END IF;
  IF p_topic_slug IS NOT NULL THEN
    -- The FILTER names a live topic: a hidden one is the same P0002 as an
    -- invented slug. (A page whose coverage points at a hidden topic is still
    -- listed — see the candidate set below — it simply has no current topics.)
    v_tid := seo._tm_live_topic_id(p_map_id, p_topic_slug);
    IF v_tid IS NULL THEN perform platform.refuse_not_found(format('topic %s not found', p_topic_slug)); END IF;
  END IF;
  v_limit  := GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));

  WITH any_topics AS (
    -- ROUND 22 (DEFECT 1): CANDIDACY reads EVERY topic of this map, whatever its
    -- status. A page reached the listing only through a topic, so hiding the
    -- topic used to delete the page from the world — not covered, not uncovered,
    -- not counted. A page is always listable.
    SELECT t.id, t.slug, t.name, t.status FROM seo.map_topic t
     WHERE t.map_id = p_map_id AND t.deleted_at IS NULL
  ), intents_all AS (
    SELECT a.source_id AS page_id, a.target_id AS topic_id, a.payload, a.created_at, a.id
      FROM platform.associations a JOIN any_topics t ON t.id = a.target_id
     WHERE a.source_type='web_page' AND a.target_type='seo_map_topic' AND a.role='intent' AND a.deleted_at IS NULL
  ), intents AS (
    SELECT DISTINCT ON (i.page_id) i.* FROM intents_all i
     ORDER BY i.page_id, i.created_at DESC, i.id DESC
  ), covers AS (
    SELECT a.source_id AS page_id, a.target_id AS topic_id, a.payload
      FROM platform.associations a JOIN any_topics t ON t.id = a.target_id
     WHERE a.source_type='web_page' AND a.target_type='seo_map_topic' AND a.role='covers' AND a.deleted_at IS NULL
  ), candidate AS (
    SELECT p.id, p.url, p.site_id
      FROM web.page p
     WHERE p.deleted_at IS NULL AND p.site_id = ANY(v_sites)
       AND (EXISTS (SELECT 1 FROM intents i WHERE i.page_id = p.id)
            OR EXISTS (SELECT 1 FROM covers c WHERE c.page_id = p.id))
  ), filtered AS (
    SELECT c.* FROM candidate c
     WHERE (p_disposition IS NULL OR EXISTS (SELECT 1 FROM intents i WHERE i.page_id=c.id AND i.payload->>'disposition' = p_disposition))
       AND (p_state IS NULL OR EXISTS (SELECT 1 FROM intents i WHERE i.page_id=c.id AND i.payload->>'state' = p_state))
       AND (v_tid IS NULL OR EXISTS (SELECT 1 FROM intents i WHERE i.page_id=c.id AND i.topic_id = v_tid)
                          OR EXISTS (SELECT 1 FROM covers  v WHERE v.page_id=c.id AND v.topic_id = v_tid))
  )
  SELECT count(*)::int,
         COALESCE((SELECT count(*)::int - count(DISTINCT i.page_id)::int FROM intents_all i
                    WHERE i.page_id IN (SELECT id FROM filtered)), 0),
         COALESCE(array_agg(f.id ORDER BY f.url, f.id), '{}'::uuid[])
    INTO v_total, v_dupes, v_ids
    FROM filtered f;

  -- The page window, then ONE aggregate over exactly that window's pages.
  SELECT COALESCE(array_agg(x.id ORDER BY x.url, x.id), '{}'::uuid[]) INTO v_ids FROM (
    SELECT p.id, p.url FROM web.page p WHERE p.id = ANY(v_ids) ORDER BY p.url, p.id LIMIT v_limit OFFSET v_offset) x;

  v_days := seo._tm_perf_days(v_map.organization_id, CASE WHEN array_length(v_sites,1)=1 THEN v_sites[1] END);
  v_perf := seo._tm_page_perf(v_ids, v_days);

  SELECT COALESCE(jsonb_agg(row ORDER BY ord), '[]'::jsonb) INTO v_items FROM (
    SELECT row_number() OVER (ORDER BY p.url, p.id) AS ord,
      jsonb_build_object(
        'page', jsonb_strip_nulls(jsonb_build_object(
                  'type','web_page','id', p.id, 'label', p.url, 'url', p.url, 'site_id', p.site_id))
                || COALESCE(v_perf -> p.id::text, jsonb_build_object('clicks',0,'impressions',0))
                || jsonb_build_object('performance_window_days', v_days),
        -- ROUND 22: a CURRENT topic is a LIVE topic. Coverage into a retired or
        -- rejected topic is not somewhere the page currently sits — every reader
        -- hides that topic — so the page is listed with current_topics: [] and
        -- seo.map_diagnostics counts it as being on no topic.
        'current_topics', COALESCE((
            SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     'slug', t.slug, 'name', t.name,
                     'confidence', (a.payload->>'confidence')::int,
                     'source', a.payload->>'source')) ORDER BY (a.payload->>'confidence')::int DESC NULLS LAST, t.slug)
              FROM platform.associations a
              JOIN seo.map_topic t ON t.id = a.target_id AND t.map_id = p_map_id AND t.deleted_at IS NULL
                                  AND t.status IN ('proposed','active')
             WHERE a.source_type='web_page' AND a.source_id = p.id AND a.target_type='seo_map_topic'
               AND a.role='covers' AND a.deleted_at IS NULL), '[]'::jsonb),
        -- The intent SURVIVES its topic being hidden — it is a decision somebody
        -- made and it is still true — but `topic` is rendered only while that
        -- topic is live, so the screen never offers a destination that is gone.
        'intent', (
            SELECT jsonb_strip_nulls(jsonb_build_object(
                     'topic', CASE WHEN t.status IN ('proposed','active')
                                   THEN jsonb_build_object('slug', t.slug, 'name', t.name) END,
                     'disposition', i.payload->>'disposition',
                     'state',       i.payload->>'state',
                     'source',      i.payload->>'source',
                     'note',        i.payload->>'note',
                     'into', CASE
                               WHEN NULLIF(i.payload->>'into_page_id','') IS NOT NULL
                                 THEN seo._tm_ref('web_page',  (i.payload->>'into_page_id')::uuid)
                               WHEN NULLIF(i.payload->>'into_node_id','') IS NOT NULL
                                 THEN seo._tm_ref('plan_node', (i.payload->>'into_node_id')::uuid)
                               ELSE NULL END,
                     'updated_at', to_jsonb(i.created_at)))
              FROM (SELECT DISTINCT ON (a.source_id) a.* FROM platform.associations a
                     WHERE a.source_type='web_page' AND a.source_id = p.id AND a.target_type='seo_map_topic'
                       AND a.role='intent' AND a.deleted_at IS NULL
                     ORDER BY a.source_id, a.created_at DESC, a.id DESC) i
              JOIN seo.map_topic t ON t.id = i.target_id AND t.map_id = p_map_id AND t.deleted_at IS NULL)
      ) AS row, p.url, p.id
      FROM web.page p WHERE p.id = ANY(v_ids)
  ) y;

  RETURN jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset,
                            'performance_window_days', v_days,
                            'duplicate_intents', v_dupes, 'items', v_items);
END $function$;

CREATE OR REPLACE FUNCTION seo.list_pages_without_topic(p_site_id uuid, p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map uuid; v_limit int; v_offset int; v_total bigint; v_items jsonb;
BEGIN
  IF p_site_id IS NULL THEN RAISE EXCEPTION 'list_pages_without_topic: p_site_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  -- Access FIRST, and the same answer for a foreign site and an invented one.
  PERFORM seo._tm_site(p_site_id, 'viewer'::public.permission_level, 'list_pages_without_topic_denied');
  v_map := seo.site_map_id(p_site_id);
  IF v_map IS NULL THEN
    perform platform.refuse_not_found(format('site %s uses no topical map (call seo.set_site_map first)', p_site_id));
  END IF;
  v_limit  := LEAST(1000, GREATEST(1, COALESCE(p_limit, 200)));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));

  WITH covered AS (
    SELECT DISTINCT a.source_id AS pid
      FROM platform.associations a
      JOIN seo.map_topic t ON t.id = a.target_id AND t.map_id = v_map AND t.deleted_at IS NULL
                          AND t.status IN ('proposed','active')
     WHERE a.source_type='web_page' AND a.target_type='seo_map_topic' AND a.role='covers' AND a.deleted_at IS NULL
  ),
  bare AS (
    SELECT p.id, p.url
      FROM web.page p
     WHERE p.site_id = p_site_id AND p.deleted_at IS NULL AND p.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM covered c WHERE c.pid = p.id)
  ),
  ranked AS (
    SELECT b.id, b.url,
           q.status AS queue_status, q.mapping_source, q.last_error,
           COALESCE(q.priority_clicks, 0) AS clicks,
           seo._tm_rendition_of(p_site_id, b.url) AS rendition_of
      FROM bare b
      LEFT JOIN seo.page_mapping_queue q ON q.site_id = p_site_id AND q.page_id = b.id
  )
  SELECT count(*), COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'page_id', r.id, 'url', r.url, 'clicks', r.clicks,
           'queue_status', r.queue_status, 'mapping_source', r.mapping_source,
           'last_error', r.last_error,
           'rendition_of', r.rendition_of))
         ORDER BY r.clicks DESC, r.url) FILTER (WHERE r.rn > v_offset AND r.rn <= v_offset + v_limit), '[]'::jsonb)
    INTO v_total, v_items
    FROM (SELECT ranked.*, row_number() OVER (ORDER BY clicks DESC, url) AS rn FROM ranked) r;

  RETURN jsonb_build_object('site_id', p_site_id, 'map_id', v_map, 'total', v_total,
                            'limit', v_limit, 'offset', v_offset, 'items', v_items);
END $function$;

CREATE OR REPLACE FUNCTION seo.map_outline(p_map_id uuid, p_focus_slug text DEFAULT NULL::text, p_site_id uuid DEFAULT NULL::uuid, p_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_map record; v_ov_min int; v_ov_max int; v_nb_min int; v_nb_max int; v_desc_cap int; v_total_cap int;
  v_focus uuid; v_focus_depth int; v_focus_path uuid[];
  v_level int := 0; v_count int := 0; v_level_size int; v_room int;
  v_dist int; v_nb int; v_anc uuid;
  v_out text; v_pass int := 0; v_len int;
  v_topics jsonb; v_sel jsonb := '[]'::jsonb;
BEGIN
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'map_outline: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  v_map := seo._tm_map(p_map_id, 'viewer');
  PERFORM seo._tm_visible_sites(p_map_id, p_site_id, 'map_outline_denied');
  v_ov_min   := seo._tm_knob_int('overview_min_nodes', v_map.organization_id, v_map.brand_id, p_site_id, p_overrides);
  v_ov_max   := seo._tm_knob_int('overview_max_nodes', v_map.organization_id, v_map.brand_id, p_site_id, p_overrides);
  v_nb_min   := seo._tm_knob_int('neighborhood_min_nodes', v_map.organization_id, v_map.brand_id, p_site_id, p_overrides);
  v_nb_max   := seo._tm_knob_int('neighborhood_max_nodes', v_map.organization_id, v_map.brand_id, p_site_id, p_overrides);
  v_desc_cap := seo._tm_knob_int('outline_description_max_chars', v_map.organization_id, v_map.brand_id, p_site_id, p_overrides);
  v_total_cap:= seo._tm_knob_int('outline_max_chars', v_map.organization_id, v_map.brand_id, p_site_id, p_overrides);

  v_topics := seo._tm_topics(p_map_id, p_site_id);

  IF p_focus_slug IS NOT NULL THEN
    SELECT t.id, t.depth, t.path INTO v_focus, v_focus_depth, v_focus_path
      FROM jsonb_populate_recordset(NULL::seo.tm_topic, v_topics) t WHERE t.slug = p_focus_slug;
    IF v_focus IS NULL THEN perform platform.refuse_not_found(format('focus topic %s not found (or retired)', p_focus_slug)); END IF;
  END IF;

  -- ROUND 17: every `x NOT IN (SELECT s.id …)` is a `NOT EXISTS`. NOT IN over a
  -- set holding one NULL is NULL for every row, i.e. it silently selects nothing.
  LOOP
    SELECT count(*) INTO v_level_size FROM jsonb_populate_recordset(NULL::seo.tm_topic, v_topics) t WHERE t.depth = v_level;
    EXIT WHEN v_level_size = 0;
    IF v_count + v_level_size <= v_ov_max THEN
      v_sel := v_sel || (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'why', 'overview', 'dist', 0)), '[]'::jsonb)
                           FROM jsonb_populate_recordset(NULL::seo.tm_topic, v_topics) t
                          WHERE t.depth = v_level
                            AND NOT EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::seo.tm_sel, v_sel) s WHERE s.id = t.id));
      v_count := v_count + v_level_size;
      EXIT WHEN v_count >= v_ov_min;
      v_level := v_level + 1;
    ELSE
      v_room := GREATEST(0, v_ov_max - v_count);
      IF v_count < v_ov_min AND v_room > 0 THEN
        v_sel := v_sel || (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', x.id, 'why', 'overview', 'dist', 0)), '[]'::jsonb)
                             FROM (SELECT t.id FROM jsonb_populate_recordset(NULL::seo.tm_topic, v_topics) t
                                    WHERE t.depth = v_level
                                      AND NOT EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::seo.tm_sel, v_sel) s WHERE s.id = t.id)
                                    ORDER BY (v_focus_path IS NOT NULL AND t.path[1:v_level] = v_focus_path[1:v_level]) DESC, t.spath
                                    LIMIT v_room) x);
      END IF;
      EXIT;
    END IF;
  END LOOP;

  IF v_focus IS NOT NULL THEN
    v_sel := v_sel || (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', u, 'why', 'path', 'dist', 0)), '[]'::jsonb)
                         FROM unnest(v_focus_path) u
                        WHERE NOT EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::seo.tm_sel, v_sel) s WHERE s.id = u));
    v_sel := v_sel || (SELECT CASE WHEN v_focus IN (SELECT s.id FROM jsonb_populate_recordset(NULL::seo.tm_sel, v_sel) s)
                                   THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('id', v_focus, 'why', 'focus', 'dist', 0)) END);
    v_sel := v_sel || (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'why', 'neighborhood', 'dist', 0)), '[]'::jsonb)
                         FROM jsonb_populate_recordset(NULL::seo.tm_topic, v_topics) t
                        WHERE t.parent_id = v_focus
                          AND NOT EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::seo.tm_sel, v_sel) s WHERE s.id = t.id));
    v_dist := 1;
    LOOP
      SELECT count(*) INTO v_nb FROM jsonb_populate_recordset(NULL::seo.tm_sel, v_sel) s WHERE s.why IN ('focus','neighborhood');
      EXIT WHEN v_nb >= v_nb_min;
      EXIT WHEN v_dist > v_focus_depth;
      v_anc := v_focus_path[v_focus_depth + 1 - v_dist];
      v_sel := v_sel || (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', x.id, 'why', 'neighborhood', 'dist', v_dist)), '[]'::jsonb)
                           FROM (SELECT t.id FROM jsonb_populate_recordset(NULL::seo.tm_topic, v_topics) t
                                  WHERE t.depth = v_focus_depth AND t.path[v_focus_depth + 1 - v_dist] = v_anc
                                    AND NOT EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::seo.tm_sel, v_sel) s WHERE s.id = t.id)
                                  ORDER BY t.spath
                                  LIMIT GREATEST(0, v_nb_max - v_nb)) x);
      v_dist := v_dist + 1;
    END LOOP;
    v_sel := (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', k.id, 'why', k.why, 'dist', k.dist)), '[]'::jsonb)
                FROM (SELECT s.id, s.why, s.dist,
                             CASE WHEN s.why IN ('focus','neighborhood')
                                  THEN row_number() OVER (PARTITION BY (s.why IN ('focus','neighborhood')) ORDER BY s.dist, t.spath) END AS rn
                        FROM jsonb_populate_recordset(NULL::seo.tm_sel, v_sel) s
                        JOIN jsonb_populate_recordset(NULL::seo.tm_topic, v_topics) t ON t.id = s.id) k
               WHERE k.why <> 'neighborhood' OR k.rn IS NULL OR k.rn <= v_nb_max);
  END IF;

  -- ancestor closure
  v_sel := v_sel || (SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', u, 'why', 'closure', 'dist', 0)), '[]'::jsonb)
                       FROM jsonb_populate_recordset(NULL::seo.tm_topic, v_topics) t
                       JOIN jsonb_populate_recordset(NULL::seo.tm_sel, v_sel) s ON s.id = t.id
                       CROSS JOIN LATERAL unnest(t.path[1:array_length(t.path,1)-1]) u
                      WHERE array_length(t.path,1) > 1
                        AND NOT EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::seo.tm_sel, v_sel) s2 WHERE s2.id = u));

  v_pass := 0;
  LOOP
    WITH sel AS (
      SELECT t.* FROM jsonb_populate_recordset(NULL::seo.tm_topic, v_topics) t
       WHERE t.id IN (SELECT s.id FROM jsonb_populate_recordset(NULL::seo.tm_sel, v_sel) s)
    ), lines AS (
      SELECT s.spath AS spath,
             repeat('  ', s.depth) || s.slug || ' | ' || s.name
             || CASE WHEN s.description IS NOT NULL AND s.description <> ''
                     THEN ' — ' || seo._tm_cut(s.description, v_desc_cap) ELSE '' END
             || format(' (%s pages, %s planned, %s keywords)', s.page_count, s.planned_count, s.keyword_count)
             || CASE WHEN s.status = 'proposed' THEN ' [proposed]' ELSE '' END
             || CASE WHEN s.id = v_focus THEN ' [focus]' ELSE '' END AS line
        FROM sel s
      UNION ALL
      SELECT s.spath || ARRAY['zzzzzzzzzz'::text],
             repeat('  ', s.depth + 1) || format('… (+%s more topics)', h.n)
        FROM sel s
        JOIN LATERAL (SELECT count(*) AS n FROM jsonb_populate_recordset(NULL::seo.tm_topic, v_topics) c
                       WHERE c.parent_id = s.id
                         AND NOT EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::seo.tm_sel, v_sel) x WHERE x.id = c.id)) h ON true
       WHERE h.n > 0
    )
    SELECT COALESCE(string_agg(l.line, E'\n' ORDER BY l.spath COLLATE "C"), '') || E'\n' INTO v_out FROM lines l;
    v_len := length(v_out);
    EXIT WHEN v_len <= v_total_cap OR v_pass >= 12 OR v_desc_cap <= 40;
    v_desc_cap := GREATEST(40, v_desc_cap / 2);
    v_pass := v_pass + 1;
  END LOOP;
  RETURN v_out;
END $function$;

CREATE OR REPLACE FUNCTION seo.map_topic_associations(p_map_id uuid, p_slug text, p_kinds text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_tid uuid; v_kinds text[]; v_out jsonb;
BEGIN
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'map_topic_associations: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_slug IS NULL THEN RAISE EXCEPTION 'map_topic_associations: p_slug is required (got NULL)' USING ERRCODE='22023'; END IF;
  v_map := seo._tm_map(p_map_id, 'viewer');
  SELECT t.id INTO v_tid FROM seo.map_topic t
   WHERE t.map_id = p_map_id AND t.slug = p_slug AND t.deleted_at IS NULL AND t.status <> 'rejected';
  IF v_tid IS NULL THEN perform platform.refuse_not_found(format('topic %s not found', p_slug)); END IF;
  IF p_kinds IS NOT NULL THEN
    SELECT COALESCE(array_agg(seo._tm_kind_alias(k)), '{}'::text[]) INTO v_kinds FROM unnest(p_kinds) k;
  END IF;

  WITH edges AS (
    SELECT a.source_type AS kind, 'in'::text AS direction, a.role, a.payload, a.source_type AS item_type, a.source_id AS item_id, a.created_at
      FROM platform.associations a WHERE a.target_type='seo_map_topic' AND a.target_id=v_tid AND a.deleted_at IS NULL
    UNION ALL
    SELECT a.target_type, 'out', a.role, a.payload, a.target_type, a.target_id, a.created_at
      FROM platform.associations a WHERE a.source_type='seo_map_topic' AND a.source_id=v_tid AND a.deleted_at IS NULL
    UNION ALL
    SELECT 'plan_node', 'in', 'home', NULL, 'plan_node', n.id, n.created_at FROM plan.node n WHERE n.topic_id=v_tid AND n.deleted_at IS NULL
    UNION ALL
    SELECT 'seo_keyword', 'in', 'home', jsonb_build_object('site_id', v.site_id), 'seo_keyword', v.keyword_id, v.created_at
      FROM seo.site_keyword_value v WHERE v.topic_id=v_tid AND v.deleted_at IS NULL
  ), resolved AS (
    SELECT e.*, seo._tm_item(e.item_type, e.item_id) AS item
      FROM edges e
     WHERE p_kinds IS NULL OR e.kind = ANY(v_kinds)
  ), visible AS (
    SELECT r.*
      FROM resolved r
     WHERE NOT (r.item ? 'forbidden' OR r.item ? 'missing' OR r.item ? 'unregistered')
       AND (r.item_type <> 'seo_keyword'
            OR (public.is_platform_admin()
                OR iam.has_access('web_site', (r.payload->>'site_id')::uuid, 'viewer'::public.permission_level)) IS TRUE)
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'topic', p_slug,
             'association', jsonb_strip_nulls(jsonb_build_object('kind', j.kind, 'role', j.role, 'direction', j.direction, 'payload', j.payload)),
             'item', j.item ||
                     CASE WHEN j.item_type='seo_map_facet_value'
                          THEN COALESCE((SELECT jsonb_build_object('facet', f.key, 'ref', seo._tm_ref(fv.ref_type, fv.ref_id))
                                           FROM seo.map_facet_value fv JOIN seo.map_facet f ON f.id=fv.facet_id WHERE fv.id=j.item_id), '{}'::jsonb)
                          ELSE '{}'::jsonb END)
           ORDER BY j.kind, j.direction, j.created_at, j.item_id), '[]'::jsonb)
    INTO v_out
    FROM visible j;
  RETURN v_out;
END $function$;

CREATE OR REPLACE FUNCTION seo.map_topic_facets(p_map_id uuid, p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_tid uuid; v_out jsonb;
BEGIN
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'map_topic_facets: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_slug IS NULL THEN RAISE EXCEPTION 'map_topic_facets: p_slug is required (got NULL)' USING ERRCODE='22023'; END IF;
  v_map := seo._tm_map(p_map_id, 'viewer');
  SELECT t.id INTO v_tid FROM seo.map_topic t
   WHERE t.map_id = p_map_id AND t.slug = p_slug AND t.deleted_at IS NULL AND t.status <> 'rejected';
  IF v_tid IS NULL THEN perform platform.refuse_not_found(format('topic %s not found in map %s', p_slug, p_map_id)); END IF;
  SELECT COALESCE(jsonb_object_agg(f.facet_key, jsonb_build_object(
           'value_slug', f.value_slug, 'value_name', f.value_name, 'inherited', f.inherited,
           'ref', seo.map_facet_value_ref(f.value_id))), '{}'::jsonb)
    INTO v_out
    FROM seo._tm_topic_facets_all(p_map_id) f WHERE f.topic_id = v_tid;
  RETURN v_out;
END $function$;

CREATE OR REPLACE FUNCTION seo.map_tree(p_map_id uuid, p_root_slug text DEFAULT NULL::text, p_depth integer DEFAULT NULL::integer, p_include text[] DEFAULT '{}'::text[], p_site_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_root uuid; v_out jsonb; v_topics jsonb; v_facets jsonb := '[]'::jsonb;
BEGIN
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'map_tree: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  v_map := seo._tm_map(p_map_id, 'viewer');
  PERFORM seo._tm_visible_sites(p_map_id, p_site_id, 'map_tree_denied');
  v_topics := seo._tm_topics(p_map_id, p_site_id);
  IF 'facets' = ANY(p_include) THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(f)), '[]'::jsonb) INTO v_facets FROM seo._tm_topic_facets_all(p_map_id) f;
  END IF;
  IF p_root_slug IS NOT NULL THEN
    SELECT t.id INTO v_root FROM jsonb_populate_recordset(NULL::seo.tm_topic, v_topics) t WHERE t.slug = p_root_slug;
    IF v_root IS NULL THEN perform platform.refuse_not_found(format('topic %s not found (or retired)', p_root_slug)); END IF;
    v_out := seo._tm_tree_node(p_map_id, v_topics, v_facets, v_root, p_depth, p_include);
    RETURN jsonb_build_object('map_id', p_map_id, 'root', p_root_slug, 'topic', v_out);
  END IF;
  SELECT COALESCE(jsonb_agg(seo._tm_tree_node(p_map_id, v_topics, v_facets, t.id,
                                              CASE WHEN p_depth IS NULL THEN NULL ELSE p_depth - 1 END, p_include) ORDER BY t.spath), '[]'::jsonb)
    INTO v_out FROM jsonb_populate_recordset(NULL::seo.tm_topic, v_topics) t WHERE t.parent_id IS NULL;
  RETURN jsonb_build_object('map_id', p_map_id, 'root', NULL, 'topics', v_out,
                            'total_topics', jsonb_array_length(v_topics));
END $function$;

CREATE OR REPLACE FUNCTION seo.merge_map_topics(p_map_id uuid, p_from_slugs text[], p_into_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_into uuid; v_from uuid[]; v_assoc int := 0; v_nodes int := 0; v_kw int := 0; v_children int := 0; v_dup int := 0; n int;
        v_org uuid;
BEGIN
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'merge_map_topics: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_from_slugs IS NULL THEN RAISE EXCEPTION 'merge_map_topics: p_from_slugs is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_into_slug IS NULL THEN RAISE EXCEPTION 'merge_map_topics: p_into_slug is required (got NULL)' USING ERRCODE='22023'; END IF;
  v_map := seo._tm_map(p_map_id, 'editor');
  v_org := v_map.organization_id;
  -- ROUND 22: merging into a retired or rejected topic buries every attachment
  -- it moves. A DESTINATION must be live.
  v_into := seo._tm_live_topic_id(p_map_id, p_into_slug);
  IF v_into IS NULL THEN perform platform.refuse_not_found(format('target topic %s not found', p_into_slug)); END IF;
  SELECT array_agg(id) INTO v_from FROM seo.map_topic
   WHERE map_id = p_map_id AND slug = ANY(p_from_slugs) AND deleted_at IS NULL AND id <> v_into;
  IF v_from IS NULL OR array_length(v_from,1) <> array_length(p_from_slugs,1) THEN
    perform platform.refuse_not_found('merge_map_topics: one or more source slugs not found (or equal to the target)');
  END IF;

  -- ROUND 18: rows filed under another organization are never touched (every
  -- statement below is scoped to v_org) and never counted in the result.

  DELETE FROM platform.associations a
   USING seo.map_facet_value v, seo.map_facet_value tv, platform.associations ta
   WHERE a.source_type='seo_map_topic' AND a.source_id = ANY(v_from) AND a.target_type='seo_map_facet_value' AND a.role='facet'
     AND a.organization_id = v_org
     AND v.id = a.target_id
     AND ta.source_type='seo_map_topic' AND ta.source_id = v_into AND ta.target_type='seo_map_facet_value' AND ta.role='facet' AND ta.deleted_at IS NULL
     AND tv.id = ta.target_id AND tv.facet_id = v.facet_id;
  GET DIAGNOSTICS v_dup = ROW_COUNT;

  -- ROUND 23: when the topic being removed AND the target BOTH hold an edge
  -- from the same row with the same role, only one survives the move. It
  -- used to be the target's, whoever wrote it — so a merge could silently
  -- drop a person's edge and keep a mapper's. The higher source wins; an
  -- equal one leaves the target untouched. The payload MOVES INTACT: no
  -- mover re-stamps `source`.
  UPDATE platform.associations t
     SET payload_kind = f.payload_kind, payload = f.payload
    FROM platform.associations f
   WHERE t.target_type='seo_map_topic' AND t.target_id = v_into AND t.organization_id = v_org
     AND f.target_type='seo_map_topic' AND f.target_id = ANY(v_from) AND f.organization_id = v_org
     AND f.source_type = t.source_type AND f.source_id = t.source_id
     AND f.role IS NOT DISTINCT FROM t.role
     AND seo._tm_source_rank(f.payload->>'source') > seo._tm_source_rank(t.payload->>'source');
  UPDATE platform.associations t
     SET payload_kind = f.payload_kind, payload = f.payload
    FROM platform.associations f
   WHERE t.source_type='seo_map_topic' AND t.source_id = v_into AND t.organization_id = v_org
     AND f.source_type='seo_map_topic' AND f.source_id = ANY(v_from) AND f.organization_id = v_org
     AND f.target_type = t.target_type AND f.target_id = t.target_id
     AND f.role IS NOT DISTINCT FROM t.role
     AND seo._tm_source_rank(f.payload->>'source') > seo._tm_source_rank(t.payload->>'source');
  UPDATE platform.associations SET source_id = v_into
   WHERE source_type='seo_map_topic' AND source_id = ANY(v_from) AND organization_id = v_org
     AND NOT EXISTS (SELECT 1 FROM platform.associations x WHERE x.source_type='seo_map_topic' AND x.source_id=v_into
                       AND x.target_type=platform.associations.target_type AND x.target_id=platform.associations.target_id AND x.role=platform.associations.role);
  GET DIAGNOSTICS n = ROW_COUNT; v_assoc := v_assoc + n;
  DELETE FROM platform.associations WHERE source_type='seo_map_topic' AND source_id = ANY(v_from) AND organization_id = v_org;
  GET DIAGNOSTICS n = ROW_COUNT; v_dup := v_dup + n;

  UPDATE platform.associations SET target_id = v_into
   WHERE target_type='seo_map_topic' AND target_id = ANY(v_from) AND organization_id = v_org
     AND NOT EXISTS (SELECT 1 FROM platform.associations x WHERE x.target_type='seo_map_topic' AND x.target_id=v_into
                       AND x.source_type=platform.associations.source_type AND x.source_id=platform.associations.source_id AND x.role=platform.associations.role);
  GET DIAGNOSTICS n = ROW_COUNT; v_assoc := v_assoc + n;
  DELETE FROM platform.associations WHERE target_type='seo_map_topic' AND target_id = ANY(v_from) AND organization_id = v_org;
  GET DIAGNOSTICS n = ROW_COUNT; v_dup := v_dup + n;

  UPDATE plan.node SET topic_id = v_into WHERE topic_id = ANY(v_from) AND organization_id = v_org;
  GET DIAGNOSTICS v_nodes = ROW_COUNT;
  UPDATE seo.site_keyword_value SET topic_id = v_into WHERE topic_id = ANY(v_from) AND organization_id = v_org;
  GET DIAGNOSTICS v_kw = ROW_COUNT;

  UPDATE seo.map_topic SET parent_id = v_into WHERE parent_id = ANY(v_from) AND map_id = p_map_id AND deleted_at IS NULL AND id <> v_into;
  GET DIAGNOSTICS v_children = ROW_COUNT;

  UPDATE seo.map_topic SET status = 'retired' WHERE id = ANY(v_from) AND map_id = p_map_id;

  RETURN jsonb_build_object('ok', true, 'into', p_into_slug, 'retired', to_jsonb(p_from_slugs),
                            'associations_moved', v_assoc, 'associations_dropped_as_duplicate', v_dup,
                            'planned_pages_moved', v_nodes, 'keywords_moved', v_kw, 'children_reparented', v_children);
END $function$;

CREATE OR REPLACE FUNCTION seo.move_map_topic(p_map_id uuid, p_slug text, p_new_parent_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_tid uuid; v_pid uuid;
BEGIN
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'move_map_topic: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_slug IS NULL THEN RAISE EXCEPTION 'move_map_topic: p_slug is required (got NULL)' USING ERRCODE='22023'; END IF;
  v_map := seo._tm_map(p_map_id, 'editor');
  v_tid := seo._tm_topic_id(p_map_id, p_slug);
  IF v_tid IS NULL THEN perform platform.refuse_not_found(format('topic %s not found', p_slug)); END IF;
  -- p_new_parent_slug NULL MEANS the root of the map.
  IF p_new_parent_slug IS NOT NULL THEN
    -- ROUND 22: moving a live branch under a retired or rejected parent hides the
    -- whole branch. A DESTINATION must be live.
    v_pid := seo._tm_live_topic_id(p_map_id, p_new_parent_slug);
    IF v_pid IS NULL THEN perform platform.refuse_not_found(format('parent topic %s not found', p_new_parent_slug)); END IF;
  END IF;
  UPDATE seo.map_topic SET parent_id = v_pid WHERE id = v_tid;
  RETURN jsonb_build_object('ok', true, 'topic', p_slug, 'parent', p_new_parent_slug);
END $function$;

CREATE OR REPLACE FUNCTION seo.propose_site_offering_from_template(p_site_id uuid, p_template_id uuid, p_keyword_ids uuid[] DEFAULT '{}'::uuid[], p_value_add numeric DEFAULT NULL::numeric, p_agent_name text DEFAULT 'Offering assigner'::text, p_reasoning text DEFAULT NULL::text, p_provenance jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(assist_id uuid, status text, keyword_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'platform', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_site      record;
  v_template  web.offering_template%ROWTYPE;
  v_dedupe    text;
  v_existing  record;
  v_ids       uuid[];
  v_phrases   jsonb;
  v_count     integer;
  v_value     numeric;
  v_proposal  jsonb;
  v_title     text;
  v_body      text;
  v_id        uuid;
  v_agent     text := COALESCE(NULLIF(btrim(COALESCE(p_agent_name, '')), ''), 'Offering assigner');
BEGIN
  SELECT s.id, s.organization_id, s.brand_id, s.created_by, COALESCE(s.name, s.domain) AS label
    INTO v_site
  FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_site.id IS NULL THEN
    perform platform.refuse_not_found(format('gsc_site_not_found: %s', p_site_id));
  END IF;
  IF v_site.brand_id IS NULL THEN
    RAISE EXCEPTION 'offering_site_has_no_brand: give this site a brand before proposing offerings for it';
  END IF;
  IF v_site.created_by IS NULL THEN
    RAISE EXCEPTION 'seo_suggest_no_addressee: site % has no owner to approve this', p_site_id;
  END IF;

  SELECT * INTO v_template FROM web.offering_template ot
  WHERE ot.id = p_template_id AND ot.status = 'active' AND ot.deleted_at IS NULL;
  IF v_template.id IS NULL THEN
    perform platform.refuse_not_found(format('offering_template_not_found: %s is not an active offering template', p_template_id));
  END IF;

  -- Already offered: there is nothing to propose; the caller places directly.
  IF seo.fn_site_available_offering_for_template(p_site_id, p_template_id) IS NOT NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'already_available'::text, 0;
    RETURN;
  END IF;

  v_dedupe := 'seo.keyword_meaning:' || p_site_id::text || ':offering-template:' || p_template_id::text;

  SELECT a.id, a.status, a.action INTO v_existing
  FROM platform.assists a
  WHERE a.dedupe_key = v_dedupe AND a.deleted_at IS NULL
  ORDER BY (a.status = 'pending') DESC, a.created_at DESC
  LIMIT 1;

  -- P12: a person already ruled on this exact proposal; never re-open it.
  IF v_existing.id IS NOT NULL AND v_existing.status <> 'pending' THEN
    RETURN QUERY SELECT v_existing.id, 'already_decided'::text, 0;
    RETURN;
  END IF;

  -- The carried keywords: the pending row's plus this run's, live keywords only.
  SELECT COALESCE(array_agg(DISTINCT k.id), '{}'::uuid[]) INTO v_ids
  FROM seo.keyword k
  WHERE k.deleted_at IS NULL
    AND k.id IN (
      SELECT unnest(COALESCE(p_keyword_ids, '{}'::uuid[]))
      UNION
      SELECT x::uuid FROM jsonb_array_elements_text(
        COALESCE(v_existing.action -> 'proposal' -> 'keywordIds', '[]'::jsonb)) AS t(x)
    );
  v_count := cardinality(v_ids);
  SELECT COALESCE(jsonb_agg(phrase), '[]'::jsonb) INTO v_phrases
  FROM (SELECT k.phrase FROM seo.keyword k WHERE k.id = ANY(v_ids) ORDER BY k.phrase LIMIT 5) s;

  -- A worth the valuer gave wins over none; a later one replaces an earlier one.
  v_value := COALESCE(p_value_add, (v_existing.action -> 'proposal' ->> 'valueAdd')::numeric);

  v_proposal := jsonb_build_object(
    'proposal',       'offering',
    'name',           v_template.name,
    'offeringKind',   v_template.kind,
    'description',    v_template.description,
    'aliases',        COALESCE(v_template.aliases, '[]'::jsonb),
    'valueAdd',       v_value,
    'templateId',     v_template.id,
    'keywordIds',     to_jsonb(v_ids),
    'keywordCount',   v_count,
    'keywordPhrases', v_phrases
  );
  v_title := format('Offer the %s "%s" on %s', v_template.kind, v_template.name, v_site.label);
  v_body := CASE WHEN v_count > 0
    THEN format('The %s placed %s keyword%s on "%s", but this site does not offer it. Nothing was placed and it was not added. Approve to offer it here and place those keywords on it.',
                v_agent, v_count, CASE WHEN v_count = 1 THEN '' ELSE 's' END, v_template.name)
    ELSE format('The %s valued "%s", but this site does not offer it. Nothing was added. Approve to offer it here.',
                v_agent, v_template.name)
  END;

  IF v_existing.id IS NOT NULL THEN
    UPDATE platform.assists a
       SET title       = v_title,
           body        = v_body,
           reasoning   = COALESCE(p_reasoning, a.reasoning),
           action      = jsonb_set(jsonb_set(a.action, '{proposal}', v_proposal),
                                   '{payloadHash}', to_jsonb(md5(v_proposal::text))),
           occurrences = a.occurrences + 1,
           expires_at  = now() + interval '30 days',
           updated_at  = now()
     WHERE a.id = v_existing.id;
    RETURN QUERY SELECT v_existing.id, 'already_pending'::text, v_count;
    RETURN;
  END IF;

  INSERT INTO platform.assists
    (user_id, entity_type, entity_id, surface_name, source_kind, source_key,
     title, body, reasoning, confidence, action, dedupe_key, expires_at,
     priority, organization_id, evidence, first_seen_at)
  VALUES
    (v_site.created_by, 'web_site', p_site_id,
     'matrx-user/keyword-meaning-review', 'agent', 'seo.keyword_meaning.offering',
     v_title, v_body, p_reasoning, NULL,
     jsonb_build_object(
       'kind',        'apply_keyword_meaning',
       'siteId',      p_site_id,
       'siteLabel',   v_site.label,
       'proposal',    v_proposal,
       'provenance',  COALESCE(p_provenance, '{}'::jsonb)
                        || jsonb_build_object('agentName', v_agent,
                                              'proposedByAgent', true,
                                              'addressedTo', v_site.created_by),
       'payloadHash', md5(v_proposal::text)
     ),
     v_dedupe, now() + interval '30 days',
     0, v_site.organization_id, NULL, now())
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, 'created'::text, v_count;
END
$function$;

CREATE OR REPLACE FUNCTION seo.reject_map_topics(p_map_id uuid, p_slugs text[], p_on_attachments text DEFAULT 'error'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_ids uuid[]; v_missing text[];
BEGIN
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'reject_map_topics: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_slugs IS NULL THEN RAISE EXCEPTION 'reject_map_topics: p_slugs is required (got NULL)' USING ERRCODE='22023'; END IF;
  v_map := seo._tm_map(p_map_id, 'editor');
  SELECT array_agg(t.id) INTO v_ids FROM seo.map_topic t
   WHERE t.map_id = p_map_id AND t.slug = ANY(p_slugs) AND t.deleted_at IS NULL AND t.status <> 'rejected';
  SELECT array_agg(s) INTO v_missing FROM unnest(p_slugs) s
   WHERE NOT EXISTS (SELECT 1 FROM seo.map_topic t WHERE t.map_id=p_map_id AND t.slug=s AND t.deleted_at IS NULL AND t.status <> 'rejected');
  IF v_missing IS NOT NULL THEN perform platform.refuse_not_found(format('topics not found or already rejected: %s', v_missing)); END IF;
  RETURN jsonb_build_object('ok', true, 'rejected',
    seo._tm_reject_topics(p_map_id, v_ids, COALESCE(p_on_attachments, 'error')));
END $function$;

CREATE OR REPLACE FUNCTION seo.replace_map_section(p_map_id uuid, p_parent_slug text, p_children jsonb, p_on_removed text DEFAULT 'error'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_parent uuid; v_payload_slugs text[]; v_existing uuid[]; v_removed uuid[]; v_moved_in text[]; v_tree jsonb; v_up jsonb; v_rep jsonb;
BEGIN
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'replace_map_section: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  -- ROUND 17 (A): this NULL used to walk past `jsonb_typeof(...) <> 'array'`
  -- and retire the whole section. An empty section is `[]`, said on purpose.
  IF p_children IS NULL THEN
    RAISE EXCEPTION 'replace_map_section: p_children is required (got NULL); pass [] to empty the section' USING ERRCODE='22023';
  END IF;
  v_map := seo._tm_map(p_map_id, 'editor');
  -- p_parent_slug NULL MEANS the root level of the map.
  IF p_parent_slug IS NOT NULL THEN
    v_parent := seo._tm_topic_id(p_map_id, p_parent_slug);
    IF v_parent IS NULL THEN perform platform.refuse_not_found(format('parent topic %s not found', p_parent_slug)); END IF;
  END IF;
  IF jsonb_typeof(p_children) <> 'array' THEN RAISE EXCEPTION 'p_children must be a JSON array' USING ERRCODE='22023'; END IF;

  WITH RECURSIVE flat AS (
    SELECT e.value AS node, 0 AS lvl FROM jsonb_array_elements(p_children) e
    UNION ALL
    SELECT c.value, flat.lvl + 1 FROM flat, jsonb_array_elements(COALESCE(flat.node->'children','[]'::jsonb)) c WHERE flat.lvl < 200
  )
  SELECT array_agg(node->>'slug') INTO v_payload_slugs FROM flat;

  WITH RECURSIVE sub AS (
    SELECT t.id FROM seo.map_topic t WHERE t.map_id = p_map_id AND t.deleted_at IS NULL AND t.status <> 'retired' AND t.parent_id IS NOT DISTINCT FROM v_parent
    UNION ALL
    SELECT t.id FROM seo.map_topic t JOIN sub ON t.parent_id = sub.id WHERE t.deleted_at IS NULL AND t.status <> 'retired'
  )
  SELECT array_agg(id) INTO v_existing FROM sub;

  SELECT array_agg(t.slug) INTO v_moved_in FROM seo.map_topic t
   WHERE t.map_id = p_map_id AND t.deleted_at IS NULL AND t.slug = ANY(v_payload_slugs)
     AND (t.id = ANY(COALESCE(v_existing,'{}'))) IS NOT TRUE;

  SELECT jsonb_agg(CASE WHEN p_parent_slug IS NULL THEN c ELSE c || jsonb_build_object('parent_slug', p_parent_slug) END) INTO v_tree
    FROM jsonb_array_elements(p_children) c;
  IF p_parent_slug IS NULL THEN
    SELECT jsonb_agg(c || jsonb_build_object('parent_slug', NULL)) INTO v_tree FROM jsonb_array_elements(p_children) c;
  END IF;
  v_up := seo.upsert_map_topics(p_map_id, COALESCE(v_tree, '[]'::jsonb));
  IF p_parent_slug IS NULL THEN
    UPDATE seo.map_topic SET parent_id = NULL
     WHERE map_id = p_map_id AND deleted_at IS NULL AND parent_id IS NOT NULL
       AND slug IN (SELECT c->>'slug' FROM jsonb_array_elements(p_children) c);
  END IF;

  -- `NOT (slug = ANY(arr))` is NULL when arr holds a NULL, and a NULL here would
  -- have KEPT a topic that the payload dropped. IS NOT TRUE removes it.
  SELECT array_agg(t.id) INTO v_removed FROM seo.map_topic t
   WHERE t.id = ANY(COALESCE(v_existing,'{}')) AND (t.slug = ANY(COALESCE(v_payload_slugs,'{}'))) IS NOT TRUE;
  v_rep := '[]'::jsonb;
  IF v_removed IS NOT NULL THEN
    v_rep := seo._tm_remove_topics(p_map_id, v_removed, COALESCE(p_on_removed, 'error'), false);
  END IF;
  RETURN v_up || jsonb_build_object('moved_in', COALESCE(to_jsonb(v_moved_in), '[]'::jsonb), 'removed', v_rep);
END $function$;

CREATE OR REPLACE FUNCTION seo.retire_map_topics(p_map_id uuid, p_slugs text[], p_on_attachments text DEFAULT 'error'::text, p_lift_children boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_ids uuid[]; v_missing text[];
BEGIN
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'retire_map_topics: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_slugs IS NULL THEN RAISE EXCEPTION 'retire_map_topics: p_slugs is required (got NULL)' USING ERRCODE='22023'; END IF;
  v_map := seo._tm_map(p_map_id, 'editor');
  SELECT array_agg(t.id) INTO v_ids FROM seo.map_topic t WHERE t.map_id = p_map_id AND t.slug = ANY(p_slugs) AND t.deleted_at IS NULL AND t.status <> 'retired';
  SELECT array_agg(s) INTO v_missing FROM unnest(p_slugs) s WHERE NOT EXISTS (SELECT 1 FROM seo.map_topic t WHERE t.map_id=p_map_id AND t.slug=s AND t.deleted_at IS NULL AND t.status <> 'retired');
  IF v_missing IS NOT NULL THEN perform platform.refuse_not_found(format('topics not found or already retired: %s', v_missing)); END IF;
  -- NULL policy = the declared default 'error'; NULL lift = the declared default
  -- true (it used to mean false, and left the children under a retired parent —
  -- which every reader then hides).
  RETURN jsonb_build_object('ok', true, 'removed',
    seo._tm_remove_topics(p_map_id, v_ids, COALESCE(p_on_attachments, 'error'), COALESCE(p_lift_children, true)));
END $function$;

CREATE OR REPLACE FUNCTION seo.set_ai_autonomy(p_scope text, p_id uuid DEFAULT NULL::uuid, p_capability text DEFAULT NULL::text, p_mode text DEFAULT NULL::text, p_timeout_hours integer DEFAULT NULL::integer, p_clear boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
DECLARE v_all jsonb; v_entry jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM seo.ai_capability WHERE slug = p_capability) THEN
    RAISE EXCEPTION 'seo_autonomy_unknown_capability: there is no AI step named "%"', COALESCE(p_capability,'null');
  END IF;
  IF NOT seo.fn_value_settings_may_edit(p_scope, p_id) THEN
    RAISE EXCEPTION 'seo_autonomy_denied: you do not have permission to change these settings' USING ERRCODE='42501';
  END IF;
  IF NOT p_clear AND (p_mode IS NULL OR p_mode NOT IN ('auto_platform','auto_org','review_timeout','review_required','off')) THEN
    RAISE EXCEPTION 'seo_autonomy_bad_mode: choose one of auto_platform, auto_org, review_timeout, review_required, off';
  END IF;
  IF NOT p_clear AND p_mode = 'review_timeout' AND COALESCE(p_timeout_hours,0) <= 0 THEN
    RAISE EXCEPTION 'seo_autonomy_needs_timeout: "review then apply" needs how long to wait';
  END IF;

  IF p_scope = 'platform' THEN
    SELECT COALESCE(k.value,'{}'::jsonb) INTO v_all FROM platform.feature_knob k
     WHERE k.feature='seo.ai_autonomy' AND k.key='modes';
    v_all := COALESCE(v_all,'{}'::jsonb);
    IF p_clear THEN
      RAISE EXCEPTION 'seo_autonomy_platform_is_the_floor: the platform tier has nothing above it — change the mode instead of clearing it';
    END IF;
    v_entry := jsonb_strip_nulls(jsonb_build_object('mode', p_mode, 'timeout_hours', p_timeout_hours));
    v_all := v_all || jsonb_build_object(p_capability, v_entry);
    INSERT INTO platform.feature_knob (feature, key, value, default_value, value_type, label, description, set_by, basis, review_due)
    VALUES ('seo.ai_autonomy','modes', v_all, '{}'::jsonb, 'json',
            'AI autonomy modes', 'Which of the five human-in-the-loop modes each Keyword Intelligence AI step runs in by default (KI-044).',
            'human', 'Set by a platform admin in the admin settings screen.', (now() + interval '90 days')::date)
    ON CONFLICT (feature, key) DO UPDATE SET value = v_all, updated_at = now(), updated_by = (SELECT auth.uid()), set_by='human';
  ELSE
    IF p_scope = 'org' THEN
      SELECT COALESCE(o.settings->'ai_autonomy','{}'::jsonb) INTO v_all FROM iam.organizations o WHERE o.id = p_id;
    ELSIF p_scope = 'brand' THEN
      SELECT COALESCE(b.settings->'ai_autonomy','{}'::jsonb) INTO v_all FROM web.brand b WHERE b.id = p_id AND b.deleted_at IS NULL;
    ELSE
      SELECT COALESCE(s.settings->'ai_autonomy','{}'::jsonb) INTO v_all FROM web.site s WHERE s.id = p_id AND s.deleted_at IS NULL;
    END IF;
    IF v_all IS NULL THEN
      perform platform.refuse_not_found(format('seo_autonomy_scope_not_found: no %s with id %s', p_scope, p_id));
    END IF;
    IF p_clear THEN
      v_all := v_all - p_capability;
    ELSE
      v_all := v_all || jsonb_build_object(p_capability,
        jsonb_strip_nulls(jsonb_build_object('mode', p_mode, 'timeout_hours', p_timeout_hours)));
    END IF;

    IF p_scope = 'org' THEN
      UPDATE iam.organizations o SET settings = CASE WHEN v_all = '{}'::jsonb
        THEN COALESCE(o.settings,'{}'::jsonb) - 'ai_autonomy'
        ELSE COALESCE(o.settings,'{}'::jsonb) || jsonb_build_object('ai_autonomy', v_all) END
       WHERE o.id = p_id;
    ELSIF p_scope = 'brand' THEN
      UPDATE web.brand b SET settings = CASE WHEN v_all = '{}'::jsonb
        THEN COALESCE(b.settings,'{}'::jsonb) - 'ai_autonomy'
        ELSE COALESCE(b.settings,'{}'::jsonb) || jsonb_build_object('ai_autonomy', v_all) END,
        updated_at = now(), updated_by = (SELECT auth.uid())
       WHERE b.id = p_id AND b.deleted_at IS NULL;
    ELSE
      UPDATE web.site s SET settings = CASE WHEN v_all = '{}'::jsonb
        THEN COALESCE(s.settings,'{}'::jsonb) - 'ai_autonomy'
        ELSE COALESCE(s.settings,'{}'::jsonb) || jsonb_build_object('ai_autonomy', v_all) END,
        updated_at = now(), updated_by = (SELECT auth.uid())
       WHERE s.id = p_id AND s.deleted_at IS NULL;
    END IF;
  END IF;

  RETURN seo.ai_autonomy_scope(p_scope, p_id);
END;
$function$;

CREATE OR REPLACE FUNCTION seo.set_map_topic_facet(p_map_id uuid, p_slug text, p_facet_key text, p_value_slug text, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_tid uuid; v_fid uuid; v_vid uuid; v_applies text; v_held text; v_held_slug text; v_actor uuid; v_old uuid;
BEGIN
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'set_map_topic_facet: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_slug IS NULL THEN RAISE EXCEPTION 'set_map_topic_facet: p_slug is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_facet_key IS NULL THEN RAISE EXCEPTION 'set_map_topic_facet: p_facet_key is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_source IS NULL THEN RAISE EXCEPTION 'set_map_topic_facet: p_source is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_source NOT IN ('mapper','human','agent') THEN RAISE EXCEPTION 'p_source must be mapper|human|agent' USING ERRCODE='22023'; END IF;
  v_actor := (SELECT auth.uid());
  IF p_source = 'human' AND v_actor IS NULL THEN
    RAISE EXCEPTION 'set_map_topic_facet: source ''human'' requires an authenticated caller — there is no auth.uid() on this connection, so no person is making this decision and nothing may claim the rank that outranks every robot'
      USING ERRCODE='42501';
  END IF;
  v_map := seo._tm_map(p_map_id, 'editor');
  v_tid := seo._tm_topic_id(p_map_id, p_slug);
  IF v_tid IS NULL THEN perform platform.refuse_not_found(format('topic %s not found in map %s', p_slug, p_map_id)); END IF;
  SELECT DISTINCT facet_id, applies_to INTO v_fid, v_applies FROM seo._tm_visible_facet_values(v_map.organization_id, v_map.brand_id) WHERE facet_key = p_facet_key LIMIT 1;
  IF v_fid IS NULL THEN
    SELECT id, applies_to INTO v_fid, v_applies FROM seo.map_facet WHERE key = p_facet_key AND deleted_at IS NULL
       AND (organization_id = v_map.organization_id OR organization_id IN (SELECT so.organization_id FROM iam.system_orgs so WHERE so.global_readable)) LIMIT 1;
  END IF;
  IF v_fid IS NULL THEN perform platform.refuse_not_found(format('facet %s not found', p_facet_key)); END IF;
  IF v_applies = 'page' THEN RAISE EXCEPTION 'facet % applies to pages only', p_facet_key USING ERRCODE='23514'; END IF;

  v_held := NULL; v_held_slug := NULL;
  SELECT a.payload->>'source', v.slug INTO v_held, v_held_slug
    FROM platform.associations a
    JOIN seo.map_facet_value v ON v.id = a.target_id AND v.facet_id = v_fid
   WHERE a.source_type='seo_map_topic' AND a.source_id=v_tid
     AND a.target_type='seo_map_facet_value' AND a.role='facet' AND a.deleted_at IS NULL
   ORDER BY seo._tm_source_rank(a.payload->>'source') DESC, a.created_at DESC, a.id DESC
   LIMIT 1;
  IF v_held IS NOT NULL AND p_source <> 'human'
     AND seo._tm_source_rank(v_held) > seo._tm_source_rank(p_source) THEN
    RETURN jsonb_build_object('ok', true, 'topic', p_slug, 'facet', p_facet_key,
                              'kept_existing', jsonb_build_object('source', v_held, 'value', v_held_slug));
  END IF;

  -- TAILS-7: ARCHIVED, NOT DESTROYED. `p_value_slug IS NULL` on this door literally
  -- MEANS "a person clears this facet" — the plainest case of a removal there is, and
  -- it used to destroy the edge: its id, who set it, and the day it was first set. It
  -- is withdrawn now, so setting the facet back to the value it held revives THE SAME
  -- edge instead of minting a stranger. `associations_one_facet_value_per_row` is
  -- partial on `deleted_at IS NULL`, so a tombstoned value never blocks a new one.
  FOR v_old IN
    SELECT a.target_id FROM platform.associations a
      JOIN seo.map_facet_value v ON v.id = a.target_id
     WHERE a.source_type='seo_map_topic' AND a.source_id=v_tid
       AND a.target_type='seo_map_facet_value' AND a.role='facet'
       AND a.deleted_at IS NULL AND v.facet_id = v_fid
  LOOP
    PERFORM platform.assoc_unset('seo_map_topic', v_tid, 'seo_map_facet_value', v_old, 'facet',
                                 'seo_map_topic', v_tid);
  END LOOP;
  IF p_value_slug IS NULL THEN RETURN jsonb_build_object('ok', true, 'cleared', p_facet_key, 'source', p_source); END IF;
  SELECT value_id INTO v_vid FROM seo._tm_visible_facet_values(v_map.organization_id, v_map.brand_id)
   WHERE facet_key = p_facet_key AND slug = p_value_slug ORDER BY (brand_id IS NOT NULL) DESC LIMIT 1;
  IF v_vid IS NULL THEN perform platform.refuse_not_found(format('facet value %s/%s not visible to this map', p_facet_key, p_value_slug)); END IF;
  -- ROUND 28: the unique index associations_one_facet_value_per_row (0809) now makes one
  -- value per (row, facet) a FACT. Inside one call the DELETE above always precedes this
  -- INSERT, so the only way to collide is another writer landing on the same row and
  -- facet between the two — and a 23505 is a database word no client may ever be shown.
  -- The collision is answered exactly as a lost rank test is: the edge that won is read
  -- back and the caller is told whose value stands.
  BEGIN
  INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, role, payload_kind, payload, created_by)
  VALUES ('seo_map_topic', v_tid, 'seo_map_facet_value', v_vid, v_map.organization_id, 'facet', 'map_facet_assignment',
          jsonb_build_object('source', p_source, 'facet', p_facet_key), v_actor);
  -- 🚨 THE REVIVE PATH DOES NOT CARRY `created_by`, deliberately (a revive is not a
  -- creation). Here the payload names the source that set the value, so leaving the
  -- author on whoever set it first makes the row disagree with itself. Stamped for
  -- both paths; a no-op on the ordinary insert. It is INSIDE the BEGIN block so a
  -- concurrent writer's unique_violation is still answered by the handler below.
  UPDATE platform.associations
     SET created_by = v_actor
   WHERE source_type='seo_map_topic' AND source_id=v_tid AND target_type='seo_map_facet_value'
     AND target_id = v_vid AND role='facet' AND deleted_at IS NULL
     AND created_by IS DISTINCT FROM v_actor;
  EXCEPTION WHEN unique_violation THEN
    SELECT a.payload->>'source', v.slug INTO v_held, v_held_slug
      FROM platform.associations a
      JOIN seo.map_facet_value v ON v.id = a.target_id
     WHERE a.source_type='seo_map_topic' AND a.source_id=v_tid
       AND a.target_type='seo_map_facet_value' AND a.role='facet' AND a.deleted_at IS NULL
       AND a.payload->>'facet' = p_facet_key
     ORDER BY seo._tm_source_rank(a.payload->>'source') DESC, a.created_at DESC, a.id DESC
     LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'topic', p_slug, 'facet', p_facet_key,
                              'kept_existing', jsonb_build_object('source', v_held, 'value', v_held_slug,
                                                                  'reason', 'another writer landed on this row and facet at the same moment'));
  END;
  RETURN jsonb_build_object('ok', true, 'topic', p_slug, 'facet', p_facet_key, 'value', p_value_slug, 'source', p_source);
END $function$;

CREATE OR REPLACE FUNCTION seo.set_page_intents(p_site_id uuid, p_items jsonb, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE it jsonb; v_map uuid; v_org uuid; v_pid uuid; v_tid uuid; v_slug text; v_disp text; v_state text;
        v_into_page uuid; v_into_node uuid; v_ref jsonb; v_payload jsonb; v_node record;
        v_results jsonb := '[]'::jsonb; v_ok int := 0; v_fail int := 0; v_kept int := 0;
        v_cur_src text; v_cur_state text; v_actor uuid; v_old uuid;
BEGIN
  IF p_site_id IS NULL THEN RAISE EXCEPTION 'set_page_intents: p_site_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_items IS NULL THEN RAISE EXCEPTION 'set_page_intents: p_items is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_source IS NULL THEN RAISE EXCEPTION 'set_page_intents: p_source is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_source NOT IN ('mapper','human','agent') THEN
    RAISE EXCEPTION 'p_source must be mapper|human|agent' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'p_items must be a JSON array' USING ERRCODE='22023'; END IF;
  PERFORM seo._tm_site(p_site_id, 'viewer'::public.permission_level, 'set_page_intents_denied');

  -- 🚨 A `human` INTENT WITH NOBODY BEHIND IT IS NOT WRITABLE (0797). `source='human'`
  -- is the top of the precedence ladder: it outranks every robot and it locks the page
  -- against them. A write claiming that rank with no authenticated person is an
  -- unattributable veto, and the census that found this showed every map edge on the
  -- platform carrying created_by NULL — including both `human` ones.
  v_actor := auth.uid();
  IF p_source = 'human' AND v_actor IS NULL THEN
    RAISE EXCEPTION 'set_page_intents: source=human requires an authenticated caller — an intent that outranks every agent must name the person who wrote it' USING ERRCODE='42501';
  END IF;

  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  v_map := seo.site_map_id(p_site_id);
  IF v_map IS NULL THEN
    perform platform.refuse_not_found(format('site %s uses no topical map (call seo.set_site_map first)', p_site_id));
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    BEGIN
      v_into_page := NULL; v_into_node := NULL; v_tid := NULL;

      -- 1. ACCESS, before anything exists. Editor on the site is editor on its
      --    pages; the check is per item so a partial batch is impossible to fake.
      IF NOT (public.is_platform_admin()
              OR iam.has_access('web_site', p_site_id, 'editor'::public.permission_level)) THEN
        RAISE EXCEPTION 'set_page_intents_denied' USING ERRCODE='42501';
      END IF;

      -- 2. The page, constrained to p_site_id.
      IF NULLIF(it->>'page_id', '') IS NOT NULL THEN
        SELECT p.id INTO v_pid FROM web.page p
         WHERE p.id = (it->>'page_id')::uuid AND p.site_id = p_site_id AND p.deleted_at IS NULL;
      ELSIF NULLIF(it->>'url', '') IS NOT NULL THEN
        SELECT p.id INTO v_pid FROM web.page p
         WHERE p.site_id = p_site_id AND p.url = it->>'url' AND p.deleted_at IS NULL LIMIT 1;
      ELSE
        RAISE EXCEPTION 'item must carry page_id or url' USING ERRCODE='22023';
      END IF;
      IF v_pid IS NULL THEN RAISE EXCEPTION 'set_page_intents_denied' USING ERRCODE='42501'; END IF;

      -- 3. The disposition and the state.
      v_disp := NULLIF(it->>'disposition', '');
      IF v_disp IS NULL THEN RAISE EXCEPTION 'item must carry a disposition' USING ERRCODE='22023'; END IF;
      IF v_disp NOT IN ('keep','move','merge','redirect','rewrite','delete') THEN
        RAISE EXCEPTION 'disposition must be keep|move|merge|redirect|rewrite|delete' USING ERRCODE='22023';
      END IF;
      v_state := COALESCE(NULLIF(it->>'state', ''), 'proposed');
      IF v_state NOT IN ('proposed','accepted','done') THEN
        RAISE EXCEPTION 'state must be proposed|accepted|done' USING ERRCODE='22023';
      END IF;

      -- 4. The destination. merge and redirect need exactly one; the others none.
      IF NULLIF(it->>'into_page_id','') IS NOT NULL THEN v_into_page := (it->>'into_page_id')::uuid; END IF;
      IF NULLIF(it->>'into_node_id','') IS NOT NULL THEN v_into_node := (it->>'into_node_id')::uuid; END IF;
      IF v_disp IN ('merge','redirect') THEN
        IF (v_into_page IS NULL) = (v_into_node IS NULL) THEN
          RAISE EXCEPTION '% needs exactly one of into_page_id or into_node_id', v_disp USING ERRCODE='22023';
        END IF;
      ELSIF v_into_page IS NOT NULL OR v_into_node IS NOT NULL THEN
        RAISE EXCEPTION '% takes no destination; into_page_id and into_node_id are for merge and redirect', v_disp USING ERRCODE='22023';
      END IF;

      IF v_into_page IS NOT NULL THEN
        v_ref := platform.resolve_entity_ref('web_page', v_into_page);
        IF v_ref IS NULL OR v_ref ? 'forbidden' OR v_ref ? 'missing' OR v_ref ? 'unregistered'
           OR NOT EXISTS (SELECT 1 FROM web.page p WHERE p.id = v_into_page AND p.deleted_at IS NULL
                            AND p.organization_id = v_org) THEN
          RAISE EXCEPTION 'set_page_intents_denied' USING ERRCODE='42501';
        END IF;
      END IF;
      IF v_into_node IS NOT NULL THEN
        v_ref := platform.resolve_entity_ref('plan_node', v_into_node);
        SELECT n.id, n.organization_id, n.topic_id INTO v_node
          FROM plan.node n WHERE n.id = v_into_node AND n.deleted_at IS NULL;
        IF v_ref IS NULL OR v_ref ? 'forbidden' OR v_ref ? 'missing' OR v_ref ? 'unregistered'
           OR v_node.id IS NULL OR v_node.organization_id <> v_org
           OR v_node.topic_id IS NULL
           OR NOT EXISTS (SELECT 1 FROM seo.map_topic t WHERE t.id = v_node.topic_id AND t.map_id = v_map) THEN
          RAISE EXCEPTION 'set_page_intents_denied' USING ERRCODE='42501';
        END IF;
      END IF;

      -- 5. The topic. Optional for keep/rewrite/delete, which read it off the
      --    page's own coverage; required for the three that MOVE the page.
      v_slug := NULLIF(it->>'topic_slug', '');
      IF v_slug IS NOT NULL THEN
        v_tid := seo._tm_live_topic_id(v_map, v_slug);
        IF v_tid IS NULL THEN
          perform platform.refuse_not_found(format('topic %s not found in this site''s map', v_slug));
        END IF;
      ELSIF v_disp IN ('move','merge','redirect') THEN
        RAISE EXCEPTION 'topic_slug is required for %: it names the topic the page is going to', v_disp USING ERRCODE='22023';
      ELSE
        SELECT a.target_id INTO v_tid
          FROM platform.associations a
        -- ROUND 22, RESTORED: only `rejected` used to be excluded, so a RETIRED topic
        -- was a legal destination — and every reader hides it, so the page went where
        -- nobody could see it. LIVE means proposed|active.
          JOIN seo.map_topic t ON t.id = a.target_id AND t.map_id = v_map AND t.deleted_at IS NULL
                              AND t.status IN ('proposed','active')
         WHERE a.source_type='web_page' AND a.source_id = v_pid AND a.target_type='seo_map_topic'
           AND a.role='covers' AND a.deleted_at IS NULL
         ORDER BY COALESCE((a.payload->>'confidence')::int, 0) DESC, a.created_at, a.id
         LIMIT 1;
        IF v_tid IS NULL THEN
          RAISE EXCEPTION 'topic_slug is required: this page covers no topic in this map, so there is nothing to derive it from' USING ERRCODE='22023';
        END IF;
      END IF;

      -- 5b. PRECEDENCE (round 23): an intent a higher source holds, or one a person has
      --     accepted or signed off, is never replaced by a lower source. Reported, never
      --     silent, and the held row is not touched at all.
      -- ROUND 23, RESTORED: reset PER ITEM. Without it a page with no intent of its
      -- own inherits the PREVIOUS item's holder inside the same call, and the
      -- precedence test below then 'keeps' a page nobody holds.
      v_cur_src := NULL; v_cur_state := NULL;
      SELECT a.payload->>'source', a.payload->>'state' INTO v_cur_src, v_cur_state
        FROM platform.associations a
       WHERE a.source_type='web_page' AND a.source_id = v_pid AND a.target_type='seo_map_topic'
         AND a.role='intent' AND a.deleted_at IS NULL
       ORDER BY a.created_at DESC, a.id DESC LIMIT 1;
      IF v_cur_src IS NOT NULL AND p_source <> 'human'
         AND (seo._tm_source_rank(v_cur_src) > seo._tm_source_rank(p_source)
              OR COALESCE(v_cur_state,'') IN ('accepted','done')) THEN
        v_results := v_results || jsonb_strip_nulls(jsonb_build_object(
          'ok', true, 'page_id', v_pid, 'url', it->>'url',
          'kept_existing', jsonb_build_object('source', v_cur_src, 'state', v_cur_state)));
        v_kept := v_kept + 1;
        CONTINUE;
      END IF;

      -- ONE intent per page — replace, never accumulate.
      -- TAILS-7: ARCHIVED, NOT DESTROYED. One intent per page — replaced, and the
      -- one it replaces is WITHDRAWN rather than destroyed. Moving a page's intent
      -- to another topic and back now keeps one edge with one history instead of
      -- minting a stranger each time. At most one row.
      FOR v_old IN
        SELECT a.target_id FROM platform.associations a
         WHERE a.source_type='web_page' AND a.source_id = v_pid
           AND a.target_type='seo_map_topic' AND a.role='intent' AND a.deleted_at IS NULL
      LOOP
        PERFORM platform.assoc_unset('web_page', v_pid, 'seo_map_topic', v_old, 'intent',
                                     'web_page', v_pid);
      END LOOP;

      v_payload := jsonb_strip_nulls(jsonb_build_object(
        'disposition', v_disp,
        'into_page_id', v_into_page,
        'into_node_id', v_into_node,
        'note', NULLIF(left(COALESCE(it->>'note',''), 300), ''),
        'state', v_state,
        'source', p_source));
      INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, role, payload_kind, payload, created_by)
      VALUES ('web_page', v_pid, 'seo_map_topic', v_tid, v_org, 'intent', 'map_page_intent', v_payload, v_actor);
      -- 🚨 THE REVIVE PATH DOES NOT CARRY `created_by`, DELIBERATELY: a revive is not
      -- a creation (platform.revive_tombstoned_association says so in its own body).
      -- On THIS door the author moves with the content — the payload names the source
      -- that wrote it, so an intent whose payload says `human` and whose created_by
      -- still names last month's mapper is a row disagreeing with itself. Stamped for
      -- both paths, and it is a no-op on the ordinary insert.
      UPDATE platform.associations
         SET created_by = v_actor
       WHERE source_type='web_page' AND source_id = v_pid AND target_type='seo_map_topic'
         AND target_id = v_tid AND role='intent' AND deleted_at IS NULL
         AND created_by IS DISTINCT FROM v_actor;

      v_results := v_results || jsonb_strip_nulls(jsonb_build_object('ok', true, 'page_id', v_pid, 'url', it->>'url'));
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_results := v_results || jsonb_strip_nulls(jsonb_build_object(
        'ok', false, 'page_id', it->>'page_id', 'url', it->>'url', 'error', platform.refusal_message(sqlstate, SQLERRM)));
      v_fail := v_fail + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('ok', v_fail = 0, 'map_id', v_map, 'set', v_ok, 'kept', v_kept, 'failed', v_fail, 'results', v_results);
END $function$;

CREATE OR REPLACE FUNCTION seo.set_page_map_facet(p_page_id uuid, p_facet_key text, p_value_slug text, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_org uuid; v_site uuid; v_brand uuid; v_fid uuid; v_vid uuid; v_applies text; v_old uuid;
        v_held text; v_held_slug text; v_actor uuid;
BEGIN
  IF p_page_id IS NULL THEN RAISE EXCEPTION 'set_page_map_facet: p_page_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_facet_key IS NULL THEN RAISE EXCEPTION 'set_page_map_facet: p_facet_key is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_source IS NULL THEN RAISE EXCEPTION 'set_page_map_facet: p_source is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_source NOT IN ('mapper','human','agent') THEN RAISE EXCEPTION 'p_source must be mapper|human|agent' USING ERRCODE='22023'; END IF;
  v_actor := (SELECT auth.uid());
  -- ROUND 27: `human` is the rank no robot may overrule, so it has to be a human.
  IF p_source = 'human' AND v_actor IS NULL THEN
    RAISE EXCEPTION 'set_page_map_facet: source ''human'' requires an authenticated caller — there is no auth.uid() on this connection, so no person is making this decision and nothing may claim the rank that outranks every robot'
      USING ERRCODE='42501';
  END IF;
  SELECT p.organization_id, p.site_id INTO v_org, v_site FROM web.page p WHERE p.id = p_page_id AND p.deleted_at IS NULL;
  IF NOT (public.is_platform_admin() OR (v_org IS NOT NULL AND iam.has_access('web_site', v_site, 'editor'))) THEN
    RAISE EXCEPTION 'page_facet_denied' USING ERRCODE='42501';
  END IF;
  IF v_org IS NULL THEN perform platform.refuse_not_found(format('page %s not found', p_page_id)); END IF;
  SELECT s.brand_id INTO v_brand FROM web.site s WHERE s.id = v_site;
  SELECT DISTINCT facet_id, applies_to INTO v_fid, v_applies FROM seo._tm_visible_facet_values(v_org, v_brand) WHERE facet_key = p_facet_key LIMIT 1;
  IF v_fid IS NULL THEN
    SELECT id, applies_to INTO v_fid, v_applies FROM seo.map_facet WHERE key = p_facet_key AND deleted_at IS NULL
       AND (organization_id = v_org OR organization_id IN (SELECT so.organization_id FROM iam.system_orgs so WHERE so.global_readable)) LIMIT 1;
  END IF;
  IF v_fid IS NULL THEN perform platform.refuse_not_found(format('facet %s not found', p_facet_key)); END IF;
  IF v_applies = 'topic' THEN RAISE EXCEPTION 'facet % applies to topics only', p_facet_key USING ERRCODE='23514'; END IF;

  -- ROUND 27: THE HIGHEST-RANKED EDGE, NOT THE NEWEST. The DELETE below clears every
  -- edge of this facet, so ranking against one of them let a person's older value be
  -- destroyed under a robot's newer one while the call answered ok.
  v_held := NULL; v_held_slug := NULL;
  SELECT a.payload->>'source', v.slug INTO v_held, v_held_slug
    FROM platform.associations a
    JOIN seo.map_facet_value v ON v.id = a.target_id AND v.facet_id = v_fid
   WHERE a.source_type='web_page' AND a.source_id=p_page_id
     AND a.target_type='seo_map_facet_value' AND a.role='facet' AND a.deleted_at IS NULL
   ORDER BY seo._tm_source_rank(a.payload->>'source') DESC, a.created_at DESC, a.id DESC
   LIMIT 1;
  IF v_held IS NOT NULL AND p_source <> 'human'
     AND seo._tm_source_rank(v_held) > seo._tm_source_rank(p_source) THEN
    RETURN jsonb_build_object('ok', true, 'page_id', p_page_id, 'facet', p_facet_key,
                              'kept_existing', jsonb_build_object('source', v_held, 'value', v_held_slug));
  END IF;

  -- TAILS-7: ARCHIVED, NOT DESTROYED. `p_value_slug IS NULL` on this door literally
  -- MEANS "a person clears this facet" — the plainest case of a removal there is, and
  -- it used to destroy the edge: its id, who set it, and the day it was first set. It
  -- is withdrawn now, so setting the facet back to the value it held revives THE SAME
  -- edge instead of minting a stranger. `associations_one_facet_value_per_row` is
  -- partial on `deleted_at IS NULL`, so a tombstoned value never blocks a new one.
  FOR v_old IN
    SELECT a.target_id FROM platform.associations a
      JOIN seo.map_facet_value v ON v.id = a.target_id
     WHERE a.source_type='web_page' AND a.source_id=p_page_id
       AND a.target_type='seo_map_facet_value' AND a.role='facet'
       AND a.deleted_at IS NULL AND v.facet_id = v_fid
  LOOP
    PERFORM platform.assoc_unset('web_page', p_page_id, 'seo_map_facet_value', v_old, 'facet',
                                 'web_page', p_page_id);
  END LOOP;
  -- p_value_slug NULL MEANS clear this facet on the page.
  IF p_value_slug IS NULL THEN RETURN jsonb_build_object('ok', true, 'cleared', p_facet_key, 'source', p_source); END IF;
  SELECT value_id INTO v_vid FROM seo._tm_visible_facet_values(v_org, v_brand)
   WHERE facet_key = p_facet_key AND slug = p_value_slug ORDER BY (brand_id IS NOT NULL) DESC LIMIT 1;
  IF v_vid IS NULL THEN perform platform.refuse_not_found(format('facet value %s/%s not visible to this brand', p_facet_key, p_value_slug)); END IF;
  -- ROUND 28: the unique index associations_one_facet_value_per_row (0809) now makes one
  -- value per (row, facet) a FACT. Inside one call the DELETE above always precedes this
  -- INSERT, so the only way to collide is another writer landing on the same row and
  -- facet between the two — and a 23505 is a database word no client may ever be shown.
  -- The collision is answered exactly as a lost rank test is: the edge that won is read
  -- back and the caller is told whose value stands.
  BEGIN
  INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, role, payload_kind, payload, created_by)
  VALUES ('web_page', p_page_id, 'seo_map_facet_value', v_vid, v_org, 'facet', 'map_facet_assignment',
          jsonb_build_object('source', p_source, 'facet', p_facet_key), v_actor);
  -- 🚨 THE REVIVE PATH DOES NOT CARRY `created_by`, deliberately (a revive is not a
  -- creation). Here the payload names the source that set the value, so leaving the
  -- author on whoever set it first makes the row disagree with itself. Stamped for
  -- both paths; a no-op on the ordinary insert. It is INSIDE the BEGIN block so a
  -- concurrent writer's unique_violation is still answered by the handler below.
  UPDATE platform.associations
     SET created_by = v_actor
   WHERE source_type='web_page' AND source_id=p_page_id AND target_type='seo_map_facet_value'
     AND target_id = v_vid AND role='facet' AND deleted_at IS NULL
     AND created_by IS DISTINCT FROM v_actor;
  EXCEPTION WHEN unique_violation THEN
    SELECT a.payload->>'source', v.slug INTO v_held, v_held_slug
      FROM platform.associations a
      JOIN seo.map_facet_value v ON v.id = a.target_id
     WHERE a.source_type='web_page' AND a.source_id=p_page_id
       AND a.target_type='seo_map_facet_value' AND a.role='facet' AND a.deleted_at IS NULL
       AND a.payload->>'facet' = p_facet_key
     ORDER BY seo._tm_source_rank(a.payload->>'source') DESC, a.created_at DESC, a.id DESC
     LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'page_id', p_page_id, 'facet', p_facet_key,
                              'kept_existing', jsonb_build_object('source', v_held, 'value', v_held_slug,
                                                                  'reason', 'another writer landed on this row and facet at the same moment'));
  END;
  RETURN jsonb_build_object('ok', true, 'page_id', p_page_id, 'facet', p_facet_key, 'value', p_value_slug, 'source', p_source);
END $function$;

CREATE OR REPLACE FUNCTION seo.set_page_map_topics(p_page_id uuid, p_topics jsonb, p_source text DEFAULT 'mapper'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_org uuid; v_site uuid; v_map uuid; r jsonb; v_tid uuid; v_inserted int := 0; v_removed int := 0; v_missing text[] := '{}';
        v_held text; v_kept jsonb := '[]'::jsonb; v_actor uuid; v_old uuid;
BEGIN
  IF p_page_id IS NULL THEN RAISE EXCEPTION 'set_page_map_topics: p_page_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  -- ROUND 17 (A): a NULL here used to skip the array check below and reach the
  -- DELETE, wiping this source's coverage and answering ok. Clearing is `[]`.
  IF p_topics IS NULL THEN
    RAISE EXCEPTION 'set_page_map_topics: p_topics is required (got NULL); pass [] to clear this source''s coverage' USING ERRCODE='22023';
  END IF;
  IF p_source IS NULL THEN RAISE EXCEPTION 'set_page_map_topics: p_source is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_source NOT IN ('mapper','human','agent') THEN RAISE EXCEPTION 'p_source must be mapper|human|agent' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_topics) <> 'array' THEN RAISE EXCEPTION 'p_topics must be a JSON array' USING ERRCODE='22023'; END IF;

  -- 🚨 A `human` COVERAGE EDGE WITH NOBODY BEHIND IT IS NOT WRITABLE, exactly as for
  -- intents. `human` is the top of round 23's precedence ladder: it outranks every
  -- robot and locks the pair against them, so a write claiming that rank with no
  -- authenticated person is an unattributable veto.
  v_actor := auth.uid();
  IF p_source = 'human' AND v_actor IS NULL THEN
    RAISE EXCEPTION 'set_page_map_topics: source=human requires an authenticated caller — an edge that outranks every agent must name the person who wrote it' USING ERRCODE='42501';
  END IF;
  SELECT p.organization_id, p.site_id INTO v_org, v_site FROM web.page p WHERE p.id = p_page_id AND p.deleted_at IS NULL;
  IF NOT (public.is_platform_admin() OR (v_org IS NOT NULL AND iam.has_access('web_site', v_site, 'editor'))) THEN
    RAISE EXCEPTION 'set_page_map_topics_denied' USING ERRCODE='42501';
  END IF;
  IF v_org IS NULL THEN perform platform.refuse_not_found(format('page %s not found', p_page_id)); END IF;
  v_map := seo.site_map_id(v_site);
  IF v_map IS NULL THEN perform platform.refuse_not_found(format('site %s uses no topical map (call seo.set_site_map first)', v_site)); END IF;

  -- TAILS-7: ARCHIVED, NOT DESTROYED. This clear is per-source and wholesale: it is how
  -- a re-run of the mapper replaces its own coverage. Destroying those rows meant a topic
  -- dropped from one run and put back by the next came back as a brand-new edge with no
  -- created_by, no first-covered date and no history — and a person's `human` row, cleared
  -- and re-stated, lost who stated it. Withdrawn now, so the next run REVIVES the same
  -- edges in place and the ones it drops stay on the record as withdrawn.
  FOR v_old IN
    SELECT a.target_id FROM platform.associations a
     WHERE a.source_type='web_page' AND a.source_id=p_page_id AND a.target_type='seo_map_topic'
       AND a.role='covers' AND a.payload_kind='map_topic_coverage'
       AND a.payload->>'source' = p_source AND a.deleted_at IS NULL
  LOOP
    v_removed := v_removed + platform.assoc_unset('web_page', p_page_id, 'seo_map_topic', v_old,
                                                  'covers', 'web_page', p_page_id);
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(p_topics) LOOP
    -- ROUND 22: the coverage target must be a LIVE topic. A retired or rejected
    -- slug now comes back in `unknown_slugs` exactly like an invented one —
    -- same shape, same bytes, nothing new to tell them apart.
    v_tid := seo._tm_live_topic_id(v_map, r->>'slug');
    IF v_tid IS NULL THEN v_missing := v_missing || (r->>'slug'); CONTINUE; END IF;

    -- ROUND 23. THE DELETE ABOVE IS PER-SOURCE; THIS UPSERT WAS NOT. There is one
    -- row per (page, topic, covers) — `source` lives in the payload, not in the
    -- key — so a mapper or agent write to a pair a HUMAN already held fell
    -- through to DO UPDATE and silently rewrote the person's confidence, reason
    -- and source. The per-source delete looked like a lock and was not one.
    -- human > agent > mapper, and an unsourced legacy row ranks below all three.
    INSERT INTO platform.associations AS a (source_type, source_id, target_type, target_id, organization_id, role, payload_kind, payload, created_by)
    VALUES ('web_page', p_page_id, 'seo_map_topic', v_tid, v_org, 'covers', 'map_topic_coverage',
            jsonb_build_object('confidence', LEAST(100, GREATEST(0, COALESCE((r->>'confidence')::int, 50))),
                               'source', p_source,
                               'reason', left(COALESCE(r->>'reason',''), 300)), v_actor)
    ON CONFLICT (source_type, source_id, target_type, target_id, role) DO UPDATE
      -- 0806: the WINNING writer becomes the row's author. platform.associations has
      -- no updated_by, and this upsert replaces the payload AND the source wholesale,
      -- so leaving created_by on whoever inserted first means a person who overrules
      -- the mapper still names nobody — which is the common case, because the mapper
      -- writes first. The row's content and its author move together or the column
      -- is decorative.
      SET payload_kind = EXCLUDED.payload_kind, payload = EXCLUDED.payload,
          created_by = EXCLUDED.created_by
      WHERE seo._tm_source_rank(a.payload->>'source') <= seo._tm_source_rank(EXCLUDED.payload->>'source');

    -- 🚨 TAILS-7: THE WRITE IS JUDGED BY READING THE ROW BACK, NOT BY `RETURNING`.
    -- This arm used to end `RETURNING true INTO v_wrote`, and that is exactly what a
    -- tombstone breaks. `platform.revive_tombstoned_association` is a BEFORE INSERT
    -- trigger that revives the tombstone IN PLACE and returns NULL, so the INSERT is
    -- skipped and `INSERT … RETURNING` yields ZERO ROWS although the write landed. Left
    -- as it was, every topic this door had just withdrawn and immediately re-stated
    -- would have been counted in `kept_existing` and reported to the caller as a write
    -- somebody else's row beat — a door lying about its own effect. The rank guard on
    -- the conflict above is UNCHANGED, so two concurrent writers are still decided
    -- atomically by the database; what changed is only how this body learns the answer.
    SELECT x.payload->>'source' INTO v_held FROM platform.associations x
     WHERE x.source_type='web_page' AND x.source_id=p_page_id AND x.target_type='seo_map_topic'
       AND x.target_id=v_tid AND x.role='covers' AND x.deleted_at IS NULL;
    IF v_held IS NOT DISTINCT FROM p_source THEN
      v_inserted := v_inserted + 1;
      -- 0806 says the WINNING writer becomes the row's author, and the revive path does
      -- not carry `created_by` (a revive is not a creation). Stamped for both paths so
      -- content and author still move together; a no-op on the ordinary insert.
      UPDATE platform.associations
         SET created_by = v_actor
       WHERE source_type='web_page' AND source_id=p_page_id AND target_type='seo_map_topic'
         AND target_id=v_tid AND role='covers' AND deleted_at IS NULL
         AND created_by IS DISTINCT FROM v_actor;
    ELSE
      -- NOT AN ERROR AND NOT SILENCE: the caller is told whose row it left alone.
      v_kept := v_kept || jsonb_build_object('slug', r->>'slug', 'kept_existing', v_held);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'page_id', p_page_id, 'map_id', v_map, 'covers', v_inserted, 'replaced', v_removed,
                            'unknown_slugs', to_jsonb(v_missing), 'kept_existing', v_kept);
END $function$;

CREATE OR REPLACE FUNCTION seo.set_pages_map_topics(p_site_id uuid, p_items jsonb, p_source text DEFAULT 'mapper'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE it jsonb; v_pid uuid; v_res jsonb; v_results jsonb := '[]'::jsonb; v_ok int := 0; v_fail int := 0;
BEGIN
  IF p_site_id IS NULL THEN RAISE EXCEPTION 'set_pages_map_topics: p_site_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_items IS NULL THEN RAISE EXCEPTION 'set_pages_map_topics: p_items is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_source IS NULL THEN RAISE EXCEPTION 'set_pages_map_topics: p_source is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_source NOT IN ('mapper','human','agent') THEN
    RAISE EXCEPTION 'p_source must be mapper|human|agent' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'p_items must be a JSON array' USING ERRCODE='22023'; END IF;
  PERFORM seo._tm_site(p_site_id, 'viewer'::public.permission_level, 'set_pages_map_topics_denied');
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    BEGIN
      -- ROUND 17: an item with no `topics` used to be read as `[]` and CLEAR the
      -- page's coverage for this source. Absent is not empty.
      IF COALESCE(jsonb_typeof(it->'topics'), 'absent') <> 'array' THEN
        RAISE EXCEPTION 'item must carry a topics array (pass [] to clear)' USING ERRCODE='22023';
      END IF;
      -- Every item must resolve to a page OF p_site_id; foreign, invented and
      -- off-site are one error, so the results array is no existence oracle.
      IF NULLIF(it->>'page_id', '') IS NOT NULL THEN
        SELECT p.id INTO v_pid FROM web.page p
         WHERE p.id = (it->>'page_id')::uuid AND p.site_id = p_site_id AND p.deleted_at IS NULL;
      ELSIF NULLIF(it->>'url', '') IS NOT NULL THEN
        SELECT p.id INTO v_pid FROM web.page p
         WHERE p.site_id = p_site_id AND p.url = it->>'url' AND p.deleted_at IS NULL LIMIT 1;
      ELSE
        RAISE EXCEPTION 'item must carry page_id or url' USING ERRCODE='22023';
      END IF;
      IF v_pid IS NULL THEN RAISE EXCEPTION 'set_pages_map_topics_denied' USING ERRCODE='42501'; END IF;
      v_res := seo.set_page_map_topics(v_pid, it->'topics', p_source);
      v_results := v_results || (jsonb_build_object('page_id', v_pid, 'url', it->>'url') || v_res);
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_results := v_results || jsonb_build_object('page_id', it->>'page_id', 'url', it->>'url', 'ok', false, 'error', platform.refusal_message(sqlstate, SQLERRM));
      v_fail := v_fail + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('ok', v_fail = 0, 'mapped', v_ok, 'failed', v_fail, 'results', v_results);
END $function$;

CREATE OR REPLACE FUNCTION seo.set_value_settings(p_scope text, p_id uuid DEFAULT NULL::uuid, p_baseline numeric DEFAULT NULL::numeric, p_levels jsonb DEFAULT NULL::jsonb, p_clear text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
DECLARE
  v_kv             jsonb;
  v_compact_levels jsonb;
  v_vocab_levels   jsonb;
  e                jsonb;
BEGIN
  IF p_scope NOT IN ('platform','org','brand','site') THEN
    RAISE EXCEPTION 'seo_settings_bad_scope: scope must be platform, org, brand or site (got %)', COALESCE(p_scope,'null');
  END IF;
  IF p_scope <> 'platform' AND p_id IS NULL THEN
    RAISE EXCEPTION 'seo_settings_id_required: % needs an id', p_scope;
  END IF;
  IF NOT seo.fn_value_settings_may_edit(p_scope, p_id) THEN
    RAISE EXCEPTION 'seo_settings_denied: you do not have permission to change these settings'
      USING ERRCODE = '42501';
  END IF;
  IF p_baseline IS NOT NULL AND (p_baseline < 0 OR p_baseline > 100000) THEN
    RAISE EXCEPTION 'seo_settings_bad_baseline: a baseline is between 0 and 100000 (got %)', p_baseline;
  END IF;

  IF p_levels IS NOT NULL THEN
    IF jsonb_typeof(p_levels) <> 'array' THEN
      RAISE EXCEPTION 'seo_settings_bad_levels: levels must be a list';
    END IF;
    FOR e IN SELECT * FROM jsonb_array_elements(p_levels) LOOP
      IF NULLIF(btrim(COALESCE(e->>'value','')),'') IS NULL THEN
        RAISE EXCEPTION 'seo_settings_level_needs_value: every level needs an identity';
      END IF;
      IF e->>'value' = 'negative' THEN
        IF NULLIF(btrim(COALESCE(e->>'min_score','')),'') IS NOT NULL THEN
          RAISE EXCEPTION 'gsc_vocab_negative_threshold: the negative band is a guard, not a score range — it carries no threshold';
        END IF;
      ELSIF (e->>'min_score') IS NULL OR (e->>'min_score') !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
        RAISE EXCEPTION 'seo_settings_level_needs_score: level "%" needs a number to start at', e->>'value';
      END IF;
    END LOOP;

    SELECT jsonb_agg(jsonb_build_object(
             'value', item->>'value',
             'label', item->>'label',
             'min_score', CASE WHEN item->>'value' = 'negative' THEN NULL
                               ELSE (item->>'min_score')::numeric END)
             ORDER BY ord),
           jsonb_agg(jsonb_build_object(
             'value', item->>'value',
             'label', item->>'label',
             'description', NULL,
             'sort', ord - 1,
             'config', CASE WHEN item->>'value' = 'negative' THEN '{}'::jsonb
                            ELSE jsonb_build_object('min_score', (item->>'min_score')::numeric) END)
             ORDER BY ord)
      INTO v_compact_levels, v_vocab_levels
      FROM jsonb_array_elements(p_levels) WITH ORDINALITY AS rows(item, ord);
    PERFORM seo.gsc_assert_vocabulary_coherent('value_band', v_vocab_levels);
  END IF;

  IF p_scope = 'platform' THEN
    IF p_baseline IS NOT NULL THEN
      UPDATE platform.feature_knob SET value = to_jsonb(p_baseline), updated_at = now(),
             updated_by = (SELECT auth.uid()), set_by = 'human'
       WHERE feature='seo.keyword_value' AND key='baseline_score';
    END IF;
    IF p_levels IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_levels) incoming
        WHERE NOT EXISTS (
          SELECT 1 FROM platform.categories c
          WHERE c.dimension='seo_value_band' AND c.deleted_at IS NULL
            AND c.slug = incoming->>'value'))
      OR EXISTS (
        SELECT 1 FROM platform.categories c
        WHERE c.dimension='seo_value_band' AND c.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_levels) incoming
            WHERE incoming->>'value' = c.slug)) THEN
        RAISE EXCEPTION 'seo_settings_platform_identities_fixed: add or retire platform level identities in the vocabulary registry; this screen changes their names and thresholds';
      END IF;
      FOR e IN SELECT * FROM jsonb_array_elements(p_levels) LOOP
        UPDATE platform.categories c
           SET metadata = CASE WHEN e->>'value' = 'negative'
                               THEN COALESCE(c.metadata,'{}'::jsonb) - 'min_score'
                               ELSE COALESCE(c.metadata,'{}'::jsonb)
                                    || jsonb_build_object('min_score', (e->>'min_score')::numeric) END,
               name = COALESCE(NULLIF(btrim(COALESCE(e->>'label','')),''), c.name),
               updated_at = now()
         WHERE c.dimension='seo_value_band' AND c.deleted_at IS NULL AND c.slug = e->>'value';
      END LOOP;
    END IF;
    IF 'baseline' = ANY(p_clear) OR 'levels' = ANY(p_clear) THEN
      RAISE EXCEPTION 'seo_settings_platform_is_the_floor: the platform tier has nothing above it to inherit from — change the values instead of clearing them';
    END IF;

  ELSIF p_scope IN ('org','brand') THEN
    IF p_scope = 'org' THEN
      SELECT COALESCE(o.settings->'keyword_value','{}'::jsonb) INTO v_kv FROM iam.organizations o WHERE o.id = p_id;
    ELSE
      SELECT COALESCE(b.settings->'keyword_value','{}'::jsonb) INTO v_kv FROM web.brand b WHERE b.id = p_id AND b.deleted_at IS NULL;
    END IF;
    IF v_kv IS NULL THEN
      perform platform.refuse_not_found(format('seo_settings_scope_not_found: no %s with id %s', p_scope, p_id));
    END IF;
    IF p_baseline IS NOT NULL THEN v_kv := v_kv || jsonb_build_object('baseline', p_baseline); END IF;
    IF p_levels   IS NOT NULL THEN v_kv := v_kv || jsonb_build_object('levels', v_compact_levels); END IF;
    IF 'baseline' = ANY(p_clear) THEN v_kv := v_kv - 'baseline'; END IF;
    IF 'levels'   = ANY(p_clear) THEN v_kv := v_kv - 'levels';   END IF;

    IF p_scope = 'org' THEN
      UPDATE iam.organizations o
         SET settings = CASE WHEN v_kv = '{}'::jsonb
                             THEN COALESCE(o.settings,'{}'::jsonb) - 'keyword_value'
                             ELSE COALESCE(o.settings,'{}'::jsonb) || jsonb_build_object('keyword_value', v_kv) END
       WHERE o.id = p_id;
    ELSE
      UPDATE web.brand b
         SET settings = CASE WHEN v_kv = '{}'::jsonb
                             THEN COALESCE(b.settings,'{}'::jsonb) - 'keyword_value'
                             ELSE COALESCE(b.settings,'{}'::jsonb) || jsonb_build_object('keyword_value', v_kv) END,
             updated_at = now(), updated_by = (SELECT auth.uid())
       WHERE b.id = p_id AND b.deleted_at IS NULL;
    END IF;

  ELSE
    SELECT COALESCE(s.settings->'keyword_value','{}'::jsonb) INTO v_kv FROM web.site s WHERE s.id = p_id AND s.deleted_at IS NULL;
    IF v_kv IS NULL THEN
      perform platform.refuse_not_found(format('gsc_site_not_found: %s', p_id));
    END IF;
    IF p_baseline IS NOT NULL THEN v_kv := v_kv || jsonb_build_object('baseline', p_baseline); END IF;
    IF 'baseline' = ANY(p_clear) THEN v_kv := v_kv - 'baseline'; END IF;
    UPDATE web.site s
       SET settings = CASE WHEN v_kv = '{}'::jsonb
                           THEN COALESCE(s.settings,'{}'::jsonb) - 'keyword_value'
                           ELSE COALESCE(s.settings,'{}'::jsonb) || jsonb_build_object('keyword_value', v_kv) END,
           updated_at = now(), updated_by = (SELECT auth.uid())
     WHERE s.id = p_id AND s.deleted_at IS NULL;

    IF p_levels IS NOT NULL THEN
      PERFORM seo.gsc_save_value_vocabulary(p_id, 'value_band', v_vocab_levels, '{}'::jsonb);
    END IF;
    IF 'levels' = ANY(p_clear) THEN
      PERFORM seo.gsc_reset_value_vocabulary(p_id, 'value_band', '{}'::jsonb);
    END IF;
  END IF;

  RETURN seo.value_settings_scope(p_scope, p_id);
END;
$function$;

CREATE OR REPLACE FUNCTION seo.site_keyword_value_copy(p_from_site uuid, p_to_site uuid, p_keyword_ids uuid[] DEFAULT NULL::uuid[], p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'seo', 'web', 'iam', 'public', 'pg_temp'
AS $function$
DECLARE
  v_copied     int;
  v_skipped    int;
  v_org        uuid;
  v_from_label text;
  v_to_label   text;
BEGIN
  IF p_from_site IS NULL OR p_to_site IS NULL THEN
    RAISE EXCEPTION 'seo_copy_needs_two_sites: choose the site to copy from and the site to copy into';
  END IF;
  IF p_from_site = p_to_site THEN
    RAISE EXCEPTION 'seo_copy_same_site: those are the same site';
  END IF;
  IF NOT seo.fn_is_site_editor(p_from_site) THEN
    RAISE EXCEPTION 'seo_copy_denied_source: you can not read the keywords of the site you are copying from'
      USING ERRCODE = '42501';
  END IF;
  IF NOT seo.fn_is_site_editor(p_to_site) THEN
    RAISE EXCEPTION 'seo_copy_denied_target: you do not have permission to change this site'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(name, domain) INTO v_from_label FROM web.site WHERE id = p_from_site AND deleted_at IS NULL;
  SELECT COALESCE(name, domain), organization_id INTO v_to_label, v_org FROM web.site WHERE id = p_to_site AND deleted_at IS NULL;
  IF v_from_label IS NULL OR v_to_label IS NULL THEN
    perform platform.refuse_not_found('seo_site_not_found: one of those sites does not exist');
  END IF;

  SELECT count(*) FILTER (WHERE NOT dup), count(*) FILTER (WHERE dup) INTO v_copied, v_skipped
  FROM (
    SELECT EXISTS (
             SELECT 1 FROM seo.site_keyword_value t
              WHERE t.site_id = p_to_site AND t.deleted_at IS NULL AND t.keyword_id = s.keyword_id
           ) AS dup
      FROM seo.site_keyword_value s
     WHERE s.site_id = p_from_site AND s.deleted_at IS NULL
       AND (p_keyword_ids IS NULL OR s.keyword_id = ANY(p_keyword_ids))
  ) x;

  IF NOT p_dry_run THEN
    INSERT INTO seo.site_keyword_value (site_id, keyword_id, organization_id, created_by, metadata)
    SELECT p_to_site, s.keyword_id, v_org, (SELECT auth.uid()),
           COALESCE(s.metadata, '{}'::jsonb) || jsonb_build_object('copied_from_site', p_from_site)
      FROM seo.site_keyword_value s
     WHERE s.site_id = p_from_site AND s.deleted_at IS NULL
       AND (p_keyword_ids IS NULL OR s.keyword_id = ANY(p_keyword_ids))
       AND NOT EXISTS (
             SELECT 1 FROM seo.site_keyword_value t
              WHERE t.site_id = p_to_site AND t.deleted_at IS NULL AND t.keyword_id = s.keyword_id
           );
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'from', jsonb_build_object('id', p_from_site, 'label', v_from_label),
    'to',   jsonb_build_object('id', p_to_site,   'label', v_to_label),
    'copied', v_copied,
    'skipped_existing', v_skipped);
END;
$function$;

CREATE OR REPLACE FUNCTION seo.site_meaning_copy(p_from_site uuid, p_to_site uuid, p_parts text[] DEFAULT ARRAY['matchers'::text, 'worth'::text, 'geo'::text, 'topics'::text, 'combos'::text, 'guidelines'::text], p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
DECLARE
  v_out        jsonb := '[]'::jsonb;
  v_copied     int;
  v_skipped    int;
  v_org        uuid;
  v_from_label text;
  v_to_label   text;
  r            record;
  v_val        uuid;
  v_ids        uuid[];
BEGIN
  -- A caller that passes NULL means "everything" — before this, `= ANY(NULL)`
  -- is NULL for every part, so the copy silently did nothing and reported 0.
  p_parts := COALESCE(p_parts, ARRAY['matchers','worth','geo','topics','combos','guidelines']);

  IF p_from_site IS NULL OR p_to_site IS NULL THEN
    RAISE EXCEPTION 'seo_copy_needs_two_sites: choose the site to copy from and the site to copy into';
  END IF;
  IF p_from_site = p_to_site THEN
    RAISE EXCEPTION 'seo_copy_same_site: those are the same site';
  END IF;
  IF NOT seo.fn_is_site_editor(p_from_site) THEN
    RAISE EXCEPTION 'seo_copy_denied_source: you can not read the meaning of the site you are copying from'
      USING ERRCODE = '42501';
  END IF;
  IF NOT seo.fn_is_site_editor(p_to_site) THEN
    RAISE EXCEPTION 'seo_copy_denied_target: you do not have permission to change this site'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(name, domain) INTO v_from_label FROM web.site WHERE id = p_from_site AND deleted_at IS NULL;
  SELECT COALESCE(name, domain), organization_id INTO v_to_label, v_org FROM web.site WHERE id = p_to_site AND deleted_at IS NULL;
  IF v_from_label IS NULL OR v_to_label IS NULL THEN
    perform platform.refuse_not_found('gsc_site_not_found: one of those sites does not exist');
  END IF;

  -- Map every value the source uses onto an id that is valid for the target.
  -- Platform values map to themselves; a site value is recreated on the target.
  -- ON COMMIT DROP is not enough: two calls inside ONE transaction (a preview
  -- then the write, which is exactly how the screen uses this) would collide.
  DROP TABLE IF EXISTS _val_map;
  CREATE TEMP TABLE _val_map (src uuid PRIMARY KEY, dst uuid) ON COMMIT DROP;

  INSERT INTO _val_map (src, dst)
  SELECT DISTINCT v.id,
         CASE WHEN COALESCE(d.metadata->>'scope','platform') <> 'site' THEN v.id ELSE NULL END
  FROM platform.categories v
  JOIN platform.categories d ON d.id = v.parent_id AND d.dimension = 'seo_facet'
  WHERE v.deleted_at IS NULL AND d.deleted_at IS NULL
    AND (v.id IN (SELECT m.value_id FROM seo.dimension_value_matcher m
                   WHERE m.site_id = p_from_site AND m.deleted_at IS NULL)
      OR v.id IN (SELECT w.value_id FROM seo.site_value_worth w
                   WHERE w.site_id = p_from_site AND w.deleted_at IS NULL)
      OR v.id IN (SELECT unnest(c.value_ids) FROM seo.site_value_combo c
                   WHERE c.site_id = p_from_site AND c.deleted_at IS NULL));

  FOR r IN
    SELECT vm.src, v.slug AS value_slug, v.name AS value_label, v.metadata AS value_meta,
           d.name AS dim_label, d.metadata AS dim_meta, d.slug AS dim_slug
      FROM _val_map vm
      JOIN platform.categories v ON v.id = vm.src
      JOIN platform.categories d ON d.id = v.parent_id
     WHERE vm.dst IS NULL
  LOOP
    v_val := seo._ensure_value(
      seo._ensure_site_dimension(
        p_to_site,
        COALESCE(r.dim_meta->>'standard_key', regexp_replace(r.dim_slug, '_[0-9a-f]{8}$', '')),
        r.dim_label,
        r.dim_meta->>'description',
        COALESCE(r.dim_meta->>'nature','intrinsic')),
      COALESCE(r.value_meta->>'value', split_part(r.value_slug, ':', 2)),
      r.value_label,
      COALESCE(r.value_meta, '{}'::jsonb));
    UPDATE _val_map SET dst = v_val WHERE src = r.src;
  END LOOP;

  -- ── matchers ──────────────────────────────────────────────────────────────
  IF 'matchers' = ANY(p_parts) THEN
    SELECT count(*) FILTER (WHERE NOT dup), count(*) FILTER (WHERE dup) INTO v_copied, v_skipped
    FROM (
      SELECT EXISTS (
               SELECT 1 FROM seo.dimension_value_matcher t
                WHERE t.site_id = p_to_site AND t.deleted_at IS NULL
                  AND t.value_id = vm.dst AND t.kind = m.kind
                  AND t.pattern IS NOT DISTINCT FROM m.pattern
                  AND t.place_id IS NOT DISTINCT FROM m.place_id) AS dup
        FROM seo.dimension_value_matcher m
        JOIN _val_map vm ON vm.src = m.value_id
       WHERE m.site_id = p_from_site AND m.deleted_at IS NULL
    ) x;
    IF NOT p_dry_run THEN
      INSERT INTO seo.dimension_value_matcher
        (site_id, value_id, kind, pattern, place_id, fact_value_id, enabled, origin, notes, organization_id, created_by, metadata)
      SELECT p_to_site, vm.dst, m.kind, m.pattern, m.place_id,
             (SELECT vm2.dst FROM _val_map vm2 WHERE vm2.src = m.fact_value_id),
             m.enabled, 'human', m.notes, v_org, (SELECT auth.uid()),
             COALESCE(m.metadata,'{}'::jsonb) || jsonb_build_object('copied_from_site', p_from_site)
        FROM seo.dimension_value_matcher m
        JOIN _val_map vm ON vm.src = m.value_id
       WHERE m.site_id = p_from_site AND m.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM seo.dimension_value_matcher t
            WHERE t.site_id = p_to_site AND t.deleted_at IS NULL
              AND t.value_id = vm.dst AND t.kind = m.kind
              AND t.pattern IS NOT DISTINCT FROM m.pattern
              AND t.place_id IS NOT DISTINCT FROM m.place_id);
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('part','matchers','copied',v_copied,'skipped_existing',v_skipped));
  END IF;

  -- ── worth ─────────────────────────────────────────────────────────────────
  IF 'worth' = ANY(p_parts) THEN
    SELECT count(*) FILTER (WHERE NOT dup), count(*) FILTER (WHERE dup) INTO v_copied, v_skipped
    FROM (
      SELECT EXISTS (SELECT 1 FROM seo.site_value_worth t
                      WHERE t.site_id = p_to_site AND t.deleted_at IS NULL AND t.value_id = vm.dst) AS dup
        FROM seo.site_value_worth w JOIN _val_map vm ON vm.src = w.value_id
       WHERE w.site_id = p_from_site AND w.deleted_at IS NULL) x;
    IF NOT p_dry_run THEN
      INSERT INTO seo.site_value_worth (site_id, value_id, effect, amount, origin, notes, organization_id, created_by, metadata)
      SELECT p_to_site, vm.dst, w.effect, w.amount, 'human', w.notes, v_org, (SELECT auth.uid()),
             COALESCE(w.metadata,'{}'::jsonb) || jsonb_build_object('copied_from_site', p_from_site)
        FROM seo.site_value_worth w JOIN _val_map vm ON vm.src = w.value_id
       WHERE w.site_id = p_from_site AND w.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM seo.site_value_worth t
                          WHERE t.site_id = p_to_site AND t.deleted_at IS NULL AND t.value_id = vm.dst);
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('part','worth','copied',v_copied,'skipped_existing',v_skipped));
  END IF;

  -- ── geo areas (places and words travel; brand-owned locations do not) ─────
  IF 'geo' = ANY(p_parts) THEN
    SELECT count(*) FILTER (WHERE NOT dup), count(*) FILTER (WHERE dup) INTO v_copied, v_skipped
    FROM (SELECT EXISTS (SELECT 1 FROM seo.site_geo_area t
                          WHERE t.site_id = p_to_site AND t.deleted_at IS NULL AND lower(t.label) = lower(g.label)) AS dup
            FROM seo.site_geo_area g WHERE g.site_id = p_from_site AND g.deleted_at IS NULL) x;
    IF NOT p_dry_run THEN
      INSERT INTO seo.site_geo_area (site_id, label, area_kind, match_tokens, geo_band, notes, place_ids, organization_id, created_by, metadata)
      SELECT p_to_site, g.label, g.area_kind, g.match_tokens, g.geo_band, g.notes, g.place_ids, v_org, (SELECT auth.uid()),
             COALESCE(g.metadata,'{}'::jsonb) || jsonb_build_object('copied_from_site', p_from_site)
        FROM seo.site_geo_area g
       WHERE g.site_id = p_from_site AND g.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM seo.site_geo_area t
                          WHERE t.site_id = p_to_site AND t.deleted_at IS NULL AND lower(t.label) = lower(g.label));
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('part','geo','copied',v_copied,'skipped_existing',v_skipped));
  END IF;

  -- ── topic worth (topics are global, so the ids travel as they are) ────────
  IF 'topics' = ANY(p_parts) THEN
    SELECT count(*) FILTER (WHERE NOT dup), count(*) FILTER (WHERE dup) INTO v_copied, v_skipped
    FROM (SELECT EXISTS (SELECT 1 FROM seo.site_topic_value t
                          WHERE t.site_id = p_to_site AND t.deleted_at IS NULL AND t.topic_id = v.topic_id) AS dup
            FROM seo.site_topic_value v WHERE v.site_id = p_from_site AND v.deleted_at IS NULL) x;
    IF NOT p_dry_run THEN
      INSERT INTO seo.site_topic_value
        (site_id, topic_id, offering_match, lead_quality, audience_fit, capacity_appetite, brand_fit, weight, notes, organization_id, created_by, metadata)
      SELECT p_to_site, v.topic_id, v.offering_match, v.lead_quality, v.audience_fit, v.capacity_appetite,
             v.brand_fit, v.weight, v.notes, v_org, (SELECT auth.uid()),
             COALESCE(v.metadata,'{}'::jsonb) || jsonb_build_object('copied_from_site', p_from_site)
        FROM seo.site_topic_value v
       WHERE v.site_id = p_from_site AND v.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM seo.site_topic_value t
                          WHERE t.site_id = p_to_site AND t.deleted_at IS NULL AND t.topic_id = v.topic_id);
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('part','topics','copied',v_copied,'skipped_existing',v_skipped));
  END IF;

  -- ── combinations (remapped through the same value map) ───────────────────
  IF 'combos' = ANY(p_parts) THEN
    v_copied := 0; v_skipped := 0;
    FOR r IN SELECT c.* FROM seo.site_value_combo c
              WHERE c.site_id = p_from_site AND c.deleted_at IS NULL
    LOOP
      SELECT array_agg(vm.dst ORDER BY vm.dst) INTO v_ids
        FROM unnest(r.value_ids) s(id) JOIN _val_map vm ON vm.src = s.id;
      IF v_ids IS NULL OR array_length(v_ids,1) IS DISTINCT FROM array_length(r.value_ids,1) THEN
        CONTINUE;  -- a value that could not be mapped: skip rather than invent one
      END IF;
      IF EXISTS (SELECT 1 FROM seo.site_value_combo t
                  WHERE t.site_id = p_to_site AND t.deleted_at IS NULL
                    AND t.value_ids @> v_ids AND t.value_ids <@ v_ids) THEN
        v_skipped := v_skipped + 1;
      ELSE
        v_copied := v_copied + 1;
        IF NOT p_dry_run THEN
          INSERT INTO seo.site_value_combo (site_id, value_ids, effect, amount, label, notes, origin, enabled, organization_id, created_by, metadata)
          VALUES (p_to_site, v_ids, r.effect, r.amount, r.label, r.notes, 'human', r.enabled, v_org, (SELECT auth.uid()),
                  COALESCE(r.metadata,'{}'::jsonb) || jsonb_build_object('copied_from_site', p_from_site));
        END IF;
      END IF;
    END LOOP;
    v_out := v_out || jsonb_build_array(jsonb_build_object('part','combos','copied',v_copied,'skipped_existing',v_skipped));
  END IF;

  -- ── business guidelines (only when the target has none) ──────────────────
  IF 'guidelines' = ANY(p_parts) THEN
    v_copied := 0; v_skipped := 0;
    IF (SELECT NULLIF(btrim(COALESCE(s.settings->'kw_guidelines'->>'text','')),'') FROM web.site s WHERE s.id = p_to_site) IS NOT NULL THEN
      v_skipped := 1;
    ELSIF (SELECT NULLIF(btrim(COALESCE(s.settings->'kw_guidelines'->>'text','')),'') FROM web.site s WHERE s.id = p_from_site) IS NOT NULL THEN
      v_copied := 1;
      IF NOT p_dry_run THEN
        PERFORM seo.gsc_set_site_kw_guidelines(
          p_to_site,
          (SELECT s.settings->'kw_guidelines'->>'text' FROM web.site s WHERE s.id = p_from_site));
      END IF;
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('part','guidelines','copied',v_copied,'skipped_existing',v_skipped));
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'from', jsonb_build_object('id', p_from_site, 'label', v_from_label),
    'to',   jsonb_build_object('id', p_to_site,   'label', v_to_label),
    'parts', v_out,
    'total_copied', (SELECT COALESCE(sum((e->>'copied')::int),0) FROM jsonb_array_elements(v_out) e),
    'total_skipped', (SELECT COALESCE(sum((e->>'skipped_existing')::int),0) FROM jsonb_array_elements(v_out) e),
    -- Stamps are never copied: the target's own matchers decide what its own
    -- keywords mean, and that answer is produced by running the engine.
    'next_step', CASE WHEN p_dry_run THEN 'preview only — nothing was written'
                      ELSE 'run the matchers on this site so the copied rules stamp its keywords' END);
END;
$function$;

CREATE OR REPLACE FUNCTION seo.site_value_worth_upsert(p_site_id uuid, p_value_id uuid, p_effect text, p_amount numeric DEFAULT NULL::numeric, p_origin text DEFAULT 'human'::text, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, site_id uuid, value_id uuid, effect text, amount numeric, origin text, notes text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'web', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_org    uuid;
  v_dim    record;
  v_id     uuid;
  v_amount numeric;
  v_notes  text := NULLIF(btrim(COALESCE(p_notes,'')),'');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_worth_unauthenticated';
  END IF;
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  SELECT s.organization_id INTO v_org FROM web.site s
   WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_org IS NULL THEN
    perform platform.refuse_not_found(format('gsc_site_not_found: %s', p_site_id));
  END IF;

  IF p_effect NOT IN ('add','scale','never','clear') THEN
    RAISE EXCEPTION 'seo_worth_bad_effect: % (add | scale | never | clear)', p_effect;
  END IF;
  IF p_origin NOT IN ('human','pack','agent','migration') THEN
    RAISE EXCEPTION 'seo_worth_bad_origin: %', p_origin;
  END IF;

  SELECT v.id AS id,
         d.slug AS dimension_slug,
         COALESCE(d.metadata->>'scope','platform') AS scope,
         (d.metadata->>'site_id')::uuid AS dim_site_id
    INTO v_dim
  FROM platform.categories v
  JOIN platform.categories d ON d.id = v.parent_id AND d.deleted_at IS NULL
  WHERE v.id = p_value_id AND v.deleted_at IS NULL AND v.dimension = 'seo_facet';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_worth_unknown_value: % is not a value of any keyword dimension', p_value_id;
  END IF;
  IF v_dim.scope = 'site' AND v_dim.dim_site_id IS DISTINCT FROM p_site_id THEN
    RAISE EXCEPTION 'seo_worth_forbidden: "%" belongs to another site', v_dim.dimension_slug;
  END IF;

  IF p_effect = 'clear' THEN
    UPDATE seo.site_value_worth w
       SET deleted_at = now(), updated_by = v_uid, updated_at = now()
     WHERE w.site_id = p_site_id AND w.value_id = p_value_id AND w.deleted_at IS NULL;
    RETURN;
  END IF;

  v_amount := CASE WHEN p_effect = 'never' THEN NULL ELSE p_amount END;

  -- Explicit find-then-write, NOT `ON CONFLICT (site_id, value_id)`: this
  -- function's RETURNS TABLE out-params are named after the very columns the
  -- conflict target names, and PL/pgSQL resolves that to "column reference
  -- site_id is ambiguous" AT RUN TIME — the function creates cleanly and then
  -- fails on the first real call. svw_site_value_uniq still guarantees the
  -- one-row-per-(site,value) rule underneath.
  SELECT w.id INTO v_id
    FROM seo.site_value_worth w
   WHERE w.site_id = p_site_id AND w.value_id = p_value_id AND w.deleted_at IS NULL
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO seo.site_value_worth AS w
      (site_id, value_id, effect, amount, origin, notes, organization_id, created_by, updated_by)
    VALUES
      (p_site_id, p_value_id, p_effect, v_amount, p_origin, v_notes, v_org, v_uid, v_uid)
    RETURNING w.id INTO v_id;
  ELSE
    UPDATE seo.site_value_worth w
       SET effect     = p_effect,
           amount     = v_amount,
           origin     = p_origin,
           notes      = COALESCE(v_notes, w.notes),
           updated_by = v_uid,
           updated_at = now()
     WHERE w.id = v_id;
  END IF;

  RETURN QUERY
  SELECT w.id, w.site_id, w.value_id, w.effect, w.amount, w.origin, w.notes, w.updated_at
    FROM seo.site_value_worth w WHERE w.id = v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.split_map_topic(p_map_id uuid, p_slug text, p_children jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_map record; v_tid uuid; v_tree jsonb; v_res jsonb;
BEGIN
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'split_map_topic: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_slug IS NULL THEN RAISE EXCEPTION 'split_map_topic: p_slug is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_children IS NULL THEN RAISE EXCEPTION 'split_map_topic: p_children is required (got NULL)' USING ERRCODE='22023'; END IF;
  v_map := seo._tm_map(p_map_id, 'editor');
  v_tid := seo._tm_topic_id(p_map_id, p_slug);
  IF v_tid IS NULL THEN perform platform.refuse_not_found(format('topic %s not found', p_slug)); END IF;
  IF jsonb_typeof(p_children) <> 'array' THEN RAISE EXCEPTION 'p_children must be a JSON array' USING ERRCODE='22023'; END IF;
  SELECT jsonb_agg(c || jsonb_build_object('parent_slug', p_slug)) INTO v_tree FROM jsonb_array_elements(p_children) c;
  v_res := seo.upsert_map_topics(p_map_id, COALESCE(v_tree, '[]'::jsonb));
  RETURN v_res || jsonb_build_object('parent', p_slug, 'attachments', 'left on parent');
END $function$;

CREATE OR REPLACE FUNCTION seo.starter_pack_set_status(p_pack_id uuid, p_status text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'seo', 'iam'
AS $function$
declare v_row seo.starter_pack; v_uid uuid := auth.uid(); v_from text;
begin
  select status into v_from from seo.starter_pack where id = p_pack_id and deleted_at is null;
  if v_from is null then perform platform.refuse_not_found(format('seo_pack_not_found: %s', p_pack_id)); end if;
  if p_status not in ('draft','proposed','ratified','retired') then raise exception 'seo_pack_bad_status: %', p_status; end if;
  if p_status in ('ratified', 'retired') or v_from in ('ratified', 'retired') then
    if not public.is_admin() then
      raise exception 'seo_pack_status_denied: only a platform admin ratifies or retires a pack' using errcode = '42501';
    end if;
  else
    perform seo._pack_assert_author(p_pack_id);
  end if;
  update seo.starter_pack set
    status = p_status,
    proposed_by = case when p_status = 'proposed' then v_uid else proposed_by end,
    proposed_at = case when p_status = 'proposed' then now() else proposed_at end,
    ratified_by = case when p_status = 'ratified' then v_uid else ratified_by end,
    ratified_at = case when p_status = 'ratified' then now() else ratified_at end,
    ratification_notes = case when p_status = 'ratified' then p_notes else ratification_notes end,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('status_history',
      coalesce(metadata->'status_history', '[]'::jsonb) || jsonb_build_object('from', v_from, 'to', p_status, 'at', now(), 'by', v_uid, 'notes', p_notes)),
    updated_at = now(), updated_by = v_uid
  where id = p_pack_id returning * into v_row;
  -- A pack that leaves `ratified` must leave its industry/global audiences too — the grant
  -- was issued on the ratified content. Pilot (organization) grants stay.
  if v_from = 'ratified' and p_status <> 'ratified' then
    delete from platform.entity_grants where entity_type = 'seo_starter_pack' and entity_id = p_pack_id and audience in ('industry', 'global');
  end if;
  -- Acting organization: the pack row's own organization.
  perform public._library_audit(v_uid, v_row.organization_id, 'pack_status', 'seo_starter_pack', p_pack_id,
                                v_row.industry_id, null,
                                jsonb_build_object('from', v_from, 'to', p_status, 'notes', p_notes));
  return to_jsonb(v_row) - 'proposal';
end $function$;

CREATE OR REPLACE FUNCTION seo.update_backlink_human_ruling(p_backlink_id uuid, p_ruling jsonb)
 RETURNS seo.backlink
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row seo.backlink;
BEGIN
  IF p_ruling IS NULL OR jsonb_typeof(p_ruling) <> 'object' THEN
    RAISE EXCEPTION 'backlink ruling must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(p_ruling) > 20000 THEN
    RAISE EXCEPTION 'backlink ruling exceeds 20KB' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM seo.backlink WHERE id = p_backlink_id;
  IF NOT FOUND THEN
    perform platform.refuse_not_found('backlink not found');
  END IF;
  IF NOT iam.has_access('web_site', v_row.site_id, 'editor') THEN
    RAISE EXCEPTION 'editor access required' USING ERRCODE = '42501';
  END IF;
  UPDATE seo.backlink SET
    human_ruling = p_ruling || jsonb_build_object(
      'updated_by', (select auth.uid()), 'updated_at', now()),
    resolved_assessment = coalesce(deterministic_assessment, '{}'::jsonb)
      || coalesce(ai_assessment, '{}'::jsonb)
      || p_ruling
      || jsonb_build_object(
        'deterministic_assessment', coalesce(deterministic_assessment, '{}'::jsonb),
        'ai_assessment', coalesce(ai_assessment, '{}'::jsonb),
        'human_ruling', p_ruling),
    human_reviewed_at = now(),
    updated_at = now()
  WHERE id = p_backlink_id
  RETURNING * INTO v_row;
  RETURN v_row;
END
$function$;

CREATE OR REPLACE FUNCTION seo.update_competitor_opportunity_status(p_opportunity_id uuid, p_status text, p_human_notes text DEFAULT NULL::text)
 RETURNS seo.competitor_opportunity
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row seo.competitor_opportunity;
begin
  if p_status not in ('open','accepted','in_progress','completed','dismissed') then
    raise exception 'invalid opportunity status' using errcode = '22023';
  end if;
  if length(coalesce(p_human_notes, '')) > 10000 then
    raise exception 'opportunity notes exceed 10KB' using errcode = '22023';
  end if;
  select * into v_row from seo.competitor_opportunity where id = p_opportunity_id;
  if not found then
    perform platform.refuse_not_found('competitor opportunity not found');
  end if;
  if not iam.has_access('web_site', v_row.site_id, 'editor') then
    raise exception 'editor access required' using errcode = '42501';
  end if;
  update seo.competitor_opportunity set
    status = p_status,
    human_notes = p_human_notes,
    accepted_at = case when p_status = 'accepted' then now() else accepted_at end,
    completed_at = case when p_status = 'completed' then now() else null end,
    dismissed_at = case when p_status = 'dismissed' then now() else null end,
    updated_at = now()
  where id = p_opportunity_id
  returning * into v_row;
  return v_row;
end
$function$;

CREATE OR REPLACE FUNCTION seo.update_competitor_tracking(p_competitor_id uuid, p_tracking_status text, p_human_ruling jsonb DEFAULT '{}'::jsonb)
 RETURNS seo.competitor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row seo.competitor;
begin
  if p_tracking_status not in ('candidate','tracked','ignored','archived') then
    raise exception 'invalid competitor tracking status' using errcode = '22023';
  end if;
  if p_human_ruling is null or jsonb_typeof(p_human_ruling) <> 'object' then
    raise exception 'competitor ruling must be a JSON object' using errcode = '22023';
  end if;
  if pg_column_size(p_human_ruling) > 20000 then
    raise exception 'competitor ruling exceeds 20KB' using errcode = '22023';
  end if;
  select * into v_row from seo.competitor where id = p_competitor_id;
  if not found then
    perform platform.refuse_not_found('competitor not found');
  end if;
  if not iam.has_access('web_site', v_row.site_id, 'editor') then
    raise exception 'editor access required' using errcode = '42501';
  end if;
  update seo.competitor set
    tracking_status = p_tracking_status,
    human_ruling = p_human_ruling || jsonb_build_object('updated_by', (select auth.uid()), 'updated_at', now()),
    resolved_assessment = coalesce(latest_autopsy, '{}'::jsonb)
      || p_human_ruling
      || jsonb_build_object('human_ruling', p_human_ruling),
    human_reviewed_at = now(),
    updated_at = now()
  where id = p_competitor_id
  returning * into v_row;
  return v_row;
end
$function$;

CREATE OR REPLACE FUNCTION seo.update_referring_domain_human_ruling(p_profile_id uuid, p_ruling jsonb)
 RETURNS seo.referring_domain_profile
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row seo.referring_domain_profile;
BEGIN
  IF p_ruling IS NULL OR jsonb_typeof(p_ruling) <> 'object' THEN
    RAISE EXCEPTION 'referring-domain ruling must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(p_ruling) > 20000 THEN
    RAISE EXCEPTION 'referring-domain ruling exceeds 20KB' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM seo.referring_domain_profile WHERE id = p_profile_id;
  IF NOT FOUND THEN
    perform platform.refuse_not_found('referring-domain profile not found');
  END IF;
  IF NOT iam.has_access('web_site', v_row.site_id, 'editor') THEN
    RAISE EXCEPTION 'editor access required' USING ERRCODE = '42501';
  END IF;
  UPDATE seo.referring_domain_profile SET
    human_ruling = p_ruling || jsonb_build_object(
      'updated_by', (select auth.uid()), 'updated_at', now()),
    opinion_verdict = coalesce(
      nullif(p_ruling ->> 'verdict', ''), opinion_verdict),
    resolved_opinion = coalesce(ai_assessment, '{}'::jsonb)
      || p_ruling
      || jsonb_build_object(
        'ai_opinion', coalesce(ai_assessment, '{}'::jsonb),
        'human_ruling', p_ruling),
    human_reviewed_at = now(),
    updated_at = now()
  WHERE id = p_profile_id
  RETURNING * INTO v_row;
  RETURN v_row;
END
$function$;

CREATE OR REPLACE FUNCTION seo.upsert_map_topics(p_map_id uuid, p_tree jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_map record; v_cap int; r seo.tm_in; v_id uuid; v_parent uuid; v_in jsonb;
  v_created text[] := '{}'; v_updated text[] := '{}'; v_unchanged text[] := '{}'; v_errors jsonb := '[]'::jsonb;
  v_changed boolean;
  -- ROUND 26.
  v_policy text; v_why text; v_cur_status text; v_cur_name text;
  v_skipped text[] := '{}';
  v_refused jsonb := '[]'::jsonb; v_proposed jsonb := '[]'::jsonb;
  v_kept_retired jsonb := '[]'::jsonb; v_lifted jsonb := '[]'::jsonb;
  v_eff text; v_next text; v_guard int; v_in_payload boolean;
BEGIN
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'upsert_map_topics: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_tree IS NULL THEN RAISE EXCEPTION 'upsert_map_topics: p_tree is required (got NULL)' USING ERRCODE='22023'; END IF;
  v_map := seo._tm_map(p_map_id, 'editor');
  v_cap := seo._tm_knob_int('topic_description_max_chars', v_map.organization_id, v_map.brand_id, NULL);
  IF jsonb_typeof(p_tree) <> 'array' THEN RAISE EXCEPTION 'p_tree must be a JSON array' USING ERRCODE='22023'; END IF;

  WITH RECURSIVE flat AS (
    SELECT e.value AS node, (e.ord)::int AS ord, NULL::text AS parent_slug, 0 AS lvl
      FROM jsonb_array_elements(p_tree) WITH ORDINALITY e(value, ord)
    UNION ALL
    SELECT c.value, (c.ord)::int, flat.node->>'slug', flat.lvl + 1
      FROM flat, jsonb_array_elements(COALESCE(flat.node->'children','[]'::jsonb)) WITH ORDINALITY c(value, ord)
     WHERE flat.lvl < 200
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.ord), '[]'::jsonb) INTO v_in FROM (
    SELECT (row_number() OVER (ORDER BY flat.lvl, flat.ord))::int AS ord,
           flat.node->>'slug' AS slug,
           COALESCE(flat.node->>'parent_slug', flat.parent_slug) AS parent_slug,
           flat.node->>'name' AS name,
           flat.node->>'description' AS description,
           COALESCE((flat.node->>'sort_order')::int, flat.ord) AS sort_order,
           COALESCE(flat.node->>'status','active') AS status
      FROM flat) x;

  FOR r IN SELECT * FROM jsonb_populate_recordset(NULL::seo.tm_in, v_in) i ORDER BY i.ord LOOP
    IF r.slug IS NULL OR r.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
      v_errors := v_errors || jsonb_build_object('slug', r.slug, 'message', 'invalid slug');
    ELSIF r.name IS NULL OR btrim(r.name) = '' THEN
      v_errors := v_errors || jsonb_build_object('slug', r.slug, 'message', 'name is required');
    ELSIF r.description IS NOT NULL AND length(r.description) > v_cap THEN
      v_errors := v_errors || jsonb_build_object('slug', r.slug, 'message', format('description longer than %s characters', v_cap));
    ELSIF r.status NOT IN ('proposed','active','retired') THEN
      v_errors := v_errors || jsonb_build_object('slug', r.slug, 'message', 'invalid status');
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM (SELECT i.slug FROM jsonb_populate_recordset(NULL::seo.tm_in, v_in) i GROUP BY i.slug HAVING count(*) > 1) d) > 0 THEN
    v_errors := v_errors || jsonb_build_object('slug',
      (SELECT string_agg(d.slug, ',') FROM (SELECT i.slug FROM jsonb_populate_recordset(NULL::seo.tm_in, v_in) i GROUP BY i.slug HAVING count(*) > 1) d),
      'message', 'duplicate slug in input');
  END IF;
  IF jsonb_array_length(v_errors) > 0 THEN
    RAISE EXCEPTION 'upsert_map_topics: % error(s): %', jsonb_array_length(v_errors), v_errors::text USING ERRCODE='22023';
  END IF;

  -- ═══ ROUND 26 — THE TWO RULES, DECIDED BEFORE ANYTHING IS WRITTEN ═══════════
  -- The behaviour is an org-editable row, read through the platform's own resolver.
  v_policy := COALESCE(seo._tm_knob('geography_branch_policy', v_map.organization_id, v_map.brand_id, NULL) #>> '{}', 'refuse');
  IF v_policy NOT IN ('refuse','propose_as_facet','allow') THEN
    RAISE EXCEPTION 'upsert_map_topics: geography_branch_policy resolved to %; it must be refuse | propose_as_facet | allow', v_policy USING ERRCODE='22023';
  END IF;

  FOR r IN SELECT * FROM jsonb_populate_recordset(NULL::seo.tm_in, v_in) i ORDER BY i.ord LOOP
    v_cur_status := NULL; v_cur_name := NULL;
    SELECT t.status, t.name INTO v_cur_status, v_cur_name
      FROM seo.map_topic t WHERE t.map_id = p_map_id AND t.slug = r.slug AND t.deleted_at IS NULL;

    -- A RETIRED OR REJECTED TOPIC IS NEVER A DESTINATION — not even for its own
    -- resurrection. The row is left byte for byte as it is and the caller is TOLD.
    -- Un-retiring is a deliberate, named act and it has a door: seo.patch_map_topics.
    IF v_cur_status IN ('retired','rejected') AND r.status IN ('proposed','active') THEN
      v_kept_retired := v_kept_retired || jsonb_build_object(
        'slug', r.slug, 'status', v_cur_status,
        'message', format('%L is %s in this map and an upsert never brings a dead topic back. Nothing about it was written. To revive it deliberately, call seo.patch_map_topics with %s', r.slug, v_cur_status,
                          jsonb_build_object('slug', r.slug, 'status', 'active')::text));
      v_skipped := v_skipped || r.slug;
      CONTINUE;
    END IF;

    -- GEOGRAPHY IS A FACET, NEVER A BRANCH. The test fires on a write that MINTS a
    -- slug this map does not have, or RENAMES an existing one — never on a live topic
    -- re-sent unchanged, because removing a branch that already carries pages is
    -- seo.retire_map_topics' decision and not a validator's.
    IF v_policy <> 'allow' AND (v_cur_status IS NULL OR v_cur_name IS DISTINCT FROM r.name) THEN
      v_why := seo._tm_is_a_place(p_map_id, r.slug, r.name);
      IF v_why IS NOT NULL THEN
        v_refused := v_refused || jsonb_build_object('slug', r.slug, 'name', r.name, 'reason', v_why);
        v_skipped := v_skipped || r.slug;
      END IF;
    END IF;
  END LOOP;

  IF v_policy = 'refuse' AND jsonb_array_length(v_refused) > 0 THEN
    RAISE EXCEPTION 'upsert_map_topics: geography is a facet of the map, never a branch of it — % refused: %',
      jsonb_array_length(v_refused), v_refused::text USING ERRCODE='22023';
  END IF;
  IF v_policy = 'propose_as_facet' AND jsonb_array_length(v_refused) > 0 THEN
    -- The knob value that used to lie. The node is NOT written, and the answer names
    -- it as the region value somebody should create instead.
    SELECT jsonb_agg(jsonb_build_object('facet', 'region', 'slug', x->>'slug', 'name', x->>'name', 'reason', x->>'reason'))
      INTO v_proposed FROM jsonb_array_elements(v_refused) x;
  END IF;

  FOR r IN SELECT * FROM jsonb_populate_recordset(NULL::seo.tm_in, v_in) i ORDER BY i.ord LOOP
    CONTINUE WHEN r.slug = ANY(v_skipped);
    SELECT id INTO v_id FROM seo.map_topic WHERE map_id = p_map_id AND slug = r.slug AND deleted_at IS NULL;
    IF v_id IS NULL THEN
      INSERT INTO seo.map_topic (organization_id, map_id, slug, name, description, sort_order, status)
      VALUES (v_map.organization_id, p_map_id, r.slug, r.name, r.description, r.sort_order, r.status);
      v_created := v_created || r.slug;
    ELSE
      UPDATE seo.map_topic t
         SET name = r.name,
             description = COALESCE(r.description, t.description),
             sort_order = r.sort_order,
             status = r.status
       WHERE t.id = v_id
         AND (t.name IS DISTINCT FROM r.name OR (r.description IS NOT NULL AND t.description IS DISTINCT FROM r.description)
              OR t.sort_order IS DISTINCT FROM r.sort_order OR t.status IS DISTINCT FROM r.status);
      GET DIAGNOSTICS v_changed = ROW_COUNT;
      IF v_changed THEN v_updated := v_updated || r.slug; ELSE v_unchanged := v_unchanged || r.slug; END IF;
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM jsonb_populate_recordset(NULL::seo.tm_in, v_in) i ORDER BY i.ord LOOP
    CONTINUE WHEN r.slug = ANY(v_skipped);
    IF r.parent_slug IS NOT NULL THEN
      -- ROUND 26: A CHILD IS NEVER LEFT POINTING AT A SLUG THAT WILL NOT EXIST. When
      -- this call did not write the parent — because it is a place, or because it is
      -- retired and stays retired — the child is lifted to the nearest surviving
      -- ancestor (the payload's chain first, then the map's own), and NULL means the
      -- root. Nothing is lost and the lift is reported, never silent.
      v_eff := r.parent_slug; v_guard := 0;
      WHILE v_eff IS NOT NULL AND v_eff = ANY(v_skipped) AND v_guard < 200 LOOP
        v_guard := v_guard + 1; v_next := NULL;
        SELECT true INTO v_in_payload FROM jsonb_populate_recordset(NULL::seo.tm_in, v_in) i WHERE i.slug = v_eff LIMIT 1;
        IF v_in_payload IS TRUE THEN
          SELECT i.parent_slug INTO v_next FROM jsonb_populate_recordset(NULL::seo.tm_in, v_in) i WHERE i.slug = v_eff LIMIT 1;
        ELSE
          SELECT p.slug INTO v_next FROM seo.map_topic c
            JOIN seo.map_topic p ON p.id = c.parent_id AND p.deleted_at IS NULL
           WHERE c.map_id = p_map_id AND c.slug = v_eff AND c.deleted_at IS NULL;
        END IF;
        v_in_payload := NULL;
        v_eff := v_next;
      END LOOP;
      IF v_eff IS DISTINCT FROM r.parent_slug THEN
        v_lifted := v_lifted || jsonb_build_object('slug', r.slug, 'from', r.parent_slug, 'to', v_eff);
      END IF;

      IF v_eff IS NULL THEN
        UPDATE seo.map_topic SET parent_id = NULL
         WHERE map_id = p_map_id AND slug = r.slug AND deleted_at IS NULL AND parent_id IS NOT NULL;
      ELSE
        v_parent := seo._tm_topic_id(p_map_id, v_eff);
        IF v_parent IS NULL THEN
          perform platform.refuse_not_found(format('upsert_map_topics: parent_slug %s (for %s) not found in map', v_eff, r.slug));
        END IF;
        UPDATE seo.map_topic SET parent_id = v_parent
         WHERE map_id = p_map_id AND slug = r.slug AND deleted_at IS NULL AND parent_id IS DISTINCT FROM v_parent;
      END IF;
      GET DIAGNOSTICS v_changed = ROW_COUNT;
      IF v_changed AND NOT (r.slug = ANY(v_created)) AND NOT (r.slug = ANY(v_updated)) THEN
        v_updated := v_updated || r.slug; v_unchanged := array_remove(v_unchanged, r.slug);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', to_jsonb(v_created), 'updated', to_jsonb(v_updated),
                            'unchanged', to_jsonb(v_unchanged),
                            'geography_policy', v_policy,
                            'geography_refused', v_refused,
                            'region_values_proposed', COALESCE(v_proposed, '[]'::jsonb),
                            'kept_retired', v_kept_retired,
                            'children_lifted', v_lifted);
END $function$;

CREATE OR REPLACE FUNCTION seo.withdraw_page_intents(p_site_id uuid, p_page_ids uuid[], p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
declare
    v_pid uuid;
    v_cur_src text;
    v_cur_state text;
    v_results jsonb := '[]'::jsonb;
    v_gone int := 0;
    v_kept int := 0;
    v_actor uuid := auth.uid();
begin
    if p_site_id is null then
        raise exception 'withdraw_page_intents: p_site_id is required (got NULL)' using errcode = '22023';
    end if;
    if p_page_ids is null then
        raise exception 'withdraw_page_intents: p_page_ids is required (got NULL)' using errcode = '22023';
    end if;
    if p_source is null then
        raise exception 'withdraw_page_intents: p_source is required (got NULL)' using errcode = '22023';
    end if;
    if p_source not in ('mapper', 'human', 'agent') then
        raise exception 'p_source must be mapper|human|agent' using errcode = '22023';
    end if;
    perform seo._tm_site(p_site_id, 'viewer'::public.permission_level, 'withdraw_page_intents_denied');

    foreach v_pid in array p_page_ids loop
        begin
            if not (public.is_platform_admin()
                    or iam.has_access('web_site', p_site_id, 'editor'::public.permission_level)) then
                raise exception 'withdraw_page_intents_denied' using errcode = '42501';
            end if;
            if not exists (select 1 from web.page p
                            where p.id = v_pid and p.site_id = p_site_id and p.deleted_at is null) then
                raise exception 'withdraw_page_intents_denied' using errcode = '42501';
            end if;

            select a.payload ->> 'source', a.payload ->> 'state'
              into v_cur_src, v_cur_state
              from platform.associations a
             where a.source_type = 'web_page' and a.source_id = v_pid
               and a.target_type = 'seo_map_topic' and a.role = 'intent' and a.deleted_at is null
             order by a.created_at desc, a.id desc limit 1;

            if not exists (select 1 from platform.associations a
                            where a.source_type='web_page' and a.source_id=v_pid
                              and a.target_type='seo_map_topic' and a.role='intent'
                              and a.deleted_at is null) then
                v_results := v_results || jsonb_build_object('ok', true, 'page_id', v_pid, 'nothing_to_withdraw', true);
                continue;
            end if;

            -- 🚨 THE SAME PRECEDENCE LADDER ROUND 23 ESTABLISHED, applied to removal.
            -- Withdrawing is a write, and a robot removing a person's decision is the
            -- same defect as a robot overwriting it.
            if p_source <> 'human'
               and (seo._tm_source_rank(v_cur_src) > seo._tm_source_rank(p_source)
                    or coalesce(v_cur_state, '') in ('accepted', 'done')) then
                v_results := v_results || jsonb_strip_nulls(jsonb_build_object(
                  'ok', true, 'page_id', v_pid,
                  'kept_existing', jsonb_build_object('source', v_cur_src, 'state', v_cur_state)));
                v_kept := v_kept + 1;
                continue;
            end if;

            -- SOFT delete: this platform's remove, and what every reader already filters
            -- on. The row stays auditable — who proposed what, and that somebody
            -- withdrew it — which a hard delete would destroy.
            update platform.associations a
               set deleted_at = now(),
                   metadata = coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object(
                     'withdrawn_at', now(), 'withdrawn_as', p_source, 'withdrawn_by', v_actor)
             where a.source_type = 'web_page' and a.source_id = v_pid
               and a.target_type = 'seo_map_topic' and a.role = 'intent'
               and a.deleted_at is null;

            v_results := v_results || jsonb_build_object('ok', true, 'page_id', v_pid, 'withdrawn', true);
            v_gone := v_gone + 1;
        exception when others then
            v_results := v_results || jsonb_strip_nulls(jsonb_build_object(
              'ok', false, 'page_id', v_pid, 'error', platform.refusal_message(sqlstate, sqlerrm)));
        end;
    end loop;

    return jsonb_build_object('ok', true, 'withdrawn', v_gone, 'kept', v_kept, 'results', v_results);
end;
$function$;

CREATE OR REPLACE FUNCTION seo.write_site_keyword_offering(p_organization_id uuid, p_site_id uuid, p_keyword_ids uuid[], p_offering_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_assigned_by text DEFAULT 'human'::text, p_confidence smallint DEFAULT NULL::smallint, p_placement jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(written bigint, removed bigint, human_protected bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_site_org uuid;
  v_notes text := NULLIF(btrim(p_notes), '');
  v_ids uuid[];
  v_written bigint := 0;
  v_removed bigint := 0;
  v_protected bigint := 0;
BEGIN
  SELECT s.organization_id INTO v_site_org FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF NOT FOUND THEN
    perform platform.refuse_not_found(format('gsc_site_not_found: %s', p_site_id));
  END IF;
  IF p_organization_id IS NULL OR v_site_org <> p_organization_id THEN
    RAISE EXCEPTION 'keyword_offering_scope_mismatch: that organization does not own this site';
  END IF;
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords';
  END IF;
  IF array_length(p_keyword_ids, 1) > 5000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: up to 5,000 keywords in one go.';
  END IF;
  IF p_assigned_by NOT IN ('human', 'agent') THEN
    RAISE EXCEPTION 'keyword_offering_assigner_invalid: a placement is made by a human or an agent, got %', p_assigned_by;
  END IF;
  IF p_offering_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM web.site_offering so
    JOIN web.brand_offering bo ON bo.id = so.brand_offering_id
    WHERE so.site_id = p_site_id AND bo.id = p_offering_id
      AND so.status = 'active' AND so.deleted_at IS NULL
      AND bo.status = 'active' AND bo.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'site_offering_unavailable: select the offering for this site first';
  END IF;

  -- P12: an agent never demotes, re-points or re-confirms a person's ruling.
  IF p_assigned_by = 'human' THEN
    v_ids := ARRAY(SELECT DISTINCT unnest(p_keyword_ids));
  ELSE
    v_ids := ARRAY(
      SELECT DISTINCT k FROM unnest(p_keyword_ids) k
      WHERE NOT EXISTS (
        SELECT 1 FROM seo.site_keyword_offering h
        WHERE h.site_id = p_site_id AND h.keyword_id = k AND h.is_primary
          AND h.deleted_at IS NULL AND h.assigned_by = 'human'));
    v_protected := (SELECT count(DISTINCT k) FROM unnest(p_keyword_ids) k) - COALESCE(array_length(v_ids, 1), 0);
  END IF;

  IF COALESCE(array_length(v_ids, 1), 0) > 0 THEN
    UPDATE seo.site_keyword_offering
    SET is_primary = false,
        -- WHO MOVED IT, and to what: the drift read's evidence.
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'demoted', jsonb_build_object('at', now(), 'by', p_assigned_by, 'replaced_by', p_offering_id)),
        updated_at = now(), updated_by = auth.uid()
    WHERE site_id = p_site_id AND keyword_id = ANY (v_ids) AND is_primary AND deleted_at IS NULL
      AND (p_offering_id IS NULL OR brand_offering_id <> p_offering_id);
    GET DIAGNOSTICS v_removed = ROW_COUNT;

    IF p_offering_id IS NOT NULL THEN
      INSERT INTO seo.site_keyword_offering AS sko (
        organization_id, site_id, keyword_id, brand_offering_id, is_primary,
        confidence, assigned_by, notes, metadata, created_by, updated_by
      )
      SELECT p_organization_id, p_site_id, kid, p_offering_id, true,
             p_confidence, p_assigned_by, v_notes,
             CASE WHEN p_placement IS NULL THEN '{}'::jsonb
                  ELSE jsonb_build_object('placement', p_placement) END,
             auth.uid(), auth.uid()
      FROM unnest(v_ids) kid
      ON CONFLICT (site_id, keyword_id, brand_offering_id) WHERE deleted_at IS NULL
      DO UPDATE SET
        is_primary = true,
        assigned_by = EXCLUDED.assigned_by,
        confidence = CASE WHEN EXCLUDED.assigned_by = 'agent' THEN EXCLUDED.confidence ELSE sko.confidence END,
        -- A new reason replaces the old one; placing again without a reason
        -- never erases the sentence someone already wrote.
        notes = COALESCE(EXCLUDED.notes, sko.notes),
        metadata = (sko.metadata - 'demoted') || EXCLUDED.metadata,
        updated_at = now(),
        updated_by = auth.uid();
      GET DIAGNOSTICS v_written = ROW_COUNT;
    END IF;
  END IF;

  RETURN QUERY SELECT v_written, v_removed, v_protected;
END
$function$;

CREATE OR REPLACE FUNCTION seo.write_site_offering_value(p_organization_id uuid, p_site_id uuid, p_brand_offering_id uuid, p_worth_points numeric DEFAULT NULL::numeric, p_lead_quality text DEFAULT NULL::text, p_offering_match text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_clear boolean DEFAULT false, p_audience_fit text DEFAULT NULL::text, p_capacity_appetite text DEFAULT NULL::text, p_brand_fit text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
DECLARE v_site_org uuid; v_id uuid;
BEGIN
  SELECT s.organization_id INTO v_site_org FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF NOT FOUND THEN
    perform platform.refuse_not_found(format('gsc_site_not_found: %s', p_site_id));
  END IF;
  IF p_organization_id IS NULL OR v_site_org <> p_organization_id THEN
    RAISE EXCEPTION 'offering_value_scope_mismatch: the organization does not own this site';
  END IF;
  IF p_clear THEN
    UPDATE seo.site_offering_value
    SET deleted_at = now(), updated_at = now(), updated_by = auth.uid(),
        metadata = metadata || COALESCE(p_metadata, '{}'::jsonb)
    WHERE site_id = p_site_id AND brand_offering_id = p_brand_offering_id AND deleted_at IS NULL
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  IF p_worth_points IS NULL THEN
    RAISE EXCEPTION 'offering_worth_points_required: say how many points this offering adds to its keywords';
  END IF;
  INSERT INTO seo.site_offering_value AS sov (
    organization_id, site_id, brand_offering_id, worth_points, lead_quality,
    offering_match, audience_fit, capacity_appetite, brand_fit, notes, metadata,
    created_by, updated_by
  ) VALUES (
    p_organization_id, p_site_id, p_brand_offering_id, p_worth_points, p_lead_quality,
    p_offering_match, p_audience_fit, p_capacity_appetite, p_brand_fit,
    NULLIF(btrim(COALESCE(p_notes, '')), ''), COALESCE(p_metadata, '{}'::jsonb),
    auth.uid(), auth.uid()
  )
  ON CONFLICT (site_id, brand_offering_id) WHERE deleted_at IS NULL
  DO UPDATE SET worth_points = EXCLUDED.worth_points, lead_quality = EXCLUDED.lead_quality,
    offering_match = EXCLUDED.offering_match, audience_fit = EXCLUDED.audience_fit,
    capacity_appetite = EXCLUDED.capacity_appetite, brand_fit = EXCLUDED.brand_fit,
    notes = EXCLUDED.notes, metadata = sov.metadata || EXCLUDED.metadata,
    updated_at = now(), updated_by = auth.uid()
  RETURNING sov.id INTO v_id;
  RETURN v_id;
END
$function$;

-- ── 9 SECURITY DEFINER bodies above had no platform.client_callable_door row. provision_shape_guard refuses to
-- let a replaced definer reach COMMIT without one, so each is declared here as what it already is — not a client door.

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'seo', '_tm_knob_int', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'internal: neither a client role nor service_role holds EXECUTE; it is reached only from inside seo._tm_perf_days, seo.map_outline, seo.patch_map_topics, seo.upsert_map_topics, which decide access before they call it. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s3_the_seo_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'seo._tm_knob_int(text, uuid, uuid, uuid, jsonb)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'seo' and x.function_name = '_tm_knob_int'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'seo', '_tm_map', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'internal: neither a client role nor service_role holds EXECUTE; it is reached only from inside seo.list_map_history, seo.list_page_intents, seo.list_topic_gaps, seo.map_diagnostics, seo.map_graph, seo.map_outline and 14 more, which decide access before they call it. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s3_the_seo_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'seo._tm_map(uuid, permission_level)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'seo' and x.function_name = '_tm_map'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'seo', '_tm_site', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none, and it is also called from inside seo._tm_visible_sites, seo.list_pages_without_topic, seo.set_page_intents, seo.set_pages_map_topics, seo.set_site_map, seo.withdraw_page_intents, which decide access before they call it. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s3_the_seo_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'seo._tm_site(uuid, permission_level, text)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'seo' and x.function_name = '_tm_site'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'seo', 'fn_autonomy_gate', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none, and it is also called from inside seo.fn_autonomy_apply_timed_out, seo.fn_backfill_keyword_places, seo.fn_evaluate_condition_matchers, seo.fn_evaluate_matchers, seo.situational_refresh_status, which decide access before they call it. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s3_the_seo_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'seo.fn_autonomy_gate(uuid, text)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'seo' and x.function_name = 'fn_autonomy_gate'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'seo', 'fn_ingest_keyword_research', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s3_the_seo_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'seo.fn_ingest_keyword_research(jsonb, text, uuid, uuid)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'seo' and x.function_name = 'fn_ingest_keyword_research'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'seo', 'fn_site_offering_for_topic', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none, and it is also called from inside seo.gsc_set_keyword_topic, seo.gsc_set_topic_value, which decide access before they call it. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s3_the_seo_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'seo.fn_site_offering_for_topic(uuid, uuid)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'seo' and x.function_name = 'fn_site_offering_for_topic'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'seo', 'propose_site_offering_from_template', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s3_the_seo_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'seo.propose_site_offering_from_template(uuid, uuid, uuid[], numeric, text, text, jsonb)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'seo' and x.function_name = 'propose_site_offering_from_template'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'seo', 'write_site_keyword_offering', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none, and it is also called from inside seo.gsc_set_keyword_offering, seo.gsc_set_keyword_topic, which decide access before they call it. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s3_the_seo_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'seo.write_site_keyword_offering(uuid, uuid, uuid[], uuid, text, text, smallint, jsonb)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'seo' and x.function_name = 'write_site_keyword_offering'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'seo', 'write_site_offering_value', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none, and it is also called from inside seo.gsc_set_topic_value, seo.set_site_offering_value, which decide access before they call it. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s3_the_seo_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'seo.write_site_offering_value(uuid, uuid, uuid, numeric, text, text, text, boolean, text, text, text, jsonb)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'seo' and x.function_name = 'write_site_offering_value'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));
