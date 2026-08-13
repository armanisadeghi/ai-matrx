'use client';

import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
    Trophy,
    Star,
    TrendingUp,
    Clock,
    Target,
    Award,
    Zap,
    Share2
} from 'lucide-react';
import { useCanvasScore } from '@/hooks/canvas/useCanvasScore';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
// @ts-ignore - canvas-confetti types may not be available
import confetti from 'canvas-confetti';

interface ScoreSubmissionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    canvasId: string;
    score: number;
    maxScore: number;
    timeTaken?: number; // in milliseconds
    completed: boolean;
    data?: Record<string, any>;
    onShare?: () => void;
}

export function ScoreSubmissionDialog({
    open,
    onOpenChange,
    canvasId,
    score,
    maxScore,
    timeTaken,
    completed,
    data,
    onShare
}: ScoreSubmissionDialogProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const { submitScoreAsync, scoreResult } = useCanvasScore(canvasId);
    const { toast } = useToast();

    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

    // Auto-submit on open
    useEffect(() => {
        if (open && !hasSubmitted) {
            handleSubmit();
        }
    }, [open]);

    const handleSubmit = async () => {
        if (hasSubmitted || isSubmitting) return;

        setIsSubmitting(true);
        try {
            const result = await submitScoreAsync({
                score,
                max_score: maxScore,
                time_taken: timeTaken,
                completed,
                data
            });

            setHasSubmitted(true);

            // Celebrate high scores!
            if (result.is_high_score || result.is_personal_best) {
                // Fire confetti for achievements!
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 }
                });
                
                // Extra confetti for high scores!
                if (result.is_high_score) {
                    setTimeout(() => {
                        confetti({
                            particleCount: 50,
                            angle: 60,
                            spread: 55,
                            origin: { x: 0 }
                        });
                        confetti({
                            particleCount: 50,
                            angle: 120,
                            spread: 55,
                            origin: { x: 1 }
                        });
                    }, 250);
                }
            }

            toast({
                title: 'Score Submitted!',
                description: `You ranked #${result.rank} on the leaderboard`,
            });
        } catch (err) {
            console.error('Error submitting score:', err);
            toast({
                title: 'Error',
                description: 'Failed to submit score',
                variant: 'destructive'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const getPerformanceLevel = () => {
        if (percentage >= 90) return { label: 'Outstanding!', color: 'text-yellow-500', icon: Trophy };
        if (percentage >= 75) return { label: 'Great Job!', color: 'text-green-500', icon: Star };
        if (percentage >= 60) return { label: 'Good Work!', color: 'text-blue-500', icon: Target };
        return { label: 'Keep Trying!', color: 'text-gray-500', icon: TrendingUp };
    };

    const performance = getPerformanceLevel();
    const PerformanceIcon = performance.icon;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-center text-2xl">
                        {completed ? 'Quiz Complete!' : 'Progress Saved'}
                    </DialogTitle>
                    <DialogDescription className="text-center">
                        {hasSubmitted ? 'Your score has been recorded' : 'Submitting your score...'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Main Score Display */}
                    <div className="text-center space-y-3">
                        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                            <div className="text-3xl font-bold">{percentage}%</div>
                        </div>
                        <div className={cn("text-xl font-semibold", performance.color)}>
                            <PerformanceIcon className="inline w-6 h-6 mr-2" />
                            {performance.label}
                        </div>
                    </div>

                    {/* Score Details */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 text-center">
                            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                {score}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                Your Score
                            </div>
                        </div>
                        <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 text-center">
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                {maxScore}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                Possible
                            </div>
                        </div>
                    </div>

                    {/* Time Taken */}
                    {timeTaken && (
                        <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <Clock className="w-4 h-4" />
                            <span>Completed in {Math.round(timeTaken / 1000)} seconds</span>
                        </div>
                    )}

                    {/* Results (if submitted) */}
                    {hasSubmitted && scoreResult && (
                        <div className="space-y-3">
                            {/* Rank */}
                            <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
                                <div className="flex items-center gap-2">
                                    <Trophy className="w-5 h-5 text-yellow-500" />
                                    <span className="font-medium">Your Rank</span>
                                </div>
                                <Badge variant="secondary" className="text-lg font-bold">
                                    #{scoreResult.rank}
                                </Badge>
                            </div>

                            {/* Achievements */}
                            {(scoreResult.is_high_score || scoreResult.is_personal_best) && (
                                <div className="space-y-2">
                                    {scoreResult.is_high_score && (
                                        <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300">
                                            <Award className="w-4 h-4" />
                                            <span className="text-sm font-medium">New High Score!</span>
                                        </div>
                                    )}
                                    {scoreResult.is_personal_best && (
                                        <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300">
                                            <Star className="w-4 h-4" />
                                            <span className="text-sm font-medium">Personal Best! ⭐</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* XP Earned */}
                            {scoreResult.xp_earned > 0 && (
                                <div className="flex items-center justify-between p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                        <Zap className="w-5 h-5" />
                                        <span className="font-medium">XP Earned</span>
                                    </div>
                                    <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                                        +{scoreResult.xp_earned}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Progress Bar */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                            <span>Progress</span>
                            <span>{percentage}%</span>
                        </div>
                        <Progress value={percentage} className="h-3" />
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    {onShare && (
                        <Button
                            variant="outline"
                            onClick={() => {
                                onShare();
                                onOpenChange(false);
                            }}
                            className="gap-2 w-full sm:w-auto"
                        >
                            <Share2 className="w-4 h-4" />
                            Share Result
                        </Button>
                    )}
                    <Button
                        onClick={() => onOpenChange(false)}
                        className="w-full sm:w-auto"
                    >
                        Done
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
