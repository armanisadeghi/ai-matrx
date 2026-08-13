"use client";

import React from "react";
import { IconHome } from "@tabler/icons-react";
import { FaBrain, FaImage, FaDatabase } from "react-icons/fa";
import { SiGooglechat } from "react-icons/si";
import { AiFillAudio } from "react-icons/ai";
import FloatingDock from "@/components/official/FloatingDock";

/**
 * @deprecated Use MatrxFloatingMenu instead which uses the centralized navigation links
 */
export function MatrixFloatingMenu() {
    console.warn("MatrixFloatingMenu is deprecated. Please use MatrxFloatingMenu instead.");
    
    const links = [
        {
            label: "Home",
            icon: <IconHome className="h-full w-full text-neutral-500 dark:text-neutral-300" />,
            href: "#",
        },
        {
            label: "Chat",
            icon: <SiGooglechat className="h-full w-full text-neutral-500 dark:text-neutral-300" />,
            href: "/chat",
        },
        {
            label: "Cockpit",
            icon: <FaBrain className="h-full w-full text-neutral-500 dark:text-neutral-300" />,
            href: "/ai/cockpit",
        },
        {
            label: "Data",
            icon: <FaDatabase className="h-full w-full text-neutral-500 dark:text-neutral-300" />,
            href: "/data",
        },

        {
            label: "Image Generation",
            icon: <FaImage className="h-full w-full text-neutral-500 dark:text-neutral-300" />,
            href: "/image-editing/public-image-search",
        },

        {
            label: "Voices",
            icon: <AiFillAudio className="h-full w-full text-neutral-500 dark:text-neutral-300" />,
            href: "/demo/voice/voice-manager",
        },

    ];
    return (
        <FloatingDock items={links} bgColorClassname="bg-zinc-100 dark:bg-zinc-850" iconBgColorClassname="bg-zinc-200 dark:bg-zinc-700" />
    );
}
