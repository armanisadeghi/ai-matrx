import { listIslands, tokenizeSource } from "@ai-matrx/content-ir/source";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
test("probe", () => {
  const base = "\t````md\n      ```js\n\u001c```markdown     \n      ```js\nx ```\n> quoted code\n ```\n{\"a\": \"```\"}\nx = y + 1\n# Heading";
  const T = "\t````md\n```js\nx ```\n> q\n ```\nzz";
  const docs=["> ``` \n   - nested item \n1. first step\n```\n"+T, "> ```\nin\n```\n"+T, "> ```\nin\n```\n````md\nzz\n> q\nend", "> ```\nin\n```\n````md\nzz\n```\n> q\nend","> ```\nin\n```\n````md\nzz\n\n> q\nend"];
  for (const t of docs) console.log(JSON.stringify(t), JSON.stringify(listIslands(tokenizeSource(t)).map(i=>[i.start,i.end])), JSON.stringify(splitContentIntoBlocksV2(t).map(b=>[b.type,b.content])));
});
