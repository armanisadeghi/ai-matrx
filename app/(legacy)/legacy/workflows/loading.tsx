import React from 'react';
import { Loader2, Workflow } from 'lucide-react';

export default function WorkflowsLoading() {
  return (
    <div className="h-dvh w-full flex items-center justify-center bg-background">
      {/* Overlay to prevent interactions */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50" />
      
      {/* Loading content */}
      <div className="relative z-50 flex flex-col items-center justify-center space-y-6">
        {/* Icon container */}
        <div className="relative">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Workflow className="w-8 h-8 text-primary" />
          </div>
          {/* Spinning ring */}
          <div className="absolute inset-0 border-2 border-transparent border-t-primary rounded-full animate-spin" />
        </div>
        
        {/* Loading text */}
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading Workflows
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Preparing your workflow environment...
          </p>
        </div>

        {/* Progress indicator */}
        <div className="w-48 h-1 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    </div>
  );
} 