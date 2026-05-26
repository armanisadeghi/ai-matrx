'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Cpu, FolderOpen } from 'lucide-react';
import { TemplatesManager } from '@/features/research/admin/TemplatesManager';
import { AgentWiringDashboard } from '@/features/research/admin/AgentWiringDashboard';
import { ProjectsOverview } from '@/features/research/admin/ProjectsOverview';

export default function ResearchSystemAdminPage() {
    const [activeTab, setActiveTab] = useState('templates');

    return (
        <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                <div className="border-b px-4 bg-card">
                    <TabsList className="h-12">
                        <TabsTrigger value="templates" className="gap-2">
                            <FileText className="w-4 h-4" />
                            Templates
                        </TabsTrigger>
                        <TabsTrigger value="agents" className="gap-2">
                            <Cpu className="w-4 h-4" />
                            Agent Wiring
                        </TabsTrigger>
                        <TabsTrigger value="projects" className="gap-2">
                            <FolderOpen className="w-4 h-4" />
                            Projects
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="templates" className="flex-1 m-0 overflow-hidden">
                    <TemplatesManager />
                </TabsContent>

                <TabsContent value="agents" className="flex-1 m-0 overflow-hidden">
                    <AgentWiringDashboard />
                </TabsContent>

                <TabsContent value="projects" className="flex-1 m-0 overflow-hidden">
                    <ProjectsOverview />
                </TabsContent>
            </Tabs>
        </div>
    );
}
