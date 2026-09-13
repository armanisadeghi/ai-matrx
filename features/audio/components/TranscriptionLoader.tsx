/**
 * Transcription Loader Component
 * 
 * Displays a loading state during transcription with optional recording duration
 */

'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDurationSeconds } from '@ai-matrx/kit/format';

export interface TranscriptionLoaderProps {
  message?: string;
  duration?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function TranscriptionLoader({
  message = 'Transcribing',
  duration,
  className,
  size = 'md',
}: TranscriptionLoaderProps) {
  
  // Size configurations
  const sizeConfig = {
    sm: {
      spinner: 'h-3 w-3',
      text: 'text-xs',
    },
    md: {
      spinner: 'h-4 w-4',
      text: 'text-sm',
    },
    lg: {
      spinner: 'h-5 w-5',
      text: 'text-base',
    },
  };

  const config = sizeConfig[size];

  // Format duration if provided
  const formattedDuration = duration !== undefined
    ? formatDurationSeconds(duration, { style: 'clock' })
    : null;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Loader2 className={cn(config.spinner, 'animate-spin text-blue-600 dark:text-blue-400')} />
      <div className="flex items-center gap-1">
        <span className={cn(config.text, 'text-gray-700 dark:text-gray-300 font-medium')}>
          {message}
        </span>
        {formattedDuration && (
          <span className={cn(config.text, 'text-gray-500 dark:text-gray-400')}>
            ({formattedDuration})
          </span>
        )}
        <span className="flex gap-0.5">
          <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
          <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
          <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
        </span>
      </div>
    </div>
  );
}

