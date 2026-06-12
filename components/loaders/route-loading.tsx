import React from 'react';
import { Loader2, Plus } from 'lucide-react';
import { BiBrain } from "react-icons/bi";

interface MatxRouteLoaderProps {
  title?: string;
  subtitle?: string;
  step1?: string;
  step2?: string;
  step3?: string;
  fullscreen?: boolean;
}

export default function MatxRouteLoader({
  title = "AI Matrx",
  subtitle = "Integrating intelligence...",
  step1 = "Initializing",
  step2 = "Loading", 
  step3 = "Finalizing",
  fullscreen = true
}: MatxRouteLoaderProps) {
  return (
    <div className={`w-full flex items-center justify-center bg-background ${fullscreen ? 'h-dvh' : 'py-12'}`}>
      {/* Overlay to prevent interactions */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50" />
      
      {/* Loading content */}
      <div className="relative z-50 flex flex-col items-center justify-center space-y-6">
        {/* Icon animation */}
        <div className="relative">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <BiBrain className="w-8 h-8 text-primary" />
          </div>
          {/* Plus icon animation */}
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
            <Plus className="w-3 h-3 text-primary-foreground" />
          </div>
          {/* Spinning ring */}
          <div className="absolute inset-0 border-2 border-transparent border-t-primary rounded-full animate-spin" />
        </div>
        
        {/* Loading text */}
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            {title}
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            {subtitle}
          </p>
        </div>

        {/* Progress steps */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <span>{step1}</span>
          </div>
          <div className="w-4 h-px bg-muted-foreground/30" />
          <div className="flex items-center gap-1 opacity-50">
            <div className="w-2 h-2 bg-muted-foreground/30 rounded-full" />
            <span>{step2}</span>
          </div>
          <div className="w-4 h-px bg-muted-foreground/30" />
          <div className="flex items-center gap-1 opacity-30">
            <div className="w-2 h-2 bg-muted-foreground/30 rounded-full" />
            <span>{step3}</span>
          </div>
        </div>
      </div>
    </div>
  );
} 