import { CardContent } from "@/components/ui/card";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const AppletSkeleton = () => {
    return (
        <div className="h-dvh w-full flex">
            {/* Sidebar */}
            <div className="w-64 border-r border-border bg-muted/40 p-4">
                {/* Logo/Brand area */}
                <div className="flex items-center space-x-3 mb-8">
                    <Skeleton className="h-8 w-8 rounded" />
                    <Skeleton className="h-4 w-32" />
                </div>

                {/* Navigation items */}
                <div className="space-y-4">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="flex items-center space-x-3">
                            <Skeleton className="h-4 w-4" />
                            <Skeleton className="h-4 w-24" />
                        </div>
                    ))}
                </div>

                {/* Bottom profile section */}
                <div className="absolute bottom-4 flex items-center space-x-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-2 w-16" />
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                {/* Top form section */}
                <Card className="border border-border">
                    <CardContent className="p-6">
                        <div className="grid grid-cols-3 gap-6">
                            {/* Form fields */}
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="space-y-2">
                                    <Skeleton className="h-3 w-24" />
                                    <Skeleton className="h-9 w-full" />
                                </div>
                            ))}
                        </div>

                        {/* Form actions */}
                        <div className="flex justify-end space-x-3 mt-6">
                            <Skeleton className="h-9 w-24" />
                            <Skeleton className="h-9 w-24" />
                        </div>
                    </CardContent>
                </Card>

                {/* Data section */}
                <Card className="border border-border">
                    <CardContent className="p-6">
                        {/* Table header */}
                        <div className="flex items-center justify-between mb-6">
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-8 w-32" />
                        </div>

                        {/* Table skeleton */}
                        <div className="space-y-4">
                            {/* Column headers */}
                            <div className="grid grid-cols-4 gap-4">
                                {[...Array(4)].map((_, i) => (
                                    <Skeleton key={i} className="h-4 w-24" />
                                ))}
                            </div>

                            {/* Table rows */}
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="grid grid-cols-4 gap-4">
                                    {[...Array(4)].map((_, j) => (
                                        <Skeleton key={j} className="h-4 w-full" />
                                    ))}
                                </div>
                            ))}
                        </div>

                        {/* Pagination */}
                        <div className="flex items-center justify-between mt-6">
                            <Skeleton className="h-4 w-32" />
                            <div className="flex space-x-2">
                                {[...Array(3)].map((_, i) => (
                                    <Skeleton key={i} className="h-8 w-8" />
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default AppletSkeleton;
