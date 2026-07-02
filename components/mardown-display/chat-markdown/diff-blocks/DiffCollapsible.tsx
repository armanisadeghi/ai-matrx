/**
 * Minimal VS Code-style Collapsible for Diffs
 * 
 * Ultra-tight, professional collapsible component designed specifically
 * for code diffs. Much smaller and more compact than ChatCollapsibleWrapper.
 * 
 * Features:
 * - Collapsed preview mode (shows first N lines)
 * - Diff statistics (+/- counts)
 * - Smooth expand/collapse with fade effect
 */

'use client';

import React, { useState, ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DiffCollapsibleProps {
  icon: ReactNode;
  title: string;
  initialOpen?: boolean;
  children: ReactNode;
  className?: string;
  // Diff statistics (VSCode style)
  additions?: number;
  deletions?: number;
  // Preview mode - shows first N lines when collapsed
  previewContent?: ReactNode;
  showPreview?: boolean;
  /** Optional element pinned to the right of the header, OUTSIDE the toggle
   * button (so it can be interactive — e.g. an admin chip). */
  headerRight?: ReactNode;
}

/**
 * Minimal, VS Code-inspired collapsible for diff blocks
 */
export const DiffCollapsible: React.FC<DiffCollapsibleProps> = ({
  icon,
  title,
  initialOpen = false,
  children,
  className,
  additions,
  deletions,
  previewContent,
  showPreview = false,
  headerRight,
}) => {
  const [isOpen, setIsOpen] = useState(initialOpen);

  return (
    <div className={cn('border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden my-2', className)}>
      {/* Ultra-minimal header - VS Code style */}
      <div className="flex items-center bg-muted/30">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 flex-1 min-w-0 px-2 py-1 hover:bg-muted/50 transition-colors text-left"
      >
        {/* Chevron - rotates on open */}
        {isOpen ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        
        {/* Icon */}
        <div className="shrink-0">
          {icon}
        </div>
        
        {/* Title - very small, VS Code style */}
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </span>

        {/* Diff Statistics - VSCode style */}
        {(additions !== undefined || deletions !== undefined) && (
          <div className="ml-auto flex items-center gap-2 text-[10px] font-mono">
            {additions !== undefined && additions > 0 && (
              <span className="text-green-600 dark:text-green-400">
                +{additions}
              </span>
            )}
            {deletions !== undefined && deletions > 0 && (
              <span className="text-red-600 dark:text-red-400">
                -{deletions}
              </span>
            )}
          </div>
        )}
      </button>
      {headerRight && <div className="shrink-0 px-2">{headerRight}</div>}
      </div>

      {/* Content - with preview support */}
      <div className={cn(
        'transition-all duration-200 ease-in-out',
        isOpen ? 'max-h-[2000px] opacity-100' : showPreview ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'
      )}>
        {isOpen ? (
          // Full content when expanded
          <div className="overflow-auto">
            {children}
          </div>
        ) : showPreview && previewContent ? (
          // Preview content when collapsed
          <div className="relative overflow-hidden">
            {previewContent}
            {/* Fade effect at bottom with expand button */}
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-zinc-900 via-white/80 dark:via-zinc-900/80 to-transparent pointer-events-none">
              {/* Expand button - clickable overlay */}
              <button
                onClick={() => setIsOpen(true)}
                className="absolute bottom-1 left-1/2 -translate-x-1/2 pointer-events-auto
                  flex items-center justify-center w-full h-3.5
                  bg-transparent transition-colors group"
                aria-label="Expand diff"
              >
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

