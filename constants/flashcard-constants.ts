// constants/flashcard-constants.ts
//
// The legacy flashcard-app in-code tutor prompts that lived here (system
// content + opening question) were removed 2026-08-22: the chat now runs
// through the `flashcards.help_live` mandate (hooks/flashcard-app/useAiChat.ts),
// so the prompt lives in the DATABASE, never in code.

export const QUICK_ACTIONS = {
    'Expand on this': 'Can you expand on this please?',
    'Simplify Explanation': 'Can you simplify the explanation? I am not sure I understand.',
    'Give me an example': 'Can you give me an example of this?',
    "Bigger Picture": "Can you explain how this fits into the bigger picture?",
    'Structure Information': 'Can you give me the critical information in a structured format?',
    'Create Table': 'Can you create a table to explain this?',
    'Create Outline': 'Can you create an outline to explain this?',
    'Create Bullet Points': 'Can you put the most important information into bullet points?',
    'Key Points': 'What are the most important points?',
} as const;

