import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
it("x", () => {
  for (const s of ['Here are your cards:\n\n{"__kind":', 'Here are your cards:\n\n{"__kind":"flashcard_set","t', '{"__kind":"flashcard_set","t', 'Here are your cards:\n{\n  "__kind": "flashcard_set",\n  "ti']) {
    console.log(JSON.stringify(splitContentIntoBlocksV2(s).map((b: any) => [b.type, b.language, b.content.slice(0, 30), b.metadata && Object.keys(b.metadata)])));
  }
});
