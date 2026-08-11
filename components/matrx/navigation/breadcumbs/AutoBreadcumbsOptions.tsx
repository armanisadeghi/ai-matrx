'use client';

import {useParsedPathName} from "@/utils/client-nav-utils";
import {
    Breadcrumb,
    BreadcrumbList,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {Component, ChevronRight, LucideIcon} from "lucide-react";
import Link from "next/link";
import React from "react";
import { cn } from "@/lib/utils";

export type BreadcrumbVariant = 'default' | 'minimal' | 'filled' | 'custom';

interface BreadcrumbStyles {
    container?: string;
    list?: string;
    separator?: React.ReactNode;
    item?: string;
    icon?: LucideIcon;
}

interface AutoBreadcrumbsProps {
    variant?: BreadcrumbVariant;
    customStyles?: BreadcrumbStyles;
    size?: 'sm' | 'md' | 'lg';
    showIcons?: boolean;
}

const variantStyles: Record<BreadcrumbVariant, BreadcrumbStyles> = {
    default: {
        list: "gap-1",
        separator: <ChevronRight className="w-4 h-4 text-muted-foreground"/>,
        item: "px-2 py-0.5 border border-border rounded-sm data-[current=true]:bg-muted data-[current=true]:text-foreground",
        icon: Component,
    },
    minimal: {
        list: "gap-2",
        separator: <ChevronRight className="w-3 h-3 text-muted-foreground"/>,
        item: "px-1 data-[current=true]:font-medium data-[current=true]:text-foreground",
        icon: Component,
    },
    filled: {
        list: "gap-1",
        separator: <ChevronRight className="w-4 h-4 text-primary/60"/>,
        item: "px-3 py-1 rounded-full data-[current=true]:bg-primary/10 data-[current=true]:text-primary",
        icon: Component,
    },
    custom: {
        list: "",
        separator: undefined,
        item: "",
        icon: Component,
    },
};

const AutoBreadcrumbs: React.FC<AutoBreadcrumbsProps> = (
    {
        variant = 'default',
        customStyles,
        size = 'sm',
        showIcons = true,
    }) => {
    const pathParts = useParsedPathName();
    const styles = variant === 'custom' ? customStyles : variantStyles[variant];

    const IconComponent = styles?.icon || Component;

    const sizeClasses = {
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg'
    };

    return (
        <Breadcrumb className={cn("gap-1", styles?.container || '', sizeClasses[size])}>
            <BreadcrumbList className={styles?.list || ''}>
                {pathParts.map((part, index) => (
                    <React.Fragment key={part.id}>
                        <BreadcrumbItem 
                            className={styles?.item}
                            data-current={part.isLast}
                        >
                            {part.isLast ? (
                                <BreadcrumbPage className="flex items-center gap-1.5">
                                    {showIcons && index === 0 && <IconComponent className="w-4 h-4"/>}
                                    <span>{part.name}</span>
                                </BreadcrumbPage>
                            ) : (
                                <BreadcrumbLink asChild>
                                    <Link href={part.href} className="flex items-center gap-1.5">
                                        {showIcons && index === 0 && <IconComponent className="w-4 h-4"/>}
                                        {part.name}
                                    </Link>
                                </BreadcrumbLink>
                            )}
                        </BreadcrumbItem>
                        {index < pathParts.length - 1 && styles?.separator && (
                            <BreadcrumbSeparator>
                                {styles.separator}
                            </BreadcrumbSeparator>
                        )}
                    </React.Fragment>
                ))}
            </BreadcrumbList>
        </Breadcrumb>
    );
};

export default AutoBreadcrumbs;