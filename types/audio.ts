// types/audio.ts
import { ReactNode } from 'react';

export interface AudioModalOptions {
    text: string;
    icon?: ReactNode;
    title?: string;
    description?: string;
    hideText?: boolean;
}
