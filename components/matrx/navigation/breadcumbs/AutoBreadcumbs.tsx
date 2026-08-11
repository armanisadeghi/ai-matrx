'use client';

import { useParsedPathName } from "@/utils/client-nav-utils";
import {
    Breadcrumb,
    BreadcrumbList,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Component, ChevronRight } from "lucide-react";
import Link from "next/link";
import React from "react";
import { cn } from "@/lib/utils";

const AutoBreadcrumbs = () => {
    const pathParts = useParsedPathName();

    return (
        <Breadcrumb>
            <BreadcrumbList className="gap-1 text-sm">
                {pathParts.map((part, index) => (
                    <React.Fragment key={part.id}>
                        <BreadcrumbItem 
                            className={cn(
                                "px-2 py-0.5 border border-border rounded-sm transition-colors",
                                part.isLast && "bg-muted text-foreground"
                            )}
                        >
                            {part.isLast ? (
                                <BreadcrumbPage className="flex items-center gap-1.5">
                                    {index === 0 && <Component className="w-4 h-4" />}
                                    <span>{part.name}</span>
                                </BreadcrumbPage>
                            ) : (
                                <BreadcrumbLink asChild>
                                    <Link href={part.href} className="flex items-center gap-1.5">
                                        {index === 0 && <Component className="w-4 h-4" />}
                                        {part.name}
                                    </Link>
                                </BreadcrumbLink>
                            )}
                        </BreadcrumbItem>
                        {index < pathParts.length - 1 && (
                            <BreadcrumbSeparator>
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            </BreadcrumbSeparator>
                        )}
                    </React.Fragment>
                ))}
            </BreadcrumbList>
        </Breadcrumb>
    );
};

export default AutoBreadcrumbs;