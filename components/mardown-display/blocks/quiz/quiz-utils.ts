/**
 * Quiz Utility Functions
 * Handles answer randomization, state management, and export/import functionality
 */

import type {
  OriginalQuestion,
  RandomizedQuestion,
  QuizState,
  QuizProgress,
  QuizResults,
  QuizExport,
  QuizResultsExport,
  QuizAnswer
} from './quiz-types';

const EXPORT_VERSION = '1.0.0';

/**
 * Fisher-Yates shuffle algorithm for true randomization
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Randomizes question options while maintaining correct answer tracking
 */
export function randomizeQuestion(question: OriginalQuestion): RandomizedQuestion {
  const optionsWithIndices = question.options.map((option, index) => ({
    option,
    originalIndex: index
  }));

  const shuffled = shuffleArray(optionsWithIndices);
  
  const shuffleMap = shuffled.map(item => item.originalIndex);
  const newCorrectAnswerIndex = shuffled.findIndex(
    item => item.originalIndex === question.correctAnswer
  );

  return {
    id: question.id,
    question: question.question,
    options: shuffled.map(item => item.option),
    correctAnswerIndex: newCorrectAnswerIndex,
    originalCorrectAnswer: question.correctAnswer,
    shuffleMap,
    explanation: question.explanation
  };
}

/**
 * Randomizes all questions in a quiz
 */
export function randomizeQuestions(questions: OriginalQuestion[]): RandomizedQuestion[] {
  return questions.map(q => randomizeQuestion(q));
}

/**
 * Initialize a new quiz state
 */
export function initializeQuizState(
  questions: OriginalQuestion[],
  mode: 'normal' | 'retake' = 'normal',
  retakeQuestionIds?: number[]
): QuizState {
  const quizId = `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Filter questions if in retake mode
  const questionsToUse = mode === 'retake' && retakeQuestionIds
    ? questions.filter(q => retakeQuestionIds.includes(q.id))
    : questions;

  const randomizedQuestions = randomizeQuestions(questionsToUse);

  const now = Date.now();
  
  return {
    quizId,
    originalQuestions: questionsToUse,
    randomizedQuestions,
    progress: {
      currentQuestionIndex: 0,
      answers: {},
      startTime: now,
      lastUpdated: now,
      totalTimeSpent: 0
    },
    results: null,
    mode,
    retakeQuestionIds
  };
}

/**
 * Calculate quiz results from progress
 */
export function calculateResults(
  questions: RandomizedQuestion[],
  progress: QuizProgress
): QuizResults {
  const answeredCount = Object.keys(progress.answers).length;
  const correctCount = Object.values(progress.answers).filter(a => a.isCorrect).length;
  const incorrectCount = answeredCount - correctCount;
  const skippedCount = questions.length - answeredCount;
  const scorePercentage = questions.length > 0 
    ? Math.round((correctCount / questions.length) * 100) 
    : 0;

  const incorrectQuestionIds = Object.values(progress.answers)
    .filter(a => !a.isCorrect)
    .map(a => a.questionId);

  return {
    totalQuestions: questions.length,
    answeredCount,
    correctCount,
    incorrectCount,
    skippedCount,
    scorePercentage,
    completedAt: Date.now(),
    totalTimeSpent: progress.totalTimeSpent,
    incorrectQuestionIds
  };
}

/**
 * Update quiz progress with a new answer
 */
export function updateProgress(
  progress: QuizProgress,
  questionIndex: number,
  questionId: number,
  selectedOptionIndex: number,
  isCorrect: boolean,
  timeSpent?: number
): QuizProgress {
  const now = Date.now();
  
  const answer: QuizAnswer = {
    questionId,
    selectedOptionIndex,
    isCorrect,
    timestamp: now,
    timeSpent
  };

  return {
    ...progress,
    answers: {
      ...progress.answers,
      [questionIndex]: answer
    },
    lastUpdated: now,
    totalTimeSpent: Math.floor((now - progress.startTime) / 1000)
  };
}

/**
 * Export complete quiz state to JSON
 */
export function exportQuizState(state: QuizState): string {
  const exportData: QuizExport = {
    exportVersion: EXPORT_VERSION,
    exportDate: Date.now(),
    quizId: state.quizId,
    quizData: {
      originalQuestions: state.originalQuestions,
      randomizedQuestions: state.randomizedQuestions
    },
    progress: state.progress,
    results: state.results,
    mode: state.mode,
    retakeQuestionIds: state.retakeQuestionIds
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Export quiz results only (lighter weight)
 */
export function exportQuizResults(state: QuizState): string {
  if (!state.results) {
    throw new Error('Cannot export results - quiz not completed');
  }

  const questionsReview = state.randomizedQuestions.map((q, index) => {
    const answer = state.progress.answers[index];
    if (!answer) {
      return null;
    }

    return {
      questionId: q.id,
      question: q.question,
      selectedAnswer: q.options[answer.selectedOptionIndex],
      correctAnswer: q.options[q.correctAnswerIndex],
      isCorrect: answer.isCorrect,
      explanation: q.explanation
    };
  }).filter(Boolean) as QuizResultsExport['questionsReview'];

  const exportData: QuizResultsExport = {
    exportVersion: EXPORT_VERSION,
    exportDate: Date.now(),
    quizId: state.quizId,
    results: state.results,
    answers: state.progress.answers,
    questionsReview
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Import and validate quiz state from JSON
 */
export function importQuizState(jsonString: string): QuizState {
  try {
    const data = JSON.parse(jsonString) as QuizExport;
    
    // Validate export version
    if (!data.exportVersion || data.exportVersion !== EXPORT_VERSION) {
      throw new Error('Invalid or incompatible export version');
    }

    // Reconstruct quiz state
    const state: QuizState = {
      quizId: data.quizId,
      originalQuestions: data.quizData.originalQuestions,
      randomizedQuestions: data.quizData.randomizedQuestions,
      progress: data.progress,
      results: data.results,
      mode: data.mode || 'normal',
      retakeQuestionIds: data.retakeQuestionIds
    };

    return state;
  } catch (error) {
    throw new Error(`Failed to import quiz state: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Download quiz state as JSON file
 */
export function downloadQuizState(state: QuizState, filename?: string): void {
  const jsonString = exportQuizState(state);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `quiz_state_${state.quizId}_${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download quiz results as JSON file
 */
export function downloadQuizResults(state: QuizState, filename?: string): void {
  const jsonString = exportQuizResults(state);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `quiz_results_${state.quizId}_${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Upload and import quiz state from file
 */
export function uploadQuizState(): Promise<QuizState> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      try {
        const text = await file.text();
        const state = importQuizState(text);
        resolve(state);
      } catch (error) {
        reject(error);
      }
    };

    input.click();
  });
}

