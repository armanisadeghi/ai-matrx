import { writeFileSync } from "node:fs";
import { ALL_MANIFESTS } from "@/features/surfaces/manifests/registry";
const strip = (m: any) => { const { contentHash, ...rest } = m; return { ...rest, values: m.values.map((v: any) => { const { resolvedSensitivity, ...r } = v; return r; }) }; };
writeFileSync(process.argv[2]!, JSON.stringify(ALL_MANIFESTS.map(strip)));
console.log(ALL_MANIFESTS.length);
