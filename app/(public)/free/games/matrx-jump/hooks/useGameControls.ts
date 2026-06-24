// hooks/useGameControls.ts
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDeviceMotion } from './useDeviceMotion';

export const useGameControls = () => {
    const [keyboardControls, setKeyboardControls] = useState({
        rightPressed: false,
        leftPressed: false
    });

    const { controls: motionControls, isAvailable, hasPermission, requestPermission } = useDeviceMotion();

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault(); // don't let arrow keys scroll the page mid-game
        }
        setKeyboardControls(prev => {
            switch (e.key) {
                case 'ArrowRight':
                    return { ...prev, rightPressed: true };
                case 'ArrowLeft':
                    return { ...prev, leftPressed: true };
                default:
                    return prev;
            }
        });
    }, []);

    const handleKeyUp = useCallback((e: KeyboardEvent) => {
        setKeyboardControls(prev => {
            switch (e.key) {
                case 'ArrowRight':
                    return { ...prev, rightPressed: false };
                case 'ArrowLeft':
                    return { ...prev, leftPressed: false };
                default:
                    return prev;
            }
        });
    }, []);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handleKeyDown, handleKeyUp]);

    // Combine keyboard and motion controls
    const finalControls = {
        rightPressed: keyboardControls.rightPressed || motionControls.rightPressed,
        leftPressed: keyboardControls.leftPressed || motionControls.leftPressed
    };

    return {
        controls: finalControls,
        isGyroAvailable: isAvailable,
        hasGyroPermission: hasPermission,
        requestGyroPermission: requestPermission
    };
};
