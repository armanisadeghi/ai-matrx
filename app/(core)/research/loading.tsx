import { Skeleton } from '@/components/ui/skeleton';

export default function ResearchLoading() {
    return (
        <div className="h-full w-full overflow-y-auto bg-textured">
            <div className="flex flex-col items-center justify-center min-h-[60dvh] gap-4">
                <Skeleton className="h-12 w-64" />
                <Skeleton className="h-6 w-96" />
                <div className="flex gap-4 mt-6">
                    <Skeleton className="h-11 w-40 rounded-md" />
                    <Skeleton className="h-11 w-40 rounded-md" />
                </div>
            </div>
        </div>
    );
}
