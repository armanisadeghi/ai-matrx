'use client';

import { RefreshCw, Pencil, Plus, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ITERATION_MODE_INFO } from '../../constants';

interface IterationControlsProps {
    onRebuild: () => void;
    onUpdate: () => void;
    onAddKeywords: () => void;
    isLoading: boolean;
}

export function IterationControls({ onRebuild, onUpdate, onAddKeywords, isLoading }: IterationControlsProps) {
    const btnClass = cn(
        'inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium transition-all',
        'matrx-glass-card text-muted-foreground hover:text-foreground',
        'disabled:opacity-40 disabled:pointer-events-none',
    );

    return (
        <div className="flex items-center gap-1.5 p-1 rounded-full matrx-shell-glass">
            <button onClick={onAddKeywords} disabled={isLoading} className={btnClass}>
                <Plus className="h-3 w-3" />
                <span className="hidden sm:inline">Add Keywords</span>
            </button>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button onClick={onRebuild} disabled={isLoading} className={btnClass}>
                        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        <span className="hidden sm:inline">Rebuild</span>
                    </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{ITERATION_MODE_INFO.rebuild.description}</TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button onClick={onUpdate} disabled={isLoading} className={btnClass}>
                        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
                        <span className="hidden sm:inline">Update</span>
                    </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{ITERATION_MODE_INFO.update.description}</TooltipContent>
            </Tooltip>
        </div>
    );
}
