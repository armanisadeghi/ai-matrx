import {
  FileText,
  Briefcase,
  User,
  Lightbulb,
  Edit3,
  MessageSquareText,
} from "lucide-react";

export interface DefaultFolder {
  name: string;
  icon: typeof FileText;
  color?: string;
}

/** Canonical folder for assistant-message "Save as → Note" captures. */
export const CHAT_SAVES_FOLDER = "Chat Saves";

export const DEFAULT_FOLDERS: DefaultFolder[] = [
  {
    name: "Draft",
    icon: Edit3,
    color: "text-blue-500",
  },
  {
    name: "Personal",
    icon: User,
    color: "text-green-500",
  },
  {
    name: "Business",
    icon: Briefcase,
    color: "text-purple-500",
  },
  {
    name: "Prompts",
    icon: Lightbulb,
    color: "text-yellow-500",
  },
  {
    name: CHAT_SAVES_FOLDER,
    icon: MessageSquareText,
    color: "text-sky-500 dark:text-sky-400",
  },
  {
    name: "Scratch",
    icon: FileText,
    color: "text-gray-500",
  },
];

export const DEFAULT_FOLDER_NAMES = DEFAULT_FOLDERS.map((f) => f.name);

export function getDefaultFolder(
  folderName: string,
): DefaultFolder | undefined {
  return DEFAULT_FOLDERS.find((f) => f.name === folderName);
}
