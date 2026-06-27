import { useChipMenu } from '@/features/rich-text-editor/components/ChipContextMenu';
import { BrokerMetaData } from '@/types/editor.types';
import { MatrxRecordId } from '@/types/records';
import { useCallback, useState } from 'react';


interface ChipDialogEvent extends CustomEvent {
    detail: {
        chipId: string;
        metadata: BrokerMetaData;
    };
}

declare global {
    interface WindowEventMap {
        'openChipDialog': ChipDialogEvent;
    }
}


export function useChipHandlers(messageId: MatrxRecordId) {
    const { showMenu } = useChipMenu();
    const [showDialog, setShowDialog] = useState(false);

    const handleChipClick = useCallback((event: MouseEvent) => {
        const chip = (event.target as HTMLElement).closest('[data-chip]');
        if (!chip) return;

        const chipId = chip.getAttribute('data-chip-id');
        if (!chipId) return;

        // Add the test attribute to the clicked chip
        chip.setAttribute('data-test-clicked', 'true');

        console.log('useChipHandlers Chip clicked:', chipId);
    }, []);

    const addDialogHandler = (event: MouseEvent, metadata: BrokerMetaData) => {
        event.preventDefault();
        event.stopPropagation();
    
        const dialogEvent = new CustomEvent('openChipDialog', {
            bubbles: true,
            detail: {
                chipId: metadata.matrxRecordId,
                metadata: metadata
            }
        });
    
        // Dispatch from the element, but ensure we're using the provided metadata
        event.target?.dispatchEvent(dialogEvent);
    };

    
    const handleChipDoubleClick = (event: MouseEvent, metadata: BrokerMetaData) => {
        event.preventDefault();
        event.stopPropagation();
    
        const dialogEvent = new CustomEvent('openChipDialog', {
            bubbles: true,
            detail: {
                chipId: metadata.matrxRecordId,
                metadata: metadata
            }
        });
    
        event.target?.dispatchEvent(dialogEvent);
    };

    const handleChipMouseEnter = useCallback((event: MouseEvent) => {
        const chip = (event.target as HTMLElement).closest('[data-chip]');
        if (!chip) return;

        const chipId = chip.getAttribute('data-chip-id');
        if (!chipId) return;

        console.log('Mouse entered chip:', chipId);
    }, []);

    const handleChipMouseLeave = useCallback((event: MouseEvent) => {
        const chip = (event.target as HTMLElement).closest('[data-chip]');
        if (!chip) return;

        const chipId = chip.getAttribute('data-chip-id');
        if (!chipId) return;

        console.log('Mouse left chip:', chipId);
    }, []);

    const handleChipContextMenu = useCallback(
        (event: MouseEvent) => {
            const chip = (event.target as HTMLElement).closest('[data-chip]');
            if (!chip) return;

            const chipId = chip.getAttribute('data-chip-id');
            if (!chipId) return;

            event.preventDefault();
            event.stopPropagation();
            showMenu(messageId, chipId, event.clientX, event.clientY);
        },
        [messageId, showMenu]
    );

    return {
        handleChipClick,
        handleChipDoubleClick,
        addDialogHandler,
        handleChipMouseEnter,
        handleChipMouseLeave,
        handleChipContextMenu,
    };
}

export type UseChipHandlersResult = ReturnType<typeof useChipHandlers>;

export default useChipHandlers;

