'use client';

import {useState} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Play, Pause, Ban, Volume2, Award} from "lucide-react";
import {Progress} from "@/components/ui/progress";
import {cn} from "@/lib/utils";

interface FlashcardResult {
    correct: boolean;
    score: number;
    audioFeedback: string;
    timestamp: number;
    cardId: string;
}

interface FastFireAnalysisProps {
    results: FlashcardResult[];
    totalCards: number;
    isProcessing: boolean;
    startSession: () => void;
    pauseSession: () => void;
    resumeSession: () => void;
    stopSession: () => Promise<void>;
    isActive: boolean;
    isPaused: boolean;
    playAllAudioFeedback: () => void;
    playCorrectAnswersOnly: () => void;
    playHighScoresOnly: (minScore: number) => void;
    currentCardIndex: number; // Add this
}

const FastFireAnalysis = (
    {
        isActive,
        isPaused,
        isProcessing,
        currentCardIndex,
        totalCards,
        results,
        startSession,
        pauseSession,
        resumeSession,
        stopSession,
        playAllAudioFeedback,
        playCorrectAnswersOnly,
        playHighScoresOnly // Destructure this as well
    }: FastFireAnalysisProps) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const stats = {
        totalScore: results.reduce((sum, result) => sum + result.score, 0),
        maxPossibleScore: totalCards * 6,
        correctAnswers: results.filter((r) => r.correct).length,
        overallPercentage: Math.round((results.reduce((sum, r) => sum + r.score, 0) / (totalCards * 6)) * 100) || 0,
    };

    const renderSessionControls = () => {
        if (!isActive && !isPaused) {
            return (
                <Button
                    variant="default"
                    size="sm"
                    onClick={startSession}
                    disabled={isProcessing}
                >
                    <Play className="h-4 w-4 mr-1"/>
                    Start Session
                </Button>
            );
        }

        if (isActive && !isPaused) {
            return (
                <>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={pauseSession}
                        disabled={isProcessing}
                    >
                        <Pause className="h-4 w-4 mr-1"/>
                        Pause
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={stopSession}
                        disabled={isProcessing}
                    >
                        <Ban className="h-4 w-4 mr-1"/>
                        Stop
                    </Button>
                </>
            );
        }

        return (
            <>
                <Button
                    variant="default"
                    size="sm"
                    onClick={resumeSession}
                    disabled={isProcessing}
                >
                    <Play className="h-4 w-4 mr-1"/>
                    Resume
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={stopSession}
                    disabled={isProcessing}
                >
                    <Ban className="h-4 w-4 mr-1"/>
                    Stop
                </Button>
            </>
        );
    };

    const StatCard = ({value, label}: { value: number | string; label: string }) => (
        <div className="text-center">
            <div className="text-2xl font-bold text-primary">{value}</div>
            <div className="text-sm text-muted-foreground">{label}</div>
        </div>
    );

    return (
        <div className="w-full">
            <Card className="border-t border-border">
                <CardHeader className="p-4 pb-0">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                            <Award className="h-5 w-5 text-primary"/>
                            Progress & Scoring
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            {renderSessionControls()}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsExpanded(!isExpanded)}
                            >
                                {isExpanded ? 'Show Less' : 'Show More'}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-4">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span>Progress</span>
                                <span>{currentCardIndex + 1} / {totalCards}</span>
                            </div>
                            <Progress
                                value={((currentCardIndex + 1) / totalCards) * 100}
                                className="h-2"
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <StatCard value={stats.totalScore} label="Total Score"/>
                            <StatCard value={stats.correctAnswers} label="Correct"/>
                            <StatCard value={`${stats.overallPercentage}%`} label="Overall"/>
                        </div>

                        <AnimatePresence>
                            {isExpanded && (
                                <motion.div
                                    initial={{opacity: 0, height: 0}}
                                    animate={{opacity: 1, height: 'auto'}}
                                    exit={{opacity: 0, height: 0}}
                                    className="space-y-4"
                                >
                                    <div className="flex justify-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={isProcessing || !results.length}
                                            onClick={playAllAudioFeedback}
                                        >
                                            <Play className="h-4 w-4 mr-1"/>
                                            Play All
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={isProcessing || !results.length}
                                            onClick={playCorrectAnswersOnly}
                                        >
                                            <Volume2 className="h-4 w-4 mr-1"/>
                                            Correct Only
                                        </Button>
                                    </div>

                                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                        {results.map((result, idx) => (
                                            <Card key={`${result.cardId}-${idx}`} className="p-2">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <span
                                                            className={cn(
                                                                "font-semibold",
                                                                result.correct
                                                                ? "text-success"
                                                                : "text-destructive"
                                                            )}
                                                        >
                                                            Question {idx + 1}
                                                        </span>
                                                        <span className="ml-2 text-sm text-muted-foreground">
                                                            Score: {result.score}/6
                                                        </span>
                                                    </div>
                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default FastFireAnalysis;
