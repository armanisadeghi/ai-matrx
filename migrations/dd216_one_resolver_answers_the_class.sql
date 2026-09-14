-- DD-216 — EVERY CLASS READER RESOLVES A TOKEN THE SAME WAY.
-- (B-109, Data Doctrine adoption program, 2026-09-14. SECURITY / CORRECTNESS.)
--
-- WHAT THE CENSUS ACTUALLY FOUND (live on brsgrqvjdzwihsvnfqkf, 2026-09-14)
-- ------------------------------------------------------------------------
-- The row this file was opened for reads "no active token carries a NULL data
-- class". Measured: 319 active `platform.entity_types` rows carry
-- `data_class IS NULL`, and **every single one of them is `rls_variant =
-- 'component'`**. Zero non-component active tokens are unclassified, because two
-- guards already make that impossible: `iam.apply_rls` RAISEs 23502 on an
-- unclassified non-component, and `iam.verify_canonical`'s `data_class_set`
-- FAILs one.
--
-- For a COMPONENT a NULL class is not a gap, it is the REQUIRED state, by chair
-- ruling DD-137b14 and db-rules §6d-1 — its access IS its parent's:
--   * `platform._entity_types_classify_default` forces `data_class := null` on
--     every component at birth;
--   * `iam.verify_canonical.data_class_set` FAILs a component that HOLDS a class
--     and PASSes one that does not;
--   * `iam.class_lanes` resolves a component upward through its composition
--     parents (`min()` over declared ancestors — the strictest parent wins).
-- So curating a class onto those 319 rows would invert a chair ruling, turn 319
-- PASSes into 319 FAILs, and change nothing: `iam.class_lanes`'s component
-- branch never reads the component's own class. This file does not do it, and
-- the report says so in full.
--
-- THE REAL DEFECT THE CENSUS SURFACED — TWO CLASS READERS, TWO ANSWERS
-- -------------------------------------------------------------------
-- Three functions in the class regime are asked "what class is this token?".
-- Two of them honour §6d-1 and one does not:
--
--   iam.class_lanes(token)            component -> min(declared ancestors)   ✅
--   platform.entity_link_shareable()  component -> NULL, "no opinion"        ✅
--   iam.class_allows(token, action)   component -> coalesce(own class,       ❌
--                                                 'private') = ALWAYS private
--
-- `iam.class_allows` reads `platform.entity_types.data_class` directly. On a
-- component that column is NULL BY DESIGN, so the `coalesce(..., 'private')`
-- meant for an unregistered token fires on all 319 components and answers
-- `private` — on every one of them, whatever their parent says.
--
-- Measured live, rolled back:
--
--   token           class_lanes says   share_link_lane   class_allows('share_link')
--   web_page        organization       true              FALSE
--   agent_card      organization       true              FALSE
--   workflow_plan   organization       true              FALSE
--   agent  (entity) organization       true              true   <- non-components agree
--   tool   (system) public             true              true
--
-- And it is live and user-facing. `public.shareable_resource_registry` holds 15
-- ACTIVE component resource types whose `is_link_shareable` flag was admitted by
-- `platform._share_registry_class_interlock` precisely because
-- `platform.entity_link_shareable` returned NULL ("no opinion") for a component
-- and the registry's word stood. `public.create_share_link` then asks
-- `iam.class_allows(..., 'share_link')`, which invents the opinion the interlock
-- refused to invent, and refuses:
--
--   select public.create_share_link('web_page','96a95f35-9ae8-4833-b30f-e57dfb383e32');
--   -> {"success": false, "error": "a private row cannot be shared by public link"}
--
-- Fifteen registered types, `web_page` `agent_card` `custom_record`
-- `file_pages` `file_overrides` `file_page_annotations` `file_analysis`
-- `file_entities` `seo_change_set` `web_snapshot` `web_property`
-- `web_screenshot` `workflow_plan` `wf_node_data_slot` `hr_interview`.
-- Worse than the refusal: the gate writes an `iam.access_audit` row saying
-- `data_class = 'private'` about a token whose class is `organization`. The log
-- that exists to be read tomorrow records a class the registry never declared.
--
-- THE FIX — ONE RESOLVER, NAMED ONCE
-- ----------------------------------
-- `iam.class_allows` stops reading the column and asks the SAME resolver every
-- other class reader asks: `(iam.class_lanes(p_token)).resolved_class`. That
-- function already carries chair R3 in both directions — an unregistered token
-- and a parentless component both resolve `private`, the strictest answer — so
-- the `coalesce` this file removes is not a safety net being cut, it is a
-- SECOND, divergent copy of a rule that lives in `iam.class_lanes`.
--
-- WHAT CHANGES, EXACTLY
-- ---------------------
--   * non-component tokens: byte-identical. `iam.class_lanes`'s non-component
--     branch IS `coalesce(data_class,'private')`. 486 active tokens, no delta.
--   * unregistered / inactive tokens: `private` before, `private` after.
--   * the 50 components resolving `private` and the 85 resolving `confidential`:
--     no gate answer changes (both classes refuse read/share/transfer alike) —
--     `hr_interview` stays refused, which is the point.
--   * the 170 components resolving `organization` and the 14 resolving `public`:
--     the gate now answers what their parent's class already declared. On the
--     share-link path that un-breaks 14 of the 15 registered types; the owner
--     check (`public.is_resource_owner`) and the registry flag are untouched and
--     still both required.
--
-- This changes NO RLS policy and generates nothing: `iam.apply_rls` is not
-- called, `platform.entity_types` is not written, and no row's readability moves.
-- The access delta is therefore empty by construction — a definer GATE answer is
-- not a row lane — and that is stated here rather than implied.
--
-- THE GUARD: `scripts/check-class-gate-agreement.ts` (`pnpm check:class-gate`),
-- proven RED against this exact defect and GREEN after this file. It FAILs when
-- any active token's `iam.class_allows` answer disagrees with the lane set
-- `iam.class_lanes` declares for the same token — so a fourth reader that forks
-- the resolver again is a failing gate, not a discovery three weeks later.

