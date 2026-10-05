-- lane: AGENTS-ON-DATA
-- Inverse of agentsondata_c: the table page's surface default goes.
set local statement_timeout = '30s';
delete from tool.surface_defaults where surface_name = 'matrx-user/data-tables';
