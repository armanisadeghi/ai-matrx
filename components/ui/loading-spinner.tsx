'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2, Settings, Play, Calendar, Workflow, Plus } from 'lucide-react';

// Animation styles (inline to avoid external CSS dependency)
const animationStyles = `
  @keyframes pulseWave {
    0% { opacity: 0.3; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1); }
    100% { opacity: 0.3; transform: scale(0.8); }
  }
  
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-5px); }
  }
  
  @keyframes neuronPulse {
    0% { transform: scale(0.8); opacity: 0.3; }
    40% { transform: scale(1.4); opacity: 1; }
    80% { transform: scale(0.8); opacity: 0.3; }
    100% { transform: scale(0.8); opacity: 0.3; }
  }
  
  @keyframes brainWavePulse {
    0% { transform: scale(0.8); opacity: 0; }
    20% { opacity: 0.2; }
    50% { transform: scale(1.5); opacity: 0; }
    100% { transform: scale(1.8); opacity: 0; }
  }
  
  .loading-pulse-1 { animation: pulseWave 1.5s infinite ease-in-out; animation-delay: 0s; }
  .loading-pulse-2 { animation: pulseWave 1.5s infinite ease-in-out; animation-delay: 0.3s; }
  .loading-pulse-3 { animation: pulseWave 1.5s infinite ease-in-out; animation-delay: 0.6s; }
  
  .loading-bounce-1 { animation: bounce 1s infinite ease-in-out; animation-delay: 0s; }
  .loading-bounce-2 { animation: bounce 1s infinite ease-in-out; animation-delay: 0.2s; }
  .loading-bounce-3 { animation: bounce 1s infinite ease-in-out; animation-delay: 0.4s; }
  .loading-bounce-4 { animation: bounce 1s infinite ease-in-out; animation-delay: 0.6s; }
  
  .loading-neuron-1 { animation: neuronPulse 2s infinite ease-in-out; animation-delay: 0s; }
  .loading-neuron-2 { animation: neuronPulse 2s infinite ease-in-out; animation-delay: 0.4s; }
  .loading-neuron-3 { animation: neuronPulse 2s infinite ease-in-out; animation-delay: 0.8s; }
  .loading-neuron-4 { animation: neuronPulse 2s infinite ease-in-out; animation-delay: 1.2s; }
  .loading-neuron-5 { animation: neuronPulse 2s infinite ease-in-out; animation-delay: 1.6s; }
  
  .loading-brain-pulse-1 { animation: brainWavePulse 2s infinite ease-in-out; animation-delay: 0s; }
  .loading-brain-pulse-2 { animation: brainWavePulse 2s infinite ease-in-out; animation-delay: 0.5s; }
`;

type LoadingVariant = 'dots' | 'bars' | 'brain' | 'minimal' | 'workflow';
type LoadingSize = 'sm' | 'md' | 'lg';