-- THE GATE'S CLASS, AS A FUNCTION ANYBODY CAN ASK WITHOUT TRIPPING THE GATE.
-- `iam.class_allows` writes an `iam.access_audit` row on every refusal — that is the point of it —
-- which means a guard cannot ask it 805 questions to check its arithmetic without manufacturing
-- 800 refusal records. So the gate's class SOURCE is named here, separately, read-only, and the
-- guard (`pnpm check:class-gate`) asks THIS. A future edit that forks the resolver again has to go
-- around this function, and the guard's source detector sees exactly that.
create or replace function iam.class_gate_class(p_token text)
 returns text
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select (iam.class_lanes(p_token)).resolved_class::text;
$function$;

comment on function iam.class_gate_class(text) is
  'The data class iam.class_allows will apply to this token, with no audit side effect (DD-216). '
  'ONE resolver: iam.class_lanes, which resolves a component through its composition parent and an '
  'unregistered or parentless token to private (chair R3).';

create or replace function iam.class_allows(p_token text, p_action text, p_row_org uuid default null::uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_class text;
  v_ok    boolean;
  v_why   text;
  v_org   uuid;
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'assert_class_allows: no token. A gate asked about nothing answers nothing.'
      using errcode = '22023';
  end if;

  -- 🚨 DD-216: ONE RESOLVER. This used to read `platform.entity_types.data_class` and
  -- `coalesce(..., 'private')`. On a COMPONENT that column is NULL BY DESIGN (db-rules §6d-1,
  -- DD-137b14: a component's access IS its parent's), so the coalesce meant for an unregistered
  -- token fired on all 319 live components and answered `private` on every one — while
  -- `iam.class_lanes` answered `organization` for 170 of them and `public` for 14. Two readers,
  -- two answers, on the same token. `iam.class_lanes` carries chair R3 in BOTH directions
  -- (unregistered token -> private; parentless component -> private), so asking it is strictly
  -- more correct than the copy, never looser than the rule.
  v_class := iam.class_gate_class(p_token);

  case p_action
    -- A blanket read with borrowed rights. Allowed only where a standing read is what the class
    -- MEANS; on private/confidential the caller must ask the kernel per row instead.
    when 'read' then
      v_ok := v_class in ('organization', 'public');
      v_why := 'a definer function may not hand out '|| v_class ||' rows without a per-row '
               'iam.has_access check';
    -- Changing who owns a row, or which organization it belongs to, is how F-1 defeats a class:
    -- rewrite the owner and every lane follows. Never allowed on private or confidential.
    when 'rewrite_owner', 'reparent' then
      v_ok := v_class in ('organization', 'public');
      v_why := 'the owner or home of a '|| v_class ||' row cannot be rewritten through a definer '
               'function — a class that survives only until somebody changes the owner is not a class';
    -- An anonymous read by URL.
    when 'share_link' then
      v_ok := v_class in ('organization', 'public');
      v_why := 'a '|| v_class ||' row cannot be shared by public link';
    -- Handing out many rows at once, with borrowed rights, is the same question at scale.
    when 'bulk_export' then
      v_ok := v_class in ('organization', 'public');
      v_why := 'a '|| v_class ||' token cannot be exported in bulk through a definer function';
    else
      -- NOT a silent pass. An action this gate has never heard of is refused by name, because a
      -- gate that shrugs at an unknown verb is a gate anybody can walk through by inventing one.
      v_ok := false;
      v_why := format('%L is not an action this gate knows (read, rewrite_owner, reparent, '
                      'share_link, bulk_export)', p_action);
  end case;

  if v_ok then return true; end if;

  -- THE AUDIT IS THE GUARANTEE (§3.5's sentence, and it applies to every refusal, not just doors).
  -- DD-216: `data_class` here is now the RESOLVED class, so a component's refusal no longer
  -- records `private` about a token whose registry row never said it.
  v_org := coalesce(p_row_org,
                    (select so.organization_id from iam.system_orgs so where so.key = 'system'));
  begin
    insert into iam.access_audit(
      action, target_token, data_class, purpose, basis, is_emergency_door, granted,
      denial_reason, actor_user_id, organization_id, request_context)
    values (
      p_action, p_token, v_class, 'class_gate', 'definer_function', false, false,
      v_why, auth.uid(), v_org,
      jsonb_build_object('gate', 'iam.assert_class_allows', 'row_organization_id', p_row_org));
  exception when others then
    -- A refusal that cannot be recorded is still a refusal. It is never downgraded to a pass, and
    -- the failure to record says so in the same breath as the refusal itself.
    v_why := v_why || format(' [the refusal could not be audited: %s]', sqlerrm);
  end;

  -- The reason travels out in a place a caught exception cannot erase.
  perform set_config('iam.class_gate_last_reason', v_why, true);
  return false;
end
$function$;

comment on function iam.class_allows(text, text, uuid) is
  'The data-class gate for definer functions (read | rewrite_owner | reparent | share_link | '
  'bulk_export). DD-216: it resolves the token''s class through iam.class_lanes — the ONE resolver '
  'the whole class regime shares — so a component is answered by its composition parent (db-rules '
  '§6d-1) instead of by a coalesce that read its by-design NULL column as ''private''. Guarded by '
  'pnpm check:class-gate.';

-- THE PROOF, IN THE FILE — and it costs no audit rows.
-- `iam.class_allows` writes an audit row on every refusal, so this block never calls it. It asserts
-- the two properties the guard asserts: the gate's class source IS iam.class_gate_class (and nothing
-- else), and that class agrees with the lane set iam.class_lanes declares, on every active token.
do $check$
declare v_src text; v_bad text;
begin
  v_src := pg_get_functiondef('iam.class_allows(text,text,uuid)'::regprocedure);
  if v_src !~ 'iam\.class_gate_class' then
    raise exception 'DD-216: iam.class_allows does not take its class from iam.class_gate_class.';
  end if;
  if v_src ~* 'from[[:space:]]+platform\.entity_types' then
    raise exception 'DD-216: iam.class_allows still reads platform.entity_types directly — that is '
                    'the second, divergent copy of the resolver this file removed.';
  end if;

  select string_agg(format('%s (gate=%s, lanes=%s)', et.token,
                           iam.class_gate_class(et.token),
                           (iam.class_lanes(et.token)).resolved_class), ', ')
    into v_bad
    from platform.entity_types et
   where et.is_active
     and iam.class_gate_class(et.token)
         is distinct from (iam.class_lanes(et.token)).resolved_class::text;
  if v_bad is not null then
    raise exception 'DD-216: the class gate disagrees with iam.class_lanes on: %', v_bad;
  end if;

  select string_agg(format('%s (class=%s, share_link_lane=%s)', et.token,
                           iam.class_gate_class(et.token),
                           (iam.class_lanes(et.token)).share_link_lane), ', ')
    into v_bad
    from platform.entity_types et
   where et.is_active
     and (iam.class_gate_class(et.token) in ('organization','public'))
         is distinct from (iam.class_lanes(et.token)).share_link_lane;
  if v_bad is not null then
    raise exception 'DD-216: the gate''s share_link verdict and iam.class_lanes.share_link_lane '
                    'have drifted apart on: %', v_bad;
  end if;

  raise notice 'DD-216: one resolver. Every active token''s gate class equals its iam.class_lanes '
               'resolved class, and the share_link verdict matches its lane.';
end
$check$;
