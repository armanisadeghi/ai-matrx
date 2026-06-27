import { MatrxRecordId } from "@/types/records";

export type ChatMode =
  | "general"
  | "research"
  | "brainstorm"
  | "analyze"
  | "images"
  | "video"
  | "code"
  | "recipe";

export interface ChatInputSettings {
  modelKey: MatrxRecordId | null;
  searchEnabled: boolean;
  toolsEnabled: boolean;
  uploadedFiles: File[];
  mode: ChatMode;
  // Future settings will be added here
}

export type MessageRole =
  | "assistant"
  | "system"
  | "tool"
  | "user"
  | string
  | undefined;

export type MessageType =
  | "base64_image"
  | "blob"
  | "image_url"
  | "json_object"
  | "mixed"
  | "other"
  | "text"
  | "tool_result"
  | string
  | undefined;

export type MessageMetadata = {
  files?: any[] | null;
  brokerValues?: Record<string, unknown> | null;
  availableTools?: string[] | null;

  image_url?: string;
  blob_url?: string;
  base64_image?: string;
  blob?: string;
  json_object?: Record<string, unknown>;
  mixed?: Record<string, unknown>;
  other?: Record<string, unknown>;
  text?: string;
  tool_result?: Record<string, unknown>;
  [key: string]: unknown;
};

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content?: string;
  type: MessageType;
  displayOrder?: number;
  systemOrder?: number;
  createdAt?: Date;
  metadata?: MessageMetadata;
  userId?: string;
  isPublic?: boolean;
};

export type ConversationMetadata = {
  currentModel: string | undefined;
  currentEndpoint: string | undefined;
  currentMode: ChatMode;
  concurrentRecipes: string[] | null;
  brokerValues: Record<string, unknown> | null;
  availableTools: string[] | null;
  ModAssistantContext: string | null;
  ModUserContext: string | null;
  [key: string]: unknown;
};

export type Conversation = {
  id: string;
  label?: string;
  isPublic?: boolean;
  userId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: ConversationMetadata;
};
