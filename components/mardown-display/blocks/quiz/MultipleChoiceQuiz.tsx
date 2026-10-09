import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Check,
  X,
  Trophy,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Download,
  Upload,
  RotateCcw,
  RefreshCw,
  Award,
  Star,
  ThumbsUp,
  Flame,
  Target,
  BookOpen,
  Cloud,
  CloudOff,
  Printer,
  ArrowUpRight,
} from "lucide-react";
import { quizPrinter } from "./quiz-printer";
import {
  PrintOptionsDialog,
  usePrintOptions,
} from "@ai-matrx/print/react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { useOpenArtifactInCanvas } from "@/features/canvas/hooks/useOpenArtifactInCanvas";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import { getArtifactDef } from "@/features/canvas/artifact-types/artifact-type-registry";
import { IconButton } from "@ai-matrx/design-system";
import { Tile } from "@ai-matrx/design-system/controls";
import ChatCollapsibleWrapper from "@ai-matrx/rich-content/display/blocks/ChatCollapsibleWrapper";
import type { OriginalQuestion, QuizState } from "./quiz-types";
import {
  appendNewQuestions,
  initializeQuizState,
  updateProgress,
  calculateResults,
  downloadQuizState,
  downloadQuizResults,
  uploadQuizState,
  createRetakeQuizState,
  formatTime,
  getPerformanceData,
} from "./quiz-utils";
import { useBlockState } from "@/features/block-state/useBlockState";
import { parseQuizJSON, type RawQuizJSON } from "./quiz-parser";
import { InlineLatexRenderer } from "@/features/math/components/InlineLatexRenderer";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useCanvasFit } from "@ai-matrx/rich-content/display/blocks/canvas-fit";
import { Button } from "@ai-matrx/design-system/controls";

// Legacy type for backwards compatibility
export type Question = OriginalQuestion;

interface MultipleChoiceQuizProps {
  quizData: RawQuizJSON;
  sessionId?: string;
  taskId?: string;
  artifactId?: string;
  enableAutoSave?: boolean;
  autoSaveInterval?: number;
  showCanvasButton?: boolean;
  className?: string;
  /** Owning message context used by the shared artifact renderer. */
  conversationId?: string;
  messageId?: string;
  /** Position of this block within the message content array (hint for location). */
  blockIndex?: number;
}

// Component for expandable question text
const QuestionText: React.FC<{ question: string; isFullScreen: boolean }> = ({
  question,
  isFullScreen,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Check if content is actually overflowing
    const checkOverflow = () => {
      if (textRef.current && !isExpanded && !isFullScreen) {
        const element = textRef.current;
        setIsOverflowing(element.scrollHeight > element.clientHeight);
      } else {
        setIsOverflowing(false);
      }
    };

    checkOverflow();
    // Recheck on window resize
    window.addEventListener("resize", checkOverflow);
    return () => window.removeEventListener("resize", checkOverflow);
  }, [question, isExpanded, isFullScreen]);

  if (isFullScreen) {
    return (
      <h2 className="text-lg font-bold mb-3 leading-tight">
        <InlineLatexRenderer content={question} />
      </h2>
    );
  }

  return (
    <div className="mb-3">
      <h2
        ref={textRef}
        className={`text-base font-bold leading-tight transition-all duration-200 ${
          isExpanded ? "" : "line-clamp-2"
        }`}
      >
        <InlineLatexRenderer content={question} />
      </h2>
      {isOverflowing && (
        <Button variant="quiet" icon={isExpanded ? (
            <ChevronUp />
          ) : (
            <ChevronDown />
          )} onClick={() => setIsExpanded(!isExpanded)} title={isExpanded ? "Show less" : "Show full question"} aria-label={isExpanded ? "Show less" : "Show full question"} className="mt-1" />
      )}
    </div>
  );
};

