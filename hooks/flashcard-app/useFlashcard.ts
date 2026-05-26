import { useState, useLayoutEffect, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  Flashcard,
  ChatMessage,
  FlashcardData,
  TextModalState,
  AudioModalActions,
  TextModalActions,
} from "@/types/flashcards.types";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  initializeFlashcards,
  initializeFlashcard,
  addMessage,
  updateFlashcardStats,
  clearChat,
  resetAllChats,
  setCurrentIndex,
  deleteFlashcard,
  addFlashcard,
  updateFlashcard,
} from "@/lib/redux/slices/flashcardChatSlice";
import {
  selectAllFlashcards,
  selectActiveFlashcard,
  selectCurrentIndex,
} from "@/lib/redux/selectors/flashcardSelectors";
import { introOutroText } from "@/app/(transitional)/flashcard/app-data";
import { showAudioModal } from "@/utils/audio/audioModal";
import { useSwipeable } from "react-swipeable";
import { useLongPress } from "@uidotdev/usehooks";

export const useFlashcard = (initialFlashcards: FlashcardData[]) => {
  const dispatch = useDispatch<AppDispatch>();
  const allFlashcards = useSelector(selectAllFlashcards);
  const currentIndex = useSelector(selectCurrentIndex);
  const activeFlashcard = useSelector(selectActiveFlashcard);
  const flashcardIntro = introOutroText.introText;
  const flashcardOutro = introOutroText.outroText;

  const firstName = useSelector(
    (state: RootState) =>
      state.userProfile.userMetadata.fullName?.split(" ")[0] || null,
  );

  const [isFlipped, setIsFlipped] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [isExpandedChatOpen, setIsExpandedChatOpen] = useState(false);

  const [textModalState, setTextModalState] = useState<TextModalState>({
    isAiModalOpen: false,
    isAiAssistModalOpen: false,
    aiAssistModalMessage: "",
    aiAssistModalDefaultTab: "confused",
  });

  // Audio Modal Actions
  const audioModalActions: AudioModalActions = {
    playActiveCardAudio: useCallback(() => {
      if (activeFlashcard?.audioExplanation) {
        showAudioModal({
          text: activeFlashcard.audioExplanation,
          title: "Flashcard Explanation",
          description: "Listen to the explanation for this flashcard.",
        });
      }
    }, [activeFlashcard]),

    playCustomTextAudio: useCallback((text: string) => {
      showAudioModal({
        text,
        title: "Audio Explanation",
        description: "Listen to this explanation.",
      });
    }, []),

    playIntroAudio: useCallback(() => {
      showAudioModal({
        text: flashcardIntro,
        title: "Welcome!",
        description: `Hi ${firstName || "there"}! Let's get started!`,
      });
    }, [flashcardIntro, firstName]),

    playOutroAudio: useCallback(() => {
      showAudioModal({
        text: flashcardOutro,
        title: "Great Job!",
        description: `Well done ${firstName || "there"}! Way to go!`,
      });
    }, [flashcardOutro, firstName]),
  };

  // Text Modal Actions
  const textModalActions: TextModalActions = {
    openAiModal: useCallback(() => {
      setTextModalState((prev) => ({ ...prev, isAiModalOpen: true }));
    }, []),

    closeAiModal: useCallback(() => {
      setTextModalState((prev) => ({ ...prev, isAiModalOpen: false }));
    }, []),

    openAiAssistModal: useCallback((message: string) => {
      setTextModalState((prev) => ({
        ...prev,
        isAiAssistModalOpen: true,
        aiAssistModalMessage: message,
        aiAssistModalDefaultTab: message.toLowerCase().replace(/\s+/g, "-"),
      }));
    }, []),

    closeAiAssistModal: useCallback(() => {
      setTextModalState((prev) => ({ ...prev, isAiAssistModalOpen: false }));
    }, []),
  };

  // Sync static deck into Redux before paint so client singleton stays aligned with route data.
  useLayoutEffect(() => {
    const flashcardsToInitialize = initialFlashcards.map((card, index) => ({
      ...card,
      id: `flashcard-${index}`,
      reviewCount: 0,
      correctCount: 0,
      incorrectCount: 0,
    }));
    dispatch(initializeFlashcards(flashcardsToInitialize));
  }, [initialFlashcards, dispatch]);

  const handleFlip = useCallback(() => setIsFlipped((prev) => !prev), []);

  const handleNext = useCallback(() => {
    if (currentIndex < allFlashcards.length - 1) {
      dispatch(setCurrentIndex(currentIndex + 1));
      setIsFlipped(false);
    }
  }, [currentIndex, allFlashcards.length, dispatch]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      dispatch(setCurrentIndex(currentIndex - 1));
      setIsFlipped(false);
    }
  }, [currentIndex, dispatch]);

  const handleSelectChange = useCallback(
    (value: string) => {
      dispatch(setCurrentIndex(parseInt(value)));
      setIsFlipped(false);
    },
    [dispatch],
  );

  const shuffleCards = useCallback(() => {
    const newIndex = Math.floor(Math.random() * allFlashcards.length);
    dispatch(setCurrentIndex(newIndex));
    setIsFlipped(false);
  }, [allFlashcards.length, dispatch]);

  const handleAnswer = useCallback(
    (isCorrect: boolean) => {
      if (activeFlashcard) {
        dispatch(
          updateFlashcardStats({ flashcardId: activeFlashcard.id, isCorrect }),
        );
        handleNext();
      }
    },
    [activeFlashcard, dispatch, handleNext],
  );

  const handleAction = useCallback(
    (actionName: string, data: any) => {
      switch (actionName) {
        case "add":
          dispatch(addFlashcard(data));
          break;
        case "edit":
          setEditingCard(data);
          break;
        case "delete":
          dispatch(deleteFlashcard(data.id));
          break;
        case "expand":
          setIsExpandedChatOpen(true);
          break;
        default:
          console.log(`Unknown action: ${actionName}`);
      }
    },
    [dispatch],
  );

  const swipeHandlers = useSwipeable({
    onSwipedRight: handlePrevious,
    onSwipedLeft: handleNext,
    onSwipedUp: () => handleAnswer(true),
    onSwipedDown: () => handleAnswer(false),
    touchEventOptions: { passive: false },
    trackMouse: false,
  });

  const longPressHandlers = useLongPress(
    () => {
      if (activeFlashcard?.audioExplanation) {
        audioModalActions.playActiveCardAudio();
      }
    },
    {
      threshold: 500,
      onCancel: handleFlip,
    },
  );

  const combinedHandlers = {
    ...swipeHandlers,
    ...longPressHandlers,
  };

  return {
    allFlashcards,
    currentIndex,
    activeFlashcard,
    firstName,
    isFlipped,
    fontSize,
    editingCard,
    isExpandedChatOpen,
    textModalState,

    handleFlip,
    handleNext,
    handlePrevious,
    handleSelectChange,
    shuffleCards,
    handleAnswer,
    setFontSize,
    setIsExpandedChatOpen,
    setEditingCard,
    handleAction,

    mobileHandlers: combinedHandlers,

    audioModalActions,
    textModalActions,
    addMessage: useCallback(
      (flashcardId: string, message: ChatMessage) => {
        dispatch(addMessage({ flashcardId, message }));
      },
      [dispatch],
    ),
    clearChat: useCallback(
      (flashcardId: string) => {
        dispatch(clearChat(flashcardId));
      },
      [dispatch],
    ),
    resetAllChats: useCallback(() => {
      dispatch(resetAllChats());
    }, [dispatch]),
  };
};
