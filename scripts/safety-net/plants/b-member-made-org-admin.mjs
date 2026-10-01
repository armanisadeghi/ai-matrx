// SAFETY-NET-B · A09. On the clone, test@test.com becomes an ADMIN of Cedar Ridge Physical Therapy for one probe run, so
// the member's write through REST v1 is no longer refused. A09 "control.member_write_refused" must go RED.
export default {
  id: "b-member-made-org-admin",
  check: "agents.api-mcp",
  items: ["A09"],
  description: "test@test.com's role in Cedar Ridge Physical Therapy is admin instead of member (clone, one run)",
  mode: "committed",
  apply: `update iam.organization_member set role = 'admin'
           where organization_id = '0a54df90-eab8-4d07-ab29-81a45fb41e04' and user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14' and role = 'member';`,
  restore: `update iam.organization_member set role = 'member'
             where organization_id = '0a54df90-eab8-4d07-ab29-81a45fb41e04' and user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14';`,
  readback: `select role = 'member' from iam.organization_member
              where organization_id = '0a54df90-eab8-4d07-ab29-81a45fb41e04' and user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14';`,
};
