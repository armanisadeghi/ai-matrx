'use client';

import React from 'react';
import { Card } from '@/components/ui/card';

interface RecipeTabProps {
  compiledRecipeId?: string;
}

export default function RecipeTab({ compiledRecipeId }: RecipeTabProps) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Compiled Recipe ID</p>
            <p className="text-gray-900 dark:text-gray-100">{compiledRecipeId || 'No compiled recipe associated'}</p>
          </div>
        </div>
      </Card>
    </div>
  );
} 