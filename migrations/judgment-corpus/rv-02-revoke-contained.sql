-- expect: branch=accept production=accept
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
--
-- The bounded route: `-- allows: revoke <schema>`, which admits that statement and nothing else,
-- and only when EVERY REVOKE in the body stays inside the named schema.
--
revoke select on all tables in schema custom from authenticated;
