import { useState, useEffect, useCallback, useRef } from "react";
import type { QuizState } from "@/components/mardown-display/blocks/quiz/quiz-types";
import type { Json } from "@/types/database.types";
import {
  createQuizSession,
  updateQuizSession,
  getQuizSession,
  findExistingQuizByHash,
  type QuizSession,
} from "@/actions/quiz.actions";

export type QuizPersistenceOptions = {
  autoSave?: boolean;
  autoSaveInterval?: number; // milliseconds
  sessionId?: string; // If provided, loads existing session
  title?: string; // Quiz title
  category?: string; // Quiz category
  contentHash?: string; // Quiz content hash for duplicate detection
  metadata?: Json;
};

export function useQuizPersistence(
  quizState: QuizState,
  options: QuizPersistenceOptions = {},
) {
  const {
    autoSave = true,
    autoSaveInterval = 10000, // 10 seconds default
    sessionId: initialSessionId,
    title,
    category,
    contentHash,
    metadata,
  } = options;

  const [sessionId, setSessionId] = useState<string | null>(
    initialSessionId || null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Never block UI for background operations
  const [loadedSession, setLoadedSession] = useState<QuizSession | null>(null);
  const [hasCheckedDuplicate, setHasCheckedDuplicate] = useState(false);

  const lastSaveAttempt = useRef<number>(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousStateRef = useRef<string | null>(null); // Track actual state changes

  /**
   * Save the current quiz state to database
   */
  const saveQuizState = useCallback(
    async (state: QuizState) => {
      // Prevent rapid-fire saves
      const now = Date.now();
      if (now - lastSaveAttempt.current < 1000) {
        return;
      }
      lastSaveAttempt.current = now;

      setIsSaving(true);
      setSaveError(null);

      try {
        if (sessionId) {
          // Update existing session
          const result = await updateQuizSession(sessionId, state);
          if (result.success) {
            setLastSaved(new Date());
          } else {
            setSaveError(result.error || "Failed to save quiz");
          }
        } else {
          // Create new session (duplicate check already done at initialization)
          const result = await createQuizSession(
            state,
            title,
            category,
            contentHash,
            metadata,
          );
          if (result.success && result.data) {
            setSessionId(result.data.id);
            setLastSaved(new Date());

            // Update the quizId in the state to match the database ID
            state.quizId = result.data.id;
          } else {
            setSaveError(result.error || "Failed to create quiz session");
          }
        }
      } catch (error) {
        console.error("Error saving quiz:", error);
        setSaveError("Unexpected error saving quiz");
      } finally {
        setIsSaving(false);
      }
    },
    [sessionId, title, category, contentHash, metadata],
  );

  /**
   * Load a quiz session from database (background operation)
   */
  const loadQuizSession = useCallback(async (id: string) => {
    // Don't block UI - this is a background operation
    setSaveError(null);

    try {
      const result = await getQuizSession(id);
      if (result.success && result.data) {
        setLoadedSession(result.data);
        setSessionId(result.data.id);
        return result.data;
      } else {
        setSaveError(result.error || "Failed to load quiz session");
        return null;
      }
    } catch (error) {
      console.error("Error loading quiz:", error);
      setSaveError("Unexpected error loading quiz");
      return null;
    }
  }, []);

  /**
   * Manual save trigger
   */
  const saveNow = useCallback(() => {
    saveQuizState(quizState);
  }, [quizState, saveQuizState]);

  /**
   * Auto-save effect - only save when state actually changes
   */
  useEffect(() => {
    if (!autoSave) return undefined;

    // Serialize state to detect actual changes (ignore functions/refs)
    const currentStateSerialized = JSON.stringify({
      progress: quizState.progress,
      results: quizState.results,
      mode: quizState.mode,
    });

    // Skip if state hasn't actually changed
    if (previousStateRef.current === currentStateSerialized) {
      return undefined;
    }

    previousStateRef.current = currentStateSerialized;

    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Schedule save with debounce - don't save too frequently
    saveTimeoutRef.current = setTimeout(() => {
      // Fire and forget - truly background save
      saveQuizState(quizState).catch((err) => {
        console.error("Background save failed:", err);
      });
    }, autoSaveInterval);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [quizState, autoSave, autoSaveInterval, saveQuizState]);

  /**
   * Save on completion
   */
  useEffect(() => {
    if (quizState.results) {
      // Quiz completed - save immediately
      saveQuizState(quizState);
    }
  }, [quizState.results, saveQuizState]);

  /**
   * Check for duplicate quiz on initialization (BEFORE user starts answering)
   * This runs in the background without blocking the UI
   */
  useEffect(() => {
    const checkForDuplicate = async () => {
      // Only check once, and only if no session ID provided
      if (hasCheckedDuplicate || initialSessionId || !contentHash) {
        return;
      }

      setHasCheckedDuplicate(true);
      // Don't set isLoading - this is a background operation

      try {
        const result = await findExistingQuizByHash(contentHash);
        if (result.success && result.data) {
          // Found existing session - load it in background
          setLoadedSession(result.data);
          setSessionId(result.data.id);
        }
      } catch (error) {
        console.error("Error checking for duplicate:", error);
      }
      // No finally block - we don't need to update loading state
    };

    checkForDuplicate();
  }, [contentHash, initialSessionId, hasCheckedDuplicate]);

  /**
   * Load initial session if provided (only for explicit sessionId, not duplicates)
   * This happens in the background
   */
  useEffect(() => {
    if (initialSessionId && !loadedSession) {
      // Load in background without blocking
      loadQuizSession(initialSessionId).catch((err) => {
        console.error("Failed to load quiz session:", err);
      });
    }
  }, [initialSessionId, loadedSession, loadQuizSession]);

  return {
    sessionId,
    isSaving,
    lastSaved,
    saveError,
    isLoading,
    loadedSession,
    saveNow,
    loadQuizSession,
  };
}
