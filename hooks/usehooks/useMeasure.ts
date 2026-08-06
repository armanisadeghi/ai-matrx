import * as React from "react";

export type Measurements = {
    width: number | null;
    height: number | null;
};

export function useMeasure<T extends Element>(): [React.RefCallback<T>, Measurements] {
    const [dimensions, setDimensions] = React.useState<Measurements>({
        width: null,
        height: null,
    });

    const previousObserver = React.useRef<ResizeObserver | null>(null);

    const customRef = React.useCallback((node: T | null) => {
        if (previousObserver.current) {
            previousObserver.current.disconnect();
            previousObserver.current = null;
        }

        if (node?.nodeType === Node.ELEMENT_NODE) {
            const observer = new ResizeObserver(([entry]) => {
                if (entry && entry.borderBoxSize) {
                    const { inlineSize: width, blockSize: height } = entry.borderBoxSize[0];

                    setDimensions({ width, height });
                }
            });

            observer.observe(node);
            previousObserver.current = observer;
        }
    }, []);

    return [customRef, dimensions];
}
