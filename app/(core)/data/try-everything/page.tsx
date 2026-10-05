// app/(core)/data/try-everything/page.tsx — THE MOUNT, AND THE ROUTE TREE.
//
// One page where a person can try every part of the unified record store in
// the organization they are already in: real components, real doors, real
// data, and — for the parts that are not finished — a note saying what exists
// today and what it is waiting for.
//
// The screen itself lives in `features/unified-data/test-bench/`, which is
// where the campaign switch is read.
//
// IT IS A SERVER COMPONENT NOW, for one reason: no section on that page may
// claim an address exists or does not. Only the App Router's own directory tree
// knows, and only a server component may read it. This file asks
// (`routesInThisBuild`) and hands the answer down; the screen renders it.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import TryEverythingScreen from "@/features/unified-data/test-bench/TryEverythingScreen";
import { routesInThisBuild } from "@/features/unified-data/test-bench/routesInThisBuild";

export default async function TryEverythingRoute() {
    const routes = await routesInThisBuild();
    return (
        <>
            <RecordPageHeader backHref="/data" record={{ name: "Try everything" }} />
            <div className="h-full overflow-y-auto pt-[var(--shell-header-h)] p-4">
                <div className="mx-auto mb-3 max-w-3xl">
                    <Link
                        href="/data"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                        Back to your tables
                    </Link>
                </div>
                <TryEverythingScreen routes={routes} />
            </div>
        </>
    );
}
