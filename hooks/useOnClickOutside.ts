import { useEffect, useRef, RefObject } from "react";

type Handler = (event: MouseEvent | TouchEvent) => void;

/**
 * Hook that handles click outside of the passed ref.
 * Correctly ignores clicks inside Radix UI portals (Select, Popover, Dialog,
 * DropdownMenu, etc.) which render outside the ref's DOM subtree but are
 * logically "inside" the component. Radix marks these containers with
 * [data-radix-portal], so we skip any click whose target is inside one.
 *
 * @param handler Function to call on outside click
 * @param active Whether the hook is active (default: true)
 * @returns React ref to attach to the element
 */
function useOnClickOutside<T extends HTMLElement = HTMLElement>(
  handler: Handler,
  active: boolean = true,
): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return undefined;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Element;
      if (!ref.current || ref.current.contains(target)) return;
      // Ignore clicks inside Radix portals (dropdowns, selects, dialogs, etc.)
      if (target.closest?.("[data-radix-portal]")) return;
      handler(event);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [handler, active]);

  return ref;
}

export default useOnClickOutside;
