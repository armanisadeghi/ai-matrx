import type { Metadata } from "next";
import { MessageSquareQuote } from "lucide-react";

import { AiVisibilityTool } from "@/features/marketing/seo/public-tools/AiVisibilityTool";

export const metadata: Metadata = {
  title: "Free AI Visibility Report — ChatGPT, Gemini, Claude & Perplexity",
  description:
    "See whether AI answer engines recommend your brand, where you rank, what they cite, and why — with a polished report you can share.",
};

export default function PublicAiVisibilityPage() {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/95 px-6 py-3 backdrop-blur">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MessageSquareQuote className="h-4 w-4" />
        </span>
        <div>
          <h1 className="text-base font-semibold leading-tight">
            AI Visibility
          </h1>
          <p className="text-[10px] text-muted-foreground">
            SEO Tools · Live answer-engine analysis
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 py-7 pb-16 xl:px-8">
        <AiVisibilityTool />
      </main>
    </div>
  );
}
