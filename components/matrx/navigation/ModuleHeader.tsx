'use client';

import React from 'react';
import Link from 'next/link';
import {useRouter, usePathname} from 'next/navigation';
import {motion} from 'motion/react';
import {ChevronLeft, Home, Settings, Boxes, TestTube2, PanelLeftOpen} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {cn} from '@/lib/utils';
import {ModulePage} from './types';

// Extended interface to include children
interface ModuleHeaderProps {
    pages: ModulePage[];
    currentPath?: string;
    moduleHome: string;
    moduleName?: string;
    className?: string;
    children?: React.ReactNode;
}


export default function ModuleHeader(
    {
        pages,
        currentPath,
        moduleHome,
        moduleName,
        className = '',
        children
    }: ModuleHeaderProps) {
    const router = useRouter();
    const pathname = usePathname();

    const headerVariants = {
        initial: {opacity: 0, y: -20},
        animate: {
            opacity: 1,
            y: 0,
            transition: {duration: 0.3}
        }
    };

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

    const getFullPath = (page: ModulePage) => {
        if (!page.relative) {
            return page.path.startsWith('/') ? page.path : `/${page.path}`;
        }
        return moduleHome.startsWith('/')
            ? `${moduleHome}/${page.path}`
            : `/${moduleHome}/${page.path}`;
    };

    const handleNavigation = (path: string) => {
        router.push(path);
    };

    const currentPage = pages.find(page => {
        const fullPath = getFullPath(page);
        return pathname === fullPath;
    });

    const currentTitle = moduleName || currentPage?.title || 'Select Page';

    const adminShortcuts = [
        {path: '/admin', icon: Settings, label: 'Admin'},
        {path: '/tests', icon: TestTube2, label: 'Tests'},
        {path: '/demo', icon: Boxes, label: 'Demo'},
    ];

    return (
        <motion.header
            variants={headerVariants}
            initial="initial"
            animate="animate"
            className={cn(
                "h-12 flex items-center justify-between bg-background/60 backdrop-blur-sm border-b px-4",
                "overflow-hidden", // Prevent scrolling
                className
            )}
        >
            <div className="flex items-center gap-2">
                <PanelLeftOpen/>
                <motion.div
                    variants={buttonVariants}
                    initial="initial"
                    animate="animate"
                    whileHover="hover"
                >
                    <Link href=".." className="mr-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="hover:bg-accent"
                        >
                            <ChevronLeft className="h-4 w-4"/>
                        </Button>
                    </Link>
                </motion.div>

                <motion.div
                    variants={buttonVariants}
                    initial="initial"
                    animate="animate"
                    whileHover="hover"
                >
                    <Link href={moduleHome}>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="hover:bg-accent"
                        >
                            <Home className="h-4 w-4"/>
                        </Button>
                    </Link>
                </motion.div>

                <motion.div
                    initial={{opacity: 0, x: -20}}
                    animate={{opacity: 1, x: 0}}
                    className="pl-2 border-l ml-2 flex items-center gap-4"
                >
                    <h1 className="text-sm font-medium text-muted-foreground truncate max-w-[200px]">
                        {currentTitle}
                    </h1>

                    <div className="w-48">
                        <Select onValueChange={handleNavigation}>
                            <SelectTrigger className="h-8">
                                <SelectValue placeholder="Navigate to..."/>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    {pages.map((page) => (
                                        <SelectItem
                                            key={page.path}
                                            value={getFullPath(page)}
                                        >
                                            {page.title}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                </motion.div>
            </div>

            <div className="flex-1 flex items-center justify-end gap-2">
                {children}

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
            </div>
        </motion.header>
    );
}