-- STORE-REL — THE GREEN SUITE. The five store defects that share the association model.
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/storerel_green.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, is discovered by
-- no sweep, and its single transaction ends in ROLLBACK, so it leaves the database exactly as it
-- found it — no organization, no records, no grants, no associations, no knob overrides.
--
-- THE IDENTITIES. One THROWAWAY organization, created here and gone at the rollback.
-- `admin@admin.com` (87a6e699…) is its owner; `test@test.com` (4060701e…, "Dana") is an ordinary
-- MEMBER of it, which is what T10 and T14 need — the organization wall is not what is being
-- tested, the ladder inside it is. The organization sets `custom/member_default_visibility` to
-- `shared_only`, so membership alone reaches nothing and every true answer below comes from a
-- grant or an edge. No credential is read and nobody is signed in for real: the seat is the
-- `role` GUC and `request.jwt.claims`, exactly as PostgREST sets them.
--
-- ITS RED TWIN is `storerel_red.sql`, which puts the old bodies back inside a rolled-back
-- transaction and proves every block below flips.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'storerel_green.sql'
\set requires 'row:platform.feature_knob:feature = \'custom\' and key = \'member_default_visibility\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_proj    uuid; v_x uuid; v_y uuid;
  v_risk    uuid; v_inc uuid; v_r1 uuid; v_r2 uuid; v_i1 uuid;
  v_note_t  uuid; v_note uuid; v_b uuid; v_c uuid;
  v_sup_t   uuid; v_po_t uuid; v_f_sup uuid; v_f_memo uuid; v_sup uuid; v_po uuid;
  v_cls     uuid;
  v_per_t   uuid; v_f_ph uuid; v_ch1 uuid; v_ch2 uuid; v_log uuid;
  v_p1      uuid; v_p2 uuid; v_log2 uuid;
  v_id      uuid; v_n integer; v_caught text; v_doc jsonb; v_res jsonb;
  v_lvl     text;
