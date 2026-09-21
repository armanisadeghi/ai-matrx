-- scripts/campaign-tests/doorstwo_green.sql — lane DOORS-TWO, from the seat.
--
-- PRODUCTS row 5 (document generation) and DOOR-18's cadence catalogue. Every asserted
-- clause below PART 0 runs as `authenticated` — the role PostgREST serves a signed-in
-- person — through the five doors this lane declared, and never against the view or the
-- two tables behind them.
--
-- The two seats: `admin@admin.com` owns the organization and the Table; `test@test.com` is
-- an ordinary member who was shared nothing, in an organization whose
-- `custom/member_default_visibility` is `shared_only` — without that the organization shows
-- every member every record and there would be no wall for PART 7 to test.
--
-- Ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $suite$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_table   uuid;
  v_f_name  uuid;
  v_f_fee   uuid;
  v_rec     uuid;
  v_tmpl    uuid;
  v_tmpl2   uuid;
  v_render  uuid;
  v_sub     uuid;
  v_n       bigint;
  v_txt     text;
  v_cad     text[];
  v_row     record;
begin
  -- ── fixtures, as the connected role (a seat is a PERSON; these make one) ───────
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'The Alvarado-Chen Kitchen suite ' || left(v_org::text, 8), 'alvarado-chen-kitchen-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin),
         (v_org, 'organization', v_org, c_dana, 'member', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'doorstwo_green.sql', c_admin),
         -- PART 7 NEEDS A REAL WALL. Left at its default this organization shows every
         -- member every record, so `test@test.com` could open the Table and the negative
         -- clauses below would prove nothing. Measured, first run: she listed the
         -- templates. This is the setting section 2 of the try-everything page flips.
         ('custom', 'member_default_visibility', 'organization', v_org, v_org,
          '"shared_only"'::jsonb, 'doorstwo_green.sql', c_admin);

  perform set_config('app.actor_system', 'campaign-test/doorstwo_green.sql', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ PART 0 — TAKE THE SEAT AND PROVE IT ═══════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — seated as %, which cannot read custom.record directly', current_user;

  -- ══ PART 0b — THE THREE THINGS BEHIND THE DOORS STAY SHUT ═════════════════════
  -- This is the whole reason the five doors exist rather than three grants. If any of
  -- these three opens, the doors were pointless and a browser is filtering tenancy.
  begin
    perform 1 from custom.doc_template limit 1;
    raise exception '0b: this seat can SELECT custom.doc_template, so the list door is decoration';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from custom.doc_render limit 1;
    raise exception '0b: this seat can SELECT custom.doc_render, so frozen documents are readable without a door';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from custom.doc_signature limit 1;
    raise exception '0b: this seat can SELECT custom.doc_signature, so seals are readable without a door';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0b PASSED — doc_template, doc_render and doc_signature are all refused to this seat';

  -- ══ PART 1 — a Table with two Fields and one record, through the doors ════════
  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Workspace', 'description', 'the suite''s home', '_actor', 'user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Jobs', 'slug', 'jobs', 'description', 'the suite''s table',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'client', 'direction', 'asc')),
      'agent_writable', true, 'label_singular', 'Job', 'label_plural', 'Jobs',
      'title_field', 'client',
      'fields', jsonb_build_array(jsonb_build_object('name', 'client'), jsonb_build_object('name', 'fee')),
      'parent_id', v_home));
  v_f_name := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'client', 'key', 'client', 'type', 'text', 'required', true));
  v_f_fee  := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'fee', 'key', 'fee', 'type', 'text'));
  v_rec := custom.record_write(v_org, v_table,
             jsonb_build_object('client', 'Marchetti Events Group', 'fee', '1200', '_actor', 'user'));
  raise notice 'PART 1 PASSED — table %, record %', v_table, v_rec;

  -- ══ PART 2 — custom.doc_templates: the list that used to be a refusal ═════════
  select count(*) into v_n from custom.doc_templates(v_org, v_table);
  if v_n <> 0 then
    raise exception '2a: a brand-new table already has % templates', v_n;
  end if;

  v_tmpl := custom.doc_template_save(v_org, v_table, 'Proposal',
              'Dear {{field:' || v_f_name || '}}, our fee is {{field:' || v_f_fee || '}}.', null);
  v_tmpl2 := custom.doc_template_save(v_org, v_table, 'Acknowledgement', 'Thank you.', null);

  select count(*) into v_n from custom.doc_templates(v_org, v_table);
  if v_n <> 2 then
    raise exception '2b: custom.doc_templates answered % templates, not the 2 that were saved', v_n;
  end if;
  -- The list is ordered by name and carries the version and the token count, which is what
  -- a screen shows without opening each one.
  select * into v_row from custom.doc_templates(v_org, v_table) limit 1;
  if v_row.name <> 'Acknowledgement' then
    raise exception '2c: the list is not ordered by name — the first row is %', v_row.name;
  end if;
  select * into v_row from custom.doc_templates(v_org, v_table) t where t.template_id = v_tmpl;
  if v_row.token_count <> 2 then
    raise exception '2d: the Proposal merges 2 columns but the list says %', v_row.token_count;
  end if;
  if v_row.template_version <> 1 then
    raise exception '2e: a template saved once is version %, not 1', v_row.template_version;
  end if;

  -- EVERY SAVE OF AN EXISTING TEMPLATE IS A NEW VERSION (VAL-10), and the list says so.
  perform custom.doc_template_save(v_org, v_table, 'Proposal',
            'Dear {{field:' || v_f_name || '}}, our fee is now {{field:' || v_f_fee || '}}.', v_tmpl);
  select * into v_row from custom.doc_templates(v_org, v_table) t where t.template_id = v_tmpl;
  if v_row.template_version <> 2 then
    raise exception '2f: the second save left the version at %', v_row.template_version;
  end if;
  raise notice 'PART 2 PASSED — the templates of a table list, order, count their tokens and carry their version';

  -- ══ PART 3 — render, and custom.doc_renders finds it again ═══════════════════
  select count(*) into v_n from custom.doc_renders(v_org, v_rec);
  if v_n <> 0 then
    raise exception '3a: a record nothing has been rendered from answers % documents', v_n;
  end if;

  v_render := custom.doc_render_document(v_org, v_tmpl, v_rec);

  select count(*) into v_n from custom.doc_renders(v_org, v_rec);
  if v_n <> 1 then
    raise exception '3b: one render was made and custom.doc_renders answers %', v_n;
  end if;
  select * into v_row from custom.doc_renders(v_org, v_rec) limit 1;
  if v_row.render_id <> v_render then
    raise exception '3c: custom.doc_renders answered a different document from the one that was made';
  end if;
  -- THE MERGE ACTUALLY HAPPENED. A token is a Field ID, so the body carries the value and
  -- not the token — this is REC-68's whole point and the one thing a screen cannot fake.
  if v_row.body not like '%Marchetti Events Group%' then
    raise exception '3d: the rendered document does not carry the record''s value — it reads %', left(v_row.body, 120);
  end if;
  if v_row.body like '%{{field:%' then
    raise exception '3e: the rendered document still carries a raw token — it reads %', left(v_row.body, 120);
  end if;
  if v_row.template_version <> 2 then
    raise exception '3f: the render sealed template version %, not the 2 that was current', v_row.template_version;
  end if;
  if v_row.content_hash is null or length(v_row.content_hash) < 32 then
    raise exception '3g: the render carries no content hash, so nothing could ever be sealed over it';
  end if;

  -- No seal yet, and the door says so rather than being refused.
  select count(*) into v_n from custom.doc_signatures(v_org, v_rec);
  if v_n <> 0 then
    raise exception '3h: an unsigned document answers % seals', v_n;
  end if;
  raise notice 'PART 3 PASSED — a record renders, the document is found again, and its tokens really became values';

  -- ══ PART 4 — custom.doc_template_delete, and what survives it ════════════════
  if custom.doc_template_delete(v_org, v_tmpl2) is not true then
    raise exception '4a: retiring a template did not answer true';
  end if;
  select count(*) into v_n from custom.doc_templates(v_org, v_table);
  if v_n <> 1 then
    raise exception '4b: one of two templates was retired and the list answers %', v_n;
  end if;

  -- VAL-10: A DOCUMENT ALREADY RENDERED IS NOT TOUCHED BY ITS TEMPLATE GOING AWAY. If it
  -- were, a signature over frozen bytes could be invalidated by somebody tidying up.
  perform custom.doc_template_delete(v_org, v_tmpl);
  select count(*) into v_n from custom.doc_renders(v_org, v_rec);
  if v_n <> 1 then
    raise exception '4c: retiring the template took the rendered document with it — % left', v_n;
  end if;
  select * into v_row from custom.doc_renders(v_org, v_rec) limit 1;
  if v_row.body not like '%Marchetti Events Group%' then
    raise exception '4d: the rendered document lost its bytes when its template was retired';
  end if;

  -- A template that is gone reads as absent, by name, rather than as a silent no-op.
  begin
    perform custom.doc_template_delete(v_org, v_tmpl);
    raise exception '4e: retiring an already-retired template was accepted silently';
  exception when sqlstate '02000' then
    get stacked diagnostics v_txt = message_text;
    if v_txt not like '%no document template%' then
      raise exception '4f: the refusal does not say the template is not there — it says %', v_txt;
    end if;
  end;
  raise notice 'PART 4 PASSED — a template retires, the documents made from it survive, and a second retire is refused by name';

  -- ══ PART 5 — custom.subscription_cadences: ONE list ══════════════════════════
  v_cad := custom.subscription_cadences(v_org);
  if v_cad is null or array_length(v_cad, 1) < 1 then
    raise exception '5a: the cadence door answered nothing, so every picker would fall back to a typed word';
  end if;
  -- 🚨 RE-PINNED (lane RED-SUITES-2, 2026-09-21). The cadence vocabulary was changed on
  -- purpose by lane DIGESTS (`migrations/campaign/digests_the_cadence_the_quiet_hours_and_the_real_digest.sql`,
  -- commit `4b038561a4`): it was two words, `immediate` and `digest`, with no way to say
  -- "hourly" and no way to say "Monday" — so the second half of "text me on a new lead, email
  -- me a Monday summary" could not be written down at all. The canonical list is now
  -- `{instant,hourly,daily,weekly}` and `custom.agg_cadence_normalize` maps `immediate`,
  -- `instant` and `now` onto `instant`.
  --
  -- BOTH HALVES ARE ASSERTED, which is stricter than the old clause: the canonical word is in
  -- the list a picker offers, AND the older word a person — or an older client — may still
  -- send is still understood rather than silently dropped.
  if not ('instant' = any(v_cad)) then
    raise exception '5b: the cadence list does not contain instant — it is %', v_cad;
  end if;
  -- OUT OF THE SEAT for the normaliser only: `custom.agg_cadence_normalize` is the notifier's
  -- own helper and is server-side by design, exactly like `custom.agg_subscription_cadences`
  -- two lines below. What a PERSON sends is asserted from the seat in PART 6, which writes a
  -- subscription with the word `immediate` through `custom.rule_declare`.
  perform set_config('role', v_boss, true);
  if custom.agg_cadence_normalize('immediate') is distinct from 'instant' then
    perform set_config('role', 'authenticated', true);
    raise exception '5b: the word a person used to send, "immediate", is no longer understood — it normalises to %',
      coalesce(custom.agg_cadence_normalize('immediate'), '<nothing>');
  end if;
  perform set_config('role', 'authenticated', true);
  -- THE SAME LIST. The whole point: a picker and the digest runner can never disagree.
  perform set_config('role', v_boss, true);  -- agg_subscription_cadences is server-only by design
  if v_cad is distinct from custom.agg_subscription_cadences() then
    perform set_config('role', 'authenticated', true);
    raise exception '5c: the person''s cadence door and the notifier''s own list disagree — % vs the notifier''s', v_cad;
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice 'PART 5 PASSED — the cadence a screen offers is the cadence the digest runner honours: %', v_cad;

  -- ══ PART 6 — the subscription list and the switch, over this Table ═══════════
  v_sub := custom.rule_declare(v_org, jsonb_build_object(
      'name', 'tell me when a job arrives', 'kind', 'predicate',
      'uses', jsonb_build_array('membership'), 'scope_table_id', v_table,
      'applies_to_types', '[]'::jsonb, 'expr', jsonb_build_object('const', true),
      'subscription', jsonb_build_object('saved_view_id', null, 'cadence', 'immediate',
                                         'channel', 'in_app', 'recipient_user_id', c_admin,
                                         'event_key', 'records.changed')));
  select * into v_row from custom.subscriptions(v_org, v_table) s where s.rule_id = v_sub;
  if v_row.rule_id is null then
    raise exception '6a: the subscription just written is not in this person''s own list';
  end if;
  if v_row.mine is not true or v_row.i_may_mute is not true or v_row.muted is not false then
    raise exception '6b: the door says mine=%, i_may_mute=%, muted=% for a subscription addressed to this person',
      v_row.mine, v_row.i_may_mute, v_row.muted;
  end if;
  perform custom.subscription_mute(v_org, v_sub, true);
  select * into v_row from custom.subscriptions(v_org, v_table) s where s.rule_id = v_sub;
  if v_row.muted is not true then
    raise exception '6c: it was switched off and the list still says it is on';
  end if;
  raise notice 'PART 6 PASSED — a subscription over this table lists, says whose it is, and switches off';

  -- ══ PART 7 — test@test.com, a member who was shared nothing ══════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- She is a member, so the organization wall opens; the SUBJECT wall does not.
  begin
    perform 1 from custom.doc_templates(v_org, v_table);
    raise exception '7a: a member who was shared nothing listed the templates of a table she cannot open';
  exception when insufficient_privilege or no_data_found then null;
  end;
  begin
    perform 1 from custom.doc_renders(v_org, v_rec);
    raise exception '7b: a member who was shared nothing read the documents made from a record she cannot open';
  exception when insufficient_privilege or no_data_found then null;
  end;

  -- THE CONTROL, so the clause is not satisfied by a door that refuses her everything:
  -- the cadence catalogue is not about any table, and she is a member, so she gets it.
  v_cad := custom.subscription_cadences(v_org);
  -- (`instant`, not `immediate` — the DIGESTS vocabulary ruling, see 5b.)
  if v_cad is null or not ('instant' = any(v_cad)) then
    raise exception '7c: a member was refused the cadence catalogue, which is about no table at all';
  end if;
  -- And her own subscription list over this table is EMPTY, not refused — nothing is
  -- addressed to her and she holds no admin, so the list reveals no table.
  select count(*) into v_n from custom.subscriptions(v_org, v_table);
  if v_n <> 0 then
    raise exception '7d: a member who was shared nothing sees % subscriptions over a table she cannot open', v_n;
  end if;
  -- And she cannot switch off somebody else's, by name.
  begin
    perform custom.subscription_mute(v_org, v_sub, false);
    raise exception '7e: a member switched somebody else''s notification back on';
  exception when insufficient_privilege then
    get stacked diagnostics v_txt = message_text;
    if v_txt not like '%not addressed to you%' then
      raise exception '7f: the refusal does not say whose it is — it says %', v_txt;
    end if;
  end;
  raise notice 'PART 7 PASSED — the subject wall holds for a plain member, and the one thing she may reach, she reaches';

  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', v_boss, true);
  raise notice 'ALL PARTS PASSED — doorstwo_green.sql';
end;
$suite$;

rollback;
