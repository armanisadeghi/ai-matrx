import * as React from "react";

export type LongPressEvent = React.MouseEvent | React.TouchEvent;

export type LongPressOptions = {
    threshold?: number;
    onStart?: (event: LongPressEvent) => void;
    onFinish?: (event: LongPressEvent) => void;
    onCancel?: (event: LongPressEvent) => void;
};

export type LongPressFns = {
    onMouseDown: (event: React.MouseEvent) => void;
    onMouseUp: (event: React.MouseEvent) => void;
    onMouseLeave: (event: React.MouseEvent) => void;
    onTouchStart: (event: React.TouchEvent) => void;
    onTouchEnd: (event: React.TouchEvent) => void;
};

function isTouchEvent({ nativeEvent }: LongPressEvent): boolean {
    return window.TouchEvent ? nativeEvent instanceof TouchEvent : "touches" in nativeEvent;
}

function isMouseEvent(event: LongPressEvent): boolean {
    return event.nativeEvent instanceof MouseEvent;
}

/**
 * Returns `{}` when `callback` is not a function, which leaves the consumer with no
 * handlers attached at all. Preserved from upstream: a no-op handler set would still
 * bind listeners and is not equivalent.
 */
export function useLongPress(
    callback: (event: LongPressEvent) => void,
    options: LongPressOptions = {},
): Partial<LongPressFns> {
    const { threshold = 400, onStart, onFinish, onCancel } = options;
    const isLongPressActive = React.useRef(false);
    const isPressed = React.useRef(false);
    const timerId = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    return React.useMemo(() => {
        if (typeof callback !== "function") {
            return {};
        }

        const start = (event: LongPressEvent) => {
            if (!isMouseEvent(event) && !isTouchEvent(event)) return;

            if (onStart) {
                onStart(event);
            }

            isPressed.current = true;
            timerId.current = setTimeout(() => {
                callback(event);
                isLongPressActive.current = true;
            }, threshold);
        };

        const cancel = (event: LongPressEvent) => {
            if (!isMouseEvent(event) && !isTouchEvent(event)) return;

            if (isLongPressActive.current) {
                if (onFinish) {
                    onFinish(event);
                }
            } else if (isPressed.current) {
                if (onCancel) {
                    onCancel(event);
                }
            }

            isLongPressActive.current = false;
            isPressed.current = false;

            if (timerId.current) {
                clearTimeout(timerId.current);
            }
        };

        const mouseHandlers = {
            onMouseDown: start,
            onMouseUp: cancel,
            onMouseLeave: cancel,
        };

        const touchHandlers = {
            onTouchStart: start,
            onTouchEnd: cancel,
        };

        return {
            ...mouseHandlers,
            ...touchHandlers,
        };
    }, [callback, threshold, onCancel, onFinish, onStart]);
}
