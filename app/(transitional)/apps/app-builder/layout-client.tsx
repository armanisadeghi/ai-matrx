"use client";

import React, { ReactNode } from "react";
import { usePathname } from "next/navigation";
import TabsNavigation from "@/components/ui/tabs-navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import AppBuilderDebugOverlay from "@/components/admin/AppBuilderDebugOverlay";

interface AppBuilderLayoutProps {
    children: ReactNode;
}

export default function AppBuilderLayout({ children }: AppBuilderLayoutProps) {
    const pathname = usePathname();
    const isMobile = useIsMobile();

    // Define main sections for the app builder
    const sections = [
        { id: "Overview", label: "Overview", intro: "Matrix Builder", href: "/apps/app-builder" },
        { id: "Fields", label: "Fields", intro: "Custom Field Components", href: "/apps/app-builder/fields" },
        { id: "Containers", label: "Containers", intro: "Field Containers", href: "/apps/app-builder/containers" },
        { id: "Applets", label: "Applets", intro: "Custom Applets", href: "/apps/app-builder/applets" },
        { id: "Apps", label: "Apps", intro: "Custom Apps", href: "/apps/app-builder/apps" },
    ];

    // Helper to determine if a path is active
    const isActive = (path: string) => {
        if (path === "/apps/app-builder") {
            return pathname === path;
        }
        return pathname.startsWith(path);
    };

    // Find the active section
    const activeSection = sections.find((section) => isActive(section.href))?.id || "Overview";
    
    // Get the intro text directly based on pathname
    const getIntroTextFromPath = () => {
        // Check exact paths first
        if (pathname === "/apps/app-builder") {
            return "Matrix Builder";
        }
        
        // Then check path prefixes
        if (pathname.startsWith("/apps/app-builder/fields")) {
            return "Custom Field Components";
        }
        if (pathname.startsWith("/apps/app-builder/containers")) {
            return "Field Containers";
        }
        if (pathname.startsWith("/apps/app-builder/applets")) {
            return "Custom Applets";
        }
        if (pathname.startsWith("/apps/app-builder/apps")) {
            return "Custom Apps";
        }
        
        // Default fallback
        return "Matrix Builder";
    };
    
    const introText = getIntroTextFromPath();

    return (
        <div className="w-full px-4 py-6">
            <div className="flex items-center w-full mb-4 relative">
                {!isMobile && (
                    <h1 className="text-2xl font-bold text-blue-500 absolute left-0 z-10">{introText}</h1>
                )}
                <div className="w-full">
                    <TabsNavigation tabs={sections} activeId={activeSection} centered={true} />
                </div>
            </div>

            <div className="flex flex-col space-y-6">
                <main className="min-h-[calc(100vh-200px)]">{children}</main>
            </div>
            <AppBuilderDebugOverlay position="middle-right" />
        </div>
    );
}
