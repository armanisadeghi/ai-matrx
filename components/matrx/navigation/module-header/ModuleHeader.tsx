'use client';

import React from 'react';
import {motion} from 'motion/react';
import {ChevronLeft, Home} from 'lucide-react';
import Link from "@/components/navigation/AppLink";
import {Button} from '@/components/ui/button';
import AutoBreadcrumbs from "@/components/matrx/navigation/breadcumbs/AutoBreadcumbsOptions";
import {useSearchParams} from 'next/navigation'
import {cn} from '@/lib/utils';
import {ModulePage} from '../types';
import {useModuleHeader} from '@/providers/ModuleHeaderProvider';
import PageSelection from './PageSelection';
import AdminShortcuts from './AdminShortcuts';

interface ModuleHeaderProps {
    pages: ModulePage[];
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
    const {headerItems} = useModuleHeader();
    const searchParams = useSearchParams();
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


    return (
        <motion.header
            variants={headerVariants}
            initial="initial"
            animate="animate"
            className={cn(
                "h-10 flex items-center justify-between bg-background/60 backdrop-blur-sm border-b px-4 border border-blue-500",
                "overflow-hidden",
                className
            )}
        >
            <div className="flex items-center">
                <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover">
                    <Link href=".." className="mr-1">
                        <Button variant="ghost" size="icon" className="hover:bg-accent">
                            <ChevronLeft className="h-4 w-4"/>
                        </Button>
                    </Link>
                </motion.div>

                <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover">
                    <Link href='/dashboard'>
                        <Button variant="ghost" size="icon" className="hover:bg-accent">
                            <Home className="h-4 w-4"/>
                        </Button>
                    </Link>
                </motion.div>

                <motion.div
                    initial={{opacity: 0, x: -20}}
                    animate={{opacity: 1, x: 0}}
                    className="flex items-center gap-4"
                >
                    <AutoBreadcrumbs />

                    <div className="flex items-center gap-2">
                        <PageSelection pages={pages} moduleHome={moduleHome}/>
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
                <AdminShortcuts/>
            </div>
        </motion.header>
    );
}