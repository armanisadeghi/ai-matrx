'use client';

import React from 'react';
import { EnhancedEditableJsonViewer } from '@/components/ui/JsonComponents/JsonEditor';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JsonFieldEditorProps {
    title: string;
    data: unknown;
    onSave: (data: object) => Promise<void>;
    description?: string;
    defaultExpanded?: boolean;
}

export default function JsonFieldEditor({
    title,
    data,
    onSave,
    description,
    defaultExpanded = false,
}: JsonFieldEditorProps) {
    const [expanded, setExpanded] = React.useState(defaultExpanded);

    const normalizedData = React.useMemo(() => {
        if (data === null || data === undefined) return {};
        if (typeof data === 'object') return data as object;
        if (typeof data === 'string') {
            try {
                return JSON.parse(data);
            } catch {
                return {};
            }
        }
        return {};
    }, [data]);

    return (
        <div className="border rounded-md overflow-hidden">
            <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted transition-colors text-left"
                onClick={() => setExpanded((v) => !v)}
            >
                <div className="flex items-center gap-2">
                    {expanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-sm font-medium">{title}</span>
                    {description && (
                        <span className="text-xs text-muted-foreground hidden sm:inline">{description}</span>
                    )}
                </div>
                <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full',
                    data
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'bg-muted text-muted-foreground'
                )}>
                    {data ? (
                        Array.isArray(data)
                            ? `${(data as unknown[]).length} items`
                            : typeof data === 'object'
                            ? `${Object.keys(data as object).length} keys`
                            : 'set'
                    ) : 'null'}
                </span>
            </button>

            {expanded && (
                <div className="p-2">
                    <EnhancedEditableJsonViewer
                        data={normalizedData}
                        onSave={async (d) => {
                            if (typeof d === 'string') return;
                            await onSave(d);
                        }}
                        hideHeader={false}
                    />
                </div>
            )}
        </div>
    );
}
