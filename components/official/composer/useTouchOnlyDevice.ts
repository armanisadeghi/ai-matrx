"use client";

import { useMediaQueryState } from "@/hooks/use-media-query";
import { TOUCH_ONLY_DEVICE_QUERY } from "./composerSubmit";

/**
 * True on a phone or a mouse-less tablet — where Enter never sends
 * (`enterSendsHere`), so no composer offers the "Enter sends" switch there.
 * `false` until the device is known (the server render has a keyboard).
 */
export function useTouchOnlyDevice(): boolean {
  return useMediaQueryState(TOUCH_ONLY_DEVICE_QUERY) === true;
}
