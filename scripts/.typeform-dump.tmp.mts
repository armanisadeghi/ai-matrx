import pg from "pg";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync("/Users/armanisadeghi/code/aidream/.env","utf8").split("\n").filter(l=>/^SUPABASE_MATRIX_/.test(l)).map(l=>{const i=l.indexOf("=");return [l.slice(0,i), l.slice(i+1).replace(/^["']|["']$/g,"")];}));
const c = new pg.Client({user:env.SUPABASE_MATRIX_USER,password:env.SUPABASE_MATRIX_PASSWORD,host:env.SUPABASE_MATRIX_HOST,port:Number(env.SUPABASE_MATRIX_PORT),database:env.SUPABASE_MATRIX_DATABASE_NAME,ssl:{rejectUnauthorized:false}});
await c.connect();
const q = process.argv[2];
const r = await c.query(q);
for (const row of r.rows) process.stdout.write(Object.values(row).join("\t") + "\n");
await c.end();
