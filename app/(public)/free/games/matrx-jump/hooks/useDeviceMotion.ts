// hooks/useDeviceMotion.ts
'use client';

import { useState, useEffect, useCallback } from 'react';

interface DeviceMotionControls {
    rightPressed: boolean;
    leftPressed: boolean;
}

export const useDeviceMotion = (sensitivity: number = 2.5) => {
    const [controls, setControls] = useState<DeviceMotionControls>({
        rightPressed: false,
        leftPressed: false
    });
    const [isAvailable, setIsAvailable] = useState(false);
    const [hasPermission, setHasPermission] = useState(false);

    const requestPermission = useCallback(async () => {
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            // @ts-ignore - iOS specific property
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                // @ts-ignore - iOS specific method
                const permission = await DeviceOrientationEvent.requestPermission();
                setHasPermission(permission === 'granted');
                return permission === 'granted';
            } catch (err) {
                console.error('Error requesting device motion permission:', err);
                return false;
            }
        }
        // If no permission needed (non-iOS devices)
        setHasPermission(true);
        return true;
    }, []);

    const handleDeviceMotion = useCallback((event: DeviceOrientationEvent) => {
        // Use gamma (left/right tilt) for horizontal movement
        const gamma = event.gamma || 0;

        // Convert gamma (-90 to 90) to control values
        // Add sensitivity factor to make it more responsive
        const normalizedGamma = gamma * sensitivity;

        setControls({
            rightPressed: normalizedGamma > 10,
            leftPressed: normalizedGamma < -10
        });
    }, [sensitivity]);

    useEffect(() => {
        // Check if device motion is available
        const checkAvailability = async () => {
            if (typeof window !== 'undefined' && typeof DeviceOrientationEvent !== 'undefined') {
                setIsAvailable(true);
                const permitted = await requestPermission();
                if (permitted) {
                    window.addEventListener('deviceorientation', handleDeviceMotion);
                }
            }
        };

        checkAvailability();

        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('deviceorientation', handleDeviceMotion);
            }
        };
    }, [handleDeviceMotion, requestPermission]);

    return {
        controls,
        isAvailable,
        hasPermission,
        requestPermission
    };
};
