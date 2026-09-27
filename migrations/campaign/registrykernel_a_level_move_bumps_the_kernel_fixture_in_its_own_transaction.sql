-- chair-step: lane REGISTRY-KERNEL-CHECK (chair's brief, 2026-09-27). A REGISTRY CHANGE THAT MOVES THE ACCESS KERNEL'S ANSWERS IS RECORDED IN THE SAME TRANSACTION, NEVER DISCOVERED HOURS LATER. The access-kernel fingerprint (iam.entity_read_kernel_fingerprint) covers the kernel's function BODIES, but the kernel also reads REGISTRY ROWS: platform.entity_types (token, schema_name, table_name, rls_variant, is_active, data_class, client_anonymous_public_read — via iam.class_lanes, platform.token_is_detail and the walk's own lookup) and platform.entity_relationships (the composition/containment edges class_lanes and the walk climb). On 2026-09-26 20:26Z access ladder T-8c08 re-classed interview_session confidential -> organization; that moved one recorded equivalence answer (k:interview_session:session_internal:org_owner:admin) with no fingerprint move, so platform.kernel_equivalence_expected() went stale silently and surfaced at 10:27Z the next day, when aidream 1294 moved a kernel body and the provisioner's heal refused table creation (lane KERNEL-1294). THIS FILE: a BEFORE ROW trigger on both registry tables notices the first row of a statement that changes a kernel-read column of a token the equivalence fixture reaches (its four tokens and every container above them) and captures platform.kernel_equivalence_answers() BEFORE the change; an AFTER STATEMENT trigger (named to fire after zz_memo_clear_* and after the row triggers that regenerate policies) asks again AFTER it. Identical -> nothing. Moved -> ONLY the answers this statement moved are patched into platform.kernel_equivalence_expected() (a pre-existing drift from a kernel body is never laundered: its keys keep their recorded value and the heal still refuses on them), one platform.kernel_fingerprint_record row names them (via 'registry change / <table>', ruling 'registry change: <table>.<row> <old level> → <new level>', fixture_version = the live fixture's), and one ops.system_error row of kind kernel_answers_moved_by_registry names it for review. The fixture could not be built -> nothing patched, the same kind with error_type registry.not_compared. Tokens outside the fixture's reach (every provisioned table, the provisioner's own self-check probe) skip both checks at the cost of one array lookup. No kernel body, no fingerprint, no tenant data change (asserted at the end). Proof: scripts/campaign-tests/registrykernel_green.sql (clone, rolled back). Nightly report: scripts/night/kernel-fingerprint-auto-rerecords.sh lists registry bumps separately.
-- based-on: platform.kernel_equivalence_expected() 495f5c155ff3cbe9b7c2bba7fabcbe5096cea12f314244d90c2ffb05100e1d66
-- lane: REGISTRY-KERNEL-CHECK
-- INVERSE: migrations/inverse/registrykernel_a_level_move_bumps_the_kernel_fixture_in_its_own_transaction_down.sql

-- 0. Premise: the recording answers identically now, so the first bump patches only what the
--    registry moves (a stale recording would stay stale in exactly its old keys either way).
do $pre$
declare v_chk jsonb;
begin
  if to_regproc('platform.kernel_equivalence_check') is null or to_regproc('platform.kernel_equivalence_expected') is null then
    raise exception 'registrykernel: platform.kernel_equivalence_check / _expected are not here (selfheal_an_equivalent_kernel_is_re_recorded_by_the_provisioner.sql first).';
  end if;
  v_chk := platform.kernel_equivalence_check();
  raise notice 'registrykernel: before — ok %, % answers, lost %, gained %, missing %, fingerprint % (recorded %)',
    v_chk->>'ok', v_chk->>'answers', v_chk->>'lost', v_chk->>'gained', v_chk->>'missing',
    iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
end $pre$;

