// types/audio.ts
import { ReactNode } from 'react';

export interface AudioModalOptions {
    text: string;
    icon?: ReactNode;
    title?: string;
    description?: string;
    hideText?: boolean;
    /** Dictionary surface whose pronunciations the playback should apply.
     *  Defaults to the shared generic read-aloud surface (personal dictionary). */
    dictionarySurfaceKey?: string;
}
