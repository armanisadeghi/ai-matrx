-- chair-step: these six invoker functions are executable by a signed-in person and then call a helper that person cannot execute, so every call dies with 42501. The helpers stay closed. The outer functions are provisioning and sweep machinery, not product doors, so the signed-in grant is removed and the service role keeps its own. seo._tm_rendition_of is declared private and authenticated still held EXECUTE.

revoke all on function hr._wf_waiting_visible(uuid) from public;
grant execute on function hr._wf_waiting_visible(uuid) to service_role;

revoke execute on procedure iam.sweep_governance_guards(text) from authenticated;
revoke execute on function platform.declare_soft_delete_edge(text, text, text, text, text, text, text, text, text, text) from authenticated;
revoke execute on function platform.definer_access_decision_regex_strong() from authenticated;
revoke execute on function platform.provision_arg_check_findings(text, text, jsonb) from authenticated;
revoke execute on function platform.provision_preflight() from authenticated;
revoke execute on function seo._tm_rendition_of(uuid, text) from authenticated;
