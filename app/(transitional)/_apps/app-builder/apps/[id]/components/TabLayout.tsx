'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
  icon?: React.ReactNode;
}

interface TabLayoutProps {
  title: string;
  subtitle?: string;
  tabs: TabItem[];
  id: string;
}

export default function TabLayout({ title, subtitle, tabs, id }: TabLayoutProps) {
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const router = useRouter();
  
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };
  
  const handleBack = () => {
    router.push('/apps/app-builder/apps');
  };
  
  const handleEdit = () => {
    router.push(`/apps/app-builder/apps/${id}/edit`);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleBack}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">{title}</h2>
            {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
          </div>
        </div>
        
        <Button 
          className="mt-4 md:mt-0"
          onClick={handleEdit}
        >
          <Edit className="h-4 w-4 mr-2" /> Edit App
        </Button>
      </div>
      
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="border-b border-border">
          <TabsList className="bg-transparent p-0 h-auto">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="py-2.5 px-4 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary rounded-none bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  {tab.icon}
                  <span>{tab.label}</span>
                </div>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        
        <div className="mt-6">
          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id}>
              {tab.content}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
} 