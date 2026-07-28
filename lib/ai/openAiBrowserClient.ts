import OpenAI from "openai";

// SECURITY (2026-07-28, D113 class): this module previously inlined
// NEXT_PUBLIC_OPENAI_API_KEY into the browser bundle. Its only consumers are
// the retired legacy flashcard chat (underscore-private, non-routable
// app/(transitional)/_flash-cards + _flashcard folders). No key ships in the
// bundle anymore; any runtime use of this legacy client now fails loudly.
// Real AI calls go through aidream — never a browser-held provider key.
export const openai = new OpenAI({
    apiKey: "legacy-flashcard-chat-retired-use-aidream",
    dangerouslyAllowBrowser: true,
});

export const defaultOpenAiModel = "gpt-4o-mini";
export const defaultTemperature = 0.5;
export const default4oMiniMaxTokens = 14500;
export const defaultTopP = 1;
export const defaultFrequencyPenalty = 0;
export const defaultPresencePenalty = 0;
export const defaultResponseFormat = {
    "type": "text"
};

export const openAiEliteModel = "gpt-4o";

export const openAiEliteModelMaxTokens = 3850;

export type ChatModelOptions =
    | 'o1-preview'
    | 'o1-preview-2024-09-12'
    | 'o1-mini'
    | 'o1-mini-2024-09-12'
    | 'gpt-4o'
    | 'gpt-4o-2024-08-06'
    | 'gpt-4o-2024-05-13'
    | 'gpt-4o-realtime-preview-2024-10-01'
    | 'chatgpt-4o-latest'
    | 'gpt-4o-mini'
    | 'gpt-4o-mini-2024-07-18'
    | 'gpt-4-turbo'
    | 'gpt-4-turbo-2024-04-09'
    | 'gpt-4-0125-preview'
    | 'gpt-4-turbo-preview'
    | 'gpt-4-1106-preview'
    | 'gpt-4-vision-preview'
    | 'gpt-4'
    | 'gpt-4-0314'
    | 'gpt-4-0613'
    | 'gpt-4-32k'
    | 'gpt-4-32k-0314'
    | 'gpt-4-32k-0613'
    | 'gpt-3.5-turbo'
    | 'gpt-3.5-turbo-16k'
    | 'gpt-3.5-turbo-0301'
    | 'gpt-3.5-turbo-0613'
    | 'gpt-3.5-turbo-1106'
    | 'gpt-3.5-turbo-0125'
    | 'gpt-3.5-turbo-16k-0613';