/**
 * Get questions that were answered incorrectly
 */
export function getIncorrectQuestions(state: QuizState): OriginalQuestion[] {
  const results = state.results;
  if (!results || results.incorrectQuestionIds.length === 0) {
    return [];
  }

  return state.originalQuestions.filter(q =>
    results.incorrectQuestionIds.includes(q.id)
  );
}

/**
 * Create a new quiz state for retaking missed questions
 */
export function createRetakeQuizState(state: QuizState): QuizState | null {
  if (!state.results || state.results.incorrectQuestionIds.length === 0) {
    return null;
  }

  return initializeQuizState(
    state.originalQuestions,
    'retake',
    state.results.incorrectQuestionIds
  );
}

/**
 * Format time duration for display
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (mins === 0) {
    return `${secs}s`;
  }
  
  return `${mins}m ${secs}s`;
}

/**
 * Get performance data based on score (message and icon)
 */
export function getPerformanceData(scorePercentage: number): { message: string; icon: string } {
  if (scorePercentage === 100) return { message: 'Perfect Score! Outstanding!', icon: 'target' };
  if (scorePercentage >= 90) return { message: 'Excellent Work!', icon: 'star' };
  if (scorePercentage >= 80) return { message: 'Great Job!', icon: 'award' };
  if (scorePercentage >= 70) return { message: 'Good Effort!', icon: 'thumbs-up' };
  if (scorePercentage >= 60) return { message: 'Not Bad! Keep Practicing', icon: 'flame' };
  return { message: 'Keep Trying! You\'ll Improve', icon: 'book-open' };
}

