"use server";

import Groq from "groq-sdk";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

import {
  AiCallParams,
  AiResponse,
  ApiName,
  ProcessAiRequestParams,
  ServersideMessage,
  InputType,
  PartialBroker,
} from "@/types/voice/voiceAssistantTypes";
import { getInitialMessages } from "@/actions/ai-actions/recipe-utils";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Main server action
 */

const DEFAULT_AI_REQUEST = {
  apiName: "groq" as ApiName,
  inputType: "text" as InputType,
  responseType: "text" as InputType,
  voiceId: "79a125e8-cd45-4c13-8a67-188112f4dd22",
  previousMessages: [] as ServersideMessage[],
  partialBrokers: [] as PartialBroker[],
  aiCallParams: {} as AiCallParams,
};

export async function processAiRequest(
  params: ProcessAiRequestParams
): Promise<AiResponse> {
  const {
    assistant,
    partialBrokers,
    input,
    apiName = DEFAULT_AI_REQUEST.apiName,
    inputType = DEFAULT_AI_REQUEST.inputType,
    responseType = DEFAULT_AI_REQUEST.responseType,
    voiceId = DEFAULT_AI_REQUEST.voiceId,
    previousMessages = DEFAULT_AI_REQUEST.previousMessages,
    aiCallParams: aiCallParams = DEFAULT_AI_REQUEST.aiCallParams,
  } = params;

  if (!["groq", "openai", "anthropic"].includes(apiName)) {
    throw new Error("Invalid or missing API name");
  }

  if (!["text", "audio"].includes(inputType)) {
    throw new Error('Invalid input type. Must be "text" or "audio".');
  }

  if (!["text", "audio", "streamingText"].includes(responseType)) {
    throw new Error(
      'Invalid response type. Must be "text", "audio", or "streamingText".'
    );
  }

  // Step 1: Handle input
  let transcript: string | undefined;

  if (inputType === "audio") {
    const audioTranscript = await getTranscript(input);
    if (!audioTranscript) {
      throw new Error("Failed to process audio input into transcript.");
    }
    transcript = audioTranscript;
  } else if (typeof input === "string") {
    transcript = input;
  } else {
    throw new Error("Invalid input type provided.");
  }

  // Step 2: Prepare messages
  const initialMessages = assistant
    ? await getInitialMessages(assistant, partialBrokers)
    : [];
  const messages = buildMessages(transcript, previousMessages, initialMessages);

  // Step 3: Call AI with additional params
  const aiResponse = await callAI(apiName, messages, aiCallParams);

  // Step 4: Handle response type
  if (responseType === "audio") {
    // Sanitize the AI response for audio conversion
    const sanitizedResponse = removeNonReadableCharacters(aiResponse);

    const voiceStream = await generateVoice(sanitizedResponse, voiceId);
    return {
      transcript,
      responseType: "audio",
      response: aiResponse,
      voiceStream,
    };
  }

  if (responseType === "streamingText") {
    return {
      transcript,
      responseType: "streamingText",
      response: aiResponse,
    };
  }

  // Default to text response
  return {
    transcript,
    responseType: "text",
    response: aiResponse,
  };
}

/**
 * Build Subsequent Messages
 * Dynamically prepares the list of messages for the AI model based on previous messages.
 */
function buildMessages(
  transcript: string | undefined,
  previousMessages: ServersideMessage[],
  initialMessages: ServersideMessage[] = []
): ServersideMessage[] {
  const userMessage: ServersideMessage | null = transcript
    ? { role: "user", content: transcript }
    : null;

  return [
    ...initialMessages,
    ...previousMessages,
    ...(userMessage ? [userMessage] : []),
  ];
}

