-- ACCESS LADDER T-16c: the door-rows gate's DD-213c arm measured the retired emergency door; it now
-- measures its successor. This recipe lets the gate call the take-over door as a stranger aimed at
-- another organization's member, which must be refused and must write NOTHING into that
-- organization's iam.access_audit (DD-213c). Every probe runs inside a rolled-back transaction.
update platform.client_callable_door
   set probe_args = jsonb_build_object(
         'args', jsonb_build_object(
           'p_org_id', 'other_org',
           'p_user_id', 'victim_user',
           'p_purpose', 'literal:offboarding',
           'p_reason', 'literal:Door-rows probe: a stranger asking to take over another organization''s member.',
           'p_new_password', 'literal:door-rows-probe-never-applied'),
         'note', 'A stranger names another organization and its member: the door must refuse, and iam._record_access_audit must keep that refusal out of the organization''s log (DD-213c). The probe transaction is always rolled back.')
 where schema_name = 'public' and function_name = 'org_admin_take_over_account';
