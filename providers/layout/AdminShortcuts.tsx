'use client';

import React from 'react';
import {motion} from 'motion/react';
import {Settings, Boxes, TestTube2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

export default function AdminShortcuts() {
    const buttonVariants = {
        initial: {scale: 0.9, opacity: 0},
        animate: {
            scale: 1,
            opacity: 1,
            transition: {duration: 0.2}
        },
        hover: {
            scale: 1.05,
            transition: {duration: 0.2}
        }
    };

    const adminShortcuts = [
        {path: '/admin', icon: Settings, label: 'Admin'},
        {path: '/tests', icon: TestTube2, label: 'Tests'},
        {path: '/demo', icon: Boxes, label: 'Demo'},
    ];

    return (
        <TooltipProvider>
            <div className="flex items-center gap-1">
                {adminShortcuts.map((shortcut) => (
                    <Tooltip key={shortcut.path}>
                        <TooltipTrigger asChild>
                            <motion.div
                                variants={buttonVariants}
                                initial="initial"
                                animate="animate"
                                whileHover="hover"
                            >
                                <a
                                    href={shortcut.path}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="hover:bg-accent"
                                    >
                                        <shortcut.icon className="h-4 w-4"/>
                                    </Button>
                                </a>
                            </motion.div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{shortcut.label}</p>
                        </TooltipContent>
                    </Tooltip>
                ))}
            </div>
        </TooltipProvider>
    );
}