// Component for expandable explanation text
const ExplanationText: React.FC<{
  explanation: string;
  isCorrect: boolean;
  isFullScreen: boolean;
}> = ({ explanation, isCorrect, isFullScreen }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    // Check if content is actually overflowing
    const checkOverflow = () => {
      if (textRef.current && !isExpanded) {
        const element = textRef.current;
        setIsOverflowing(element.scrollHeight > element.clientHeight);
      } else {
        setIsOverflowing(false);
      }
    };

    checkOverflow();
    // Recheck on window resize
    window.addEventListener("resize", checkOverflow);
    return () => window.removeEventListener("resize", checkOverflow);
  }, [explanation, isExpanded, isFullScreen]);

  return (
    <div>
      <p
        ref={textRef}
        className={`leading-relaxed transition-all duration-200 ${
          isFullScreen ? "text-base" : "text-sm"
        } ${
          isExpanded ? "" : "line-clamp-3"
        } ${isCorrect ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
      >
        <InlineLatexRenderer content={explanation} />
      </p>
      {isOverflowing && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`mt-1 flex items-center gap-1 text-xs hover:underline transition-colors ${
            isCorrect
              ? "text-green-600 dark:text-green-500"
              : "text-red-600 dark:text-red-500"
          }`}
          title={isExpanded ? "Show less" : "Read more"}
        >
          {isExpanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
      )}
    </div>
  );
};

const MultipleChoiceQuiz: React.FC<MultipleChoiceQuizProps> = ({
  quizData,
  sessionId,
  taskId,
  artifactId,
  enableAutoSave = true,
  autoSaveInterval = 10000,
  showCanvasButton = true,
  className,
  conversationId,
  messageId,
  blockIndex,
}) => {
  // Canvas integration
  const { open: openCanvas } = useCanvas();
  const { openArtifact } = useOpenArtifactInCanvas();

  // Print integration
  const {
    open: printOpen,
    setOpen: setPrintOpen,
    triggerPrint,
  } = usePrintOptions(quizPrinter, quizData);

  // Parse quiz data and extract metadata
  const [parsedQuiz, setParsedQuiz] = useState<{
    questions: Question[];
    title: string;
    category?: string;
    contentHash: string;
  } | null>(null);

  useEffect(() => {
    const parseQuiz = async () => {
      const parsed = await parseQuizJSON(quizData);
      setParsedQuiz({
        questions: parsed.questions,
        title: parsed.title,
        category: parsed.category,
        contentHash: parsed.contentHash,
      });
    };

    parseQuiz();
  }, [quizData]);

  // Initialize quiz state with randomized questions
  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  // A narrow canvas pane: options stack one per row (the viewport `md:` split
  // cannot see the pane), the controls tighten and the result actions stack.
  // Focus mode still opens ONLY when the person asks. Outside the canvas
  // nothing changes.
  const narrowPane = useCanvasFit() === "narrow";
  const [questionStartTime, setQuestionStartTime] = useState<number>(
    Date.now(),
  );
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Initialize state when quiz is parsed — and GROW it as more questions
  // stream in (streaming partial kinds: the value only ever grows, so new
  // questions append without resetting the user's progress or reshuffling
  // anything already dealt; see appendNewQuestions).
  useEffect(() => {
    if (!parsedQuiz) return;
    setQuizState((prev) =>
      prev
        ? appendNewQuestions(prev, parsedQuiz.questions)
        : initializeQuizState(parsedQuiz.questions),
    );
  }, [parsedQuiz]);

  // The quiz session is the block's saved state (platform.block_states through the
  // ONE block-state hook) — held by the answer it is in, not by a content hash.
  // Its `results` is also what the chip's score line is derived from.
  const {
    state: savedBlock,
    loaded: savedLoaded,
    patch: saveBlock,
    saveError: blockSaveError,
  } = useBlockState<{ quizState?: QuizState; results?: QuizState["results"] | null } & Record<string, unknown>>({
    title: parsedQuiz?.title || null,
  });
  const isSaving = false;
  const lastSaved = null as Date | null;
  const saveError = blockSaveError ? blockSaveError.message : null;

  // Put the saved session back ONCE, after the quiz itself has been set up.
  // State, not a ref: the save effect must wake only AFTER the restored session has rendered,
  // never in the same pass (it would write the pre-restore session over the saved one).
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (restored || !savedLoaded || !parsedQuiz || !quizState) return;
    setRestored(true);
    const saved = savedBlock?.quizState;
    if (saved && Array.isArray(saved.randomizedQuestions) && saved.progress) {
      setQuizState(saved);
      if (saved.results) setShowResults(true);
    }
  }, [restored, savedLoaded, savedBlock, parsedQuiz, quizState]);

  // ESC key handler to exit fullscreen
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullScreen) {
        setIsFullScreen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isFullScreen]);

  // Calculate results (always call this hook)
  const results = useMemo(() => {
    if (!quizState) return null;
    if (showResults && !quizState.results) {
      return calculateResults(
        quizState.randomizedQuestions,
        quizState.progress,
      );
    }
    return quizState.results;
  }, [showResults, quizState]);

  // Every answer and the finished score are saved server-side; the chip is derived from `results`.
  useEffect(() => {
    if (!quizState || !restored) return;
    saveBlock({ quizState, results: showResults && results ? results : null });
  }, [quizState, results, showResults, saveBlock, restored]);

  // Show loading only if quiz data not parsed yet (never block for saves/duplicate checks)
  if (!parsedQuiz || !quizState) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Loading quiz...
          </p>
        </div>
      </div>
    );
  }

  const currentQuestionIndex = quizState.progress.currentQuestionIndex;
  const currentQuestion = quizState.randomizedQuestions[currentQuestionIndex];
  const selectedAnswer = quizState.progress.answers[currentQuestionIndex];
  const isAnswered = selectedAnswer !== undefined;
  const isCorrect = selectedAnswer?.isCorrect ?? false;

  const answeredCount = Object.keys(quizState.progress.answers).length;
  const correctCount = results?.correctCount ?? 0;
  const incorrectCount = results?.incorrectCount ?? 0;
  const scorePercentage = results?.scorePercentage ?? 0;

  const handleOptionClick = (optionIndex: number) => {
    if (!isAnswered) {
      const isCorrect = optionIndex === currentQuestion.correctAnswerIndex;
      const timeSpent = Math.floor((Date.now() - questionStartTime) / 1000);

      const updatedProgress = updateProgress(
        quizState.progress,
        currentQuestionIndex,
        currentQuestion.id,
        optionIndex,
        isCorrect,
        timeSpent,
      );

      setQuizState({
        ...quizState,
        progress: updatedProgress,
      });
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < quizState.randomizedQuestions.length - 1) {
      setQuizState({
        ...quizState,
        progress: {
          ...quizState.progress,
          currentQuestionIndex: currentQuestionIndex + 1,
        },
      });
      setQuestionStartTime(Date.now());
    } else {
      const finalResults = calculateResults(
        quizState.randomizedQuestions,
        quizState.progress,
      );
      setQuizState({
        ...quizState,
        results: finalResults,
      });
      setShowResults(true);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setQuizState({
        ...quizState,
        progress: {
          ...quizState.progress,
          currentQuestionIndex: currentQuestionIndex - 1,
        },
      });
      setQuestionStartTime(Date.now());
    }
  };

  const handleRetry = () => {
    const newState = initializeQuizState(parsedQuiz.questions);
    setQuizState(newState);
    setShowResults(false);
    setQuestionStartTime(Date.now());
  };

  const handleReviewAnswers = () => {
    setShowResults(false);
    setQuizState({
      ...quizState,
      progress: {
        ...quizState.progress,
        currentQuestionIndex: 0,
      },
    });
  };

  const handleRetakeMissed = () => {
    const retakeState = createRetakeQuizState(quizState);
    if (retakeState) {
      setQuizState(retakeState);
      setShowResults(false);
      setQuestionStartTime(Date.now());
    }
  };

  const handleRetakeSkipped = () => {
    // Get IDs of skipped questions (questions with no answer)
    const skippedQuestionIds = quizState.originalQuestions
      .filter((q, index) => !quizState.progress.answers[index])
      .map((q) => q.id);

    if (skippedQuestionIds.length === 0) return;

    const skippedState = initializeQuizState(
      quizState.originalQuestions,
      "retake",
      skippedQuestionIds,
    );

    setQuizState(skippedState);
    setShowResults(false);
    setQuestionStartTime(Date.now());
  };

  const handleDownloadQuiz = () => {
    downloadQuizState(quizState);
  };

  const handleDownloadResults = () => {
    if (quizState.results) {
      downloadQuizResults(quizState);
    }
  };

  const handleUploadQuiz = async () => {
    try {
      setUploadError(null);
      const importedState = await uploadQuizState();
      setQuizState(importedState);
      setShowResults(!!importedState.results);
      setQuestionStartTime(Date.now());
    } catch (error) {
      console.error("Failed to import quiz:", error);
      setUploadError(
        "Failed to import quiz state. Please check the file format.",
      );
      setTimeout(() => setUploadError(null), 5000);
    }
  };

  // Get performance icon component
  const getPerformanceIcon = (iconName: string) => {
    const iconProps = { className: "h-5 w-5" };
    switch (iconName) {
      case "target":
        return <Target {...iconProps} />;
      case "star":
        return <Star {...iconProps} />;
      case "award":
        return <Award {...iconProps} />;
      case "thumbs-up":
        return <ThumbsUp {...iconProps} />;
      case "flame":
        return <Flame {...iconProps} />;
      case "book-open":
        return <BookOpen {...iconProps} />;
      default:
        return <Trophy {...iconProps} />;
    }
  };

  const handleOpenCanvas = () => {
    const rawPayload =
      typeof quizData === "string" ? quizData : JSON.stringify(quizData);
    const def = getArtifactDef("quiz");

    if (def?.materializable && isMaterializedArtifactId(artifactId)) {
      void openArtifact({
        canvasType: "quiz",
        title: parsedQuiz?.title || "Quiz",
        content: rawPayload,
        conversationId,
        messageId,
        artifactId,
        artifactIndex: blockIndex && blockIndex > 0 ? blockIndex : 1,
      });
      return;
    }

    openCanvas({
      type: "quiz",
      data: quizData,
      metadata: {
        title: parsedQuiz?.title || "Quiz",
        sourceMessageId: sessionId,
        sourceTaskId: taskId,
      },
    });
  };

  // Shared quiz body content (used in both embedded and fullscreen views)
  const renderQuizBody = () => (
    <>
      {/* Quiz title — FULLSCREEN ONLY. Embedded, the collapsible wrapper's
          header already carries the title and question count; repeating it
          inside is the double-chrome defect (a component never renders chrome
          its host already renders). Fullscreen has no wrapper, so it owns the
          title itself. */}
      {(isFullScreen || parsedQuiz.category) && (
        <div className="mb-3">
          {isFullScreen && (
            <h1 className="text-xl font-bold text-center text-gray-800 dark:text-gray-100">
              {parsedQuiz.title}
            </h1>
          )}
          {parsedQuiz.category && (
            <div className={`text-center ${isFullScreen ? "mt-2" : ""}`}>
              <span className="text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full">
                {parsedQuiz.category}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Upload Error */}
      {uploadError && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-700 rounded-lg p-2 mb-3">
          <p className="text-xs text-red-800 dark:text-red-300 text-center flex items-center justify-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            <span>{uploadError}</span>
          </p>
          <ErrorAlchemyMenu />
        </div>
      )}

      {/* Quiz Mode Indicator */}
      {quizState.mode === "retake" && (
        <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-300 dark:border-orange-700 rounded-lg p-2 mb-3">
          <p className="text-xs text-orange-800 dark:text-orange-300 text-center flex items-center justify-center gap-1.5">
            <RefreshCw className="h-3 w-3" />
            <span>Retake Mode — Focusing on missed questions</span>
          </p>
        </div>
      )}

      {/* Question Card */}
      <div
        className={`bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-900 border border-blue-200 dark:border-gray-700 rounded-xl shadow-md mb-4 ${isFullScreen ? "p-6" : "p-4"}`}
      >
        <div className="text-gray-800 dark:text-gray-100">
          <div className="flex justify-between items-center mb-4 gap-3">
            <div
              className={`flex items-center gap-2 ${isFullScreen ? "text-base" : "text-sm"}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {currentQuestionIndex + 1} /{" "}
                  {quizState.randomizedQuestions.length}
                </span>
                {isAnswered && (
                  <CheckCircle2
                    className={`text-green-600 dark:text-green-400 ${isFullScreen ? "h-5 w-5" : "h-4 w-4"}`}
                  />
                )}
              </div>
              <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Answered:{" "}
                <span className="text-green-600 dark:text-green-400 font-semibold">
                  {answeredCount}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              {/* Save Status Indicator */}
              {enableAutoSave && (
                <div className="flex items-center gap-1 mr-2">
                  {isSaving && (
                    <div
                      className="flex items-center gap-1 text-blue-600 dark:text-blue-400 text-xs"
                      title="Saving..."
                    >
                      <Cloud className="h-4 w-4 animate-pulse" />
                    </div>
                  )}
                  {!isSaving && lastSaved && (
                    <div
                      className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs"
                      title={`Last saved: ${lastSaved.toLocaleTimeString()}`}
                    >
                      <Cloud className="h-4 w-4" />
                    </div>
                  )}
                  {saveError && (
                    <div
                      className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs"
                      title={saveError}
                    >
                      <CloudOff className="h-4 w-4" />
                      <ErrorAlchemyMenu error={saveError} />
                    </div>
                  )}
                </div>
              )}

              <IconButton
                icon={Download}
                tooltip="Download quiz as file"
                onClick={handleDownloadQuiz}
              />

              <IconButton
                icon={Upload}
                tooltip="Import quiz from file"
                onClick={handleUploadQuiz}
              />

              {isFullScreen && (
                <>
                  <IconButton
                    icon={Printer}
                    tooltip="Print quiz"
                    onClick={triggerPrint}
                  />
                  {showCanvasButton && (
                    <IconButton
                      icon={ArrowUpRight}
                      tooltip="Open in Canvas"
                      onClick={() => {
                        setIsFullScreen(false);
                        handleOpenCanvas();
                      }}
                    />
                  )}
                  <IconButton
                    icon={Minimize2}
                    tooltip="Exit focus mode"
                    onClick={() => setIsFullScreen(false)}
                  />
                </>
              )}
            </div>
          </div>
          <QuestionText
            question={currentQuestion.question}
            isFullScreen={isFullScreen}
          />
        </div>
      </div>

      {/* Options Grid */}
      <div
        className={`grid grid-cols-1 mb-4 ${narrowPane ? "gap-2" : "gap-3 md:grid-cols-2"}`}
        data-testid="quiz-options"
        data-canvas-fit={narrowPane ? "narrow" : undefined}
      >
        {currentQuestion.options.map((option, index) => {
          const isRight = isAnswered && index === currentQuestion.correctAnswerIndex;
          const isWrongPick = isAnswered && selectedAnswer?.selectedOptionIndex === index && !isCorrect;
          return (
            <Tile
              key={index}
              wrapTitle
              selected={isRight ? true : undefined}
              danger={isWrongPick}
              onClick={() => handleOptionClick(index)}
              title={<InlineLatexRenderer content={option} />}
              end={isRight ? <Check className="text-success-ink" aria-label="Correct answer" /> : isWrongPick ? <X className="text-destructive-ink" aria-label="Your answer" /> : undefined}
            />
          );
        })}
      </div>

      {/* Explanation */}
      {isAnswered && (
        <div
          className={`mb-4 rounded-lg border transition-all duration-300 ${isFullScreen ? "p-4" : "p-3"} ${
            isCorrect
              ? "bg-green-50 dark:bg-green-950/30 border-green-400 dark:border-green-600"
              : "bg-red-50 dark:bg-red-950/30 border-red-400 dark:border-red-600"
          }`}
        >
          <div
            className={`font-semibold mb-2 flex items-center gap-2 text-base ${isCorrect ? "text-green-800 dark:text-green-300" : "text-red-800 dark:text-red-300"}`}
          >
            {isCorrect ? (
              <>
                <CheckCircle2
                  className={isFullScreen ? "h-6 w-6" : "h-5 w-5"}
                />
                <span>Correct!</span>
              </>
            ) : (
              <>
                <XCircle className={isFullScreen ? "h-6 w-6" : "h-5 w-5"} />
                <span>Incorrect</span>
              </>
            )}
          </div>
          <ExplanationText
            explanation={currentQuestion.explanation}
            isCorrect={isCorrect}
            isFullScreen={isFullScreen}
          />
        </div>
      )}
    </>
  );

  // Navigation buttons (shared)
  const renderNavButtons = () => (
    <div className={`flex justify-between items-center ${narrowPane ? "gap-2" : "gap-3"}`}>
      <button
        onClick={handlePrevious}
        disabled={currentQuestionIndex === 0}
        className={`rounded-lg font-semibold transition-all duration-200 flex-1 ${isFullScreen ? "px-4 py-3 text-base" : narrowPane ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"} ${
          currentQuestionIndex === 0
            ? "bg-gray-400 dark:bg-gray-700 cursor-not-allowed text-gray-200 dark:text-gray-500"
            : "bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white shadow-sm hover:shadow-md transform hover:scale-105"
        }`}
      >
        ← Previous
      </button>

      {currentQuestionIndex === quizState.randomizedQuestions.length - 1 ? (
        <button
          onClick={handleNext}
          className={`rounded-lg font-semibold bg-green-500 dark:bg-green-600 hover:bg-green-600 dark:hover:bg-green-700 text-white shadow-sm hover:shadow-md transform hover:scale-105 transition-all duration-200 flex-1 ${isFullScreen ? "px-4 py-3 text-base" : narrowPane ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
        >
          View Results →
        </button>
      ) : (
        <button
          onClick={handleNext}
          className={`rounded-lg font-semibold bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white shadow-sm hover:shadow-md transform hover:scale-105 transition-all duration-200 flex-1 ${isFullScreen ? "px-4 py-3 text-base" : narrowPane ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
        >
          Next →
        </button>
      )}
    </div>
  );

  // Results screen content
  const renderResults = () => {
    if (!results) return null;
    const performanceData = getPerformanceData(scorePercentage);
    const hasIncorrectAnswers = incorrectCount > 0;
    const hasSkippedQuestions = results.skippedCount > 0;

    return (
      <div className="w-full py-3">
        <div className="max-w-2xl mx-auto">
          <div className="bg-textured rounded-xl p-4 shadow-lg border-border">
            <div className="text-center mb-4">
              <div className="flex items-center justify-center gap-2 mb-3">
                <Trophy className="h-6 w-6 text-yellow-500 dark:text-yellow-400" />
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                  {quizState.mode === "retake"
                    ? "Retake Complete!"
                    : "Quiz Complete!"}
                </h2>
              </div>
              <div className="flex items-center justify-center gap-2 mb-2">
                {getPerformanceIcon(performanceData.icon)}
                <p className="text-base font-medium text-gray-700 dark:text-gray-300">
                  {performanceData.message}
                </p>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Time taken: {formatTime(results.totalTimeSpent)}
              </p>
            </div>

            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-md">
                  <div className="w-16 h-16 rounded-full bg-textured flex flex-col items-center justify-center">
                    <span className="text-base font-bold text-gray-800 dark:text-gray-100">
                      {scorePercentage}%
                    </span>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      Score
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2 text-center border border-blue-200 dark:border-blue-800">
                <div className="text-base font-bold text-blue-600 dark:text-blue-400">
                  {results.totalQuestions}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Total
                </div>
              </div>
              <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-2 text-center border border-green-200 dark:border-green-800">
                <div className="text-base font-bold text-green-600 dark:text-green-400">
                  {correctCount}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Correct
                </div>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2 text-center border border-red-200 dark:border-red-800">
                <div className="text-base font-bold text-red-600 dark:text-red-400">
                  {incorrectCount}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Incorrect
                </div>
              </div>
            </div>

            {results.skippedCount > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-800 rounded-lg p-2 mb-3">
                <p className="text-xs text-yellow-800 dark:text-yellow-300 text-center flex items-center justify-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" />
                  <span>
                    You skipped {results.skippedCount} question
                    {results.skippedCount !== 1 ? "s" : ""}
                  </span>
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className={`flex flex-col gap-2 ${narrowPane ? "" : "sm:flex-row"}`}>
                <Button variant="quiet" onClick={handleReviewAnswers}>
                  Review Answers
                </Button>
                <Button variant="quiet" icon={<RotateCcw />} onClick={handleRetry}>
                  Retry Quiz
                </Button>
              </div>

              {quizState.mode !== "retake" &&
                (hasIncorrectAnswers || hasSkippedQuestions) && (
                  <div className={`flex flex-col gap-2 ${narrowPane ? "" : "sm:flex-row"}`}>
                    {hasIncorrectAnswers && (
                      <Button variant="quiet" icon={<RefreshCw />} onClick={handleRetakeMissed}>
                        Retake Missed ({incorrectCount})
                      </Button>
                    )}
                    {hasSkippedQuestions && (
                      <Button variant="quiet" icon={<RefreshCw />} onClick={handleRetakeSkipped}>
                        Retake Skipped ({results.skippedCount})
                      </Button>
                    )}
                  </div>
                )}

              <div className={`flex flex-col gap-2 pt-2 border-t border-border ${narrowPane ? "" : "sm:flex-row"}`}>
                <Button variant="quiet" icon={<Download />} onClick={handleDownloadQuiz}>
                  Download Progress
                </Button>
                <Button variant="quiet" icon={<Download />} onClick={handleDownloadResults}>
                  Download Results
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Collapsible header controls (for embedded view)
  const headerControls = (
    <>
      {enableAutoSave && (
        <div className="flex items-center gap-1 px-[3px]">
          {isSaving && (
            <div title="Saving..." className="text-blue-600 dark:text-blue-400">
              <Cloud className="h-3.5 w-3.5 animate-pulse" />
            </div>
          )}
          {!isSaving && lastSaved && (
            <div
              title={`Last saved: ${lastSaved.toLocaleTimeString()}`}
              className="text-green-600 dark:text-green-400"
            >
              <Cloud className="h-3.5 w-3.5" />
            </div>
          )}
          {saveError && (
            <div title={saveError} className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <CloudOff className="h-3.5 w-3.5" />
              <ErrorAlchemyMenu error={saveError} />
            </div>
          )}
        </div>
      )}
      <Button
        variant="quiet"
        icon={<Printer />}
        aria-label="Print quiz"
        title="Print quiz"
        onClick={(e) => {
          e.stopPropagation();
          triggerPrint();
        }}
      />
      {showCanvasButton && (
        <Button
          variant="quiet"
          icon={<ArrowUpRight />}
          aria-label="Open in Canvas"
          title="Open in Canvas"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenCanvas();
          }}
        />
      )}
      <Button
        variant="quiet"
        icon={<Maximize2 />}
        aria-label="Focus mode"
        title="Focus mode"
        onClick={(e) => {
          e.stopPropagation();
          setIsFullScreen(true);
        }}
      />
    </>
  );

  const questionCount = parsedQuiz.questions.length;

  return (
    <>
      {/* Fullscreen overlay */}
      {isFullScreen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm cursor-pointer"
            onClick={() => setIsFullScreen(false)}
            role="button"
            aria-label="Close fullscreen mode"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="bg-textured rounded-xl shadow-2xl h-full max-h-[98dvh] w-full max-w-4xl mx-3 flex flex-col overflow-hidden relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-1 overflow-y-auto p-3">
                {showResults && results ? renderResults() : renderQuizBody()}
              </div>
              {!showResults && (
                <div className="flex-shrink-0 p-4 border-t border-border bg-textured">
                  {renderNavButtons()}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Embedded collapsible view */}
      <ChatCollapsibleWrapper
        className={className}
        icon={<BookOpen className="h-4 w-4 text-primary" />}
        title={
          <span className="text-sm font-medium">
            {parsedQuiz.title}
            <span className="ml-2 text-xs text-muted-foreground">
              {/* read-gate-exempt: question count of quiz content parsed locally from this block's own data, not a network read */}
              ({questionCount} {questionCount === 1 ? "question" : "questions"})
            </span>
          </span>
        }
        controls={headerControls}
        initialOpen={true}
      >
        <div className={narrowPane ? "p-2" : "p-3"}>
          {showResults && results ? (
            renderResults()
          ) : (
            <>
              {renderQuizBody()}
              <div className="mt-2">{renderNavButtons()}</div>
              {/* No bottom action bar: Print / Canvas / Focus all live in the
                  wrapper header's controls. Rendering them twice was the same
                  double-chrome waste as the repeated title. */}
            </>
          )}
        </div>
      </ChatCollapsibleWrapper>

      <PrintOptionsDialog
        printer={quizPrinter}
        data={quizData}
        open={printOpen}
        onOpenChange={setPrintOpen}
      />
    </>
  );
};

export default MultipleChoiceQuiz;
