// Lane SN-SCOPES (2026-10-01): the archive wall comes down. Inside the suite's own rolled-back
// transaction, iam.has_org_access_for is re-created from its live body with the clause that closes an
// archived organization ("and o.archived_at is null") removed. A member of an archived clinic then gets
// her edit through custom.context_scope_write, so scopes.sql-member-visibility's S12 clause must go RED
// ("the scopes write door still takes her edit of Dana"). Nothing commits.
export default {
  id: "scopes-archived-org-edit-allowed",
  check: "scopes.sql-member-visibility",
  items: ["S12"],
  description: "iam.has_org_access_for without its archived-organization clause (an archived org is open again)",
  mode: "in-transaction",
  apply: `do $plant$ declare d text; begin
  d := pg_get_functiondef('iam.has_org_access_for(uuid,uuid)'::regprocedure);
  if position('and o.archived_at is null' in d) = 0 then raise exception 'plant: the archive clause is not in iam.has_org_access_for any more'; end if;
  execute replace(d, 'and o.archived_at is null', '');
end $plant$;`,
};
