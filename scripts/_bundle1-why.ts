import { eagerClientSet } from "./check-shell-eager-graph";
import { writeFileSync } from "fs";
(async () => {
  const g: any = await eagerClientSet();
  const ROOT = process.cwd() + "/";
  const pp = (p: string) => { const i = p.lastIndexOf("node_modules/"); return i >= 0 ? p.slice(i + 13) : p.replace(ROOT, ""); };
  const needles = process.argv.slice(2);
  const out: string[] = [];
  for (const n of needles) {
    const t = [...g.parent.keys()].find((f: string) => pp(f).includes(n));
    if (!t) { out.push(`## ${n}: not eager`); continue; }
    const chain: string[] = []; let p: string | null = t;
    while (p) { chain.push(pp(p)); p = g.parent.get(p) ?? null; }
    out.push(`## ${n}\n  ` + chain.reverse().join("\n  -> "));
    const imps = [...(g.importers.get(t) ?? [])].filter((f: string) => g.parent.has(f)).map(pp);
    out.push(`  eager importers (${imps.length}): ` + imps.slice(0, 15).join(" | "));
  }
  writeFileSync(process.env.OUT!, out.join("\n"));
})();
