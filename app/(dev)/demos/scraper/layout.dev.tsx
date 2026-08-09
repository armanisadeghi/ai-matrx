"use client";

import { ReactNode } from "react";

interface ScraperDemoLayoutProps {
    children: ReactNode;
}

export default function ScraperDemoLayout({ children }: ScraperDemoLayoutProps) {
    return (
        <div className="h-full flex flex-col overflow-hidden bg-textured">
            {children}
        </div>
    );
}
