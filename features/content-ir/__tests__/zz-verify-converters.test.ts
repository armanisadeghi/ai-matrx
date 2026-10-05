import { kindTextLabel, conversationTitleText } from "@ai-matrx/chat/utils/content-ir/surfaces/kind-text-label";
import { inlineKindText, catalogProseText, kindOneLine } from "@ai-matrx/chat/utils/content-ir/surfaces/kind-one-line";
import { snippetKindText } from "@/features/content-ir/surfaces/kind-snippet-text";
import { kindTextToMarkdown, kindTextPreview } from "@/features/content-ir/surfaces/kind-text-to-markdown";
import { screenTextHoldsKind } from "@/features/content-ir/surfaces/kind-leak-scan";
import * as pub from "@/app/(public)/p/e/publicResourceText";

const INPUTS: Record<string, string> = {
  plain: 'Cards: {"__kind":"flashcard_set","title":"Cells"}',
  esc: 'Cards: {\\"__kind\\":\\"flashcard_set\\",\\"title\\":\\"Cells\\"}',
  dblesc: 'Cards: {\\\\\\"__kind\\\\\\":\\\\\\"flashcard_set\\\\\\"}',
  zw: 'Cards: {"__\u200bkind":"flashcard_set","title":"Cells"}',
  py: "Cards: {'__kind': 'flashcard_set', 'title': 'Cells'}",
  mdesc: 'Cards: {"\\_\\_kind":"flashcard_set","title":"Cells"}',
  smart: 'Cards: {\u201c__kind\u201d:\u201cflashcard_set\u201d}',
  entity: 'Cards: {&quot;__kind&quot;:&quot;flashcard_set&quot;}',
  truncated: 'Cards: {"__kind":"flashcard_set","title":"Ce',
  uesc: 'Cards: {"\\u005f_kind":"flashcard_set","title":"Cells"}',
};
const FNS: Record<string, (s: string) => unknown> = {
  kindTextLabel: (s) => kindTextLabel(s),
  conversationTitleText: (s) => conversationTitleText(s),
  inlineKindText: (s) => inlineKindText(s, { plain: true }),
  catalogProseText: (s) => catalogProseText(s),
  snippetKindText: (s) => snippetKindText(s),
  kindTextToMarkdown: (s) => kindTextToMarkdown(s),
  kindTextPreview: (s) => kindTextPreview(s).text,
};
for (const [n, f] of Object.entries(pub)) if (typeof f === "function") FNS["pub." + n] = (s) => { try { return (f as (x: unknown) => unknown)(s); } catch (e) { return "THREW " + String(e); } };

it("converters", () => {
  const out: string[] = [];
  for (const [fn, f] of Object.entries(FNS)) for (const [k, v] of Object.entries(INPUTS)) {
    const r = f(v);
    const s = typeof r === "string" ? r : JSON.stringify(r);
    out.push(`${s && screenTextHoldsKind(s.replace(/&quot;/g, '"')) ? "RAW" : "ok "} ${fn} ${k} :: ${String(s).slice(0, 120)}`);
  }
  require("fs").writeFileSync(process.env.ZZ_OUT!, out.join("\n"));
});
