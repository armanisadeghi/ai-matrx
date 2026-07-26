'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/use-toast';

interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
  icon?: React.ReactNode;
}

interface EditTabLayoutProps {
  title: string;
  subtitle?: string;
  tabs: TabItem[];
  id: string;
  onSave: () => Promise<void>;
  hasChanges: boolean;
}

export default function EditTabLayout({ 
  title, 
  subtitle, 
  tabs, 
  id, 
  onSave,
  hasChanges
}: EditTabLayoutProps) {
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();
  
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };
  
  const handleBack = () => {
    if (hasChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        router.push(`/apps/app-builder/apps/${id}`);
      }
    } else {
      router.push(`/apps/app-builder/apps/${id}`);
    }
  };
  
  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onSave();
      toast({
        title: "Changes saved",
        description: "Your changes have been saved successfully.",
      });
    } catch (error) {
      console.error('Failed to save changes:', error);
      toast({
        title: "Failed to save changes",
        description: "An error occurred while saving your changes.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleCancel = () => {
    if (hasChanges) {
      if (confirm('Are you sure you want to discard all changes?')) {
        router.push(`/apps/app-builder/apps/${id}`);
      }
    } else {
      router.push(`/apps/app-builder/apps/${id}`);
    }
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
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">Edit: {title}</h2>
            {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
          </div>
        </div>
        
        <div className="flex items-center space-x-2 mt-4 md:mt-0">
          <Button 
            variant="outline"
            onClick={handleCancel}
          >
            <X className="h-4 w-4 mr-2" /> Cancel
          </Button>
          
          <Button 
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={!hasChanges ? "opacity-50" : ""}
          >
            <Save className="h-4 w-4 mr-2" /> {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="border-b border-border overflow-x-auto">
          <TabsList className="bg-transparent p-0 h-auto">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="py-2.5 px-4 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary rounded-none bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors whitespace-nowrap"
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