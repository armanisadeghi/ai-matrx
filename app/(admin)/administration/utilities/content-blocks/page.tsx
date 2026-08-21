'use client';

import React, { Suspense } from 'react';
import { ContentBlocksManager } from '@/components/admin/ContentBlocksManager';

export default function ContentBlocksAdminPage() {
    // The manager reads `?block=` with useSearchParams, which the App Router
    // requires under a Suspense boundary.
    return (
        <div className="h-full w-full overflow-auto">
            <Suspense fallback={null}>
                <ContentBlocksManager />
            </Suspense>
        </div>
    );
}
