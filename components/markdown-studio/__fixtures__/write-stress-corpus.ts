// components/markdown-studio/__fixtures__/write-stress-corpus.ts
// Writes every stress fixture to a directory so a browser run can paste it:
//   npx tsx components/markdown-studio/__fixtures__/write-stress-corpus.ts <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STRESS_CORPUS } from "./stress-corpus";

const out = process.argv[2];
if (!out) throw new Error("Usage: write-stress-corpus.ts <outDir>");
mkdirSync(out, { recursive: true });
for (const f of STRESS_CORPUS) {
  const text = f.build();
  writeFileSync(join(out, `${f.name}.md`), text);
  console.log(`${f.name.padEnd(28)} ${(text.length / 1024).toFixed(1).padStart(8)} KB  ${f.useCase}`);
}
