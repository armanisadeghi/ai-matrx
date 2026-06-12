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
  Save,
  Cloud,
  CloudOff,
  ExternalLink,
  Printer,
} from "lucide-react";
import { quizPrinter } from "./quiz-printer";
import {
  PrintOptionsDialog,
  usePrintOptions,
} from "@/features/chat/components/print/PrintOptionsDialog";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import IconButton from "@/components/official/IconButton";
import ChatCollapsibleWrapper from "@/components/mardown-display/blocks/ChatCollapsibleWrapper";
import { Button } from "@/components/ui/button";
import type { OriginalQuestion, QuizState } from "./quiz-types";
import {
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
import { useQuizPersistence } from "@/hooks/useQuizPersistence";
import { parseQuizJSON, type RawQuizJSON } from "./quiz-parser";
import { InlineLatexRenderer } from "@/features/math/components/InlineLatexRenderer";
import { useMessageBlockPersistence } from "@/features/agents/hooks/message-crud/useMessageBlockPersistence";

// Legacy type for backwards compatibility
export type Question = OriginalQuestion;

interface MultipleChoiceQuizProps {
  quizData: RawQuizJSON;
  sessionId?: string;
  taskId?: string;
  enableAutoSave?: boolean;
  autoSaveInterval?: number;
  showCanvasButton?: boolean;
  className?: string;
  /**
   * When `conversationId` + `messageId` are present, the quiz also persists
   * its state back into the owning `cx_message.content` via
   * `useMessageBlockPersistence`. This is what makes the agent "see" the
   * user's progress — the next turn's conversation history reflects the
   * current answers + score. Independent from `useQuizPersistence` which
   * saves to a quiz-session DB table.
   */
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
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-1 flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          title={isExpanded ? "Show less" : "Show full question"}
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
  const [questionStartTime, setQuestionStartTime] = useState<number>(
    Date.now(),
  );
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Initialize state when quiz is parsed
  useEffect(() => {
    if (parsedQuiz && !quizState) {
      setQuizState(initializeQuizState(parsedQuiz.questions));
    }
  }, [parsedQuiz, quizState]);

  // Database persistence (always call hooks)
  const {
    sessionId: dbSessionId,
    isSaving,
    lastSaved,
    saveError,
    isLoading: isLoadingSession,
    loadedSession,
    saveNow,
  } = useQuizPersistence(quizState || initializeQuizState([]), {
    autoSave: enableAutoSave && !!quizState,
    autoSaveInterval,
    sessionId,
    title: parsedQuiz?.title || "",
    category: parsedQuiz?.category,
    contentHash: parsedQuiz?.contentHash,
    metadata: {}, // Empty for now - reserved for future custom metadata
  });

  // Load session data if available
  useEffect(() => {
    if (loadedSession && loadedSession.state) {
      setQuizState(loadedSession.state);
      if (loadedSession.state.results) {
        setShowResults(true);
      }
    }
  }, [loadedSession]);

  // ── Message-level persistence ────────────────────────────────────────────
  //
  // When this quiz is inside an assistant message (conversationId + messageId
  // present), persist the quiz state back into the owning cx_message.content.
  // The assistant's conversation history thereby reflects the user's current
  // progress — next turn, the model sees the answers and can respond to them.
  // Separate from `useQuizPersistence` above, which saves to a dedicated
  // quiz-session table for standalone runs.
  const { blockState, patchBlock } = useMessageBlockPersistence({
    conversationId,
    messageId,
    blockType: "quiz",
    indexHint: blockIndex,
  });

  // Rehydrate quiz state from the message's persisted block on first load.
  // Only fires when there's persisted state — the initial quiz parse from
  // quizData remains the source of truth for the question set.
  useEffect(() => {
    if (!blockState?._matrxState) return;
    const saved = blockState._matrxState as {
      quizState?: QuizState;
      showResults?: boolean;
    };
    if (saved.quizState && !quizState) {
      setQuizState(saved.quizState);
      if (saved.showResults) setShowResults(true);
    }
    // Intentionally runs only when the persisted blockState arrives; avoid
    // dependency on `quizState` (which would loop the effect on every answer).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockState?._matrxBlockId]);

  // Debounced write-back — coalesce rapid answer clicks into one round-trip.
  // 750ms matches the user's "perceptible but not intrusive" threshold.
  const lastPersistedRef = useRef<string>("");
  useEffect(() => {
    if (!conversationId || !messageId || !quizState) return;
    // Serialize for cheap identity check — avoids a write when nothing changed.
    const snapshot = JSON.stringify({ quizState, showResults });
    if (snapshot === lastPersistedRef.current) return;
    const timer = setTimeout(() => {
      lastPersistedRef.current = snapshot;
      void patchBlock({
        _matrxState: { quizState, showResults },
      });
    }, 750);
    return () => clearTimeout(timer);
  }, [quizState, showResults, conversationId, messageId, patchBlock]);

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

  const getOptionStyle = (optionIndex: number) => {
    const baseStyle = `rounded-lg border cursor-pointer transition-all duration-200 text-left ${
      isFullScreen ? "p-4 text-base" : "p-3 text-base"
    }`;

    if (!isAnswered) {
      return `${baseStyle} bg-textured border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30`;
    } else {
      // After answer selected
      if (optionIndex === currentQuestion.correctAnswerIndex) {
        return `${baseStyle} bg-green-100 dark:bg-green-950/40 border-green-400 dark:border-green-600 shadow-sm`;
      }
      if (selectedAnswer?.selectedOptionIndex === optionIndex && !isCorrect) {
        return `${baseStyle} bg-red-100 dark:bg-red-950/40 border-red-400 dark:border-red-600 shadow-sm`;
      }
      return `${baseStyle} bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60`;
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
      {/* Quiz Title */}
      <div className="mb-3">
        <h1
          className={`font-bold text-center text-gray-800 dark:text-gray-100 ${isFullScreen ? "text-xl" : "text-lg"}`}
        >
          {parsedQuiz.title}
        </h1>
        {parsedQuiz.category && (
          <div className="text-center mt-2">
            <span className="text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full">
              {parsedQuiz.category}
            </span>
          </div>
        )}
      </div>

      {/* Upload Error */}
      {uploadError && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-700 rounded-lg p-2 mb-3">
          <p className="text-xs text-red-800 dark:text-red-300 text-center flex items-center justify-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            <span>{uploadError}</span>
          </p>
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
                    </div>
                  )}
                </div>
              )}

              {enableAutoSave && (
                <IconButton
                  icon={Save}
                  tooltip="Save now"
                  onClick={saveNow}
                  disabled={isSaving}
                  size="md"
                  className="bg-green-500 dark:bg-green-600 text-white hover:bg-green-600 dark:hover:bg-green-700"
                />
              )}

              <IconButton
                icon={Download}
                tooltip="Download quiz as file"
                onClick={handleDownloadQuiz}
                size="md"
                className="bg-gray-500 dark:bg-gray-600 text-white hover:bg-gray-600 dark:hover:bg-gray-700"
              />

              <IconButton
                icon={Upload}
                tooltip="Import quiz from file"
                onClick={handleUploadQuiz}
                size="md"
                className="bg-gray-500 dark:bg-gray-600 text-white hover:bg-gray-600 dark:hover:bg-gray-700"
              />

              {isFullScreen && (
                <>
                  <IconButton
                    icon={Printer}
                    tooltip="Print quiz"
                    onClick={triggerPrint}
                    size="md"
                    className="bg-slate-500 dark:bg-slate-600 text-white hover:bg-slate-600 dark:hover:bg-slate-700"
                  />
                  {showCanvasButton && (
                    <IconButton
                      icon={ExternalLink}
                      tooltip="Open in Canvas"
                      onClick={() => {
                        setIsFullScreen(false);
                        handleOpenCanvas();
                      }}
                      size="md"
                      className="bg-purple-500 dark:bg-purple-600 text-white hover:bg-purple-600 dark:hover:bg-purple-700"
                    />
                  )}
                  <IconButton
                    icon={Minimize2}
                    tooltip="Exit focus mode"
                    onClick={() => setIsFullScreen(false)}
                    size="md"
                    className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {currentQuestion.options.map((option, index) => (
          <div
            key={index}
            onClick={() => handleOptionClick(index)}
            className={getOptionStyle(index)}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-gray-800 dark:text-gray-200 flex-1 leading-snug">
                <InlineLatexRenderer content={option} />
              </span>
              {isAnswered && index === currentQuestion.correctAnswerIndex && (
                <Check
                  className={`text-green-600 dark:text-green-400 flex-shrink-0 ${isFullScreen ? "h-6 w-6" : "h-5 w-5"}`}
                />
              )}
              {isAnswered &&
                selectedAnswer?.selectedOptionIndex === index &&
                !isCorrect && (
                  <X
                    className={`text-red-600 dark:text-red-400 flex-shrink-0 ${isFullScreen ? "h-6 w-6" : "h-5 w-5"}`}
                  />
                )}
            </div>
          </div>
        ))}
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
    <div className="flex justify-between items-center gap-3">
      <button
        onClick={handlePrevious}
        disabled={currentQuestionIndex === 0}
        className={`rounded-lg font-semibold transition-all duration-200 flex-1 ${isFullScreen ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"} ${
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
          className={`rounded-lg font-semibold bg-green-500 dark:bg-green-600 hover:bg-green-600 dark:hover:bg-green-700 text-white shadow-sm hover:shadow-md transform hover:scale-105 transition-all duration-200 flex-1 ${isFullScreen ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"}`}
        >
          View Results →
        </button>
      ) : (
        <button
          onClick={handleNext}
          className={`rounded-lg font-semibold bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white shadow-sm hover:shadow-md transform hover:scale-105 transition-all duration-200 flex-1 ${isFullScreen ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"}`}
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
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleReviewAnswers}
                  className="flex-1 px-3 py-2 rounded-lg font-semibold text-sm bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white shadow-sm hover:shadow-md transform hover:scale-105 transition-all duration-200"
                >
                  Review Answers
                </button>
                <button
                  onClick={handleRetry}
                  className="flex-1 px-3 py-2 rounded-lg font-semibold text-sm bg-purple-500 dark:bg-purple-600 hover:bg-purple-600 dark:hover:bg-purple-700 text-white shadow-sm hover:shadow-md transform hover:scale-105 transition-all duration-200 flex items-center justify-center gap-1"
                >
                  <RotateCcw className="h-4 w-4" />
                  Retry Quiz
                </button>
              </div>

              {quizState.mode !== "retake" &&
                (hasIncorrectAnswers || hasSkippedQuestions) && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    {hasIncorrectAnswers && (
                      <button
                        onClick={handleRetakeMissed}
                        className="flex-1 px-3 py-2 rounded-lg font-semibold text-sm bg-orange-500 dark:bg-orange-600 hover:bg-orange-600 dark:hover:bg-orange-700 text-white shadow-sm hover:shadow-md transform hover:scale-105 transition-all duration-200 flex items-center justify-center gap-1"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Retake Missed ({incorrectCount})
                      </button>
                    )}
                    {hasSkippedQuestions && (
                      <button
                        onClick={handleRetakeSkipped}
                        className="flex-1 px-3 py-2 rounded-lg font-semibold text-sm bg-yellow-500 dark:bg-yellow-600 hover:bg-yellow-600 dark:hover:bg-yellow-700 text-white shadow-sm hover:shadow-md transform hover:scale-105 transition-all duration-200 flex items-center justify-center gap-1"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Retake Skipped ({results.skippedCount})
                      </button>
                    )}
                  </div>
                )}

              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
                <button
                  onClick={handleDownloadQuiz}
                  className="flex-1 px-3 py-2 rounded-lg font-semibold text-sm bg-gray-600 dark:bg-gray-700 hover:bg-gray-700 dark:hover:bg-gray-600 text-white shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-1"
                >
                  <Download className="h-4 w-4" />
                  Download Progress
                </button>
                <button
                  onClick={handleDownloadResults}
                  className="flex-1 px-3 py-2 rounded-lg font-semibold text-sm bg-gray-600 dark:bg-gray-700 hover:bg-gray-700 dark:hover:bg-gray-600 text-white shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-1"
                >
                  <Download className="h-4 w-4" />
                  Download Results
                </button>
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
        <div className="flex items-center gap-1">
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
            <div title={saveError} className="text-red-600 dark:text-red-400">
              <CloudOff className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          triggerPrint();
        }}
        title="Print quiz"
      >
        <Printer className="h-3.5 w-3.5" />
      </Button>
      {showCanvasButton && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 bg-purple-500 dark:bg-purple-600 hover:bg-purple-600 dark:hover:bg-purple-700 text-white"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenCanvas();
          }}
          title="Open in Canvas"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={(e) => {
          e.stopPropagation();
          setIsFullScreen(true);
        }}
        title="Focus mode"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </Button>
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
              ({questionCount} {questionCount === 1 ? "question" : "questions"})
            </span>
          </span>
        }
        controls={headerControls}
        initialOpen={true}
      >
        <div className="p-3">
          {showResults && results ? (
            renderResults()
          ) : (
            <>
              {renderQuizBody()}
              <div className="mt-2">{renderNavButtons()}</div>
              {/* Bottom action bar */}
              <div className="flex justify-center items-center gap-3 pb-2 pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={triggerPrint}
                >
                  <Printer className="h-3 w-3" />
                  Print
                </Button>
                {showCanvasButton && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs bg-purple-500 dark:bg-purple-600 hover:bg-purple-600 dark:hover:bg-purple-700 text-white"
                    onClick={handleOpenCanvas}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Canvas
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setIsFullScreen(true)}
                >
                  <Maximize2 className="h-3 w-3" />
                  Focus
                </Button>
              </div>
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
