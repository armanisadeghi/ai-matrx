-- target: branch
set lock_timeout = '2s';
drop function if exists custom.reopen_declared_doors();
delete from platform.client_callable_door where schema_name='custom' and function_name='reopen_declared_doors';
