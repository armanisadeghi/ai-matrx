// app/admin/components/entity-testing/tabs/MetricsTab.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

const MetricsTab = ({ entity, errorLog, clearErrorLog }) => {
    return (
        <div className="grid grid-cols-3 gap-4">
            <Card>
                <CardHeader>
                    <CardTitle>Cache Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span>Is Stale:</span>
                            <Badge variant={entity.isStale ? "destructive" : "secondary"}>
                                {entity.isStale ? "Yes" : "No"}
                            </Badge>
                        </div>
                        <div className="flex justify-between">
                            <span>Has Unsaved Changes:</span>
                            <Badge variant={entity.hasUnsavedChanges ? "destructive" : "secondary"}>
                                {entity.hasUnsavedChanges ? "Yes" : "No"}
                            </Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>
            {/* Additional metric cards... */}
        </div>
    );
};

export default MetricsTab;