-- 1. THE TOKENS THE FIXTURE REACHES: every token its recorded answers ask about, and every
--    container above them (composition and containment edges, bounded like class_lanes' walk).
--    A registry row outside this set cannot move a fixture answer.
CREATE OR REPLACE FUNCTION platform.kernel_fixture_tokens()
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with recursive base as (
    select distinct split_part(k, ':', 2) as tok
      from jsonb_object_keys(coalesce(platform.kernel_equivalence_expected()->'answers', '{}'::jsonb)) k
  ), up as (
    select b.tok, 0 as depth from base b
    union
    select er.parent_type, u.depth + 1
      from up u join platform.entity_relationships er on er.child_type = u.tok
     where u.depth < 12
  )
  select coalesce(array_agg(distinct u.tok), '{}'::text[]) from up u
$function$;
COMMENT ON FUNCTION platform.kernel_fixture_tokens() IS
  'The registry tokens the access-kernel equivalence fixture reaches: the tokens of platform.kernel_equivalence_expected() and every container above them. A registry change outside this set cannot move a fixture answer (lane REGISTRY-KERNEL-CHECK).';

-- 2. BEFORE: the first relevant row of a statement captures the fixture's answers as they were.
CREATE OR REPLACE FUNCTION platform._kernel_answers_before_a_registry_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_cols text[] := case tg_table_name
                     when 'entity_types' then array['token', 'schema_name', 'table_name', 'rls_variant', 'is_active',
                                                    'data_class', 'client_anonymous_public_read']
                     else array['child_type', 'parent_type', 'fk_column', 'kind'] end;
  c_tok  text := case tg_table_name when 'entity_types' then 'token' else 'child_type' end;
  v_o jsonb; v_n jsonb; v_ko jsonb; v_kn jsonb;
  v_live jsonb;
begin
  if coalesce(current_setting('platform.kernel_registry_pre', true), '') <> '' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then v_o := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_n := to_jsonb(new); end if;
  select jsonb_object_agg(c, v_o->c) filter (where v_o is not null),
         jsonb_object_agg(c, v_n->c) filter (where v_n is not null)
    into v_ko, v_kn
    from unnest(c_cols) c;
  if v_ko is not distinct from v_kn
     or not (coalesce(v_o->>c_tok, v_n->>c_tok) = any (platform.kernel_fixture_tokens())
             or coalesce(v_n->>c_tok, v_o->>c_tok) = any (platform.kernel_fixture_tokens())) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  v_live := platform.kernel_equivalence_answers();
  perform set_config('platform.kernel_registry_pre',
                     jsonb_build_object('depth', pg_trigger_depth(), 'live', v_live, 'first_row', v_ko, 'first_row_new', v_kn)::text, true);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$;

-- 3. AFTER: ask again; patch ONLY the answers this statement moved; record and report it.
CREATE OR REPLACE FUNCTION platform._kernel_answers_after_a_registry_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_cols text[] := array['token', 'schema_name', 'table_name', 'rls_variant', 'is_active', 'data_class', 'client_anonymous_public_read'];
  v_pre text := current_setting('platform.kernel_registry_pre', true);
  v_prej jsonb;
  v_before jsonb; v_after jsonb; v_exp jsonb; v_new_exp jsonb;
  v_moved jsonb; v_moved_keys text[];
  v_changes text[];
  v_ruling text; v_target text; v_msg text;
  v_fp text := iam.entity_read_kernel_expected();
  v_org uuid := (select so.organization_id from iam.system_orgs so where so.key = 'system');
  v_uid uuid := auth.uid();
  v_rid uuid; v_eid uuid;
begin
  if coalesce(v_pre, '') = '' then return null; end if;
  v_prej := v_pre::jsonb;
  if (v_prej->>'depth')::int is distinct from pg_trigger_depth() then return null; end if;
  perform set_config('platform.kernel_registry_pre', '', true);

  -- What this statement changed, in words.
  if tg_table_name = 'entity_types' then
    if tg_op = 'UPDATE' then
      select array_agg(x.line order by x.line) into v_changes from (
        select format('platform.entity_types.%s %s', n.token,
                 (select string_agg(case when c = 'data_class' then coalesce(oj->>c, '(none)') || ' → ' || coalesce(nj->>c, '(none)')
                                         else c || ' ' || coalesce(oj->>c, '(none)') || ' → ' || coalesce(nj->>c, '(none)') end,
                                    '; ' order by ord)
                    from unnest(c_cols) with ordinality u(c, ord) where (oj->c) is distinct from (nj->c))) as line
          from kernel_old o join kernel_new n on n.id = o.id
          cross join lateral (select to_jsonb(o) oj, to_jsonb(n) nj) j
         where exists (select 1 from unnest(c_cols) c where (j.oj->c) is distinct from (j.nj->c))) x;
    elsif tg_op = 'INSERT' then
      select array_agg(format('platform.entity_types.%s (none) → %s', n.token, coalesce(n.data_class::text, '(no class)')) order by n.token)
        into v_changes from kernel_new n;
    else
      select array_agg(format('platform.entity_types.%s %s → (removed)', o.token, coalesce(o.data_class::text, '(no class)')) order by o.token)
        into v_changes from kernel_old o;
    end if;
  else
    if tg_op in ('UPDATE', 'DELETE') then
      select array_agg(format('platform.entity_relationships.%s→%s via %s (%s) removed', o.child_type, o.parent_type, o.fk_column, o.kind))
        into v_changes from kernel_old o
       where tg_op = 'DELETE' or not exists (select 1 from kernel_new n where (n.child_type, n.parent_type, n.fk_column, n.kind)
                                                                            = (o.child_type, o.parent_type, o.fk_column, o.kind));
    end if;
    if tg_op in ('UPDATE', 'INSERT') then
      v_changes := coalesce(v_changes, '{}') || coalesce((
        select array_agg(format('platform.entity_relationships.%s→%s via %s (%s) added', n.child_type, n.parent_type, n.fk_column, n.kind))
          from kernel_new n
         where tg_op = 'INSERT' or not exists (select 1 from kernel_old o where (o.child_type, o.parent_type, o.fk_column, o.kind)
                                                                              = (n.child_type, n.parent_type, n.fk_column, n.kind))), '{}');
    end if;
  end if;
  v_changes := coalesce(v_changes, '{}');
  v_target := 'platform.' || tg_table_name;

  v_before := v_prej->'live';
  v_after  := platform.kernel_equivalence_answers();

  if v_before->>'error' is not null or v_after->>'error' is not null then
    v_msg := format('A registry change (%s: %s) touched a token the access-kernel equivalence fixture reaches, and the fixture '
                    'could not be built to compare its answers (before: %s; after: %s). Nothing was patched: if the change moved an '
                    'answer, the provisioner''s heal will refuse the next stale-kernel table request with the evidence. '
                    'Build the fixture by hand (select platform.kernel_equivalence_check()) and say what broke it.',
                    v_target, coalesce(nullif(array_to_string(v_changes, '; '), ''), '(no row named)'),
                    coalesce(v_before->>'error', 'ok'), coalesce(v_after->>'error', 'ok'));
    insert into ops.system_error (kind, error_type, error_text, source_app, source_feature, route,
                                  organization_id, user_id, created_by, context)
    values ('kernel_answers_moved_by_registry', 'registry.not_compared', v_msg, 'database', 'access-kernel', v_target,
            v_org, v_uid, v_uid,
            jsonb_build_object('table', v_target, 'op', tg_op, 'changes', to_jsonb(v_changes),
                               'before_error', v_before->>'error', 'after_error', v_after->>'error', 'session_role', current_user));
    raise warning '%', v_msg;
    return null;
  end if;

  select jsonb_object_agg(k, jsonb_build_object('from', v_before->'answers'->k, 'to', v_after->'answers'->k) order by k),
         array_agg(k order by k)
    into v_moved, v_moved_keys
    from (select jsonb_object_keys(v_before->'answers') k union select jsonb_object_keys(v_after->'answers')) keys
   where (v_before->'answers'->k) is distinct from (v_after->'answers'->k);
  if v_moved_keys is null then return null; end if;   -- identical: nothing to record

  -- Patch ONLY the moved keys; every other recorded answer keeps its value (never launder).
  v_exp := platform.kernel_equivalence_expected();
  v_new_exp := jsonb_set(v_exp, '{answers}',
                 (coalesce(v_exp->'answers', '{}'::jsonb) - v_moved_keys)
                 || coalesce((select jsonb_object_agg(k, v_after->'answers'->k) from unnest(v_moved_keys) k
                               where v_after->'answers' ? k), '{}'::jsonb));
  execute format('CREATE OR REPLACE FUNCTION platform.kernel_equivalence_expected() RETURNS jsonb LANGUAGE sql IMMUTABLE AS %L',
                 E'\n  SELECT ' || quote_literal(v_new_exp::text) || E'::jsonb\n');

  v_ruling := 'registry change: ' || coalesce(nullif(array_to_string(v_changes, '; '), ''), v_target || ' (row not named)');
  insert into platform.kernel_fingerprint_record
    (fingerprint_from, fingerprint_to, members_changed, ruling, fixture_version, evidence, via, target)
  values (v_fp, coalesce(v_fp, iam.entity_read_kernel_fingerprint()), '{}'::text[], v_ruling, v_after->>'version',
          jsonb_build_object('kind', 'registry_change', 'table', v_target, 'op', tg_op, 'changes', to_jsonb(v_changes),
                             'moved', v_moved, 'moved_count', cardinality(v_moved_keys),
                             'answers', (select count(*) from jsonb_object_keys(v_after->'answers')),
                             'ms_after', v_after->'ms'),
          'registry change / ' || v_target || ' / ' || current_user, v_target)
  returning id into v_rid;

  v_msg := format('A registry change moved %s access-kernel equivalence answer(s) with no kernel body change: %s. '
                  'Moved: %s. The recording (platform.kernel_equivalence_expected, fixture %s) was patched in the same '
                  'transaction for exactly those answers (platform.kernel_fingerprint_record %s), so the provisioner''s heal '
                  'will not refuse on them. Review: a level move is the access ladder''s to make (common-docs/policies/access-ladder.md); '
                  'if this change was not meant to move who can reach what, revert it.',
                  cardinality(v_moved_keys), v_ruling,
                  (select string_agg(k || ' ' || coalesce(v_moved->k->>'from', 'absent') || ' → ' || coalesce(v_moved->k->>'to', 'absent'), ', ')
                     from (select k from unnest(v_moved_keys) k limit 12) s),
                  v_after->>'version', v_rid);
  insert into ops.system_error (kind, error_type, error_text, source_app, source_feature, route,
                                organization_id, user_id, created_by, context)
  values ('kernel_answers_moved_by_registry', 'registry.level_moved', v_msg, 'database', 'access-kernel', v_target,
          v_org, v_uid, v_uid,
          jsonb_build_object('table', v_target, 'op', tg_op, 'changes', to_jsonb(v_changes), 'ruling', v_ruling,
                             'moved', v_moved, 'record_id', v_rid, 'fixture_version', v_after->>'version',
                             'kernel_fingerprint', v_fp, 'session_role', current_user))
  returning id into v_eid;
  update platform.kernel_fingerprint_record set system_error_id = v_eid where id = v_rid;
  raise warning '%', v_msg;
  return null;
end
$function$;

REVOKE ALL ON FUNCTION platform.kernel_fixture_tokens() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION platform._kernel_answers_before_a_registry_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION platform._kernel_answers_after_a_registry_change() FROM PUBLIC, anon, authenticated;

-- 4. THE TRIGGERS. BEFORE ROW captures; AFTER STATEMENT (zzz_ sorts after zz_memo_clear_*, and every
--    AFTER ROW trigger — including _entity_types_class_regenerates, which rewrites the policies the
--    fixture's read-lane answers read — fires before any AFTER STATEMENT trigger) compares.
--    CREATE OR REPLACE, never DROP + CREATE: DROP TRIGGER drags in Supabase's supautils lock set (23
--    auth/storage/realtime relations at ACCESS EXCLUSIVE, scripts/lib/ddl-lock-footprint.json);
--    CREATE TRIGGER takes SHARE ROW EXCLUSIVE on the one table. ENABLE re-arms a trigger the inverse
--    disabled (the inverse disables rather than drops, for the same reason).
CREATE OR REPLACE TRIGGER _kernel_answers_before_a_registry_change BEFORE INSERT OR UPDATE OR DELETE ON platform.entity_types
  FOR EACH ROW EXECUTE FUNCTION platform._kernel_answers_before_a_registry_change();
CREATE OR REPLACE TRIGGER zzz_kernel_answers_follow_the_registry_i AFTER INSERT ON platform.entity_types
  REFERENCING NEW TABLE AS kernel_new FOR EACH STATEMENT EXECUTE FUNCTION platform._kernel_answers_after_a_registry_change();
CREATE OR REPLACE TRIGGER zzz_kernel_answers_follow_the_registry_u AFTER UPDATE ON platform.entity_types
  REFERENCING OLD TABLE AS kernel_old NEW TABLE AS kernel_new FOR EACH STATEMENT EXECUTE FUNCTION platform._kernel_answers_after_a_registry_change();
CREATE OR REPLACE TRIGGER zzz_kernel_answers_follow_the_registry_d AFTER DELETE ON platform.entity_types
  REFERENCING OLD TABLE AS kernel_old FOR EACH STATEMENT EXECUTE FUNCTION platform._kernel_answers_after_a_registry_change();
ALTER TABLE platform.entity_types ENABLE TRIGGER _kernel_answers_before_a_registry_change;
ALTER TABLE platform.entity_types ENABLE TRIGGER zzz_kernel_answers_follow_the_registry_i;
ALTER TABLE platform.entity_types ENABLE TRIGGER zzz_kernel_answers_follow_the_registry_u;
ALTER TABLE platform.entity_types ENABLE TRIGGER zzz_kernel_answers_follow_the_registry_d;

CREATE OR REPLACE TRIGGER _kernel_answers_before_a_registry_change BEFORE INSERT OR UPDATE OR DELETE ON platform.entity_relationships
  FOR EACH ROW EXECUTE FUNCTION platform._kernel_answers_before_a_registry_change();
CREATE OR REPLACE TRIGGER zzz_kernel_answers_follow_the_registry_i AFTER INSERT ON platform.entity_relationships
  REFERENCING NEW TABLE AS kernel_new FOR EACH STATEMENT EXECUTE FUNCTION platform._kernel_answers_after_a_registry_change();
CREATE OR REPLACE TRIGGER zzz_kernel_answers_follow_the_registry_u AFTER UPDATE ON platform.entity_relationships
  REFERENCING OLD TABLE AS kernel_old NEW TABLE AS kernel_new FOR EACH STATEMENT EXECUTE FUNCTION platform._kernel_answers_after_a_registry_change();
CREATE OR REPLACE TRIGGER zzz_kernel_answers_follow_the_registry_d AFTER DELETE ON platform.entity_relationships
  REFERENCING OLD TABLE AS kernel_old FOR EACH STATEMENT EXECUTE FUNCTION platform._kernel_answers_after_a_registry_change();
ALTER TABLE platform.entity_relationships ENABLE TRIGGER _kernel_answers_before_a_registry_change;
ALTER TABLE platform.entity_relationships ENABLE TRIGGER zzz_kernel_answers_follow_the_registry_i;
ALTER TABLE platform.entity_relationships ENABLE TRIGGER zzz_kernel_answers_follow_the_registry_u;
ALTER TABLE platform.entity_relationships ENABLE TRIGGER zzz_kernel_answers_follow_the_registry_d;

-- 5. PROOF: nothing else moved. An irrelevant no-op statement records nothing; the kernel and its
--    recording are exactly as they were.
do $post$
declare v_fp_before text := iam.entity_read_kernel_fingerprint(); v_n int; v_chk jsonb;
begin
  select count(*) into v_n from platform.kernel_fingerprint_record where via like 'registry change%';
  update platform.entity_types set data_class = data_class where token = 'interview_session';   -- no key column moves
  if (select count(*) from platform.kernel_fingerprint_record where via like 'registry change%') <> v_n then
    raise exception 'registrykernel: a no-op registry update wrote a bump row.';
  end if;
  if coalesce(current_setting('platform.kernel_registry_pre', true), '') <> '' then
    raise exception 'registrykernel: the before-marker survived its statement.';
  end if;
  if iam.entity_read_kernel_fingerprint() is distinct from v_fp_before then
    raise exception 'registrykernel: the kernel fingerprint moved (% -> %); this file must not touch a kernel body.', v_fp_before, iam.entity_read_kernel_fingerprint();
  end if;
  if not ('interview_session' = any (platform.kernel_fixture_tokens()) and 'code_repository' = any (platform.kernel_fixture_tokens())) then
    raise exception 'registrykernel: platform.kernel_fixture_tokens() does not reach the fixture''s tokens: %', platform.kernel_fixture_tokens();
  end if;
  v_chk := platform.kernel_equivalence_check();
  raise notice 'registrykernel: after — ok %, % answers, lost %, gained %, missing %; tokens %',
    v_chk->>'ok', v_chk->>'answers', v_chk->>'lost', v_chk->>'gained', v_chk->>'missing', platform.kernel_fixture_tokens();
end $post$;
