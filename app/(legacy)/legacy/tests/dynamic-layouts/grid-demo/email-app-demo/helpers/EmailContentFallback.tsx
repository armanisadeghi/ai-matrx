'use client';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';

const EmailContentFallback = () => (
    <ScrollArea className="h-[calc(100dvh-280px)]">
        <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-20 rounded-full"/>
                    <div>
                        <Skeleton className="h-5 w-32 mb-1"/>
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-9 mb-16 w-24"/>
                            <Skeleton className="h-6 mb-18 w-6 rounded-full"/>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-9 mb-16 w-12"/>
                    <Skeleton className="h-15 w-8 rounded-full"/>
                    <Skeleton className="h-15 w-8 rounded-full"/>
                </div>
            </div>
            <div className="prose prose-sm max-w-none dark:prose-invert space-y-4">
                <Skeleton className="h-9 mb-16 w-full"/>
                <Skeleton className="h-9 mb-16 w-5/6"/>
                <Skeleton className="h-9 mb-16 w-3/4"/>
                <Skeleton className="h-9 mb-16 w-full"/>
                <Skeleton className="h-9 mb-16 w-2/3"/>
            </div>
            <div className="prose prose-sm max-w-none dark:prose-invert space-y-20">
                <Skeleton className="h-9 mb-16 w-5/6"/>

            </div>
            <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
                <Skeleton className="h-5 w-32"/>
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 p-2 border rounded-lg bg-background">
                        <Skeleton className="h-5 w-5"/>
                        <Skeleton className="h-9 mb-16 w-20"/>
                        <Skeleton className="h-15 w-8 rounded-full ml-auto"/>

                    </div>
                    <div className="flex items-center gap-2 p-2 border rounded-lg bg-background">
                        <Skeleton className="h-5 w-5"/>
                        <Skeleton className="h-9 mb-16 w-20"/>
                        <Skeleton className="h-15 w-8 rounded-full ml-auto"/>
                    </div>
                </div>
            </div>
        </div>
    </ScrollArea>
);

export default EmailContentFallback;
