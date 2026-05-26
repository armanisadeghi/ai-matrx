"use client";

import { ReactNode } from "react";

interface ScraperDemoLayoutProps {
    children: ReactNode;
}

export default function ScraperDemoLayout({ children }: ScraperDemoLayoutProps) {
    return (
        <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
            {children}
        </div>
    );
}
