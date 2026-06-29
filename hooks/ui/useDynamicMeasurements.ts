import { useEffect, useRef, useState, useCallback } from 'react';
import debounce from 'lodash/debounce';

type MeasurementKey = string;

interface Measurements {
    top: number;
    bottom: number;
    height: number;
    availableHeight: number;
    viewportHeight: number;
}

interface UseDynamicMeasurementsOptions {
    buffer?: number;
    debounceMs?: number;
    threshold?: number;
    initialPauseMs?: number;
    initialMeasurements?: Record<MeasurementKey, Partial<Measurements>>;
}

const getInitialViewportHeight = () => {
    if (typeof window !== 'undefined') {
        return window.innerHeight;
    }
    return 0; // Default height for SSR
};

export function useDynamicMeasurements(options: UseDynamicMeasurementsOptions = {}) {
    const {
        buffer = 8,
        debounceMs = 300,
        threshold = 10,
        initialPauseMs,
        initialMeasurements = {}
    } = options;

    // Use lazy initial state to avoid SSR issues
    const [measurements, setMeasurements] = useState<Record<MeasurementKey, Measurements>>(() => {
        const defaults = {} as Record<MeasurementKey, Measurements>;
        const viewportHeight = getInitialViewportHeight();

        Object.entries(initialMeasurements).forEach(([key, value]) => {
            defaults[key] = {
                top: value.top ?? 0,
                bottom: value.bottom ?? 0,
                height: value.height ?? 0,
                availableHeight: value.availableHeight ?? 0,
                viewportHeight,
                ...value
            };
        });
        return defaults;
    });

    const refs = useRef<Map<MeasurementKey, HTMLDivElement | null>>(new Map());
    const lastMeasurements = useRef<Record<string, Measurements>>({});
    const updatePending = useRef(false);
    const animationFrame = useRef<number | undefined>(undefined);
    const isPaused = useRef(false);
    const pauseTimeout = useRef<NodeJS.Timeout | undefined>(undefined);
    const initialPauseTimeout = useRef<NodeJS.Timeout | undefined>(undefined);

    // Check if the change is significant enough to warrant an update
    const hasSignificantChange = (
        oldMeasurements: Record<string, Measurements>,
        newMeasurements: Record<string, Measurements>
    ) => {
        return Object.entries(newMeasurements).some(([key, newValue]) => {
            const oldValue = oldMeasurements[key];
            if (!oldValue) return true;

            const topDiff = Math.abs(newValue.top - oldValue.top);
            const heightDiff = Math.abs(newValue.availableHeight - oldValue.availableHeight);

            return topDiff > threshold || heightDiff > threshold;
        });
    };

    const updateMeasurements = useCallback(() => {
        if (!updatePending.current || isPaused.current) return;

        const newMeasurements: Record<string, Measurements> = {};

        refs.current.forEach((element, key) => {
            if (element) {
                const rect = element.getBoundingClientRect();
                const viewportHeight = window.innerHeight;

                newMeasurements[key] = {
                    top: Math.round(rect.top),
                    bottom: Math.round(rect.bottom),
                    height: Math.round(rect.height),
                    availableHeight: Math.round(viewportHeight - rect.top - buffer),
                    viewportHeight
                };
            }
        });

        // Only update if there's a significant change
        if (hasSignificantChange(lastMeasurements.current, newMeasurements)) {
            setMeasurements(newMeasurements);
            lastMeasurements.current = newMeasurements;
        }

        updatePending.current = false;
    }, [buffer, threshold]);

    const debouncedUpdate = useCallback(
        debounce(() => {
            updatePending.current = true;

            // Cancel any pending animation frame
            if (animationFrame.current) {
                cancelAnimationFrame(animationFrame.current);
            }

            // Schedule update for next frame
            animationFrame.current = requestAnimationFrame(() => {
                updateMeasurements();
            });
        }, debounceMs, { maxWait: 1000 }), // Add maxWait to ensure updates happen at least every second
        [updateMeasurements, debounceMs]
    );

    const getRef = useCallback((key: MeasurementKey) => {
        return (element: HTMLDivElement | null) => {
            if (element !== refs.current.get(key)) {
                refs.current.set(key, element);
                debouncedUpdate();
            }
        };
    }, [debouncedUpdate]);

    // Pause functionality
    const pauseMeasurements = useCallback((durationMs?: number) => {
        isPaused.current = true;

        // Clear any existing pause timeout
        if (pauseTimeout.current) {
            clearTimeout(pauseTimeout.current);
        }

        // If duration provided, resume after that duration
        if (durationMs) {
            pauseTimeout.current = setTimeout(() => {
                isPaused.current = false;
                debouncedUpdate();
            }, durationMs);
        }
    }, [debouncedUpdate]);

    const resumeMeasurements = useCallback(() => {
        isPaused.current = false;
        if (pauseTimeout.current) {
            clearTimeout(pauseTimeout.current);
        }
        debouncedUpdate();
    }, [debouncedUpdate]);

    // Apply initial pause if specified
    useEffect(() => {
        if (initialPauseMs) {
            isPaused.current = true;
            initialPauseTimeout.current = setTimeout(() => {
                isPaused.current = false;
                debouncedUpdate();
            }, initialPauseMs);

            return () => {
                if (initialPauseTimeout.current) {
                    clearTimeout(initialPauseTimeout.current);
                }
            };
        }
        return undefined;
    }, [initialPauseMs, debouncedUpdate]);

    // Set up observers and event listeners
    useEffect(() => {
        const resizeObserver = new ResizeObserver(() => {
            debouncedUpdate();
        });

        refs.current.forEach((element) => {
            if (element) {
                resizeObserver.observe(element);
            }
        });

        // Use passive event listeners for better performance
        window.addEventListener('scroll', debouncedUpdate, { passive: true });
        window.addEventListener('resize', debouncedUpdate, { passive: true });

        return () => {
            if (animationFrame.current) {
                cancelAnimationFrame(animationFrame.current);
            }
            if (pauseTimeout.current) {
                clearTimeout(pauseTimeout.current);
            }
            if (initialPauseTimeout.current) {
                clearTimeout(initialPauseTimeout.current);
            }
            debouncedUpdate.cancel();
            resizeObserver.disconnect();
            window.removeEventListener('scroll', debouncedUpdate);
            window.removeEventListener('resize', debouncedUpdate);
        };
    }, [debouncedUpdate]);

    useEffect(() => {
        // Initial update now that we have access to window
        if (Object.keys(measurements).length > 0) {
            debouncedUpdate();
        }
    }, []); // Empty dependency array for initial mount only

    return {
        measurements,
        getRef,
        pauseMeasurements,
        resumeMeasurements
    };
}
