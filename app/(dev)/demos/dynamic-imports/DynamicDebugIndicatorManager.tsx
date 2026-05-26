"use client";

import dynamic from "next/dynamic";

const DebugIndicatorManager = dynamic(
    () => import("@/components/debug/DebugIndicatorManager").then((m) => m.DebugIndicatorManager),
    { ssr: false }
);

export function DynamicDebugIndicatorManager() {
    return <DebugIndicatorManager />;
}
