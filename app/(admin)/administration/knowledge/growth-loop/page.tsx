"use client";

import GrowthLoopCanvas from "@/features/growth-loop/components/GrowthLoopCanvas";

export default function GrowthLoopPage() {
    return (
        <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
            <GrowthLoopCanvas />
        </div>
    );
}
