'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

interface ReferencesEditTabProps {
  appId?: string;
  compiledRecipeId?: string;
  subcategoryId?: string;
  onUpdate: (field: string, value: string) => void;
}

export default function ReferencesEditTab({
  appId,
  compiledRecipeId,
  subcategoryId,
  onUpdate
}: ReferencesEditTabProps) {
  // Placeholder for searching related resources
  const handleSearchResource = (resourceType: string) => {
    console.log(`Search for ${resourceType} clicked`);
    // In a real implementation, this would open a search dialog
  };

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">
          Related Resources
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Connect this applet to other resources in the system.
        </p>
      </div>

      <Card className="p-6">
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-end space-x-2">
              <div className="flex-1">
                <Label htmlFor="app-id">App ID</Label>
                <Input 
                  id="app-id" 
                  value={appId || ''} 
                  onChange={(e) => onUpdate('appId', e.target.value)}
                  placeholder="Enter App ID"
                />
              </div>
              <Button 
                variant="outline" 
                onClick={() => handleSearchResource('app')}
              >
                <Search className="h-4 w-4" /> Search
              </Button>
            </div>

            <div className="flex items-end space-x-2">
              <div className="flex-1">
                <Label htmlFor="recipe-id">Compiled Recipe ID</Label>
                <Input 
                  id="recipe-id" 
                  value={compiledRecipeId || ''} 
                  onChange={(e) => onUpdate('compiledRecipeId', e.target.value)}
                  placeholder="Enter Compiled Recipe ID"
                />
              </div>
              <Button 
                variant="outline" 
                onClick={() => handleSearchResource('recipe')}
              >
                <Search className="h-4 w-4" /> Search
              </Button>
            </div>

            <div className="flex items-end space-x-2">
              <div className="flex-1">
                <Label htmlFor="subcategory-id">Subcategory ID</Label>
                <Input 
                  id="subcategory-id" 
                  value={subcategoryId || ''} 
                  onChange={(e) => onUpdate('subcategoryId', e.target.value)}
                  placeholder="Enter Subcategory ID"
                />
              </div>
              <Button 
                variant="outline" 
                onClick={() => handleSearchResource('subcategory')}
              >
                <Search className="h-4 w-4" /> Search
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
} 