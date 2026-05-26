import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PromptsLoading() {
    return (
        <Card className="h-full w-full bg-textured border-none shadow-lg">
            <div className="p-8 md:p-12">
                <div className="text-center mb-8">
                    <Skeleton className="h-9 w-64 mx-auto mb-3" />
                    <Skeleton className="h-5 w-96 mx-auto" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {[...Array(8)].map((_, i) => (
                        <Card key={i} className="p-6 bg-muted">
                            <Skeleton className="h-6 w-3/4 mb-4" />
                            <Skeleton className="h-4 w-full mb-2" />
                            <Skeleton className="h-4 w-5/6 mb-4" />
                            <div className="flex gap-2 mt-4">
                                <Skeleton className="h-9 w-9" />
                                <Skeleton className="h-9 w-9" />
                                <Skeleton className="h-9 w-9" />
                                <Skeleton className="h-9 w-9" />
                                <Skeleton className="h-9 w-9" />
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        </Card>
    );
}

