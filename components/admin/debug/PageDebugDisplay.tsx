'use client';

import React from 'react';

interface PageDebugDisplayProps {
    debugData: Record<string, unknown>;
}

const PageDebugDisplay: React.FC<PageDebugDisplayProps> = ({ debugData }) => {
    if (!debugData || Object.keys(debugData).length === 0) {
        return (
            <div className="text-sm text-slate-500 dark:text-slate-400 italic p-4">
                No debug data available
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Debug Data</h3>
            <pre className="text-xs overflow-auto max-h-[600px] p-3 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                {JSON.stringify(debugData, null, 2)}
            </pre>
        </div>
    );
};

export default PageDebugDisplay;

