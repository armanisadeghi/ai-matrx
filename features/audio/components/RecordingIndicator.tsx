/**
 * Recording Indicator Component
 * 
 * Visual indicator that shows recording is in progress with duration
 */

'use client';

import React from 'react';
import { Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDurationSeconds } from '@ai-matrx/kit/format';

export interface RecordingIndicatorProps {
  duration: number;
  audioLevel?: number; // 0-100, optional audio level
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showPulse?: boolean;
  color?: 'blue' | 'purple' | 'green';
}

export function RecordingIndicator({
  duration,
  audioLevel,
  className,
  size = 'md',
  showPulse = true,
  color = 'blue',
}: RecordingIndicatorProps) {
  
  // Size configurations
  const sizeConfig = {
    sm: {
      icon: 'h-3 w-3',
      dot: 'h-2 w-2',
      text: 'text-xs',
    },
    md: {
      icon: 'h-4 w-4',
      dot: 'h-3 w-3',
      text: 'text-sm',
    },
    lg: {
      icon: 'h-5 w-5',
      dot: 'h-4 w-4',
      text: 'text-base',
    },
  };

  const config = sizeConfig[size];

  // Format duration
  const formattedDuration = formatDurationSeconds(duration, { style: 'clock' });

  // Color configurations
  const colorConfig = {
    blue: {
      dot: 'bg-blue-500',
      icon: 'text-blue-600 dark:text-blue-400',
      text: 'text-blue-600 dark:text-blue-400',
    },
    purple: {
      dot: 'bg-purple-500',
      icon: 'text-purple-600 dark:text-purple-400',
      text: 'text-purple-600 dark:text-purple-400',
    },
    green: {
      dot: 'bg-green-500',
      icon: 'text-green-600 dark:text-green-400',
      text: 'text-green-600 dark:text-green-400',
    },
  };

  const colors = colorConfig[color];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Pulsing dot with optional audio level scaling */}
      <div className="relative flex items-center justify-center">
        <div 
          className={cn(
            config.dot,
            'rounded-full transition-transform duration-75',
            colors.dot,
            showPulse && 'animate-pulse'
          )}
          style={audioLevel !== undefined ? {
            transform: `scale(${1 + (audioLevel / 200)})`, // Scale based on audio level
          } : undefined}
        />
        {showPulse && (
          <div className={cn(
            config.dot,
            'absolute rounded-full animate-ping',
            colors.dot
          )} />
        )}
      </div>
      
      {/* Recording text */}
      <div className="flex items-center gap-1.5">
        <Mic className={cn(config.icon, colors.icon)} />
        <span className={cn(config.text, colors.text, 'font-medium')}>
          Recording
        </span>
        <span className={cn(config.text, 'text-gray-600 dark:text-gray-400 font-mono')}>
          {formattedDuration}
        </span>
      </div>
    </div>
  );
}

