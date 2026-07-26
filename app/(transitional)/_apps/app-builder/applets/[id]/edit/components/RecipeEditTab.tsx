'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

interface RecipeEditTabProps {
  compiledRecipeId?: string;
  onUpdate: (field: string, value: string) => void;
}

export default function RecipeEditTab({ 
  compiledRecipeId, 
  onUpdate 
}: RecipeEditTabProps) {
  const handleSearchRecipe = () => {
    // In a real implementation, this would open a modal or search interface for recipe selection
    console.log("Search for recipe");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-4">
          <div>
            <Label htmlFor="compiled-recipe-id">Compiled Recipe ID</Label>
            <div className="flex space-x-2">
              <div className="flex-grow">
                <Input 
                  id="compiled-recipe-id" 
                  value={compiledRecipeId || ''} 
                  onChange={(e) => onUpdate('compiledRecipeId', e.target.value)}
                  placeholder="Enter compiled recipe ID"
                />
              </div>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={handleSearchRecipe}
                className="h-10 w-10"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="pt-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Connecting to a recipe will provide data sources and broker mappings automatically.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
} 