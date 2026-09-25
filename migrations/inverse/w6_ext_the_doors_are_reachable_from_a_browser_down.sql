-- chair-step: the exact inverse of `migrations/campaign/w6_ext_the_doors_are_reachable_from_a_browser.sql`. It removes `custom` from `pgrst.db_schemas`, revokes EXECUTE on the switch door from `authenticated`, and deletes the door declaration that file added — putting every client back where it was: unable to reach any door of the record store over HTTP. Nothing else in the store changes; no record, knob or grant other than the one named here is touched.
--
-- W6-EXT — THE DOORS ARE NOT REACHABLE FROM A BROWSER (the way back).
--
-- Run this if client reach into `custom` must be closed again. It is written so
-- that "closed" is a measurement afterwards, not a claim: the last statement
-- prints `platform.schema_exposure_violations('custom')`, which is empty when
-- the schema holds nothing a client role may touch except its declared doors.

set lock_timeout = '2s';
set statement_timeout = '600s';

alter role authenticator set pgrst.db_schemas =
  'api,public,graphql_public,rag,scraper,workflow,files,legal,knowledge,agent,ai,app,chat,context,skill,tool,workspace,work,admin,billing,browser,canvas,code,communication,content_ir,crm,dictionary,docproc,education,extend,graveyard,growth,hindsight,history,iam,interview,marketing,media,meta,ops,pdf,plan,platform,podcast,research,runtime,scheduler,seo,transcripts,ui,users,web,workbench,assignment,audit,batch,mandate,commerce';

revoke execute on function custom.store_is_open(uuid) from authenticated;

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name = 'store_is_open'
   and declared_by = 'migrations/campaign/w6_ext_the_doors_are_reachable_from_a_browser.sql (lane W6-EXT)';

notify pgrst, 'reload config';

select * from platform.schema_exposure_violations('custom');
