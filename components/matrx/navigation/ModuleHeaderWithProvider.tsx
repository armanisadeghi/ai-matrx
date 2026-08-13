'use client';

import React from 'react';
import Link from 'next/link';
import {useRouter, usePathname, useSearchParams } from 'next/navigation';
import {motion} from 'motion/react';
import {ChevronLeft, Home, Settings, Boxes, TestTube2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import MatrxBreadcrumb from "@/components/matrx/navigation/breadcumbs/MatrxBreadcrumb";
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
import {useModuleHeader} from '@/providers/ModuleHeaderProvider';

interface ModuleHeaderProps {
    pages: ModulePage[];
    currentPath?: string;
    moduleHome: string;
    moduleName?: string;
    className?: string;
}

export const HeaderItemWrapper = ({children, className}: { children: React.ReactNode; className?: string }) => (
    <div className={cn("h-8 flex items-center px-2", className)}>
        {children}
    </div>
);

export default function ModuleHeaderWithProvider(
    {
        pages,
        moduleHome,
        moduleName,
        className = '',
    }: ModuleHeaderProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const {headerItems} = useModuleHeader();

    const leftItems = headerItems.filter(item => item.section !== 'right');
    const rightItems = headerItems.filter(item => item.section === 'right');

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

    // Create breadcrumb items based on current path
    const getBreadcrumbItems = () => {
        return [
            {
                id: 'module',
                label: moduleName || '',
                icon: <Home className="h-4 w-4" />,
                isCurrent: false
            }
        ];
    };

    const handleBreadcrumbNavigation = (id: string) => {
        if (id === 'module') {
            router.push(moduleHome);
        }
    };

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
                "h-12 flex items-center justify-between bg-background/60 backdrop-blur-sm border-b px-4 border border-green-500",
                "overflow-hidden",
                className
            )}
        >
            <div className="flex items-center">
                <motion.div
                    variants={buttonVariants}
                    initial="initial"
                    animate="animate"
                    whileHover="hover"
                >
                    <Link href=".." className="mr-1">
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
                    className="flex items-center gap-4"
                    >
                    <MatrxBreadcrumb
                        items={getBreadcrumbItems()}
                        onNavigate={handleBreadcrumbNavigation}
                        className="ml-1"
                    />

                    <div className="flex items-center gap-2">
                        <Select
                            value={currentPage ? getFullPath(currentPage) : undefined}
                            onValueChange={handleNavigation}
                        >
                            <SelectTrigger className="h-8 w-75">
                                <SelectValue>
                                    {currentPage?.title || "Navigate to..."}
                                </SelectValue>
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

                        {leftItems.map(item => (
                            <HeaderItemWrapper key={item.id}>
                                {item.component}
                            </HeaderItemWrapper>
                        ))}
                    </div>
                </motion.div>
            </div>

            <div className="flex items-center gap-2">
                {rightItems.map(item => (
                    <HeaderItemWrapper key={item.id}>
                        {item.component}
                    </HeaderItemWrapper>
                ))}

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