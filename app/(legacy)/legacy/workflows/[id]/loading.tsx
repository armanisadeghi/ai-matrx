import React from 'react';
import { Loader2, Settings, Play } from 'lucide-react';

export default function WorkflowLoading() {
  return (
    <div className="h-dvh w-full flex items-center justify-center bg-background">
      {/* Overlay to prevent interactions */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50" />
      
      {/* Loading content */}
      <div className="relative z-50 flex flex-col items-center justify-center space-y-6">
        {/* Workflow visualization mockup */}
        <div className="relative">
          <div className="flex items-center gap-4 opacity-30">
            {/* Mock nodes */}
            <div className="w-12 h-8 bg-primary/20 rounded border-2 border-dashed border-primary/30" />
            <div className="w-8 h-0.5 bg-primary/20" />
            <div className="w-12 h-8 bg-primary/20 rounded border-2 border-dashed border-primary/30" />
            <div className="w-8 h-0.5 bg-primary/20" />
            <div className="w-12 h-8 bg-primary/20 rounded border-2 border-dashed border-primary/30" />
          </div>
          
          {/* Spinning loader overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 bg-background border-2 border-primary/20 rounded-full flex items-center justify-center shadow-lg">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          </div>
        </div>
        
        {/* Loading text */}
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            Loading Workflow
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Setting up your workflow editor and loading nodes...
          </p>
        </div>

        {/* Feature indicators */}
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Settings className="w-3 h-3" />
            <span>Editor</span>
          </div>
          <div className="flex items-center gap-1">
            <Play className="w-3 h-3" />
            <span>Execution</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-primary/30" />
            <span>Nodes</span>
          </div>
        </div>
      </div>
    </div>
  );
} 