function replaceCodeBlocks(input: string): string {
  const messages = [
    "Take a look at the {lang} code provided here.",
    "Here's the {lang} code you requested.",
    "You can find the {lang} code right here.",
    "The {lang} code is available for you below.",
    "Below is the {lang} code you asked for.",
    "See the {lang} code snippet here.",
    "Check the {lang} code shown here.",
    "Here is the {lang} code you were looking for.",
    "Find the {lang} code below for your reference.",
    "For more information, refer to the {lang} code here.",
    "The {lang} code is included below for your convenience.",
    "The {lang} code you need can be found here.",
    "Access the {lang} code in the snippet below.",
    "The {lang} code is shown below for your review.",
    "You can explore the {lang} code below.",
    "Here’s the {lang} code snippet you need.",
    "Check below for the {lang} code you requested.",
    "See below for the {lang} code example.",
    "Take a look at the {lang} code example here.",
    "For your reference, the {lang} code is provided here.",
    "Check out the {lang} code displayed below.",
    "Here is the {lang} code for your reference.",
    "Please refer to the {lang} code below for details.",
    "The {lang} code snippet is available here.",
    "Below is the {lang} code you’re looking for.",
  ];

  const languageMapping: Record<string, string> = {
    tsx: "TypeScript",
    ts: "TypeScript",
    jsx: "JavaScript",
    js: "JavaScript",
    py: "Python",
    java: "Java",
    cs: "C Sharp",
    cpp: "C++",
    rb: "Ruby",
    php: "PHP",
    html: "HTML",
    css: "CSS",
    json: "JSON",
    xml: "XML",
    c: "C",
    go: "Go",
    swift: "Swift",
    kt: "Kotlin",
    kotlin: "Kotlin",
    rs: "Rust",
    sh: "Shell Script",
    bash: "Bash Script",
    bat: "Batch Script",
    ps1: "PowerShell",
    sql: "SQL",
    yaml: "YAML",
    yml: "YAML",
    md: "Markdown",
    txt: "Text",
    r: "R",
    pl: "Perl",
    scala: "Scala",
    dart: "Dart",
    lua: "Lua",
    vb: "Visual Basic",
    asm: "Assembly",
    m: "MATLAB",
    tex: "LaTeX",
    ini: "INI Configuration File",
    toml: "TOML Configuration File",
    makefile: "Makefile",
    dockerfile: "Dockerfile",
    gradle: "Gradle Script",
    groovy: "Groovy Script",
    cmake: "CMake Script",
    h: "C Header File",
    hpp: "C++ Header File",
    csproj: "C Sharp Project File",
    sln: "Solution File",
    vbproj: "Visual Basic Project File",
  };

  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;

  const result = input.replace(codeBlockRegex, (_, lang = "code") => {
    const readableLanguage =
      languageMapping[lang] || lang.charAt(0).toUpperCase() + lang.slice(1);
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    return randomMessage.replace("{lang}", readableLanguage);
  });

  return result;
}

