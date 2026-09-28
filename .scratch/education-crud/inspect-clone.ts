import {connectDirect,loadDbEnv} from '../../scripts/lib/direct-db';
import {loadCloneDbEnv,loadCloneRef} from '../../scripts/lib/migration-target';
async function main(){
const live=loadDbEnv(); if('missing' in live)throw new Error('Live connection configuration unavailable');
const connections=[['live',live],['clone',loadCloneDbEnv(process.cwd(),loadCloneRef(process.cwd()))]] as const;
for(const [name,env]of connections){const c=await connectDirect(env,'education-crud-schema-inspection');try{const r=await c.query(`select table_schema,column_name,data_type,is_nullable,column_default from information_schema.columns where table_name='ui_surface_value' and column_name='max_inline_chars'`);console.log(name,r.rows);}finally{await c.end();}}

}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
