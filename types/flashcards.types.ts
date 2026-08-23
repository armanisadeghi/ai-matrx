// File location: types/flashcards.types.ts
export type FlashcardData = {
  id?: string;
  order: number;
  topic?: string;
  lesson?: string;
  gradeLevel?: number;
  front: string;
  back: string;
  example?: string;
  detailedExplanation?: string;
  audioExplanation?: string;
  relatedImages?: string[];
  personalNotes?: string;
  isDeleted?: boolean;
  dynamicContent?: Array<{ title: string; content: string }> | undefined;
  tags?: string[];
};

export type Flashcard = FlashcardData & {
  reviewCount: number;
  correctCount: number;
  incorrectCount: number;
};

export type AiAssistModalTab =
  | "confused"
  | "example"
  | "question"
  | "split"
  | "combine"
  | "compare";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  /**
   * The tutor's structured `live_help_answer` (flashcards.help_live) when the
   * message came from the help lane — the chat renders it through the kind
   * component; `content` keeps the plain answer for history/search.
   */
  help?: import("@/features/education/tutor/lanes/helpLive").HelpLiveResult;
};

export interface SmartButtonProps {
  flashcardHook: any;
  className?: string;
}

export type TextModalState = {
  isAiModalOpen: boolean;
  isAiAssistModalOpen: boolean;
  aiAssistModalMessage: string;
  aiAssistModalDefaultTab: string;
};

export type AudioModalActions = {
  playActiveCardAudio: () => void;
  playCustomTextAudio: (text: string) => void;
  playIntroAudio: () => void;
  playOutroAudio: () => void;
};

export type TextModalActions = {
  openAiModal: () => void;
  closeAiModal: () => void;
  openAiAssistModal: (message: string) => void;
  closeAiAssistModal: () => void;
};
