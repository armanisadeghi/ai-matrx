import fs from "node:fs";
import { surfaceFromPathname } from "@/features/surfaces/utils/route-to-surface";
import { getManifest } from "@/features/surfaces/manifests/registry";
test("x", () => {
  const d = JSON.parse(fs.readFileSync("components/errors/__tests__/error-render-census.baseline.json","utf8")).files as Record<string,number>;
  const out: string[] = [];
  for (const f of Object.keys(d).filter(f=>f.startsWith("app/"))) {
    const route = "/" + f.replace(/^app\//,"").split("/").filter(s=>!/^\(.*\)$/.test(s)).slice(0,-1).map(s=>s.replace(/^\[\.\.\.(.+)\]$/,"x").replace(/^\[(.+)\]$/,"00000000-0000-0000-0000-000000000000")).join("/");
    const s = surfaceFromPathname(route);
    out.push(`${s && getManifest(s) ? "MAPPED  " : "UNMAPPED"} ${route}  ${s ?? ""}  (${d[f]})  ${f}`);
  }
  fs.writeFileSync("/private/tmp/claude-501/-Users-armanisadeghi-code/92a94403-63b9-4064-96ae-d9f7226800a1/scratchpad/unmapped.txt", out.sort().join("\n"));
});
