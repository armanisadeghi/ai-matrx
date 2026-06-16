'use client';

import React, { useState } from 'react';
import { ChevronLeft, Home, ShieldPlus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MatrxDynamicPanelHost } from '@/components/matrx/resizable/MatrxDynamicPanelHost';
import { cn } from '@/lib/utils';
import { ModulePage } from './types';
import { useModuleHeader } from '@/providers/ModuleHeaderProvider';
import PageSelection from './module-header/PageSelection';
import AdminShortcuts from './module-header/AdminShortcuts';

interface ModuleHeaderProps {
    pages: ModulePage[];
    moduleHome: string;
    moduleName?: string;
    className?: string;
}

export function ModuleHeaderMobileContent({
    pages,
    moduleHome,
    moduleName,
    className = '',
}: ModuleHeaderProps) {
    const { headerItems } = useModuleHeader();
    const leftItems = headerItems.filter(item => item.section !== 'right');
    const rightItems = headerItems.filter(item => item.section === 'right');

    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div className={cn("flex items-center justify-between w-full", className)}>
            <div className="flex items-center gap-1">
                <Link href="..">
                    <Button variant="ghost" size="icon" className="hover:bg-accent">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                </Link>

                <Link href='/dashboard'>
                    <Button variant="ghost" size="icon" className="hover:bg-accent">
                        <Home className="h-4 w-4" />
                    </Button>
                </Link>
            </div>

            <div className="flex-1 mx-2 truncate">
                <PageSelection pages={pages} moduleHome={moduleHome} />
            </div>
            <Button variant="ghost" size="icon" onClick={() => setMenuOpen(true)}>
                <ShieldPlus className="h-4 w-4" />
            </Button>
            <MatrxDynamicPanelHost
                open={menuOpen}
                onOpenChange={setMenuOpen}
                title={moduleName || 'Menu'}
                position="right"
                defaultSize={36}
                contentClassName="overflow-y-auto"
            >
                <div className="space-y-4">
                    {leftItems.map(item => (
                        <div key={item.id} className="py-2">
                            {item.component}
                        </div>
                    ))}
                    {rightItems.map(item => (
                        <div key={item.id} className="py-2">
                            {item.component}
                        </div>
                    ))}
                    <div className="py-2">
                        <AdminShortcuts />
                    </div>
                </div>
            </MatrxDynamicPanelHost>
        </div>
    );
}

export default ModuleHeaderMobileContent;

