// components/markdown-studio/builtin-samples.ts
// The 13 real-world AI answers the markdown-classification dev demo carried
// (candidate profiles, SEO answers from four models, a travel guide, LSI
// keywords…) as BUILT-IN samples beside the 7 curated templates. The text
// stays in ONE place — `markdown-classification/sample-data/markdown-samples`
// — and is only described here, never copied.

import { markdownSamples } from "@/components/mardown-display/markdown-classification/sample-data/markdown-samples";
import { detectRenderBlocks } from "@/components/admin/markdown-tester/utils/detect-render-blocks";
import type { StudioTemplate } from "./templates";

type SampleKey = keyof typeof markdownSamples;

const DESCRIBED: Record<SampleKey, { title: string; blurb: string; icon: StudioTemplate["icon"] }> = {
  candidateProfileShort: { title: "Candidate profile (short)", blurb: "A recruiter's short candidate write-up with headings and bullet lists.", icon: "ListChecks" },
  candidateProfileFull: { title: "Candidate profile (full)", blurb: "The full candidate profile — nested sections, emphasis and lists.", icon: "ListChecks" },
  candidateProfileLimitedMarkdown: { title: "Candidate profile (plain)", blurb: "The same profile with almost no markdown — how plain text renders.", icon: "Quote" },
  candidateProfileStructured: { title: "Candidate profile (structured)", blurb: "A structured profile with labelled fields.", icon: "Table" },
  appSuggestions: { title: "App suggestions", blurb: "An AI brainstorm of app ideas with numbered sections.", icon: "GitBranch" },
  gptSample: { title: "SEO essentials — GPT", blurb: "GPT's concise SEO checklist.", icon: "BarChart3" },
  googleSampleShort: { title: "SEO essentials — Gemini (short)", blurb: "Gemini's short SEO answer.", icon: "BarChart3" },
  googleSampleLong: { title: "SEO essentials — Gemini (long)", blurb: "Gemini's long, sectioned SEO answer.", icon: "BarChart3" },
  claudeSample: { title: "SEO essentials — Claude", blurb: "Claude's SEO answer.", icon: "BarChart3" },
  grokSample: { title: "SEO essentials — Grok", blurb: "Grok's SEO answer.", icon: "BarChart3" },
  gptSectionedList: { title: "Western Europe travel guide", blurb: "A long sectioned itinerary with tables and nested lists.", icon: "Table" },
  mergedContentRandom: { title: "Mixed content", blurb: "Random merged content — code, lists, tables and quotes together.", icon: "FileCode" },
  lsiKeywords: { title: "LSI keyword map", blurb: "A keyword research answer with grouped keyword lists.", icon: "ListChecks" },
};

let cache: StudioTemplate[] | null = null;

/** Built lazily: block detection runs once, the first time the palette opens. */
export function getBuiltinSamples(): StudioTemplate[] {
  if (cache) return cache;
  cache = (Object.keys(DESCRIBED) as SampleKey[]).map((key) => ({
    id: `builtin:${key}`,
    ...DESCRIBED[key],
    blocks: detectRenderBlocks(markdownSamples[key]),
    content: markdownSamples[key],
  }));
  return cache;
}
