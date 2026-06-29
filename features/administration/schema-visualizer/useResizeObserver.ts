// utils/useResizeObserver.ts
import { useEffect, useRef, useState } from 'react';

export function useResizeObserver() {
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = ref.current;
        if (!element) return undefined;

        const observer = new ResizeObserver((entries) => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                setDimensions({ width, height });
            }
        });

        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    return [ref, dimensions] as const;
}
