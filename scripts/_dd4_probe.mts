import { open, q } from "./_dd4_lib.mts";
const c = await open();
console.log(await q(c, `select current_user, now()`));
const t = await q(c, `select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) d, p.proname from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid='custom.record'::regclass and not t.tgisinternal order by t.tgname`);
for (const r of t) console.log(r.tgname, r.tgenabled, r.d.replace(/CREATE (CONSTRAINT )?TRIGGER \S+ /,'').slice(0,170));
await c.end();
