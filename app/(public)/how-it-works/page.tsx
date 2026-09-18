import Link from "next/link";
import { ArrowRight, BadgeCheck, Compass, Layers } from "lucide-react";

import { GrowthLoopStory } from "@/features/growth-loop/public/GrowthLoopStory";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/how-it-works", {
  title: "How It Works",
  description:
    "One connected loop: study the market, plan every page, write it, publish it, measure the real results, and improve it. Every step is one you can do yourself, hand to an AI agent, or leave running on its own.",
  canonicalPath: "/how-it-works",
  additionalMetadata: {
    openGraph: {
      title: "How It Works | AI Matrx",
      description:
        "A website that studies the market, writes itself, and then gets better. See the twelve steps and how each one can be run.",
      url: "/how-it-works",
      type: "website",
    },
  },
});

/**
 * Cross-links to the three differentiator pages. Kept here in the route rather
 * than inside GrowthLoopStory, which is generated from the engineering loop map
 * and must stay about the loop itself.
 */
const DIFFERENTIATOR_LINKS = [
  {
    href: "/why-ai-matrx",
    icon: Compass,
    title: "Why AI Matrx",
    body: "Every other AI tool hands you the average of the internet. We capture what your best people know and nobody wrote down.",
  },
  {
    href: "/how-we-prove-it",
    icon: BadgeCheck,
    title: "How we prove it",
    body: "The five-arm bench: identical prompts, cost and time on every arm, and your expert's real work judged blind against the machines.",
  },
  {
    href: "/the-landscape",
    icon: Layers,
    title: "The landscape",
    body: "Every serious alternative, named — where each is genuinely better than us, where it stops, and the seven questions to ask us first.",
  },
] as const;

export default function HowItWorksPage() {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <GrowthLoopStory />

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 lg:p-8">
          <div className="flex flex-col gap-2">
            <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
              The loop is how we build. This is why we win.
            </h2>
            <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              Everything above describes the machinery. If you want the
              argument behind it — what we do that nobody else does, how we
              prove it, and an honest account of every alternative you could buy
              instead — start here.
            </p>
          </div>

          <ul className="grid gap-3 md:grid-cols-3">
            {DIFFERENTIATOR_LINKS.map(({ href, icon: Icon, title, body }) => (
              <li key={href} className="h-full">
                <Link
                  href={href}
                  className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-background/60 p-5 transition-colors hover:border-foreground/30 hover:bg-accent/30"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                  </span>
                  <h3 className="text-balance text-base font-semibold tracking-tight">
                    {title}
                  </h3>
                  <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-foreground">
                    Read it
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
