// app/admin/components/entity-testing/tabs/DebugTab.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

const DebugTab = ({ entity }) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Debug Information</CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[400px]">
                    <div className="space-y-4">
                        <div>
                            <h3 className="font-medium">Entity Metadata</h3>
                            <pre className="bg-muted p-2 rounded-md">
                                {JSON.stringify(entity.entityMetadata, null, 2)}
                            </pre>
                        </div>
                        <div>
                            <h3 className="font-medium">Loading State</h3>
                            <pre className="bg-muted p-2 rounded-md">
                                {JSON.stringify(entity.loadingState, null, 2)}
                            </pre>
                        </div>
                        <div>
                            <h3 className="font-medium">Current Page Data</h3>
                            <pre className="bg-muted p-2 rounded-md">
                                {JSON.stringify(entity.currentPage, null, 2)}
                            </pre>
                        </div>
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
};

export default DebugTab;
