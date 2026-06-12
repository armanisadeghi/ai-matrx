// components/debug/log-details-dialog.tsx

'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { LogEntry } from "@/utils/logger";
import { formatDistanceToNow } from 'date-fns';

interface LogDetailsDialogProps {
    log: LogEntry;
    onClose: () => void;
}

export function LogDetailsDialog({ log, onClose }: LogDetailsDialogProps) {
    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[80dvh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Badge>{log.category}</Badge>
                        Log Details
                    </DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-full">
                    <div className="space-y-4 p-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <h4 className="text-sm font-medium">Timestamp</h4>
                                <div className="text-sm text-muted-foreground">
                                    {new Date(log.context.timestamp).toLocaleString()}
                                    <span className="ml-2 text-xs">
                                        ({formatDistanceToNow(new Date(log.context.timestamp))} ago)
                                    </span>
                                </div>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium">ID</h4>
                                <code className="text-sm text-muted-foreground">{log.id}</code>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-medium">Context</h4>
                            <pre className="mt-1 p-2 rounded-md bg-muted text-sm">
                                {JSON.stringify(log.context, null, 2)}
                            </pre>
                        </div>

                        {log.metadata && (
                            <div>
                                <h4 className="text-sm font-medium">Metadata</h4>
                                <pre className="mt-1 p-2 rounded-md bg-muted text-sm">
                                    {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                            </div>
                        )}

                        {'error' in log && (
                            <div>
                                <h4 className="text-sm font-medium">Error Details</h4>
                                <div className="mt-1 p-2 rounded-md bg-muted">
                                    <p className="text-sm font-medium">{log.error.name}</p>
                                    <p className="text-sm text-muted-foreground">{log.error.message}</p>
                                    {log.error.stack && (
                                        <pre className="mt-2 text-xs whitespace-pre-wrap">
                                            {log.error.stack}
                                        </pre>
                                    )}
                                </div>
                            </div>
                        )}

                        {'action' in log && (
                            <>
                                <div>
                                    <h4 className="text-sm font-medium">Redux Action</h4>
                                    <pre className="mt-1 p-2 rounded-md bg-muted text-sm">
                                        {JSON.stringify(log.action, null, 2)}
                                    </pre>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <h4 className="text-sm font-medium">Previous State</h4>
                                        <pre className="mt-1 p-2 rounded-md bg-muted text-sm">
                                            {JSON.stringify(log.prevState, null, 2)}
                                        </pre>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium">Next State</h4>
                                        <pre className="mt-1 p-2 rounded-md bg-muted text-sm">
                                            {JSON.stringify(log.nextState, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
