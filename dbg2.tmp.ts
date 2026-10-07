import { readFileSync } from "node:fs";
import { scanSource } from "./scripts/check-alchemy-doors";
import { REPO_ROOT, repoFiles } from "./scripts/lib/repo-files";
const files = repoFiles(REPO_ROOT, { under: ["components/agent-copy", "../aidream/apps/shared/chat/src/agent-copy"], match: /\.(tsx?|jsx?|mjs)$/ }).filter(f => !/\.test\.|__tests__/.test(f));
for (const f of files) for (const h of scanSource("X/" + f, readFileSync(f, "utf8"))) console.log(h.rule, f + ":" + h.line, h.text.slice(0, 90));
