"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Scissors, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/spinner";
import { useState } from "react";

const utilities = [
    {
        title: "Text Cleaner",
        description: "Clean, normalize, and transform text — strip HTML, fix encoding, remove junk characters, and apply custom patterns.",
        href: "/administration/utils/text-cleaner",
        icon: Scissors,
    },
];

function UtilityCard({ title, description, href, icon: Icon }: (typeof utilities)[number]) {
    const [isPending, startTransition] = useTransition();
    const [isNavigating, setIsNavigating] = useState(false);

    const handleClick = () => {
        setIsNavigating(true);
        startTransition(() => {});
    };

    return (
        <Link href={href} onClick={handleClick} className="group block">
            <Card className="h-full border bg-card hover:bg-accent/30 transition-colors duration-150 cursor-pointer">
                <CardHeader className="flex flex-row items-start gap-4 p-5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                        {isPending || isNavigating ? (
                            <LoadingSpinner size="sm" />
                        ) : (
                            <Icon className="h-5 w-5" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <CardTitle className="text-base font-semibold">{title}</CardTitle>
                            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150" />
                        </div>
                        <CardDescription className="mt-1 text-sm leading-relaxed">
                            {description}
                        </CardDescription>
                    </div>
                </CardHeader>
            </Card>
        </Link>
    );
}

export default function UtilitiesPage() {
    return (
        <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
            <div className="flex-shrink-0 px-6 py-5 border-b bg-card">
                <h1 className="text-2xl font-bold tracking-tight">Utilities</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Developer and admin tools for data processing and transformation.
                </p>
            </div>

            <div className="flex-1 overflow-y-auto pb-safe">
                <div className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
                        {utilities.map((util) => (
                            <UtilityCard key={util.href} {...util} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
