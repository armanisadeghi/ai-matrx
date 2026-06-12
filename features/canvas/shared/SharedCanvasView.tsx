'use client';

import React, { useState } from 'react';
import { useSharedCanvas } from '@/hooks/canvas/useSharedCanvas';
import { CanvasSocialActions } from '../social/CanvasSocialActions';
import { PublicCanvasRenderer } from './PublicCanvasRenderer';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { 
    ChevronDown,
    ChevronUp,
    Trophy,
    Loader2,
    AlertCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { CanvasLeaderboard } from '../leaderboard/CanvasLeaderboard';
import { cn } from '@/lib/utils';

interface SharedCanvasViewProps {
    shareToken: string;
    className?: string;
}

export function SharedCanvasView({ shareToken, className = "h-[calc(100dvh-3.5rem)]" }: SharedCanvasViewProps) {
    const { data: canvas, isLoading, error } = useSharedCanvas(shareToken);
    const [showDetails, setShowDetails] = useState(false);

    // Page title + OG tags are handled server-side via generateMetadata in page.tsx.
    // No client-side document manipulation needed.

    if (isLoading) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
                <div className="text-center space-y-4">
                    <Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-600 dark:text-blue-400" />
                    <p className="text-zinc-600 dark:text-zinc-400">Loading canvas...</p>
                </div>
            </div>
        );
    }

    if (error || !canvas) {
        return (
            <div className="min-h-dvh flex items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950">
                <div className="text-center max-w-md">
                    <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-200 dark:border-zinc-700">
                        <AlertCircle className="w-8 h-8 text-zinc-600 dark:text-zinc-400" />
                    </div>
                    <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                        Canvas Not Found
                    </h1>
                    <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                        This canvas doesn't exist or has been made private.
                    </p>
                    <Button asChild className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white">
                        <Link href="/">Go Home</Link>
                    </Button>
                </div>
            </div>
        );
    }

    const getInitials = (name: string | null) => {
        if (!name) return '?';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    return (
        <div className={cn(className, "flex flex-col overflow-hidden")}>
            {/* Canvas Title Bar - Minimal & Professional */}
            <div className="flex-shrink-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2">
                <div className="flex items-center justify-between gap-4">
                    {/* Title & Type */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                        <h1 className="text-base md:text-lg font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {canvas.title}
                        </h1>
                        <Badge variant="outline" className="capitalize flex-shrink-0 text-[10px] px-1.5 py-0.5">
                            {canvas.canvas_type.replace('-', ' ')}
                        </Badge>
                        {canvas.has_scoring && (
                            <Badge variant="secondary" className="flex-shrink-0 text-[10px] px-1.5 py-0.5">
                                <Trophy className="w-3 h-3 mr-0.5" />
                                Scored
                            </Badge>
                        )}
                    </div>

                    {/* Social Actions */}
                    <CanvasSocialActions
                        canvasId={canvas.id}
                        shareToken={canvas.share_token}
                        likeCount={canvas.like_count}
                        commentCount={canvas.comment_count}
                        viewCount={canvas.view_count}
                        shareCount={canvas.share_count}
                        forkCount={canvas.fork_count}
                        className="flex-shrink-0"
                    />
                </div>
            </div>

            {/* Canvas - Full Height */}
            <div className="flex-1 overflow-hidden bg-zinc-50 dark:bg-zinc-950">
                <PublicCanvasRenderer 
                    content={{
                        type: canvas.canvas_type,
                        data: canvas.canvas_data,
                        metadata: {
                            title: canvas.title,
                            description: canvas.description
                        }
                    }} 
                />
            </div>

            {/* Collapsible Bottom Info Panel - Professional */}
            <div className={cn(
                "flex-shrink-0 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 transition-all duration-300",
                showDetails ? "max-h-96" : "max-h-12"
            )}>
                {/* Toggle Button - Compact */}
                <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="w-full px-4 py-2 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors group"
                >
                    <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7 ring-1 ring-zinc-200 dark:ring-zinc-700">
                            <AvatarFallback className="bg-blue-600 text-white text-[10px]">
                                {getInitials(canvas.creator_display_name)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="text-left">
                            <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                                {canvas.creator_display_name || 'Anonymous'}
                            </div>
                            <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                                {formatDistanceToNow(new Date(canvas.created_at), { addSuffix: true })}
                            </div>
                        </div>
                        {canvas.description && !showDetails && (
                            <span className="hidden md:block text-xs text-zinc-500 dark:text-zinc-400 max-w-md truncate ml-4">
                                {canvas.description}
                            </span>
                        )}
                    </div>
                    {showDetails ? (
                        <ChevronDown className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
                    ) : (
                        <ChevronUp className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
                    )}
                </button>

                {/* Expanded Details - Professional */}
                {showDetails && (
                    <div className="px-4 pb-3 overflow-y-auto max-h-80">
                        {canvas.description && (
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                                {canvas.description}
                            </p>
                        )}
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Stats - Professional Grid */}
                            <div className="space-y-3">
                                <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                    Statistics
                                </h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-2.5 border border-zinc-200 dark:border-zinc-700">
                                        <div className="text-[10px] text-zinc-600 dark:text-zinc-400 font-medium">Views</div>
                                        <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{canvas.view_count.toLocaleString()}</div>
                                    </div>
                                    <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-2.5 border border-zinc-200 dark:border-zinc-700">
                                        <div className="text-[10px] text-zinc-600 dark:text-zinc-400 font-medium">Likes</div>
                                        <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{canvas.like_count.toLocaleString()}</div>
                                    </div>
                                    {canvas.has_scoring && (
                                        <>
                                            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2.5 border border-blue-200 dark:border-blue-900">
                                                <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">High Score</div>
                                                <div className="text-base font-semibold text-blue-700 dark:text-blue-300">
                                                    {canvas.high_score || 0}
                                                </div>
                                            </div>
                                            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-2.5 border border-zinc-200 dark:border-zinc-700">
                                                <div className="text-[10px] text-zinc-600 dark:text-zinc-400 font-medium">Attempts</div>
                                                <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{canvas.total_attempts}</div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Leaderboard - Professional */}
                            {canvas.has_scoring && (
                                <div className="space-y-3">
                                    <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                                        <Trophy className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                        Leaderboard
                                    </h3>
                                    <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-2 border border-zinc-200 dark:border-zinc-700 max-h-48 overflow-y-auto">
                                        <CanvasLeaderboard canvasId={canvas.id} />
                                    </div>
                                </div>
                            )}

                            {/* Tags */}
                            {canvas.tags && canvas.tags.length > 0 && (
                                <div className="space-y-2 md:col-span-2">
                                    <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        Tags
                                    </h3>
                                    <div className="flex flex-wrap gap-1">
                                        {canvas.tags.map(tag => (
                                            <Badge 
                                                key={tag} 
                                                variant="secondary" 
                                                className="text-[10px] px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                                            >
                                                #{tag}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

