// app/admin/components/entity-testing/LogViewer.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EntityLogger from "@/lib/redux/entity/utils/entityLogger";

const LogViewer = () => {
    const [logs, setLogs] = useState<any[]>([]);
    
    // Create a shared EntityLogger instance for the LogViewer
    const logger = useMemo(() => {
        return new EntityLogger('LogViewer', 'all-entities');
    }, []);

    useEffect(() => {
        const unsubscribe = logger.subscribe(setLogs);
        return () => unsubscribe();
    }, [logger]);

    const getLevelColor = (level: string) => {
        switch (level) {
            case 'error': return 'destructive';
            case 'warning': return 'warning';
            case 'info': return 'secondary';
            default: return 'default';
        }
    };

    return (
        <div className="border rounded-lg p-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">System Logs</h3>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => logger.clear()}
                >
                    Clear Logs
                </Button>
            </div>
            <ScrollArea className="h-[400px]">
                {logs.map((log, index) => (
                    <div
                        key={index}
                        className="border-b border-muted p-2 last:border-0"
                    >
                        <div className="flex items-center gap-2">
                            <Badge variant={getLevelColor(log.level)}>
                                {log.level.toUpperCase()}
                            </Badge>
                            {log.entityKey && (
                                <Badge variant="outline">
                                    {log.entityKey}
                                </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                                {new Date(log.timestamp).toLocaleString()}
                            </span>
                        </div>
                        <p className="text-sm mt-1">{log.message}</p>
                        {log.details && (
                            <pre className="text-xs bg-muted p-2 mt-2 rounded overflow-x-auto">
                                {JSON.stringify(log.details, null, 2)}
                            </pre>
                        )}
                    </div>
                ))}
            </ScrollArea>
        </div>
    );
};

export default LogViewer;
