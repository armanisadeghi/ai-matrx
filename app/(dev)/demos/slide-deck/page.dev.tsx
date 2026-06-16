"use client";

/**
 * Slide-deck demo — exercises the enhanced presentation renderer (Slideshow +
 * SlideView) across all three tiers and every layout, without the chat
 * pipeline. Slideshow is heavy (export menu, canvas) so it loads via
 * next/dynamic ssr:false (kept out of the server build).
 */

import React, { useState } from "react";
import dynamic from "next/dynamic";

import { Button } from "@/components/ui/button";

const Slideshow = dynamic(() => import("@/components/mardown-display/blocks/presentations/Slideshow"), {
  ssr: false,
  loading: () => <div className="h-[480px] animate-pulse rounded-2xl bg-muted" />,
});

type Variant = "generic" | "fancy" | "deluxe";

const SLIDES = [
  { layout: "title", title: "The State of **AI Agents** in 2026", subtitle: "What changed, what it means, and where it's going next" },
  { layout: "section", title: "1 · The Landscape", description: "Where things stand today" },
  {
    layout: "bullets",
    title: "Three forces reshaping the field",
    description: "Each is accelerating, and they compound.",
    bullets: [
      "**Adoption** crossed the majority line in the enterprise",
      "Inference **costs** fell ~60% year over year",
      "**Tooling** matured: agents now act, not just chat",
      "Regulation is arriving — and arriving fast",
    ],
  },
  {
    layout: "stat",
    title: "By the numbers",
    extra: { stats: [
      { value: "71%", label: "now deploying agents" },
      { value: "$0.4", label: "cost per 1k calls" },
      { value: "3.2×", label: "YoY usage growth" },
    ] },
  },
  {
    layout: "two-column",
    title: "Build vs. Buy",
    extra: { columns: [
      { title: "Build", bullets: ["Full control of behavior", "Deep integration", "Higher upfront cost"] },
      { title: "Buy", bullets: ["Fast time-to-value", "Maintained for you", "Less differentiation"] },
    ] },
  },
  { layout: "quote", quote: "The shift is no longer coming — it is here, and it is reshaping how work gets done.", author: "Industry Report 2026" },
  {
    layout: "image-split",
    title: "From pilots to production",
    bullets: ["Most teams moved past experiments", "The winners standardized their stack", "Observability became table stakes"],
    image_url: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=1200&q=80",
  },
  { layout: "closing", title: "Thank you", subtitle: "Questions welcome — let's talk about your stack" },
];

const THEME = { primaryColor: "#4F46E5", secondaryColor: "#7C3AED", accentColor: "#06B6D4", backgroundColor: "#ffffff", textColor: "#0F172A" };

export default function SlideDeckDemoPage() {
  const [variant, setVariant] = useState<Variant>("fancy");
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Slide-deck renderer</h1>
        <p className="text-sm text-muted-foreground">
          The enhanced presentation block across three tiers and every layout. Use ← / → or the controls to navigate.
        </p>
      </header>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Tier:</span>
        {(["generic", "fancy", "deluxe"] as Variant[]).map((v) => (
          <Button key={v} size="sm" variant={variant === v ? "default" : "outline"} onClick={() => setVariant(v)} className="capitalize">
            {v}
          </Button>
        ))}
      </div>

      <Slideshow key={variant} slides={SLIDES} theme={{ ...THEME, variant }} />
    </div>
  );
}
