import { Skeleton } from '@ai-matrx/design-system';

export function OverviewSkeleton() {
    return (
        <div className="p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-48" />
                <div className="flex gap-2">
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-9 w-24" />
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 rounded-xl" />
                ))}
            </div>
        </div>
    );
}

export function SourceListSkeleton() {
    return (
        <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-9 w-48" />
            </div>
            <div className="flex gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-24 rounded-full" />
                ))}
            </div>
            <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
            </div>
        </div>
    );
}

export function SourceDetailSkeleton() {
    return (
        <div className="flex flex-col md:flex-row h-full">
            <div className="w-full md:w-[30%] border-b md:border-b-0 md:border-r border-border p-4 space-y-4">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
                <div className="space-y-2 pt-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                    ))}
                </div>
            </div>
            <div className="flex-1 p-4 space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-[400px] rounded-lg" />
            </div>
        </div>
    );
}

export function DocumentSkeleton() {
    return (
        <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-48" />
                <div className="flex gap-2">
                    <Skeleton className="h-9 w-28" />
                    <Skeleton className="h-9 w-28" />
                </div>
            </div>
            <div className="space-y-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-6 w-1/2 mt-6" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
            </div>
        </div>
    );
}

export function TagsSkeleton() {
    return (
        <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-9 w-28" />
            </div>
            <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
            </div>
        </div>
    );
}

export function GenericPageSkeleton() {
    return (
        <div className="p-4 sm:p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
            </div>
        </div>
    );
}

export function InitWizardSkeleton() {
    return (
        <div className="flex items-center justify-center h-full bg-textured">
            <div className="w-full max-w-2xl p-6 space-y-6">
                <Skeleton className="h-10 w-64 mx-auto" />
                <Skeleton className="h-4 w-48 mx-auto" />
                <Skeleton className="h-48 rounded-xl" />
                <div className="flex justify-end gap-3">
                    <Skeleton className="h-10 w-24" />
                    <Skeleton className="h-10 w-24" />
                </div>
            </div>
        </div>
    );
}
