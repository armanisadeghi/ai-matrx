import { Skeleton } from '@ai-matrx/design-system';

export default function ConsentLoadingSkeleton() {
    return (
        <div className="min-h-dvh w-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-950 dark:to-neutral-900 p-4">
            <div className="w-full max-w-md">
                {/* Logo placeholder */}
                <div className="flex justify-center mb-6">
                    <Skeleton className="h-8 w-32 rounded-md" />
                </div>

                {/* Card skeleton */}
                <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-lg dark:shadow-neutral-950/50 overflow-hidden border border-gray-200/60 dark:border-neutral-700/60 p-6 sm:p-8 space-y-6">
                    {/* App icon + heading */}
                    <div className="flex flex-col items-center gap-3">
                        <Skeleton className="h-12 w-12 rounded-xl" />
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-4 w-56" />
                    </div>

                    {/* User identity row */}
                    <div className="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-neutral-700 px-3.5 py-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-3.5 w-28" />
                            <Skeleton className="h-3 w-44" />
                        </div>
                    </div>

                    {/* Divider */}
                    <Skeleton className="h-px w-full" />

                    {/* Scope items */}
                    <div className="space-y-2">
                        <Skeleton className="h-3 w-48 mb-3" />
                        <Skeleton className="h-[60px] w-full rounded-lg" />
                        <Skeleton className="h-[60px] w-full rounded-lg" />
                        <Skeleton className="h-[60px] w-full rounded-lg" />
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3 pt-2">
                        <Skeleton className="h-10 flex-1 rounded-md" />
                        <Skeleton className="h-10 flex-1 rounded-md" />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-center mt-4">
                    <Skeleton className="h-3 w-52" />
                </div>
            </div>
        </div>
    );
}
