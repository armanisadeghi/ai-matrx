// types/audioHelp.ts
import { LucideIcon } from 'lucide-react';
import type { AIHelpContext } from './contextCollection';

export interface AudioHelpMessage {
    id: string;
    icon: LucideIcon;
    text: string;
    title?: string;
    description?: string;
}

export interface AIHelpResponse {
    text: string;
    title: string;
    description: string;
    suggestedActions?: {
        label: string;
        action: string;
    }[];
    relevantElements?: string[]; // selectors for highlighting
}

// We can use this later when we implement the API
export interface AIHelpService {
    generateHelp: (context: AIHelpContext) => Promise<AIHelpResponse>;
}

