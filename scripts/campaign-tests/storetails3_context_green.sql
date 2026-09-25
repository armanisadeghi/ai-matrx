-- LANE STORE-TAILS-3 — WHAT AN AGENT MAY SEE FOLLOWS WHAT A COLUMN READS.
--
-- THE USE CASE. The Birchwood owner talks to an agent about her rooms ("which rooms are behind
-- schedule?") and keeps the Budget out of every conversation — the agent is shown room names,
-- statuses and dates, never what she is willing to spend. Beside Budget sits *Budget with
-- contingency* (`{Budget} * 1.1`). She also gives the agent the contractors' quote amounts only
-- when she asks for them. What the agent is handed about a room must never contain the budget one
-- division away, nor the quote total she did not ask for.
--
-- WHAT MAKES IT FAIL (RED on the bodies before storetails3_what_an_agent_may_see_follows_what_a_column_reads.sql):
-- Budget with contingency still says `include` after Budget is kept out (P1); a new formula over
-- Budget is declared `include` (P2); the rollup of on-request amounts says `include` (P3); the
-- floor can be lowered below its input (P4); the agent's view of Kitchen carries 19,800 (P5).
--
-- SEAT: every door is called as `authenticated` with admin@admin.com's claims.

\set ON_ERROR_STOP on
\timing off
\set suite 'storetails3_context_green.sql'
\set requires 'function:custom.record_scope_context|function:custom.field_input_closure'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

\i scripts/campaign-tests/_storetails3_fixture.sql

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid; v_rooms uuid; v_quotes uuid; v_kitchen uuid; v_ctx jsonb; v_id uuid;
  v_budget uuid; v_bwc uuid; v_amount uuid; v_label uuid;
  v_w text;
begin
  select v into v_org from st3 where k = 'org';
  select v into v_rooms from st3 where k = 'rooms';
  select v into v_quotes from st3 where k = 'quotes';
  select v into v_kitchen from st3 where k = 'Kitchen';
  perform set_config('request.jwt.claims', c_admin_j, true);

  select f.id into v_budget from custom.record f where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null and f.data ->> 'entity_definition_id' = v_rooms::text and f.data ->> 'key' = 'budget';
  select f.id into v_bwc from custom.record f where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null and f.data ->> 'entity_definition_id' = v_rooms::text and f.data ->> 'key' = 'budget_with_contingency';
  select f.id into v_amount from custom.record f where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null and f.data ->> 'entity_definition_id' = v_quotes::text and f.data ->> 'key' = 'amount';
  perform set_config('role', 'authenticated', true);

  -- ══ P1. the Budget is kept out of conversations; the column worked out from it follows ══
  perform custom.field_update(v_org, v_budget, jsonb_build_object('context_policy', 'exclude'));
  perform set_config('role', 'postgres', true);
  select f.data ->> 'context_policy' into v_w from custom.record f where f.organization_id = v_org and f.id = v_bwc;
  perform set_config('role', 'authenticated', true);
  if v_w is distinct from 'exclude' then
    raise exception 'P1: Budget is kept out of conversations and Budget with contingency still says "%"', v_w;
  end if;
  raise notice 'P1 PASS — Budget set to exclude; Budget with contingency followed it to "%"', v_w;

  -- ══ P2. a new formula over Budget is declared kept out; one over Room name is not ══
  v_id := custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'budget_per_week', 'label', 'Budget per week',
    'type', 'formula', 'formula_text', '{Budget} / 12', 'sort', 45));
  v_label := custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'room_label', 'label', 'Room label',
    'type', 'formula', 'formula_text', 'UPPER({Room name})', 'sort', 46));
  perform set_config('role', 'postgres', true);
  select f.data ->> 'context_policy' into v_w from custom.record f where f.organization_id = v_org and f.id = v_id;
  if v_w is distinct from 'exclude' then
    perform set_config('role', 'authenticated', true);
    raise exception 'P2: Budget per week was declared "%" over an excluded Budget', v_w;
  end if;
  select f.data ->> 'context_policy' into v_w from custom.record f where f.organization_id = v_org and f.id = v_label;
  perform set_config('role', 'authenticated', true);
  if coalesce(v_w, 'include') <> 'include' then
    raise exception 'P2: Room label, over Room name only, was declared "%" (want include)', v_w;
  end if;
  raise notice 'P2 PASS — Budget per week declared exclude; Room label stays include';

  -- ══ P3. quote amounts on request: the room's rolled-up total follows ══
  perform custom.field_update(v_org, v_amount, jsonb_build_object('context_policy', 'on_request'));
  perform set_config('role', 'postgres', true);
  select f.data ->> 'context_policy' into v_w from custom.record f where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.data ->> 'entity_definition_id' = v_rooms::text and f.data ->> 'key' = 'quoted_total' and f.deleted_at is null;
  perform set_config('role', 'authenticated', true);
  if v_w is distinct from 'on_request' then
    raise exception 'P3: Amount is given on request and Quoted so far (its rollup, on another table) says "%"', v_w;
  end if;
  raise notice 'P3 PASS — Amount on request; Quoted so far (rolled up from it) followed to "%"', v_w;

  -- ══ P4. the floor holds against an edit that asks for less ══
  perform custom.field_update(v_org, v_bwc, jsonb_build_object('context_policy', 'include'));
  perform set_config('role', 'postgres', true);
  select f.data ->> 'context_policy' into v_w from custom.record f where f.organization_id = v_org and f.id = v_bwc;
  perform set_config('role', 'authenticated', true);
  if v_w is distinct from 'exclude' then
    raise exception 'P4: Budget with contingency was lowered to "%" while Budget is excluded', v_w;
  end if;
  raise notice 'P4 PASS — asked to be "include" while it reads an excluded Budget, it stays "exclude"';

  -- ══ P5. what the agent is handed about Kitchen ══
  v_ctx := custom.record_scope_context(v_org, v_kitchen);
  if (v_ctx -> 'fields')::text ~ '19800|18000|1500' then
    raise exception 'P5: the agent''s view of Kitchen carries the budget or a column worked out from it: %', v_ctx -> 'fields';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_ctx -> 'withheld') w
                  where w ->> 'key' = 'budget_with_contingency' and w ->> 'because' = 'policy') then
    raise exception 'P5: Budget with contingency is not named among what the agent was not given: %', v_ctx -> 'withheld';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_ctx -> 'fields') x where x ->> 'key' = 'room_label' and x ->> 'value' = 'KITCHEN') then
    raise exception 'P5: the agent lost Room label, which it may be given: %', v_ctx -> 'fields';
  end if;
  raise notice 'P5 PASS — the agent is handed Kitchen without 18,000 / 19,800 / 1,500; Budget with contingency named as kept out by policy; Room label still given';
  raise notice 'storetails3_context_green.sql: ALL PASS (P1-P5)';
end
$t$;

rollback;
