// providers/AudioModalHost.tsx
//
// Imperative host for the global `showAudioModal()` helper — same pattern as
// ConfirmDialogHost / CloudFilesPickerHost. Mounted once in app/Providers.tsx
// so `showAudioModal()` is callable from anywhere with no per-route provider.
// Self-closing (not a children-wrapping context) so opening the modal only
// re-renders this host, never the whole authenticated tree.
//
// The modal itself is `next/dynamic` — nothing TTS-related is downloaded until
// the first showAudioModal() call.
'use client';

import React, { useCallback, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { AudioModalOptions } from '@/types/audio';
import { registerAudioModal } from '@/utils/audio/audioModal';

const AudioModal = dynamic(() => import('@/components/audio/AudioModal'), { ssr: false });

export function AudioModalHost() {
    const [modalProps, setModalProps] = useState<AudioModalOptions | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    const showAudioModal = useCallback((props: AudioModalOptions) => {
        setModalProps(props);
        setIsOpen(true);
    }, []);

    useEffect(() => {
        registerAudioModal(showAudioModal);
    }, [showAudioModal]);

    if (!modalProps) return null;

    return (
        <AudioModal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            text={modalProps.text}
            icon={modalProps.icon}
            title={modalProps.title}
            description={modalProps.description}
            hideText={modalProps.hideText}
            dictionarySurfaceKey={modalProps.dictionarySurfaceKey}
        />
    );
}
