"use client";

import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Props type: import `MathProblemProps` from "@/features/math/types" — it lives in
// that pure (zero-runtime, dependency-free) module, so consumers already get full
// typing without pulling the heavy impl into their graph. We deliberately do NOT
// re-export it here: the repo's no-barrel-files rule forbids re-exports, and the
// canonical source is types.ts.

/**
 * MathProblem — the ONLY importable name for the interactive math problem viewer
 * (the "front door"; Method B in the code-splitting skill).
 *
 * The heavy interactive core lives in `MathProblemImpl` — it pulls motion/react,
 * react-katex, the katex CSS, and touches `window.getComputedStyle`. That core is
 * split out via `next/dynamic({ ssr: false })` here, ONCE, so every consumer
 * (the education quick-math route, the markdown MathProblemBlock, and the canvas
 * renderers) gets the off-server split for free just by importing this module —
 * no per-callsite `dynamic()`/`React.lazy` (which would stack a second ssr:false
 * boundary on the same render path).
 *
 * Static imports of `MathProblemImpl` are banned by eslint (heavyImplStaticImportBan
 * in eslint.config.mjs); always go through this wrapper.
 */
const MathProblem = dynamic(() => import("./MathProblemImpl"), {
    ssr: false,
    loading: () => (
        <div className="flex flex-col h-full">
            <Card className="flex-grow overflow-hidden">
                <CardContent className="p-2 sm:p-3">
                    <div className="space-y-3 max-w-4xl mx-auto">
                        <Skeleton className="h-20 w-full rounded-xl" />
                        <div className="grid grid-cols-3 gap-2">
                            <Skeleton className="h-14 w-full rounded-lg" />
                            <Skeleton className="h-14 w-full rounded-lg" />
                            <Skeleton className="h-14 w-full rounded-lg" />
                        </div>
                        <Skeleton className="h-24 w-full rounded-lg" />
                    </div>
                </CardContent>
            </Card>
        </div>
    ),
});

export default MathProblem;