interface LoadingSpinnerProps {
  variant?: LoadingVariant;
  size?: LoadingSize;
  message?: string;
  className?: string;
  showMessage?: boolean;
  // Workflow variant specific props
  fullscreen?: boolean;
  overlay?: boolean;
  title?: string;
  subtitle?: string;
  showFeatureIndicators?: boolean;
  showProgressSteps?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  variant = 'dots',
  size = 'md',
  message,
  className = "",
  showMessage = true,
  fullscreen = false,
  overlay = false,
  title,
  subtitle,
  showFeatureIndicators = false,
  showProgressSteps = true
}) => {
  // Inject styles
  React.useEffect(() => {
    const styleId = 'loading-spinner-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = animationStyles;
      document.head.appendChild(style);
    }
  }, []);

  const getSizeClasses = () => {
    switch (size) {
      case 'sm': return { container: 'gap-2', dot: 'w-1.5 h-1.5', bar: 'w-0.5 h-2', text: 'text-xs' };
      case 'lg': return { container: 'gap-4', dot: 'w-2.5 h-2.5', bar: 'w-1.5 h-4', text: 'text-base' };
      default: return { container: 'gap-3', dot: 'w-2 h-2', bar: 'w-1 h-2.5', text: 'text-sm' };
    }
  };

  const sizeClasses = getSizeClasses();

  const renderDots = () => (
    <div className={cn("flex items-center", sizeClasses.container)}>
      <div className={cn(sizeClasses.dot, "bg-primary dark:bg-primary-foreground rounded-full loading-pulse-1")}></div>
      <div className={cn(sizeClasses.dot, "bg-primary dark:bg-primary-foreground rounded-full loading-pulse-2")}></div>
      <div className={cn(sizeClasses.dot, "bg-primary dark:bg-primary-foreground rounded-full loading-pulse-3")}></div>
    </div>
  );

  const renderBars = () => (
    <div className={cn("flex items-center", sizeClasses.container)}>
      <div className={cn(sizeClasses.bar, "bg-primary dark:bg-primary-foreground rounded-sm loading-bounce-1")}></div>
      <div className={cn(sizeClasses.bar, "bg-primary dark:bg-primary-foreground rounded-sm loading-bounce-2")}></div>
      <div className={cn(sizeClasses.bar, "bg-primary dark:bg-primary-foreground rounded-sm loading-bounce-3")}></div>
      <div className={cn(sizeClasses.bar, "bg-primary dark:bg-primary-foreground rounded-sm loading-bounce-4")}></div>
    </div>
  );

  const renderBrain = () => (
    <div className="relative w-6 h-6 flex items-center justify-center">
      {/* Brain icon */}
      <div className="absolute">
        <svg 
          width="24" 
          height="24" 
          viewBox="0 0 24 24" 
          fill="none" 
          className="w-5 h-5 text-primary dark:text-primary-foreground"
        >
          <path 
            d="M12 4C9.5 4 7.5 5.5 7.5 8C7.5 9 7.5 9.5 7 10.5C6.5 11.5 6 12 6 13.5C6 15.5 7.5 17 9.5 17C10.5 17 11 16.5 12 16.5C13 16.5 13.5 17 14.5 17C16.5 17 18 15.5 18 13.5C18 12 17.5 11.5 17 10.5C16.5 9.5 16.5 9 16.5 8C16.5 5.5 14.5 4 12 4Z" 
            className="stroke-current"
            fill="none"
            strokeWidth="1.5"
          />
        </svg>
      </div>
      
      {/* Neural connection dots */}
      <div className="absolute inset-0">
        <div className="absolute w-1 h-1 bg-primary/60 dark:bg-primary-foreground/60 rounded-full left-[8px] top-[10px] loading-neuron-1"></div>
        <div className="absolute w-1 h-1 bg-primary/60 dark:bg-primary-foreground/60 rounded-full left-[12px] top-[8px] loading-neuron-2"></div>
        <div className="absolute w-1 h-1 bg-primary/60 dark:bg-primary-foreground/60 rounded-full left-[16px] top-[10px] loading-neuron-3"></div>
        <div className="absolute w-1 h-1 bg-primary/60 dark:bg-primary-foreground/60 rounded-full left-[10px] top-[14px] loading-neuron-4"></div>
        <div className="absolute w-1 h-1 bg-primary/60 dark:bg-primary-foreground/60 rounded-full left-[14px] top-[14px] loading-neuron-5"></div>
      </div>
      
      {/* Pulse waves */}
      <div className="absolute w-full h-full rounded-full border border-primary/30 dark:border-primary-foreground/30 loading-brain-pulse-1"></div>
      <div className="absolute w-full h-full rounded-full border border-primary/30 dark:border-primary-foreground/30 loading-brain-pulse-2"></div>
    </div>
  );

  const renderMinimal = () => (
    <div className="relative">
      <div className={cn(sizeClasses.dot, "bg-primary dark:bg-primary-foreground rounded-full loading-pulse-1")}></div>
    </div>
  );

  const renderWorkflow = () => (
    <div className="flex flex-col items-center justify-center space-y-6">
      {/* Icon animation */}
      <div className="relative">
        <div className="w-16 h-16 bg-primary/10 dark:bg-primary-foreground/10 rounded-full flex items-center justify-center">
          <Workflow className="w-8 h-8 text-primary dark:text-primary-foreground" />
        </div>
        {/* Plus icon animation */}
        <div className="absolute -top-1 -right-1 w-6 h-6 bg-primary dark:bg-primary-foreground rounded-full flex items-center justify-center">
          <Plus className="w-3 h-3 text-primary-foreground dark:text-primary" />
        </div>
        {/* Spinning ring */}
        <div className="absolute inset-0 border-2 border-transparent border-t-primary dark:border-t-primary-foreground rounded-full animate-spin" />
      </div>
      
      {/* Loading text */}
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          {title || 'Loading Workflow'}
        </h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          {subtitle || message || 'Setting up your workflow...'}
        </p>
      </div>

      {/* Progress steps */}
      {showProgressSteps && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-primary dark:bg-primary-foreground rounded-full animate-pulse" />
            <span>Loading</span>
          </div>
          <div className="w-4 h-px bg-muted-foreground/30" />
          <div className="flex items-center gap-1 opacity-50">
            <div className="w-2 h-2 bg-muted-foreground/30 rounded-full" />
            <span>Initializing</span>
          </div>
          <div className="w-4 h-px bg-muted-foreground/30" />
          <div className="flex items-center gap-1 opacity-30">
            <div className="w-2 h-2 bg-muted-foreground/30 rounded-full" />
            <span>Ready</span>
          </div>
        </div>
      )}
    </div>
  );

  const renderSpinner = () => {
    switch (variant) {
      case 'bars': return renderBars();
      case 'brain': return renderBrain();
      case 'minimal': return renderMinimal();
      case 'workflow': return renderWorkflow();
      default: return renderDots();
    }
  };

  const getDefaultMessage = () => {
    switch (variant) {
      case 'brain': return 'Processing...';
      case 'workflow': return 'Loading workflows...';
      default: return 'Loading...';
    }
  };

  // For workflow variant with fullscreen/overlay
  if (variant === 'workflow' && (fullscreen || overlay)) {
    return (
      <div className={cn(
        "flex items-center justify-center bg-background",
        fullscreen && "h-dvh w-full",
        className
      )}>
        {/* Overlay to prevent interactions */}
        {overlay && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50" />
        )}
        
        {/* Loading content */}
        <div className={cn(
          "flex flex-col items-center justify-center",
          overlay && "relative z-50"
        )}>
          {renderWorkflow()}
        </div>
      </div>
    );
  }

  // Default inline layout for other variants
  return (
    <div className={cn("flex items-center", className)}>
      {variant === 'workflow' ? (
        renderWorkflow()
      ) : (
        <>
          {renderSpinner()}
          {showMessage && (
            <span className={cn("ml-3 text-muted-foreground", sizeClasses.text)}>
              {message || getDefaultMessage()}
            </span>
          )}
        </>
      )}
    </div>
  );
};

export default LoadingSpinner; 