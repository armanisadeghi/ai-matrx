'use client'

import React from 'react';
import ServerCacheManager from "@/components/admin/server-cache/ServerCacheManager";

export default function ServerCachePage() {
    return (
        <div className="w-full h-full overflow-auto">
            <ServerCacheManager />
        </div>
    );
}

