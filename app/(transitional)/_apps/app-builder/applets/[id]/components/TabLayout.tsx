'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Edit, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  
  const handleEdit = () => {
    router.push(`/apps/app-builder/applets/${id}/edit`);
  };
  
  return (
    <div className="space-y-4">     
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* Desktop Tabs */}
        <div className="border-b border-border hidden md:block">
          <TabsList className="bg-transparent p-0 h-auto flex flex-wrap justify-start">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="py-2 px-2.5 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary rounded-none bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm"
              >
                <div className="flex items-center space-x-1.5">
                  {tab.icon}
                  <span>{tab.label}</span>
                </div>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Mobile Dropdown */}
        <div className="md:hidden border-b border-border pb-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {tabs.find(tab => tab.id === activeTab)?.label}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Menu className="h-4 w-4" />
                  <span>Tabs</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {tabs.map((tab) => (
                  <DropdownMenuItem key={tab.id} onClick={() => handleTabChange(tab.id)}>
                    <div className="flex items-center space-x-2">
                      {tab.icon}
                      <span>{tab.label}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        <div className="mt-4">
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