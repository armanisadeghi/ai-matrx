-- chair-step: undo kernel_shadow_f_sweep_writes_its_summaries.sql - the sweep no longer takes a transaction id first, so its agreements go to the server log instead of iam.access_shadow_log
-- lane: KERNEL-SHADOW
-- based-on: iam.kernel_shadow_sweep(integer, integer) 7e71dcbf1c419ace5b4329515f7798e9230ded01acc6dfee84009cf4849aa6da

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
