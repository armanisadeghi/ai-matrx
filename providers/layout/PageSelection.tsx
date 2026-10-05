'use client';

import React from 'react';
import Link from 'next/link';
import {useRouter, usePathname} from 'next/navigation';
import {motion} from 'motion/react';
import {ChevronLeft, Home} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {ModulePage} from "@/components/matrx/navigation/types";

interface PageSelectionProps {
    pages: ModulePage[];
    moduleHome: string;
    moduleName?: string;
}

export default function PageSelection({pages, moduleHome, moduleName}: PageSelectionProps) {
    const router = useRouter();
    const pathname = usePathname();

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

    return (
        <>
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
                        <SelectTrigger>
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
        </>
    );
}