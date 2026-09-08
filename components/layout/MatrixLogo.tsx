"use client";

import AppLink from "@/components/navigation/AppLink";
import { motion } from "motion/react";
import React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface LogoComponentProps {
    open: boolean;
}

const LogoComponent: React.FC<LogoComponentProps> = ({ open }) => {
    const pathname = usePathname();
    const isActive = pathname === "/dashboard";

    return (
        <AppLink
            href="/dashboard"
            className={cn(
                "group/sidebar flex items-center rounded-sm transition-colors duration-200 ease-in-out text-blue-600 dark:text-blue-400 hover:bg-neutral-100 dark:hover:bg-neutral-700",
                open ? "justify-start gap-2 px-2 py-2" : "justify-center px-1 py-1.5"
            )}
        >
            <Image 
                src="/matrx/matrx-icon.svg" 
                width={open ? 26 : 22} 
                height={open ? 26 : 22} 
                alt="AI Matrx Logo" 
                className="flex-shrink-0" 
            />

            <motion.span
                initial={{
                    display: "none",
                    opacity: 0,
                }}
                animate={{
                    display: open ? "inline-block" : "none",
                    opacity: open ? 1 : 0,
                }}
                className="!m-0 inline-block whitespace-pre !p-0 text-xs font-semibold transition duration-150"
            >
                AI Matrx
            </motion.span>
        </AppLink>
    );
};

export const Logo: React.FC<LogoComponentProps> = ({ open }) => <LogoComponent open={open} />;
export const LogoIcon: React.FC<LogoComponentProps> = ({ open }) => <LogoComponent open={open} />;
