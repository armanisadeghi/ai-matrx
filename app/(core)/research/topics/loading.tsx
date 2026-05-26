import { Skeleton } from '@/components/ui/skeleton';

export default function TopicsLoading() {
    return (
        <div className="h-full flex flex-col bg-textured">
            <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-card/80">
                <Skeleton className="h-8 w-48" />
            </div>
            <div className="flex-1 p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
            </div>
        </div>
    );
}
