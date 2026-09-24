-- chair-step: this REPLACES the bodies of 97 live functions in schema public, changing ONE kind of statement and nothing else: every `raise exception … using errcode = 'P0002'` (109 of them) becomes `perform platform.refuse_not_found(<the same sentence>, <the same hint>, <the same detail>)`. Called directly (the server, every suite, every other function) the refusal is byte-for-byte what it was: SQLSTATE P0002, same message, hint and detail. Called through PostgREST it answers HTTP 404 with error code P0002 instead of HTTP 500. No table, column, policy, trigger or grant is touched; the only rows written are 18 platform.client_callable_door declarations for SECURITY DEFINER bodies that had none (provision_shape_guard refuses a replaced definer without one), each declared as the non-client function it already is. Needs errorshonest_s1_one_way_to_say_not_found.sql first. Inverse: migrations/inverse/errorshonest_s2_the_public_doors_say_not_found_down.sql restores every body verbatim.
-- lane: ERRORS-HONEST
-- based-on: public._edu_class(uuid) 5da3d70bfb1925c7f2d7cb5879b9a72b93c399da4172e498b2dc20d1892e3060
-- based-on: public.admin_delete_catalog_entry(text, text, text) 8bfa6a31bc63a95acf848f6c457f265e7ad2ec9e7bb691a17b927f27324488be
-- based-on: public.admin_delete_schema_template(uuid) 21d08c4fd5495c65f832b9c451e7df348730cbbf5d871b673f287bc3c6093a3c
-- based-on: public.admin_manage_organization_membership(text, uuid, uuid, text) e3bd482a197419975c21f5d282a4085a26875b75e945c031197ce257af221a21
-- based-on: public.admin_set_guest_block(uuid, boolean, text, timestamp with time zone) 4bc8bbd657d265482a6cf82a25218131176010343673f3e8f25752dc3a48abd9
-- based-on: public.admin_update_schema_template(uuid, text, text, jsonb, integer) f6aaf494b1cb77a150cd3a93ce4383a573fa1b26bec59ba9116b1b6594dd11cb
-- based-on: public.agent_resource_add(uuid, text, uuid, text, jsonb) 42038a8ae484edc74b12485de6b11afad499d13c6677937aada75abe2f6bd2f9
-- based-on: public.agx_usage_scan(uuid) 9694652cf0285e3c1d16b5d6bd384f4788b005eb3fbd9d2be00e8be9c74f885d
-- based-on: public.append_rows_to_user_table(uuid, jsonb) 1fb71472a3923fd56954b28653666d175da56084826362e56c9d3e0e7e3ebfdf
-- based-on: public.apply_template_by_key(text, uuid) fd8ce1ad0722a37704f7a37b5a4d7460e47a52ebfcc728198506eaad441294be
-- based-on: public.apply_template(uuid, uuid) 57b051150976acb64ab05cec0eafbd1a2540237072b13991bf0feadacf2c24c9
-- based-on: public.assoc_add(text, uuid, text, uuid, uuid, text, jsonb, text, integer, text, jsonb) 0a9b5675d5a27d4cde137f57eda9c5c6f5661d742c272cfdda935a54527cf53c
-- based-on: public.bump_version(uuid) a081516833eb38231ef4e362fa7136390a1c7afce649187565cc875ce02eb244
-- based-on: public.cat_delete(uuid) fd759dc24e62352061020722e3c571d2c70a1f44e5091e3eac90b239412049cf
-- based-on: public.cat_reparent(uuid, uuid) 6c0e716cebc6911a8fe9c254ffbe173f68f1a588747d91b536cc4910ae0fd82a
-- based-on: public.cat_update(uuid, text, text, text, text, integer) 915cf32a11c62f10adcbc7e7fbee3ae833776c10f5c73178a507490ad34f0781
-- based-on: public.conversation_file_add(uuid, uuid, text, jsonb, boolean) 8604c4afc0b718fdf5b95d4ff6cd41beabf5dd6067fc6d17c7a204b3009b11dc
-- based-on: public.create_context_item(uuid, text, text, context_value_type, text, text, context_fetch_hint, context_sensitivity, text[], text, smallint, text[], integer, uuid[], jsonb) 158740c9864f2642068538652851ca62b98205cf4628af0129505899712f1029
-- based-on: public.creator_set_public(boolean) cf219b84b26e93f59f06e60996882597427ebec05331d330416d7fbb6b94c915
-- based-on: public.creator_update_profile(text, text, text, text, jsonb, jsonb) 9230a9d08000a3875e54651146a42a75bd3784c74eccdf17625049185f2f176f
-- based-on: public.crm_dismiss_merge_candidate(uuid) edda0e188d960fc0f452eb9f64c990155b1eb5c2b6943405c87c178b2f79171a
-- based-on: public.crm_merge_parties(uuid, uuid, text, text) 61c188db906a987be47d8cdb1b677a5ac074daa7d7f2c0c47e172a4a23f604a5
-- based-on: public.crm_party_purge(uuid) ce1a3a2edaf1eea648316ee0a7dff230fc1bbc0e8e3f49b35963ad5d8d2e0323
-- based-on: public.crm_resume_sending_identity(uuid, text) e4d84261f0aaacfeba324f3f866d10a84a654a06592fb0ff60835e2dfd4db603
-- based-on: public.crm_set_primary_contact_point(uuid) fe59d07b2636e237c45390f30806df81e15047408774ed3d274f8a20c6df1536
-- based-on: public.crm_unmerge_parties(uuid) e34e937f44b152d9e1224135d54993a4d0bcac5caf28fb94c1186afa19caa844
-- based-on: public.cx_canvas_toggle_favorite(uuid) 953e61684160bca89491af2984934ca3e660b1218196225ce49efde6c8fc1beb
-- based-on: public.cx_canvas_update_version(uuid, uuid, uuid, smallint, text, text, jsonb) bed2e722872a2c8d8023c3999b5c09372b552f1d10e3567fb9a985ea48c20c8f
-- based-on: public.cx_message_edit(uuid, jsonb) 066bdb060af01a52fd13844e03a62af69f922181363e0f62a45717b82f7ba168
-- based-on: public.cx_message_set_content(uuid, jsonb) 5ff15facf12f1bc26c8432f65b48048a5a9fd669a3de91078608b7e07706a32e
-- based-on: public.delete_context_item(uuid) 02ceeb924409817043c232195a6a6996ffd37278128cc063eba6e8fa3cc71538
-- based-on: public.delete_scope_type(uuid) b314d3451aafb786a5e2d472076d2d177b5e0218adf3ac585e0aba912bd039b7
-- based-on: public.delete_scope(uuid) c9d4db5d7682454cbca92a592f2f6eae74c31c1d485b256b415af06dd96acd80
-- based-on: public.dict_owner_org(text, uuid) bdcb81650bba8ca1d9b027cdb252e3fec6c1b2da954bb9c163fe4f5a28d8f8c0
-- based-on: public.edu_class_join_by_code(text) d5bb135fd218e7118c12e4353ccfdac8d98cd6ac8274db524a6ef6594a727028
-- based-on: public.edu_class_state(uuid) 0821c89e82872112a2f53e252bd1353a3797215aac102fd26ba69baaad33f56d
-- based-on: public.edu_guardian_set_age_band(uuid, text) b2037414313c7ef938aa368dc2f81fd43bdc07427d9b66c74c000eaab12a9837
-- based-on: public.edu_restore_study_data() 0c1edcef8c1a32c300a8984b985f74840057ddafc03b0e99c9103138aab7d8d1
-- based-on: public.edu_verify_content(text, uuid, boolean, text) 8dece9a815e4138f5ad7e2d799543c6335c417e142ad280ce1ea6c60bba6332b
-- based-on: public.esign_campaign_enroll(uuid, jsonb) bfbac5f8960bc755dc743091f1c88b584e731f5d3958bb9212cc871f5d526337
-- based-on: public.esign_campaign_export(uuid) b17b30c44ac5f4c37d9676e38d1cdb4f9b964c8d578e3d358c3f9b2a046ea5d9
-- based-on: public.esign_campaign_generate(uuid, jsonb, integer) aa8fcde67b70619c3ba85b6af44bf85422b1736b6ddffe56bf3fab1b05c9d118
-- based-on: public.esign_campaign_progress(uuid) db14288a52ef63b26a0737e715f68b56ddca679074ec62729e9508bc60c018af
-- based-on: public.esign_envelope_state(uuid) 50c1cd5e4f2c9c60c014fdfaa19c11579e83448f44b15d57d5da44e76cd4f5b8
-- based-on: public.esign_mint_signer_token(uuid, text) 271aa43dff929b9dd0d42dc15a94c95101392bb52d404b3a81e59b29c3962aca
-- based-on: public.esign_provider_dispatch(uuid) c506344bac19dce4ced85c50677d3117060e3154f2f3e11248803e7560d57730
-- based-on: public.esign_provider_ingest(uuid, text, text, text, text, jsonb, jsonb) 02a1ce3906437963e76a7bf3300def239ba4299fc73cc78c19cfb47165764fe6
-- based-on: public.esign_remind(uuid) 954e28f1f2588a53ebec93b7048684b32da9cf616f95dc7304ca7e754000d3c1
-- based-on: public.esign_resend_signer(uuid, text) 4d59890d7dcd1578a0a1eef240db5b7e80e86d4590f076c1f5872fe13c22489e
-- based-on: public.esign_send_envelope(uuid, jsonb) b1d6ef0e6a222480b1101c53aef8979eb41d4ec507d53ea0c0239417d07bb221
-- based-on: public.esign_verify_envelope(uuid, jsonb) cb5ed355a732ab9b2c2e71f4492b349a0c11bfba0685faf8908a089120de0fa8
-- based-on: public.esign_void_envelope(uuid, text) 4050aec4011b47de708bc8145a66f45b7b6b82521690954e002c220cc7750746
-- based-on: public.guardian_confirm_verification(uuid, text, text) 38d1e6a8b6ea2b6a2404ee0644fbbe8747bb766a067282c815bb099ff3f5ffb4
-- based-on: public.guardian_respond(uuid, boolean) 764abd6f412f05e36a08338f6d8a28430a43dc9f2e2715814d1d0785c7169750
-- based-on: public.hr_authority_delegate(uuid) e704da318c03a2fe3368427877bb9e3b5d7db942a23958d62889001fc6a0f2e6
-- based-on: public.hr_authority_delegation_end(uuid, text) b8f689c13dc42d2e39f7e762389093f6dd7173edd25d68c00bce04a27282c752
-- based-on: public.hr_authority_delegation_request(uuid, uuid, date, date, text) b68d4afb4df3011857ff6a3c9b24a45b781221487659d4a968500354cc310806
-- based-on: public.hr_authority_grant(text, text, text, text, uuid, uuid[], jsonb, integer, date, date, text, uuid) 5fa436a2fbab594ac291b74cf3dcd53bbbc813ed2dbc68ec1bcc43a48eb3ae28
-- based-on: public.hr_authority_revoke(uuid, text) 1c1660d1a21af41068804b7c38a2bea059de5c386445a5fc97a25a6f016a698b
-- based-on: public.hr_break_glass(text, uuid, text, text) c52e6eb82ec44fdeb0c4cd1db794e180aeae15d9873893667815c5d4370be34b
-- based-on: public.hr_employee_invite(uuid, text, timestamp with time zone) 301ef297f553dd61ffa22f4607472442196601b7feddc230da94550986d34509
-- based-on: public.hr_incident_status(uuid) d3c8fa12e7980d629bab235cc0e53e29809993d1842e92b405e402efc92be783
-- based-on: public.hr_mint_investigation_token(uuid, text, text, text) b86d8d9c59f44a5425b41f1acc0bc99c976a3b1a2a452f8942695675ad590b62
-- based-on: public.hr_mint_records_request_token(uuid, text, text[], text) 20711874123aa712709b96ac4b5f8b059908ab900d4f2073e341ae1e4b1f0926
-- based-on: public.hr_role_assign(uuid, text, text, uuid, uuid[], date, date, text) 5ebc342bcade5719475ce54b36dbd89a130886b077c8f8b949c2c22434a59223
-- based-on: public.hr_role_revoke(uuid, text) 6215e21d8aab5aa00960334758de29681fc66b196a1da7550e276f49407af293
-- based-on: public.hr_set_employment_pin(uuid, text) 59f894237752ff8725db4a82ef8b3ae01900482e9e69e2379d5d874635236e79
-- based-on: public.hr_ssn_store(uuid, bytea, text, bytea, text) 167f04f950a41d9f8b5d22030638ae45730f5d9b292c2e14195d75e23e946741
-- based-on: public.inv_create(text, uuid, text, text, uuid, uuid, timestamp with time zone) 299ef353381fd58185a429a74dbb7108bbce437ac6a7c24b01aa29d0f0a3e4c5
-- based-on: public.inv_list(text, uuid) 9acdcc761f81b77a2fc52122561ba8ddb3b9f2f91dee706b5af7cfb518b32123
-- based-on: public.list_scope_type_items(uuid) ec049afd6372ce21f6310ca9b825d72d45bae938d1dfb769f1be213ccfb20522
-- based-on: public.mbr_add(text, uuid, uuid, uuid, text, text, jsonb) 67a39c0b070f41e4eb69dc8ffdbab77b3ae63e882d649127ea346013359f25f8
-- based-on: public.mbr_remove(text, uuid, uuid) 6846f74b1b1507e257b5b37fab691252627b302e05bbc85c739fd43bec2bf1ab
-- based-on: public.mbr_update_role(text, uuid, uuid, text) d6c8ca24b300b9ce7f0b40a95dfc741184bb7c6173e2a206661e326025cc34cb
-- based-on: public.move_file(uuid, uuid) 77b10f0b48cb9be474f57dacdcfa0855aba2b60e265c2bb4b4af0f69d9ee96d4
-- based-on: public.move_site_to_organization(uuid, uuid, integer, text) e335a17e6f4a02abb0a49bbe2fa48fe9090a5379f0e65eae26a39f964718e2d4
-- based-on: public.page_extraction_clear_job_results(uuid) 8a43ff4a82c943e4b666849c2308c0edc74237835a1b47887c770dfb1dbdb051
-- based-on: public.preview_site_organization_move(uuid) 7fc03328acc43dd36ef7cf3312aab9570530bc034fed3099d80c74398034cb73
-- based-on: public.rename_file(uuid, text) 003b138482629ec57f9310199fdee1fc4fd7cafe44c5805221bec2d1ee381b58
-- based-on: public.rename_folder(uuid, text, uuid) ca3f7a0fd4bb31226f1c4e7b96fe74a2a4bc73aa82a77ad711dcb1a0bd52ba7b
-- based-on: public.research_topic_resource_manifest(uuid) 4f421bad1e91682c0613bd3f275da132d3e0f75f607e171edb4db954c26e4c41
-- based-on: public.restore_scope_type(uuid) 09174de509800c8352af6fb59e29b86a697c38218541f38a3aca01da4a674440
-- based-on: public.rs_topic_append_output(uuid, text, jsonb) 8675024ad7192863f64c002413643c4af317cbc4907df9fa69a82067fe27e895
-- based-on: public.sch_enqueue_manual_run(uuid) 8527eea2ba30fa6bf5dd0a5d3963c1fe309d9c660d30cec0267f119e1693087d
-- based-on: public.scope_system_apply(uuid, jsonb) 53456d27ea67898512569a2ef434bfccb9cd29aae4f8dc4fa2686b572ff547ad
-- based-on: public.study_override_attempt(uuid, text, numeric, jsonb, numeric, numeric, timestamp with time zone, numeric, integer, integer, integer, integer, boolean) 7f38225cbafb455521728bee40fbbbb68042871d344054cdf4f9be3965af7e10
-- based-on: public.transfer_organization_ownership(uuid, uuid, uuid) 80a58861285af43fc791ed1cd03102b76ca5df0941a24e96a21d2931c33ab368
-- based-on: public.udt_column_facets(uuid, text, integer, text) 7cacf8756f7315e9dc553237c0a2258fb987ec9bcc3f0fb492ec0cfd2f3d6089
-- based-on: public.udt_set_table_row_actions(uuid, jsonb) d6826c6129271cc382e91a791252f9069fbf6121ab52452f292947a868faddc8
-- based-on: public.udt_set_table_row_label(uuid, jsonb) 01b6dd7a09c05f1c0c5d99fbe8d71e5f7711e892fb35d88b3d66505a05a487b6
-- based-on: public.udt_set_table_style(uuid, text[], jsonb) abd79939d945fea669b8f26f706a45203f2037fb9868ec52c7031f1f5782069d
-- based-on: public.udt_table_profile(uuid, integer) b3e57316783ebe3c74f76d2f7e547627749d1a770806084f8f6a41a6b98c5aa9
-- based-on: public.udt_validate_row(uuid, jsonb, jsonb) 51e05fba010e1ca90c64058d12aa9476e3ca192b76b7c4077a0aaaa1e08c0b6f
-- based-on: public.update_context_item(uuid, text, text, text, context_value_type, context_fetch_hint, context_sensitivity, text[], smallint, context_item_status, text) 6b3157265e70944f730f232067d4e8146810ab975e4c0b55c8f4adda06c284fc
-- based-on: public.update_scope_type(uuid, text, text, text, text, smallint, smallint, text, text) 0adb7044930ec2be453237b7979ccbe93c13fe8186f461fc27189e28e0041c78
-- based-on: public.update_user_own_feedback(uuid, text, text) a04e92359e6ce61ec58fd496e47f9168ac9deeca6485a02a45020e342b3c90a1
-- based-on: public.vault_recovery_preview(uuid) c69e565e2c8d6f0678e1aca6457b8180b95d7171001f79ede2e2c07b1b909144
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
--   public._edu_class(uuid) [not client-granted; reached through a door]: 1 not-found raise
--   public.admin_delete_catalog_entry(text, text, text): 1 not-found raise
--   public.admin_delete_schema_template(uuid): 1 not-found raise
--   public.admin_manage_organization_membership(text, uuid, uuid, text): 4 not-found raises
--   public.admin_set_guest_block(uuid, boolean, text, timestamp with time zone): 1 not-found raise
--   public.admin_update_schema_template(uuid, text, text, jsonb, integer): 1 not-found raise
--   public.agent_resource_add(uuid, text, uuid, text, jsonb): 1 not-found raise
--   public.agx_usage_scan(uuid): 1 not-found raise
--   public.append_rows_to_user_table(uuid, jsonb): 1 not-found raise
--   public.apply_template_by_key(text, uuid): 1 not-found raise
--   public.apply_template(uuid, uuid): 1 not-found raise
--   public.assoc_add(text, uuid, text, uuid, uuid, text, jsonb, text, integer, text, jsonb): 1 not-found raise
--   public.bump_version(uuid): 1 not-found raise
--   public.cat_delete(uuid): 1 not-found raise
--   public.cat_reparent(uuid, uuid): 1 not-found raise
--   public.cat_update(uuid, text, text, text, text, integer): 1 not-found raise
--   public.conversation_file_add(uuid, uuid, text, jsonb, boolean): 2 not-found raises
--   public.create_context_item(uuid, text, text, context_value_type, text, text, context_fetch_hint, context_sensitivity, text[], text, smallint, text[], integer, uuid[], jsonb): 1 not-found raise
--   public.creator_set_public(boolean): 1 not-found raise
--   public.creator_update_profile(text, text, text, text, jsonb, jsonb): 1 not-found raise
--   public.crm_dismiss_merge_candidate(uuid): 1 not-found raise
--   public.crm_merge_parties(uuid, uuid, text, text): 2 not-found raises
--   public.crm_party_purge(uuid): 1 not-found raise
--   public.crm_resume_sending_identity(uuid, text): 1 not-found raise
--   public.crm_set_primary_contact_point(uuid): 1 not-found raise
--   public.crm_unmerge_parties(uuid): 1 not-found raise
--   public.cx_canvas_toggle_favorite(uuid): 1 not-found raise
--   public.cx_canvas_update_version(uuid, uuid, uuid, smallint, text, text, jsonb): 1 not-found raise
--   public.cx_message_edit(uuid, jsonb): 1 not-found raise
--   public.cx_message_set_content(uuid, jsonb): 1 not-found raise
--   public.delete_context_item(uuid): 1 not-found raise
--   public.delete_scope_type(uuid): 1 not-found raise
--   public.delete_scope(uuid): 1 not-found raise
--   public.dict_owner_org(text, uuid): 1 not-found raise
--   public.edu_class_join_by_code(text): 2 not-found raises
--   public.edu_class_state(uuid): 1 not-found raise
--   public.edu_guardian_set_age_band(uuid, text): 1 not-found raise
--   public.edu_restore_study_data(): 1 not-found raise
--   public.edu_verify_content(text, uuid, boolean, text): 1 not-found raise
--   public.esign_campaign_enroll(uuid, jsonb) [not client-granted; reached through a door]: 1 not-found raise
--   public.esign_campaign_export(uuid) [not client-granted; reached through a door]: 1 not-found raise
--   public.esign_campaign_generate(uuid, jsonb, integer) [not client-granted; reached through a door]: 1 not-found raise
--   public.esign_campaign_progress(uuid) [not client-granted; reached through a door]: 1 not-found raise
--   public.esign_envelope_state(uuid) [not client-granted; reached through a door]: 1 not-found raise
--   public.esign_mint_signer_token(uuid, text) [not client-granted; reached through a door]: 1 not-found raise
--   public.esign_provider_dispatch(uuid) [not client-granted; reached through a door]: 1 not-found raise
--   public.esign_provider_ingest(uuid, text, text, text, text, jsonb, jsonb) [not client-granted; reached through a door]: 1 not-found raise
--   public.esign_remind(uuid) [not client-granted; reached through a door]: 1 not-found raise
--   public.esign_resend_signer(uuid, text) [not client-granted; reached through a door]: 1 not-found raise
--   public.esign_send_envelope(uuid, jsonb) [not client-granted; reached through a door]: 1 not-found raise
--   public.esign_verify_envelope(uuid, jsonb) [not client-granted; reached through a door]: 1 not-found raise
--   public.esign_void_envelope(uuid, text) [not client-granted; reached through a door]: 1 not-found raise
--   public.guardian_confirm_verification(uuid, text, text) [not client-granted; reached through a door]: 1 not-found raise
--   public.guardian_respond(uuid, boolean): 1 not-found raise
--   public.hr_authority_delegate(uuid): 1 not-found raise
--   public.hr_authority_delegation_end(uuid, text): 1 not-found raise
--   public.hr_authority_delegation_request(uuid, uuid, date, date, text): 1 not-found raise
--   public.hr_authority_grant(text, text, text, text, uuid, uuid[], jsonb, integer, date, date, text, uuid): 1 not-found raise
--   public.hr_authority_revoke(uuid, text): 1 not-found raise
--   public.hr_break_glass(text, uuid, text, text): 1 not-found raise
--   public.hr_employee_invite(uuid, text, timestamp with time zone): the `when others` answer reads the caught refusal's own sentence and code, whichever shape it was raised in
--   public.hr_incident_status(uuid): 1 not-found raise
--   public.hr_mint_investigation_token(uuid, text, text, text): 1 not-found raise
--   public.hr_mint_records_request_token(uuid, text, text[], text): 1 not-found raise
--   public.hr_role_assign(uuid, text, text, uuid, uuid[], date, date, text): 1 not-found raise
--   public.hr_role_revoke(uuid, text): 1 not-found raise
--   public.hr_set_employment_pin(uuid, text): 1 not-found raise
--   public.hr_ssn_store(uuid, bytea, text, bytea, text): 1 not-found raise
--   public.inv_create(text, uuid, text, text, uuid, uuid, timestamp with time zone): 1 not-found raise
--   public.inv_list(text, uuid): 1 not-found raise
--   public.list_scope_type_items(uuid): 1 not-found raise
--   public.mbr_add(text, uuid, uuid, uuid, text, text, jsonb): 1 not-found raise
--   public.mbr_remove(text, uuid, uuid): 2 not-found raises
--   public.mbr_update_role(text, uuid, uuid, text): 2 not-found raises
--   public.move_file(uuid, uuid) [not client-granted; reached through a door]: 2 not-found raises
--   public.move_site_to_organization(uuid, uuid, integer, text): 3 not-found raises
--   public.page_extraction_clear_job_results(uuid): 1 not-found raise
--   public.preview_site_organization_move(uuid): 1 not-found raise
--   public.rename_file(uuid, text) [not client-granted; reached through a door]: 1 not-found raise
--   public.rename_folder(uuid, text, uuid): 1 not-found raise
--   public.research_topic_resource_manifest(uuid): 1 not-found raise
--   public.restore_scope_type(uuid): 1 not-found raise
--   public.rs_topic_append_output(uuid, text, jsonb): 2 not-found raises
--   public.sch_enqueue_manual_run(uuid): 1 not-found raise
--   public.scope_system_apply(uuid, jsonb): 1 not-found raise
--   public.study_override_attempt(uuid, text, numeric, jsonb, numeric, numeric, timestamp with time zone, numeric, integer, integer, integer, integer, boolean): 1 not-found raise
--   public.transfer_organization_ownership(uuid, uuid, uuid): 2 not-found raises
--   public.udt_column_facets(uuid, text, integer, text): 1 not-found raise
--   public.udt_set_table_row_actions(uuid, jsonb): 1 not-found raise
--   public.udt_set_table_row_label(uuid, jsonb): 1 not-found raise
--   public.udt_set_table_style(uuid, text[], jsonb): 1 not-found raise
--   public.udt_table_profile(uuid, integer): 1 not-found raise
--   public.udt_validate_row(uuid, jsonb, jsonb): 1 not-found raise
--   public.update_context_item(uuid, text, text, text, context_value_type, context_fetch_hint, context_sensitivity, text[], smallint, context_item_status, text): 1 not-found raise
--   public.update_scope_type(uuid, text, text, text, text, smallint, smallint, text, text): 1 not-found raise
--   public.update_user_own_feedback(uuid, text, text) [not client-granted; reached through a door]: 1 not-found raise
--   public.vault_recovery_preview(uuid): 1 not-found raise

