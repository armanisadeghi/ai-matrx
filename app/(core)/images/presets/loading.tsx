import { Skeleton } from "@/components/ui/skeleton";

export default function PresetsLoading() {
    return (
        <div className="h-full overflow-y-auto bg-background">
            <div className="container mx-auto px-4 sm:px-6 md:px-10 py-8 max-w-[1400px] space-y-10">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-80" />
                    <Skeleton className="h-5 w-full max-w-2xl" />
                </div>
                {Array.from({ length: 6 }).map((_, catIdx) => (
                    <section key={catIdx} className="space-y-3">
                        <div className="flex items-start gap-3">
                            <Skeleton className="h-10 w-10 rounded-xl" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-5 w-48" />
                                <Skeleton className="h-4 w-full max-w-2xl" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {Array.from({ length: 6 }).map((_, j) => (
                                <Skeleton key={j} className="h-[105px] rounded-xl" />
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
