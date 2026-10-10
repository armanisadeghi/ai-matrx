import { open, q } from "./_dd4_lib.mts";
const c = await open();
for (const n of process.argv.slice(2)) {
  const r = await q(c, `select p.oid::regprocedure::text sig, p.prosrc, length(p.prosrc) len from pg_proc p where p.proname=$1 and pronamespace in ('custom'::regnamespace,'platform'::regnamespace)`, [n]);
  for (const x of r) { console.log("\n######", x.sig, x.len); console.log(x.prosrc.split("\n").filter((l:string)=>!/^\s*--/.test(l)&&l.trim()).join("\n").slice(0, Number(process.env.MAX||2500))); }
}
await c.end();
