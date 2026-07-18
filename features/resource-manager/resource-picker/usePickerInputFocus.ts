import { useEffect, useRef } from "react";

/** Focus the primary search/url input when a resource-picker drill-in view mounts. */
export function usePickerInputFocus<
  T extends HTMLInputElement = HTMLInputElement,
>() {
  const inputRef = useRef<T>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return inputRef;
}
