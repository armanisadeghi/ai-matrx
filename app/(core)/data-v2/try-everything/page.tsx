"use client";

// app/(core)/data-v2/try-everything/page.tsx — THE MOUNT, AND NOTHING MORE.
//
// One page where a person can try every part of the unified record store in
// the organization they are already in: real components, real doors, real
// data, and — for the parts that are not finished — a note saying what exists
// today and what it is waiting for.
//
// The screen itself lives in `features/unified-data/test-bench/`, which is
// where the campaign switch is read. This file is the route and the header.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import TryEverythingScreen from "@/features/unified-data/test-bench/TryEverythingScreen";

export default function TryEverythingRoute() {
    return (
        <>
            <PageHeader>
                <HeaderStructured back title="Try everything" />
            </PageHeader>
            <div className="h-full overflow-y-auto pt-[var(--shell-header-h)] p-4">
                <div className="mx-auto mb-3 max-w-3xl">
                    <Link
                        href="/data-v2"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                        Back to your tables
                    </Link>
                </div>
                <TryEverythingScreen />
            </div>
        </>
    );
}
