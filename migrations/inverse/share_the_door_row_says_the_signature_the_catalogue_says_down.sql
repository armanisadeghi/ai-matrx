-- chair-step: the inverse. Puts `public.permission_level` back into the two door rows' identity_args, which re-breaks `pnpm check:store-doors-decide` with the two signature mismatches this lane found. Rule 27 only.
update platform.client_callable_door d
   set identity_args = replace(d.identity_args, ' permission_level', ' public.permission_level')
 where d.schema_name = 'custom'
   and d.function_name in ('share_grant', 'share_lane_set');
