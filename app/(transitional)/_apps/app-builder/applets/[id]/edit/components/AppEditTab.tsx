'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

interface AppEditTabProps {
  appId?: string;
  subcategoryId?: string;
  onUpdate: (field: string, value: string) => void;
}

export default function AppEditTab({ 
  appId, 
  subcategoryId, 
  onUpdate 
}: AppEditTabProps) {
  const handleSearchApp = () => {
    // In a real implementation, this would open a modal or search interface for app selection
    console.log("Search for app");
  };

  const handleSearchSubcategory = () => {
    // In a real implementation, this would open a modal or search interface for subcategory selection
    console.log("Search for subcategory");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-4">
          <div>
            <Label htmlFor="app-id">App ID</Label>
            <div className="flex space-x-2">
              <div className="flex-grow">
                <Input 
                  id="app-id" 
                  value={appId || ''} 
                  onChange={(e) => onUpdate('appId', e.target.value)}
                  placeholder="Enter app ID"
                />
              </div>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={handleSearchApp}
                className="h-10 w-10"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div>
            <Label htmlFor="subcategory-id">Subcategory ID</Label>
            <div className="flex space-x-2">
              <div className="flex-grow">
                <Input 
                  id="subcategory-id" 
                  value={subcategoryId || ''} 
                  onChange={(e) => onUpdate('subcategoryId', e.target.value)}
                  placeholder="Enter subcategory ID"
                />
              </div>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={handleSearchSubcategory}
                className="h-10 w-10"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
} 