import type { Metadata } from "next";

import { GrowthLoopDiagram } from "@/features/growth-loop/public/GrowthLoopDiagram";

export const metadata: Metadata = {
    title: "The loop, as a diagram — AI Matrx",
    description:
        "The twelve connected steps AI Matrx runs, drawn as a simple flow: research, plan, write, publish, measure, improve — and back again.",
    alternates: { canonical: "/loop/diagram" },
    openGraph: {
        title: "The loop, as a diagram — AI Matrx",
        description: "What the system does, and how the parts connect.",
        url: "/loop/diagram",
        type: "website",
    },
};

export default function LoopDiagramPage() {
    return (
        <div className="h-full overflow-y-auto bg-textured">
            <GrowthLoopDiagram />
        </div>
    );
}
