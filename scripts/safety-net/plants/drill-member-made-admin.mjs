// The usage page's door hands the platform's numbers to a member: on the clone, test@test.com is
// made a platform admin for the length of one walk. R05 must go RED (the member sees groups).
export default {
  id: "drill-member-made-admin",
  check: "drill.walk-drill",
  items: ["R05"],
  description: "test@test.com is given a platform admin row on the clone (the usage page then answers her)",
  mode: "committed",
  apply: `insert into admin.admins (user_id, level, metadata) values ('4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'developer', '{"safety_net_plant": true}') on conflict (user_id) do nothing;`,
  restore: `delete from admin.admins where user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14' and metadata->>'safety_net_plant' = 'true';`,
  readback: `select not exists (select 1 from admin.admins where user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14');`,
};
