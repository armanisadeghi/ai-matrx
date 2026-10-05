/**
 * Microphone Button Component
 * 
 * Simple, reusable microphone button with recording state visualization
 * Can be used anywhere in the app for quick voice input
 */

'use client';

import React from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { Button } from "@ai-matrx/design-system";
import { cn } from '@/lib/utils';

export interface MicrophoneButtonProps {
  isRecording?: boolean;
  isProcessing?: boolean;
  disabled?: boolean;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  onClick?: () => void;
  className?: string;
  tooltip?: string;
  showLabel?: boolean;
}

export function MicrophoneButton({
  isRecording = false,
  isProcessing = false,
  disabled = false,
  size = 'icon',
  variant = 'ghost',
  onClick,
  className,
  tooltip,
  showLabel = false,
}: MicrophoneButtonProps) {
  
  // Determine icon based on state
  const Icon = isProcessing ? Loader2 : isRecording ? MicOff : Mic;
  
  // Dynamic classes for recording state
  const buttonClasses = cn(
    'transition-all duration-200',
    isRecording && !isProcessing && 'bg-red-500 hover:bg-red-600 text-white animate-pulse',
    isProcessing && 'cursor-wait',
    className
  );

  // Size mapping for icons
  const iconSizeMap = {
    default: 'h-4 w-4',
    sm: 'h-3 w-3',
    lg: 'h-5 w-5',
    icon: 'h-4 w-4',
  };

  const iconSize = iconSizeMap[size];

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={onClick}
      disabled={disabled || isProcessing}
      className={buttonClasses}
      title={tooltip || (isRecording ? 'Stop recording' : isProcessing ? 'Processing...' : 'Start recording')}
    >
      <Icon className={cn(iconSize, isProcessing && 'animate-spin')} />
      {showLabel && (
        <span className="ml-2">
          {isProcessing ? 'Processing...' : isRecording ? 'Recording' : 'Record'}
        </span>
      )}
    </Button>
  );
}

