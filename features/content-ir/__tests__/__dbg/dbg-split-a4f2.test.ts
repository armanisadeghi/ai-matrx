import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
const ID = "fd4a56a0-360a-47f2-a101-f1e7c8978a0d";
const TEXT = `Here are 6 flashcards covering common polyatomic ions.\n\n<artifact type="flashcards" id="${ID}" version="1" title="Polyatomic Ions">\n{"__kind":"flashcard_set","cards":[{"__kind":"flashcard","front":"What is nitrate?","back":"NO3-"},{"__kind":"flashcard","back":"OH-","front":"What is hydroxide?"}],"title":"Polyatomic Ions"}\n</artifact>`;
it("dbg split", () => {
  const seen = new Set<string>();
  for (let n = 1; n <= TEXT.length; n++) {
    const blocks = splitContentIntoBlocksV2(TEXT.slice(0, n));
    const sig = blocks.map((b: any) => `${b.type}${b.language ? "/" + b.language : ""}`).join(",");
    if (!seen.has(sig)) { seen.add(sig); console.log(n, sig, JSON.stringify(blocks.map((b: any) => (b.content ?? "").slice(0, 70)))); }
  }
});
