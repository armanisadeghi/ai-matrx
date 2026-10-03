import { psqlRead } from "/Users/armanisadeghi/code/matrx-frontend/scripts/lib/pooled-db.mjs";
import {readFileSync} from "node:fs";
const r=psqlRead(process.argv[2], readFileSync(process.argv[3],"utf8"));
console.log(r.stdout); if(!r.ok) console.error(r.stderr);
