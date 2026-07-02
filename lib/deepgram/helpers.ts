import { greetings } from "./constants";

/**
 * Shape of a live transcription "Results" payload (v5 listen WebSocket).
 * Compatible with ListenV1Response results channel structure.
 */
interface LiveResultsPayload {
  channel: {
    alternatives: Array<{
      words?: Array<{ word?: string; punctuated_word?: string }>;
    }>;
  };
}

/**
 * Get the sentence text from a live transcription result (Deepgram listen v1 "Results" message).
 * @param event - Payload with channel.alternatives[0].words
 * @returns Concatenated word text (punctuated_word when present, else word)
 */
const utteranceText = (event: LiveResultsPayload) => {
  const words = event.channel?.alternatives?.[0]?.words ?? [];
  // MATRX-EXCEPTION: display concatenation — a word with neither field present
  // contributes an empty segment rather than corrupting the joined sentence.
  return words
    .map((word) => word.punctuated_word ?? word.word ?? "")
    .join(" ");
};

interface RoleMessage {
  role: string;
  [key: string]: unknown;
}

/**
 * get user messages
 * @param messages
 */
const getUserMessages = <T extends RoleMessage>(messages: T[]): T[] => {
  return messages.filter((message) => message.role === "user");
};

/**
 * get message we want to display in the chat
 * @param messages
 */
const getConversationMessages = <T extends RoleMessage>(messages: T[]): T[] => {
  return messages.filter((message) => message.role !== "system");
};

const sprintf = (template: string, ...args: unknown[]) => {
  return template.replace(/%[sdf]/g, (match: string) => {
    const arg = args.shift();
    switch (match) {
      case "%s":
        return String(arg);
      case "%d":
        return parseInt(String(arg), 10).toString();
      case "%f":
        return parseFloat(String(arg)).toString();
      default:
        return match;
    }
  });
};

function randomArrayValue<T>(array: T[]): T {
  if (array.length === 0) {
    throw new Error("randomArrayValue: array is empty");
  }
  const key = Math.floor(Math.random() * array.length);

  return array[key] as T;
};

function contextualGreeting(): string {
  const greeting = randomArrayValue(greetings);

  return sprintf(greeting.text, ...greeting.strings);
};

/**
 * @returns {string}
 */
function contextualHello(): string {
  const hour = new Date().getHours();

  if (hour > 3 && hour <= 12) {
    return "Good morning";
  } else if (hour > 12 && hour <= 15) {
    return "Good afternoon";
  } else if (hour > 15 && hour <= 20) {
    return "Good evening";
  } else if (hour > 20 || hour <= 3) {
    return "You're up late";
  } else {
    return "Hello";
  }
};

/**
 * Generate random string of alphanumerical characters.
 * 
 * @param {number} length this is the length of the string to return
 * @returns {string}
 */
function generateRandomString(length: number): string {
  let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    let randomChar = characters.charAt(Math.floor(Math.random() * characters.length));
    result += randomChar;
  }

  return result;
}

export {
  generateRandomString,
  contextualGreeting,
  contextualHello,
  getUserMessages,
  getConversationMessages,
  utteranceText
};
