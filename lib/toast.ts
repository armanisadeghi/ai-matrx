/**
 * lib/toast.ts — HOST WIRING for @ai-matrx/kit/toast.
 *
 * The captured-sonner mechanics live in the package (`createMatrxToast`); this
 * module wires it ONCE to the app's sonner and error-capture store. Import
 * `toast` from HERE instead of "sonner" — a bare sonner import is INVISIBLE
 * to the admin Error Inspector (the exact hole found in the marketing
 * feature, 2026-07-20). The API is identical: `error` and `warning`
 * additionally feed `captureError` (source "user-toast"); everything else
 * passes straight through.
 *
 * Migration is opportunistic (boy-scout rule): when you touch a file that
 * imports toast from "sonner", switch it to `@/lib/toast`.
 */

import { toast as sonnerToast } from "sonner";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { createMatrxToast } from "@ai-matrx/kit/toast";

export const { toast, toastErrorAlreadyCaptured } = createMatrxToast({
  toast: sonnerToast,
  capture: captureError,
});
