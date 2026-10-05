import pg from "pg";
import { readFileSync } from "fs";
const url = readFileSync(".env.local","utf8").split("\n").find(l=>l.startsWith("CLONE_DATABASE_URL="))!.slice(19).replace(/^"|"$/g,"");
(async()=>{ const c=new pg.Client({connectionString:url.replace(/[?&]sslmode=[^&]*/,""), ssl:{rejectUnauthorized:false}}); await c.connect();
 try{ const r:any=await c.query(readFileSync(process.argv[2],"utf8")); for(const x of (Array.isArray(r)?r:[r])) if(x.rows?.length) console.log(JSON.stringify(x.rows)); console.log("done"); }
 catch(e:any){console.log("ERR",e.code,e.message)} finally{await c.end()} })();
