// Lane SN-SCOPES (2026-10-01): one value in the record store's copy of a Cedar Ridge scope is changed
// behind the old system's back — Dana Whitfield's Allergies says "None known" in the store while the
// old context tables still say "Latex, penicillin". Both resolvers then hand the agent different bytes,
// so context_parity --every-type must report a defect (S09, S10 RED). Committed on the clone for the
// length of one parity run; the restore puts back the exact document captured just before.
const ID = "f3cf712a-d07b-41cd-b6bc-5dd3fb662ae4"; // Cedar Ridge PT · Patients · Dana Whitfield
export default {
  id: "scopes-parity-store-value-changed",
  check: "scopes.cmd-context-parity",
  items: ["S09", "S10"],
  description: "Cedar Ridge's Dana Whitfield: Allergies changed in the store copy only (old tables untouched)",
  mode: "committed",
  captureRestore: `select format('begin; set local lock_timeout = ''60s''; update custom.record set data = %L::jsonb where id = %L; commit', data::text, id) from custom.record where id = '${ID}' and organization_id = '0a54df90-eab8-4d07-ab29-81a45fb41e04';`,
  apply: `begin; set local lock_timeout = '60s'; update custom.record set data = jsonb_set(data, '{allergies}', '"None known"') where id = '${ID}' and organization_id = '0a54df90-eab8-4d07-ab29-81a45fb41e04' and data->>'allergies' = 'Latex, penicillin'; commit;`,
  restore: "",
  readback: `select data->>'allergies' = 'Latex, penicillin' from custom.record where id = '${ID}';`,
};