// Integrate into the existing response handling pipeline
function removeNonReadableCharacters(input: string): string {
  const contentWithoutCode = replaceCodeBlocks(input);

  const sanitizedInput = contentWithoutCode
    .replace(/[\u{1F600}-\u{1F6FF}]/gu, "") // Emojis
    .replace(/[\u{2600}-\u{26FF}]/gu, "") // Miscellaneous symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, "") // Dingbats
    .replace(/[`*_~\[\]()<>#+=\-]/g, "") // Markdown-like characters
    .replace(/[^\w\s.,?!]/g, ""); // Other non-readable characters

  return sanitizedInput;
}

/**
 * Call AI
 * Modifies the callAI function to support additional parameters.
 */
async function callAI(
  apiName: ApiName,
  messages: ServersideMessage[],
  aiCallParams: AiCallParams
): Promise<string> {
  if (apiName === "groq") {
    return await callGroqAPI(messages, aiCallParams);
  } else if (apiName === "openai") {
    return await callOpenAI(messages, aiCallParams);
  } else if (apiName === "anthropic") {
    return await callAnthropic(messages, aiCallParams);
  } else {
    throw new Error("Unsupported API name");
  }
}

/**
 * Call Groq API
 */
async function callGroqAPI(
  messages: ServersideMessage[],
  aiCallParams: AiCallParams
): Promise<string> {
  const { model = "llama3-8b-8192", ...restParams } = aiCallParams;
  const completion = await groq.chat.completions.create({
    model,
    messages,
    ...restParams,
  });
  const content = completion.choices[0]?.message.content;
  if (content == null) {
    throw new Error("Groq API returned no message content");
  }
  return content;
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  messages: ServersideMessage[],
  aiCallParams: AiCallParams
): Promise<string> {
  const { model = "gpt-4o-mini", ...restParams } = aiCallParams;
  const completion = await openai.chat.completions.create({
    model,
    messages,
    ...restParams,
  });
  const content = completion.choices[0]?.message.content;
  if (content == null) {
    throw new Error("OpenAI API returned no message content");
  }
  return content;
}

/**
 * Call Anthropic API
 */
async function callAnthropic(
  messages: ServersideMessage[],
  aiCallParams: AiCallParams
): Promise<string> {
  const {
    model = "claude-3-5-sonnet-20241022",
    temperature = 0,
    maxTokens = 1000,
    ...restParams
  } = aiCallParams;

  const systemMessage =
    messages.find((msg) => msg.role === "system")?.content || "";
  const userAndAssistantMessages = messages.filter(isUserOrAssistant);

  if (!userAndAssistantMessages.length) {
    throw new Error("Anthropic API requires at least one user message.");
  }

  const completion = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemMessage,
    messages: userAndAssistantMessages.map(({ role, content }) => ({
      role, // Only 'user' or 'assistant' roles are allowed
      content,
    })),
    ...restParams, // Spread additional params
  });

  return completion.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * Helper function to filter user and assistant messages for Anthropic API.
 */
function isUserOrAssistant(
  message: ServersideMessage
): message is ServersideMessage & { role: "user" | "assistant" } {
  return message.role === "user" || message.role === "assistant";
}

/**
 * Generate Voice
 * Converts AI response to speech using TTS.
 */
async function generateVoice(
  text: string,
  voiceId: string = "79a125e8-cd45-4c13-8a67-188112f4dd22"
): Promise<ReadableStream> {
  const response = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "Cartesia-Version": "2024-06-30",
      "Content-Type": "application/json",
      "X-API-Key": process.env.CARTESIA_API_KEY!,
    },
    body: JSON.stringify({
      model_id: "sonic-english",
      transcript: text,
      voice: {
        mode: "id",
        id: voiceId, // Use the provided voiceId or the default
      },
      output_format: {
        container: "raw",
        encoding: "pcm_f32le",
        sample_rate: 24000,
      },
    }),
  });

  if (!response.ok) {
    console.error(await response.text());
    throw new Error("Voice synthesis failed");
  }

  const body = response.body;
  if (!body) {
    throw new Error("Voice synthesis response had no body");
  }
  return body;
}

/**
 * Get Transcript
 * Handles transcription of audio or plain text input.
 */
async function getTranscript(input: string | File): Promise<string | null> {
  if (typeof input === "string") return input;

  try {
    const { text } = await groq.audio.transcriptions.create({
      file: input,
      model: "whisper-large-v3-turbo",
      language: "en",
    });

    return text.trim() || null;
  } catch (error) {
    console.error("Transcription error:", error);
    return null;
  }
}

/*
const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [],
    response_format: {
        "type": "json_schema",
        "json_schema": {
            "name": "fast_fire_flashcard_feedback_response",
            "strict": true,
            "schema": {
                "type": "object",
                "properties": {
                    "correct": {
                        "type": "boolean",
                        "description": "Indicates whether the response was correct."
                    },
                    "score": {
                        "type": "integer",
                        "description": "The score received for the response."
                    },
                    "audioFeedback": {
                        "type": "string",
                        "description": "Audio feedback provided related to the response."
                    }
                },
                "required": [
                    "correct",
                    "score",
                    "audioFeedback"
                ],
                "additionalProperties": false
            }
        }
    },
    temperature: 1,
    max_tokens: 5384,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0
});
*/
