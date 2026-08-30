'use client';

import React from 'react';
import { useLeaderboard } from '@/hooks/canvas/useLeaderboard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Trophy, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface CanvasLeaderboardProps {
    canvasId: string;
    limit?: number;
    showCurrentUserRank?: boolean;
}

export function CanvasLeaderboard({ 
    canvasId, 
    limit = 10,
    showCurrentUserRank = true 
}: CanvasLeaderboardProps) {
    const { data, isLoading } = useLeaderboard(canvasId, limit);

    if (isLoading) {
        return (
            <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        );
    }

    if (!data || data.entries.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No scores yet. Be the first to play!
            </div>
        );
    }

    const getRankColor = (rank: number) => {
        switch (rank) {
            case 1: return 'text-yellow-500';
            case 2: return 'text-gray-400';
            case 3: return 'text-orange-600';
            default: return 'text-gray-600 dark:text-gray-400';
        }
    };

    const getRankBadge = (rank: number) => `#${rank}`;

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    return (
        <div className="space-y-3">
            {data.entries.map((entry, index) => (
                <div
                    key={`${entry.username}-${entry.rank}`}
                    className={cn(
                        "flex items-center gap-3 p-3 rounded-lg transition-colors",
                        entry.is_current_user 
                            ? "bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500"
                            : "bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800",
                        index < 3 && "font-semibold"
                    )}
                >
                    {/* Rank */}
                    <div className={cn(
                        "text-xl font-bold min-w-[3rem] text-center",
                        getRankColor(entry.rank)
                    )}>
                        {getRankBadge(entry.rank)}
                    </div>

                    {/* Avatar & Name */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar className="h-10 w-10">
                            {entry.avatar_url ? (
                                <AvatarImage src={entry.avatar_url} alt={entry.display_name || entry.username} />
                            ) : null}
                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-sm">
                                {getInitials(entry.display_name || entry.username)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 dark:text-white truncate">
                                {entry.display_name || entry.username}
                                {entry.is_current_user && (
                                    <Badge variant="outline" className="ml-2 text-xs">
                                        You
                                    </Badge>
                                )}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                <span className="truncate">@{entry.username}</span>
                                {entry.time_taken && (
                                    <>
                                        <span>•</span>
                                        <Clock className="w-3 h-3" />
                                        <span>{Math.round(entry.time_taken / 1000)}s</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Score */}
                    <div className="text-right">
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">
                            {entry.score}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                        </div>
                    </div>
                </div>
            ))}

            {/* Current User Rank (if not in top N) */}
            {showCurrentUserRank && data.userRank && data.userRank > limit && (
                <div className="pt-3 border-t border-border">
                    <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                        Your rank: <span className="font-semibold">#{data.userRank}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
