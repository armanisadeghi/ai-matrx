-- lane: KERNEL-SHADOW
-- based-on: iam.kernel_shadow_sweep(integer, integer) 30fcad78c59f5f79602c3cf9cfb71638014e29639a5005a5a2d18251803f0d26
-- KERNEL-SHADOW f — the drift sweep writes its summaries (measured: its first live run compared 3,000
-- answers and wrote none, because the shadow only writes an agreement into a transaction that has
-- already written). Inverse: migrations/inverse/kernel_shadow_f_sweep_writes_its_summaries_down.sql

create or replace function iam.kernel_shadow_sweep(p_people integer default 3, p_tables integer default 300)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
-- KERNEL-SHADOW: the read-write half of the drift guard (unscheduled until Arman approves one). Browser traffic is read-only and cannot write
-- the shadow log, so this compares both forms of the access kernel, in its own transaction, for
-- admin@admin.com, test@test.com and p_people random members, each on p_tables random Tables at
-- viewer and editor, through iam.has_access_for_shadow (which logs and raises system errors).
declare
  v_people uuid[];
  v_p uuid;
  v_lvl text;
  v_targets uuid[];
  v_n integer := 0;
begin
  -- The shadow writes an agreement only into a transaction that has already written (it must never
  -- cost a caller the statement memo). The sweep IS its own transaction and its summaries are its
  -- point, so it takes a transaction id first.
  perform pg_catalog.pg_current_xact_id();
  v_people := array['87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid]
           || array(select distinct on (u) u from (select om.user_id as u from iam.organization_member om
                                                   order by random() limit greatest(p_people, 0) * 4) z
                     limit greatest(p_people, 0));
  foreach v_p in array v_people loop
    v_targets := array(select r.id from custom.record r tablesample system (5)
                        where r.table_id = custom.table_kernel_id() limit greatest(p_tables, 1));
    foreach v_lvl in array array['viewer', 'editor'] loop
      perform 1 from iam.has_access_for_shadow(v_p, v_targets, v_lvl, 'record', 'iam.kernel_shadow_sweep');
      v_n := v_n + coalesce(cardinality(v_targets), 0);
    end loop;
  end loop;
  return jsonb_build_object('people', cardinality(v_people), 'compared', v_n);
end;
$function$;
