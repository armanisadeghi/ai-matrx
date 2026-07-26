'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';

interface ReferencesTabProps {
  appId?: string;
  compiledRecipeId?: string;
  subcategoryId?: string;
}

export default function ReferencesTab({ 
  appId, 
  compiledRecipeId, 
  subcategoryId 
}: ReferencesTabProps) {
  const router = useRouter();
  
  const hasReferences = appId || compiledRecipeId || subcategoryId;
  
  if (!hasReferences) {
    return (
      <Card className="p-6">
        <div className="mb-4">
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">Related Resources</h3>
          <p className="text-gray-500 dark:text-gray-400">No related resources found for this applet.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">
          Related Resources
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          External resources connected to this applet.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {appId && (
          <ReferenceCard 
            title="App"
            id={appId}
            description="The parent application that contains this applet."
            viewPath={`/apps/app-builder/apps/${appId}`}
          />
        )}
        
        {compiledRecipeId && (
          <ReferenceCard 
            title="Compiled Recipe"
            id={compiledRecipeId}
            description="The compiled recipe used by this applet."
            viewPath={`/apps/app-builder/recipes/${compiledRecipeId}`}
          />
        )}
        
        {subcategoryId && (
          <ReferenceCard 
            title="Subcategory"
            id={subcategoryId}
            description="The subcategory this applet belongs to."
            viewPath={`/apps/app-builder/subcategories/${subcategoryId}`}
          />
        )}
      </div>
    </div>
  );
}

interface ReferenceCardProps {
  title: string;
  id: string;
  description: string;
  viewPath: string;
}

function ReferenceCard({ title, id, description, viewPath }: ReferenceCardProps) {
  const router = useRouter();
  
  return (
    <Card className="p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div className="space-y-1 mb-4 md:mb-0">
          <h4 className="text-md font-medium text-gray-800 dark:text-gray-200">{title}</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
          <p className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded mt-2 inline-block">
            {id}
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="mt-2 md:mt-0 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
          onClick={() => router.push(viewPath)}
        >
          <ExternalLink className="h-4 w-4" /> View
        </Button>
      </div>
    </Card>
  );
} 