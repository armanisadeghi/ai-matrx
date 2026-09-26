import { unified } from "unified"; import remarkParse from "remark-parse"; import remarkGfm from "remark-gfm"; import { toString } from "mdast-util-to-string"; import fs from "node:fs";
const tree = unified().use(remarkParse).use(remarkGfm).parse(fs.readFileSync(process.argv[2], "utf8"));
for (const t of tree.children.filter(c => c.type === "table")) console.log(JSON.stringify(t.children.map(r => r.children.map(c => toString(c)))));
console.log("blocks:", tree.children.map(c => c.type).join(","));
