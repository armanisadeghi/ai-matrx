import type { Metadata } from "next";

import { GrowthLoopStory } from "@/features/growth-loop/public/GrowthLoopStory";

export const metadata: Metadata = {
    title: "How it works — AI Matrx",
    description:
        "One connected loop: study the market, plan every page, write it, publish it, measure the real results, and improve it. Every step is one you can do yourself, hand to an AI agent, or leave running on its own.",
    alternates: { canonical: "/how-it-works" },
    openGraph: {
        title: "How it works — AI Matrx",
        description:
            "A website that studies the market, writes itself, and then gets better. See the twelve steps and how each one can be run.",
        url: "/how-it-works",
        type: "website",
    },
};

export default function HowItWorksPage() {
    return (
        <div className="h-full overflow-y-auto bg-textured">
            <GrowthLoopStory />
        </div>
    );
}
