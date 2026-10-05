'use client';

import React, { useState } from 'react';
import { History } from 'lucide-react';
import { Button } from "@ai-matrx/design-system";
import { QueryHistoryOverlay } from './query-history-overlay';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface QueryHistoryButtonProps {
  onSelectQuery: (query: string) => void;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const QueryHistoryButton: React.FC<QueryHistoryButtonProps> = ({ 
  onSelectQuery,
  className = '',
  variant = 'outline',
  size = 'sm'
}) => {
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={variant}
              size={size}
              onClick={() => setIsOverlayOpen(true)}
              className={`flex items-center gap-2 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 ${className}`}
            >
              <History className="h-4 w-4" />
              Query History
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">View and manage your SQL query history</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <QueryHistoryOverlay 
        isOpen={isOverlayOpen}
        onClose={() => setIsOverlayOpen(false)}
        onSelectQuery={onSelectQuery}
      />
    </>
  );
}; 