-- TALK-TO-RECORD — THE GREEN SUITE. A conversation that is about ONE record, and the
-- field-level security that has to hold inside it (AGT-N-9, PRODUCTS row 11).
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<SUPABASE_MATRIX_* dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/talkrec_green.sql
--
-- 🚨 PART 0 TAKES THE SEAT. Every clause below runs as `authenticated`, through the grant,
-- the door row and the ladder, exactly as a browser does. A suite in the owning role would
-- have proved nothing about PART 1, which is a field-level leak that only exists for a
-- client seat.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, is discovered by no sweep, and its
-- single transaction ends in ROLLBACK.
--
-- ITS RED TWIN is `talkrec_red.sql`, which puts the pre-lane bodies back inside a
-- rolled-back transaction and proves every block below flips.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'talkrec_green.sql'
\set requires 'row:platform.feature_knob:feature = \'custom\' and key = \'member_default_visibility\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid;
  v_cust uuid; v_note uuid;                 -- two Tables
  v_acme uuid; v_beta uuid; v_n1 uuid;      -- three Records
  v_conv uuid := gen_random_uuid();
  v_doc jsonb; v_res jsonb; v_ctx jsonb; v_scope jsonb;
  v_n integer; v_txt text; v_caught text;
begin
  perform set_config('app.actor_system', 'campaign-test/talkrec_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Wraithmoor Regional Museum of Art & Craft', 'wraithmoor-museum-'||substr(v_org::text,1,8), 'WRM', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active'),
    (v_org,'organization',v_org,c_dana,'member','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/talkrec_green'),
    -- THE STRICTER PRIVACY SETTING, so the member's access comes from the SHARE and from
    -- nothing else. Under the shipped setting, membership alone shows her the record and
    -- revoking the share proves nothing about what a binding conveys (PART 6).
    ('custom','member_default_visibility','organization',v_org,v_org,'"shared_only"'::jsonb,
     'campaign-test/talkrec_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Wraithmoor Regional Museum — Collections Store')) returning id into v_home;
  insert into chat.conversation (id, organization_id, title, created_by)
  values (v_conv, v_org, 'Loan enquiry from Fairmont Property Group', c_admin);

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat owns custom.record, so every wall would open on its first line';
  end if;

  -- ── THE FIXTURE, built THROUGH THE DOORS. ────────────────────────────────────────────
  v_cust := custom.table_declare(v_org, jsonb_build_object(
    'name','Enquirers','slug','enquirers_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Enquirer','label_plural','Enquirers','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
  v_note := custom.table_declare(v_org, jsonb_build_object(
    'name','Catalogue Notes','slug','catalogue_notes_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Catalogue Note','label_plural','Catalogue Notes','title_field','body','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','body')),'parent_id',v_home::text));
  perform custom.field_declare(v_org, v_cust, jsonb_build_object('label','Stage','plain','text'));
  perform custom.field_declare(v_org, v_cust, jsonb_build_object(
    'label','Tax ID','key','ssn','plain','text','sensitivity','confidential'));

  v_acme := custom.record_write(v_org, v_cust, jsonb_build_object(
    'name','Fairmont Property Group','stage','Prospect','ssn','123-45-6789','parent_id',v_home::text));
  v_beta := custom.record_write(v_org, v_cust, jsonb_build_object(
    'name','Beta Works','stage','Won','parent_id',v_home::text));
  v_n1 := custom.record_write(v_org, v_note, jsonb_build_object(
    'body','Renewal call went well','parent_id',v_home::text));
  perform custom.relation_carry(v_org, v_acme, v_n1);
  -- Two more versions, so "what changed" has something to answer.
  perform custom.record_update(v_org, v_acme, jsonb_build_object('stage','Negotiating'));
  perform custom.record_update(v_org, v_acme, jsonb_build_object('stage','Won'));
  perform custom.comment_write(v_org, v_acme, 'Watch the renewal date on this one.');
  perform custom.share_grant(v_org, v_acme, 'user', c_dana, 'viewer'::public.permission_level);

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 1 — A VALUE A READER MAY NOT SEE NEVER LEAVES THE STORE, THROUGH ANY DOOR.
  -- Six doors, all client-callable, all measured LEAKING on 2026-09-20 before this lane.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  v_doc := custom.read_record(v_org, v_acme);
  if v_doc ->> 'ssn' is not null then
    raise exception '1a: the read door handed a viewer the confidential field: %', v_doc ->> 'ssn';
  end if;
  if not (v_doc -> '_hidden') ? 'ssn' then
    raise exception '1a: the read door withheld the field and did not NAME it';
  end if;

  select string_agg(v.field_key || '=' || coalesce(v.value::text,'null'), ' | ')
    into v_txt from custom.record_values_versioned(v_org, v_acme) v;
  if v_txt like '%123-45-6789%' then
    raise exception '1b: custom.record_values_versioned leaked the value: %', v_txt;
  end if;
  select v.absent_reason into v_txt from custom.record_values_versioned(v_org, v_acme) v
   where v.field_key = 'ssn';
  if coalesce(v_txt,'') not like 'withheld:%' then
    raise exception '1b: the triple came back with no withheld sentence (%)', coalesce(v_txt,'nothing');
  end if;

  select string_agg(x::text, ' ') into v_txt from custom.value_read(v_org, v_acme, 'ssn') x;
  if coalesce(v_txt,'') like '%123-45-6789%' then
    raise exception '1c: custom.value_read leaked the value: %', v_txt;
  end if;

  select string_agg(s.state::text, ' ') into v_txt from custom.record_as_of(v_org, v_acme, now()) s;
  if coalesce(v_txt,'') like '%123-45-6789%' then
    raise exception '1d: custom.record_as_of leaked the value as-of now';
  end if;

  select string_agg(h.changes::text, ' ') into v_txt from custom.record_history(v_org, v_acme, 50, 0) h;
  if coalesce(v_txt,'') like '%123-45-6789%' then
    raise exception '1e: custom.record_history leaked the value in its changes';
  end if;
  if coalesce(v_txt,'') not like '%withheld%' then
    raise exception '1e: the history dropped the change instead of naming it as withheld';
  end if;

  select string_agg(coalesce(f.after::text,'') || coalesce(f.before::text,''), ' ')
    into v_txt from custom.field_history(v_org, v_cust, 'ssn', 50, 0, v_acme) f;
  if coalesce(v_txt,'') like '%123-45-6789%' then
    raise exception '1f: custom.field_history leaked one column''s whole history';
  end if;

  v_res := custom.io_export(v_org, v_cust);
  if v_res::text like '%123-45-6789%' then
    raise exception '1g: custom.io_export leaked the value into the spreadsheet';
  end if;
  if not (v_res -> 'withheld') ? 'ssn' then
    raise exception '1g: the export withheld a column and did not name it';
  end if;

  -- The census `custom.doors_not_masking_fields()` is deliberately NOT reachable from this
  -- seat — it answers which doors leak, which is not a signed-in person's business — so the
  -- ratchet lives in `pnpm check:fields-stay-masked`, which connects directly, and not here.

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 2 — A CONVERSATION CAN BE ABOUT ONE RECORD.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);

  v_scope := custom.conversation_scope(v_org, v_conv);
  if coalesce((v_scope ->> 'bound')::boolean, true) then
    raise exception '2a: an unbound conversation claimed a scope: %', v_scope::text;
  end if;

  v_scope := custom.conversation_scope_bind(v_org, v_conv, v_acme);
  if (v_scope ->> 'record_id')::uuid <> v_acme or v_scope ->> 'title' <> 'Fairmont Property Group' then
    raise exception '2b: the binding did not answer the record it bound: %', v_scope::text;
  end if;
  if (v_scope ->> 'table_id')::uuid <> v_cust or v_scope ->> 'scope_type' <> 'Enquirer' then
    raise exception '2b: the scope TYPE is the record''s Table, and it said %', v_scope::text;
  end if;

  -- target_type is the store's token `record` since
  -- migrations/campaign/sc4_a_conversation_is_about_a_record_under_the_store_token.sql (SC-4);
  -- custom.conversation_scope_bind still reads `custom_record` but never writes it.
  select count(*) into v_n from platform.associations a
   where a.source_type='conversation' and a.source_id=v_conv
     and a.target_type='record' and a.role='record_scope' and a.deleted_at is null;
  if v_n <> 1 then
    raise exception '2c: the binding is % rows of platform.associations, not one', v_n;
  end if;

  -- Re-binding to ANOTHER record retires the first: "what is this chat about" has one answer.
  perform custom.conversation_scope_bind(v_org, v_conv, v_beta);
  select count(*) into v_n from platform.associations a
   where a.source_type='conversation' and a.source_id=v_conv
     and a.target_type='record' and a.role='record_scope' and a.deleted_at is null;
  if v_n <> 1 then
    raise exception '2d: re-binding left % live scopes', v_n;
  end if;
  perform custom.conversation_scope_bind(v_org, v_conv, v_acme);

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 3 — ONE DOOR ANSWERS THE WHOLE SCOPE, AND EVERY VALUE IS CITABLE.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_res := custom.conversation_scope_context(v_org, v_conv);
  v_ctx := v_res -> 'context';
  if v_ctx is null or v_ctx = 'null'::jsonb then
    raise exception '3a: the bound conversation answered no context: %', v_res::text;
  end if;
  if v_ctx -> 'record' ->> 'title' <> 'Fairmont Property Group' then
    raise exception '3a: the context is about %', v_ctx -> 'record' ->> 'title';
  end if;

  -- The triple (DYN): record, field, value version — on every field.
  select count(*) into v_n from jsonb_array_elements(v_ctx -> 'fields') f
   where (f -> 'cite' ->> 'field_id') is not null
     and (f -> 'cite' ->> 'record_id')::uuid = v_acme
     and (f -> 'cite' ->> 'value_version')::int >= 1;
  if v_n = 0 then
    raise exception '3b: not one field carries its (record, field, version) triple';
  end if;
  select (f -> 'cite' ->> 'value_version')::int into v_n
    from jsonb_array_elements(v_ctx -> 'fields') f where f ->> 'key' = 'stage';
  if coalesce(v_n, 0) < 3 then
    raise exception '3b: stage was written three times and the citation says version %', v_n;
  end if;

  if jsonb_array_length(v_ctx -> 'history') < 3 then
    raise exception '3c: the scope carried % history entries for a record with three versions',
      jsonb_array_length(v_ctx -> 'history');
  end if;
  if jsonb_array_length(v_ctx -> 'relations') = 0 then
    raise exception '3d: the note carried onto Fairmont and the scope shows no relation';
  end if;
  if jsonb_array_length(v_ctx -> 'comments') = 0 then
    raise exception '3e: a comment was written on Fairmont and the scope shows none';
  end if;
  if jsonb_array_length(v_ctx -> 'siblings' -> 'shown') = 0 then
    raise exception '3f: the table has another record this person may open and the scope shows none';
  end if;
  -- The suggested questions come from THIS record's shape, never a fixed list.
  if jsonb_array_length(v_ctx -> 'suggested') = 0 then
    raise exception '3g: a record with history, a relation and a comment suggested nothing';
  end if;
  if not exists (select 1 from jsonb_array_elements_text(v_ctx -> 'suggested') q
                  where q like '%changed%') then
    raise exception '3g: a record with three versions did not offer "what changed": %',
      (v_ctx -> 'suggested')::text;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 4 — TWO SEATS. The member at viewer gets the same record WITHOUT the restricted
  -- field, and is TOLD which field and why.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  if exists (select 1 from jsonb_array_elements(v_ctx -> 'withheld') w where w ->> 'key' = 'ssn') then
    raise exception '4a: the OWNER''s own scope claims a field was withheld from her';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_ctx -> 'fields') f
                  where f ->> 'key' = 'ssn' and f ->> 'value' = '123-45-6789') then
    raise exception '4a: the owner was not given her own confidential field';
  end if;

  perform set_config('request.jwt.claims', c_dana_j, true);
  v_res := custom.conversation_scope_context(v_org, v_conv);
  v_ctx := v_res -> 'context';
  if v_ctx is null or v_ctx = 'null'::jsonb then
    raise exception '4b: the member holds viewer on this record and got no scope at all';
  end if;
  if v_ctx::text like '%123-45-6789%' then
    raise exception '4b: THE MEMBER''S SCOPE CARRIES THE RESTRICTED VALUE';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_ctx -> 'withheld') w
                  where w ->> 'key' = 'ssn' and w ->> 'because' = 'masked') then
    raise exception '4c: the member''s scope does not NAME the withheld field: %',
      (v_ctx -> 'withheld')::text;
  end if;
  select w ->> 'says' into v_txt from jsonb_array_elements(v_ctx -> 'withheld') w where w ->> 'key' = 'ssn';
  if coalesce(v_txt,'') not like '%confidential%' then
    raise exception '4c: the withheld sentence does not say why: %', coalesce(v_txt,'nothing');
  end if;
  if (v_ctx ->> 'says') not like '%Tax ID%' then
    raise exception '4d: the one sentence the prompt carries does not name the missing field: %',
      v_ctx ->> 'says';
  end if;
  -- She still gets the rest of the record, which is the point of masking rather than refusing.
  if not exists (select 1 from jsonb_array_elements(v_ctx -> 'fields') f
                  where f ->> 'key' = 'stage' and f ->> 'value' = 'Won') then
    raise exception '4e: masking one field took the whole record away from her';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 5 — THE WRITE. From the member at viewer it is refused in plain words; from the
  -- owner it lands, and the scope's next assembly says the new value.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_caught := null;
  begin
    perform custom.record_update(v_org, v_acme, jsonb_build_object('stage','Lost'));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '5a: a viewer changed the record through the write door';
  end if;
  -- 🚨 RE-PINNED (lane RED-SUITES-2, 2026-09-21). "In plain words" was measured by looking for
  -- `access`, `permission`, `not yours` or `may not` — four pieces of database vocabulary, in a
  -- suite whose whole subject is talking to a person. This lane's own ruling replaced them. The
  -- sentence is now "You hold the viewer level on this record, and custom.record_update needs
  -- the editor level.", and that is what is asserted: the level she holds, the level the door
  -- needs, and the door — which no substring of jargon ever checked.
  if v_caught not ilike '%viewer level%' or v_caught not ilike '%editor level%'
     or v_caught not like '%custom.record_update%' then
    raise exception '5a: the refusal does not name the level she holds, the level the door needs, and the door: %', v_caught;
  end if;

  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.record_update(v_org, v_acme, jsonb_build_object('stage','Renewed'));
  v_res := custom.conversation_scope_context(v_org, v_conv);
  select f ->> 'value' into v_txt
    from jsonb_array_elements(v_res -> 'context' -> 'fields') f where f ->> 'key' = 'stage';
  if v_txt <> 'Renewed' then
    raise exception '5b: the write landed and the next assembly still says %', v_txt;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 6 — UNBINDING, AND A SCOPE THE PERSON LOST.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform custom.share_revoke(v_org, v_acme, 'user', c_dana);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_scope := custom.conversation_scope(v_org, v_conv);
  if coalesce((v_scope ->> 'readable')::boolean, true) then
    raise exception '6a: the share was revoked and the scope still reads as readable';
  end if;
  if (v_scope ->> 'because') is null then
    raise exception '6a: a scope she may no longer open says nothing about why';
  end if;
  v_res := custom.conversation_scope_context(v_org, v_conv);
  if (v_res -> 'context') <> 'null'::jsonb and (v_res -> 'context') is not null then
    raise exception '6b: she lost the record and the context door still assembled it';
  end if;

  perform set_config('request.jwt.claims', c_admin_j, true);
  v_res := custom.conversation_scope_unbind(v_org, v_conv);
  if coalesce((v_res ->> 'released')::int, 0) <> 1 then
    raise exception '6c: unbinding released % edges', v_res ->> 'released';
  end if;
  v_scope := custom.conversation_scope(v_org, v_conv);
  if coalesce((v_scope ->> 'bound')::boolean, true) then
    raise exception '6c: the conversation is still bound after unbinding';
  end if;

  raise notice 'ALL PARTS PASSED';
  -- SUITES-TIDY 2026-09-22: THE OPT-IN LINE. This suite ends by RAISING to force its own
  -- rollback, and in output text a raise is indistinguishable from a failure — the clone sweep
  -- of 2026-09-22 scored it FAIL for exactly that. The sweep's judge now forgives a teardown
  -- raise, but ONLY for a suite that printed these exact words first, so that a suite which
  -- died halfway can never be forgiven its exit. Do not reword this line.
  raise notice 'ALL CLAUSES PASSED';
  raise exception 'talkrec_green.sql: rolling back, as designed';
end;
$t$;

rollback;
