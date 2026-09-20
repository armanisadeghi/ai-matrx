-- additive: yes
--
-- chair-step: it REPLACES the live body of `custom._record_rule_uses`, the BEFORE-ROW trigger
--   that runs a Table's validate and compute Rules. Nothing is created, dropped, granted or
--   revoked and no row of anybody's data is touched; a `-- guard:` line would be a comment
--   pretending to be a switch, because this body IS the write path. It carries a
--   `-- based-on:` hash of the body it was written against, so it refuses outright if anybody
--   has moved it since. The inverse is
--   `migrations/inverse/writeperf2_the_write_path_asks_the_ladder_only_for_a_rule_down.sql`.
--
-- based-on: custom._record_rule_uses() 7d0a6c23122753e6b42639099156eb8b65ee3a8eeddc1f3e187b2dcfa78c5902
--
-- WRITE-PERF-2 — THE WRITE PATH ASKS THE VISIBILITY LADDER ONLY WHEN A RULE CAN READ THE ANSWER.
--
-- MEASURED ON THE MAIN DATABASE, 2026-09-20, EXPLAIN ANALYZE of ONE 200-row insert into
-- `custom.record` (a throwaway organization, an Accounts Table of 10, a Deals Table with six
-- typed columns, NO Rules — which is what almost every Table in the platform is):
--
--     Trigger custom_record_rule_uses   3,827.1 ms / 200 calls = 19.1 ms PER ROW
--     the whole 200-row write            7,312.8 ms            = 36.6 ms PER ROW
--
-- ONE TRIGGER WAS 52% OF EVERY WRITE IN THE STORE, and the Table it was measured on has no Rule
-- at all. Where it goes, measured directly on the same fixture:
--
--     custom.effective_level(admin, org, table, 'table')   16.772 ms A CALL
--     custom.table_rules(org, table, 'validate', null)      0.356 ms
--     custom.table_rules(org, table, 'compute',  null)      0.353 ms
--     custom.table_type_field(org, table)                   0.320 ms
--     custom.assert_store_door(org, …)                      0.057 ms
--
-- `custom.effective_level` halves the rung ladder with `custom.has_visibility`, which walks
-- `platform.associations`; 16.8 ms is what that walk costs today on 87k edges. It is lane
-- LADDER-CAP's object and this file does not touch it.
--
-- WHAT THIS FILE CHANGES, AND NOTHING ELSE. `v_me`, `v_level` and `v_ctx` are read in exactly
-- ONE place in this function: the two `custom.rule_run(…, v_ctx)` calls inside the validate and
-- compute loops. When a Table has neither kind of Rule, both loops have no iterations and the
-- context is handed to nobody — so it is now built only when there is a Rule that can ask for
-- it. The two `custom.table_rules` calls the function always made are made in the same order,
-- once each, into arrays, and the loops iterate those arrays. A Table WITH Rules pays exactly
-- what it paid before, in the same order, with the same values.
--
-- COLLISION NOTE. `custom._record_rule_uses` is lane PIPELINES's object — they hold
-- `campaign_watch.build_lock` row `PIPELINES` ("three additive expression nodes and the writer
-- context on custom.rule_eval / custom.rule_node_kinds / custom._record_rule_uses"). This file
-- is `create or replace` on top of the body the catalogue held at 21:4xZ, with every existing
-- branch kept character for character and only the context block moved inside an `if`. The
-- `-- based-on:` hash is the fence: if PIPELINES lands their writer context first, this file
-- REFUSES rather than reverting them, and it is re-based on their body. If they re-apply after
-- this, the laziness disappears and `custom_record_rule_uses` goes back to 19 ms a row — said
-- here, in the BUILD-LOG row and in PROGRESS-WRITE-PERF-2.md so the next seat knows where the
-- time went rather than re-measuring it.
CREATE OR REPLACE FUNCTION custom._record_rule_uses()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_type_field text;
  v_rtype      text;
  r            custom.record;
  v_run        jsonb;
  v_truth      boolean;
  v_key        text;
  v_computed   jsonb := '{}'::jsonb;
  v_prior      jsonb;
  v_retired    jsonb;
  v_stale      text;
  v_ctx        jsonb;
  v_me         uuid;
  v_level      public.permission_level;
  v_validate   custom.record[];
  v_compute    custom.record[];
begin
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  if new.data_class in ('kernel', 'relation')
     or new.table_id is null
     or new.table_id = custom.table_kernel_id()
     or new.table_id = custom.field_kernel_id()
     or new.table_id = custom.rule_kernel_id()
     or new.table_id = custom.merge_field_kernel_id() then
    return new;
  end if;

  v_type_field := custom.table_type_field(new.organization_id, new.table_id);
  if v_type_field is not null then
    v_rtype := new.data ->> v_type_field;
  end if;

  -- ── THE RULES THIS TABLE HAS, READ ONCE, BEFORE ANYTHING IS WORKED OUT FOR THEM. ──
  -- WRITE-PERF-2: exactly the two `custom.table_rules` calls this function always made, taken
  -- here so the answer can be looked at before the context below is built.
  select coalesce(array_agg(t), '{}'::custom.record[]) into v_validate
    from custom.table_rules(new.organization_id, new.table_id, 'validate', v_rtype) t;
  select coalesce(array_agg(t), '{}'::custom.record[]) into v_compute
    from custom.table_rules(new.organization_id, new.table_id, 'compute', v_rtype) t;

  -- ── PIPELINES: THE CONTEXT. ─────────────────────────────────────────────────────────
  -- What this write is replacing, what it is about, and who is making it. A Rule asks for
  -- these by name (`previous`, `stage_count`, `actor_at_least`) or never sees them.
  --
  -- 🚨 WRITE-PERF-2 (2026-09-20), MEASURED: `custom.effective_level` costs 16.77 ms A CALL on
  -- the main database — it halves the rung ladder with `custom.has_visibility`, which walks
  -- `platform.associations` — and this trigger called it ONCE PER ROW WRITTEN, on every table
  -- in the platform, whether or not any Rule existed to read the answer. On a 200-row insert
  -- that was 3,827 ms of the 7,313 ms the whole write cost: 19.1 ms of 36.6 ms PER ROW, more
  -- than every other trigger on `custom.record` put together, spent working out a number that
  -- `v_ctx` then handed to nobody. `v_ctx` is read in exactly one place — the `custom.rule_run`
  -- calls in the two loops below — so when this Table has no validate and no compute Rule it
  -- is never read at all. It is now built only when there is a Rule that can ask for it. A
  -- Table WITH rules pays exactly what it paid before, to the microsecond.
  if coalesce(array_length(v_validate, 1), 0) > 0 or coalesce(array_length(v_compute, 1), 0) > 0 then
    v_me := custom.query_principal();
    if v_me is not null then
      v_level := custom.effective_level(v_me, new.organization_id,
                                        case when tg_op = 'UPDATE' then new.id else new.table_id end,
                                        case when tg_op = 'UPDATE' then 'record' else 'table' end);
    end if;
    v_ctx := jsonb_build_object(
               'previous_values', case when tg_op = 'UPDATE' then old.data else 'null'::jsonb end,
               'record_id',       to_jsonb(new.id),
               'table_id',        to_jsonb(new.table_id),
               'actor_level',     to_jsonb(v_level));
  end if;

  -- ── USE 1: VALIDATE. A `false` answer refuses the write, naming the Rule. ──────────
  foreach r in array v_validate loop
    v_run   := custom.rule_run(new.organization_id, r.id, new.data, v_ctx);
    v_truth := custom.rule_truth(v_run -> 'answer');
    if v_truth is false then
      raise exception '%', coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name')
        using errcode = '23514',
              hint = format('REC-15: the rule "%s" (version %s) is not satisfied by this record.',
                            r.data ->> 'name', v_run ->> 'rule_version');
    end if;
  end loop;

  -- ── USE 2: COMPUTE. ────────────────────────────────────────────────────────────────
  foreach r in array v_compute loop
    v_key := custom.rule_field_key(new.organization_id, (r.data ->> 'target_field_id')::uuid);
    if v_key is null then
      raise exception 'the rule % works out a field that is not there any more', r.data ->> 'name'
        using errcode = '23503',
              hint = 'REC-18: deleting a Field a Rule depends on is refused naming the Rule (W3-MIG). This is what the compute use says when it happens anyway.';
    end if;
    v_run := custom.rule_run(new.organization_id, r.id, new.data, v_ctx);
    v_computed := v_computed || jsonb_build_object(v_key, jsonb_build_object(
      'value',        v_run -> 'answer',
      'field_id',     r.data ->> 'target_field_id',
      'rule_id',      v_run ->> 'rule_id',
      'rule_version', (v_run -> 'rule_version'),
      'at',           to_jsonb(now())));
  end loop;

  if jsonb_typeof(new.data -> '_computed') = 'object' then
    v_prior := case when tg_op = 'UPDATE' then coalesce(old.data -> '_computed', '{}'::jsonb)
                    else '{}'::jsonb end;
    for v_stale in
      select k from jsonb_object_keys(new.data -> '_computed') k where not (v_computed ? k)
    loop
      if (v_prior -> v_stale) is distinct from (new.data -> '_computed' -> v_stale) then
        raise exception 'this record carries a worked-out answer for % that no rule works out', v_stale
          using errcode = '23514',
                hint = 'REC-15 / FLD-9: a worked-out answer belongs to the Rule that works it out, and it carries that Rule''s id and version. A value written here by hand would be served as if the system had worked it out.';
      end if;
      v_retired := coalesce(new.data -> '_retired', '[]'::jsonb) || jsonb_build_object(
        'key',    v_stale,
        'label',  coalesce(custom.rule_field_label(new.organization_id,
                             (v_prior -> v_stale ->> 'field_id')::uuid), v_stale),
        'value',  v_prior -> v_stale -> 'value',
        'reason', format('this record changed, and nothing works out %s for it any more',
                         coalesce(custom.rule_field_label(new.organization_id,
                                    (v_prior -> v_stale ->> 'field_id')::uuid), v_stale)),
        'rule_id',      v_prior -> v_stale -> 'rule_id',
        'rule_version', v_prior -> v_stale -> 'rule_version',
        'at',     to_jsonb(now()));
      new.data := jsonb_set(new.data, '{_retired}', v_retired);
    end loop;
  end if;

  if v_computed = '{}'::jsonb then
    new.data := new.data - '_computed';
  else
    new.data := jsonb_set(new.data, '{_computed}', v_computed);
  end if;

  return new;
end;
$function$;
