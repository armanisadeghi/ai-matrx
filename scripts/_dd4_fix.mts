import type pg from "pg";
import { q } from "./_dd4_lib.mts";
export const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd";
export const TECH = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
export const CLAIMS = `{"sub":"${ADMIN}","role":"authenticated"}`;
export async function seat(c: pg.Client, as: "authenticated" | "postgres") {
  await q(c, `select set_config('request.jwt.claims', $1, true), set_config('role', $2, true)`, [CLAIMS, as]);
}
export async function fixture(c: pg.Client, n: number, nApprovals: number) {
  await q(c, `select set_config('request.jwt.claims', $1, true)`, [CLAIMS]);
  const f = (await q(c, `
  do $f$ declare v_org uuid := gen_random_uuid(); v_home uuid; v_t uuid;
  begin
    perform set_config('app.actor_system','dd4-proof',true);
    insert into iam.organizations (id,name,slug,abbreviation,created_by) values (v_org,'Harborview Mobile Mechanic Eastside '||substr(v_org::text,1,8),'harborview-dd4-'||substr(v_org::text,1,8),'HME',$A$${ADMIN}$A$);
    insert into iam.memberships (organization_id,container_type,container_id,user_id,role,status) values
      (v_org,'organization',v_org,$A$${ADMIN}$A$,'owner','active'),(v_org,'organization',v_org,$A$${TECH}$A$,'member','active');
    insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'dd4');
    insert into custom.record (organization_id,table_id,data) values (v_org,null,jsonb_build_object('name','Eastside van')) returning id into v_home;
    perform set_config('role','authenticated',true);
    v_t := custom.table_declare(v_org, jsonb_build_object('name','Service jobs','slug','service_jobs_'||substr(v_org::text,1,8),'type','entity',
      'label_singular','Job','label_plural','Jobs','title_field','vehicle','display','page','weight','light','ordered',false,'row_order','sorted',
      'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,'on_delete','cascade',
      'fields', jsonb_build_array(jsonb_build_object('name','vehicle'),jsonb_build_object('name','job'),jsonb_build_object('name','quote'),jsonb_build_object('name','status')),
      'parent_id', v_home::text));
    perform custom.field_declare(v_org,v_t,jsonb_build_object('key','vehicle','label','Vehicle','plain','text','sort',10,'required',true));
    perform custom.field_declare(v_org,v_t,jsonb_build_object('key','job','label','Job','plain','text','sort',20));
    perform custom.field_declare(v_org,v_t,jsonb_build_object('key','quote','label','Quote','plain','number','sort',30));
    perform custom.field_declare(v_org,v_t,jsonb_build_object('key','status','label','Status','type','select','sort',40,'options',jsonb_build_array('Open','Booked','Done')));
    perform custom.field_declare(v_org,v_t,jsonb_build_object('key','with_tax','label','With tax','type','formula','formula_text','{Quote} * 1.1','sort',50));
    perform set_config('dd4.org', v_org::text, false); perform set_config('dd4.tbl', v_t::text, false);
  end $f$`)); 
  const g = await q(c, `select current_setting('dd4.org') org, current_setting('dd4.tbl') tbl`);
  const { org, tbl } = g[0];
  // rows via the write door in bulk batches of 100 as the member
  for (let i = 0; i < n; i += 100) {
    const k = Math.min(100, n - i);
    await q(c, `select custom.record_write($1::uuid,$2::uuid, jsonb_build_object('vehicle','Vehicle '||g,'job','Brake job '||g,'quote',100+g,'status','Open')) from generate_series($3::int,$4::int) g`, [org, tbl, i + 1, i + k]);
  }
  await seat(c, "postgres");
  const ids = (await q(c, `select id from custom.record where organization_id=$1 and table_id=$2 and data_class='record' order by (data->>'vehicle') is null, length(data->>'vehicle'), data->>'vehicle'`, [org, tbl])).map((r: any) => r.id);
  await seat(c, "authenticated");
  const step = Math.floor(n / Math.max(nApprovals, 1));
  for (let i = 0; i < nApprovals; i += 1) {
    await q(c, `select custom.work_approval_request($1::uuid, $2::uuid, jsonb_build_object('kind','record_patch','patch', jsonb_build_object('quote', $3::int)), 'Parts quote came in higher', $4::uuid, 'person', null)`, [org, ids[i * step], 900 + i, TECH]);
  }
  await seat(c, "postgres");
  return { org, tbl };
}
