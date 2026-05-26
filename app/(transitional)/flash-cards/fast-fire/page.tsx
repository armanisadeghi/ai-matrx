'use client';
import React, {useState} from 'react';
import {motion, AnimatePresence} from "motion/react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Play, Pause, Ban, Volume2, Award, Mic, Settings} from "lucide-react";
import {Progress} from "@/components/ui/progress";
import {cn} from "@/lib/utils";
import {useFastFireSession, FAST_FIRE_CONFIG, FastFireSettings} from "@/hooks/flashcard-app/useFastFireFlashcards";
import {Slider} from "@/components/ui/slider";
import {Label} from "@/components/ui/label";

const FastFirePractice = (
    {
    }) => {

    
    const fastFireHook = useFastFireSession();
    
    const {
        isActive,
        isPaused,
        isProcessing,
        isRecording,
        currentCardIndex,
        currentCard,
        results,
        audioPlayer,
        timeLeft,
        isInInitialCountdown,
        initialCountdownLeft,
        audioLevel,
        processingCount,
        settings,
        availableCardsCount,
        startSession,
        pauseSession,
        resumeSession,
        stopSession,
        playAllAudioFeedback,
        playCorrectAnswersOnly,
        playHighScoresOnly,
        totalCards,
    } = fastFireHook;

    const [isExpanded, setIsExpanded] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [tempSettings, setTempSettings] = useState<FastFireSettings>({
        secondsPerCard: FAST_FIRE_CONFIG.answerTimerSeconds,
        numberOfCards: availableCardsCount
    });

    const totalScore = results.reduce((sum, result) => sum + result.score, 0);
    const correctAnswers = results.filter((r) => r.correct).length;
    const overallPercentage = totalCards > 0 ? Math.round((totalScore / (totalCards * 6)) * 100) : 0;
    const progressPercentage = (timeLeft / FAST_FIRE_CONFIG.answerTimerSeconds) * 100;
    const audioScale = isRecording ? 1 + (audioLevel / 255) * 0.5 : 1;
    const audioOpacity = isRecording ? 0.3 + (audioLevel / 255) * 0.7 : 1;

    const handleStartWithSettings = () => {
        startSession(tempSettings);
        setShowSettings(false);
    };

    const renderSessionControls = () => {
        if (!isActive && !isPaused) {
            return (
                <>
                    <Button
                        variant="default"
                        size="sm"
                        onClick={() => setShowSettings(true)}
                        disabled={isProcessing}
                    >
                        <Play className="h-4 w-4 mr-1"/>
                        Start Session
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSettings(!showSettings)}
                        disabled={isProcessing}
                    >
                        <Settings className="h-4 w-4"/>
                    </Button>
                </>
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
                        onClick={() => stopSession(true)}
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
                    onClick={() => stopSession(true)}
                    disabled={isProcessing}
                >
                    <Ban className="h-4 w-4 mr-1"/>
                    Stop
                </Button>
            </>
        );
    };

    return (
        <div className="container mx-auto py-8 pb-[160px] space-y-8">
            <header className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Fast Fire Practice</h1>
                <div className="space-x-4">
                    <Button
                        variant="outline"
                        onClick={playAllAudioFeedback}
                        disabled={results.length === 0 || isProcessing}
                    >
                        <Play className="mr-2 h-4 w-4"/>
                        Review All
                    </Button>
                    <Button
                        variant="outline"
                        onClick={playCorrectAnswersOnly}
                        disabled={results.length === 0 || isProcessing}
                    >
                        Review Correct
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => playHighScoresOnly(4)}
                        disabled={results.length === 0 || isProcessing}
                    >
                        Review Best
                    </Button>
                </div>
            </header>

            {/* Settings Panel */}
            {showSettings && !isActive && (
                <motion.div
                    initial={{opacity: 0, y: -20}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0, y: -20}}
                >
                    <Card className="w-full max-w-2xl mx-auto mb-6">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings className="h-5 w-5"/>
                                Session Settings
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="seconds-per-card">
                                        Seconds Per Card: <span className="font-bold text-primary">{tempSettings.secondsPerCard}s</span>
                                    </Label>
                                </div>
                                <Slider
                                    id="seconds-per-card"
                                    min={3}
                                    max={30}
                                    step={1}
                                    value={[tempSettings.secondsPerCard]}
                                    onValueChange={(value) => setTempSettings(prev => ({...prev, secondsPerCard: value[0]}))}
                                    className="w-full"
                                />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>3s (Quick)</span>
                                    <span>30s (Extended)</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="number-of-cards">
                                        Number of Cards: <span className="font-bold text-primary">
                                            {tempSettings.numberOfCards === availableCardsCount 
                                                ? 'All' 
                                                : tempSettings.numberOfCards
                                            }
                                        </span>
                                    </Label>
                                </div>
                                <Slider
                                    id="number-of-cards"
                                    min={1}
                                    max={availableCardsCount}
                                    step={1}
                                    value={[tempSettings.numberOfCards]}
                                    onValueChange={(value) => setTempSettings(prev => ({...prev, numberOfCards: value[0]}))}
                                    className="w-full"
                                />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>1 card</span>
                                    <span>{availableCardsCount} cards (All)</span>
                                </div>
                                {tempSettings.numberOfCards < availableCardsCount && (
                                    <p className="text-xs text-muted-foreground italic">
                                        Cards will be randomly selected from the full set
                                    </p>
                                )}
                            </div>

                            <div className="flex gap-2 pt-4">
                                <Button
                                    variant="default"
                                    className="flex-1"
                                    onClick={handleStartWithSettings}
                                >
                                    <Play className="h-4 w-4 mr-2"/>
                                    Start with These Settings
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setShowSettings(false)}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            )}

            {/* Initial Countdown Overlay */}
            {isActive && isInInitialCountdown ? (
                <div className="flex items-center justify-center h-64">
                    <Card className="w-full max-w-2xl">
                        <CardContent className="p-12 text-center">
                            <h2 className="text-xl font-semibold mb-6 text-muted-foreground">
                                Get Ready!
                            </h2>
                            <div className="text-8xl font-bold text-primary mb-4">
                                {initialCountdownLeft}
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Starting in {initialCountdownLeft} second{initialCountdownLeft !== 1 ? 's' : ''}...
                            </p>
                        </CardContent>
                    </Card>
                </div>
            ) : !currentCard || !isActive ? (
                <div className="flex items-center justify-center h-64">
                    <Card className="w-full max-w-2xl">
                        <CardContent className="p-6 text-center">
                            <h2 className="text-2xl font-bold mb-4">Ready to Practice</h2>
                            <p className="text-muted-foreground mb-4">
                                {availableCardsCount} cards available in this set.
                            </p>
                            {results.length > 0 && (
                                <div className="mt-4 p-4 bg-muted rounded-lg">
                                    <p className="text-sm font-medium">
                                        Previous session results saved: {results.length} card{results.length !== 1 ? 's' : ''} completed
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Start a new session or review results below
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            ) : (
                 <div className="w-full max-w-2xl mx-auto">
                     <AnimatePresence mode="sync">
                         <motion.div
                             key={currentCardIndex}
                             initial={{x: 100, opacity: 0}}
                             animate={{x: 0, opacity: 1}}
                             exit={{x: -100, opacity: 0}}
                             transition={{type: "spring", stiffness: 300, damping: 30}}
                         >
                             <Card className="w-full">
                                 <CardContent className="p-6">
                                     <div className="text-sm text-muted-foreground mb-2">
                                         Card {currentCardIndex + 1} of {totalCards}
                                     </div>
                                     <div className="text-2xl font-bold text-center mb-8">
                                         {currentCard.front}
                                     </div>
                                     <div className="relative h-2 bg-secondary rounded-full overflow-hidden mb-4">
                                         <motion.div
                                             className="absolute top-0 left-0 h-full bg-primary"
                                             initial={{width: "100%"}}
                                             animate={{width: `${progressPercentage}%`}}
                                             transition={{duration: 0.1}}
                                         />
                                     </div>
                                    <div className="flex justify-center items-center gap-4">
                                        <div className="text-3xl font-bold">
                                            {timeLeft}
                                        </div>
                                        <motion.div
                                            animate={{scale: audioScale}}
                                            transition={{duration: 0.1}}
                                        >
                                            {isRecording ? (
                                                <Volume2
                                                    className="h-6 w-6 text-destructive"
                                                    style={{opacity: audioOpacity}}
                                                />
                                            ) : (
                                                 <Mic className="h-6 w-6 text-muted-foreground"/>
                                             )}
                                        </motion.div>
                                    </div>
                                    <AnimatePresence mode="sync">
                                        {isRecording && (
                                            <motion.div
                                                key="recordingPhase"
                                                initial={{opacity: 0, y: 10}}
                                                animate={{opacity: 1, y: 0}}
                                                exit={{opacity: 0, y: -10}}
                                                className="text-center mt-4 text-sm text-primary"
                                            >
                                                Recording your answer...
                                            </motion.div>
                                        )}
                                        {processingCount > 0 && (
                                            <motion.div
                                               key="processingPhase"
                                               initial={{opacity: 0, y: 10}}
                                               animate={{opacity: 1, y: 0}}
                                               exit={{opacity: 0, y: -10}}
                                               className="text-center mt-4 text-xs text-muted-foreground"
                                           >
                                               Processing {processingCount} answer{processingCount > 1 ? 's' : ''} in background...
                                           </motion.div>
                                       )}
                                   </AnimatePresence>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </AnimatePresence>
                </div>
            )}

            <AnimatePresence mode="sync">
                {audioPlayer && (
                    <motion.div
                        key="audioPlayer"
                        initial={{opacity: 0, y: 20}}
                        animate={{opacity: 1, y: 0}}
                        exit={{opacity: 0, y: -20}}
                        className="fixed bottom-4 right-4"
                    >
                        <Card className="p-4">
                            <audio controls src={audioPlayer.src}/>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

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
                                    <span>Session Progress</span>
                                    <span>{isActive ? currentCardIndex + 1 : totalCards} / {totalCards}</span>
                                </div>
                                <Progress
                                    value={totalCards > 0 && isActive ? ((currentCardIndex + 1) / totalCards) * 100 : 100}
                                    className="h-2"
                                />
                                {!isActive && results.length > 0 && (
                                    <p className="text-xs text-muted-foreground text-center">
                                        Session completed • {results.length} result{results.length !== 1 ? 's' : ''} saved
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-primary">{totalScore}</div>
                                    <div className="text-sm text-muted-foreground">Total Score</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-primary">{correctAnswers}</div>
                                    <div className="text-sm text-muted-foreground">Correct</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-primary">{overallPercentage}%</div>
                                    <div className="text-sm text-muted-foreground">Overall</div>
                                </div>
                            </div>

                            <AnimatePresence>
                                {isExpanded && (
                                    <motion.div
                                        key="resultsExpanded"
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
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={isProcessing || !results.length}
                                                onClick={() => playHighScoresOnly(4)}
                                            >
                                                Review Best
                                            </Button>
                                        </div>

                                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                            {results.map((result, idx) => (
                                                <Card key={idx} className="p-2">
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
        </div>
    );
};

export default FastFirePractice;
