// Lane SN-SCOPES (2026-10-01): Cedar Ridge Physical Therapy is set to "members see only what is shared
// with them" for the length of one walk (committed on the clone, Cedar Ridge only). The walk's member
// step (S11) must go RED: test@test.com no longer sees the Treatment Programs type or the ACL Rehab scope
// admin made a minute earlier. The override row is marked and removed after; the read-back proves it.
const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
export default {
  id: "scopes-walk-cedar-ridge-shared-only",
  check: "scopes.walk-seat",
  items: ["S11"],
  description: "Cedar Ridge's custom/member_default_visibility = shared_only (clone, one walk)",
  mode: "committed",
  captureRestore: `select case when exists (select 1 from platform.knob_override where feature = 'custom' and key = 'member_default_visibility' and scope_kind = 'organization' and scope_id = '${ORG}')
    then (select format('update platform.knob_override set value = %L::jsonb, set_note = %L where feature = ''custom'' and key = ''member_default_visibility'' and scope_kind = ''organization'' and scope_id = %L', value::text, set_note, scope_id) from platform.knob_override where feature = 'custom' and key = 'member_default_visibility' and scope_kind = 'organization' and scope_id = '${ORG}')
    else format('delete from platform.knob_override where feature = ''custom'' and key = ''member_default_visibility'' and scope_kind = ''organization'' and scope_id = %L', '${ORG}') end;`,
  apply: `insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
    values ('custom', 'member_default_visibility', 'organization', '${ORG}', '${ORG}', '"shared_only"'::jsonb, 'safety-net plant scopes-walk-cedar-ridge-shared-only')
    on conflict (feature, key, scope_kind, scope_id, organization_id) do update set value = excluded.value, set_note = excluded.set_note;`,
  restore: "",
  readback: `select iam.member_lane_open('${ORG}');`,
};
