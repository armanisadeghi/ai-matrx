'use client'

import React from 'react';
import TypeScriptErrorViewer from "@/components/admin/ts-error-analyzer/TypeScriptErrorViewer";

export default function TypeScriptErrorsPage() {
    return (
        <div className="w-full h-full overflow-auto">
            <TypeScriptErrorViewer />
        </div>
    )
} 