CREATE OR REPLACE FUNCTION public._edu_class(p_class uuid)
 RETURNS context.scopes
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope context.scopes;
begin
  select s.* into v_scope
  from context.scopes s
  join context.scope_types st on st.id = s.scope_type_id
  where s.id = p_class and st.slug = 'class';
  if v_scope.id is null then
    perform platform.refuse_not_found(format('class %s not found', p_class));
  end if;
  return v_scope;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_catalog_entry(p_app text, p_kind text, p_key text)
 RETURNS catalog_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing public.catalog_entries;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('catalog:' || p_app || ':' || p_kind || ':' || p_key));

  SELECT * INTO existing FROM public.catalog_entries
   WHERE app = p_app AND kind = p_kind AND key = p_key;
  IF NOT FOUND THEN
    perform platform.refuse_not_found(format('No catalog entry %s/%s/%s', p_app, p_kind, p_key));
  END IF;

  INSERT INTO public.catalog_entries_history
    (entry_id, app, kind, key, schema_version, payload, artifact_url,
     artifact_sha256, artifact_size_bytes, min_app_version, is_active,
     sort_order, notes, op, changed_by)
  VALUES
    (existing.id, existing.app, existing.kind, existing.key,
     existing.schema_version, existing.payload, existing.artifact_url,
     existing.artifact_sha256, existing.artifact_size_bytes,
     existing.min_app_version, existing.is_active, existing.sort_order,
     existing.notes, 'delete', (select auth.uid()));

  DELETE FROM public.catalog_entries
   WHERE app = p_app AND kind = p_kind AND key = p_key;

  RETURN existing;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_schema_template(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_found integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '%', public._schema_template_write_denied_message()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM workbench.schema_templates WHERE id = p_id;

  GET DIAGNOSTICS v_found = ROW_COUNT;
  IF v_found = 0 THEN
    perform platform.refuse_not_found(format('No schema template with id %s.', p_id));
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_manage_organization_membership(p_action text, p_org_id uuid, p_user_id uuid, p_role text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_membership iam.memberships%rowtype;
  v_org iam.organizations%rowtype;
  v_previous_role text;
  v_owner_count integer;
  v_other_owner_count integer;
begin
  if v_actor is null or not public.is_super_admin() then
    raise exception 'Forbidden: Super Admin required' using errcode = '42501';
  end if;

  if p_action not in ('add', 'set_role', 'remove') then
    raise exception 'Unsupported organization membership action: %', p_action
      using errcode = '22023';
  end if;

  select * into v_org
  from iam.organizations
  where id = p_org_id;

  if not found then
    perform platform.refuse_not_found('Organization not found');
  end if;

  -- DD-162: THE ONE DOOR. A super admin passes it through the administrator arm, and the census can
  -- now tell this function from one that asks nobody — which is the whole point, because the line
  -- above can be deleted by a future edit and this one cannot be deleted quietly.
  perform iam.assert_may_transfer('membership', v_org.created_by, p_user_id, p_org_id,
                                  'organization', p_org_id);

  -- DD-045 P3 owns these four branches; DD-048 leaves them exactly as they are.
  -- A personal organization belongs to its creator. Super-admin repair may
  -- restore that creator as owner or remove legacy extra members, but it may
  -- never turn the personal org into a shared org or remove its person.
  if coalesce(v_org.is_personal, false) then
    if p_action = 'add'
       and (p_user_id is distinct from v_org.created_by or p_role <> 'owner') then
      raise exception 'A personal organization may only add its creator as owner'
        using errcode = '23514';
    end if;
    if p_action = 'set_role'
       and (p_user_id is distinct from v_org.created_by or p_role <> 'owner') then
      raise exception 'A personal organization creator may only be restored to owner'
        using errcode = '23514';
    end if;
    if p_action = 'remove' and p_user_id is not distinct from v_org.created_by then
      raise exception 'Cannot remove the person from their personal organization'
        using errcode = '23514';
    end if;
  end if;

  if p_action in ('add', 'set_role') and p_role not in ('owner', 'admin', 'member') then
    raise exception 'Role must be owner, admin, or member' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    perform platform.refuse_not_found('User not found');
  end if;

  -- Serialize owner-count checks with other organization membership changes.
  perform 1
  from iam.memberships
  where container_type = 'organization'
    and container_id = p_org_id
    and deleted_at is null
  for update;

  -- R21, one owner: even a super admin may not mint a second one. The route is
  -- transfer_organization_ownership, which demotes the outgoing owner.
  if p_action in ('add', 'set_role') and p_role = 'owner' then
    select count(*)::integer
    into v_other_owner_count
    from iam.memberships
    where container_type = 'organization'
      and container_id = p_org_id
      and role = 'owner'
      and status = 'active'
      and deleted_at is null
      and user_id is distinct from p_user_id;

    if v_other_owner_count > 0 then
      raise exception
        'An organization can have exactly one owner. Use Transfer ownership to hand it to someone else.'
        using errcode = '23514';
    end if;
  end if;

  select * into v_membership
  from iam.memberships
  where container_type = 'organization'
    and container_id = p_org_id
    and user_id = p_user_id
    and deleted_at is null;

  v_previous_role := v_membership.role;

  if p_action = 'add' then
    insert into iam.memberships (
      container_type, container_id, organization_id, user_id, role, status, metadata,
      created_by, updated_by
    )
    values (
      'organization', p_org_id, p_org_id, p_user_id, p_role, 'active', '{}'::jsonb, v_actor, v_actor
    )
    on conflict (container_type, container_id, user_id)
    do update set
      organization_id = excluded.organization_id,
      role = excluded.role,
      status = 'active',
      deleted_at = null,
      updated_by = v_actor,
      updated_at = now()
    returning * into v_membership;

  elsif p_action = 'set_role' then
    if v_membership.id is null then
      perform platform.refuse_not_found('Organization membership not found');
    end if;

    if v_membership.role = 'owner' and p_role <> 'owner' then
      select count(*) into v_owner_count
      from iam.memberships
      where container_type = 'organization'
        and container_id = p_org_id
        and role = 'owner'
        and deleted_at is null;

      if v_owner_count <= 1 then
        raise exception 'Cannot demote the last organization owner'
          using errcode = '23514';
      end if;
    end if;

    update iam.memberships
    set role = p_role,
        updated_by = v_actor,
        updated_at = now()
    where id = v_membership.id
    returning * into v_membership;

  else
    if v_membership.id is null then
      perform platform.refuse_not_found('Organization membership not found');
    end if;

    if v_membership.role = 'owner' then
      select count(*) into v_owner_count
      from iam.memberships
      where container_type = 'organization'
        and container_id = p_org_id
        and role = 'owner'
        and deleted_at is null;

      if v_owner_count <= 1 then
        raise exception 'Cannot remove the last organization owner'
          using errcode = '23514';
      end if;
    end if;

    -- DD-044: a super admin removing the last membership would leave the person
    -- with no organization at all.
    if iam.is_last_organization(p_user_id, p_org_id) then
      raise exception
        'This person can''t be removed from their only organization. They need to join or create another one first.'
        using errcode = '23514';
    end if;

    update iam.memberships
    set deleted_at = now(),
        updated_by = v_actor,
        updated_at = now()
    where id = v_membership.id
    returning * into v_membership;
  end if;

  insert into iam.org_admin_audit (organization_id, actor_user_id, target_user_id, action, detail)
  values (
    p_org_id, v_actor, p_user_id, 'super_admin_membership_' || p_action,
    jsonb_build_object('previous_role', v_previous_role, 'role', v_membership.role,
                       'membership_id', v_membership.id)
  );

  return jsonb_build_object(
    'action', p_action, 'membership_id', v_membership.id, 'organization_id', p_org_id,
    'user_id', p_user_id, 'role', v_membership.role);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_guest_block(p_guest_id uuid, p_blocked boolean, p_reason text DEFAULT NULL::text, p_blocked_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_guest users.guest_executions%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_metadata jsonb;
  v_history jsonb;
  v_len integer;
begin
  if v_actor is null or not public.is_super_admin() then
    raise exception 'Forbidden: Super Admin required' using errcode = '42501';
  end if;

  if p_guest_id is null or p_blocked is null then
    raise exception 'A guest id and a blocked flag are required' using errcode = '22023';
  end if;

  if p_blocked and p_blocked_until is not null and p_blocked_until <= now() then
    raise exception 'A block must end in the future (got %)', p_blocked_until
      using errcode = '22023';
  end if;

  if not p_blocked and p_blocked_until is not null then
    raise exception 'Unblocking takes no end time' using errcode = '22023';
  end if;

  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'The reason is limited to 500 characters' using errcode = '22001';
  end if;

  select * into v_guest
  from users.guest_executions
  where id = p_guest_id
  for update;

  if not found then
    perform platform.refuse_not_found('Guest not found');
  end if;

  v_metadata := case
    when jsonb_typeof(v_guest.metadata) = 'object' then v_guest.metadata
    else '{}'::jsonb
  end;
  v_history := case
    when jsonb_typeof(v_metadata -> 'admin_block_history') = 'array'
      then v_metadata -> 'admin_block_history'
    else '[]'::jsonb
  end;
  v_history := v_history || jsonb_build_array(jsonb_build_object(
    'action', case when p_blocked then 'block' else 'unblock' end,
    'actor_user_id', v_actor,
    'at', now(),
    'reason', v_reason,
    'blocked_until', case when p_blocked then p_blocked_until end,
    'previous', jsonb_build_object(
      'is_blocked', coalesce(v_guest.is_blocked, false),
      'blocked_until', v_guest.blocked_until,
      'blocked_reason', v_guest.blocked_reason
    )
  ));
  v_len := jsonb_array_length(v_history);
  if v_len > 50 then
    select jsonb_agg(e order by ord)
    into v_history
    from jsonb_array_elements(v_history) with ordinality as t(e, ord)
    where ord > v_len - 50;
  end if;

  update users.guest_executions
  set is_blocked = p_blocked,
      blocked_until = case when p_blocked then p_blocked_until end,
      blocked_reason = case when p_blocked then v_reason end,
      metadata = jsonb_set(v_metadata, '{admin_block_history}', v_history, true)
  where id = p_guest_id
  returning * into v_guest;

  return jsonb_build_object(
    'guest_id', v_guest.id,
    'is_blocked', coalesce(v_guest.is_blocked, false),
    'block_active', coalesce(v_guest.is_blocked, false)
      and (v_guest.blocked_until is null or v_guest.blocked_until > now()),
    'blocked_until', v_guest.blocked_until,
    'blocked_reason', v_guest.blocked_reason,
    'updated_at', v_guest.updated_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_schema_template(p_id uuid, p_template_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_fields jsonb DEFAULT NULL::jsonb, p_version integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_found integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '%', public._schema_template_write_denied_message()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_template_name IS NULL AND p_description IS NULL
     AND p_fields IS NULL AND p_version IS NULL THEN
    RAISE EXCEPTION 'Nothing to update — send at least one of name, description, fields or version.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_template_name IS NOT NULL AND btrim(p_template_name) = '' THEN
    RAISE EXCEPTION 'A schema template needs a name.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_fields IS NOT NULL
     AND (jsonb_typeof(p_fields) <> 'array' OR jsonb_array_length(p_fields) = 0) THEN
    RAISE EXCEPTION 'A schema template needs at least one field, as a JSON array.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE workbench.schema_templates t
     SET template_name = coalesce(btrim(p_template_name), t.template_name),
         description   = coalesce(p_description, t.description),
         fields        = coalesce(p_fields, t.fields),
         version       = coalesce(
                           p_version,
                           CASE WHEN p_fields IS NOT NULL
                                THEN coalesce(t.version, 0) + 1
                                ELSE t.version END)
   WHERE t.id = p_id;

  GET DIAGNOSTICS v_found = ROW_COUNT;
  IF v_found = 0 THEN
    perform platform.refuse_not_found(format('No schema template with id %s.', p_id));
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.agent_resource_add(p_agent_id uuid, p_source_type text, p_source_id uuid, p_label text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_org uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'agent_resource_add: authenticated user required'
      using errcode = '42501';
  end if;

  if not iam.has_access('agent', p_agent_id, 'editor'::public.permission_level) then
    raise exception 'agent_resource_add: editor access to agent required'
      using errcode = '42501';
  end if;

  if not iam.has_access(p_source_type, p_source_id, 'editor'::public.permission_level) then
    raise exception 'agent_resource_add: editor access to source resource required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from platform.association_types at
    where at.source_type = p_source_type
      and at.target_type = 'agent'
      and at.container_side = 'target'
      and at.is_active
  ) then
    raise exception 'agent_resource_add: unsupported resource type %', p_source_type
      using errcode = '23514';
  end if;

  select d.organization_id
    into v_org
    from agent.definition d
   where d.id = p_agent_id;

  if v_org is null then
    raise exception 'agent_resource_add: agent has no organization'
      using errcode = '23514';
  end if;

  insert into platform.associations (
    source_type,
    source_id,
    target_type,
    target_id,
    organization_id,
    role,
    label,
    metadata,
    created_by
  ) values (
    p_source_type,
    p_source_id,
    'agent',
    p_agent_id,
    v_org,
    'agent_resource',
    p_label,
    coalesce(p_metadata, '{}'::jsonb),
    (select auth.uid())
  )
  on conflict (source_type, source_id, target_type, target_id, role)
  do update set
    label = coalesce(excluded.label, platform.associations.label),
    metadata = excluded.metadata
  returning id into v_id;

  -- TAILS-5: putting a resource back on an agent after it was taken off revives the
  -- tombstoned edge in place and inserts nothing, so this statement hands back no row. The
  -- edge exists; read it. See platform.revive_tombstoned_association().
  if v_id is null then
    select a.id into v_id
      from platform.associations a
     where a.source_type = p_source_type and a.source_id = p_source_id
       and a.target_type = 'agent' and a.target_id = p_agent_id
       and a.role = 'agent_resource'
     limit 1;
  end if;
  if v_id is null then
    perform platform.refuse_not_found(format('agent_resource_add: the edge %s/%s -> agent/%s was neither written nor found afterwards', p_source_type, p_source_id, p_agent_id), 'TAILS-5: this door never hands back a null id.');
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agx_usage_scan(p_agent_id uuid)
 RETURNS TABLE(row_kind text, usage_type text, usage_id uuid, node_id text, label text, owner_user_id uuid, organization_id uuid, organization_name text, org_manager_user_ids uuid[], agent_id uuid, agent_name text, current_version integer, pin_mode text, pinned_version_id uuid, pinned_version_number integer, versions_behind integer, stale_pin boolean, is_usage_active boolean, severity text, findings jsonb, config jsonb, managed_by_caller boolean, usage_updated_at timestamp with time zone, agg_usage_count integer, agg_breaking integer, agg_silent integer, agg_warning integer, agg_info integer, agg_stale_pins integer, agg_owner_user_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_super  boolean;
  v_access text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'agx_usage_scan: not authenticated' USING ERRCODE = '42501';
  END IF;
  v_super := public.is_super_admin();

  SELECT gal.access_level INTO v_access
  FROM public.agx_get_access_level(p_agent_id) gal;
  IF v_access IS NULL THEN
    perform platform.refuse_not_found(format('agx_usage_scan: agent %s not found', p_agent_id));
  END IF;
  IF NOT (v_super OR v_access IN ('owner', 'admin', 'editor')) THEN
    RAISE EXCEPTION 'agx_usage_scan: edit access to the agent is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT * FROM public.agx_usage_scan_core(p_agent_id, v_uid, 'agent')
  )
  SELECT
    'usage'::text,
    r.usage_type, r.usage_id, r.node_id, r.label,
    r.owner_user_id, r.organization_id, r.organization_name, r.org_manager_user_ids,
    r.agent_id, r.agent_name, r.current_version,
    r.pin_mode, r.pinned_version_id, r.pinned_version_number, r.versions_behind,
    r.stale_pin, r.is_usage_active, r.severity, r.findings, r.config,
    r.managed_by_caller, r.usage_updated_at,
    NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer,
    NULL::integer, NULL::uuid[]
  FROM r
  WHERE v_super OR r.managed_by_caller OR r.usage_type = 'code'

  UNION ALL

  SELECT
    'aggregate'::text,
    r.usage_type, NULL::uuid, NULL::text, NULL::text,
    NULL::uuid, r.organization_id, r.organization_name, r.org_manager_user_ids,
    r.agent_id, r.agent_name, r.current_version,
    NULL::text, NULL::uuid, NULL::integer, NULL::integer,
    false, NULL::boolean,
    CASE
      WHEN bool_or(r.severity = 'breaking')        THEN 'breaking'
      WHEN bool_or(r.severity = 'silent_breaking') THEN 'silent_breaking'
      WHEN bool_or(r.severity = 'warning')         THEN 'warning'
      WHEN bool_or(r.severity = 'info')            THEN 'info'
    END,
    '[]'::jsonb, NULL::jsonb, false, NULL::timestamptz,
    count(*)::integer,
    (count(*) FILTER (WHERE r.severity = 'breaking'))::integer,
    (count(*) FILTER (WHERE r.severity = 'silent_breaking'))::integer,
    (count(*) FILTER (WHERE r.severity = 'warning'))::integer,
    (count(*) FILTER (WHERE r.severity = 'info'))::integer,
    (count(*) FILTER (WHERE r.stale_pin))::integer,
    array_agg(DISTINCT r.owner_user_id) FILTER (WHERE r.owner_user_id IS NOT NULL)
  FROM r
  WHERE NOT (v_super OR r.managed_by_caller OR r.usage_type = 'code')
  GROUP BY r.usage_type, r.organization_id, r.organization_name, r.org_manager_user_ids,
           r.agent_id, r.agent_name, r.current_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.append_rows_to_user_table(p_table_id uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_inserted int;
  v_allowed  text[];
  v_row      jsonb;
  v_clean    jsonb;
  v_key      text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets
    WHERE id = p_table_id AND user_id = (select auth.uid())
  ) THEN
    perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, or your access may not reach it', p_table_id));
  END IF;

  SELECT array_agg(field_name) INTO v_allowed
  FROM workbench.udt_dataset_fields
  WHERE table_id = p_table_id;

  v_inserted := 0;
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_clean := '{}'::jsonb;
    FOR v_key IN SELECT jsonb_object_keys(v_row)
    LOOP
      IF v_allowed IS NULL OR v_key = ANY(v_allowed) THEN
        v_clean := v_clean || jsonb_build_object(v_key, v_row -> v_key);
      END IF;
    END LOOP;

    INSERT INTO workbench.udt_dataset_rows (table_id, user_id, data)
    VALUES (p_table_id, (select auth.uid()), v_clean);
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_template_by_key(p_template_key text, p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_template_id uuid;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id
      using errcode = '42501';
  end if;

  select t.id
  into v_template_id
  from context.templates t
  where t.key = p_template_key
    and t.is_active = true;

  if v_template_id is null then
    perform platform.refuse_not_found(format('Template with key %s not found', p_template_key));
  end if;

  return public.apply_template(v_template_id, p_org_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_template(p_template_id uuid, p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_template_type record;
  v_type_id_map jsonb := '{}'::jsonb;
  v_new_type_id uuid;
  v_field record;
  v_created_types jsonb := '[]'::jsonb;
  v_items_count integer := 0;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id using errcode = '42501';
  end if;

  if not exists (select 1 from context.templates t where t.id = p_template_id and t.is_active = true) then
    perform platform.refuse_not_found(format('active template %s not found', p_template_id));
  end if;

  for v_template_type in
    select * from context.template_scope_types where template_id = p_template_id order by sort_order
  loop
    insert into context.scope_types (
      organization_id, label_singular, label_plural, icon, description,
      sort_order, max_assignments_per_entity, slug
    ) values (
      p_org_id, v_template_type.label_singular, v_template_type.label_plural,
      v_template_type.icon, v_template_type.description, v_template_type.sort_order,
      v_template_type.max_assignments_per_entity,
      context.slugify(v_template_type.label_plural)   -- explicit; trigger also guarantees this
    )
    returning id into v_new_type_id;

    v_type_id_map := v_type_id_map || jsonb_build_object(v_template_type.id::text, v_new_type_id::text);
    v_created_types := v_created_types || jsonb_build_array(jsonb_build_object(
      'id', v_new_type_id, 'label_singular', v_template_type.label_singular, 'label_plural', v_template_type.label_plural));

    for v_field in
      select * from context.template_context_items where template_scope_type_id = v_template_type.id order by sort_order
    loop
      insert into context.context_items (
        scope_type_id, key, display_name, description, value_type,
        status, fetch_hint, sensitivity, source_type, created_by
      ) values (
        v_new_type_id, v_field.key, v_field.display_name, v_field.description, v_field.value_type,
        'active', 'on_demand', 'internal', 'manual', (select auth.uid())
        -- slug auto-mirrored from key by context.ensure_slug()
      );
      v_items_count := v_items_count + 1;
    end loop;
  end loop;

  for v_template_type in
    select id, parent_template_type_id from context.template_scope_types
    where template_id = p_template_id and parent_template_type_id is not null
  loop
    update context.scope_types
    set parent_type_id = (v_type_id_map ->> v_template_type.parent_template_type_id::text)::uuid
    where id = (v_type_id_map ->> v_template_type.id::text)::uuid;
  end loop;

  return jsonb_build_object(
    'template_id', p_template_id, 'organization_id', p_org_id,
    'scope_types_created', v_created_types, 'context_items_count', v_items_count);
end;
$function$;

CREATE OR REPLACE FUNCTION public.assoc_add(p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid, p_org_id uuid DEFAULT NULL::uuid, p_label text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_role text DEFAULT NULL::text, p_position integer DEFAULT NULL::integer, p_payload_kind text DEFAULT NULL::text, p_payload jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_org uuid;
    v_id uuid;
    v_container_side text;
    v_container_type text;
    v_container_id uuid;
    v_org_from_fallback boolean := false;
    v_source_editor boolean;
    v_source_viewer boolean;
    v_target_editor boolean;
    v_target_viewer boolean;
begin
    if (select auth.uid()) is null then
        raise exception 'assoc_add: authenticated user required'
            using errcode = '42501';
    end if;

    if p_source_type = 'file' and p_target_type = 'conversation' then
        if p_role is not null or p_position is not null
           or p_payload_kind is not null or p_payload is not null then
            raise exception 'file -> conversation supports only the canonical role-less attachment edge'
                using errcode = '42501';
        end if;
        return public.conversation_file_add(
            p_target_id,
            p_source_id,
            p_label,
            coalesce(p_metadata, '{}'::jsonb),
            coalesce(p_metadata, '{}'::jsonb) ? 'resource_policy'
        );
    end if;

    select at.container_side
      into v_container_side
      from platform.association_types at
     where at.source_type = p_source_type
       and at.target_type = p_target_type
       and at.is_active;

    v_source_editor := iam.has_access(
        p_source_type, p_source_id, 'editor'::public.permission_level
    );
    v_source_viewer := iam.has_access(
        p_source_type, p_source_id, 'viewer'::public.permission_level
    );
    v_target_editor := iam.has_access(
        p_target_type, p_target_id, 'editor'::public.permission_level
    );
    v_target_viewer := iam.has_access(
        p_target_type, p_target_id, 'viewer'::public.permission_level
    );

    if v_container_side is distinct from 'none'
       and v_container_side is not null then
        if v_source_editor is not true or v_target_editor is not true then
            raise exception 'assoc_add: editor access to both endpoints is required for an access-conveying edge'
                using errcode = '42501';
        end if;

        if v_container_side = 'target' then
            v_container_type := p_target_type;
            v_container_id := p_target_id;
        elsif v_container_side = 'source' then
            v_container_type := p_source_type;
            v_container_id := p_source_id;
        else
            raise exception 'assoc_add: unsupported container_side %', v_container_side
                using errcode = '23514';
        end if;

        v_org := private.association_container_organization_id(
            v_container_type,
            v_container_id
        );
        if v_org is null then
            raise exception 'assoc_add: access-conveying container has no organization'
                using errcode = '23514';
        end if;
    else
        if coalesce((
            (v_source_editor and v_target_viewer)
            or (v_source_viewer and v_target_editor)
        ), false) is not true then
            raise exception 'assoc_add: non-conveying edges require editor access to one endpoint and viewer access to the other'
                using errcode = '42501';
        end if;

        -- Derive the edge org from a real endpoint. A caller-supplied org is
        -- only a fallback for registered endpoint types with no org column.
        v_org := private.association_container_organization_id(
            p_source_type,
            p_source_id
        );
        if v_org is null then
            v_org := private.association_container_organization_id(
                p_target_type,
                p_target_id
            );
        end if;
        if v_org is null then
            v_org := p_org_id;
            v_org_from_fallback := true;
        end if;
    end if;

    if v_org is null or (
        v_org_from_fallback and not iam.has_org_access(v_org)
    ) then
        raise exception
            'assoc_add: no org access (org=%, %/% -> %/% role=%)',
            v_org, p_source_type, p_source_id, p_target_type, p_target_id, p_role
            using errcode = '42501';
    end if;

    insert into platform.associations (
        source_type, source_id, target_type, target_id, organization_id,
        role, label, position, metadata, payload_kind, payload, created_by
    ) values (
        p_source_type, p_source_id, p_target_type, p_target_id, v_org,
        p_role, p_label, p_position, coalesce(p_metadata, '{}'::jsonb),
        p_payload_kind, p_payload, (select auth.uid())
    )
    on conflict (source_type, source_id, target_type, target_id, role)
    do update set
        label = coalesce(excluded.label, platform.associations.label),
        position = coalesce(excluded.position, platform.associations.position),
        metadata = excluded.metadata,
        payload_kind = coalesce(
            excluded.payload_kind,
            platform.associations.payload_kind
        ),
        payload = case
            when excluded.payload_kind is not null then excluded.payload
            else platform.associations.payload
        end
    returning id into v_id;

    -- TAILS-5: RE-ADDING SOMETHING THAT WAS REMOVED HANDS BACK NO ROW, AND THAT IS NOT NULL.
    -- `trg_associations_revive_tombstone` revives the tombstoned edge IN PLACE and skips the
    -- insert, so this statement returns zero rows — correctly, because nothing was inserted.
    -- The edge exists and this reads it by the key it was just written under. Returning NULL
    -- here would be the silent failure the trigger fix was written to avoid.
    if v_id is null then
        select a.id into v_id
          from platform.associations a
         where a.source_type = p_source_type and a.source_id = p_source_id
           and a.target_type = p_target_type and a.target_id = p_target_id
           and a.role is not distinct from p_role
         limit 1;
    end if;
    if v_id is null then
        perform platform.refuse_not_found(format('assoc_add: the edge %s/%s -> %s/%s (role %s) was neither written nor found afterwards', p_source_type, p_source_id, p_target_type, p_target_id, coalesce(p_role, '<none>')), 'TAILS-5: this door never hands back a null id. If you are seeing this, the write was refused by something that did not raise.');
    end if;

    return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.bump_version(p_file_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_new INT;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('file', p_file_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to modify file %', p_file_id USING ERRCODE = '42501';
    END IF;
    UPDATE files.files
       SET current_version = current_version + 1,
           updated_at = now()
     WHERE id = p_file_id
       AND deleted_at IS NULL
    RETURNING current_version INTO v_new;
    IF v_new IS NULL THEN
        perform platform.refuse_not_found(format('bump_version: file %s not found or deleted', p_file_id));
    END IF;
    RETURN v_new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cat_delete(p_category_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_category platform.categories%rowtype;
begin
  if auth.uid() is null then
    raise exception 'cat_delete: not authenticated' using errcode = '42501';
  end if;
  select category.* into v_category
  from platform.categories category
  where category.id = p_category_id and category.deleted_at is null;
  if not found then
    perform platform.refuse_not_found('cat_delete: category not found');
  end if;
  if v_category.is_system then
    if not public.is_super_admin() then
      raise exception 'cat_delete: system categories require super-admin access'
        using errcode = '42501';
    end if;
  elsif not iam.has_org_access(v_category.organization_id) then
    raise exception 'cat_delete: no org access' using errcode = '42501';
  end if;

  update platform.categories set deleted_at = now()
  where id = p_category_id;
  return p_category_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cat_reparent(p_category_id uuid, p_parent_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_category platform.categories%rowtype;
begin
  if auth.uid() is null then
    raise exception 'cat_reparent: not authenticated' using errcode = '42501';
  end if;
  select category.* into v_category
  from platform.categories category
  where category.id = p_category_id and category.deleted_at is null;
  if not found then
    perform platform.refuse_not_found('cat_reparent: category not found');
  end if;
  if v_category.is_system then
    if not public.is_super_admin() then
      raise exception 'cat_reparent: system categories require super-admin access'
        using errcode = '42501';
    end if;
  elsif not iam.has_org_access(v_category.organization_id) then
    raise exception 'cat_reparent: no org access' using errcode = '42501';
  end if;

  -- THE NEW PARENT IS THIS CATEGORY'S TENANT'S OR THE PLATFORM'S (0850): same class as
  -- cat_create, same sentence for a foreign parent and an invented one.
  if p_parent_id is not null and not exists (
       select 1 from platform.categories parent
        where parent.id = p_parent_id and parent.deleted_at is null
          and (parent.organization_id = v_category.organization_id or parent.is_system)) then
    raise exception 'cat_reparent: parent category not found' using errcode = '22023';
  end if;
  update platform.categories set parent_id = p_parent_id
  where id = p_category_id;
  return p_category_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cat_update(p_category_id uuid, p_name text, p_slug text DEFAULT NULL::text, p_color text DEFAULT NULL::text, p_icon text DEFAULT NULL::text, p_position integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_category platform.categories%rowtype;
begin
  if auth.uid() is null then
    raise exception 'cat_update: not authenticated' using errcode = '42501';
  end if;
  select category.* into v_category
  from platform.categories category
  where category.id = p_category_id and category.deleted_at is null;
  if not found then
    perform platform.refuse_not_found('cat_update: category not found');
  end if;
  if v_category.is_system then
    if not public.is_super_admin() then
      raise exception 'cat_update: system categories require super-admin access'
        using errcode = '42501';
    end if;
  elsif not iam.has_org_access(v_category.organization_id) then
    raise exception 'cat_update: no org access' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'cat_update: name is required' using errcode = '22023';
  end if;

  update platform.categories
  set name = btrim(p_name),
      slug = nullif(btrim(p_slug), ''),
      color = p_color,
      icon = p_icon,
      "position" = p_position
  where id = p_category_id;
  return p_category_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.conversation_file_add(p_conversation_id uuid, p_file_id uuid, p_label text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_replace_metadata boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_id uuid;
    v_org uuid;
    v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
    if (select auth.uid()) is null then
        raise exception 'conversation_file_add: authenticated user required'
            using errcode = '42501';
    end if;
    if jsonb_typeof(v_metadata) <> 'object' then
        raise exception 'conversation_file_add: metadata must be a JSON object'
            using errcode = '22023';
    end if;
    if not exists (
        select 1 from files.files f
        where f.id = p_file_id and f.deleted_at is null
    ) then
        perform platform.refuse_not_found('conversation_file_add: file is no longer available');
    end if;
    if not iam.has_access('conversation', p_conversation_id, 'editor'::public.permission_level) then
        raise exception 'conversation_file_add: editor access to conversation required'
            using errcode = '42501';
    end if;
    if not iam.has_access('file', p_file_id, 'editor'::public.permission_level) then
        raise exception 'conversation_file_add: editor access to file required'
            using errcode = '42501';
    end if;
    select c.organization_id into v_org
    from chat.conversation c
    where c.id = p_conversation_id and c.deleted_at is null;
    if v_org is null then
        raise exception 'conversation_file_add: conversation has no organization'
            using errcode = '23514';
    end if;
    insert into platform.associations (
        source_type, source_id, target_type, target_id, organization_id,
        role, label, metadata, created_by
    ) values (
        'file', p_file_id, 'conversation', p_conversation_id, v_org,
        null, p_label, v_metadata || jsonb_build_object('file_id', p_file_id),
        (select auth.uid())
    )
    on conflict (source_type, source_id, target_type, target_id, role)
    do update set
        label = coalesce(excluded.label, platform.associations.label),
        metadata = case
            when p_replace_metadata then excluded.metadata
            else platform.associations.metadata
        end
    returning id into v_id;

    -- TAILS-5: re-attaching a file that was detached revives the tombstoned edge in place and
    -- inserts nothing, so this statement hands back no row. The edge exists; read it.
    -- On that path the trigger MERGES the metadata (old || new) rather than honouring
    -- p_replace_metadata, which is the least destructive of the two and is written down in
    -- platform.revive_tombstoned_association()'s own header.
    if v_id is null then
        select a.id into v_id
          from platform.associations a
         where a.source_type = 'file' and a.source_id = p_file_id
           and a.target_type = 'conversation' and a.target_id = p_conversation_id
           and a.role is null
         limit 1;
    end if;
    if v_id is null then
        perform platform.refuse_not_found(format('conversation_file_add: the edge file/%s -> conversation/%s was neither written nor found afterwards', p_file_id, p_conversation_id), 'TAILS-5: this door never hands back a null id.');
    end if;

    return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.create_context_item(p_scope_type_id uuid, p_key text, p_display_name text, p_value_type context_value_type, p_description text DEFAULT ''::text, p_category text DEFAULT NULL::text, p_fetch_hint context_fetch_hint DEFAULT 'on_demand'::context_fetch_hint, p_sensitivity context_sensitivity DEFAULT 'internal'::context_sensitivity, p_tags text[] DEFAULT '{}'::text[], p_slug text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint, p_allowed_reference_types text[] DEFAULT NULL::text[], p_max_items integer DEFAULT 1, p_allowed_scope_type_ids uuid[] DEFAULT NULL::uuid[], p_reference_source jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id uuid; v_sort smallint; v_org_id uuid;
begin
  select organization_id into v_org_id from context.scope_types where id=p_scope_type_id and deleted_at is null;
  if v_org_id is null then perform platform.refuse_not_found(format('active scope type %s not found', p_scope_type_id)); end if;
  if (auth.role()='service_role' or iam.has_org_admin(v_org_id)) is not true then raise exception 'organization admin required for %',v_org_id using errcode='42501'; end if;
  perform context.validate_dataset_template_source(p_reference_source,v_org_id);
  v_sort:=coalesce(p_sort_order,(select (coalesce(max(sort_order),0)+1)::smallint from context.context_items where scope_type_id=p_scope_type_id and is_active));
  insert into context.context_items (scope_type_id,key,display_name,description,category,value_type,fetch_hint,sensitivity,status,source_type,tags,slug,sort_order,created_by,allowed_reference_types,max_items,allowed_scope_type_ids,reference_source)
  values (p_scope_type_id,p_key,p_display_name,p_description,p_category,p_value_type,p_fetch_hint,p_sensitivity,'active','manual',p_tags,p_slug,v_sort,(select auth.uid()),p_allowed_reference_types,coalesce(p_max_items,1),p_allowed_scope_type_ids,p_reference_source) returning id into v_id;
  return (select to_jsonb(ci) from context.context_items ci where ci.id=v_id);
end; $function$;

CREATE OR REPLACE FUNCTION public.creator_set_public(p_public boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'users'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- DD-152: publishing a creator page is a VISIBILITY decision, not only a flag. A page an
  -- anonymous visitor reaches by holding the handle is `link` — never `public`, which would open
  -- the whole profile row to the published anon key through the {anon} pub_read policy.
  update users.profiles set
    creator_public = coalesce(p_public, false),
    visibility = case
      when coalesce(p_public, false)
        then greatest(visibility, 'link'::platform.visibility)
      when visibility = 'link'::platform.visibility
        then 'internal'::platform.visibility
      else visibility
    end,
    creator_published_at = case when coalesce(p_public, false)
      then coalesce(creator_published_at, now()) else creator_published_at end,
    updated_at = now()
  where id = v_uid and deleted_at is null and creator_handle is not null;
  if not found then
    perform platform.refuse_not_found('Claim a handle before publishing your page');
  end if;
  return public.creator_get_mine();
end;
$function$;

CREATE OR REPLACE FUNCTION public.creator_update_profile(p_display_name text DEFAULT NULL::text, p_tagline text DEFAULT NULL::text, p_bio text DEFAULT NULL::text, p_avatar_url text DEFAULT NULL::text, p_links jsonb DEFAULT NULL::jsonb, p_featured jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'users'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_links is not null and jsonb_typeof(p_links) <> 'array' then
    raise exception 'links must be a JSON array' using errcode = '22023';
  end if;
  if p_featured is not null and jsonb_typeof(p_featured) <> 'array' then
    raise exception 'featured must be a JSON array' using errcode = '22023';
  end if;

  update users.profiles set
    display_name    = coalesce(nullif(btrim(p_display_name), ''), display_name),
    creator_tagline = coalesce(p_tagline, creator_tagline),
    creator_bio     = coalesce(p_bio, creator_bio),
    avatar_url      = coalesce(nullif(btrim(p_avatar_url), ''), avatar_url),
    creator_links   = coalesce(p_links, creator_links),
    creator_featured = coalesce(p_featured, creator_featured),
    updated_at = now()
  where id = v_uid and deleted_at is null;

  if not found then
    perform platform.refuse_not_found('No profile to update — claim a handle first');
  end if;
  return public.creator_get_mine();
end;
$function$;

CREATE OR REPLACE FUNCTION public.crm_dismiss_merge_candidate(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v crm.merge_candidate;
begin
  select * into v from crm.merge_candidate where id = p_id and deleted_at is null;
  if v.id is null then
    perform platform.refuse_not_found(format('crm_dismiss_merge_candidate: candidate %s not found', p_id));
  end if;
  if not (iam.has_access('party', v.source_id, 'editor') or iam.has_access('party', v.target_id, 'editor')) then
    raise exception 'crm_dismiss_merge_candidate: editor access required' using errcode = '42501';
  end if;
  update crm.merge_candidate
     set status = 'dismissed', dismissed_by = (select auth.uid()), dismissed_at = now()
   where id = p_id;
  perform platform.log_activity(v.organization_id, 'crm.party.merge_candidate_dismissed',
    'party', v.source_id, jsonb_build_object('candidate_id', p_id, 'target_id', v.target_id));
end $function$;

CREATE OR REPLACE FUNCTION public.crm_merge_parties(p_winner uuid, p_loser uuid, p_method text DEFAULT 'manual'::text, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid; v_merge_id uuid; v_moved jsonb := '{}'::jsonb; v_ids uuid[]; v_demoted uuid[];
begin
  if p_winner = p_loser then
    raise exception 'crm_merge_parties: cannot merge a party into itself' using errcode = '22023';
  end if;
  select organization_id into v_org from crm.party where id = p_winner and deleted_at is null;
  if v_org is null then
    perform platform.refuse_not_found(format('crm_merge_parties: winner party %s not found', p_winner));
  end if;
  if not exists (select 1 from crm.party where id = p_loser and deleted_at is null and organization_id = v_org) then
    perform platform.refuse_not_found(format('crm_merge_parties: loser party %s not found in the same organization', p_loser));
  end if;
  if not (iam.has_access('party', p_winner, 'editor') and iam.has_access('party', p_loser, 'editor')) then
    raise exception 'crm_merge_parties: editor access required on both parties' using errcode = '42501';
  end if;
  if exists (select 1 from crm.party where id in (p_winner, p_loser) and canonical_id is not null) then
    raise exception 'crm_merge_parties: one of these parties is already merged - unmerge first' using errcode = '22023';
  end if;

  -- Contact points: keep a moved primary unless the winner already has a
  -- primary on that channel. Record what was demoted, for exact unmerge.
  with moved as (
    update crm.party_contact_point cp
       set party_id = p_winner,
           is_primary = cp.is_primary and not exists (
             select 1 from crm.party_contact_point w
              where w.party_id = p_winner and w.channel = cp.channel
                and w.is_primary and w.deleted_at is null)
     where cp.party_id = p_loser and cp.deleted_at is null
       and not exists (select 1 from crm.party_contact_point w
                        where w.party_id = p_winner and w.medium_id = cp.medium_id and w.deleted_at is null)
    returning cp.id, (not cp.is_primary) as demoted_or_never,
              cp.is_primary as now_primary)
  select coalesce(array_agg(id), '{}'),
         coalesce(array_agg(id) filter (where not now_primary
           and exists (select 1 from crm.party_contact_point o where o.id = moved.id)), '{}')
    into v_ids, v_demoted from moved;
  -- The filter above cannot see the PRE-update flag from RETURNING; recompute
  -- demotions directly: a moved row that is primary at the loser's unique
  -- scope but not primary now was demoted by this merge.
  v_demoted := coalesce((
    select array_agg(cp.id) from crm.party_contact_point cp
     where cp.id = any (v_ids) and not cp.is_primary
       and exists (select 1 from crm.party_contact_point w
                    where w.party_id = p_winner and w.channel = cp.channel
                      and w.is_primary and w.deleted_at is null)
       and not exists (
         -- rows that were never primary at the loser leave no gap there:
         -- the loser still holds a primary for this channel among the
         -- rows that did NOT move.
         select 1 from crm.party_contact_point l
          where l.party_id = p_loser and l.channel = cp.channel
            and l.is_primary and l.deleted_at is null)), '{}');
  v_moved := v_moved || jsonb_build_object('party_contact_point', to_jsonb(v_ids),
                                           'primary_demoted_party_contact_point', to_jsonb(v_demoted));

  with moved as (
    update crm.address a
       set party_id = p_winner,
           is_primary = a.is_primary and not exists (
             select 1 from crm.address w
              where w.party_id = p_winner and w.purpose_code = a.purpose_code
                and w.is_primary and w.deleted_at is null)
     where a.party_id = p_loser and a.deleted_at is null
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_demoted := coalesce((
    select array_agg(a.id) from crm.address a
     where a.id = any (v_ids) and not a.is_primary
       and exists (select 1 from crm.address w
                    where w.party_id = p_winner and w.purpose_code = a.purpose_code
                      and w.is_primary and w.deleted_at is null)
       and not exists (select 1 from crm.address l
                        where l.party_id = p_loser and l.purpose_code = a.purpose_code
                          and l.is_primary and l.deleted_at is null)), '{}');
  v_moved := v_moved || jsonb_build_object('address', to_jsonb(v_ids),
                                           'primary_demoted_address', to_jsonb(v_demoted));

  with moved as (
    update crm.affiliation a
       set party_id = p_winner,
           is_primary = a.is_primary and not exists (
             select 1 from crm.affiliation w
              where w.party_id = p_winner and w.is_primary and w.deleted_at is null
                and daterange(w.start_date, w.end_date, '[]') && daterange(a.start_date, a.end_date, '[]'))
     where a.party_id = p_loser and a.deleted_at is null
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_demoted := coalesce((
    select array_agg(a.id) from crm.affiliation a
     where a.id = any (v_ids) and not a.is_primary
       and exists (select 1 from crm.affiliation w
                    where w.party_id = p_winner and w.is_primary and w.deleted_at is null
                      and w.id <> a.id
                      and daterange(w.start_date, w.end_date, '[]') && daterange(a.start_date, a.end_date, '[]'))
       and not exists (select 1 from crm.affiliation l
                        where l.party_id = p_loser and l.is_primary and l.deleted_at is null
                          and daterange(l.start_date, l.end_date, '[]') && daterange(a.start_date, a.end_date, '[]'))), '{}');
  v_moved := v_moved || jsonb_build_object('affiliation', to_jsonb(v_ids),
                                           'primary_demoted_affiliation', to_jsonb(v_demoted));

  with moved as (update crm.interaction set party_id = p_winner
                  where party_id = p_loser and deleted_at is null returning id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('interaction', to_jsonb(v_ids));

  with moved as (
    update crm.outreach_list_member cm set party_id = p_winner
     where cm.party_id = p_loser and cm.deleted_at is null
       and not exists (select 1 from crm.outreach_list_member w
                        where w.outreach_list_id = cm.outreach_list_id and w.party_id = p_winner and w.deleted_at is null)
    returning cm.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('outreach_list_member', to_jsonb(v_ids));

  with moved as (update crm.deal set primary_party_id = p_winner
                  where primary_party_id = p_loser and deleted_at is null returning id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('deal_primary', to_jsonb(v_ids));

  with moved as (
    update platform.associations a set source_id = p_winner
     where a.source_type = 'party' and a.source_id = p_loser
       and not exists (select 1 from platform.associations_live w
                        where w.source_type = 'party' and w.source_id = p_winner
                          and w.target_type = a.target_type and w.target_id = a.target_id
                          and w.role is not distinct from a.role)
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('assoc_source', to_jsonb(v_ids));

  with moved as (
    update platform.associations a set target_id = p_winner
     where a.target_type = 'party' and a.target_id = p_loser
       and not exists (select 1 from platform.associations_live w
                        where w.target_type = 'party' and w.target_id = p_winner
                          and w.source_type = a.source_type and w.source_id = a.source_id
                          and w.role is not distinct from a.role)
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('assoc_target', to_jsonb(v_ids));

  update crm.party set canonical_id = p_winner where id = p_loser;

  insert into crm.party_merge (winner_id, loser_id, moved, method, reason, merged_by, organization_id)
  values (p_winner, p_loser, v_moved, p_method, p_reason, (select auth.uid()), v_org)
  returning id into v_merge_id;

  perform platform.log_activity(v_org, 'crm.party.merge', 'party', p_winner,
    jsonb_build_object('loser_id', p_loser, 'merge_id', v_merge_id, 'method', p_method));
  return v_merge_id;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_party_purge(p_party uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid;
begin
  select organization_id into v_org from crm.party where id = p_party;
  if v_org is null then
    perform platform.refuse_not_found(format('crm_party_purge: party %s not found', p_party));
  end if;
  if not iam.has_access('party', p_party, 'admin') then
    raise exception 'crm_party_purge: admin access required on the party' using errcode = '42501';
  end if;

  delete from platform.associations
   where (source_type = 'party' and source_id = p_party) or (target_type = 'party' and target_id = p_party);
  delete from platform.comments where entity_type = 'party' and entity_id = p_party;
  delete from platform.user_entity_state where entity_type = 'party' and entity_id = p_party;
  delete from crm.outreach_list_member where party_id = p_party;
  delete from crm.interaction where party_id = p_party;
  delete from crm.party_contact_point where party_id = p_party;
  delete from crm.address where party_id = p_party;
  delete from crm.affiliation where party_id = p_party or employer_party_id = p_party;
  delete from crm.party_merge where winner_id = p_party or loser_id = p_party;
  delete from history.row_versions where entity_type in ('party','crm_affiliation') and row_id = p_party;
  update crm.party set canonical_id = null where canonical_id = p_party;
  update crm.party set source_party_id = null where source_party_id = p_party;
  update crm.party set primary_employer_party_id = null where primary_employer_party_id = p_party;
  update crm.deal set primary_party_id = null where primary_party_id = p_party;
  delete from crm.party where id = p_party;

  perform platform.log_activity(v_org, 'crm.party.purge', 'party', p_party, '{}'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_resume_sending_identity(p_identity_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public', 'pg_temp'
AS $function$
declare si crm.sending_identity;
begin
  select * into si from crm.sending_identity where id = p_identity_id and deleted_at is null;
  if si.id is null then perform platform.refuse_not_found('sending identity not found'); end if;
  if not public.is_org_admin(si.organization_id) then
    raise exception 'only an organization admin can resume a paused mailbox' using errcode='42501';
  end if;
  if si.status <> 'paused' then
    return jsonb_build_object('ok', false, 'error', 'not_paused', 'status', si.status);
  end if;

  update crm.sending_identity
     set status = case when warmup_completed_at is null and warmup_started_at is not null
                       then 'warming' else 'ready' end,
         status_changed_at = now(), resumed_at = now(), resumed_by = (select auth.uid()),
         paused_at = null, paused_by_kind = null, pause_reason = null, pause_code = null
   where id = p_identity_id;

  update crm.outreach_list
     set paused_at = null, paused_by_kind = null, pause_reason = null
   where sending_identity_id = p_identity_id and paused_by_kind = 'system' and deleted_at is null;

  insert into crm.sending_identity_check (identity_id, check_kind, passed, message, organization_id, observed)
  values (p_identity_id, 'connection', true,
          coalesce('Resumed by a human. ' || p_note, 'Resumed by a human.'),
          si.organization_id, jsonb_build_object('previous_pause_reason', si.pause_reason));

  return jsonb_build_object('ok', true, 'identity_id', p_identity_id);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_set_primary_contact_point(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_party uuid; v_channel text;
begin
  select party_id, channel into v_party, v_channel
    from crm.party_contact_point where id = p_id and deleted_at is null;
  if v_party is null then
    perform platform.refuse_not_found(format('crm_set_primary_contact_point: contact point %s not found', p_id));
  end if;
  if not iam.has_access('party', v_party, 'editor') then
    raise exception 'crm_set_primary_contact_point: no edit access to party %', v_party using errcode = '42501';
  end if;
  update crm.party_contact_point set is_primary = false
   where party_id = v_party and channel = v_channel and deleted_at is null and is_primary and id <> p_id;
  update crm.party_contact_point set is_primary = true where id = p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_unmerge_parties(p_merge_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_m crm.party_merge;
begin
  select * into v_m from crm.party_merge where id = p_merge_id and unmerged_at is null;
  if v_m.id is null then
    perform platform.refuse_not_found(format('crm_unmerge_parties: merge record %s not found or already undone', p_merge_id));
  end if;
  if not iam.has_access('party', v_m.winner_id, 'editor') then
    raise exception 'crm_unmerge_parties: editor access required' using errcode = '42501';
  end if;

  -- Move rows back PRESERVING their primary flags (a primary the winner
  -- inherited returns as the loser's primary), demoting only on a genuine
  -- conflict at the loser so the partial-unique indexes cannot 23505.
  update crm.party_contact_point cp
     set party_id = v_m.loser_id,
         is_primary = cp.is_primary and not exists (
           select 1 from crm.party_contact_point w
            where w.party_id = v_m.loser_id and w.channel = cp.channel
              and w.is_primary and w.deleted_at is null and w.id <> cp.id)
   where cp.id = any (array(select jsonb_array_elements_text(v_m.moved->'party_contact_point'))::uuid[]);
  update crm.address a
     set party_id = v_m.loser_id,
         is_primary = a.is_primary and not exists (
           select 1 from crm.address w
            where w.party_id = v_m.loser_id and w.purpose_code = a.purpose_code
              and w.is_primary and w.deleted_at is null and w.id <> a.id)
   where a.id = any (array(select jsonb_array_elements_text(v_m.moved->'address'))::uuid[]);
  update crm.affiliation a
     set party_id = v_m.loser_id,
         is_primary = a.is_primary and not exists (
           select 1 from crm.affiliation w
            where w.party_id = v_m.loser_id and w.is_primary and w.deleted_at is null
              and w.id <> a.id
              and daterange(w.start_date, w.end_date, '[]') && daterange(a.start_date, a.end_date, '[]'))
   where a.id = any (array(select jsonb_array_elements_text(v_m.moved->'affiliation'))::uuid[]);

  -- Restore the primaries THIS merge demoted (ledger keys absent on
  -- pre-crm_12 merges → empty sets, same behavior as before). Guarded: the
  -- flag comes back only if no other primary took the slot meanwhile.
  update crm.party_contact_point cp set is_primary = true
   where cp.id = any (array(select jsonb_array_elements_text(v_m.moved->'primary_demoted_party_contact_point'))::uuid[])
     and cp.deleted_at is null and not cp.is_primary
     and not exists (select 1 from crm.party_contact_point w
                      where w.party_id = cp.party_id and w.channel = cp.channel
                        and w.is_primary and w.deleted_at is null);
  update crm.address a set is_primary = true
   where a.id = any (array(select jsonb_array_elements_text(v_m.moved->'primary_demoted_address'))::uuid[])
     and a.deleted_at is null and not a.is_primary
     and not exists (select 1 from crm.address w
                      where w.party_id = a.party_id and w.purpose_code = a.purpose_code
                        and w.is_primary and w.deleted_at is null);
  update crm.affiliation a set is_primary = true
   where a.id = any (array(select jsonb_array_elements_text(v_m.moved->'primary_demoted_affiliation'))::uuid[])
     and a.deleted_at is null and not a.is_primary
     and not exists (select 1 from crm.affiliation w
                      where w.party_id = a.party_id and w.is_primary and w.deleted_at is null
                        and daterange(w.start_date, w.end_date, '[]') && daterange(a.start_date, a.end_date, '[]'));

  update crm.interaction set party_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'interaction'))::uuid[]);
  update crm.outreach_list_member set party_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'outreach_list_member'))::uuid[]);
  update crm.deal set primary_party_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'deal_primary'))::uuid[]);
  update platform.associations set source_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'assoc_source'))::uuid[]);
  update platform.associations set target_id = v_m.loser_id
   where id = any (array(select jsonb_array_elements_text(v_m.moved->'assoc_target'))::uuid[]);

  update crm.party set canonical_id = null where id = v_m.loser_id;
  update crm.party_merge set unmerged_at = now(), unmerged_by = (select auth.uid()) where id = p_merge_id;

  perform platform.log_activity(v_m.organization_id, 'crm.party.unmerge', 'party', v_m.winner_id,
    jsonb_build_object('loser_id', v_m.loser_id, 'merge_id', p_merge_id));
end $function$;

CREATE OR REPLACE FUNCTION public.cx_canvas_toggle_favorite(p_canvas_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_new_state boolean;
BEGIN
  UPDATE canvas.canvas_items
  SET is_favorited = NOT is_favorited, updated_at = now()
  WHERE id = p_canvas_id
  RETURNING is_favorited INTO v_new_state;

  IF NOT FOUND THEN
    perform platform.refuse_not_found(format('canvas item %s is not available to this account — it may not exist, or your access may not reach it', p_canvas_id));
  END IF;

  RETURN v_new_state;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cx_canvas_update_version(p_user_id uuid, p_original_canvas_id uuid, p_new_message_id uuid, p_artifact_index smallint, p_type text, p_title text, p_content jsonb)
 RETURNS canvas.canvas_items
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_hash text;
  v_root_id uuid;
  v_root_org uuid;
  v_max_version smallint;
  v_conv_id uuid;
  v_row canvas.canvas_items;
  v_actor uuid := canvas._require_actor(p_user_id);
BEGIN
  -- A new version is a child of the ORIGINAL item and inherits its organization.
  SELECT COALESCE(parent_canvas_id, id), organization_id INTO v_root_id, v_root_org
  FROM canvas.canvas_items
  WHERE id = p_original_canvas_id;

  IF NOT FOUND THEN
    perform platform.refuse_not_found(format('canvas item %s is not available to this account — it may not exist, or your access may not reach it', p_original_canvas_id));
  END IF;

  SELECT COALESCE(MAX(version), 0) INTO v_max_version
  FROM canvas.canvas_items
  WHERE id = v_root_id OR parent_canvas_id = v_root_id;

  SELECT conversation_id INTO v_conv_id
  FROM chat.message
  WHERE id = p_new_message_id;

  v_hash := encode(extensions.digest(p_content::text, 'sha256'), 'hex');

  INSERT INTO canvas.canvas_items (
    user_id, source_message_id, artifact_index, type, title,
    content, content_hash, conversation_id, source_type,
    version, parent_canvas_id, organization_id
  )
  VALUES (
    v_actor, p_new_message_id, p_artifact_index, p_type, p_title,
    p_content, v_hash, v_conv_id, 'model_direct',
    v_max_version + 1, v_root_id, v_root_org
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cx_message_edit(p_message_id uuid, p_new_content jsonb)
 RETURNS chat.message
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_caller  uuid := auth.uid();
    v_row     chat.message;
    v_now     timestamptz := now();
    v_history jsonb;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'no_session' USING ERRCODE = '28000';
    END IF;

    SELECT m.*
      INTO v_row
      FROM chat.message AS m
     WHERE m.id = p_message_id;

    IF NOT FOUND THEN
        perform platform.refuse_not_found('message_not_found_or_not_editable');
    END IF;

    v_history := COALESCE(v_row.content_history, '[]'::jsonb)
              || jsonb_build_array(jsonb_build_object(
                     'content', v_row.content,
                     'saved_at', v_now
                 ));

    UPDATE chat.message
       SET content = p_new_content,
           user_content = CASE
             WHEN v_row.role = 'user' THEN p_new_content
             ELSE v_row.user_content
           END,
           content_history = v_history,
           status = 'edited'
     WHERE id = p_message_id
     RETURNING * INTO v_row;

    RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cx_message_set_content(p_message_id uuid, p_new_content jsonb)
 RETURNS chat.message
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_row        chat.message;
  v_conv_owner uuid;
  v_now        timestamptz := now();
  v_history    jsonb;
  v_old_ids    text[];
  v_new_ids    text[];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'no_session' USING ERRCODE = '28000';
  END IF;

  SELECT m.* INTO v_row FROM chat.message m WHERE m.id = p_message_id;
  IF NOT FOUND THEN
    perform platform.refuse_not_found('message_not_found');
  END IF;

  SELECT c.created_by INTO v_conv_owner
    FROM chat.conversation c
   WHERE c.id = v_row.conversation_id;

  IF v_conv_owner IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;

  -- TOOL-GRAPH GUARD (migration 0151): a content rewrite through this RPC may
  -- reshape text/artifact blocks but must NEVER add, remove, or re-id
  -- tool_call blocks. The tool_use ↔ tool_result pairing graph is provider-
  -- critical (Anthropic 400s on any mismatch) and is owned exclusively by the
  -- server's persistence path. This is the DB layer of the bcc588b6 fix —
  -- the write that corrupted that conversation is structurally rejected here.
  v_old_ids := chat._message_tool_call_ids(v_row.content);
  v_new_ids := chat._message_tool_call_ids(p_new_content);
  IF v_old_ids IS DISTINCT FROM v_new_ids THEN
    RAISE EXCEPTION
      'tool_call_graph_change_forbidden: cx_message_set_content may not change the tool_call blocks of message % (existing call_ids=%, proposed call_ids=%). Rewrite text/artifact blocks only — the tool-pairing graph is server-owned. (Migration 0151; FOUND_DEFECTS bcc588b6.)',
      p_message_id, v_old_ids, v_new_ids
      USING ERRCODE = 'P0001';
  END IF;

  v_history := COALESCE(v_row.content_history, '[]'::jsonb)
            || jsonb_build_array(jsonb_build_object(
                 'content',  v_row.content,
                 'saved_at', v_now,
                 'reason',   'artifact_materialization'
               ));

  UPDATE chat.message
     SET content         = p_new_content,
         content_history = v_history
   WHERE id = p_message_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_context_item(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_result jsonb;
begin
  select st.organization_id
    into v_org
    from context.context_items ci
    join context.scope_types st on st.id = ci.scope_type_id
   where ci.id = p_item_id
     and ci.deleted_at is null;

  if v_org is null then
    perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
  end if;

  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
    raise exception 'organization admin required for %', v_org
      using errcode = '42501';
  end if;

  update context.context_items
     set deleted_at = now(),
         is_active = false,
         updated_at = now()
   where id = p_item_id
  returning jsonb_build_object('id', id, 'deleted_at', deleted_at) into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_scope_type(p_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_scope_count integer;
  v_assignment_count integer;
  v_org uuid;
begin
  select scope_type.organization_id
  into v_org
  from context.scope_types as scope_type
  where scope_type.id = p_type_id
    and scope_type.deleted_at is null;

  if v_org is null then
    perform platform.refuse_not_found('scope type not found');
  end if;

  if auth.role() <> 'service_role'
     and not exists (
       select 1
       from iam.memberships as membership
       where membership.container_type = 'organization'
         and membership.container_id = v_org
         and membership.organization_id = v_org
         and membership.user_id = (select auth.uid())
         and membership.role in ('owner', 'admin')
         and membership.status = 'active'
         and membership.deleted_at is null
     ) then
    raise exception 'organization owner or admin required'
      using errcode = '42501';
  end if;

  select count(*)
  into v_assignment_count
  from platform.associations_live as association
  join context.scopes as scope on association.target_id = scope.id
  where association.target_type = 'scope'
    and scope.scope_type_id = p_type_id
    and scope.deleted_at is null;

  select count(*)
  into v_scope_count
  from context.scopes as scope
  where scope.scope_type_id = p_type_id
    and scope.deleted_at is null;

  -- THE ONE WRITE. platform._cascade_soft_delete stamps every declared child
  -- (scopes, context items, sub-types) with THIS row's deleted_at, and
  -- public.restore_scope_type reverses exactly that set. The hand-written child
  -- updates that used to live here flipped context_items.is_active instead —
  -- a one-way switch that left live rows under a removed parent (F6).
  update context.scope_types
  set deleted_at = now(),
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = p_type_id
    and deleted_at is null;

  return jsonb_build_object(
    'deleted_scopes', v_scope_count,
    'deleted_assignments', v_assignment_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_scope(p_scope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_child_count integer;
  v_assignment_count integer;
  v_org uuid;
begin
  select scope.organization_id
  into v_org
  from context.scopes as scope
  where scope.id = p_scope_id
    and scope.deleted_at is null;

  if v_org is null then
    perform platform.refuse_not_found('scope not found');
  end if;

  if auth.role() <> 'service_role'
     and not exists (
       select 1
       from iam.memberships as membership
       where membership.container_type = 'organization'
         and membership.container_id = v_org
         and membership.organization_id = v_org
         and membership.user_id = (select auth.uid())
         and membership.role in ('owner', 'admin')
         and membership.status = 'active'
         and membership.deleted_at is null
     ) then
    raise exception 'organization owner or admin required'
      using errcode = '42501';
  end if;

  with recursive children as (
    select scope.id
    from context.scopes as scope
    where scope.parent_scope_id = p_scope_id
      and scope.deleted_at is null
    union all
    select scope.id
    from context.scopes as scope
    join children as child on scope.parent_scope_id = child.id
    where scope.deleted_at is null
  )
  select count(*) into v_child_count from children;

  with recursive all_scopes as (
    select p_scope_id as id
    union all
    select scope.id
    from context.scopes as scope
    join all_scopes as parent on scope.parent_scope_id = parent.id
    where scope.deleted_at is null
  )
  select count(*)
  into v_assignment_count
  from platform.associations_live as association
  where association.target_type = 'scope'
    and association.target_id in (select id from all_scopes);

  with recursive all_scopes as (
    select p_scope_id as id
    union all
    select scope.id
    from context.scopes as scope
    join all_scopes as parent on scope.parent_scope_id = parent.id
    where scope.deleted_at is null
  )
  update context.scopes
  set deleted_at = now(),
      updated_by = (select auth.uid()),
      updated_at = now()
  where id in (select id from all_scopes)
    and deleted_at is null;

  return jsonb_build_object(
    'deleted_children', v_child_count,
    'deleted_assignments', v_assignment_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.dict_owner_org(p_level text, p_owner_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_org uuid;
BEGIN
    IF p_level = 'user' THEN
        RETURN NULL;
    ELSIF p_level = 'organization' THEN
        SELECT id INTO v_org FROM iam.organizations WHERE id = p_owner_id;
    ELSIF p_level = 'scope_type' THEN
        SELECT organization_id INTO v_org FROM context.scope_types WHERE id = p_owner_id;
    ELSIF p_level = 'scope' THEN
        SELECT organization_id INTO v_org FROM context.scopes WHERE id = p_owner_id;
    ELSE
        RAISE EXCEPTION 'dict: unknown level "%"', p_level USING ERRCODE = '22023';
    END IF;

    IF p_level <> 'user' AND v_org IS NULL THEN
        perform platform.refuse_not_found(format('dict: %s "%s" is not available to this account — it may not exist, or your access may not reach it', p_level, p_owner_id));
    END IF;
    RETURN v_org;
END;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_join_by_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_scope context.scopes;
  v_mode text;
  v_row iam.memberships;
  v_live boolean;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_code, ''))) < 4 then
    perform platform.refuse_not_found('invalid join code');
  end if;

  select s.* into v_scope
  from context.scopes s
  join context.scope_types st on st.id = s.scope_type_id
  where st.slug = 'class'
    and s.deleted_at is null
    and s.settings->>'join_code' is not null
    and upper(s.settings->>'join_code') = upper(btrim(p_code))
  limit 1;
  if v_scope.id is null then
    perform platform.refuse_not_found('invalid join code');
  end if;

  v_mode := public._edu_access_mode(v_scope);

  if public._edu_is_owner(v_scope) then
    perform public._edu_ensure_owner_membership(v_scope);
    return jsonb_build_object('status', 'already_member', 'role', 'owner', 'access_mode', v_mode, 'class_id', v_scope.id);
  end if;

  select * into v_row from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = v_uid limit 1;
  v_live := v_row.id is not null and v_row.deleted_at is null;

  if v_live and v_row.status = 'active' then
    return jsonb_build_object('status', 'already_member', 'role', v_row.role, 'access_mode', v_mode, 'class_id', v_scope.id);
  end if;

  if v_mode = 'paid' and not (v_live and v_row.status = 'entitled') then
    return jsonb_build_object('status', 'needs_purchase', 'access_mode', v_mode, 'class_id', v_scope.id);
  end if;

  if v_row.id is not null then
    update iam.memberships
       set status = 'active', role = 'member', deleted_at = null, updated_at = now(), updated_by = v_uid
     where id = v_row.id;
  else
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
    values (v_scope.organization_id, 'scope', v_scope.id, v_uid, 'member', 'active', v_uid);
  end if;

  return jsonb_build_object('status', 'joined', 'role', 'member', 'access_mode', v_mode, 'class_id', v_scope.id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_state(p_class uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope context.scopes; v_mode text; v_uid uuid := (select auth.uid());
  v_is_owner boolean; v_my_role text; v_my_status text;
  v_member_count int; v_pending_count int;
begin
  v_scope := public._edu_class(p_class);
  v_mode := public._edu_access_mode(v_scope);
  v_is_owner := public._edu_is_owner(v_scope);
  select role, status into v_my_role, v_my_status
  from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = v_uid and deleted_at is null
  order by (status = 'active') desc limit 1;
  if not v_is_owner and v_my_role is null and v_mode <> 'open'
     and not iam.has_org_access(v_scope.organization_id) then
    perform platform.refuse_not_found(format('class %s not found', p_class));
  end if;
  select count(*) filter (where status = 'active' and role = 'member'),
         count(*) filter (where status = 'pending')
    into v_member_count, v_pending_count
  from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id and deleted_at is null;
  return jsonb_build_object(
    'class_id', v_scope.id, 'name', v_scope.name, 'description', v_scope.description,
    'slug', v_scope.slug, 'organization_id', v_scope.organization_id,
    'access_mode', v_mode, 'settings', v_scope.settings, 'is_owner', v_is_owner,
    'my_role', case when v_is_owner then 'owner' else v_my_role end,
    'my_status', case when v_is_owner then 'active' else v_my_status end,
    'member_count', coalesce(v_member_count, 0),
    'pending_count', case when v_is_owner then coalesce(v_pending_count, 0) else null end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_guardian_set_age_band(p_student_user_id uuid, p_band text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'users', 'education', 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_old text;
  v_found boolean := false;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_band is null or p_band not in ('under_13', '13_17', 'adult') then
    raise exception 'Invalid age band: %', coalesce(p_band, '(null)') using errcode = '22023';
  end if;

  -- An ACTIVE link is not enough: only a guardian who completed a COPPA
  -- verifiable-consent method may move a child out of under_13. This is the
  -- same bar edu_coppa_gate uses to unblock AI.
  if not exists (
    select 1 from education.guardian_link gl
    where gl.guardian_user_id = v_uid
      and gl.student_user_id = p_student_user_id
      and gl.status = 'active'
      and gl.verified_at is not null
  ) then
    raise exception
      'not authorized: only a verified parent or guardian can change this account''s age band'
      using errcode = '42501';
  end if;

  select age_band, true into v_old, v_found from users.profiles where id = p_student_user_id;
  if not v_found then
    perform platform.refuse_not_found('No profile for that account');
  end if;

  perform set_config('app.age_band_rpc_guard', 'on', true);
  update users.profiles set age_band = p_band, updated_at = now() where id = p_student_user_id;
  perform set_config('app.age_band_rpc_guard', 'off', true);

  insert into education.data_rights_event (user_id, action, detail)
  values (
    p_student_user_id,
    'age_band_change',
    jsonb_build_object(
      'old_band', v_old,
      'new_band', p_band,
      'via', 'edu_guardian_set_age_band',
      'guardian_user_id', v_uid,
      'review_signal', false
    )
  );

  return jsonb_build_object('status', 'ok', 'age_band', p_band, 'reason', 'set_by_guardian');
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_restore_study_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'education', 'public', 'pg_temp'
AS $function$
declare
  v_uid    uuid := auth.uid();
  v_event  education.data_rights_event;
  v_at     timestamptz;
  v_counts jsonb := '{}'::jsonb;
  v_tbl    text;
  v_n      int;
  v_tables text[] := array[
    'study_session','study_attempt','item_mastery','study_goal','study_plan',
    'study_plan_day','study_plan_block','study_media','assessment','assessment_item',
    'assessment_result','fc_set','fc_card','fc_detail','learn_doc','quiz_sessions'
  ];
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_event from education.data_rights_event
   where user_id = v_uid and action = 'delete'
   order by created_at desc limit 1;

  if v_event.id is null then
    perform platform.refuse_not_found('No delete to restore');
  end if;

  v_at := (v_event.detail->>'deleted_at')::timestamptz;
  if now() > (v_event.detail->>'restore_until')::timestamptz then
    raise exception 'The restore window for that deletion has closed' using errcode = 'P0001';
  end if;

  foreach v_tbl in array v_tables loop
    execute format(
      'update education.%I set deleted_at = null where created_by = $1 and deleted_at = $2',
      v_tbl
    ) using v_uid, v_at;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object(v_tbl, v_n);
  end loop;

  insert into education.data_rights_event (user_id, action, detail)
  values (v_uid, 'restore', jsonb_build_object('restored_from', v_at, 'counts', v_counts));

  return jsonb_build_object('restored_from', v_at, 'counts', v_counts);
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_verify_content(p_resource_type text, p_resource_id uuid, p_verified boolean DEFAULT true, p_note text DEFAULT NULL::text)
 RETURNS education.content_certification
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'education'
AS $function$
declare
  v_row education.content_certification;
  v_uid uuid := auth.uid();
begin
  if not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update education.content_certification
     set human_verified_at = case when p_verified then now() else null end,
         human_verified_by = case when p_verified then v_uid else null end,
         note = coalesce(p_note, note)
   where resource_type = p_resource_type
     and resource_id = p_resource_id
  returning * into v_row;

  if not found then
    perform platform.refuse_not_found(format('no certification row for %s %s', p_resource_type, p_resource_id));
  end if;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.esign_campaign_enroll(p_campaign_id uuid, p_members jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare c esign.campaign%rowtype; m jsonb; v_added int := 0; v_existing int := 0; v_max int; v_total int;
begin
  select * into c from esign.campaign where id = p_campaign_id;
  if not found then
    perform platform.refuse_not_found(format('esign_campaign_enroll: campaign %s does not exist', p_campaign_id));
  end if;
  if c.status = 'closed' then
    return jsonb_build_object('granted', false, 'reason', 'campaign_closed');
  end if;
  v_max := (esign.config_resolve(c.organization_id,'esign.campaign.max_audience'))::int;

  perform esign._arm();
  for m in select * from jsonb_array_elements(coalesce(p_members,'[]'::jsonb)) loop
    if exists (select 1 from esign.campaign_member
                where campaign_id = p_campaign_id and lower(email) = lower(m ->> 'email')) then
      v_existing := v_existing + 1;   -- untouched: their state, envelope and evidence survive
      continue;
    end if;
    select count(*) into v_total from esign.campaign_member where campaign_id = p_campaign_id;
    if v_total >= v_max then
      perform esign._disarm();
      return jsonb_build_object('granted', false, 'reason', 'max_audience_exceeded',
                                'max_audience', v_max, 'enrolled', v_added, 'unchanged', v_existing);
    end if;
    insert into esign.campaign_member
      (organization_id, campaign_id, subject_ref_type, subject_ref_id, full_name, email,
       member_user_id, status)
    values (c.organization_id, p_campaign_id, nullif(m -> 'subject_ref' ->> 'type',''),
            nullif(m -> 'subject_ref' ->> 'id','')::uuid, m ->> 'full_name', lower(m ->> 'email'),
            nullif(m ->> 'user_id','')::uuid, 'pending');
    v_added := v_added + 1;
  end loop;

  update esign.campaign
     set member_count = (select count(*) from esign.campaign_member where campaign_id = p_campaign_id),
         status = case when status = 'draft' then 'resolving' else status end
   where id = p_campaign_id;
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'enrolled', v_added, 'unchanged', v_existing,
                            'member_count', (select member_count from esign.campaign where id = p_campaign_id));
end $function$;

CREATE OR REPLACE FUNCTION public.esign_campaign_export(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare c esign.campaign%rowtype;
begin
  select * into c from esign.campaign where id = p_campaign_id;
  if not found then
    perform platform.refuse_not_found(format('esign_campaign_export: campaign %s does not exist', p_campaign_id));
  end if;
  if not esign._may_manage_campaign(c.id, 'viewer') then
    return jsonb_build_object('granted', false, 'reason', 'no_access');
  end if;
  return jsonb_build_object(
    'granted', true, 'campaign_id', c.id, 'title', c.title,
    'document', c.document_source, 'config_snapshot', c.config_snapshot,
    'closed_at', c.closed_at, 'close_reason', c.close_reason,
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'name', m.full_name, 'email', m.email, 'state', m.status,
        'last_state_at', m.last_state_at, 'failure_reason', m.failure_reason,
        'envelope_id', m.envelope_id,
        'signed_at', (select s.signed_at from esign.envelope_signer s where s.envelope_id = m.envelope_id limit 1),
        'certificate_id', (select e.certificate_id from esign.envelope e where e.id = m.envelope_id),
        'document_hash', (select d.content_hash from esign.envelope_document d where d.envelope_id = m.envelope_id limit 1))
      order by m.full_name)
      from esign.campaign_member m where m.campaign_id = p_campaign_id), '[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.esign_campaign_generate(p_campaign_id uuid, p_frozen jsonb, p_batch_size integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare c esign.campaign%rowtype; r record; v_batch int; v_made int := 0; v_failed int := 0;
        v_env jsonb; v_send jsonb; v_doc uuid; v_frozen jsonb; v_batch_no int;
begin
  select * into c from esign.campaign where id = p_campaign_id;
  if not found then
    perform platform.refuse_not_found(format('esign_campaign_generate: campaign %s does not exist', p_campaign_id));
  end if;
  if c.status = 'closed' then
    return jsonb_build_object('granted', false, 'reason', 'campaign_closed');
  end if;
  if jsonb_typeof(p_frozen) <> 'object' or (p_frozen ->> 'content_hash') is null then
    return jsonb_build_object('granted', false, 'reason', 'no_frozen_artifact',
      'detail', 'a campaign freezes ONE rendered document and every member signs that same artifact (§3.4)');
  end if;
  if c.document_source ? 'content_hash'
     and (c.document_source ->> 'content_hash') is distinct from (p_frozen ->> 'content_hash') then
    return jsonb_build_object('granted', false, 'reason', 'document_version_changed',
      'detail', 'a campaign means "these people acknowledged THIS text" — a revision is a NEW campaign (§3.4)',
      'frozen_hash', c.document_source -> 'content_hash');
  end if;

  v_batch := coalesce(p_batch_size, (esign.config_resolve(c.organization_id,'esign.campaign.batch_size'))::int);
  v_batch_no := coalesce((select max(batch_no) from esign.campaign_member where campaign_id = p_campaign_id), 0) + 1;

  perform esign._arm();
  update esign.campaign
     set document_source = c.document_source || p_frozen,
         status = 'generating',
         opened_at = coalesce(opened_at, now())
   where id = p_campaign_id;

  for r in select * from esign.campaign_member
            where campaign_id = p_campaign_id and status = 'pending'
            order by enrolled_at limit v_batch loop
    v_env := public.esign_create_envelope(
      p_organization_id => c.organization_id, p_consumer_key => c.consumer_key,
      p_title => c.title,
      p_documents => jsonb_build_array(jsonb_build_object(
        'name', coalesce(c.document_source ->> 'name', c.title),
        'source_kind', coalesce(c.document_source ->> 'source_kind','platform_document'),
        'document_id', c.document_source ->> 'document_id',
        'document_version', c.document_source ->> 'document_version',
        'mime_type', c.document_source ->> 'mime_type')),
      p_signers => jsonb_build_array(jsonb_build_object(
        'position', 1, 'role', 'signer',
        'actor_type', case when r.member_user_id is null then 'external' else 'internal_user' end,
        'user_id', r.member_user_id, 'full_name', r.full_name, 'email', r.email,
        'subject_ref', case when r.subject_ref_id is null then null
                            else jsonb_build_object('type', r.subject_ref_type, 'id', r.subject_ref_id) end)),
      p_envelope_type => (select slug from platform.categories where id = c.category_id),
      p_sensitivity => c.sensitivity, p_signing_order => 'parallel',
      p_message => c.message, p_expires_in_days => greatest(1, extract(day from c.expires_at - now())::int));

    if not coalesce((v_env ->> 'granted')::boolean, false) then
      v_failed := v_failed + 1;
      update esign.campaign_member
         set status = 'failed', failure_reason = v_env ->> 'reason', last_state_at = now(),
             batch_no = v_batch_no
       where id = r.id;
      continue;
    end if;

    select id into v_doc from esign.envelope_document
     where envelope_id = (v_env ->> 'envelope_id')::uuid limit 1;
    v_frozen := jsonb_build_array(jsonb_build_object(
      'document_id', v_doc,
      'content_file_id', p_frozen ->> 'content_file_id',
      'content_file_version', p_frozen ->> 'content_file_version',
      'content_hash', p_frozen ->> 'content_hash',
      'byte_size', p_frozen ->> 'byte_size',
      'page_count', p_frozen ->> 'page_count',
      'mime_type', p_frozen ->> 'mime_type'));
    v_send := public.esign_send_envelope((v_env ->> 'envelope_id')::uuid, v_frozen);

    if coalesce((v_send ->> 'granted')::boolean, false) then
      v_made := v_made + 1;
      update esign.campaign_member
         set status = 'notified', envelope_id = (v_env ->> 'envelope_id')::uuid,
             last_state_at = now(), batch_no = v_batch_no, failure_reason = null
       where id = r.id;
    else
      v_failed := v_failed + 1;
      update esign.campaign_member
         set status = 'failed', envelope_id = (v_env ->> 'envelope_id')::uuid,
             failure_reason = v_send ->> 'reason', last_state_at = now(), batch_no = v_batch_no
       where id = r.id;
    end if;
  end loop;

  update esign.campaign
     set status = case when exists (select 1 from esign.campaign_member
                                     where campaign_id = p_campaign_id and status = 'pending')
                       then 'generating' else 'open' end,
         failed_count = (select count(*) from esign.campaign_member
                          where campaign_id = p_campaign_id and status = 'failed')
   where id = p_campaign_id;
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'batch_no', v_batch_no, 'batch_size', v_batch,
                            'generated', v_made, 'failed', v_failed,
                            'remaining', (select count(*) from esign.campaign_member
                                           where campaign_id = p_campaign_id and status = 'pending'));
end $function$;

CREATE OR REPLACE FUNCTION public.esign_campaign_progress(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare c esign.campaign%rowtype;
begin
  select * into c from esign.campaign where id = p_campaign_id;
  if not found then
    perform platform.refuse_not_found(format('esign_campaign_progress: campaign %s does not exist', p_campaign_id));
  end if;
  if not esign._may_manage_campaign(c.id, 'viewer') then
    return jsonb_build_object('granted', false, 'reason', 'no_access');
  end if;

  -- the member's live state is its envelope's, not a stale copy
  perform esign._arm();
  update esign.campaign_member m
     set status = case e.status
                    when 'completed' then 'signed'
                    when 'declined'  then 'declined'
                    when 'expired'   then 'expired'
                    else m.status end,
         last_state_at = now()
    from esign.envelope e
   where m.campaign_id = p_campaign_id and m.envelope_id = e.id
     and m.status not in ('failed')
     and m.status is distinct from case e.status when 'completed' then 'signed'
                                                 when 'declined'  then 'declined'
                                                 when 'expired'   then 'expired'
                                                 else m.status end;
  update esign.campaign
     set signed_count   = (select count(*) from esign.campaign_member where campaign_id = p_campaign_id and status = 'signed'),
         declined_count = (select count(*) from esign.campaign_member where campaign_id = p_campaign_id and status = 'declined'),
         expired_count  = (select count(*) from esign.campaign_member where campaign_id = p_campaign_id and status = 'expired'),
         failed_count   = (select count(*) from esign.campaign_member where campaign_id = p_campaign_id and status = 'failed'),
         member_count   = (select count(*) from esign.campaign_member where campaign_id = p_campaign_id)
   where id = p_campaign_id;
  perform esign._disarm();
  select * into c from esign.campaign where id = p_campaign_id;

  return jsonb_build_object(
    'granted', true, 'campaign_id', c.id, 'title', c.title, 'status', c.status,
    'rollup', jsonb_build_object(
      'members', c.member_count, 'signed', c.signed_count, 'declined', c.declined_count,
      'expired', c.expired_count, 'failed', c.failed_count,
      'outstanding', c.member_count - c.signed_count - c.declined_count - c.expired_count - c.failed_count),
    'by_status', coalesce((select jsonb_object_agg(status, n)
                             from (select status, count(*) n from esign.campaign_member
                                    where campaign_id = p_campaign_id group by status) x), '{}'::jsonb),
    -- §3.4: the outstanding list carries per-person last-known state AND failure reason. A campaign
    -- never blocks on stragglers and never silently drops them.
    'outstanding_list', coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', m.id, 'name', m.full_name, 'email', m.email,
               'last_known_state', m.status, 'last_state_at', m.last_state_at,
               'failure_reason', m.failure_reason, 'envelope_id', m.envelope_id) order by m.full_name)
        from esign.campaign_member m
       where m.campaign_id = p_campaign_id and m.status not in ('signed')), '[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.esign_envelope_state(p_envelope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    perform platform.refuse_not_found(format('esign_envelope_state: envelope %s does not exist', p_envelope_id));
  end if;
  if not esign._may_manage(e.id, 'viewer') then
    return jsonb_build_object('granted', false, 'reason', 'no_access');
  end if;
  return jsonb_build_object(
    'granted', true,
    'envelope', to_jsonb(e) - 'config_snapshot',
    'config_snapshot', e.config_snapshot,
    'documents', coalesce((select jsonb_agg(to_jsonb(d) order by d.position)
                             from esign.envelope_document d where d.envelope_id = e.id), '[]'::jsonb),
    'signers',   coalesce((select jsonb_agg(to_jsonb(s) - 'signature_payload_hash' order by s.position)
                             from esign.envelope_signer s where s.envelope_id = e.id), '[]'::jsonb),
    'events',    coalesce((select jsonb_agg(to_jsonb(v) order by v.occurred_at)
                             from esign.envelope_event v where v.envelope_id = e.id), '[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.esign_mint_signer_token(p_signer_id uuid, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_scope jsonb; v_mint jsonb;
        v_factor text; v_email text;
begin
  select * into s from esign.envelope_signer where id = p_signer_id;
  if not found then
    perform platform.refuse_not_found(format('esign_mint_signer_token: signer %s does not exist', p_signer_id));
  end if;
  select * into e from esign.envelope where id = s.envelope_id;

  -- THE PERMISSION CHECK — the whole reason a per-purpose wrapper exists (§5.4 issuance side).
  if auth.uid() is not null and not esign._may_manage(e.id, 'editor') then
    return jsonb_build_object('granted', false, 'reason', 'no_permission_on_envelope');
  end if;
  if s.actor_type <> 'external' then
    return jsonb_build_object('granted', false, 'reason', 'internal_signer_uses_session',
      'detail', 'an internal signer authenticates with their platform session at /sign/e/{envelopeId} (§6.0 U-03)');
  end if;
  if e.status not in ('draft','sent','in_progress') then
    return jsonb_build_object('granted', false, 'reason', 'envelope_' || e.status);
  end if;

  v_email  := lower(coalesce(p_email, s.email));
  v_factor := coalesce(s.verification_factor,
                       trim(both '"' from (e.config_snapshot -> 'verification_factor')::text),
                       'email_code');

  -- §5.3: no wildcards; every grant names a concrete registered resource plus an id or a parent_id,
  -- and every action is one the registry declares for this purpose.
  v_scope := jsonb_build_object(
    'consumer_key','esign.signer',
    'subject', jsonb_build_object('type','esign_envelope_signer','id', s.id),
    'grants', jsonb_build_array(
      jsonb_build_object('resource','esign_envelope',          'id', e.id,  'actions', jsonb_build_array('read')),
      jsonb_build_object('resource','esign_envelope_document', 'parent_id', e.id, 'actions', jsonb_build_array('read','download')),
      jsonb_build_object('resource','esign_envelope_signer',   'id', s.id, 'actions', jsonb_build_array('read','consent','sign','decline','delegate'))),
    'constraints', jsonb_build_object('expires_at', e.expires_at, 'max_uses', null, 'single_session', true));

  v_mint := platform.mint_outsider_token(
    p_consumer_key => 'esign.signer', p_subject_type => 'esign_envelope_signer',
    p_subject_id => s.id, p_scope => v_scope, p_organization_id => e.organization_id,
    p_recipient => jsonb_build_object('name', s.full_name, 'email', v_email, 'verification_target', v_email),
    p_overrides => jsonb_build_object('verification_factor', v_factor, 'expires_at', e.expires_at));

  perform esign._arm();
  update esign.envelope_signer
     set actor_token_id = (v_mint ->> 'actor_token_id')::uuid,
         email = v_email,
         verification_factor = v_factor,
         auth_method = case v_factor when 'none' then 'token_link'
                                     when 'email_code' then 'token_link_email_code'
                                     when 'sms_code' then 'token_link_sms_code'
                                     else 'token_link_access_code' end
   where id = s.id;
  perform esign._disarm();

  return v_mint || jsonb_build_object('granted', true, 'signer_id', s.id, 'envelope_id', e.id);
end $function$;

CREATE OR REPLACE FUNCTION public.esign_provider_dispatch(p_envelope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype; b record; v_ref uuid;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    perform platform.refuse_not_found(format('esign_provider_dispatch: envelope %s does not exist', p_envelope_id));
  end if;
  select pb.*, p.provider_key, p.adapter into b
    from esign.provider_binding pb join esign.provider p on p.id = pb.provider_id
   where pb.organization_id = e.organization_id and pb.is_active and pb.deleted_at is null
     and p.is_active and p.deleted_at is null
     and (pb.category_id is null or pb.category_id = e.category_id)
     and (pb.consumer_key is null or pb.consumer_key = e.consumer_key)
   limit 1;
  if not found then
    -- native mode: our signing surface, our evidence, our certificate.
    return jsonb_build_object('granted', true, 'mode', 'native');
  end if;

  perform esign._arm();
  insert into esign.envelope_external_ref
    (organization_id, envelope_id, provider_key, external_status, raw_payload)
  values (e.organization_id, p_envelope_id, b.provider_key, 'dispatched',
          jsonb_build_object('adapter', b.adapter))
  returning id into v_ref;
  perform esign._event(p_envelope_id, 'provider_dispatched', 'integration',
                       p_actor_label => b.provider_key,
                       p_payload => jsonb_build_object('provider_key', b.provider_key, 'adapter', b.adapter));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'mode', 'provider', 'provider_key', b.provider_key,
                            'external_ref_id', v_ref);
end $function$;

CREATE OR REPLACE FUNCTION public.esign_provider_ingest(p_envelope_id uuid, p_provider_key text, p_external_envelope_id text, p_external_status text, p_provider_event_id text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb, p_observed jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype; v_mapped text; v_done jsonb;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    perform platform.refuse_not_found(format('esign_provider_ingest: envelope %s does not exist', p_envelope_id));
  end if;

  perform esign._arm();
  update esign.envelope_external_ref
     set external_envelope_id = coalesce(p_external_envelope_id, external_envelope_id),
         external_status = p_external_status, last_sync_at = now(),
         raw_payload = raw_payload || coalesce(p_payload,'{}'::jsonb)
   where envelope_id = p_envelope_id and provider_key = p_provider_key;

  v_mapped := case lower(p_external_status)
                when 'completed' then 'completed'
                when 'signed'    then 'completed'
                when 'declined'  then 'declined'
                when 'voided'    then 'voided'
                when 'expired'   then 'expired'
                else null end;

  perform esign._event(p_envelope_id, 'provider_status_received', 'integration',
                       p_actor_label => p_provider_key, p_provider_event_id => p_provider_event_id,
                       p_payload => jsonb_build_object('external_status', p_external_status,
                                                       'mapped_status', v_mapped,
                                                       'external_envelope_id', p_external_envelope_id));
  if v_mapped = 'completed' then
    -- our hash over the RETURNED artifact, and our certificate over our own payload
    update esign.envelope_signer set status = 'signed', signed_at = coalesce(signed_at, now()),
                                     verification_passed = true
     where envelope_id = p_envelope_id and is_required and role in ('signer','approver')
       and status <> 'signed';
    perform esign._event(p_envelope_id, 'provider_completed', 'integration',
                         p_actor_label => p_provider_key, p_provider_event_id => p_provider_event_id,
                         p_payload => coalesce(p_payload,'{}'::jsonb));
    v_done := esign._maybe_complete(p_envelope_id);
  elsif v_mapped is not null and v_mapped <> e.status then
    update esign.envelope set status = v_mapped,
                              declined_at = case when v_mapped = 'declined' then now() else declined_at end,
                              voided_at   = case when v_mapped = 'voided'   then now() else voided_at end,
                              void_reason = case when v_mapped = 'voided'
                                                 then coalesce(void_reason,'voided at the provider') else void_reason end
     where id = p_envelope_id;
  end if;
  perform esign._disarm();

  return jsonb_build_object('granted', true, 'external_status', p_external_status,
                            'mapped_status', v_mapped, 'completion', v_done,
                            'detail', 'provider status is mirrored and mapped, never adopted as our state (§6.3)');
end $function$;

CREATE OR REPLACE FUNCTION public.esign_remind(p_envelope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype; v_max int; v_n int; v_capped int;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    perform platform.refuse_not_found(format('esign_remind: envelope %s does not exist', p_envelope_id));
  end if;
  if e.status not in ('sent','in_progress') then
    return jsonb_build_object('granted', false, 'reason', 'envelope_' || e.status);
  end if;
  -- §7 / AD-11: the cadence and the cap come from THIS envelope's frozen snapshot, never from
  -- today's org configuration.
  v_max := coalesce((e.config_snapshot ->> 'reminder_max_count')::int, 3);
  select count(*) into v_capped from esign.envelope_signer
   where envelope_id = p_envelope_id and reminder_count >= v_max
     and status not in ('signed','declined','delegated','expired');

  perform esign._arm();
  v_n := esign._notify_actionable_capped(p_envelope_id, v_max);
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'reminded', v_n, 'capped_out', v_capped,
                            'max_reminders', v_max);
end $function$;

CREATE OR REPLACE FUNCTION public.esign_resend_signer(p_signer_id uuid, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_new_addr boolean; v_tok jsonb;
        v_link text; v_old uuid;
begin
  select * into s from esign.envelope_signer where id = p_signer_id;
  if not found then
    perform platform.refuse_not_found(format('esign_resend_signer: signer %s does not exist', p_signer_id));
  end if;
  select * into e from esign.envelope where id = s.envelope_id;
  if e.status not in ('sent','in_progress') then
    return jsonb_build_object('granted', false, 'reason', 'envelope_' || e.status);
  end if;
  if not (esign._can_act(s.id) ->> 'can_act')::boolean then
    return jsonb_build_object('granted', false, 'reason', esign._can_act(s.id) ->> 'reason');
  end if;

  v_new_addr := p_email is not null and lower(p_email) is distinct from s.email;
  perform esign._arm();
  if s.actor_type = 'external' and (v_new_addr or s.actor_token_id is null) then
    -- §3.5: the addressee changed, so the old token dies and a new one is minted — the evidence
    -- must show WHICH ADDRESS received WHICH LINK. Same address ⇒ the existing token is reused, so
    -- an already-opened link keeps working.
    v_old := s.actor_token_id;
    if v_old is not null then
      perform platform.revoke_outsider_token(v_old, 'signer email corrected on resend');
      update esign.envelope_signer set actor_token_id = null where id = s.id;
    end if;
    v_tok := public.esign_mint_signer_token(s.id, coalesce(p_email, s.email));
    if not coalesce((v_tok ->> 'granted')::boolean, false) then
      perform esign._disarm();
      return v_tok;
    end if;
    v_link := '/x/sign#t=' || (v_tok ->> 'secret');
  end if;

  perform esign._notify(s.envelope_id, 'esign.signature_requested', s.id,
                        p_to_user => s.signer_user_id,
                        p_to_address => lower(coalesce(p_email, s.email)),
                        p_actor_token_id => coalesce((v_tok ->> 'actor_token_id')::uuid, s.actor_token_id),
                        p_subject => coalesce(e.title,'Signature requested'), p_deep_link => v_link);
  update esign.envelope_signer
     set last_notified_at = now(), notify_attempts = notify_attempts + 1,
         status = case when status = 'delivery_failed' then 'notified' else status end,
         delivery_error = null
   where id = s.id;
  perform esign._event(s.envelope_id, 'resent', esign._requester_actor_type(e.consumer_key),
                       p_signer_id => s.id, p_actor_user_id => auth.uid(),
                       p_payload => jsonb_build_object('address_changed', v_new_addr,
                                                       'token_reissued', v_tok is not null,
                                                       'revoked_token_id', v_old));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'signer_id', s.id, 'address_changed', v_new_addr,
                            'token_reissued', v_tok is not null);
end $function$;

CREATE OR REPLACE FUNCTION public.esign_send_envelope(p_envelope_id uuid, p_frozen jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype; f jsonb; v_doc esign.envelope_document%rowtype;
        v_unfrozen int; v_notified int := 0;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    perform platform.refuse_not_found(format('esign_send_envelope: envelope %s does not exist', p_envelope_id));
  end if;
  if e.status <> 'draft' then
    return jsonb_build_object('granted', false, 'reason', 'not_draft', 'status', e.status);
  end if;
  if jsonb_typeof(p_frozen) <> 'array' or jsonb_array_length(p_frozen) = 0 then
    return jsonb_build_object('granted', false, 'reason', 'no_frozen_artifacts',
      'detail', 'send freezes the rendered bytes; the renderer supplies file id, version, hash, size (RECORDED DECISION 1)');
  end if;

  perform esign._arm();
  for f in select * from jsonb_array_elements(p_frozen) loop
    select * into v_doc from esign.envelope_document
     where id = (f ->> 'document_id')::uuid and envelope_id = p_envelope_id;
    if not found then
      perform esign._disarm();
      return jsonb_build_object('granted', false, 'reason', 'unknown_document',
                                'document_id', f ->> 'document_id');
    end if;
    if (f ->> 'content_hash') is null or length(f ->> 'content_hash') <> 64 then
      perform esign._disarm();
      return jsonb_build_object('granted', false, 'reason', 'bad_content_hash',
                                'document_id', f ->> 'document_id',
                                'detail', 'lowercase hex SHA-256 of the exact bytes presented to signers');
    end if;
    update esign.envelope_document
       set content_file_id      = (f ->> 'content_file_id')::uuid,
           content_file_version = coalesce((f ->> 'content_file_version')::int, 1),
           content_hash         = lower(f ->> 'content_hash'),
           hash_algorithm       = coalesce(f ->> 'hash_algorithm', 'sha-256'),
           byte_size            = (f ->> 'byte_size')::bigint,
           page_count           = (f ->> 'page_count')::int,
           mime_type            = coalesce(f ->> 'mime_type', v_doc.mime_type),
           is_frozen            = true,
           frozen_at            = now()
     where id = v_doc.id;
    perform esign._event(p_envelope_id, 'document_frozen', 'automation', p_document_id => v_doc.id,
                         p_payload => jsonb_build_object('document_hash', lower(f ->> 'content_hash'),
                                                         'hash_algorithm', coalesce(f ->> 'hash_algorithm','sha-256'),
                                                         'byte_size', f -> 'byte_size'));
  end loop;

  select count(*) into v_unfrozen from esign.envelope_document
   where envelope_id = p_envelope_id and not is_frozen;
  if v_unfrozen > 0 then
    perform esign._disarm();
    return jsonb_build_object('granted', false, 'reason', 'documents_not_all_frozen',
                              'unfrozen', v_unfrozen,
                              'detail', 'signers never see a live-rendered template (§2.3)');
  end if;

  update esign.envelope set status = 'sent', sent_at = now() where id = p_envelope_id;
  perform esign._event(p_envelope_id, 'sent', esign._requester_actor_type(e.consumer_key),
                       p_actor_user_id => auth.uid(), p_actor_label => 'requester');
  v_notified := esign._notify_actionable(p_envelope_id, 'esign.signature_requested');
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'envelope_id', p_envelope_id, 'status', 'sent',
                            'notified', v_notified);
end $function$;

CREATE OR REPLACE FUNCTION public.esign_verify_envelope(p_envelope_id uuid, p_observed jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype; c esign.envelope_certificate%rowtype; k esign.signing_key%rowtype;
        d record; o jsonb; v_docs jsonb := '[]'::jsonb; v_mismatch int := 0; v_checked int := 0;
        v_recomputed text; v_cert jsonb; v_sig_ok boolean;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    perform platform.refuse_not_found(format('esign_verify_envelope: envelope %s does not exist', p_envelope_id));
  end if;
  if not esign._may_manage(e.id, 'viewer') then
    return jsonb_build_object('granted', false, 'reason', 'no_access');
  end if;

  perform esign._arm();
  for d in select * from esign.envelope_document where envelope_id = p_envelope_id order by position loop
    o := null;
    select el into o from jsonb_array_elements(coalesce(p_observed,'[]'::jsonb)) as el
     where el ->> 'document_id' = d.id::text limit 1;
    if o is null then
      v_docs := v_docs || jsonb_build_array(jsonb_build_object(
        'document_id', d.id, 'name', d.name, 'result', 'not_observed',
        'expected_hash', d.content_hash,
        'detail', 'no observed hash was supplied for this document — an unchecked document is reported as unchecked, never as matching'));
      continue;
    end if;
    v_checked := v_checked + 1;
    if lower(o ->> 'content_hash') is not distinct from d.content_hash then
      v_docs := v_docs || jsonb_build_array(jsonb_build_object(
        'document_id', d.id, 'name', d.name, 'result', 'match', 'expected_hash', d.content_hash));
      perform esign._event(p_envelope_id, 'hash_verified', 'automation', p_document_id => d.id,
                           p_payload => jsonb_build_object('document_hash', d.content_hash));
    else
      v_mismatch := v_mismatch + 1;
      v_docs := v_docs || jsonb_build_array(jsonb_build_object(
        'document_id', d.id, 'name', d.name, 'result', 'MISMATCH',
        'expected_hash', d.content_hash, 'actual_hash', lower(o ->> 'content_hash')));
      perform esign._event(p_envelope_id, 'hash_mismatch', 'automation', p_document_id => d.id,
                           p_payload => jsonb_build_object('expected_hash', d.content_hash,
                                                           'actual_hash', lower(o ->> 'content_hash')));
    end if;
  end loop;

  -- §8.2 case 10: the certificate is checked against itself, both ways.
  select * into c from esign.envelope_certificate where envelope_id = p_envelope_id;
  if c.id is not null then
    v_recomputed := encode(sha256(convert_to(c.payload::text,'UTF8')), 'hex');
    select * into k from esign.signing_key where key_id = c.key_id;
    v_sig_ok := case when c.signature = '' or k.public_key is null then null
                     else pgsodium.crypto_sign_verify_detached(
                            decode(c.signature,'base64'), convert_to(c.payload_hash,'UTF8'),
                            decode(k.public_key,'base64')) end;
    v_cert := jsonb_build_object(
      'certificate_id', c.id, 'key_id', c.key_id,
      'stored_payload_hash', c.payload_hash, 'recomputed_payload_hash', v_recomputed,
      'payload_hash_matches', v_recomputed = c.payload_hash,
      'signature_verifies', v_sig_ok);
  else
    v_cert := jsonb_build_object('certificate_id', null, 'detail', 'no certificate — the envelope has not completed');
  end if;
  perform esign._disarm();

  return jsonb_build_object(
    'granted', true, 'envelope_id', p_envelope_id, 'status', e.status,
    'documents_checked', v_checked, 'documents_mismatched', v_mismatch,
    'intact', v_mismatch = 0
             and coalesce((v_cert ->> 'payload_hash_matches')::boolean, true)
             and coalesce((v_cert ->> 'signature_verifies')::boolean, true),
    'documents', v_docs, 'certificate', v_cert);
end $function$;

CREATE OR REPLACE FUNCTION public.esign_void_envelope(p_envelope_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype; v_revoked int;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    perform platform.refuse_not_found(format('esign_void_envelope: envelope %s does not exist', p_envelope_id));
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    return jsonb_build_object('granted', false, 'reason', 'reason_required');
  end if;
  if e.status = 'completed' then
    -- §3.5: voiding a completed envelope is impossible; the correction path is a NEW envelope with
    -- a superseding reference.
    return jsonb_build_object('granted', false, 'reason', 'cannot_void_completed',
      'detail', 'issue a new envelope carrying superseded_by_envelope_id');
  end if;
  if e.status in ('declined','voided','expired') then
    return jsonb_build_object('granted', false, 'reason', 'envelope_' || e.status);
  end if;

  perform esign._arm();
  update esign.envelope set status = 'voided', voided_at = now(), void_reason = p_reason
   where id = p_envelope_id;
  v_revoked := esign._revoke_open_tokens(p_envelope_id, 'envelope voided');
  perform esign._event(p_envelope_id, 'voided', esign._requester_actor_type(e.consumer_key),
                       p_actor_user_id => auth.uid(),
                       p_actor_label => 'requester',
                       p_payload => jsonb_build_object('reason', p_reason, 'tokens_revoked', v_revoked));
  perform esign._notify(p_envelope_id, 'esign.voided',
                        p_to_user => e.created_by, p_to_address => null,
                        p_subject => 'Signature request voided: ' || coalesce(e.title,''),
                        p_payload => jsonb_build_object('reason', p_reason));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'envelope_id', p_envelope_id, 'status', 'voided',
                            'tokens_revoked', v_revoked);
end $function$;

CREATE OR REPLACE FUNCTION public.guardian_confirm_verification(p_link_id uuid, p_method text, p_ref text)
 RETURNS education.guardian_link
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'education', 'public', 'pg_temp'
AS $function$
declare
  v_row               education.guardian_link;
  v_prior_verified_at timestamptz;
  v_prior_method      text;
begin
  if p_method is null or p_method not in ('card', 'signed_form', 'vendor_id') then
    raise exception 'Invalid consent method: %', coalesce(p_method, '(null)') using errcode = '22023';
  end if;

  select verified_at, consent_method into v_prior_verified_at, v_prior_method
  from education.guardian_link where id = p_link_id;

  update education.guardian_link
    set verified_at      = now(),
        consent_method   = p_method,
        verification_ref = p_ref,
        updated_at       = now()
  where id = p_link_id
    and status = 'active'
  returning * into v_row;
  if v_row.id is null then
    perform platform.refuse_not_found(format('No active guardian link %s to verify', p_link_id));
  end if;

  insert into education.data_rights_event (user_id, action, detail)
  values (
    v_row.student_user_id,
    'guardian_consent_verified',
    jsonb_build_object(
      'link_id',            v_row.id,
      'guardian_user_id',   v_row.guardian_user_id,
      'student_user_id',    v_row.student_user_id,
      'method',             p_method,
      'verification_ref',   p_ref,
      'verified_at',        v_row.verified_at,
      'actor',              (select auth.uid()),
      'actor_db_role',      current_user,
      'via',                'guardian_confirm_verification',
      'prior_verified_at',  v_prior_verified_at,
      'prior_method',       v_prior_method,
      're_verification',    v_prior_verified_at is not null
    )
  );

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardian_respond(p_guardian_user_id uuid, p_approve boolean)
 RETURNS education.guardian_link
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'education', 'public', 'pg_temp'
AS $function$
declare v_row education.guardian_link;
begin
  update education.guardian_link
    set status = case when p_approve then 'active' else 'revoked' end,
        reviewed_at = case when p_approve then now() else reviewed_at end,
        revoked_at = case when p_approve then null else now() end,
        updated_at = now()
  where student_user_id = (select auth.uid()) and guardian_user_id = p_guardian_user_id and status = 'pending'
  returning * into v_row;
  if v_row.id is null then perform platform.refuse_not_found('No pending guardian request found'); end if;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.hr_authority_delegate(p_delegation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); d hr.approval_delegation%rowtype; a hr.approval_authority%rowtype;
  v_new uuid; v_audit uuid; v_scope_kind text; v_scope_ids uuid[];
begin
  if v_uid is null then
    raise exception 'hr_authority_delegate: no authenticated caller' using errcode = '42501';
  end if;
  select * into d from hr.approval_delegation where id = p_delegation_id;
  if not found then
    perform platform.refuse_not_found(format('hr_authority_delegate: no hr.approval_delegation with id %s', p_delegation_id));
  end if;
  select * into a from hr.approval_authority where id = d.authority_id;

  -- only the DELEGATE accepts. A delegation the delegate never accepted grants nothing.
  if not (d.delegate_employment_id = any(hr.employments_of(v_uid))) then
    return hr._governance_refusal(d.organization_id, 'hr_approval_delegation', 'not_the_delegate',
      'only the named delegate may accept a delegation', d.delegate_employment_id, ARRAY[p_delegation_id]);
  end if;
  if d.state <> 'pending' then
    return hr._governance_refusal(d.organization_id, 'hr_approval_delegation', 'not_pending',
      format('this delegation is %s and can no longer be accepted', d.state),
      d.delegate_employment_id, ARRAY[p_delegation_id]);
  end if;

  perform hr.arm_write();

  -- 🚨 A RELATIVE SCOPE IS RESOLVED AT MATERIALISATION, NEVER COPIED — and a probe caught the
  -- copy. §1.3b says scope is "inherited from the delegator's row — never wider", and for an
  -- ABSOLUTE scope (org, department, location, pay_group, crew, employment_set) copying is exactly
  -- that. But `direct_reports` and `position_subtree` are relative TO THE HOLDER: copied onto the
  -- delegate they silently re-point at the DELEGATE's own reports, which is a different population
  -- and, for a delegate who manages nobody, an EMPTY one. The delegation then grants nothing and
  -- the approval stalls with no visible cause — the canonical over-tightening bug §1.3b names.
  -- So a relative scope is frozen into an explicit `employment_set` of the DELEGATOR's population
  -- as of the delegation's start. That is never wider (it is precisely the delegator's set) and it
  -- is stable for the window, which is also what makes the delegation auditable after the fact.
  v_scope_kind := a.scope_kind;
  v_scope_ids  := a.scope_employment_ids;
  if a.scope_kind in ('direct_reports','position_subtree') then
    select coalesce(array_agg(distinct em.id), '{}'::uuid[]) into v_scope_ids
      from hr.employment em
     where em.organization_id = a.organization_id and em.deleted_at is null
       and hr.population_contains(a.scope_kind, a.scope_id, em.id, d.effective_from,
                                  d.delegator_employment_id, a.scope_employment_ids);
    v_scope_kind := 'employment_set';
  end if;

  -- limits and rank are inherited or LEAST()'d — a delegation is never wider than the authority it
  -- substitutes for — and its expiry is mandatory.
  insert into hr.approval_authority
    (organization_id, holder_kind, holder_id, action_type, scope_kind, scope_id,
     scope_employment_ids, limits, rank, effective_from, effective_to, source,
     delegated_from_id, delegation_id, granted_by_user_id, reason)
  values (a.organization_id, 'employment', d.delegate_employment_id::text, a.action_type,
          v_scope_kind, case when v_scope_kind = 'employment_set' then null else a.scope_id end,
          v_scope_ids, a.limits,
          greatest(a.rank, 100), d.effective_from,
          least(d.effective_to, coalesce(a.effective_to, d.effective_to)), 'delegated',
          a.id, d.id, v_uid, d.reason)
  returning id into v_new;

  update hr.approval_delegation
     set state = 'accepted', responded_at = now(), materialized_authority_id = v_new
   where id = p_delegation_id;

  v_audit := hr._record_access_audit(
    p_organization_id => d.organization_id, p_action => 'write',
    p_target_token => 'hr_approval_authority', p_purpose => 'governance', p_basis => 'authority',
    p_granted => true, p_target_ids => ARRAY[v_new], p_sensitivity_tier => 'directory',
    p_subject_employment_id => d.delegate_employment_id, p_justification => d.reason,
    p_request_context => jsonb_build_object('delegation_id', d.id, 'delegated_from', a.id));

  return jsonb_build_object('granted', true, 'authority_id', v_new, 'delegation_id', d.id,
                            'audit_id', v_audit);
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_authority_delegation_end(p_delegation_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare v_uid uuid := auth.uid(); d hr.approval_delegation%rowtype; v_audit uuid;
begin
  if v_uid is null then
    raise exception 'hr_authority_delegation_end: no authenticated caller' using errcode = '42501';
  end if;
  select * into d from hr.approval_delegation where id = p_delegation_id;
  if not found then
    perform platform.refuse_not_found(format('hr_authority_delegation_end: no hr.approval_delegation with id %s', p_delegation_id));
  end if;

  if not (d.delegator_employment_id = any(hr.employments_of(v_uid))
          or d.delegate_employment_id = any(hr.employments_of(v_uid))
          or hr.capability(v_uid, 'authority.grant', d.delegator_employment_id)) then
    return hr._governance_refusal(d.organization_id, 'hr_approval_delegation', 'no_capability',
      'only the delegator, the delegate, or an authority.grant holder may end a delegation',
      d.delegate_employment_id, ARRAY[p_delegation_id]);
  end if;

  perform hr.arm_write();
  -- ending writes effective_to (and is_active where the end is immediate), NEVER a delete — the
  -- immutable-history rule (AD-8)
  if d.materialized_authority_id is not null then
    update hr.approval_authority
       set effective_to = least(coalesce(effective_to, current_date), current_date),
           is_active = false
     where id = d.materialized_authority_id;
  end if;
  update hr.approval_delegation
     set state = 'revoked', revoked_at = now(), revoked_reason = p_reason
   where id = p_delegation_id;

  v_audit := hr._record_access_audit(
    p_organization_id => d.organization_id, p_action => 'write',
    p_target_token => 'hr_approval_delegation', p_purpose => 'governance', p_basis => 'authority',
    p_granted => true, p_target_ids => ARRAY[p_delegation_id], p_sensitivity_tier => 'directory',
    p_subject_employment_id => d.delegate_employment_id, p_justification => p_reason,
    p_request_context => '{"op":"end"}'::jsonb);

  return jsonb_build_object('granted', true, 'delegation_id', p_delegation_id, 'audit_id', v_audit);
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_authority_delegation_request(p_authority_id uuid, p_delegate_employment_id uuid, p_effective_from date, p_effective_to date, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_kind text; v_hid text; v_holder_emp uuid;
  v_id uuid; v_audit uuid; v_horizon integer; v_depth integer; v_source text;
begin
  if v_uid is null then
    raise exception 'hr_authority_delegation_request: no authenticated caller' using errcode = '42501';
  end if;
  select aa.organization_id, aa.holder_kind, aa.holder_id, aa.source
    into v_org, v_kind, v_hid, v_source
    from hr.approval_authority aa where aa.id = p_authority_id and aa.is_active;
  if v_org is null then
    perform platform.refuse_not_found(format('hr_authority_delegation_request: no active hr.approval_authority with id %s', p_authority_id));
  end if;
  if v_kind = 'employment' then v_holder_emp := v_hid::uuid; end if;

  -- only the HOLDER hands their own authority on
  if v_holder_emp is null or not (v_holder_emp = any(hr.employments_of(v_uid))) then
    return hr._governance_refusal(v_org, 'hr_approval_delegation', 'not_the_holder',
      'only the holder of an authority may delegate it', v_holder_emp, ARRAY[p_authority_id]);
  end if;

  -- §1.3b: depth ≤ hr.approvals.delegation_max_depth, so materialising from an already-delegated
  -- row is refused (default depth 1)
  v_depth := (hr._hr_knob('hr.approvals','delegation_max_depth', v_org, null) #>> '{}')::integer;
  if v_source = 'delegated' and v_depth < 2 then
    return hr._governance_refusal(v_org, 'hr_approval_delegation', 'redelegation_too_deep',
      format('re-delegation depth exceeds hr.approvals.delegation_max_depth (%s)', v_depth),
      v_holder_emp, ARRAY[p_authority_id]);
  end if;

  -- expiry is mandatory and bounded
  v_horizon := (hr._hr_knob('hr.approvals','delegation_max_horizon_days', v_org, null) #>> '{}')::integer;
  if p_effective_to is null or p_effective_to > p_effective_from + v_horizon then
    return hr._governance_refusal(v_org, 'hr_approval_delegation', 'horizon_exceeded',
      format('a delegation must end, and no later than %s days after it starts', v_horizon),
      v_holder_emp, ARRAY[p_authority_id]);
  end if;

  -- ARGS-RULED (2026-09-21). THE DELEGATE IS EMPLOYED BY THE SAME ORGANIZATION. The holder
  -- check above establishes the CALLER and `v_org` comes off the authority; the delegate was
  -- never compared to either, so an approval authority could be handed to an employment in a
  -- different organization — a privilege grant across the wall.
  if not exists (select 1 from hr.employment em
                  where em.id = p_delegate_employment_id and em.organization_id = v_org
                    and em.deleted_at is null) then
    return hr._governance_refusal(v_org, 'hr_approval_delegation', 'delegate_not_in_this_organization',
      'an authority is handed on to somebody employed by the same organization', v_holder_emp,
      ARRAY[p_authority_id]);
  end if;

  perform hr.arm_write();
  insert into hr.approval_delegation
    (organization_id, authority_id, delegator_employment_id, delegate_employment_id,
     effective_from, effective_to, reason)
  values (v_org, p_authority_id, v_holder_emp, p_delegate_employment_id,
          p_effective_from, p_effective_to, p_reason)
  returning id into v_id;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_approval_delegation',
    p_purpose => 'governance', p_basis => 'authority', p_granted => true,
    p_target_ids => ARRAY[v_id], p_sensitivity_tier => 'directory',
    p_subject_employment_id => p_delegate_employment_id, p_justification => p_reason);

  return jsonb_build_object('granted', true, 'delegation_id', v_id, 'state', 'pending',
                            'audit_id', v_audit);
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_authority_grant(p_holder_kind text, p_holder_id text, p_action_type text, p_scope_kind text DEFAULT 'org'::text, p_scope_id uuid DEFAULT NULL::uuid, p_scope_employment_ids uuid[] DEFAULT '{}'::uuid[], p_limits jsonb DEFAULT '{}'::jsonb, p_rank integer DEFAULT 100, p_effective_from date DEFAULT CURRENT_DATE, p_effective_to date DEFAULT NULL::date, p_reason text DEFAULT NULL::text, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_org uuid; v_id uuid; v_audit uuid; v_holder_emp uuid;
begin
  if v_uid is null then
    raise exception 'hr_authority_grant: no authenticated caller' using errcode = '42501';
  end if;

  if not exists (select 1 from platform.categories c
                  where c.dimension = 'hr_approval_action' and c.slug = p_action_type
                    and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                    and c.deleted_at is null) then
    raise exception 'hr_authority_grant: % is not a registered hr_approval_action', p_action_type
      using errcode = '22023';
  end if;

  -- resolve the org from the holder where we can, so a caller cannot grant into another tenant
  if p_holder_kind = 'employment' then
    select em.organization_id into v_org from hr.employment em where em.id = p_holder_id::uuid;
    v_holder_emp := p_holder_id::uuid;
  elsif p_holder_kind = 'position' then
    select pa.organization_id, pa.employment_id into v_org, v_holder_emp
      from hr.position_assignment pa where pa.id = p_holder_id::uuid;
  else
    v_org := p_organization_id;
  end if;
  if v_org is null then
    perform platform.refuse_not_found('hr_authority_grant: the organization could not be resolved from the holder; pass p_organization_id for a role holder');
  end if;

  if not (hr.capability(v_uid, 'authority.grant', v_holder_emp, current_date, v_org)
          or exists (select 1 from iam.organization_member om
                      where om.organization_id = v_org and om.user_id = v_uid and om.role = 'owner')) then
    return hr._governance_refusal(v_org, 'hr_approval_authority', 'no_capability',
      'the caller holds neither the authority.grant capability nor org ownership', v_holder_emp);
  end if;

  perform hr.arm_write();
  insert into hr.approval_authority
    (organization_id, holder_kind, holder_id, action_type, scope_kind, scope_id,
     scope_employment_ids, limits, rank, effective_from, effective_to, source,
     granted_by_user_id, reason)
  values (v_org, p_holder_kind, p_holder_id, p_action_type, p_scope_kind, p_scope_id,
          coalesce(p_scope_employment_ids,'{}'), coalesce(p_limits,'{}'::jsonb), p_rank,
          p_effective_from, p_effective_to, 'assigned', v_uid, p_reason)
  returning id into v_id;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_approval_authority',
    p_purpose => 'governance', p_basis => 'authority', p_granted => true,
    p_target_ids => ARRAY[v_id], p_sensitivity_tier => 'directory',
    p_subject_employment_id => v_holder_emp, p_justification => p_reason,
    p_request_ref => p_action_type);

  return jsonb_build_object('granted', true, 'authority_id', v_id, 'audit_id', v_audit);
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_authority_revoke(p_authority_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_org uuid; v_audit uuid; v_holder_emp uuid; v_kind text; v_hid text;
begin
  if v_uid is null then
    raise exception 'hr_authority_revoke: no authenticated caller' using errcode = '42501';
  end if;
  select aa.organization_id, aa.holder_kind, aa.holder_id into v_org, v_kind, v_hid
    from hr.approval_authority aa where aa.id = p_authority_id;
  if v_org is null then
    perform platform.refuse_not_found(format('hr_authority_revoke: no hr.approval_authority with id %s', p_authority_id));
  end if;
  if v_kind = 'employment' then v_holder_emp := v_hid::uuid; end if;

  if not (hr.capability(v_uid, 'authority.grant', v_holder_emp, current_date, v_org)
          or exists (select 1 from iam.organization_member om
                      where om.organization_id = v_org and om.user_id = v_uid and om.role = 'owner')) then
    return hr._governance_refusal(v_org, 'hr_approval_authority', 'no_capability',
      'the caller holds neither authority.grant nor org ownership', v_holder_emp, ARRAY[p_authority_id]);
  end if;

  perform hr.arm_write();
  update hr.approval_authority
     set is_active = false, effective_to = least(coalesce(effective_to, current_date), current_date),
         reason = coalesce(reason,'') || case when p_reason is null then '' else ' | revoked: ' || p_reason end
   where id = p_authority_id;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_approval_authority',
    p_purpose => 'governance', p_basis => 'authority', p_granted => true,
    p_target_ids => ARRAY[p_authority_id], p_sensitivity_tier => 'directory',
    p_subject_employment_id => v_holder_emp, p_justification => p_reason,
    p_request_context => '{"op":"revoke"}'::jsonb);

  return jsonb_build_object('granted', true, 'authority_id', p_authority_id, 'audit_id', v_audit);
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_break_glass(p_token text, p_id uuid, p_purpose text, p_justification text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); d record; v_min int; v_ttl int; v_org uuid; v_schema text;
  v_table text; v_audit uuid; v_perm uuid; v_subject uuid; v_verdict jsonb; v_note_kind text;
  nk record; v_bg_ok boolean;
begin
  if v_uid is null then
    raise exception 'hr_break_glass: no authenticated caller' using errcode = '42501';
  end if;
  select * into d from hr._door_spec(p_token);
  if not found then
    raise exception 'hr_break_glass: % is not an audited-tier token', p_token using errcode = '22023';
  end if;

  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e where e.token = p_token;
  execute format('select organization_id from %I.%I where id = $1', v_schema, v_table)
     into v_org using p_id;
  if v_org is null then
    perform platform.refuse_not_found(format('hr_break_glass: no %s row with id %s', p_token, p_id));
  end if;

  -- ---- the caller must hold a role whose catalogue row says break_glass_allowed
  if not exists (
    select 1 from hr.role_assignment ra
      join lateral (select ar.break_glass_allowed from hr.access_role ar
                     where ar.role_key = ra.role_key and ar.deleted_at is null and ar.is_active
                       and ar.organization_id in (ra.organization_id,
                                                  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
                     order by (ar.organization_id = ra.organization_id) desc limit 1) role on true
     where ra.organization_id = v_org
       and ra.employment_id = any(hr.employments_of(v_uid))
       and ra.is_active and ra.revoked_at is null
       and ra.effective_from <= current_date
       and (ra.effective_to is null or ra.effective_to >= current_date)
       and role.break_glass_allowed)
  then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => coalesce(p_purpose,'(none given)'), p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_sensitivity_tier => d.tier, p_is_break_glass => true,
      p_justification => p_justification,
      p_denial_reason => 'the caller holds no role with break_glass_allowed; a manager never can');
    return jsonb_build_object('granted', false, 'reason', 'no_break_glass_role', 'audit_id', v_audit);
  end if;

  -- ---- the justification floor, from the knob (D13: a missing knob raises)
  v_min := (hr._knob('hr.domain_wide','break_glass_justification_min_chars') #>> '{}')::integer;
  if p_justification is null or length(p_justification) < v_min then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => coalesce(p_purpose,'(none given)'), p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_sensitivity_tier => d.tier, p_is_break_glass => false,
      p_denial_reason => format('justification is shorter than the %s-character floor', v_min));
    return jsonb_build_object('granted', false, 'reason', 'justification_too_short',
      'detail', format('hr.domain_wide.break_glass_justification_min_chars is %s', v_min),
      'audit_id', v_audit);
  end if;

  -- ---- the purpose must come from the controlled dimension, not from prose
  if not exists (select 1 from platform.categories c
                  where c.dimension = 'hr_access_purpose' and c.slug = p_purpose
                    and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                    and c.deleted_at is null) then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => '(unregistered)', p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_sensitivity_tier => d.tier,
      p_justification => p_justification,
      p_denial_reason => format('purpose %s is not in the hr_access_purpose dimension', p_purpose));
    return jsonb_build_object('granted', false, 'reason', 'unregistered_purpose', 'audit_id', v_audit);
  end if;

  -- ---- 🚨 TWO THINGS BREAK-GLASS CAN NEVER REACH (§4.3), and both are checked before any grant:
  --      an hr.incident where the caller is a party (§5's veto is absolute), and an individual
  --      hr.eeo_response (no such read path exists in any function). The MEDICAL note class is a
  --      third, from §3.1a — otherwise the merged table makes the medical wall a formality.
  v_bg_ok := d.allows_break_glass;
  if p_token = 'hr_restricted_note' then
    execute 'select note_kind from hr.restricted_note where id = $1' into v_note_kind using p_id;
    select * into nk from hr._note_kind_caps(v_note_kind);
    v_bg_ok := coalesce(nk.allows_break_glass, false);
  end if;

  v_verdict := hr._door_verdict(v_uid, p_token, p_id, false);
  if (v_verdict ->> 'basis') = 'subject_excluded' then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => p_purpose, p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_sensitivity_tier => d.tier, p_is_break_glass => true,
      p_justification => p_justification,
      p_denial_reason => 'SPEC-ACCESS §5: the subject-exclusion veto overrides break-glass, absolutely');
    return jsonb_build_object('granted', false, 'reason', 'subject_excluded', 'audit_id', v_audit);
  end if;

  if not v_bg_ok then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => p_purpose, p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_sensitivity_tier => d.tier, p_is_break_glass => true,
      p_justification => p_justification,
      p_denial_reason => coalesce(d.no_door_reason,
        format('break-glass is not permitted on %s%s', p_token,
               case when v_note_kind is null then '' else ' / ' || v_note_kind end)));
    return jsonb_build_object('granted', false, 'reason', 'break_glass_not_permitted',
                              'audit_id', v_audit);
  end if;

  -- ---- §4.3: write a REAL, time-boxed grant, so the person can actually do the work. A one-shot
  --      read that forces twelve more break-glass calls is over-tightening dressed as rigour.
  v_ttl := (hr._hr_knob('hr.access','break_glass_grant_ttl_minutes', v_org, null) #>> '{}')::integer;
  v_subject := nullif(v_verdict ->> 'subject_employment_id','')::uuid;

  perform hr.arm_write();
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level,
                               status, expires_at)
  values (p_token, p_id, v_uid, 'viewer', 'active', now() + make_interval(mins => v_ttl))
  on conflict (resource_type, resource_id, granted_to_user_id) do update
     set expires_at = excluded.expires_at, status = 'active'
  returning id into v_perm;

  insert into hr.derived_grant
    (organization_id, permission_id, subject_employment_id, grantee_user_id, resource_type,
     resource_id, permission_level, expires_at, reason, basis_kind, basis_id)
  values (v_org, v_perm, v_subject, v_uid, p_token, p_id, 'viewer',
          now() + make_interval(mins => v_ttl), 'break_glass', 'break_glass', p_id)
  on conflict (permission_id) do update
     set expires_at = excluded.expires_at, reason = 'break_glass', derived_at = now();

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'read', p_target_token => p_token,
    p_purpose => p_purpose, p_basis => 'break_glass', p_granted => true,
    p_target_ids => ARRAY[p_id], p_row_count => 1, p_sensitivity_tier => d.tier,
    p_subject_employment_id => v_subject, p_justification => p_justification,
    p_is_break_glass => true);

  -- 🚨 THE NOTIFICATION AUDIENCE IS NOT DECIDED HERE. Per D24g, recipients come from the
  -- principal-governed alert-routing panel (SPEC-DOMAIN-WIDE / hr.alert_routing_rule). This lane
  -- declares the EVENT and its tier — hr.access.break_glass_used, tier `immediate` — and resolves
  -- the audience through hr.alert_recipients; the org owner + every hr_owner is the seeded default
  -- the panel starts from, never a hard-coded recipient list here.
  -- DD-137a — HR IS A CALLER OF THE PLATFORM DOOR, NOT A SIBLING OF IT. hr.access_audit stays
  -- HR's own domain ledger and keeps every row it has; the platform ledger gets the same act so
  -- that "who opened my data" is ONE list for a person, not one per module. And the SUBJECT is
  -- told — HR notified compliance and never told the person (VISIBILITY-BY-CLASS §3.5).
  declare v_plat_audit uuid; v_subject_user uuid; begin
    select e.login_user_id into v_subject_user from hr.employment em
      join hr.employee e on e.id = em.employee_id where em.id = v_subject;
    v_plat_audit := iam._record_access_audit(
      p_organization_id => v_org, p_action => 'read', p_target_token => p_token,
      p_data_class => case when d.tier = 'restricted' then 'private' else 'confidential' end,
      p_purpose => p_purpose, p_basis => 'emergency_door', p_granted => true,
      p_target_ids => ARRAY[p_id], p_row_count => 1, p_subject_user_id => v_subject_user,
      p_justification => p_justification, p_permission_id => v_perm,
      p_grant_expires_at => now() + make_interval(mins => v_ttl));
    perform iam._notify_door(v_org, 'platform.access.emergency_door_opened', v_subject_user,
      jsonb_build_object('token', p_token, 'target_id', p_id, 'opened_by', v_uid,
                         'purpose', p_purpose, 'justification', p_justification,
                         'expires_at', now() + make_interval(mins => v_ttl),
                         'audit_id', v_plat_audit),
      v_plat_audit, '/me/access-log', 'edoor:open:' || v_plat_audit::text);
  end;
  return jsonb_build_object(
    'granted', true, 'audit_id', v_audit, 'permission_id', v_perm,
    'expires_at', now() + make_interval(mins => v_ttl),
    'alert_event', 'hr.access.break_glass_used', 'alert_tier', 'immediate',
    'alert_recipients', (select coalesce(jsonb_agg(x), '[]'::jsonb)
                           from hr.alert_recipients(v_org, 'compliance',
                                'hr.access.break_glass_used', 'organization', null, 'urgent') x),
    'row', hr._project_row(p_token, v_schema, v_table, p_id));
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_employee_invite(p_employee_id uuid, p_email text DEFAULT NULL::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_gate jsonb; v_email text;
  v_login uuid; v_display text; v_emp uuid; v_inv iam.invitations; v_expires timestamptz;
begin
  select e.organization_id, e.login_user_id, e.display_name,
         coalesce(nullif(btrim(p_email), ''), e.work_email)
    into v_org, v_login, v_display, v_email
    from hr.employee e where e.id = p_employee_id and e.deleted_at is null;

  if v_org is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;

  -- 🚨 THE WRITE GATE ASKS THE POPULATION IT JUST REFUSED THE READ FOR (hr_l1_64): an
  -- invite to a prehire IS the ordinary case here, and it was the case with no scope.
  select g.gate, g.subject_employment into v_gate, v_emp
    from hr._l1_subject_write_gate(v_org, 'identity.write', p_employee_id,
                                   'hr_employee', 'invite', 'login') g;
  if v_gate is not null then return v_gate; end if;

  -- §4.1 node L1: kiosk-only staff are first class and nothing may assume a login. Inviting
  -- somebody who already has one is a caller mistake, not a refusal of access.
  if v_login is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_has_login',
      'detail', format('%s already signs in here. There is nothing to invite them to.', v_display),
      'door', '/hr/people/' || p_employee_id || '/personal?org=' || v_org::text);
  end if;

  if v_email is null or btrim(v_email) = '' then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'email',
      'detail', 'An invite needs an email address. Add a work email, or type one for this invite.',
      'door', '/hr/people/' || p_employee_id || '/personal?org=' || v_org::text);
  end if;

  v_expires := coalesce(p_expires_at, now() + interval '7 days');

  -- delegate to the canonical primitive; do not reimplement it
  begin
    v_inv := public.inv_create(
      p_target_type => 'organization',
      p_target_id => v_org,
      p_email => v_email,
      p_role => 'member',
      p_org_id => v_org,
      p_invited_user_id => null,
      p_expires_at => v_expires);
  exception
    when insufficient_privilege then
      -- `inv_create` requires an org owner/admin. HR standing is not an org role, by design.
      return jsonb_build_object('ok', false, 'reason', 'org_role_required_for_login',
        'detail', 'A platform login is access to the whole workspace, so an owner or administrator '
               || 'of this organization has to issue it. Ask one of them to invite '
               || coalesce(v_email, 'this person') || '.',
        'door', '/organizations');
    when others then
      return jsonb_build_object('ok', false, 'reason', 'invite_failed',
        'detail', platform.refusal_message(sqlstate, sqlerrm), 'sqlstate', platform.refusal_code(sqlstate, sqlerrm));
  end;

  -- the HR linkage rides on the invitation's own metadata; no second table, no second system
  update iam.invitations
     set metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('hr_employee_id', p_employee_id,
                                          'hr_invite', true,
                                          'hr_organization_id', v_org)
   where id = v_inv.id
  returning * into v_inv;

  perform hr._l1_write_audit(v_org, 'hr_employee', 'invite', ARRAY[p_employee_id], v_emp, 'login');

  return jsonb_build_object(
    'ok', true,
    'employee_id', p_employee_id,
    'display_name', v_display,
    'invitation_id', v_inv.id,
    'email', v_inv.email,
    'expires_at', v_inv.expires_at,
    -- 🚨 returned to the ISSUING ADMIN because Resend cannot deliver locally and the platform's
    -- own invite route never exposes the token. Single-use, expiring, and only ever handed to a
    -- caller who already passed the identity.write gate.
    'token', v_inv.token,
    'accept_path', '/invitations/employee/accept/' || v_inv.token,
    'invitee_must_have_an_account', true,
    'notice', 'The invite email is sent where email is configured. The link below is the same '
           || 'one it carries — the person needs an account with this email address to use it.');
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_incident_status(p_incident_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); i hr.incident%rowtype; v_mine uuid[]; v_audit uuid; v_is_reporter boolean;
begin
  if v_uid is null then
    raise exception 'hr_incident_status: no authenticated caller' using errcode = '42501';
  end if;
  select * into i from hr.incident where id = p_incident_id and deleted_at is null;
  if not found then
    perform platform.refuse_not_found(format('hr_incident_status: no hr.incident with id %s', p_incident_id));
  end if;
  v_mine := hr.employments_of(v_uid);
  v_is_reporter := i.reporter_employment_id is not null and i.reporter_employment_id = any(v_mine);

  if not (v_is_reporter or hr.capability(v_uid,'incident.read', null, current_date, i.organization_id)
          or exists (select 1 from hr.incident_party ip
                      where ip.incident_id = i.id and ip.party_role = 'investigator'
                        and ip.deleted_at is null and ip.employment_id = any(v_mine))) then
    v_audit := hr._record_access_audit(
      p_organization_id => i.organization_id, p_action => 'denied', p_target_token => 'hr_incident',
      p_purpose => 'employee_request', p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_incident_id], p_sensitivity_tier => 'restricted',
      p_subject_employment_id => i.subject_employment_id,
      p_denial_reason => 'the caller is neither the reporter, an investigator, nor an incident.read holder');
    return jsonb_build_object('granted', false, 'reason', 'no_capability', 'audit_id', v_audit);
  end if;

  -- the veto still applies: a SUBJECT probing for their own case leaves a trail and gets nothing
  if hr.incident_excluded(v_uid, p_incident_id) then
    v_audit := hr._record_access_audit(
      p_organization_id => i.organization_id, p_action => 'denied', p_target_token => 'hr_incident',
      p_purpose => 'employee_request', p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_incident_id], p_sensitivity_tier => 'restricted',
      p_subject_employment_id => i.subject_employment_id,
      p_denial_reason => 'SPEC-ACCESS §5: subject-exclusion veto');
    return jsonb_build_object('granted', false, 'reason', 'subject_excluded', 'audit_id', v_audit);
  end if;

  v_audit := hr._record_access_audit(
    p_organization_id => i.organization_id, p_action => 'read', p_target_token => 'hr_incident',
    p_purpose => 'employee_request', p_basis => case when v_is_reporter then 'self' else 'role' end,
    p_granted => true, p_target_ids => ARRAY[p_incident_id], p_row_count => 1,
    p_sensitivity_tier => 'restricted', p_subject_employment_id => i.subject_employment_id,
    p_is_self_access => v_is_reporter and i.subject_employment_id = any(v_mine));

  -- state, last-updated and the declared next step. NOTHING else — no summary, no parties, no
  -- notes. `state_label` and `next_step` ride alongside the raw values, never instead of them:
  -- the key and the label in one payload is the house pattern, and a caller that wants the enum
  -- still has it.
  return jsonb_build_object('granted', true, 'audit_id', v_audit,
    'incident_id', i.id, 'state', i.state,
    'state_label', hr.incident_state_label(i.state),
    'updated_at', i.updated_at,
    'next_step', hr.incident_next_step_sentence(i.state, i.follow_up_on),
    'next_step_on', i.follow_up_on, 'reported_at', i.reported_at,
    'resolved_at', i.resolved_at);
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_mint_investigation_token(p_incident_id uuid, p_investigator_email text, p_investigator_name text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr', 'platform'
AS $function$
declare v_uid uuid := auth.uid(); i hr.incident%rowtype; v_out jsonb; v_audit uuid;
begin
  if v_uid is null then
    raise exception 'hr_mint_investigation_token: no authenticated caller' using errcode = '42501';
  end if;
  select * into i from hr.incident where id = p_incident_id and deleted_at is null;
  if not found then
    perform platform.refuse_not_found(format('hr_mint_investigation_token: no hr.incident with id %s', p_incident_id));
  end if;

  -- the veto applies to the MINTER too: a party to the case cannot hand it to an outsider
  if hr.incident_excluded(v_uid, p_incident_id) then
    return hr._governance_refusal(i.organization_id, 'hr_incident', 'subject_excluded',
      'SPEC-ACCESS §5: a party to this case may not escalate it', i.subject_employment_id,
      ARRAY[p_incident_id]);
  end if;
  if not (hr.capability(v_uid,'incident.investigate', null, current_date, i.organization_id)
          or hr.capability(v_uid,'role.assign', null, current_date, i.organization_id)) then
    return hr._governance_refusal(i.organization_id, 'hr_incident', 'no_capability',
      'only an ER case owner or hr_owner escalates to an external investigator',
      i.subject_employment_id, ARRAY[p_incident_id]);
  end if;

  v_out := platform.mint_outsider_token(
    'hr.investigation_external', 'hr_incident', p_incident_id,
    jsonb_build_object('consumer_key','hr.investigation_external',
      'subject', jsonb_build_object('type','hr_incident','id', p_incident_id),
      'grants', jsonb_build_array(
        jsonb_build_object('resource','hr_incident','id', p_incident_id,
                           'actions', jsonb_build_array('read','write_note','upload_evidence','submit_finding','close')),
        jsonb_build_object('resource','hr_incident_party','parent_id', p_incident_id,
                           'actions', jsonb_build_array('read','write_note')),
        jsonb_build_object('resource','hr_restricted_note','parent_id', p_incident_id,
                           'actions', jsonb_build_array('read','write_note')))),
    i.organization_id,
    jsonb_build_object('email', p_investigator_email, 'verification_target', p_investigator_email,
                       'name', p_investigator_name));

  v_audit := hr._record_access_audit(
    p_organization_id => i.organization_id, p_action => 'write', p_target_token => 'hr_incident',
    p_purpose => 'investigation', p_basis => 'authority', p_granted => true,
    p_target_ids => ARRAY[p_incident_id], p_sensitivity_tier => 'restricted',
    p_subject_employment_id => i.subject_employment_id, p_justification => p_reason,
    p_request_context => jsonb_build_object('token_id', v_out ->> 'actor_token_id'));

  return v_out || jsonb_build_object('granted', true, 'audit_id', v_audit);
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_mint_records_request_token(p_request_id uuid, p_delivery_address text, p_scope text[], p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr', 'platform'
AS $function$
declare v_uid uuid := auth.uid(); rq hr.records_request%rowtype; v_out jsonb; v_audit uuid;
begin
  if v_uid is null then
    raise exception 'hr_mint_records_request_token: no authenticated caller' using errcode = '42501';
  end if;
  select * into rq from hr.records_request where id = p_request_id and deleted_at is null;
  if not found then
    perform platform.refuse_not_found(format('hr_mint_records_request_token: no hr.records_request with id %s', p_request_id));
  end if;

  if not (hr.capability(v_uid,'records.govern', rq.employment_id, current_date, rq.organization_id)
          or hr.capability(v_uid,'identity.read', rq.employment_id, current_date, rq.organization_id)) then
    return hr._governance_refusal(rq.organization_id, 'hr_records_request', 'no_capability',
      'only hr_admin / hr_owner may open the records door; anyone may ASK, only HR opens it (§7)',
      rq.employment_id, ARRAY[p_request_id]);
  end if;
  if p_delivery_address is null or p_delivery_address = '' then
    return hr._governance_refusal(rq.organization_id, 'hr_records_request', 'address_required',
      'the address of record is set by HR at grant time and is never supplied by the requester',
      rq.employment_id, ARRAY[p_request_id]);
  end if;

  v_out := platform.mint_outsider_token(
    'hr.records_request', 'hr_records_request', p_request_id,
    jsonb_build_object('consumer_key','hr.records_request',
      'subject', jsonb_build_object('type','hr_records_request','id', p_request_id),
      'grants', jsonb_build_array(jsonb_build_object(
        'resource','hr_records_request','id', p_request_id, 'actions', jsonb_build_array('read','download')))),
    rq.organization_id,
    jsonb_build_object('email', p_delivery_address, 'verification_target', p_delivery_address,
                       'name', rq.requester_name));

  perform hr.arm_write();
  -- 🚨 THE LIVE STATE VOCABULARY HAS NO `approved`, and it does not need one: HR approving the
  -- request IS minting the token, and the row's next honest state is `preparing`. The live CHECK
  -- admits received | verifying | preparing | delivered | denied | partially_delivered — a state
  -- machine about DELIVERY, which is the right grain, so this lane conforms to it rather than
  -- widening it. `requester_verified_at` is what records that the human approval step happened,
  -- and §7 is explicit that THAT step *is* the identity verification.
  update hr.records_request
     set outsider_token_ref = (v_out ->> 'actor_token_id')::uuid,
         state = 'preparing', verification_method = 'hr_approved_email_code',
         requester_verified_at = now(), delivery_method = 'token_link'
   where id = p_request_id;

  v_audit := hr._record_access_audit(
    p_organization_id => rq.organization_id, p_action => 'write',
    p_target_token => 'hr_records_request', p_purpose => 'employee_request', p_basis => 'role',
    p_granted => true, p_target_ids => ARRAY[p_request_id], p_sensitivity_tier => 'confidential',
    p_subject_employment_id => rq.employment_id, p_justification => p_reason,
    p_request_context => jsonb_build_object('scope', p_scope, 'token_id', v_out ->> 'actor_token_id'));

  return v_out || jsonb_build_object('granted', true, 'audit_id', v_audit);
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_role_assign(p_employment_id uuid, p_role_key text, p_scope_kind text DEFAULT 'org'::text, p_scope_id uuid DEFAULT NULL::uuid, p_scope_employment_ids uuid[] DEFAULT '{}'::uuid[], p_effective_from date DEFAULT CURRENT_DATE, p_effective_to date DEFAULT NULL::date, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_id  uuid;
  v_audit uuid;
  v_assignable boolean;
  v_actor_emp uuid;
begin
  if v_uid is null then
    raise exception 'hr_role_assign: no authenticated caller' using errcode = '42501';
  end if;

  select em.organization_id into v_org from hr.employment em
   where em.id = p_employment_id and em.deleted_at is null;
  if v_org is null then
    perform platform.refuse_not_found(format('hr_role_assign: no hr.employment with id %s', p_employment_id));
  end if;

  select ar.is_assignable into v_assignable from hr.access_role ar
   where ar.role_key = p_role_key and ar.deleted_at is null and ar.is_active
     and ar.organization_id in (v_org, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
   order by (ar.organization_id = v_org) desc limit 1;
  if v_assignable is null then
    raise exception 'hr_role_assign: % is not a registered hr.access_role', p_role_key using errcode = '22023';
  end if;
  if not v_assignable then
    -- `manager` and `employee` are DERIVED, never assigned (§1.4). Refusing by name is what stops
    -- someone "granting" a lane that is computed.
    return hr._governance_refusal(v_org, 'hr_role_assignment', 'role_not_assignable',
      format('%s is a derived role and is never assigned; it is resolved from the reporting line or the login on the person row (SPEC-ACCESS §1.4)', p_role_key),
      p_employment_id);
  end if;

  -- §1.2's gate: the role.assign capability, or org owner
  if not (hr.capability(v_uid, 'role.assign', p_employment_id)
          or exists (select 1 from iam.organization_member om
                      where om.organization_id = v_org and om.user_id = v_uid and om.role = 'owner')) then
    return hr._governance_refusal(v_org, 'hr_role_assignment', 'no_capability',
      'the caller holds neither the role.assign capability over this population nor org ownership',
      p_employment_id);
  end if;

  select em.id into v_actor_emp from hr.employment em
    join hr.employee e on e.id = em.employee_id
   where e.login_user_id = v_uid and em.organization_id = v_org and em.deleted_at is null limit 1;

  -- ARGS-RULED (2026-09-21). THE SCOPE OF A ROLE IS INSIDE THE ORGANIZATION THAT GRANTS IT.
  -- `p_employment_id` is checked (its organization becomes `v_org`, and the caller is gated
  -- against it). `p_scope_id` and `p_scope_employment_ids` were written into hr.role_assignment
  -- raw — so a grant made in one organization could be SCOPED to another organization's
  -- department, location, pay group, crew or people, which is a reach across the wall written by
  -- the very row that is supposed to bound one.
  if p_scope_id is not null then
    if not (case p_scope_kind
              when 'org'        then p_scope_id = v_org
              when 'department' then exists (select 1 from hr.department x where x.id = p_scope_id and x.organization_id = v_org)
              when 'location'   then exists (select 1 from hr.location   x where x.id = p_scope_id and x.organization_id = v_org)
              when 'pay_group'  then exists (select 1 from hr.pay_group  x where x.id = p_scope_id and x.organization_id = v_org)
              when 'crew'       then exists (select 1 from hr.crew       x where x.id = p_scope_id and x.organization_id = v_org)
              else true
            end) then
      return hr._governance_refusal(v_org, 'hr_role_assignment', 'scope_not_in_this_organization',
        format('a %s scope on a role granted here has to be one of this organization''s', p_scope_kind),
        p_employment_id);
    end if;
  end if;
  if coalesce(array_length(p_scope_employment_ids, 1), 0) > 0
     and exists (select 1 from unnest(p_scope_employment_ids) s(id)
                  where not exists (select 1 from hr.employment em
                                     where em.id = s.id and em.organization_id = v_org
                                       and em.deleted_at is null)) then
    return hr._governance_refusal(v_org, 'hr_role_assignment', 'scope_people_not_in_this_organization',
      'every person a role is scoped over is employed by the organization granting it',
      p_employment_id);
  end if;

  perform hr.arm_write();
  insert into hr.role_assignment
    (organization_id, employment_id, role_key, scope_kind, scope_id, scope_employment_ids,
     effective_from, effective_to, granted_by_employment_id, granted_by_user_id, reason)
  values (v_org, p_employment_id, p_role_key, p_scope_kind, p_scope_id, coalesce(p_scope_employment_ids,'{}'),
          p_effective_from, p_effective_to, v_actor_emp, v_uid, p_reason)
  returning id into v_id;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_role_assignment',
    p_purpose => 'governance', p_basis => 'role', p_granted => true,
    p_target_ids => ARRAY[v_id], p_sensitivity_tier => 'directory',
    p_subject_employment_id => p_employment_id, p_access_role_key => p_role_key,
    p_justification => p_reason, p_actor_employment_id => v_actor_emp,
    p_request_context => jsonb_build_object('scope_kind', p_scope_kind, 'scope_id', p_scope_id));

  -- the derivation trigger on hr.role_assignment does the grant work synchronously (§2.4)
  return jsonb_build_object('granted', true, 'assignment_id', v_id, 'audit_id', v_audit);
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_role_revoke(p_assignment_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_org uuid; v_emp uuid; v_key text; v_audit uuid;
begin
  if v_uid is null then
    raise exception 'hr_role_revoke: no authenticated caller' using errcode = '42501';
  end if;
  select ra.organization_id, ra.employment_id, ra.role_key into v_org, v_emp, v_key
    from hr.role_assignment ra where ra.id = p_assignment_id;
  if v_org is null then
    perform platform.refuse_not_found(format('hr_role_revoke: no hr.role_assignment with id %s', p_assignment_id));
  end if;

  if not (hr.capability(v_uid, 'role.assign', v_emp)
          or exists (select 1 from iam.organization_member om
                      where om.organization_id = v_org and om.user_id = v_uid and om.role = 'owner')) then
    return hr._governance_refusal(v_org, 'hr_role_assignment', 'no_capability',
      'the caller holds neither role.assign over this population nor org ownership', v_emp,
      ARRAY[p_assignment_id]);
  end if;

  perform hr.arm_write();
  -- never a delete: the immutable-history rule (AD-8). The row stays and stops being active.
  update hr.role_assignment
     set is_active = false, revoked_at = now(), revoked_reason = p_reason,
         effective_to = least(coalesce(effective_to, current_date), current_date)
   where id = p_assignment_id;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_role_assignment',
    p_purpose => 'governance', p_basis => 'role', p_granted => true,
    p_target_ids => ARRAY[p_assignment_id], p_sensitivity_tier => 'directory',
    p_subject_employment_id => v_emp, p_access_role_key => v_key, p_justification => p_reason,
    p_request_context => '{"op":"revoke"}'::jsonb);

  return jsonb_build_object('granted', true, 'assignment_id', p_assignment_id, 'audit_id', v_audit);
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_set_employment_pin(p_employment_id uuid, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr', 'extensions'
AS $function$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_len int; v_id uuid; v_prev uuid; v_audit uuid; v_actor uuid;
  v_self boolean;
begin
  if v_uid is null then
    raise exception 'hr_set_employment_pin: no authenticated caller' using errcode = '42501';
  end if;
  select organization_id into v_org from hr.employment where id = p_employment_id and deleted_at is null;
  if v_org is null then
    perform platform.refuse_not_found(format('hr_set_employment_pin: no hr.employment with id %s', p_employment_id));
  end if;

  v_self := p_employment_id = any(hr.employments_of(v_uid));

  if not (hr.capability(v_uid,'working_record.write', p_employment_id) or v_self) then
    return hr._governance_refusal(v_org, 'hr_employment_pin', 'no_capability',
      'only an HR writer or the employee themselves may set a kiosk PIN', p_employment_id);
  end if;

  v_len := (hr._hr_knob('hr.time_and_attendance','kiosk_pin_length', v_org, null) #>> '{}')::integer;
  if p_pin is null or p_pin !~ '^[0-9]+$' or length(p_pin) <> v_len then
    return hr._governance_refusal(v_org, 'hr_employment_pin', 'pin_shape',
      format('the PIN must be exactly %s digits (hr.time_and_attendance.kiosk_pin_length)', v_len),
      p_employment_id);
  end if;

  perform hr.arm_write();
  select id into v_prev from hr.employment_pin
   where employment_id = p_employment_id and revoked_at is null and deleted_at is null;
  if v_prev is not null then
    update hr.employment_pin set revoked_at = now(), revoked_reason = 'rotated' where id = v_prev;
  end if;
  select em.id into v_actor from hr.employment em where em.id = any(hr.employments_of(v_uid))
    and em.organization_id = v_org limit 1;

  insert into hr.employment_pin
    (organization_id, employment_id, pin_hash, pin_algo, pin_length, set_at, set_by_employment_id,
     rotated_from_id, must_reset)
  values (v_org, p_employment_id,
          extensions.crypt(p_pin, extensions.gen_salt('bf')), 'bcrypt', v_len, now(), v_actor, v_prev,
          -- 🚨 A PIN somebody else chose is TEMPORARY. A PIN you chose yourself is not: flagging it
          -- would demand a reset of a secret only the subject has ever known.
          not v_self)
  returning id into v_id;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_employment_pin',
    p_purpose => 'operational', p_basis => case when v_self then 'self' else 'role' end,
    p_granted => true, p_target_ids => ARRAY[v_id], p_sensitivity_tier => 'restricted',
    p_subject_employment_id => p_employment_id,
    p_is_self_access => v_self);

  return jsonb_build_object('granted', true, 'employment_pin_id', v_id, 'audit_id', v_audit,
                            'must_reset', not v_self);
end
$function$;

CREATE OR REPLACE FUNCTION public.hr_ssn_store(p_employee_id uuid, p_ciphertext bytea, p_key_id text, p_hmac bytea, p_last4 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_subject uuid; v_priv uuid;
  v_self boolean; v_audit uuid; v_created boolean := false;
begin
  if v_uid is null then
    raise exception 'hr_ssn_store: no authenticated caller' using errcode = '42501';
  end if;

  -- The four columns are ONE fact. A partial write leaves a row whose ciphertext, digest and
  -- hint disagree, so the door refuses the shape rather than half-applying it.
  if p_ciphertext is null or p_key_id is null or p_hmac is null or p_last4 is null then
    raise exception 'hr_ssn_store: ssn_ciphertext, ssn_key_id, ssn_hmac and ssn_last4 are one fact and must be supplied together'
      using errcode = '22023',
            hint = 'aidream seals the value and derives all four in one place; send all four or none';
  end if;
  if p_last4 !~ '^[0-9]{4}$' then
    raise exception 'hr_ssn_store: ssn_last4 must be exactly four digits'
      using errcode = '22023';
  end if;

  select organization_id into v_org from hr.employee where id = p_employee_id;
  if v_org is null then
    perform platform.refuse_not_found(format('hr_ssn_store: no hr.employee row with id %s', p_employee_id));
  end if;

  select em.id into v_subject from hr.employment em
   where em.employee_id = p_employee_id and em.deleted_at is null
   order by em.hire_date desc limit 1;

  v_self := v_subject is not null and v_subject = any(hr.employments_of(v_uid));

  -- identity.write over the subject, OR the subject themselves — the same dual lane
  -- hr.reveal_ssn runs. The hr_only field POLICY governs display/edit of the STORED value;
  -- supplying one's own identifier is a distinct act.
  if not (hr.capability(v_uid, 'identity.write', v_subject, current_date, v_org) or v_self) then
    return hr._governance_refusal(v_org, 'hr_employee_private', 'no_capability',
      'only a holder of identity.write over this person, or the person themselves, may store an SSN',
      v_subject, array[p_employee_id]);
  end if;

  perform hr.arm_write();

  -- The row may not exist (private_state 'not_collected'), so intake CREATES rather than updates.
  -- A re-submit REPLACES — a corrected number must not leave the old digest matchable — and earns
  -- its own audit row.
  select p.id into v_priv from hr.employee_private p
   where p.employee_id = p_employee_id and p.deleted_at is null
   limit 1;

  if v_priv is null then
    insert into hr.employee_private
      (organization_id, employee_id, ssn_ciphertext, ssn_key_id, ssn_hmac, ssn_last4)
    values (v_org, p_employee_id, p_ciphertext, p_key_id, p_hmac, p_last4)
    returning id into v_priv;
    v_created := true;
  else
    update hr.employee_private
       set ssn_ciphertext = p_ciphertext,
           ssn_key_id     = p_key_id,
           ssn_hmac       = p_hmac,
           ssn_last4      = p_last4
     where id = v_priv;
  end if;

  -- 🚨 basis MUST agree with is_self_access: hr.access_audit carries
  -- CHECK ((NOT is_self_access) OR (basis = 'self')). Both come from v_self so they cannot drift.
  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'write', p_target_token => 'hr_employee_private',
    p_purpose => 'identity_intake',
    p_basis => case when v_self then 'self' else 'role' end,
    p_granted => true, p_target_ids => array[v_priv], p_row_count => 1,
    p_sensitivity_tier => 'restricted', p_field_key => 'ssn',
    p_subject_employment_id => v_subject, p_is_self_access => v_self);

  -- the number itself is never returned and never logged; the hint is what the panel renders
  return jsonb_build_object('granted', true, 'employee_private_id', v_priv,
                            'audit_id', v_audit, 'created', v_created, 'ssn_last4', p_last4);
end
$function$;

CREATE OR REPLACE FUNCTION public.inv_create(p_target_type text, p_target_id uuid, p_email text, p_role text DEFAULT 'member'::text, p_org_id uuid DEFAULT NULL::uuid, p_invited_user_id uuid DEFAULT NULL::uuid, p_expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval))
 RETURNS iam.invitations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_personal boolean;
  v_actor_role text;
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
  v_resolved_user_id uuid;
  v_row iam.invitations;
begin
  if p_target_type not in ('organization', 'project', 'scope')
     or p_role not in ('owner', 'admin', 'member') then
    raise exception 'invalid invitation target or role' using errcode = '22023';
  end if;

  if p_target_type = 'scope' and p_role <> 'member' then
    raise exception 'scope invitations are member-only' using errcode = '42501';
  end if;

  if v_email is null or v_email = ''
     or p_expires_at is null
     or p_expires_at <= now() then
    raise exception 'invalid invitation email or expiry' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_target_type || ':' || p_target_id::text, 0)
  );

  -- DD-191: strict. A non-member never reaches the mint below.
  select
    container.resource_org_id,
    container.resource_is_personal,
    container.actor_role
  into v_org, v_personal, v_actor_role
  from iam._container_authz(p_target_type, p_target_id, v_uid) as container;

  if not found or v_org is null then
    perform platform.refuse_not_found('invitation target not found');
  end if;

  if p_org_id is not null and p_org_id is distinct from v_org then
    raise exception 'invitation target/organization mismatch'
      using errcode = '42501';
  end if;

  if not v_service then
    if v_personal or coalesce(v_actor_role, 'none') not in ('owner', 'admin') then
      raise exception 'invitation manager role required' using errcode = '42501';
    end if;

    if p_role = 'owner' and coalesce(v_actor_role, 'none') <> 'owner' then
      raise exception 'only an owner may invite another owner'
        using errcode = '42501';
    end if;

    if p_target_type = 'project' and p_role = 'owner' then
      raise exception 'project owner is not an invitational role'
        using errcode = '42501';
    end if;
  end if;

  select account.id
  into v_resolved_user_id
  from auth.users as account
  where pg_catalog.lower(account.email) = v_email
  order by account.created_at asc
  limit 1;

  if p_invited_user_id is not null
     and p_invited_user_id is distinct from v_resolved_user_id then
    raise exception 'invited user does not match invitation email'
      using errcode = '22023';
  end if;

  update iam.invitations
  set role = p_role,
      expires_at = p_expires_at,
      token = pg_catalog.gen_random_uuid()::text,
      status = 'pending',
      accepted_at = null,
      invited_user_id = v_resolved_user_id,
      updated_by = v_uid,
      updated_at = now()
  where target_type = p_target_type
    and target_id = p_target_id
    and organization_id = v_org
    and pg_catalog.lower(email) = v_email
    and status = 'pending'
    and deleted_at is null
  returning * into v_row;

  if v_row.id is null then
    insert into iam.invitations (
      organization_id,
      target_type,
      target_id,
      email,
      invited_user_id,
      role,
      status,
      expires_at,
      created_by,
      updated_by
    )
    values (
      v_org,
      p_target_type,
      p_target_id,
      v_email,
      v_resolved_user_id,
      p_role,
      'pending',
      p_expires_at,
      v_uid,
      v_uid
    )
    returning * into v_row;
  end if;

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inv_list(p_target_type text, p_target_id uuid)
 RETURNS TABLE(id uuid, organization_id uuid, target_type text, target_id uuid, email text, invited_user_id uuid, role text, status text, token text, expires_at timestamp with time zone, accepted_at timestamp with time zone, created_at timestamp with time zone, created_by uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_personal boolean;
  v_actor_role text;
begin
  -- DD-191: strict. A non-member never reaches the line below.
  select
    container.resource_org_id,
    container.resource_is_personal,
    container.actor_role
  into v_org, v_personal, v_actor_role
  from iam._container_authz(p_target_type, p_target_id, v_uid) as container;

  if not found or v_org is null then
    perform platform.refuse_not_found('invitation target not found');
  end if;

  if not v_service
     and (v_personal or coalesce(v_actor_role, 'none') not in ('owner', 'admin')) then
    raise exception 'invitation manager role required' using errcode = '42501';
  end if;

  return query
  select
    invitation.id,
    invitation.organization_id,
    invitation.target_type,
    invitation.target_id,
    invitation.email,
    invitation.invited_user_id,
    invitation.role,
    invitation.status,
    invitation.token,
    invitation.expires_at,
    invitation.accepted_at,
    invitation.created_at,
    invitation.created_by
  from iam.invitations as invitation
  where invitation.target_type = p_target_type
    and invitation.target_id = p_target_id
    and invitation.organization_id = v_org
    and invitation.deleted_at is null
  order by invitation.created_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_scope_type_items(p_scope_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_org_id uuid;
begin
  select st.organization_id
  into v_org_id
  from context.scope_types st
  where st.id = p_scope_type_id
    and st.deleted_at is null;

  if v_org_id is null then
    perform platform.refuse_not_found(format('active scope type %s not found', p_scope_type_id));
  end if;

  if (auth.role() = 'service_role' or iam.has_org_access(v_org_id)) is not true then
    raise exception 'not authorized for organization %', v_org_id
      using errcode = '42501';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', ci.id,
      'key', ci.key,
      'slug', ci.slug,
      'display_name', ci.display_name,
      'description', ci.description,
      'category', ci.category,
      'value_type', ci.value_type,
      'fetch_hint', ci.fetch_hint,
      'sensitivity', ci.sensitivity,
      'status', ci.status,
      'tags', ci.tags,
      'sort_order', ci.sort_order,
      'custom_component', ci.custom_component,
      'allowed_reference_types', ci.allowed_reference_types,
      'max_items', ci.max_items,
      'allowed_scope_type_ids', ci.allowed_scope_type_ids,
      'reference_source', ci.reference_source
    )
    order by ci.sort_order, ci.display_name
  )
  into v_result
  from context.context_items ci
  where ci.scope_type_id = p_scope_type_id
    and ci.is_active = true;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.mbr_add(p_container_type text, p_container_id uuid, p_user_id uuid, p_organization_id uuid, p_role text DEFAULT 'member'::text, p_status text DEFAULT 'active'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_creator uuid;
  v_personal boolean;
  v_actor_role text;
  v_target_id uuid;
  v_target_role text;
  v_bootstrap boolean;
  v_id uuid;
begin
  if p_container_type not in ('organization', 'project') then
    raise exception 'unsupported membership container type %', p_container_type
      using errcode = '22023';
  end if;

  if p_role not in ('owner', 'admin', 'member') then
    raise exception 'invalid membership role %', p_role
      using errcode = '22023';
  end if;

  if p_status is distinct from 'active' then
    raise exception 'invalid membership status %', p_status
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_container_type || ':' || p_container_id::text, 0));

  -- DD-191: LENIENT on purpose. The creator claiming the first owner membership of a brand-new
  -- container has no membership yet, so a strict helper would make bootstrap impossible. The
  -- authority below never reads a possibly-NULL actor_role without a coalesce.
  select
    container.resource_org_id, container.resource_creator,
    container.resource_is_personal, container.actor_role
  into v_org, v_creator, v_personal, v_actor_role
  from iam._container_authz(p_container_type, p_container_id, v_uid, false) as container;

  if not found or v_org is null then
    perform platform.refuse_not_found('membership container not found');
  end if;

  if p_organization_id is distinct from v_org then
    raise exception 'membership container/organization mismatch'
      using errcode = '42501';
  end if;

  select membership.id, membership.role
  into v_target_id, v_target_role
  from iam.memberships as membership
  where membership.container_type = p_container_type
    and membership.container_id = p_container_id
    and membership.organization_id = v_org
    and membership.user_id = p_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for update;

  v_bootstrap :=
    v_uid is not null
    and v_uid = v_creator
    and p_user_id = v_uid
    and p_role = 'owner'
    and not exists (
      select 1
      from iam.memberships as membership
      where membership.container_type = p_container_type
        and membership.container_id = p_container_id
        and membership.organization_id = v_org
        and membership.status = 'active'
        and membership.deleted_at is null
    );

  if not v_service and not v_bootstrap then
    if v_personal then
      raise exception 'personal organization memberships are immutable'
        using errcode = '42501';
    end if;

    -- DD-191: NULL-safe. A non-member lands on the else arm, never on a NULL that skips the chain.
    if coalesce(v_actor_role, 'none') = 'owner' then
      null;
    elsif coalesce(v_actor_role, 'none') = 'admin'
          and p_role in ('member', 'admin')
          and (v_target_role is null or v_target_role = 'member') then
      null;
    else
      raise exception 'membership manager role required'
        using errcode = '42501';
    end if;

    if p_container_type = 'project' and p_role = 'owner' then
      raise exception 'project owner role can only be established at bootstrap'
        using errcode = '42501';
    end if;
  end if;

  -- mbr_add is idempotent, not a second role-update surface. Existing live
  -- rows must go through mbr_update_role so last-owner rules cannot be bypassed.
  if v_target_id is not null then
    return v_target_id;
  end if;

  -- DD-162: THE ONE DOOR, asked about the write itself rather than about the branch that reached
  -- it. The bootstrap case lands on the "nothing actually moved" arm (the creator claiming their
  -- own first membership), the org-manager case on the organization arm, a project admin on the
  -- kernel arm, and the service role on its own.
  perform iam.assert_may_transfer('membership', v_creator, p_user_id, v_org,
                                  p_container_type, p_container_id);

  insert into iam.memberships (
    container_type, container_id, user_id, organization_id, role, status, metadata, created_by
  )
  values (
    p_container_type, p_container_id, p_user_id, v_org, p_role, 'active',
    coalesce(p_metadata, '{}'::jsonb), v_uid
  )
  on conflict (container_type, container_id, user_id)
  do update set
    organization_id = excluded.organization_id,
    role = excluded.role,
    status = 'active',
    metadata = excluded.metadata,
    deleted_at = null,
    updated_by = v_uid,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mbr_remove(p_container_type text, p_container_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_personal boolean;
  v_actor_role text;
  v_target_role text;
  v_owner_count integer;
begin
  if p_container_type not in ('organization', 'project') then
    raise exception 'unsupported membership container type %', p_container_type
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_container_type || ':' || p_container_id::text,
      0
    )
  );

  -- DD-191: strict. Every arm below belongs to someone who holds a role here.
  select
    container.resource_org_id,
    container.resource_is_personal,
    container.actor_role
  into v_org, v_personal, v_actor_role
  from iam._container_authz(p_container_type, p_container_id, v_uid) as container;

  if not found or v_org is null then
    perform platform.refuse_not_found('membership container not found');
  end if;

  select membership.role
  into v_target_role
  from iam.memberships as membership
  where membership.container_type = p_container_type
    and membership.container_id = p_container_id
    and membership.organization_id = v_org
    and membership.user_id = p_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for update;

  if not found then
    perform platform.refuse_not_found('membership not found');
  end if;

  if not v_service then
    -- DD-044: nobody ends up belonging to no organization. This is checked
    -- BEFORE the personal-organization guard so the person is told the real
    -- reason ("it is your only one") rather than an implementation word.
    if p_container_type = 'organization'
       and iam.is_last_organization(p_user_id, p_container_id) then
      if p_user_id = v_uid then
        raise exception
          'You can''t leave your only organization. Create or join another one first.'
          using errcode = '23514';
      else
        raise exception
          'This person can''t be removed from their only organization. They need to join or create another one first.'
          using errcode = '23514';
      end if;
    end if;

    -- DD-045 P3 owns this guard; DD-048 leaves it exactly as it was.
    if v_personal then
      raise exception 'personal organization memberships are immutable'
        using errcode = '42501';
    end if;

    if p_user_id = v_uid then
      null;
    elsif coalesce(v_actor_role, 'none') = 'owner' then
      null;
    -- R21: admins add and remove ADMINS and members. Only the owner is
    -- untouchable by an admin.
    elsif coalesce(v_actor_role, 'none') = 'admin' and coalesce(v_target_role, 'none') in ('member', 'admin') then
      null;
    elsif coalesce(v_target_role, 'none') = 'owner' then
      raise exception
        'The owner can''t be removed from their own organization. Transfer ownership first, then remove them.'
        using errcode = '42501';
    else
      raise exception
        'Only this organization''s owner and admins can remove someone, and anyone can remove themselves.'
        using errcode = '42501';
    end if;
  end if;

  if coalesce(v_target_role, 'none') = 'owner' then
    select count(*)::integer
    into v_owner_count
    from iam.memberships as membership
    where membership.container_type = p_container_type
      and membership.container_id = p_container_id
      and membership.organization_id = v_org
      and membership.role = 'owner'
      and membership.status = 'active'
      and membership.deleted_at is null;

    if v_owner_count <= 1 then
      raise exception 'cannot remove the last owner' using errcode = '23514';
    end if;
  end if;

  update iam.memberships
  set deleted_at = now(),
      updated_by = v_uid,
      updated_at = now()
  where container_type = p_container_type
    and container_id = p_container_id
    and organization_id = v_org
    and user_id = p_user_id
    and status = 'active'
    and deleted_at is null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mbr_update_role(p_container_type text, p_container_id uuid, p_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_personal boolean;
  v_actor_role text;
  v_target_role text;
  v_owner_count integer;
begin
  if p_container_type not in ('organization', 'project')
     or p_role not in ('owner', 'admin', 'member') then
    raise exception 'invalid membership role update' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_container_type || ':' || p_container_id::text,
      0
    )
  );

  -- DD-191: strict.
  select
    container.resource_org_id,
    container.resource_is_personal,
    container.actor_role
  into v_org, v_personal, v_actor_role
  from iam._container_authz(p_container_type, p_container_id, v_uid) as container;

  if not found or v_org is null then
    perform platform.refuse_not_found('membership container not found');
  end if;

  select membership.role
  into v_target_role
  from iam.memberships as membership
  where membership.container_type = p_container_type
    and membership.container_id = p_container_id
    and membership.organization_id = v_org
    and membership.user_id = p_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for update;

  if not found then
    perform platform.refuse_not_found('membership not found');
  end if;

  if not v_service then
    -- DD-045 P3 owns this guard; DD-048 leaves it exactly as it was.
    if v_personal then
      raise exception 'personal organization memberships are immutable'
        using errcode = '42501';
    end if;

    if p_container_type = 'organization' then
      -- R21: one owner per organization. Ownership moves ONLY through
      -- transfer_organization_ownership, which demotes the outgoing owner in
      -- the same step. A role update may never mint a second owner.
      if p_role = 'owner' and v_target_role is distinct from 'owner' then
        raise exception
          'An organization can have exactly one owner. Use Transfer ownership to hand it to someone else.'
          using errcode = '23514';
      end if;

      if coalesce(v_actor_role, 'none') = 'owner' then
        null;
      -- R21: admins add and remove ADMINS and members. Only the owner is
      -- untouchable by an admin.
      elsif coalesce(v_actor_role, 'none') = 'admin'
            and coalesce(v_target_role, 'none') in ('member', 'admin')
            and p_role in ('member', 'admin') then
        null;
      elsif coalesce(v_target_role, 'none') = 'owner' then
        raise exception
          'The owner''s role can only be changed by transferring ownership, and only the owner can do that.'
          using errcode = '42501';
      else
        raise exception
          'Only this organization''s owner and admins can change what someone''s role is here.'
          using errcode = '42501';
      end if;
    elsif coalesce(v_actor_role, 'none') is distinct from 'owner' or p_role = 'owner' then
      raise exception 'project owner role required' using errcode = '42501';
    end if;
  end if;

  if coalesce(v_target_role, 'none') = 'owner' and p_role <> 'owner' then
    select count(*)::integer
    into v_owner_count
    from iam.memberships as membership
    where membership.container_type = p_container_type
      and membership.container_id = p_container_id
      and membership.organization_id = v_org
      and membership.role = 'owner'
      and membership.status = 'active'
      and membership.deleted_at is null;

    if v_owner_count <= 1 then
      raise exception 'cannot demote the last owner' using errcode = '23514';
    end if;
  end if;

  update iam.memberships
  set role = p_role,
      updated_by = v_uid,
      updated_at = now()
  where container_type = p_container_type
    and container_id = p_container_id
    and organization_id = v_org
    and user_id = p_user_id
    and status = 'active'
    and deleted_at is null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.move_file(p_file_id uuid, p_new_parent_folder_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_owner uuid; v_name text; v_old_path text; v_folder_path text;
        v_folder_owner uuid; v_folder_org uuid; v_file_org uuid; v_new_path text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT iam.has_access('file', p_file_id, 'editor') THEN
    RAISE EXCEPTION 'forbidden: not authorized to move file %', p_file_id USING ERRCODE='42501';
  END IF;

  SELECT created_by, file_name, file_path, organization_id
    INTO v_owner, v_name, v_old_path, v_file_org
    FROM files.files WHERE id = p_file_id AND deleted_at IS NULL;
  IF v_owner IS NULL THEN
    perform platform.refuse_not_found(format('file %s not found', p_file_id));
  END IF;

  IF p_new_parent_folder_id IS NULL THEN
    v_folder_path := '';
    v_folder_org  := v_file_org;
  ELSE
    SELECT created_by, folder_path, organization_id
      INTO v_folder_owner, v_folder_path, v_folder_org
      FROM files.folders WHERE id = p_new_parent_folder_id AND deleted_at IS NULL;
    IF v_folder_owner IS NULL THEN
      perform platform.refuse_not_found(format('folder %s not found', p_new_parent_folder_id));
    END IF;
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('folder', p_new_parent_folder_id, 'editor') THEN
      RAISE EXCEPTION 'forbidden: not authorized to move into folder %', p_new_parent_folder_id
        USING ERRCODE='42501';
    END IF;
    v_folder_path := trim(both '/' from coalesce(v_folder_path, ''));
  END IF;

  IF v_folder_org IS DISTINCT FROM v_file_org THEN
    RAISE EXCEPTION 'cross-organization move refused: file % belongs to organization %, folder % to organization %',
      p_file_id, v_file_org, p_new_parent_folder_id, v_folder_org USING ERRCODE='42501';
  END IF;

  v_new_path := CASE WHEN v_folder_path = '' THEN v_name ELSE v_folder_path || '/' || v_name END;
  -- Announce the primitive to files.guard_rename_path_columns (migration 038),
  -- transaction-local and scoped to THIS row, then withdraw it immediately so a
  -- later hand UPDATE in the same transaction is still refused.
  PERFORM set_config('matrx.rename_primitive', p_file_id::text, true);
  UPDATE files.files
     SET parent_folder_id = p_new_parent_folder_id,
         file_path        = v_new_path,
         updated_at       = now()
   WHERE id = p_file_id;

  PERFORM set_config('matrx.rename_primitive', '', true);

  RETURN jsonb_build_object('file_id', p_file_id, 'old_path', v_old_path,
                            'new_path', v_new_path, 'folder_id', p_new_parent_folder_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.move_site_to_organization(p_site_id uuid, p_target_organization_id uuid, p_expected_version integer DEFAULT NULL::integer, p_brand_action text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_is_super boolean;
  v_site record;
  v_target record;
  v_source_name text;
  v_rows bigint;
  v_moved jsonb := '[]'::jsonb;
  v_preserved jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_brand record;
  v_brand_organization_name text;
  v_brand_action text;
  v_brand_strays bigint;
  v_brand_outcome jsonb := null;
  rec record;
begin
  if v_uid is null then
    raise exception using errcode = '42501',
      message = 'Sign in to move a site between organizations.';
  end if;
  if p_brand_action is not null and p_brand_action not in ('move_brand', 'detach', 'keep') then
    raise exception using errcode = '22023',
      message = format('Unknown brand action "%s".', p_brand_action),
      hint = 'Use move_brand, detach, or keep.';
  end if;
  v_is_super := coalesce(public.is_super_admin_for(v_uid), false);

  -- Lock the site for the whole move so a concurrent rename/delete cannot
  -- interleave. SECURITY DEFINER bypasses RLS, so every check below is ours.
  select s.id, s.name, s.domain, s.organization_id, s.created_by, s.version,
         s.deleted_at, s.brand_id
    into v_site
  from web.site s
  where s.id = p_site_id
  for update;

  if v_site.id is null then
    perform platform.refuse_not_found('That site does not exist.');
  end if;

  -- Same answer for "hidden from you" as the rest of the platform gives, so a
  -- caller who cannot see the site learns nothing about it.
  if not (v_is_super
          or v_site.created_by = v_uid
          or iam.has_access_for(v_uid, 'web_site', p_site_id, 'viewer')) then
    perform platform.refuse_not_found('That site does not exist.');
  end if;

  if v_site.deleted_at is not null then
    raise exception using errcode = '55000',
      message = 'This site is in the trash. Restore it before moving it to another organization.';
  end if;

  -- ADMIN on the site, not editor: re-homing decides who can reach every row
  -- under it (THE GOVERNANCE-COLUMN TIER).
  if not (v_is_super
          or v_site.created_by = v_uid
          or iam.has_access_for(v_uid, 'web_site', p_site_id, 'admin')) then
    raise exception using errcode = '42501',
      message = format('Moving %s to another organization requires owner or admin access to the site.', v_site.name),
      detail  = 'Edit access is not enough: the move changes who can reach the site and all of its data.',
      hint    = 'Ask the site owner to move it, or request admin access to it first.';
  end if;

  if p_expected_version is not null and v_site.version is distinct from p_expected_version then
    raise exception using errcode = '40001',
      message = 'This site changed while you were looking at it. Reload and try the move again.';
  end if;

  select o.id, o.name into v_target
  from iam.organizations o
  where o.id = p_target_organization_id;

  if v_target.id is null then
    perform platform.refuse_not_found('That organization does not exist.');
  end if;

  -- Placing a site in an org is membership-gated everywhere else (web.site's
  -- std_insert policy is iam.has_org_access(organization_id)); the destination
  -- bar here is the same one, no tighter.
  if not (v_is_super or iam.has_org_access_for(v_uid, p_target_organization_id)) then
    raise exception using errcode = '42501',
      message = format('You are not a member of %s, so you cannot move a site into it.', v_target.name),
      hint    = 'Ask an owner of that organization to invite you first.';
  end if;

  select o.name into v_source_name from iam.organizations o where o.id = v_site.organization_id;

  -- ------------------------------------------------------- the brand's fate
  -- Resolved BEFORE the same-organization fast path as well as before a move.
  -- A site can already be in its intended organization while its parent brand
  -- is stranded elsewhere; returning early in that state preserves the exact
  -- containment access hole this RPC exists to close.
  if v_site.brand_id is not null then
    select b.id, b.name, b.organization_id into v_brand
    from web.brand b where b.id = v_site.brand_id;
    select o.name into v_brand_organization_name
    from iam.organizations o where o.id = v_brand.organization_id;
  end if;

  if v_brand.id is not null and v_brand.organization_id is distinct from p_target_organization_id then
    v_brand_action := p_brand_action;

    if v_brand_action is null then
      raise exception using errcode = '22023',
        message = format('%s belongs to the brand "%s", which stays in %s.',
                         v_site.name, v_brand.name,
                         coalesce(v_brand_organization_name, 'another organization')),
        detail  = 'A brand conveys access to every site inside it, so leaving it behind '
               || 'lets members of the old organization keep reading this site.',
        hint    = 'Choose: move the brand too, detach this site from the brand, or '
               || 'knowingly keep the brand where it is.';
    end if;

    if v_brand_action = 'move_brand' then
      -- Moving a brand moves what it conveys. If it still holds sites that are
      -- not going along, this would hand the destination org access to them.
      select count(*) into v_brand_strays
      from web.site s
      where s.brand_id = v_brand.id
        and s.id <> p_site_id
        and s.deleted_at is null
        and s.organization_id is distinct from p_target_organization_id;

      if v_brand_strays > 0 then
        raise exception using errcode = '22023',
          message = format('"%s" still has %s other site(s) outside %s, so the brand cannot move with this one.',
                           v_brand.name, v_brand_strays, v_target.name),
          detail  = 'Moving the brand would give the destination organization access to those sites too.',
          hint    = 'Move those sites first, or detach this site from the brand instead.';
      end if;

      update web.brand
         set organization_id = p_target_organization_id,
             updated_by = v_uid,
             updated_at = now()
       where id = v_brand.id;
      v_brand_outcome := jsonb_build_object('action', 'moved', 'id', v_brand.id, 'name', v_brand.name);

    elsif v_brand_action = 'detach' then
      update web.site set brand_id = null where id = p_site_id;
      v_brand_outcome := jsonb_build_object('action', 'detached', 'id', v_brand.id, 'name', v_brand.name);

    else
      v_brand_outcome := jsonb_build_object(
        'action', 'kept',
        'id', v_brand.id,
        'name', v_brand.name,
        'organization_id', v_brand.organization_id,
        'warning', format('Members of %s can still reach this site through the brand "%s".',
                          coalesce(v_source_name, 'the previous organization'), v_brand.name));
    end if;
  end if;

  if v_site.organization_id = p_target_organization_id then
    return jsonb_build_object(
      'moved', false,
      'reason', case
                  when v_brand_outcome is null then 'already_there'
                  when v_brand_outcome ->> 'action' = 'kept' then 'brand_kept'
                  else 'brand_reconciled'
                end,
      'site_id', p_site_id,
      'site_name', v_site.name,
      'organization_id', p_target_organization_id,
      'organization_name', v_target.name,
      'moved_tables', case when v_brand_outcome is null
                                  or v_brand_outcome ->> 'action' = 'kept'
                           then '[]'::jsonb
                           else jsonb_build_array(
                             jsonb_build_object('table', 'web.brand', 'rows', 1)) end,
      'preserved_tables', '[]'::jsonb,
      'rows_moved', case when v_brand_outcome is null
                               or v_brand_outcome ->> 'action' = 'kept'
                         then 0 else 1 end,
      'brand', v_brand_outcome
    );
  end if;

  -- THE SITE ROW MOVES FIRST, and that is not a style choice:
  -- web.enforce_site_component_organization() is a BEFORE INSERT/UPDATE trigger
  -- on the web.* children that REJECTS any child whose organization_id differs
  -- from its parent site's. Touch a child while the site still points at the
  -- old org and the move dies with 23514. Atomicity does not depend on the
  -- order — every statement below is in this one transaction, so a failure
  -- anywhere rolls the site row back with it.
  update web.site
     set organization_id = p_target_organization_id,
         updated_by = v_uid,
         updated_at = now()
   where id = p_site_id;
  v_total := 1;
  v_moved := jsonb_build_array(jsonb_build_object('table', 'web.site', 'rows', 1));

  -- ---------------------------------------------------------------- children
  for rec in
    -- (a) DIRECT: organization_id + a single-column FK straight to web.site.
    select n.nspname as sch, c.relname as tbl,
           format('update %I.%I t set organization_id = $1
                    where t.%I = $2 and t.organization_id is distinct from $1',
                  n.nspname, c.relname, a.attname) as stmt,
           exists (
             select 1 from pg_catalog.pg_trigger tg
             join pg_catalog.pg_proc pr on pr.oid = tg.tgfoid
             where tg.tgrelid = c.oid and not tg.tgisinternal
               and (tg.tgtype & 2) <> 0 and (tg.tgtype & 16) <> 0
               and pr.proname ~ '(immutable|append_only|_fact_mutation)'
           ) as immutable
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a
      on a.attrelid = con.conrelid and a.attnum = con.conkey[1] and not a.attisdropped
    where con.contype = 'f'
      and con.confrelid = 'web.site'::regclass
      and array_length(con.conkey, 1) = 1
      and c.relkind = 'r'
      and n.nspname not in ('graveyard', 'pg_catalog')
      and exists (
        select 1 from pg_catalog.pg_attribute o
        where o.attrelid = c.oid and o.attname = 'organization_id' and not o.attisdropped
      )

    union all

    -- (b) INDIRECT: site-owned rows that carry organization_id but reach the
    -- site only through a parent. There is no structural rule for these, so
    -- they are named. Deliberately absent: seo.keyword_market and
    -- seo.keyword_market_observation (shared market dimensions, not site data).
    select v.sch, v.tbl,
           format('update %I.%I t set organization_id = $1
                     where t.organization_id is distinct from $1
                       and exists (select 1 from %I.%I p
                                    where p.id = t.%I and p.%I = $2)',
                  v.sch, v.tbl, v.psch, v.ptbl, v.fk, v.psite) as stmt,
           false as immutable
    from (values
      ('plan', 'cms_fill_item',          'job_id',         'plan', 'cms_fill_job', 'web_site_id'),
      ('seo',  'competitor_observation', 'competitor_id',  'seo',  'competitor',   'site_id'),
      ('seo',  'rank_observation',       'rank_target_id', 'seo',  'rank_target',  'site_id'),
      ('seo',  'serp_snapshot',          'rank_target_id', 'seo',  'rank_target',  'site_id')
    ) as v(sch, tbl, fk, psch, ptbl, psite)
    order by 1, 2
  loop
    if rec.immutable then
      v_preserved := v_preserved || jsonb_build_object(
        'table', rec.sch || '.' || rec.tbl,
        'reason', 'append_only_fact');
      continue;
    end if;

    begin
      execute rec.stmt using p_target_organization_id, p_site_id;
      get diagnostics v_rows = row_count;
      if v_rows > 0 then
        v_moved := v_moved || jsonb_build_object(
          'table', rec.sch || '.' || rec.tbl, 'rows', v_rows);
        v_total := v_total + v_rows;
      end if;
    exception
      -- Backstop for an append-only table the trigger-name probe did not
      -- recognize. The failed statement rolls back to this block's implicit
      -- savepoint; the rest of the move continues in the same transaction.
      when sqlstate '55000' then
        v_preserved := v_preserved || jsonb_build_object(
          'table', rec.sch || '.' || rec.tbl,
          'reason', 'append_only_fact');
    end;
  end loop;

  return jsonb_build_object(
    'moved', true,
    'site_id', p_site_id,
    'site_name', v_site.name,
    'site_domain', v_site.domain,
    'from_organization_id', v_site.organization_id,
    'from_organization_name', v_source_name,
    'organization_id', p_target_organization_id,
    'organization_name', v_target.name,
    'moved_tables', v_moved,
    'preserved_tables', v_preserved,
    'rows_moved', v_total,
    'brand', v_brand_outcome
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.page_extraction_clear_job_results(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'docproc', 'public'
AS $function$
BEGIN
  DELETE FROM docproc.page_extraction_results   WHERE job_id = p_job_id;
  DELETE FROM docproc.page_extraction_page_runs WHERE job_id = p_job_id;
  DELETE FROM docproc.page_extraction_runs      WHERE job_id = p_job_id;

  UPDATE docproc.page_extraction_jobs
     SET latest_run_id = null, updated_at = now()
   WHERE id = p_job_id;

  IF NOT FOUND THEN
    perform platform.refuse_not_found(format('extraction dataset %s is not available to this account — it may not exist, or your access may not reach it', p_job_id));
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.preview_site_organization_move(p_site_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_is_super boolean;
  v_site record;
  v_rows bigint;
  v_moved jsonb := '[]'::jsonb;
  v_preserved jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_brand record;
  v_brand_siblings bigint;
  rec record;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sign in to preview a site move.';
  end if;
  v_is_super := coalesce(public.is_super_admin_for(v_uid), false);

  select s.id, s.name, s.organization_id, s.created_by, s.brand_id into v_site
  from web.site s where s.id = p_site_id;

  if v_site.id is null
     or not (v_is_super or v_site.created_by = v_uid
             or iam.has_access_for(v_uid, 'web_site', p_site_id, 'viewer')) then
    perform platform.refuse_not_found('That site does not exist.');
  end if;

  for rec in
    select n.nspname as sch, c.relname as tbl,
           format('select count(*) from %I.%I t where t.%I = $1',
                  n.nspname, c.relname, a.attname) as stmt,
           exists (
             select 1 from pg_catalog.pg_trigger tg
             join pg_catalog.pg_proc pr on pr.oid = tg.tgfoid
             where tg.tgrelid = c.oid and not tg.tgisinternal
               and (tg.tgtype & 2) <> 0 and (tg.tgtype & 16) <> 0
               and pr.proname ~ '(immutable|append_only|_fact_mutation)'
           ) as immutable
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a
      on a.attrelid = con.conrelid and a.attnum = con.conkey[1] and not a.attisdropped
    where con.contype = 'f'
      and con.confrelid = 'web.site'::regclass
      and array_length(con.conkey, 1) = 1
      and c.relkind = 'r'
      and n.nspname not in ('graveyard', 'pg_catalog')
      and exists (
        select 1 from pg_catalog.pg_attribute o
        where o.attrelid = c.oid and o.attname = 'organization_id' and not o.attisdropped
      )
    union all
    select v.sch, v.tbl,
           format('select count(*) from %I.%I t where exists '
                  '(select 1 from %I.%I p where p.id = t.%I and p.%I = $1)',
                  v.sch, v.tbl, v.psch, v.ptbl, v.fk, v.psite) as stmt,
           false as immutable
    from (values
      ('plan', 'cms_fill_item',          'job_id',         'plan', 'cms_fill_job', 'web_site_id'),
      ('seo',  'competitor_observation', 'competitor_id',  'seo',  'competitor',   'site_id'),
      ('seo',  'rank_observation',       'rank_target_id', 'seo',  'rank_target',  'site_id'),
      ('seo',  'serp_snapshot',          'rank_target_id', 'seo',  'rank_target',  'site_id')
    ) as v(sch, tbl, fk, psch, ptbl, psite)
    order by 1, 2
  loop
    execute rec.stmt into v_rows using p_site_id;
    if v_rows > 0 then
      if rec.immutable then
        v_preserved := v_preserved || jsonb_build_object(
          'table', rec.sch || '.' || rec.tbl, 'rows', v_rows, 'reason', 'append_only_fact');
      else
        v_moved := v_moved || jsonb_build_object(
          'table', rec.sch || '.' || rec.tbl, 'rows', v_rows);
        v_total := v_total + v_rows;
      end if;
    end if;
  end loop;

  if v_site.brand_id is not null then
    select b.id, b.name, b.organization_id into v_brand
    from web.brand b where b.id = v_site.brand_id;
    -- Live sibling sites under the same brand. If there are any, 'move_brand'
    -- is only offered when they are all going to the same place, so the UI
    -- needs the count to explain why.
    select count(*) into v_brand_siblings
    from web.site s
    where s.brand_id = v_brand.id and s.id <> p_site_id and s.deleted_at is null;
  end if;

  return jsonb_build_object(
    'site_id', p_site_id,
    'site_name', v_site.name,
    'organization_id', v_site.organization_id,
    'moved_tables', v_moved,
    'preserved_tables', v_preserved,
    'rows_moved', v_total + 1,
    'brand', case when v_brand.id is not null
                  then jsonb_build_object('id', v_brand.id, 'name', v_brand.name,
                                          'organization_id', v_brand.organization_id,
                                          'other_sites', coalesce(v_brand_siblings, 0))
                  else null end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rename_file(p_file_id uuid, p_new_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_owner uuid; v_old_path text; v_parent uuid; v_new_path text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT iam.has_access('file', p_file_id, 'editor') THEN
    RAISE EXCEPTION 'forbidden: not authorized to rename file %', p_file_id USING ERRCODE='42501';
  END IF;
  SELECT created_by, file_path, parent_folder_id INTO v_owner, v_old_path, v_parent
    FROM files.files WHERE id = p_file_id AND deleted_at IS NULL;
  IF v_owner IS NULL THEN
    perform platform.refuse_not_found(format('file %s not found', p_file_id));
  END IF;

  p_new_name := files.assert_safe_file_name(p_new_name);

  v_new_path := CASE WHEN position('/' in v_old_path) = 0 THEN p_new_name
                     ELSE regexp_replace(v_old_path, '[^/]+$', '') || p_new_name END;
  -- Announce the primitive to files.guard_rename_path_columns (migration 038),
  -- transaction-local and scoped to THIS row, then withdraw it immediately so a
  -- later hand UPDATE in the same transaction is still refused.
  PERFORM set_config('matrx.rename_primitive', p_file_id::text, true);
  UPDATE files.files
     SET file_name = p_new_name, file_path = v_new_path, updated_at = now()
   WHERE id = p_file_id;
  PERFORM set_config('matrx.rename_primitive', '', true);                       -- 23505 propagates: the caller gets 409
  RETURN jsonb_build_object('file_id', p_file_id, 'old_path', v_old_path,
                            'new_path', v_new_path, 'file_name', p_new_name);
END; $function$;

CREATE OR REPLACE FUNCTION public.rename_folder(p_folder_id uuid, p_new_path text, p_new_parent_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_owner UUID;
    v_old_path TEXT;
    v_new_name TEXT;
    v_descendants_files INT;
    v_descendants_folders INT;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('folder', p_folder_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to rename folder %', p_folder_id USING ERRCODE = '42501';
    END IF;
    IF p_new_parent_id IS NOT NULL AND auth.uid() IS NOT NULL
       AND NOT iam.has_access('folder', p_new_parent_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to move into folder %', p_new_parent_id USING ERRCODE = '42501';
    END IF;
    SELECT created_by, folder_path INTO v_owner, v_old_path
      FROM files.folders WHERE id = p_folder_id AND deleted_at IS NULL;
    IF v_owner IS NULL THEN
        perform platform.refuse_not_found(format('folder %s not found', p_folder_id));
    END IF;

    p_new_path := trim(both '/' from p_new_path);
    v_new_name := split_part(p_new_path, '/', GREATEST(array_length(string_to_array(p_new_path, '/'), 1), 1));

    UPDATE files.folders
       SET folder_path = p_new_path,
           folder_name = v_new_name,
           parent_id   = COALESCE(p_new_parent_id, parent_id),
           updated_at  = now()
     WHERE id = p_folder_id;

    UPDATE files.folders
       SET folder_path = p_new_path || substring(folder_path FROM length(v_old_path) + 1),
           updated_at  = now()
     WHERE created_by = v_owner
       AND folder_path LIKE v_old_path || '/%'
       AND deleted_at IS NULL;
    GET DIAGNOSTICS v_descendants_folders = ROW_COUNT;

    PERFORM set_config('matrx.rename_primitive', 'subtree', true);
    UPDATE files.files
       SET file_path  = p_new_path || substring(file_path FROM length(v_old_path) + 1),
           updated_at = now()
     WHERE created_by = v_owner
       AND file_path LIKE v_old_path || '/%'
       AND deleted_at IS NULL;
    GET DIAGNOSTICS v_descendants_files = ROW_COUNT;
    PERFORM set_config('matrx.rename_primitive', '', true);

    RETURN jsonb_build_object(
        'old_path', v_old_path,
        'new_path', p_new_path,
        'descendant_folders', v_descendants_folders,
        'descendant_files', v_descendants_files
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.research_topic_resource_manifest(p_topic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_topic research.rs_topic; v_result jsonb;
BEGIN
  SELECT * INTO v_topic FROM research.rs_topic WHERE id = p_topic_id;
  IF NOT FOUND THEN
    perform platform.refuse_not_found(format('research topic %s not found or not accessible', p_topic_id));
  END IF;
  WITH latest_analysis AS (
    SELECT DISTINCT ON (source_id) id, source_id FROM research.rs_analysis
    WHERE topic_id=p_topic_id AND agent_type='page_summary'
    ORDER BY source_id, updated_at DESC, created_at DESC NULLS LAST, id DESC
  ),
  items AS (
    SELECT 'search.result'::text AS k, s.id AS id, NULL::uuid AS p,
      left(coalesce(s.title,s.url),140) AS l, s.hostname AS s2,
      coalesce(length(s.url),0) + coalesce(length(s.page_age),0)
        + coalesce(length(s.title),0) + coalesce(length(s.description),0)
        + coalesce(length(s.extra_snippets::text),0) AS c,
      s.scrape_status AS st, coalesce(s.last_seen_at,s.discovered_at) AS t,
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'authority',s.authority_score,
        'tier',s.authority_tier,'hostname',s.hostname,'url',s.url,'origin',s.origin,'type',s.source_type)) AS f
    FROM research.rs_source s WHERE s.topic_id=p_topic_id
    UNION ALL
    SELECT 'search.raw', s.id, NULL::uuid, left(coalesce(s.title,s.url),140), s.hostname,
      length(s.raw_search_result::text), NULL, coalesce(s.last_seen_at,s.discovered_at),
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'hostname',s.hostname,
        'authority',s.authority_score,'tier',s.authority_tier))
    FROM research.rs_source s WHERE s.topic_id=p_topic_id AND s.raw_search_result IS NOT NULL
    UNION ALL
    SELECT 'search.keyword_serp', k.id, k.id, left(k.keyword,140), k.search_provider,
      length(k.raw_api_response::text), NULL, k.last_searched_at,
      jsonb_strip_nulls(jsonb_build_object('provider',k.search_provider,'result_count',k.result_count))
    FROM research.rs_keyword k WHERE k.topic_id=p_topic_id AND k.raw_api_response IS NOT NULL
    UNION ALL
    SELECT 'page.content', c.id, c.source_id, left(coalesce(s.title,s.url,'Untitled page'),140), s.hostname,
      coalesce(c.char_count,length(c.content),0),
      CASE WHEN c.is_good_scrape THEN 'success' ELSE 'poor' END,
      coalesce(c.scraped_at,c.updated_at),
      jsonb_strip_nulls(jsonb_build_object('good_scrape',c.is_good_scrape,'included',s.is_included,
        'hostname',s.hostname,'authority',s.authority_score,'tier',s.authority_tier,
        'edited',(c.original_content IS NOT NULL),'capture',c.capture_method))
    FROM research.rs_content c JOIN research.rs_source s ON s.id=c.source_id
    WHERE c.topic_id=p_topic_id AND c.is_current=true
    UNION ALL
    SELECT 'page.analysis', a.id, a.source_id, left(coalesce(s.title,s.url,'Untitled page'),140), a.agent_type,
      coalesce(length(a.result),0), a.status, coalesce(a.updated_at,a.created_at),
      jsonb_strip_nulls(jsonb_build_object('agent_type',a.agent_type,'latest',(la.id IS NOT NULL),
        'included',s.is_included,'hostname',s.hostname,'authority',s.authority_score,'tier',s.authority_tier))
    FROM research.rs_analysis a LEFT JOIN research.rs_source s ON s.id=a.source_id
    LEFT JOIN latest_analysis la ON la.id=a.id WHERE a.topic_id=p_topic_id
    UNION ALL
    SELECT 'page.scoring', s.id, s.id, left(coalesce(s.title,s.url),140), s.recommended_use,
      length(s.page_analysis::text), s.analysis_status, coalesce(s.authority_ranked_at,s.updated_at),
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'hostname',s.hostname,
        'pre_read',s.pre_read_score,'post_read',s.post_read_score,'final',s.final_source_score,
        'recommended_use',s.recommended_use,'authority',s.authority_score,'tier',s.authority_tier))
    FROM research.rs_source s WHERE s.topic_id=p_topic_id AND s.page_analysis IS NOT NULL
    UNION ALL
    SELECT 'page.links', c.id, c.source_id, left(coalesce(s.title,s.url),140), s.hostname,
      length(c.extracted_links::text), NULL, coalesce(c.scraped_at,c.updated_at),
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'hostname',s.hostname,
        'count',jsonb_array_length(c.extracted_links)))
    FROM research.rs_content c JOIN research.rs_source s ON s.id=c.source_id
    WHERE c.topic_id=p_topic_id AND c.is_current=true AND jsonb_typeof(c.extracted_links)='array'
      AND jsonb_array_length(c.extracted_links)>0
    UNION ALL
    SELECT 'page.images', c.id, c.source_id, left(coalesce(s.title,s.url),140), s.hostname,
      length(c.extracted_images::text), NULL, coalesce(c.scraped_at,c.updated_at),
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'hostname',s.hostname,
        'count',jsonb_array_length(c.extracted_images)))
    FROM research.rs_content c JOIN research.rs_source s ON s.id=c.source_id
    WHERE c.topic_id=p_topic_id AND c.is_current=true AND jsonb_typeof(c.extracted_images)='array'
      AND jsonb_array_length(c.extracted_images)>0
    UNION ALL
    SELECT 'synthesis.keyword', y.id, y.keyword_id, left(coalesce(k.keyword,'Keyword synthesis'),140), y.model_id,
      coalesce(length(y.result),coalesce(length(y.result_structured::text),0)), y.status,
      coalesce(y.updated_at,y.created_at),
      jsonb_strip_nulls(jsonb_build_object('current',y.is_current,'version',y.version,
        'keyword_id',y.keyword_id,'iteration',y.iteration_mode))
    FROM research.rs_synthesis y LEFT JOIN research.rs_keyword k ON k.id=y.keyword_id
    WHERE y.topic_id=p_topic_id AND y.scope='keyword'
    UNION ALL
    SELECT 'synthesis.tag', y.id, y.tag_id, left(coalesce(g.name,'Tag consolidation'),140), y.model_id,
      coalesce(length(y.result),coalesce(length(y.result_structured::text),0)), y.status,
      coalesce(y.updated_at,y.created_at),
      jsonb_strip_nulls(jsonb_build_object('current',y.is_current,'version',y.version,'tag_id',y.tag_id))
    FROM research.rs_synthesis y LEFT JOIN research.rs_tag g ON g.id=y.tag_id
    WHERE y.topic_id=p_topic_id AND y.tag_id IS NOT NULL AND y.scope<>'keyword'
    UNION ALL
    SELECT 'synthesis.topic', y.id, NULL::uuid, left(coalesce(v_topic.name,'Topic report'),140), y.model_id,
      coalesce(length(y.result),coalesce(length(y.result_structured::text),0)), y.status,
      coalesce(y.updated_at,y.created_at),
      jsonb_strip_nulls(jsonb_build_object('current',y.is_current,'version',y.version))
    FROM research.rs_synthesis y WHERE y.topic_id=p_topic_id
      AND y.scope IN ('topic','project') AND y.tag_id IS NULL
    UNION ALL
    SELECT 'document.report', d.id, NULL::uuid, left(coalesce(d.title,'Document'),140), d.model_id,
      coalesce(length(d.content),0), d.status, coalesce(d.updated_at,d.created_at),
      jsonb_strip_nulls(jsonb_build_object('current',d.is_current,'version',d.version))
    FROM research.rs_document d WHERE d.topic_id=p_topic_id
    UNION ALL
    SELECT 'media.items', m.id, m.source_id,
      left(coalesce(nullif(m.alt_text,''),nullif(m.caption,''),m.url),140), m.media_type,
      coalesce(length(m.alt_text),0)+coalesce(length(m.caption),0)+coalesce(length(m.url),0),
      NULL, m.created_at,
      jsonb_strip_nulls(jsonb_build_object('relevant',m.is_relevant,'type',m.media_type,'url',m.url,
        'thumbnail',m.thumbnail_url,'width',m.width,'height',m.height))
    FROM research.rs_media m WHERE m.topic_id=p_topic_id
  ),
  edges AS (
    SELECT sk.id AS source_id, sk.keyword_id, sk.rank_for_keyword AS rank
    FROM research.rs_source_keywords sk WHERE sk.topic_id=p_topic_id AND sk.keyword_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'topic_id',p_topic_id,'generated_at',now(),
    'topic',jsonb_build_object('id',v_topic.id,'name',v_topic.name,'description',v_topic.description,
      'tone_profile',v_topic.tone_profile,'status',v_topic.status,'created_at',v_topic.created_at),
    'keywords',coalesce((SELECT jsonb_agg(jsonb_build_object('id',k.id,'keyword',k.keyword,'position',k.position,
      'searched_at',k.last_searched_at,'stale',k.is_stale,'result_count',k.result_count)
      ORDER BY k.position NULLS LAST,k.created_at) FROM research.rs_keyword k WHERE k.topic_id=p_topic_id),'[]'::jsonb),
    'tags',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'description',g.description,
      'sort_order',g.sort_order) ORDER BY g.sort_order NULLS LAST,g.name)
      FROM research.rs_tag g WHERE g.topic_id=p_topic_id),'[]'::jsonb),
    'tag_sources',coalesce((SELECT jsonb_agg(jsonb_build_array(a.target_id,a.source_id))
      FROM platform.associations_live a WHERE a.source_type='research_source' AND a.target_type='research_tag'
        AND a.target_id IN (SELECT id FROM research.rs_tag WHERE topic_id=p_topic_id)),'[]'::jsonb),
    'edges',coalesce((SELECT jsonb_agg(jsonb_build_array(e.source_id,e.keyword_id,e.rank)) FROM edges e),'[]'::jsonb),
    'kinds',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',g.k,'item_count',g.n,'chars',g.chars) ORDER BY g.k)
      FROM (SELECT k,count(*) AS n,coalesce(sum(c),0) AS chars FROM items GROUP BY k) g),'[]'::jsonb),
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('k',i.k,'id',i.id,'p',i.p,'l',i.l,'s',i.s2,
      'c',coalesce(i.c,0),'st',i.st,'t',i.t,'f',i.f)) FROM items i),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $function$;

CREATE OR REPLACE FUNCTION public.restore_scope_type(p_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_removed_at timestamptz;
  v_scope_count integer;
  v_item_count integer;
begin
  select scope_type.organization_id, scope_type.deleted_at
  into v_org, v_removed_at
  from context.scope_types as scope_type
  where scope_type.id = p_type_id
    and scope_type.deleted_at is not null;

  if v_org is null then
    perform platform.refuse_not_found('scope type not found, or it was never removed');
  end if;

  -- The same membership test the removal made. Restoring is as consequential as
  -- removing: it puts rows back in front of everyone in the organization.
  if auth.role() <> 'service_role'
     and not exists (
       select 1
       from iam.memberships as membership
       where membership.container_type = 'organization'
         and membership.container_id = v_org
         and membership.organization_id = v_org
         and membership.user_id = (select auth.uid())
         and membership.role in ('owner', 'admin')
         and membership.status = 'active'
         and membership.deleted_at is null
     ) then
    raise exception 'organization owner or admin required'
      using errcode = '42501';
  end if;

  select count(*) into v_scope_count
  from context.scopes as scope
  where scope.scope_type_id = p_type_id
    and scope.deleted_at = v_removed_at;

  select count(*) into v_item_count
  from context.context_items as item
  where item.scope_type_id = p_type_id
    and item.deleted_at = v_removed_at;

  -- Clearing the parent is the whole restore: platform._cascade_soft_delete
  -- brings back every child stamped with THIS removal's timestamp, and leaves
  -- anything removed separately beforehand removed.
  update context.scope_types
  set deleted_at = null,
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = p_type_id;

  return jsonb_build_object(
    'restored_scopes', v_scope_count,
    'restored_context_items', v_item_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rs_topic_append_output(p_topic_id uuid, p_kind text, p_asset jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_outputs jsonb;
  v_assets jsonb;
  v_kind_obj jsonb;
  v_asset_id text;
  v_updated int;
begin
  if p_kind is null or p_kind = '' then
    raise exception 'p_kind is required';
  end if;
  if p_asset is null or jsonb_typeof(p_asset) <> 'object' then
    raise exception 'p_asset must be a JSON object';
  end if;

  select coalesce(outputs, '{}'::jsonb) into v_outputs
  from research.rs_topic
  where id = p_topic_id
  for update;

  if not found then
    perform platform.refuse_not_found(format('research topic %s is not available to this account — it may not exist, or your access may not reach it', p_topic_id));
  end if;

  v_asset_id := p_asset->>'id';
  v_assets := coalesce(v_outputs -> p_kind -> 'assets', '[]'::jsonb);
  v_assets := (
    select coalesce(jsonb_agg(elem), '[]'::jsonb)
    from jsonb_array_elements(v_assets) elem
    where v_asset_id is null or elem->>'id' is distinct from v_asset_id
  );
  v_assets := jsonb_build_array(p_asset) || v_assets;

  v_kind_obj := coalesce(v_outputs -> p_kind, '{}'::jsonb);
  v_kind_obj := jsonb_set(v_kind_obj, array['assets'], v_assets, true);
  v_outputs := jsonb_set(v_outputs, array[p_kind], v_kind_obj, true);

  update research.rs_topic set outputs = v_outputs where id = p_topic_id;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    perform platform.refuse_not_found(format('research topic %s could not be saved (write matched zero rows)', p_topic_id));
  end if;

  return v_outputs;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sch_enqueue_manual_run(p_task_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_task_user_id uuid;
  v_task_org_id uuid;
  v_run_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- organization_id is inherited from the PARENT task being run — never
  -- chosen by this function. A manual run always belongs to the same
  -- organization as the task it runs.
  SELECT user_id, organization_id INTO v_task_user_id, v_task_org_id
  FROM scheduler.sch_task WHERE id = p_task_id;
  IF v_task_user_id IS NULL THEN
    perform platform.refuse_not_found(format('task not found: %s', p_task_id));
  END IF;
  IF v_task_user_id <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: caller does not own task' USING ERRCODE = '42501';
  END IF;
  IF v_task_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_required: task % has no organization to run under', p_task_id
      USING ERRCODE = 'P0001',
            HINT = 'The task row is missing organization_id; it cannot be run until repaired.';
  END IF;

  INSERT INTO scheduler.sch_run (task_id, trigger_id, user_id, status, surface, queue, due_at, organization_id)
  VALUES (p_task_id, NULL, v_task_user_id, 'queued', NULL, 'default', now(), v_task_org_id)
  RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.scope_system_apply(p_org_id uuid, p_operations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  op jsonb; kind text; v_id uuid; v_type_id uuid; v_parent_id uuid; v_item_id uuid; v_scope_id uuid;
  v_template_id uuid; v_row jsonb; v_results jsonb := '[]'::jsonb; v_value jsonb; v_value_type text;
begin
  if iam.has_org_admin(p_org_id) is not true then
    raise exception 'organization admin required for %', p_org_id using errcode = '42501';
  end if;
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception 'operations must be an array' using errcode = '22023';
  end if;

  for op in select * from jsonb_array_elements(p_operations) loop
    kind := op->>'op'; v_id := null; v_type_id := null; v_parent_id := null;
    v_item_id := null; v_scope_id := null; v_template_id := null; v_row := null;

    if kind = 'upsert_scope_type' then
      if op ? 'id' then v_id := (op->>'id')::uuid; end if;
      if v_id is null then
        select id into v_id from context.scope_types
        where organization_id = p_org_id and deleted_at is null and slug = op->>'key';
      end if;
      v_parent_id := null;
      if op ? 'parent_key' then
        select id into v_parent_id from context.scope_types
        where organization_id = p_org_id and deleted_at is null and slug = op->>'parent_key';
      end if;
      if v_id is null then
        insert into context.scope_types (
          organization_id, parent_type_id, label_singular, label_plural, icon, description,
          color, sort_order, max_assignments_per_entity, default_variable_keys, slug
        ) values (
          p_org_id, v_parent_id, op->>'label_singular',
          coalesce(op->>'label_plural', (op->>'label_singular') || 's'),
          coalesce(op->>'icon', 'folder'), coalesce(op->>'description', ''),
          coalesce(op->>'color', ''), coalesce((op->>'sort_order')::smallint, 0),
          nullif(op->>'max_assignments', '')::smallint,
          coalesce(array(select jsonb_array_elements_text(op->'default_variable_keys')), '{}'),
          op->>'key'
        ) returning id into v_id;
      else
        update context.scope_types set
          parent_type_id = case when op ? 'parent_key' then v_parent_id else parent_type_id end,
          label_singular = coalesce(op->>'label_singular', label_singular),
          label_plural = coalesce(op->>'label_plural', label_plural),
          icon = coalesce(op->>'icon', icon),
          description = coalesce(op->>'description', description),
          color = coalesce(op->>'color', color),
          sort_order = coalesce((op->>'sort_order')::smallint, sort_order),
          max_assignments_per_entity = case
            when op ? 'max_assignments' then nullif(op->>'max_assignments', '')::smallint
            else max_assignments_per_entity
          end,
          updated_by = (select auth.uid()),
          updated_at = now()
        where id = v_id and organization_id = p_org_id;
      end if;
      select to_jsonb(st) into v_row from context.scope_types st where id = v_id;

    elsif kind = 'archive_scope_type' then
      select id into v_id from context.scope_types
      where organization_id = p_org_id and deleted_at is null
        and (id::text = op->>'id' or slug = op->>'key');
      update context.scope_types
        set deleted_at = now(), updated_by = (select auth.uid()), updated_at = now()
      where id = v_id;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    elsif kind = 'upsert_context_item' then
      v_type_id := public._scope_system_resolve_type_id(p_org_id, op, 'context item');
      if op ? 'id' then
        v_item_id := (op->>'id')::uuid;
      else
        select id into v_item_id from context.context_items
        where scope_type_id = v_type_id and is_active and deleted_at is null and key = op->>'key';
      end if;
      if op->'reference_source'->>'container_type' = 'dataset_template' then
        if not (op->'reference_source' ? 'template_id') and op->'reference_source' ? 'template_name' then
          select id into v_template_id from workbench.udt_dataset_templates
          where organization_id = p_org_id and is_active
            and lower(name) = lower(op->'reference_source'->>'template_name');
          if v_template_id is null then
            raise exception 'table template % not found',
              op->'reference_source'->>'template_name' using errcode = '22023';
          end if;
          op := jsonb_set(op, '{reference_source,template_id}', to_jsonb(v_template_id::text), true);
        end if;
        perform context.validate_dataset_template_source(op->'reference_source', p_org_id);
      end if;
      if v_item_id is null then
        insert into context.context_items (
          scope_type_id, key, display_name, description, category, tags, status, value_type,
          fetch_hint, sensitivity, source_type, is_active, created_by, slug, sort_order,
          allowed_reference_types, max_items, allowed_scope_type_ids, reference_source,
          custom_component
        ) values (
          v_type_id, op->>'key', coalesce(op->>'display_name', op->>'key'),
          coalesce(op->>'description', ''), op->>'category',
          coalesce(array(select jsonb_array_elements_text(op->'tags')), '{}'),
          'active',
          coalesce(op->>'value_type', 'string')::public.context_value_type,
          coalesce(op->>'fetch_hint', 'on_demand')::public.context_fetch_hint,
          coalesce(op->>'sensitivity', 'internal')::public.context_sensitivity,
          'manual', true, (select auth.uid()), coalesce(op->>'slug', op->>'key'),
          coalesce((op->>'sort_order')::smallint, 0),
          case when op ? 'allowed_reference_types'
            then array(select jsonb_array_elements_text(op->'allowed_reference_types'))
            else null end,
          coalesce((op->>'max_items')::integer, 1),
          case when op ? 'allowed_scope_type_ids'
            then array(select jsonb_array_elements_text(op->'allowed_scope_type_ids'))::uuid[]
            else null end,
          op->'reference_source',
          case when op ? 'custom_component' then op->'custom_component' else null end
        ) returning id into v_item_id;
      else
        update context.context_items set
          display_name = coalesce(op->>'display_name', display_name),
          description = coalesce(op->>'description', description),
          category = case when op ? 'category' then op->>'category' else category end,
          value_type = coalesce(op->>'value_type', value_type::text)::public.context_value_type,
          fetch_hint = coalesce(op->>'fetch_hint', fetch_hint::text)::public.context_fetch_hint,
          sensitivity = coalesce(op->>'sensitivity', sensitivity::text)::public.context_sensitivity,
          sort_order = coalesce((op->>'sort_order')::smallint, sort_order),
          allowed_reference_types = case when op ? 'allowed_reference_types'
            then array(select jsonb_array_elements_text(op->'allowed_reference_types'))
            else allowed_reference_types end,
          max_items = coalesce((op->>'max_items')::integer, max_items),
          allowed_scope_type_ids = case when op ? 'allowed_scope_type_ids'
            then array(select jsonb_array_elements_text(op->'allowed_scope_type_ids'))::uuid[]
            else allowed_scope_type_ids end,
          reference_source = case when op ? 'reference_source'
            then op->'reference_source' else reference_source end,
          custom_component = case when op ? 'custom_component'
            then op->'custom_component' else custom_component end,
          updated_by = (select auth.uid()),
          updated_at = now()
        where id = v_item_id and scope_type_id = v_type_id;
      end if;
      select to_jsonb(ci) into v_row from context.context_items ci where id = v_item_id;
      v_id := v_item_id;

    elsif kind = 'archive_context_item' then
      select ci.id into v_id
      from context.context_items ci
      join context.scope_types st on st.id = ci.scope_type_id
      where st.organization_id = p_org_id and ci.deleted_at is null
        and (ci.id::text = op->>'id' or (st.slug = op->>'scope_type_key' and ci.key = op->>'key'));
      update context.context_items
        set is_active = false, deleted_at = now(), updated_by = (select auth.uid()), updated_at = now()
      where id = v_id;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    elsif kind = 'upsert_scope' then
      v_type_id := public._scope_system_resolve_type_id(p_org_id, op, 'scope');
      v_parent_id := null;
      if op ? 'parent_key' then
        select id into v_parent_id from context.scopes
        where organization_id = p_org_id and deleted_at is null and slug = op->>'parent_key';
      end if;
      if op ? 'id' then
        v_scope_id := (op->>'id')::uuid;
      else
        select id into v_scope_id from context.scopes
        where organization_id = p_org_id and scope_type_id = v_type_id
          and deleted_at is null and slug = op->>'key';
      end if;
      if v_scope_id is null then
        insert into context.scopes (
          organization_id, scope_type_id, parent_scope_id, name, description,
          settings, created_by, slug, sort_order
        ) values (
          p_org_id, v_type_id, v_parent_id, op->>'name', coalesce(op->>'description', ''),
          coalesce(op->'settings', '{}'::jsonb), (select auth.uid()), op->>'key',
          coalesce((op->>'sort_order')::smallint, 0)
        ) returning id into v_scope_id;
      else
        update context.scopes set
          parent_scope_id = case when op ? 'parent_key' then v_parent_id else parent_scope_id end,
          name = coalesce(op->>'name', name),
          description = coalesce(op->>'description', description),
          settings = case when op ? 'settings' then op->'settings' else settings end,
          sort_order = coalesce((op->>'sort_order')::smallint, sort_order),
          updated_by = (select auth.uid()),
          updated_at = now()
        where id = v_scope_id and organization_id = p_org_id;
      end if;
      select to_jsonb(s) into v_row from context.scopes s where id = v_scope_id;
      v_id := v_scope_id;

    elsif kind = 'archive_scope' then
      select id into v_id from context.scopes
      where organization_id = p_org_id and deleted_at is null
        and (id::text = op->>'id' or slug = op->>'key');
      update context.scopes
        set deleted_at = now(), updated_by = (select auth.uid()), updated_at = now()
      where id = v_id;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    elsif kind = 'set_value' then
      select s.id, s.scope_type_id into v_scope_id, v_type_id
      from context.scopes s
      where s.organization_id = p_org_id and s.deleted_at is null
        and (s.id::text = op->>'scope_id' or s.slug = op->>'scope_key');
      select ci.id, ci.value_type::text into v_item_id, v_value_type
      from context.context_items ci
      where ci.scope_type_id = v_type_id and ci.is_active and ci.deleted_at is null
        and (ci.id::text = op->>'context_item_id' or ci.key = op->>'item_key');
      if v_scope_id is null or v_item_id is null then
        raise exception 'scope or context item not found for value operation' using errcode = '22023';
      end if;
      v_value := op->'value';
      select to_jsonb(x) into v_row from context.write_context_value(
        p_item_id => v_item_id,
        p_scope_id => v_scope_id,
        p_value_text => case when v_value_type in (
          'string', 'email', 'url', 'phone', 'color', 'markdown', 'reference'
        ) then v_value#>>'{}' end,
        p_value_number => case when v_value_type in ('number', 'percent')
          then (v_value#>>'{}')::numeric end,
        p_value_boolean => case when v_value_type = 'boolean'
          then (v_value#>>'{}')::boolean end,
        p_value_json => case when v_value_type in ('object', 'array', 'currency')
          then v_value end,
        p_value_date => case when v_value_type = 'date'
          then (v_value#>>'{}')::date end,
        p_value_timestamp => case when v_value_type = 'datetime'
          then (v_value#>>'{}')::timestamptz end,
        p_value_time => case when v_value_type = 'time'
          then (v_value#>>'{}')::time end,
        p_value_document_url => case when v_value_type = 'document'
          then v_value#>>'{}' end,
        p_change_summary => coalesce(op->>'change_summary', 'Updated by scope_system tool'),
        p_source_type => 'ai_generated',
        p_actor => (select auth.uid())
      ) x;
      v_id := v_row->>'id';

    elsif kind = 'upsert_table_template' then
      if op ? 'id' then
        v_template_id := (op->>'id')::uuid;
      else
        select id into v_template_id from workbench.udt_dataset_templates
        where organization_id = p_org_id and is_active and lower(name) = lower(op->>'name');
      end if;
      if v_template_id is null then
        insert into workbench.udt_dataset_templates (
          organization_id, name, description, created_by, updated_by
        ) values (
          p_org_id, op->>'name', coalesce(op->>'description', ''), (select auth.uid()), (select auth.uid())
        ) returning id into v_template_id;
        insert into workbench.udt_dataset_template_fields (
          template_id, field_name, display_name, data_type, field_order,
          is_required, default_value, validation_rules
        )
        select
          v_template_id, f->>'field_name', coalesce(f->>'display_name', f->>'field_name'),
          coalesce(f->>'data_type', 'string')::public.field_data_type,
          coalesce((f->>'field_order')::integer, ord::integer - 1),
          coalesce((f->>'is_required')::boolean, false),
          f->'default_value', f->'validation_rules'
        from jsonb_array_elements(coalesce(op->'fields', '[]'::jsonb)) with ordinality as x(f, ord);
      else
        update workbench.udt_dataset_templates set
          name = coalesce(op->>'name', name),
          description = coalesce(op->>'description', description),
          updated_by = (select auth.uid()),
          updated_at = now()
        where id = v_template_id and organization_id = p_org_id;
      end if;
      select to_jsonb(t) into v_row from workbench.udt_dataset_templates t where id = v_template_id;
      v_id := v_template_id;

    elsif kind = 'archive_table_template' then
      select id into v_id from workbench.udt_dataset_templates
      where organization_id = p_org_id and is_active
        and (id::text = op->>'id' or lower(name) = lower(op->>'name'));
      update workbench.udt_dataset_templates
        set is_active = false, updated_by = (select auth.uid()), updated_at = now()
      where id = v_id;
      v_row := jsonb_build_object('id', v_id, 'archived', true);

    else
      raise exception 'unknown scope-system operation %', kind using errcode = '22023';
    end if;

    if v_id is null then
      perform platform.refuse_not_found(format('operation %s did not match or create a record', kind));
    end if;
    v_results := v_results || jsonb_build_array(
      jsonb_build_object('op', kind, 'id', v_id, 'record', v_row)
    );
  end loop;

  return jsonb_build_object(
    'organization_id', p_org_id,
    'applied', jsonb_array_length(v_results),
    'results', v_results
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.study_override_attempt(p_attempt_id uuid, p_result text, p_score_value numeric DEFAULT NULL::numeric, p_score jsonb DEFAULT NULL::jsonb, p_difficulty numeric DEFAULT NULL::numeric, p_stability numeric DEFAULT NULL::numeric, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_retrievability numeric DEFAULT NULL::numeric, p_lapses integer DEFAULT NULL::integer, p_streak integer DEFAULT NULL::integer, p_attempt_count integer DEFAULT NULL::integer, p_correct_count integer DEFAULT NULL::integer, p_struggle_flag boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_row education.study_attempt%rowtype;
  v_mrow education.item_mastery%rowtype;
  v_interval_days integer;
begin
  if v_uid is null then
    raise exception 'study_override_attempt: not authenticated' using errcode = '42501';
  end if;

  if p_result not in ('correct', 'partial', 'incorrect') then
    raise exception 'study_override_attempt: invalid result %', p_result using errcode = '22023';
  end if;

  select * into v_row from education.study_attempt
   where id = p_attempt_id and deleted_at is null
   for update;

  if v_row.id is null then
    perform platform.refuse_not_found('study_override_attempt: attempt not found');
  end if;
  if v_row.created_by is distinct from v_uid then
    raise exception 'study_override_attempt: not your attempt' using errcode = '42501';
  end if;
  if p_difficulty is null or p_stability is null or p_due_at is null or p_retrievability is null
     or p_lapses is null or p_streak is null or p_attempt_count is null or p_correct_count is null
     or p_struggle_flag is null then
    raise exception 'study_override_attempt: full replayed FSRS + mastery state is required — compute via lib/srs/fsrs.ts in studyService before calling'
      using errcode = '22023';
  end if;

  update education.study_attempt set
    original_result       = case when is_manually_edited then original_result else result end,
    original_score         = case when is_manually_edited then original_score else score end,
    original_score_value   = case when is_manually_edited then original_score_value else score_value end,
    result          = p_result,
    score_value     = coalesce(p_score_value, score_value),
    score           = coalesce(p_score, score),
    is_manually_edited = true,
    edited_by       = v_uid,
    edited_at       = now()
  where id = p_attempt_id
  returning * into v_row;

  v_interval_days := greatest(0, round(extract(epoch from (p_due_at - now())) / 86400)::integer);

  -- THE ORGANIZATION: this override is a child of the ATTEMPT it is
  -- correcting — inherit v_row.organization_id (stamped when the attempt was
  -- first recorded by study_record_attempt). Never defaulted here.
  insert into education.item_mastery as m (
    created_by, item_type, item_id, mastery_score, difficulty, stability, retrievability,
    lapses, interval_days, due_at, last_review, last_result, last_attempt_at,
    attempt_count, correct_count, streak, struggle_flag, organization_id
  ) values (
    v_uid, v_row.item_type, v_row.item_id, p_retrievability, p_difficulty, p_stability, p_retrievability,
    p_lapses, v_interval_days, p_due_at, now(), p_result, now(),
    p_attempt_count, p_correct_count, p_streak, p_struggle_flag, v_row.organization_id
  )
  on conflict (created_by, item_type, item_id) do update set
    mastery_score   = excluded.mastery_score,
    difficulty      = excluded.difficulty,
    stability       = excluded.stability,
    retrievability  = excluded.retrievability,
    lapses          = excluded.lapses,
    interval_days   = excluded.interval_days,
    due_at          = excluded.due_at,
    last_review     = excluded.last_review,
    last_result     = excluded.last_result,
    last_attempt_at = excluded.last_attempt_at,
    attempt_count   = excluded.attempt_count,
    correct_count   = excluded.correct_count,
    streak          = excluded.streak,
    struggle_flag   = excluded.struggle_flag
  returning * into v_mrow;

  return jsonb_build_object('attempt', to_jsonb(v_row), 'mastery', to_jsonb(v_mrow));
end $function$;

CREATE OR REPLACE FUNCTION public.transfer_organization_ownership(org_id uuid, current_owner_id uuid, new_owner_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_personal boolean;
  v_actor_role text;
  v_owner_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('organization:' || org_id::text, 0)
  );

  -- DD-191: strict.
  select
    container.resource_org_id,
    container.resource_is_personal,
    container.actor_role
  into v_org, v_personal, v_actor_role
  from iam._container_authz('organization', org_id, v_uid) as container;

  if not found or v_org is null then
    perform platform.refuse_not_found('organization not found');
  end if;

  if not v_service then
    -- DD-045 P3 owns this guard; DD-048 leaves it exactly as it was.
    if v_personal then
      raise exception 'personal organization ownership is immutable'
        using errcode = '42501';
    end if;

    if current_owner_id is distinct from v_uid
       or coalesce(v_actor_role, 'none') is distinct from 'owner' then
      raise exception 'only the current authenticated owner may transfer ownership'
        using errcode = '42501';
    end if;
  end if;

  if not exists (
    select 1
    from iam.memberships as membership
    where membership.container_type = 'organization'
      and membership.container_id = org_id
      and membership.organization_id = org_id
      and membership.user_id = current_owner_id
      and membership.role = 'owner'
      and membership.status = 'active'
      and membership.deleted_at is null
  ) then
    perform platform.refuse_not_found('current owner membership not found');
  end if;

  if not exists (
    select 1
    from iam.memberships as membership
    where membership.container_type = 'organization'
      and membership.container_id = org_id
      and membership.organization_id = org_id
      and membership.user_id = new_owner_id
      and membership.status = 'active'
      and membership.deleted_at is null
  ) then
    raise exception 'new owner must be an active organization member'
      using errcode = '22023';
  end if;

  if current_owner_id = new_owner_id then
    return true;
  end if;

  -- R21, one owner: DEMOTE FIRST, then promote, so the organization is never
  -- momentarily two-owned even to a concurrent reader inside this transaction.
  update iam.memberships
  set role = 'admin', updated_by = v_uid, updated_at = now()
  where container_type = 'organization'
    and container_id = org_id
    and organization_id = org_id
    and user_id = current_owner_id
    and role = 'owner'
    and status = 'active'
    and deleted_at is null;

  update iam.memberships
  set role = 'owner', updated_by = v_uid, updated_at = now()
  where container_type = 'organization'
    and container_id = org_id
    and organization_id = org_id
    and user_id = new_owner_id
    and status = 'active'
    and deleted_at is null;

  select count(*)::integer
  into v_owner_count
  from iam.memberships as membership
  where membership.container_type = 'organization'
    and membership.container_id = org_id
    and membership.organization_id = org_id
    and membership.role = 'owner'
    and membership.status = 'active'
    and membership.deleted_at is null;

  if v_owner_count <> 1 then
    raise exception
      'Ownership transfer left % owners on this organization; it must leave exactly one. Nothing was changed.',
      v_owner_count
      using errcode = '23514';
  end if;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_column_facets(p_table_id uuid, p_field_name text, p_limit integer DEFAULT 50, p_search_term text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_limit  INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
    v_result JSONB;
BEGIN
    IF p_field_name IS NULL OR btrim(p_field_name) = '' THEN
        RAISE EXCEPTION 'udt_column_facets: p_field_name is required';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM workbench.udt_dataset_fields
        WHERE table_id = p_table_id AND field_name = p_field_name
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM workbench.udt_datasets WHERE id = p_table_id) THEN
            perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, or your access may not reach it', p_table_id));
        END IF;
        RAISE EXCEPTION 'udt_column_facets: field % is not a column of table %',
            p_field_name, p_table_id;
    END IF;

    WITH scoped AS (
        SELECT nullif(btrim(r.data ->> p_field_name), '') AS v
        FROM workbench.udt_dataset_rows r
        WHERE r.table_id = p_table_id
          AND (p_search_term IS NULL
               OR r.data::text ILIKE '%' || p_search_term || '%')
    ),
    totals AS (
        SELECT
            count(*)::int                                              AS total_rows,
            count(v)::int                                              AS filled,
            count(*) FILTER (WHERE v IS NULL)::int                     AS blank,
            count(DISTINCT v)::int                                     AS distinct_count,
            COALESCE(max(length(v)), 0)::int                           AS max_length,
            count(DISTINCT v) FILTER (WHERE length(v) > 300)::int      AS unlistable
        FROM scoped
    ),
    top_values AS (
        SELECT v, count(*)::int AS c
        FROM scoped
        WHERE v IS NOT NULL AND length(v) <= 300
        GROUP BY v
        ORDER BY count(*) DESC, v ASC
        LIMIT v_limit
    )
    SELECT jsonb_build_object(
        'success',        true,
        'table_id',       p_table_id,
        'field_name',     p_field_name,
        'total_rows',     t.total_rows,
        'filled',         t.filled,
        'blank',          t.blank,
        'distinct_count', t.distinct_count,
        'max_length',     t.max_length,
        'unlistable',     t.unlistable,
        'limit',          v_limit,
        'truncated',      (t.distinct_count - t.unlistable) > v_limit,
        'values',         COALESCE((
            SELECT jsonb_agg(jsonb_build_object('value', tv.v, 'count', tv.c)
                             ORDER BY tv.c DESC, tv.v ASC)
            FROM top_values tv
        ), '[]'::jsonb)
    )
    INTO v_result
    FROM totals t;

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.udt_set_table_row_actions(p_table_id uuid, p_row_actions jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_action jsonb;
  v_step jsonb;
  v_kind text;
  v_set text;
  v_field text;
  v_name text;
  v_metadata jsonb;
  v_ids text[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  if p_row_actions is not null and jsonb_typeof(p_row_actions) <> 'null' then
    if jsonb_typeof(p_row_actions) <> 'array' then
      raise exception 'row_actions must be an array' using errcode = '22023';
    end if;
    if jsonb_array_length(p_row_actions) > 24 then
      raise exception 'a table can have at most 24 row actions' using errcode = '22023';
    end if;
    if length(p_row_actions::text) > 200000 then
      raise exception 'row_actions is larger than 200 KB' using errcode = '22023';
    end if;
    for v_action in select * from jsonb_array_elements(p_row_actions) loop
      if jsonb_typeof(v_action) <> 'object' then
        raise exception 'each row action must be an object' using errcode = '22023';
      end if;
      if coalesce(v_action->>'id', '') = '' then
        raise exception 'a row action is missing its id' using errcode = '22023';
      end if;
      if v_action->>'id' = any (v_ids) then
        raise exception 'two row actions share the id "%"', v_action->>'id' using errcode = '22023';
      end if;
      v_ids := v_ids || (v_action->>'id');
      v_name := btrim(coalesce(v_action->>'name', ''));
      if v_name = '' then
        raise exception 'a row action is missing its name' using errcode = '22023';
      end if;
      if length(v_name) > 80 then
        raise exception 'row action name "%" is longer than 80 characters', left(v_name, 20) using errcode = '22023';
      end if;
      v_kind := coalesce(v_action->>'kind', 'update');
      if v_kind = 'agent' then
        if btrim(coalesce(v_action->>'prompt', '')) = '' then
          raise exception 'row action "%" asks an agent but has no prompt', v_name using errcode = '22023';
        end if;
      elsif v_kind = 'update' then
        if jsonb_typeof(v_action->'steps') <> 'array' or jsonb_array_length(v_action->'steps') = 0 then
          raise exception 'row action "%" has no changes', v_name using errcode = '22023';
        end if;
        if jsonb_array_length(v_action->'steps') > 60 then
          raise exception 'row action "%" changes more than 60 columns', v_name using errcode = '22023';
        end if;
        for v_step in select * from jsonb_array_elements(v_action->'steps') loop
          v_field := v_step->>'field';
          if v_field is null or not exists (
            select 1 from workbench.udt_dataset_fields
            where table_id = p_table_id and field_name = v_field and deleted_at is null
          ) then
            raise exception 'row action "%" names a column "%" that is not on this table', v_name, coalesce(v_field, '') using errcode = '22023';
          end if;
          if exists (
            select 1 from workbench.udt_dataset_fields
            where table_id = p_table_id and field_name = v_field and deleted_at is null
              and metadata->'format'->>'id' in ('formula', 'created_time', 'modified_time', 'autonumber')
          ) then
            raise exception 'row action "%" sets the calculated column "%"', v_name, v_field using errcode = '22023';
          end if;
          v_set := v_step->>'set';
          if v_set not in ('value', 'clear', 'formula') then
            raise exception 'row action "%": step.set must be value, clear or formula', v_name using errcode = '22023';
          end if;
          if v_set = 'formula' and btrim(coalesce(v_step->>'expression', '')) = '' then
            raise exception 'row action "%": the formula for "%" is empty', v_name, v_field using errcode = '22023';
          end if;
        end loop;
      else
        raise exception 'row action "%": kind must be update or agent', v_name using errcode = '22023';
      end if;
    end loop;
    if jsonb_array_length(p_row_actions) = 0 then
      p_row_actions := null;
    end if;
  else
    p_row_actions := null;
  end if;

  update workbench.udt_datasets
     set metadata = case
           when p_row_actions is null then coalesce(metadata, '{}'::jsonb) - 'row_actions'
           else jsonb_set(coalesce(metadata, '{}'::jsonb), '{row_actions}', p_row_actions, true)
         end
   where id = p_table_id and deleted_at is null
   returning metadata into v_metadata;
  if v_metadata is null then
    perform platform.refuse_not_found(format('dataset %s not found', p_table_id));
  end if;

  return jsonb_build_object('success', true, 'row_actions', coalesce(v_metadata -> 'row_actions', '[]'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_set_table_row_label(p_table_id uuid, p_row_label jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_kind text;
  v_field text;
  v_expression text;
  v_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'sign-in required' using errcode = '42501';
  end if;
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  if p_row_label is not null and jsonb_typeof(p_row_label) <> 'null' then
    if jsonb_typeof(p_row_label) <> 'object' then
      raise exception 'row_label must be an object' using errcode = '22023';
    end if;
    v_kind := p_row_label->>'kind';
    if v_kind = 'field' then
      v_field := p_row_label->>'field';
      if v_field is null or not exists (
        select 1 from workbench.udt_dataset_fields
        where table_id = p_table_id and field_name = v_field and deleted_at is null
      ) then
        raise exception 'row_label.field "%" is not a column of this table', coalesce(v_field, '') using errcode = '22023';
      end if;
      p_row_label := jsonb_build_object('kind', 'field', 'field', v_field);
    elsif v_kind = 'formula' then
      v_expression := p_row_label->>'expression';
      if v_expression is null or btrim(v_expression) = '' then
        raise exception 'row_label.expression is empty' using errcode = '22023';
      end if;
      if length(v_expression) > 2000 then
        raise exception 'row_label.expression is longer than 2000 characters' using errcode = '22023';
      end if;
      p_row_label := jsonb_build_object('kind', 'formula', 'expression', v_expression);
    else
      raise exception 'row_label.kind must be "field" or "formula", got "%"', coalesce(v_kind, '') using errcode = '22023';
    end if;
  else
    p_row_label := null;
  end if;

  update workbench.udt_datasets
     set metadata = case
           when p_row_label is null then coalesce(metadata, '{}'::jsonb) - 'row_label'
           else jsonb_set(coalesce(metadata, '{}'::jsonb), '{row_label}', p_row_label, true)
         end
   where id = p_table_id and deleted_at is null
   returning metadata into v_metadata;
  if v_metadata is null then
    perform platform.refuse_not_found(format('dataset %s not found', p_table_id));
  end if;

  return jsonb_build_object('success', true, 'row_label', v_metadata -> 'row_label');
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_set_table_style(p_table_id uuid, p_path text[], p_value jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_style jsonb;
  v_depth int;
  v_head text;
  v_parent text[];
  i int;
begin
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;

  v_depth := coalesce(array_length(p_path, 1), 0);
  if v_depth < 1 or v_depth > 3 then
    raise exception 'style path must have 1 to 3 segments, got %', v_depth using errcode = '22023';
  end if;
  v_head := p_path[1];
  if v_head not in ('colorBy', 'rules', 'rows', 'cells', 'columns') then
    raise exception 'unknown style key "%": expected colorBy, rules, rows, cells or columns', v_head using errcode = '22023';
  end if;
  if (v_head in ('colorBy', 'rules') and v_depth <> 1)
     or (v_head in ('rows', 'columns') and v_depth <> 2)
     or (v_head = 'cells' and v_depth <> 3) then
    raise exception 'style key "%" does not take a path of % segments', v_head, v_depth using errcode = '22023';
  end if;

  select coalesce(metadata -> 'style', '{}'::jsonb)
    into v_style
    from workbench.udt_datasets
   where id = p_table_id
   for update;

  if v_style is null then
    perform platform.refuse_not_found(format('dataset %s not found', p_table_id));
  end if;
  if jsonb_typeof(v_style) <> 'object' then
    v_style := '{}'::jsonb;
  end if;

  if p_value is null or p_value = 'null'::jsonb then
    -- Delete the leaf, then prune empty parents so the blob never accumulates
    -- `{ "cells": { "<row>": {} } }` husks.
    v_style := v_style #- p_path;
    for i in reverse (v_depth - 1)..1 loop
      v_parent := p_path[1:i];
      if v_style #> v_parent = '{}'::jsonb then
        v_style := v_style #- v_parent;
      end if;
    end loop;
  else
    -- jsonb_set only creates the LAST segment; make every parent exist first.
    for i in 1..(v_depth - 1) loop
      v_parent := p_path[1:i];
      if v_style #> v_parent is null or jsonb_typeof(v_style #> v_parent) <> 'object' then
        v_style := jsonb_set(v_style, v_parent, '{}'::jsonb, true);
      end if;
    end loop;
    v_style := jsonb_set(v_style, p_path, p_value, true);
  end if;

  v_style := v_style || jsonb_build_object('version', 1);

  update workbench.udt_datasets
     set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), array['style'], v_style, true),
         updated_at = now()
   where id = p_table_id;

  return jsonb_build_object('success', true, 'table_id', p_table_id, 'style', v_style);
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_table_profile(p_table_id uuid, p_preview_values integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_preview INTEGER := LEAST(GREATEST(COALESCE(p_preview_values, 12), 1), 100);
    v_result  JSONB;
    v_rows    INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM workbench.udt_datasets WHERE id = p_table_id) THEN
        perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, or your access may not reach it', p_table_id));
    END IF;

    SELECT count(*)::int INTO v_rows
    FROM workbench.udt_dataset_rows WHERE table_id = p_table_id;

    SELECT jsonb_build_object(
        'success',    true,
        'table_id',   p_table_id,
        'total_rows', v_rows,
        'columns',    COALESCE(jsonb_agg(col ORDER BY col_order), '[]'::jsonb)
    )
    INTO v_result
    FROM (
        SELECT
            f.field_order AS col_order,
            jsonb_build_object(
                'field_name',     f.field_name,
                'display_name',   f.display_name,
                'data_type',      f.data_type::text,
                'is_required',    f.is_required,
                'format',         f.metadata -> 'format',
                'filled',         s.filled,
                'blank',          s.blank,
                'distinct_count', s.distinct_count,
                'max_length',     s.max_length,
                'looks_numeric',  s.looks_numeric,
                'looks_url',      s.looks_url,
                'looks_email',    s.looks_email,
                'looks_bool',     s.looks_bool,
                'top_values',     COALESCE(s.top_values, '[]'::jsonb)
            ) AS col
        FROM workbench.udt_dataset_fields f
        CROSS JOIN LATERAL (
            WITH scoped AS (
                SELECT nullif(btrim(r.data ->> f.field_name), '') AS v
                FROM workbench.udt_dataset_rows r
                WHERE r.table_id = p_table_id
            )
            SELECT
                count(v)::int                          AS filled,
                count(*) FILTER (WHERE v IS NULL)::int  AS blank,
                count(DISTINCT v)::int                  AS distinct_count,
                COALESCE(max(length(v)), 0)::int        AS max_length,
                count(*) FILTER (
                    WHERE v ~ '^-?[0-9][0-9,]*(\.[0-9]+)?$')::int  AS looks_numeric,
                count(*) FILTER (
                    WHERE v ~* '^https?://\S+$')::int              AS looks_url,
                count(*) FILTER (
                    WHERE v ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$')::int AS looks_email,
                count(*) FILTER (
                    WHERE lower(v) IN ('true','false','yes','no','y','n','1','0'))::int AS looks_bool,
                (
                    SELECT jsonb_agg(jsonb_build_object('value', t.v, 'count', t.c)
                                     ORDER BY t.c DESC, t.v ASC)
                    FROM (
                        SELECT v, count(*)::int AS c
                        FROM scoped
                        WHERE v IS NOT NULL AND length(v) <= 300
                        GROUP BY v
                        ORDER BY count(*) DESC, v ASC
                        LIMIT v_preview
                    ) t
                ) AS top_values
            FROM scoped
        ) s
        WHERE f.table_id = p_table_id
    ) cols;

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.udt_validate_row(p_table_id uuid, p_data jsonb, p_prior jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_field RECORD; v_value JSONB; v_old_value JSONB; v_mode TEXT;
  v_is_insert BOOLEAN := p_prior IS NULL; v_had BOOLEAN; v_has BOOLEAN;
  v_reason TEXT;
BEGIN
  SELECT validation_mode INTO v_mode FROM workbench.udt_datasets WHERE id = p_table_id;
  IF v_mode IS NULL THEN
    perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, or your access may not reach it', p_table_id));
  END IF;

  -- permissive (default for every pre-existing dataset) enforces NOTHING.
  IF v_mode <> 'strict' THEN
    RETURN p_data;
  END IF;

  FOR v_field IN
    SELECT field_name, data_type, is_required, validation_rules FROM workbench.udt_dataset_fields WHERE table_id = p_table_id
  LOOP
    v_value := p_data -> v_field.field_name;
    v_old_value := p_prior -> v_field.field_name;
    v_has := v_value IS NOT NULL AND jsonb_typeof(v_value) <> 'null';
    v_had := v_old_value IS NOT NULL AND jsonb_typeof(v_old_value) <> 'null';

    IF v_field.is_required AND NOT v_has THEN
      IF v_is_insert THEN
        RAISE EXCEPTION 'udt_validate_row: required field % missing on insert into table %', v_field.field_name, p_table_id;
      ELSIF v_had THEN
        RAISE EXCEPTION 'udt_validate_row: required field % cannot be dropped on table %', v_field.field_name, p_table_id;
      END IF;
      CONTINUE;
    END IF;

    IF v_has THEN
      CASE v_field.data_type::text
        WHEN 'string' THEN
          IF jsonb_typeof(v_value) NOT IN ('string','number') THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects string, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
        WHEN 'number' THEN
          IF jsonb_typeof(v_value) NOT IN ('number','string') THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects number, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
          IF jsonb_typeof(v_value) = 'string' THEN
            BEGIN PERFORM (v_value #>> '{}')::numeric;
            EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'udt_validate_row: field % value is not numeric', v_field.field_name; END;
          END IF;
        WHEN 'integer' THEN
          IF jsonb_typeof(v_value) NOT IN ('number','string') THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects integer, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
          BEGIN PERFORM (v_value #>> '{}')::bigint;
          EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'udt_validate_row: field % value is not an integer', v_field.field_name; END;
        WHEN 'boolean' THEN
          IF jsonb_typeof(v_value) NOT IN ('boolean','string') THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects boolean, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
        WHEN 'date','datetime' THEN
          IF jsonb_typeof(v_value) <> 'string' THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects ISO date string, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
          BEGIN PERFORM (v_value #>> '{}')::timestamptz;
          EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'udt_validate_row: field % value is not parseable as date', v_field.field_name; END;
        WHEN 'json' THEN NULL;
        WHEN 'array' THEN
          IF jsonb_typeof(v_value) <> 'array' THEN
            RAISE EXCEPTION 'udt_validate_row: field % expects array, got %', v_field.field_name, jsonb_typeof(v_value);
          END IF;
        ELSE NULL;
      END CASE;

      -- Column validation rules. Type first, then the rule: a value that is not
      -- even the right type must hear about THAT, not about a range it could
      -- never have satisfied.
      v_reason := public.udt_validate_cell_rules(
        v_field.validation_rules, v_value, v_field.data_type::text);
      IF v_reason IS NOT NULL THEN
        RAISE EXCEPTION 'udt_validate_row: field %: %', v_field.field_name, v_reason;
      END IF;
    END IF;
  END LOOP;
  RETURN p_data;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_context_item(p_item_id uuid, p_display_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_value_type context_value_type DEFAULT NULL::context_value_type, p_fetch_hint context_fetch_hint DEFAULT NULL::context_fetch_hint, p_sensitivity context_sensitivity DEFAULT NULL::context_sensitivity, p_tags text[] DEFAULT NULL::text[], p_sort_order smallint DEFAULT NULL::smallint, p_status context_item_status DEFAULT NULL::context_item_status, p_status_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_result jsonb;
begin
  select st.organization_id
    into v_org
    from context.context_items ci
    join context.scope_types st on st.id = ci.scope_type_id
   where ci.id = p_item_id
     and ci.deleted_at is null;

  if v_org is null then
    perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
  end if;

  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
    raise exception 'organization admin required for %', v_org
      using errcode = '42501';
  end if;

  update context.context_items
     set display_name = coalesce(p_display_name, display_name),
         description  = coalesce(p_description, description),
         category     = coalesce(p_category, category),
         value_type   = coalesce(p_value_type, value_type),
         fetch_hint   = coalesce(p_fetch_hint, fetch_hint),
         sensitivity  = coalesce(p_sensitivity, sensitivity),
         tags         = coalesce(p_tags, tags),
         sort_order   = coalesce(p_sort_order, sort_order),
         status       = coalesce(p_status, status),
         status_note  = coalesce(p_status_note, status_note),
         updated_at   = now()
   where id = p_item_id
  returning to_jsonb(context.context_items.*) into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_scope_type(p_type_id uuid, p_label_singular text DEFAULT NULL::text, p_label_plural text DEFAULT NULL::text, p_icon text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint, p_max_assignments smallint DEFAULT NULL::smallint, p_color text DEFAULT NULL::text, p_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_org_id uuid;
begin
  select st.organization_id
  into v_org_id
  from context.scope_types st
  where st.id = p_type_id
    and st.deleted_at is null;

  if v_org_id is null then
    perform platform.refuse_not_found(format('active scope type %s not found', p_type_id));
  end if;

  if (auth.role() = 'service_role' or iam.has_org_access(v_org_id)) is not true then
    raise exception 'not authorized for organization %', v_org_id
      using errcode = '42501';
  end if;

  update context.scope_types
  set label_singular = coalesce(p_label_singular, label_singular),
      label_plural = coalesce(p_label_plural, label_plural),
      icon = coalesce(p_icon, icon),
      description = coalesce(p_description, description),
      sort_order = coalesce(p_sort_order, sort_order),
      max_assignments_per_entity = coalesce(
        p_max_assignments,
        max_assignments_per_entity
      ),
      color = coalesce(p_color, color),
      slug = coalesce(p_slug, slug),
      updated_at = now()
  where id = p_type_id
  returning to_jsonb(context.scope_types.*) into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_own_feedback(p_feedback_id uuid, p_description text DEFAULT NULL::text, p_feedback_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_description is not null and length(btrim(p_description)) not between 1 and 20000 then
    raise exception 'description must be between 1 and 20000 characters' using errcode='22023';
  end if;
  if p_feedback_type is not null and p_feedback_type not in ('bug','feature','suggestion','other') then
    raise exception 'invalid feedback type' using errcode='22023';
  end if;
  update users.user_feedback f
  set description=coalesce(p_description,f.description),
      feedback_type=coalesce(p_feedback_type,f.feedback_type),
      updated_at=now()
  where f.id=p_feedback_id and f.deleted_at is null and f.status='new'
    and (f.user_id=(select auth.uid()) or f.created_by=(select auth.uid()))
  returning to_jsonb(f.*) into v_result;
  if v_result is null then perform platform.refuse_not_found('editable feedback not found'); end if;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.vault_recovery_preview(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'users', 'iam', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_item users.credential_items%rowtype; v_recovery jsonb;
  v_fields integer; v_attachments integer; v_native integer := 0; v_supported boolean := false;
  v_reason text; v_v1 boolean := false; v_v2 boolean := false; v_timestamp timestamptz;
  v_gate jsonb; v_gate_ok boolean := false; v_census jsonb; v_canonical text; v_digest text;
  v_source_id uuid; v_passkey_id uuid; v_missing boolean := false; v_conflict boolean := false;
  v_has_linked_component boolean := false;
  v_entry jsonb; v_seen text[]; v_parts text[];
  v_uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'vault recovery preview requires a signed-in user' USING ERRCODE='28000'; END IF;
  SELECT i.* INTO v_item FROM users.credential_items i WHERE i.id=p_id AND i.deleted_at IS NOT NULL
    AND (i.user_id=v_uid OR (i.organization_id IS NOT NULL AND i.organization_id IN (SELECT iam.my_orgs()) AND public.is_org_admin_for(v_uid,i.organization_id)));
  IF NOT FOUND THEN perform platform.refuse_not_found('credential item not found (p_id)'); END IF;

  v_recovery := v_item.lifecycle->'vault_recovery';
  -- Shape gates run before set-returning functions or casts. JSON null and
  -- absent keys fail closed, rather than SQL NULL making a predicate disappear.
  <<manifest_shape>>
  BEGIN
    IF jsonb_typeof(v_recovery) IS DISTINCT FROM 'object' THEN EXIT manifest_shape; END IF;
    IF NOT (v_recovery ?& ARRAY['schema_version','deletion_id','deleted_at','prior_status','fields','attachments','state'])
       OR jsonb_typeof(v_recovery->'schema_version') IS DISTINCT FROM 'number'
       OR (v_recovery->>'schema_version') NOT IN ('1','2')
       OR v_recovery->>'state' IS DISTINCT FROM 'deleted'
       OR jsonb_typeof(v_recovery->'prior_status') IS DISTINCT FROM 'string'
       OR (v_recovery->>'prior_status') NOT IN ('active','disabled','expired','pending_verification')
       OR jsonb_typeof(v_recovery->'fields') IS DISTINCT FROM 'array'
       OR jsonb_typeof(v_recovery->'attachments') IS DISTINCT FROM 'array'
       OR jsonb_typeof(v_recovery->'deletion_id') IS DISTINCT FROM 'string'
       OR coalesce(v_recovery->>'deletion_id','') !~* v_uuid_pattern
       OR jsonb_typeof(v_recovery->'deleted_at') IS DISTINCT FROM 'string'
    THEN EXIT manifest_shape; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_recovery) k
              WHERE k NOT IN ('schema_version','deletion_id','deleted_at','prior_status','fields','attachments','state','native_passkeys'))
    THEN EXIT manifest_shape; END IF;
    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_recovery->'fields') LOOP
      IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN EXIT manifest_shape; END IF;
      IF NOT (v_entry ?& ARRAY['id','was_active'])
         OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k NOT IN ('id','was_active'))
         OR jsonb_typeof(v_entry->'id') IS DISTINCT FROM 'string'
         OR coalesce(v_entry->>'id','') !~* v_uuid_pattern
         OR jsonb_typeof(v_entry->'was_active') IS DISTINCT FROM 'boolean'
      THEN EXIT manifest_shape; END IF;
    END LOOP;
    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_recovery->'attachments') LOOP
      IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN EXIT manifest_shape; END IF;
      IF NOT (v_entry ? 'id')
         OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k <> 'id')
         OR jsonb_typeof(v_entry->'id') IS DISTINCT FROM 'string'
         OR coalesce(v_entry->>'id','') !~* v_uuid_pattern
      THEN EXIT manifest_shape; END IF;
    END LOOP;
    IF coalesce(v_recovery->>'deleted_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
    THEN EXIT manifest_shape; END IF;
    BEGIN
      v_timestamp := (v_recovery->>'deleted_at')::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN EXIT manifest_shape;
    END;
    IF NOT isfinite(v_timestamp) THEN EXIT manifest_shape; END IF;
    IF v_recovery->>'schema_version'='1' THEN
      v_v1 := NOT (v_recovery ? 'native_passkeys');
      EXIT manifest_shape;
    END IF;
    -- Version two has a closed, unique canonical-ID manifest; v1 stays unchanged.
    IF jsonb_typeof(v_recovery->'native_passkeys') IS DISTINCT FROM 'array'
    THEN EXIT manifest_shape; END IF;
    IF jsonb_array_length(v_recovery->'native_passkeys') <> 1
       OR v_recovery->>'deletion_id' !~ v_uuid_pattern
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_recovery->'fields') e WHERE e->>'id' !~ v_uuid_pattern)
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_recovery->'attachments') e WHERE e->>'id' !~ v_uuid_pattern)
       OR (SELECT count(*) <> count(DISTINCT e->>'id') FROM jsonb_array_elements(v_recovery->'fields') e)
       OR (SELECT count(*) <> count(DISTINCT e->>'id') FROM jsonb_array_elements(v_recovery->'attachments') e)
    THEN EXIT manifest_shape; END IF;
    v_entry := v_recovery->'native_passkeys'->0;
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN EXIT manifest_shape; END IF;
    IF NOT (v_entry ?& ARRAY['id','source_field_id'])
       OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k NOT IN ('id','source_field_id'))
       OR jsonb_typeof(v_entry->'id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_entry->'source_field_id') IS DISTINCT FROM 'string'
       OR coalesce(v_entry->>'id','') !~ v_uuid_pattern
       OR coalesce(v_entry->>'source_field_id','') !~ v_uuid_pattern
       OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_recovery->'fields') e WHERE e->>'id'=v_entry->>'source_field_id')
    THEN EXIT manifest_shape; END IF;
    v_passkey_id := (v_entry->>'id')::uuid;
    v_source_id := (v_entry->>'source_field_id')::uuid;
    v_v2 := true;
  END manifest_shape;

  IF NOT v_v1 AND NOT v_v2 THEN
    v_reason := CASE WHEN v_recovery IS NULL THEN 'recovery_tracking_unavailable'
                     WHEN v_recovery ? 'native_passkeys' OR v_recovery->>'schema_version'='2' THEN 'native_manifest_invalid'
                     ELSE 'recovery_manifest_unsupported' END;
  ELSIF v_v2 THEN
    -- Match the Python activation validator, including exact JSON scalar types.
    SELECT value INTO v_gate FROM platform.feature_knob
     WHERE feature='vault.native' AND key='passkey_storage_activation'
       AND value_type='json' AND overridable_by='{}'::text[];
    <<activation_shape>>
    BEGIN
      IF jsonb_typeof(v_gate) IS DISTINCT FROM 'object' THEN EXIT activation_shape; END IF;
      IF NOT (v_gate ?& ARRAY['version','enabled','protocol_version','revision','reader_census','evidence_sha256'])
         OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_gate) k WHERE k NOT IN ('version','enabled','protocol_version','revision','reader_census','evidence_sha256'))
         OR jsonb_typeof(v_gate->'version') IS DISTINCT FROM 'number'
         OR v_gate->>'version' IS DISTINCT FROM '1'
         OR jsonb_typeof(v_gate->'protocol_version') IS DISTINCT FROM 'number'
         OR v_gate->>'protocol_version' IS DISTINCT FROM '1'
         OR v_gate->'enabled' IS DISTINCT FROM 'true'::jsonb
         OR jsonb_typeof(v_gate->'revision') IS DISTINCT FROM 'number'
         OR coalesce(v_gate->>'revision','') !~ '^[1-9][0-9]*$'
         OR jsonb_typeof(v_gate->'reader_census') IS DISTINCT FROM 'array'
         OR jsonb_typeof(v_gate->'evidence_sha256') IS DISTINCT FROM 'string'
         OR coalesce(v_gate->>'evidence_sha256','') !~ '^[0-9a-f]{64}$'
      THEN EXIT activation_shape; END IF;
      IF jsonb_array_length(v_gate->'reader_census') <> 8 THEN EXIT activation_shape; END IF;
      v_seen := ARRAY[]::text[];
      FOR v_entry IN SELECT value FROM jsonb_array_elements(v_gate->'reader_census') LOOP
        IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN EXIT activation_shape; END IF;
        IF NOT (v_entry ?& ARRAY['consumer','build','orm_version','refusal_verified'])
           OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k NOT IN ('consumer','build','orm_version','refusal_verified'))
           OR jsonb_typeof(v_entry->'consumer') IS DISTINCT FROM 'string'
           OR v_entry->>'consumer' NOT IN ('aidream-api','workflow-worker','livekit-worker','browser-worker','sandbox-runtime','desktop-sidecar','standalone-scraper','standalone-seo')
           OR v_entry->>'consumer' = ANY(v_seen)
           OR jsonb_typeof(v_entry->'build') IS DISTINCT FROM 'string'
           OR coalesce(v_entry->>'build','') !~ '^[0-9a-f]{40}$'
           OR jsonb_typeof(v_entry->'orm_version') IS DISTINCT FROM 'string'
           OR coalesce(v_entry->>'orm_version','') !~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'
           OR v_entry->'refusal_verified' IS DISTINCT FROM 'true'::jsonb
        THEN EXIT activation_shape; END IF;
        v_parts := string_to_array(v_entry->>'orm_version','.');
        -- Length then lexical comparison supports arbitrarily large semver integers.
        IF NOT (length(v_parts[1])>1 OR v_parts[1]>'3'
            OR (v_parts[1]='3' AND (length(v_parts[2])>1 OR v_parts[2]>'1'
            OR (v_parts[2]='1' AND (length(v_parts[3])>3
            OR (length(v_parts[3])=3 AND v_parts[3]>='144'))))))
        THEN EXIT activation_shape; END IF;
        v_seen := array_append(v_seen,v_entry->>'consumer');
      END LOOP;
      -- All interpolated strings have closed ASCII alphabets above. This is the
      -- exact sorted compact JSON hashed by validate_activation_record.
      SELECT '[' || string_agg(format('{"build":"%s","consumer":"%s","orm_version":"%s","refusal_verified":true}',e->>'build',e->>'consumer',e->>'orm_version'),',' ORDER BY e->>'consumer') || ']'
        INTO v_canonical FROM jsonb_array_elements(v_gate->'reader_census') e;
      v_digest := encode(extensions.digest(convert_to(v_canonical,'UTF8'),'sha256'),'hex');
      v_gate_ok := v_digest = v_gate->>'evidence_sha256';
    END activation_shape;
    IF NOT v_gate_ok THEN v_reason:='native_recovery_unavailable';
    ELSE
      SELECT (e->>'id')::uuid,(e->>'source_field_id')::uuid INTO v_passkey_id,v_source_id FROM jsonb_array_elements(v_recovery->'native_passkeys') e;
      v_missing := NOT EXISTS(SELECT 1 FROM users.passkey_credentials p WHERE p.id=v_passkey_id) OR NOT EXISTS(SELECT 1 FROM users.user_secrets s WHERE s.id=v_source_id)
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_recovery->'fields') e WHERE NOT EXISTS(SELECT 1 FROM users.user_secrets s WHERE s.id=(e->>'id')::uuid))
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_recovery->'attachments') e WHERE NOT EXISTS(SELECT 1 FROM users.credential_attachments a WHERE a.id=(e->>'id')::uuid));
      IF v_missing THEN v_reason:='native_components_missing';
      ELSE
        v_conflict := v_item.definition_key IS DISTINCT FROM 'native_passkey' OR v_item.deleted_at IS DISTINCT FROM v_timestamp
          OR EXISTS(SELECT 1 FROM users.passkey_credentials p WHERE p.credential_item_id=p_id AND p.id!=v_passkey_id)
          OR EXISTS(SELECT 1 FROM users.user_secrets s WHERE s.credential_item_id=p_id AND (s.deleted_at IS NULL OR s.deleted_at=v_timestamp OR s.execution_purpose IS DISTINCT FROM 'general' OR s.field_key='passkey_private') AND s.id NOT IN (SELECT (e->>'id')::uuid FROM jsonb_array_elements(v_recovery->'fields') e))
          OR EXISTS(SELECT 1 FROM users.credential_attachments a WHERE a.credential_item_id=p_id AND (a.deleted_at IS NULL OR a.deleted_at=v_timestamp) AND a.id NOT IN (SELECT (e->>'id')::uuid FROM jsonb_array_elements(v_recovery->'attachments') e))
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_recovery->'fields') e
              JOIN users.user_secrets s ON s.id=(e->>'id')::uuid
             WHERE s.credential_item_id IS DISTINCT FROM p_id
                OR s.user_id IS DISTINCT FROM v_item.user_id
                OR s.organization_id IS DISTINCT FROM v_item.organization_id
                OR s.deleted_at IS DISTINCT FROM v_timestamp OR s.is_active IS DISTINCT FROM false
                OR (s.id <> v_source_id AND (s.execution_purpose IS DISTINCT FROM 'general' OR s.field_key='passkey_private')))
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_recovery->'attachments') e
              JOIN users.credential_attachments a ON a.id=(e->>'id')::uuid
             WHERE a.credential_item_id IS DISTINCT FROM p_id OR a.deleted_at IS DISTINCT FROM v_timestamp)
          OR NOT EXISTS(SELECT 1 FROM users.passkey_credentials p JOIN users.user_secrets s ON s.id=p.source_field_id WHERE p.id=v_passkey_id AND p.credential_item_id=p_id AND p.source_field_id=v_source_id AND s.credential_item_id=p_id AND s.execution_purpose='passkey_private' AND s.field_key='passkey_private' AND s.handling='sealed' AND s.editable=false AND s.inject_into_sandbox=false AND s.key IS NULL AND s.value_hint IS NULL AND s.is_active=false AND p.lifecycle='retired' AND p.deleted_at IS NOT DISTINCT FROM v_timestamp AND s.deleted_at IS NOT DISTINCT FROM v_timestamp AND ((v_item.organization_id IS NOT NULL AND v_item.user_id IS NULL AND s.organization_id=v_item.organization_id AND s.user_id IS NULL AND p.organization_id=v_item.organization_id) OR (v_item.organization_id IS NULL AND v_item.user_id IS NOT NULL AND s.organization_id IS NULL AND s.user_id=v_item.user_id AND EXISTS(SELECT 1 FROM iam.organizations o WHERE o.id=p.organization_id AND o.is_personal=true AND o.created_by=v_item.user_id))));
        IF v_conflict THEN v_reason:='native_components_conflict'; ELSE v_supported:=true; v_fields:=jsonb_array_length(v_recovery->'fields'); v_attachments:=jsonb_array_length(v_recovery->'attachments'); v_native:=1; END IF;
      END IF;
    END IF;
  ELSIF EXISTS(SELECT 1 FROM users.user_secrets s WHERE s.credential_item_id=p_id AND (s.execution_purpose IS DISTINCT FROM 'general' OR s.field_key='passkey_private')) THEN v_reason:='protected_component_requires_native_recovery';
  ELSE
    IF to_regclass('provider.account') IS NOT NULL THEN EXECUTE 'select exists(select 1 from provider.account where deleted_at is null and primary_credential_item_id=$1)' INTO v_has_linked_component USING p_id; END IF;
    IF NOT v_has_linked_component AND to_regclass('provider.account_credential') IS NOT NULL THEN EXECUTE 'select exists(select 1 from provider.account_credential where deleted_at is null and credential_item_id=$1)' INTO v_has_linked_component USING p_id; END IF;
    IF NOT v_has_linked_component AND to_regclass('users.integration_connections') IS NOT NULL THEN EXECUTE 'select exists(select 1 from users.integration_connections where deleted_at is null and credential_item_id=$1)' INTO v_has_linked_component USING p_id; END IF;
    IF NOT v_has_linked_component AND to_regclass('tool.mcp_user_conn') IS NOT NULL THEN EXECUTE 'select exists(select 1 from tool.mcp_user_conn where credential_item_id=$1)' INTO v_has_linked_component USING p_id; END IF;
    IF v_has_linked_component THEN v_reason:='linked_component_requires_native_recovery'; ELSE v_supported:=true; v_fields:=jsonb_array_length(v_recovery->'fields'); v_attachments:=jsonb_array_length(v_recovery->'attachments'); END IF;
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object('deletion_id',CASE WHEN v_v1 OR v_v2 THEN v_recovery->>'deletion_id' END,'fields_count',v_fields,'attachments_count',v_attachments,'native_passkeys_count',v_native,'prior_was_disabled',CASE WHEN v_v1 OR v_v2 THEN v_recovery->>'prior_status'='disabled' END,'supported',v_supported,'reason',v_reason));
END;
$function$;

-- ── 18 SECURITY DEFINER bodies above had no platform.client_callable_door row. provision_shape_guard refuses to
-- let a replaced definer reach COMMIT without one, so each is declared here as what it already is — not a client door.

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', '_edu_class', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'internal: neither a client role nor service_role holds EXECUTE; it is reached only from inside public.edu_class_approve, public.edu_class_assign, public.edu_class_assignments, public.edu_class_confer_purchase, public.edu_class_grant, public.edu_class_join and 11 more, which decide access before they call it. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public._edu_class(uuid)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = '_edu_class'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'esign_campaign_enroll', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.esign_campaign_enroll(uuid, jsonb)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'esign_campaign_enroll'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'esign_campaign_export', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.esign_campaign_export(uuid)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'esign_campaign_export'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'esign_campaign_generate', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.esign_campaign_generate(uuid, jsonb, integer)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'esign_campaign_generate'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'esign_campaign_progress', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none, and it is also called from inside public.esign_campaign_close, which decide access before they call it. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.esign_campaign_progress(uuid)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'esign_campaign_progress'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'esign_envelope_state', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.esign_envelope_state(uuid)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'esign_envelope_state'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'esign_mint_signer_token', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none, and it is also called from inside esign._notify_actionable, public.esign_resend_signer, which decide access before they call it. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.esign_mint_signer_token(uuid, text)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'esign_mint_signer_token'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'esign_provider_dispatch', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.esign_provider_dispatch(uuid)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'esign_provider_dispatch'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'esign_provider_ingest', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.esign_provider_ingest(uuid, text, text, text, text, jsonb, jsonb)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'esign_provider_ingest'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'esign_remind', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.esign_remind(uuid)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'esign_remind'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'esign_resend_signer', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.esign_resend_signer(uuid, text)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'esign_resend_signer'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'esign_send_envelope', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none, and it is also called from inside public.esign_campaign_generate, which decide access before they call it. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.esign_send_envelope(uuid, jsonb)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'esign_send_envelope'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'esign_verify_envelope', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.esign_verify_envelope(uuid, jsonb)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'esign_verify_envelope'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'esign_void_envelope', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.esign_void_envelope(uuid, text)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'esign_void_envelope'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'guardian_confirm_verification', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.guardian_confirm_verification(uuid, text, text)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'guardian_confirm_verification'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'move_file', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none, and it is also called from inside files.guard_rename_path_columns, which decide access before they call it. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.move_file(uuid, uuid)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'move_file'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'rename_file', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.rename_file(uuid, text)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'rename_file'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'public', 'update_user_own_feedback', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), false, false,
       'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. Declared by lane ERRORS-HONEST (2026-09-24) when its not-found raise moved to platform.refuse_not_found; its grants are unchanged.',
       'migrations/campaign/errorshonest_s2_the_public_doors_say_not_found.sql (lane ERRORS-HONEST)',
       'Declared, not changed, by lane ERRORS-HONEST: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body changed only in how it raises a not-found (platform.refuse_not_found). It is not a client door, and no client role holds EXECUTE on it.'
  from pg_proc p
 where p.oid = 'public.update_user_own_feedback(uuid, text, text)'::regprocedure
   and not exists (select 1 from platform.client_callable_door x
                    where x.schema_name = 'public' and x.function_name = 'update_user_own_feedback'
                      and x.identity_argtypes = platform.door_argtypes(p.proargtypes));
