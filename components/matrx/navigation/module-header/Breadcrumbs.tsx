// Breadcrumbs.tsx
'use client';

import React from 'react';
import Link from "@/components/navigation/AppLink";
import { ChevronRight } from 'lucide-react';
import {cn} from "@/utils/cn";


interface BreadcrumbsProps {
    path: string;
}

export default function Breadcrumbs({ path }: BreadcrumbsProps) {
    const segments = path.split('/').filter(Boolean);

    return (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
            {segments.map((segment, index) => {
                const href = `/${segments.slice(0, index + 1).join('/')}`;
                const isLast = index === segments.length - 1;

                return (
                    <React.Fragment key={href}>
                        <Link
                            href={href}
                            className={cn(
                                "hover:text-foreground transition-colors",
                                isLast && "text-foreground font-medium"
                            )}
                        >
                            {segment.charAt(0).toUpperCase() + segment.slice(1)}
                        </Link>
                        {!isLast && <ChevronRight className="h-4 w-4" />}
                    </React.Fragment>
                );
            })}
        </div>
    );
}