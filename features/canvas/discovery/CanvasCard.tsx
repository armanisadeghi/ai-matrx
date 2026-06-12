'use client';

import React from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    Heart, 
    Eye, 
    Trophy, 
    MessageCircle,
    Play
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { SharedCanvasItem } from '@/types/canvas-social';
import { getCanvasBlockMeta } from '@/features/canvas/canvas-block-meta';
import { cn } from '@/lib/utils';

interface CanvasCardProps {
    canvas: SharedCanvasItem;
}

/** Type icon driven by the canonical canvas-block-meta iconPaths (Lucide). */
function CanvasTypeIcon({ type }: { type: string }) {
    const meta = getCanvasBlockMeta(type);
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-14 w-14 text-white/90 drop-shadow-lg"
            aria-hidden="true"
        >
            {meta.iconPaths.map((d) => (
                <path key={d} d={d} />
            ))}
        </svg>
    );
}

export function CanvasCard({ canvas }: CanvasCardProps) {
    const getInitials = (name: string | null) => {
        if (!name) return '?';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const getTypeGradient = (type: string) => {
        const gradients: Record<string, string> = {
            quiz: 'from-blue-500 to-cyan-500',
            flashcards: 'from-purple-500 to-pink-500',
            presentation: 'from-orange-500 to-red-500',
            diagram: 'from-green-500 to-teal-500',
            mermaid: 'from-rose-500 to-pink-500',
            timeline: 'from-indigo-500 to-purple-500',
            research: 'from-yellow-500 to-orange-500',
            troubleshooting: 'from-red-500 to-pink-500',
            'decision-tree': 'from-emerald-500 to-green-500',
            resources: 'from-blue-500 to-indigo-500',
            progress: 'from-cyan-500 to-blue-500',
            html: 'from-gray-500 to-slate-500',
            code: 'from-violet-500 to-purple-500'
        };
        return gradients[type] || 'from-gray-500 to-slate-500';
    };

    return (
        <Card className="group hover:shadow-xl transition-all duration-300 flex flex-col h-full overflow-hidden">
            {/* Thumbnail/Header */}
            <div className={cn(
                "relative h-32 bg-gradient-to-br",
                getTypeGradient(canvas.canvas_type),
                "flex items-center justify-center"
            )}>
                <CanvasTypeIcon type={canvas.canvas_type} />
                
                {/* Hover Overlay */}
                <Link 
                    href={`/canvas/shared/${canvas.share_token}`}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                    <Button size="lg" className="gap-2">
                        <Play className="w-5 h-5" />
                        View Canvas
                    </Button>
                </Link>

                {/* Type Badge */}
                <Badge 
                    variant="secondary" 
                    className="absolute top-2 right-2 capitalize bg-white/90 dark:bg-gray-900/90"
                >
                    {canvas.canvas_type.replace('-', ' ')}
                </Badge>
            </div>

            <CardHeader className="flex-1">
                <h3 className="font-semibold text-lg line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    <Link href={`/canvas/shared/${canvas.share_token}`}>
                        {canvas.title}
                    </Link>
                </h3>
                {canvas.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mt-2">
                        {canvas.description}
                    </p>
                )}
                
                {/* Tags */}
                {canvas.tags && canvas.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                        {canvas.tags.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="outline" className="text-xs">
                                #{tag}
                            </Badge>
                        ))}
                        {canvas.tags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                                +{canvas.tags.length - 3}
                            </Badge>
                        )}
                    </div>
                )}
            </CardHeader>

            <CardContent className="pt-0">
                {/* Stats */}
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                        <Heart className="w-4 h-4" />
                        <span>{canvas.like_count}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Eye className="w-4 h-4" />
                        <span>{canvas.view_count}</span>
                    </div>
                    {canvas.has_scoring && canvas.high_score > 0 && (
                        <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                            <Trophy className="w-4 h-4" />
                            <span>{canvas.high_score}</span>
                        </div>
                    )}
                </div>
            </CardContent>

            <CardFooter className="border-t border-border pt-4">
                {/* Creator Info */}
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs">
                                {getInitials(canvas.creator_display_name)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {canvas.creator_display_name || 'Anonymous'}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                {formatDistanceToNow(new Date(canvas.created_at), { addSuffix: true })}
                            </div>
                        </div>
                    </div>
                </div>
            </CardFooter>
        </Card>
    );
}

