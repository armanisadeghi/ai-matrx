// utils/audio/audioModal.ts
import type { AudioModalOptions } from '@/types/audio';

let showAudioModalFn: ((props: AudioModalOptions) => void) | null = null;

export const registerAudioModal = (fn: (props: AudioModalOptions) => void) => {
    showAudioModalFn = fn;
};

export const showAudioModal = (props: AudioModalOptions) => {
    if (!showAudioModalFn) {
        throw new Error('AudioModal not initialized. Ensure <AudioModalHost /> is mounted (app/Providers.tsx).');
    }
    showAudioModalFn(props);
};
