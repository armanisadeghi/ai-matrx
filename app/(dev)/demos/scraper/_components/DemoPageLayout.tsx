"use client";

import React, { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface DemoPageLayoutProps {
    title: string;
    description?: string;
    children: ReactNode;
    inputSection: ReactNode;
}

export function DemoPageLayout({ title, description, children, inputSection }: DemoPageLayoutProps) {
    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-white dark:bg-zinc-900">
                <div className="flex items-center gap-3 max-w-[1800px] mx-auto">
                    <Link href="/demos/scraper">
                        <Button variant="ghost" size="sm" className="h-8 px-2">
                            <ArrowLeft className="w-4 h-4 mr-1" />
                            Back
                        </Button>
                    </Link>
                    <div className="flex-1">
                        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
                        {description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Input Section */}
            <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-gray-50 dark:bg-zinc-800">
                <div className="max-w-[1800px] mx-auto">
                    {inputSection}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden p-4">
                <div className="h-full max-w-[1800px] mx-auto">
                    {children}
                </div>
            </div>
        </div>
    );
}

export default DemoPageLayout;