begin
  perform set_config('app.actor_system', 'campaign-test/storerel_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ── THE THROWAWAY ORGANIZATION ───────────────────────────────────────────────────────────
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Kessler Lab for Applied Microbial Ecology — Riparian Field Station',
          'kessler-riparian-field-station-' || substr(v_org::text, 1, 8), 'KLA', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active'),
         (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb,
          'campaign-test/storerel_green: the doors under test are behind the store switch'),
         ('custom', 'member_default_visibility', 'organization', v_org, v_org, '"shared_only"'::jsonb,
          'campaign-test/storerel_green: VIS-33 shared_only, so membership alone reaches nothing');

  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Kessler Lab — Main Laboratory')) returning id into v_home;

  v_proj := custom.table_declare(v_org, jsonb_build_object(
    'name','Experiment','slug','experiments','type','entity',
    'label_singular','Experiment','label_plural','Experiments','title_field','pname',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','pname')),
    'parent_id', v_home::text));
  v_x := custom.record_write(v_org, v_proj, jsonb_build_object('pname','Riparian nitrogen amendment trial','parent_id',v_home::text));
  v_y := custom.record_write(v_org, v_proj, jsonb_build_object('pname','Anaerobic sulfate reducer screen','parent_id',v_home::text));

  -- T10's shape: Measurement declared ONCE at the organization and placed in BOTH experiments; Protocol deviation
  -- lives in Y and nowhere else.
  v_risk := custom.table_declare(v_org, jsonb_build_object(
    'name','Measurement','slug','measurements','type','entity',
    'label_singular','Measurement','label_plural','Measurements','title_field','rtitle',
    'display','list','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','rtitle')),
    'parent_id', v_home::text));
  perform custom.home_add(v_org, v_risk, v_x);
  perform custom.home_add(v_org, v_risk, v_y);
  v_inc := custom.table_declare(v_org, jsonb_build_object(
    'name','Protocol deviation','slug','protocol_deviations','type','entity',
    'label_singular','Protocol deviation','label_plural','Protocol deviations','title_field','ititle',
    'display','list','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','ititle')),
    'parent_id', v_y::text));
  v_r1 := custom.record_write(v_org, v_risk, jsonb_build_object('rtitle','nifH copies per gram, week 4','parent_id',v_x::text));
  v_r2 := custom.record_write(v_org, v_risk, jsonb_build_object('rtitle','Sulfate concentration, day 12','parent_id',v_y::text));
  v_i1 := custom.record_write(v_org, v_inc,  jsonb_build_object('ititle','Anaerobic chamber O2 excursion','parent_id',v_y::text));

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- PART 1 — T7. A RELATION EDGE NAMES ITS FIELD, SO THE DELETE RULES FIRE.
  -- ════════════════════════════════════════════════════════════════════════════════════════
  v_sup_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Reagent supplier','slug','reagent_suppliers','type','entity',
    'label_singular','Reagent supplier','label_plural','Reagent suppliers','title_field','sname',
    'display','list','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','sname')),
    'parent_id', v_home::text));
  v_po_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Reagent order','slug','reagent_orders','type','entity',
    'label_singular','Reagent order','label_plural','Reagent orders','title_field','ponum',
    'display','list','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','ponum'),
                                jsonb_build_object('name','supplier'),
                                jsonb_build_object('name','memo'),
                                jsonb_build_object('name','memo_echo')),
    'parent_id', v_home::text));

  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','supplier','label','Supplier','type','relation','sort',20,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_po_t,
      'relation_target', v_sup_t, 'relation_max', 1, 'on_target_delete', 'restrict'))
    returning id into v_f_sup;

  v_sup := custom.record_write(v_org, v_sup_t, jsonb_build_object('sname','Cascade Irrigation Supply','parent_id',v_home::text));
  v_po  := custom.record_write(v_org, v_po_t,
             jsonb_build_object('ponum','PO-1','supplier', v_sup::text, 'parent_id', v_home::text));

  -- 1a. THE EDGE EXISTS AND IT NAMES ITS FIELD. This is the whole root cause: the ordinary
  --     write door used to leave platform.associations.relation_field_id NULL on every row.
  select count(*) into v_n
    from platform.associations a
   where a.source_type='record' and a.source_id=v_po and a.target_id=v_sup
     and a.role='supplier' and a.deleted_at is null and a.relation_field_id = v_f_sup;
  if v_n <> 1 then
    raise exception '1a (T7): the ordinary write door wrote % edge(s) naming the supplier field, expected 1', v_n;
  end if;

  -- 1b. RESTRICT, AND IT NAMES THEM.
  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_sup);
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null or v_caught !~ 'still used by' then
    raise exception '1b (T7): deleting a supplier a live purchase order points at was not refused by name (got %)',
      coalesce(v_caught, 'no refusal at all');
  end if;
  if v_caught !~ 'PO-1' then
    raise exception '1b (T7): the restrict refusal did not NAME the purchase order: %', v_caught;
  end if;

  -- 1c. SET_NULL DETACHES, AND THE POINTER DOES NOT DANGLE.
  update custom.record set data = data || jsonb_build_object('on_target_delete','set_null')
   where organization_id = v_org and id = v_f_sup;
  perform custom.record_delete(v_org, v_sup);
  select count(*) into v_n
    from platform.associations a
   where a.source_id=v_po and a.target_id=v_sup and a.role='supplier' and a.deleted_at is null;
  if v_n <> 0 then
    raise exception '1c (T7): detach-everywhere left % live edge(s) pointing at a deleted record', v_n;
  end if;

  -- 1d. CASCADE TAKES THE OTHER SIDE WITH IT.
  update custom.record set data = data || jsonb_build_object('on_target_delete','cascade')
   where organization_id = v_org and id = v_f_sup;
  v_sup := custom.record_write(v_org, v_sup_t, jsonb_build_object('sname','Beta','parent_id',v_home::text));
  v_po  := custom.record_write(v_org, v_po_t,
             jsonb_build_object('ponum','PO-2','supplier', v_sup::text, 'parent_id', v_home::text));
  perform custom.record_delete(v_org, v_sup);
  if exists (select 1 from custom.record r where r.id = v_po and r.deleted_at is null) then
    raise exception '1d (T7): cascade left the purchase order alive after its supplier was deleted';
  end if;

  -- 1e. THE GUARD. A store relation edge with no field is refused, so this cannot reopen.
  v_caught := null;
  begin
    insert into platform.associations (source_type, source_id, target_type, target_id, role, organization_id)
    values ('record', v_r1, 'record', v_r2, 'related_measurement', v_org);
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null or v_caught !~ 'which field it came from' then
    raise exception '1e (T7): an edge with no field was accepted (got %)', coalesce(v_caught,'no refusal');
  end if;

  -- 1e. AND THE SHAPE 1f USED TO BUILD IS REFUSED BY NAME (FLD-13, lane APPROVAL-TAIL).
  --     A column of a Table is stored as a FIELD. A row written into the Field kernel with any
  --     other class is invisible to every reader that asks for a Field by class, including the
  --     duplicate check that stops one table having the same column twice. This is the EXACT
  --     statement 1f used to run, and the refusal is caught, so nothing is written and 1f goes
  --     on to write the same column properly.
  v_caught := null;
  begin
    insert into custom.record (organization_id, table_id, data_class, data) values
      (v_org, custom.field_kernel_id(), 'record', jsonb_build_object(
        'key','memo','label','Memo','type','text','sort',30,'required',false,
        'multi',false,'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
        'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
        'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_po_t));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null or v_caught !~ 'stored as a field' then
    raise exception '1e (FLD-13): a column written into the Field kernel with class "record" was '
      'not refused by name (got %)', coalesce(v_caught, 'no refusal at all');
  end if;

  -- 1f. REC-18 THROUGH THE CLIENT DOOR. A Field another Field READS by name is refused, and
  --     the refusal NAMES the dependant. The fourth pass found this dark because a field
  --     written through the client door is stored as a plain record rather than as a field;
  --     the delete rule now decides what a Field is by the kernel it lives in.
  --
  --     THE MIS-CLASSED SHAPE CANNOT BE WRITTEN ANY MORE, and that is a stronger statement than
  --     this clause used to make (LADDER-CAP, 2026-09-20). These two rows were written
  --     `data_class 'record'` ON PURPOSE, to reproduce the shape the fourth pass found dark.
  --     Lane APPROVAL-TAIL closed that door on 2026-09-20 06:56:14Z
  --     (`apprvtail_a_field_row_is_a_field.sql`): `custom._field_class_guard` now refuses any row
  --     in the Field kernel whose class is not `field`, so the premise of the old clause is
  --     unreachable and this suite died on its own fixture with
  --     `a column of a table is stored as a field, and this one says record`.
  --     NOTHING IS WEAKENED: 1e below asserts the guard REFUSES the old shape by name, which the
  --     suite never checked, and the delete rule is then asserted on the only shape a Field can
  --     now have. It still decides what a Field is by the kernel it lives in.
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','memo','label','Memo','type','text','sort',30,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_po_t))
    returning id into v_f_memo;
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','memo_echo','label','Memo echo','type','text','sort',40,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on', jsonb_build_array('memo'),'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_po_t));
  v_caught := null;
  begin perform custom.record_delete(v_org, v_f_memo); exception when others then v_caught := sqlerrm; end;
  if v_caught is null or v_caught !~ 'Memo echo' then
    raise exception '1f (T7): deleting a Field another Field reads was not refused by name (got %)',
      coalesce(v_caught,'no refusal at all');
  end if;

  raise notice '[GREEN] part 1 (T7) — the edge names its field, and restrict, detach and cascade all fire.';

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- PART 2 — T2. A NOTE ON THREE RECORDS, THROUGH A CLIENT DOOR.
  -- ════════════════════════════════════════════════════════════════════════════════════════
  v_note_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Lab note','slug','lab_notes','type','entity',
    'label_singular','Lab note','label_plural','Lab notes','title_field','body',
    'display','list','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','body')),
    'parent_id', v_home::text));
  v_note := custom.record_write(v_org, v_note_t, jsonb_build_object('body','the note','parent_id',v_home::text));
  v_b := custom.record_write(v_org, v_risk, jsonb_build_object('rtitle','Dissolved organic carbon, week 4','parent_id',v_home::text));
  v_c := custom.record_write(v_org, v_inc,  jsonb_build_object('ititle','Thermocycler lid failure mid-run','parent_id',v_home::text));

  -- THE DOOR THAT DID NOT EXIST. Three carrying links, three different Tables.
  perform custom.relation_carry(v_org, v_x,  v_note);
  perform custom.relation_carry(v_org, v_b,  v_note);
  perform custom.relation_carry(v_org, v_c,  v_note);

  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status)
  values ('record', v_x, c_dana, 'viewer', 'active');
  if not custom.has_visibility(c_dana, 'record', v_note, 'viewer') then
    raise exception '2a (T2): a viewer on A does not see the note carried by A';
  end if;
  if custom.has_visibility(c_dana, 'record', v_note, 'editor') then
    raise exception '2a (T2): a carrying link conveyed EDIT - it is capped at viewer';
  end if;
  delete from iam.permissions where resource_type='record' and resource_id=v_x and granted_to_user_id=c_dana;
  if custom.has_visibility(c_dana, 'record', v_note, 'viewer') then
    raise exception '2b (T2): A was unshared and she still sees the note';
  end if;
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status)
  values ('record', v_c, c_dana, 'viewer', 'active');
  if not custom.has_visibility(c_dana, 'record', v_note, 'viewer') then
    raise exception '2c (T2): C was shared and she does not see the note';
  end if;
  delete from iam.permissions where resource_type='record' and resource_id=v_c and granted_to_user_id=c_dana;
  if custom.has_visibility(c_dana, 'record', v_note, 'viewer') then
    raise exception '2d (T2): shared on none of A, B or C, she still sees the note';
  end if;

  -- The link is NOT containment: the note still has exactly one parent.
  if (select custom.containment_parent(r.data) from custom.record r where r.id = v_note) <> v_home then
    raise exception '2e (T2): a carrying link moved the note''s parent';
  end if;

  -- The refusals, and the way back.
  v_caught := null;
  begin perform custom.relation_carry(v_org, v_note, v_note); exception when others then v_caught := sqlerrm; end;
  if v_caught is null or v_caught !~ 'cannot carry itself' then
    raise exception '2f (T2): a record carrying itself was accepted (got %)', coalesce(v_caught,'no refusal');
  end if;
  v_caught := null;
  begin perform custom.relation_carry(v_org, v_x, v_note); exception when others then v_caught := sqlerrm; end;
  if v_caught is null or v_caught !~ 'already linked' then
    raise exception '2g (T2): the same link twice was accepted (got %)', coalesce(v_caught,'no refusal');
  end if;
  perform custom.relation_uncarry(v_org, v_x, v_note);
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status)
  values ('record', v_x, c_dana, 'viewer', 'active');
  if custom.has_visibility(c_dana, 'record', v_note, 'viewer') then
    raise exception '2h (T2): the link was unmade and A still reaches the note';
  end if;
  delete from iam.permissions where resource_type='record' and resource_id=v_x and granted_to_user_id=c_dana;
  raise notice '[GREEN] part 2 (T2) — the carrying link has a door: the note follows A, then C, and vanishes when neither is shared.';

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- PART 3 — T3. TWO PARENTS IS REFUSED, AND IT NAMES THE FIRST ONE.
  -- ════════════════════════════════════════════════════════════════════════════════════════
  v_cls := custom.record_write(v_org, v_risk, jsonb_build_object('rtitle','Total organic carbon, replicate 3'));
  perform custom.relation_own(v_org, v_x, v_cls);
  if (select custom.containment_parent(r.data) from custom.record r where r.id = v_cls) <> v_x then
    raise exception '3a (T3): the containment door did not put the class inside X';
  end if;

  v_caught := null;
  begin perform custom.relation_own(v_org, v_y, v_cls); exception when others then v_caught := sqlerrm; end;
  if v_caught is null or v_caught !~ 'already inside' then
    raise exception '3b (T3): a SECOND parent was accepted (got %)', coalesce(v_caught,'no refusal at all');
  end if;
  if v_caught !~ 'Riparian nitrogen amendment trial' then
    raise exception '3b (T3): the refusal did not NAME the parent that is in the way: %', v_caught;
  end if;
  if (select custom.containment_parent(r.data) from custom.record r where r.id = v_cls) <> v_x then
    raise exception '3c (T3): the refused second call MOVED the record anyway';
  end if;

  v_caught := null;
  begin perform custom.relation_own(v_org, v_x, v_cls); exception when others then v_caught := sqlerrm; end;
  if v_caught is null or v_caught !~ 'already inside this one' then
    raise exception '3d (T3): asking for the SAME parent twice was silently accepted (got %)', coalesce(v_caught,'nothing');
  end if;

  -- A MOVE IS STILL A MOVE, through the verb that records it.
  perform custom.record_reparent(v_org, v_cls, v_y);
  if (select custom.containment_parent(r.data) from custom.record r where r.id = v_cls) <> v_y then
    raise exception '3e (T3): the explicit reparent did not move the record';
  end if;
  -- And the way to be in BOTH is the carrying link, exactly as T3 says.
  perform custom.relation_carry(v_org, v_x, v_cls);
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status)
  values ('record', v_x, c_dana, 'viewer', 'active');
  if not custom.has_visibility(c_dana, 'record', v_cls, 'viewer') then
    raise exception '3f (T3): the carrying link did not put the class into X as well as Y';
  end if;
  delete from iam.permissions where resource_type='record' and resource_id=v_x and granted_to_user_id=c_dana;
  perform custom.relation_uncarry(v_org, v_x, v_cls);
  raise notice '[GREEN] part 3 (T3) — a second parent is refused by name, the move has its own verb, and the carrying link is the way into both.';

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- PART 4 — T10. SHARED ON ONE HOME, TOLD NOTHING ABOUT THE OTHER.
  -- ════════════════════════════════════════════════════════════════════════════════════════
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status)
  values ('record', v_x, c_dana, 'viewer', 'active');

  perform set_config('request.jwt.claims', c_dana_j, true);
  perform set_config('role', 'authenticated', true);

  -- The READS are right (they always were).
  if not exists (select 1 from custom.query_visible_ids(v_org, v_risk, 'viewer') q where q = v_r1) then
    raise exception '4a (T10): shared on X, she cannot see X''s risk';
  end if;
  if exists (select 1 from custom.query_visible_ids(v_org, v_risk, 'viewer') q where q = v_r2) then
    raise exception '4a (T10): she can see a risk that lives in Y';
  end if;

  -- 4b. THE HOMES-AT-A-RECORD DOOR. X answers with Measurement; Y answers with nothing at all.
  select count(*) into v_n from custom.tables_at_home(v_org, array[v_x]) t where t.table_id = v_risk;
  if v_n <> 1 then raise exception '4b (T10): the tables-at-a-home door did not return Measurement at X (% rows)', v_n; end if;
  select count(*) into v_n from custom.tables_at_home(v_org, array[v_y]);
  if v_n <> 0 then raise exception '4b (T10): the tables-at-a-home door told her about % table(s) at the sulfate reducer screen', v_n; end if;

  -- 4c-4i. EVERY DOOR THAT DESCRIBES THE HIDDEN TABLE REFUSES, and the same door answers for
  --        the table she may see. Nine doors, one question.
  v_caught := null;
  begin perform custom.query_table_homes(v_org, v_inc); exception when others then v_caught := sqlerrm; end;
  if v_caught is null then raise exception '4c (T10): the homes-of-a-table door described Protocol deviation to her'; end if;
  perform custom.query_table_homes(v_org, v_risk);

  v_caught := null;
  begin perform custom.io_export(v_org, v_inc); exception when others then v_caught := sqlerrm; end;
  if v_caught is null then raise exception '4d (T10): the export door returned Protocol deviation''s column names to her'; end if;
  perform custom.io_export(v_org, v_risk);

  v_caught := null;
  begin perform custom.table_capacity(v_org, v_inc); exception when others then v_caught := sqlerrm; end;
  if v_caught is null then raise exception '4e (T10): the capacity door told her how many records Protocol deviation holds'; end if;
  perform custom.table_capacity(v_org, v_risk);

  v_caught := null;
  begin perform count(*) from custom.applicable_fields(v_org, v_inc, null); exception when others then v_caught := sqlerrm; end;
  if v_caught is null then raise exception '4f (T10): the fields door returned Protocol deviation''s fields to her'; end if;
  perform count(*) from custom.applicable_fields(v_org, v_risk, null);

  v_caught := null;
  begin perform count(*) from custom.read_records(v_org, v_inc, false, 10, 0); exception when others then v_caught := sqlerrm; end;
  if v_caught is null then raise exception '4g (T10): the read door answered about Protocol deviation with a silent empty set instead of refusing'; end if;
  perform count(*) from custom.read_records(v_org, v_risk, false, 10, 0);

  v_caught := null;
  begin perform count(*) from custom.record_aggregate(v_org, v_inc); exception when others then v_caught := sqlerrm; end;
  if v_caught is null then raise exception '4h (T10): the aggregate door counted Protocol deviation for her'; end if;

  v_caught := null;
  begin perform custom.agg_explain(v_org, v_inc); exception when others then v_caught := sqlerrm; end;
  if v_caught is null then raise exception '4h (T10): the explain door described Protocol deviation''s shape to her'; end if;

  v_caught := null;
  begin perform count(*) from custom.query_by_coordinates(v_org, v_inc); exception when others then v_caught := sqlerrm; end;
  if v_caught is null then raise exception '4i (T10): the coordinates door answered about Protocol deviation'; end if;

  -- 4j. THE CENSUS ITSELF, so the class cannot reopen through a tenth door.
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  select count(*) into v_n from custom.tables_described_without_asking();
  if v_n <> 0 then
    raise exception '4j (T10): % door(s) still describe a Table without asking whether the caller may know it exists', v_n;
  end if;
  delete from iam.permissions where resource_type='record' and resource_id=v_x and granted_to_user_id=c_dana;
  raise notice '[GREEN] part 4 (T10) — nine doors refuse to describe the other Home''s Table, and the census is empty.';

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- PART 5 — T5. TWO CHENS: THE ALTERNATES, THE ID, AND THE UNDO.
  -- ════════════════════════════════════════════════════════════════════════════════════════
  v_per_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Researcher','slug','researchers','type','entity',
    'label_singular','Researcher','label_plural','Researchers','title_field','pname',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','pname'),
                                jsonb_build_object('name','phone')),
    'parent_id', v_home::text));
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key','phone','label','Phone','type','text','sort',20,'required',false,'multi',false,
      'dated',false,'source','manual','config','{}'::jsonb,'rules','[]'::jsonb,
      'depends_on','[]'::jsonb,'sensitivity','internal','source_config','{}'::jsonb,
      'context_policy','include','applies_to_types','[]'::jsonb,'entity_definition_id',v_per_t))
    returning id into v_f_ph;
  v_ch1 := custom.record_write(v_org, v_per_t, jsonb_build_object('pname','Chen','phone','555-0101','parent_id',v_home::text));
  v_ch2 := custom.record_write(v_org, v_per_t, jsonb_build_object('pname','Chen','phone','555-0202','parent_id',v_home::text));

  v_res := custom.migrate_merge(v_org, v_ch1, v_ch2, 'campaign-test/storerel_green');
  select l.id into v_log from history.migration_log l
   where l.organization_id = v_org and l.verb = 'merge' and l.target_id = v_ch2
   order by l.applied_at desc limit 1;
  if v_log is null then raise exception '5a (T5): the merge left no Migration on the record'; end if;

  -- 5b. THE READ DOOR CARRIES THE ALTERNATES THE MERGE KEPT.
  v_doc := custom.read_record(v_org, v_ch1);
  if v_doc -> '_alternates' -> 'phone' is null
     or (v_doc -> '_alternates' -> 'phone')::text !~ '555-0202' then
    raise exception '5b (T5): the read door stripped the alternate phone number the merge preserved: %',
      coalesce((v_doc -> '_alternates')::text, 'no _alternates at all');
  end if;

  -- 5c. THE MERGED-AWAY ID RESOLVES TO THE WINNER, WITH A REDIRECT MARKER.
  v_doc := custom.read_record(v_org, v_ch2);
  if (v_doc ->> '_redirected_from')::uuid is distinct from v_ch2 then
    raise exception '5c (T5): reading the merged-away id did not say it had been redirected: %', v_doc::text;
  end if;
  if v_doc ->> 'pname' is distinct from 'Chen' then
    raise exception '5c (T5): the merged-away id did not answer with the survivor''s document';
  end if;
  v_res := custom.record_resolve(v_org, v_ch2);
  if (v_res ->> 'resolves_to')::uuid <> v_ch1 or (v_res ->> 'redirected')::boolean is not true then
    raise exception '5c (T5): the resolver door did not send the loser''s id to the winner: %', v_res::text;
  end if;

  -- 5d. UNDO, FROM A CLIENT SEAT.
  perform set_config('role', 'authenticated', true);
  v_res := custom.migrate_undo(v_org, v_log);
  perform set_config('role', 'none', true);
  if (v_res ->> 'undone')::uuid <> v_log then
    raise exception '5d (T5): the undo door did not undo the merge: %', v_res::text;
  end if;
  if not exists (select 1 from custom.record r where r.id = v_ch2 and r.deleted_at is null) then
    raise exception '5d (T5): undo did not put the losing record back';
  end if;

  -- 5e. AND THE ID RESOLVES TO ITSELF AGAIN.
  v_res := custom.record_resolve(v_org, v_ch2);
  if (v_res ->> 'resolves_to')::uuid <> v_ch2 or (v_res ->> 'redirected')::boolean is not false then
    raise exception '5e (T5): after the undo the loser''s id still pointed at the winner: %', v_res::text;
  end if;
  v_doc := custom.read_record(v_org, v_ch2);
  if v_doc ? '_redirected_from' then
    raise exception '5e (T5): after the undo the read door still called it a redirect';
  end if;
  if v_doc ->> 'phone' is distinct from '555-0202' then
    raise exception '5e (T5): the restored record does not hold its own phone number again';
  end if;
  raise notice '[GREEN] part 5 (T5) — the alternates survive the read door, the merged id redirects, and undo is a client door.';

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- PART 6 — T14. THE PRUNING HALF, ASKABLE.
  -- ════════════════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);

  -- 6a. THE FLOOR, REFUSED FROM A CLIENT SEAT — T14's opening clause, which could not be
  --     ASKED at all before.
  v_caught := null;
  begin perform custom.history_retention_set(v_org, v_per_t, 10); exception when others then v_caught := sqlerrm; end;
  if v_caught is null or v_caught !~ 'less than 30' then
    raise exception '6a (T14): ten days was not refused in plain words (got %)', coalesce(v_caught,'no refusal');
  end if;

  -- 6b. AND RAISING IT IS ALLOWED.
  if custom.history_retention_set(v_org, v_per_t, 60) <> 60 then
    raise exception '6b (T14): sixty days was not accepted';
  end if;
  v_res := custom.history_retention(v_org, v_per_t);
  if (v_res ->> 'table_days')::int <> 60 or (v_res ->> 'floor_days')::int < 30 then
    raise exception '6b (T14): the retention door does not read back what was set: %', v_res::text;
  end if;

  -- 6c. THE PRUNE, ASKED — dry run first, which is the shape the sixty-days-later clause needs.
  v_res := custom.history_prune(v_org, 'values', v_per_t, true);
  if v_res ->> 'rows_pruned' is null or (v_res ->> 'dry_run')::boolean is not true then
    raise exception '6c (T14): the prune door did not answer with what it would take: %', v_res::text;
  end if;

  -- 6d. HIS-4 STILL REFUSES THE MIGRATION LOG BY NAME, through the new door.
  v_caught := null;
  begin perform custom.history_prune(v_org, 'migration_log', null, true); exception when others then v_caught := sqlerrm; end;
  if v_caught is null or v_caught !~ 'never pruned' then
    raise exception '6d (T14): the Migration log was prunable through the new door (got %)', coalesce(v_caught,'no refusal');
  end if;

  -- 6e. AND AN ORDINARY MEMBER MAY NOT.
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_caught := null;
  begin perform custom.history_prune(v_org, 'values', v_per_t, true); exception when others then v_caught := sqlerrm; end;
  if v_caught is null or v_caught !~ 'owner or admin' then
    raise exception '6e (T14): an ordinary member could prune this organization''s history (got %)', coalesce(v_caught,'no refusal');
  end if;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- 6f. SIXTY DAYS LATER, UNDO THE MERGE. T14's own sentence, and the half the fourth pass
  --     could not ask at all. Two records are merged, the value history is aged past
  --     retention, the prune is RUN (not a dry run) through the new door, and the undo still
  --     works: HIS-4 keeps every row the Migration log names out of the prune, so what is
  --     missing afterwards is the pruned VALUE history and nothing else.
  v_p1 := custom.record_write(v_org, v_per_t, jsonb_build_object('pname','Older Chen','phone','555-0303','parent_id',v_home::text));
  v_p2 := custom.record_write(v_org, v_per_t, jsonb_build_object('pname','Older Chen','phone','555-0404','parent_id',v_home::text));
  perform custom.record_update(v_org, v_p1, jsonb_build_object('phone','555-0305'));
  perform custom.record_update(v_org, v_p1, jsonb_build_object('phone','555-0306'));
  perform custom.record_update(v_org, v_p1, jsonb_build_object('phone','555-0307'));
  perform custom.migrate_merge(v_org, v_p1, v_p2, 'campaign-test/storerel_green sixty days');
  select l.id into v_log2 from history.migration_log l
   where l.organization_id = v_org and l.verb = 'merge' and l.target_id = v_p2
   order by l.applied_at desc limit 1;

  update history.row_versions v
     set occurred_at = v.occurred_at - interval '90 days'
   where v.organization_id = v_org and v.entity_type = 'custom.record';

  perform set_config('role', 'authenticated', true);
  v_res := custom.history_prune(v_org, 'values', v_per_t, false);
  perform set_config('role', 'none', true);
  if (v_res ->> 'dry_run')::boolean is not false then
    raise exception '6f (T14): the prune ran as a dry run when it was asked to run for real';
  end if;

  perform set_config('role', 'authenticated', true);
  v_res := custom.migrate_undo(v_org, v_log2);
  perform set_config('role', 'none', true);
  if not exists (select 1 from custom.record r where r.id = v_p2 and r.deleted_at is null) then
    raise exception '6f (T14): sixty days later, the undo did not put the merged-away record back';
  end if;
  if custom.read_record(v_org, v_p2) ->> 'phone' is distinct from '555-0404' then
    raise exception '6f (T14): the restored record does not hold its own value again';
  end if;
  if (custom.record_resolve(v_org, v_p2) ->> 'redirected')::boolean is not false then
    raise exception '6f (T14): after the undo the merged id still resolved to the winner';
  end if;

  raise notice '[GREEN] part 6 (T14) — retention and pruning can be asked for, at the organization rung.';

  raise notice 'ALL PARTS PASSED (T7 1a-1f, T2 2a-2h, T3 3a-3f, T10 4a-4j, T5 5a-5e, T14 6a-6f)';
end;
$t$;

-- THE CENSUS. Nothing of this suite survives the rollback; this proves it while the
-- transaction is still open, and the rollback is what makes it true afterwards.
select count(*) filter (where o.slug like 'kessler-riparian-field-station-%') as throwaway_organizations
  from iam.organizations o;

rollback;

select count(*) as organizations_left_behind
  from iam.organizations o where o.slug like 'kessler-riparian-field-station-%';
