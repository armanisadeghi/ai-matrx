'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CategoriesAdmin } from './CategoriesAdmin';
import { ErrorsAdmin } from './ErrorsAdmin';
import { AnalyticsAdmin } from './AnalyticsAdmin';
import { AppsAdmin } from './AppsAdmin';
import { RateLimitsAdmin } from './RateLimitsAdmin';
import {
    Tag,
    AlertCircle,
    BarChart3,
    Boxes,
    Shield
} from 'lucide-react';

interface PromptAppsAdminContainerProps {
    className?: string;
}

export function PromptAppsAdminContainer({ className }: PromptAppsAdminContainerProps) {
    const [activeTab, setActiveTab] = useState('categories');

    return (
        <div className={`flex flex-col h-full bg-textured overflow-hidden ${className}`}>
            {/* Header */}
            <div className="p-4 border-b border-border bg-textured">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    Prompt Apps Administration
                </h1>
                {/* DO NOT USE DESCRIPTION */}

            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                <div className="border-b border-border px-4 bg-textured">
                    <TabsList className="bg-transparent h-auto p-0 gap-1">
                        <TabsTrigger 
                            value="categories" 
                            className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                        >
                            <Tag className="w-4 h-4" />
                            Categories
                        </TabsTrigger>
                        <TabsTrigger 
                            value="apps" 
                            className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                        >
                            <Boxes className="w-4 h-4" />
                            Apps
                        </TabsTrigger>
                        <TabsTrigger 
                            value="errors" 
                            className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                        >
                            <AlertCircle className="w-4 h-4" />
                            Errors
                        </TabsTrigger>
                        <TabsTrigger 
                            value="analytics" 
                            className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                        >
                            <BarChart3 className="w-4 h-4" />
                            Analytics
                        </TabsTrigger>
                        <TabsTrigger 
                            value="rate-limits" 
                            className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                        >
                            <Shield className="w-4 h-4" />
                            Rate Limits
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="flex-1 overflow-hidden">
                    <TabsContent value="categories" className="h-full m-0 data-[state=active]:flex">
                        <CategoriesAdmin />
                    </TabsContent>
                    <TabsContent value="apps" className="h-full m-0 data-[state=active]:flex">
                        <AppsAdmin />
                    </TabsContent>
                    <TabsContent value="errors" className="h-full m-0 data-[state=active]:flex">
                        <ErrorsAdmin />
                    </TabsContent>
                    <TabsContent value="analytics" className="h-full m-0 data-[state=active]:flex">
                        <AnalyticsAdmin />
                    </TabsContent>
                    <TabsContent value="rate-limits" className="h-full m-0 data-[state=active]:flex">
                        <RateLimitsAdmin />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}

