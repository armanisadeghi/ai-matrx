import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
const show=(s:string)=>console.log(JSON.stringify(s)+"\n"+JSON.stringify(splitContentIntoBlocksV2(s).map(b=>({t:b.type,l:(b as any).language,c:b.content})),null,0));
test("p",()=>{ show("<inf"); show("Some intro text.\n\n<inf"); show("Intro\n<thinkin"); show("<info>\nOuter **a**\n<info>\nInner\n</info>\nOuter tail\n</info>\nAfter");
show("<info>\nA\n<plan>\nB\n<task>\nC\n</task>\n</plan>\n</info>\nAfter"); });
