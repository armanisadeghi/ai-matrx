/**
 * lib/toast-service.ts — 🚨 LEGACY. THE CANONICAL TOAST MODULE IS `@/lib/toast`.
 *
 * Census taken 2026-09-11 (FIX-Q12), by importing file:
 *   @/lib/toast              1281   ← canonical; every new call site uses this
 *   @/components/ui/use-toast   97   ← the Radix renderer (components/ui/toaster)
 *   @/lib/toast-service         38   ← THIS module
 *   @/hooks/use-toast            1   ← deleted: byte-identical duplicate of the
 *                                     Radix hook, folded into components/ui
 *   bare "sonner"                2   ← both are the wiring itself, correct
 *
 * NO NEW CALL SITE MAY IMPORT THIS. It is a second toast stack: a singleton
 * that renders through the Radix `ToastProvider` (`providers/toast-context.tsx`)
 * instead of sonner, with its own defaults registry, its own 800ms duration and
 * its own `MatrxVariant` vocabulary. Nothing here is record-aware, so a toast it
 * raises that NAMES a record cannot be withdrawn when that record is renamed,
 * deleted, or navigated away from — the FIX-R17/FIX-Q12 defect, which
 * `@/lib/toast`'s `recordToast` fixes and this module structurally cannot.
 *
 * WHY IT IS STILL HERE, HONESTLY: folding its 38 call sites is a real migration,
 * not a re-export — the signatures differ (`toast.success(msg, moduleKey,
 * options)`, `toast.error(unknown, …)`, `toast.notify`, `toast.loading(promiseFn,
 * …)`, `registerDefaults`), and 12 of those files also consume the defaults
 * registry through `useToastManager`. That migration is its own task; it was out
 * of scope for the lane that wrote this banner, and leaving a silent third copy
 * would have been worse than saying so. When you touch one of the 38, move it to
 * `@/lib/toast` (boy-scout rule) and delete this file when the count hits zero.
 */
import { MatrxVariant } from "@/components/ui/types";
import type { ToastDefaults, ToastOptions } from "@/types/toast.types";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

// Default messages for different toast types
const DEFAULT_MESSAGES = {
    success: "Operation completed successfully",
    error: "An error occurred",
    info: "Information",
    warning: "Warning",
    notify: "Notification",
    loading: "Loading..."
} as const;

const DEFAULT_DURATION = 800;

// Default toast size styling
const DEFAULT_TOAST_STYLE = {
    className: "max-w-xs" // This will make toasts smaller
};

/**
 * The stand-in announces itself (law 4 — nothing fails silently, and a loud
 * patch is the only acceptable kind). Once per session: a warning on every
 * toast would be noise, and noise is how a screamer gets muted.
 */
let legacyStackAnnounced = false;
function announceLegacyToastStack() {
    if (legacyStackAnnounced) return;
    legacyStackAnnounced = true;
    console.warn(
        '[toast-service] This toast came from the LEGACY toast stack (lib/toast-service.ts, 38 importers), not the canonical `@/lib/toast`. Toasts raised here are not record-aware: one that names a record cannot be withdrawn when that record is renamed, deleted, or navigated away from (FIX-R17/FIX-Q12). Remedy: move this call site to `toast` / `recordToast` from "@/lib/toast".',
    );
}

/** Shape passed to the toast-library-backed function registered via setFunctions. */
export interface ToastFnProps {
    title: string;
    description: string;
    variant: MatrxVariant;
    duration: number;
    options: ToastOptions;
}

class ToastService {
    private static instance: ToastService;
    private toastFn: ((props: ToastFnProps) => string) | null = null;
    private dismissFn: ((toastId: string) => void) | null = null;
    private defaults: Record<string, ToastDefaults> = {};

    private constructor() {}

    public static getInstance(): ToastService {
        if (!ToastService.instance) {
            ToastService.instance = new ToastService();
        }
        return ToastService.instance;
    }

    public setFunctions(toastFn: (props: ToastFnProps) => string, dismissFn: (toastId: string) => void) {
        this.toastFn = toastFn;
        this.dismissFn = dismissFn;
    }

    public registerDefaults(key: string, defaults: ToastDefaults) {
        this.defaults[key] = defaults;
    }

    public removeDefaults(key: string) {
        delete this.defaults[key];
    }

    private getDefaultMessage(type: keyof typeof DEFAULT_MESSAGES, moduleKey?: string): string {
        return moduleKey && this.defaults[moduleKey]?.[type] || DEFAULT_MESSAGES[type];
    }

    public show(
        title: string,
        description: string,
        variant: MatrxVariant = "default",
        options?: ToastOptions
    ) {
        if (!this.toastFn) {
            console.warn("Toast function not initialized. Make sure ToastProvider is mounted.");
            return "";
        }

        announceLegacyToastStack();

        // Merge default style with provided options
        const mergedOptions = {
            ...DEFAULT_TOAST_STYLE,
            ...options
        };

        return this.toastFn({
            title,
            description,
            variant,
            // Use default duration if not specified
            duration: options?.duration ?? DEFAULT_DURATION,
            options: mergedOptions
        });
    }

    public success(message?: string, moduleKey?: string, options?: ToastOptions) {
        return this.show("Success", message ?? this.getDefaultMessage("success", moduleKey), "success", options);
    }

    public error(error?: unknown, moduleKey?: string, options?: ToastOptions) {
        const message = error instanceof Error ? error.message :
                        typeof error === "string" ? error : this.getDefaultMessage("error", moduleKey);
        // Every user-facing error toast is captured. Showing a failure to the
        // user does not make it minor; source "user-toast" stays red unless a
        // specific downgrade rule proves that exact toast is expected noise.
        try {
            captureError({
                source: "user-toast",
                relation: moduleKey,
                message,
                userMessage: message,
                name: error instanceof Error ? error.name : undefined,
                stack: error instanceof Error ? error.stack : undefined,
                raw: error instanceof Error
                    ? { name: error.name, message: error.message, stack: error.stack }
                    : error,
            });
        } catch {
            /* capture must never break the toast */
        }
        return this.show("Error", message, "destructive", options);
    }

    public info(message?: string, moduleKey?: string, options?: ToastOptions) {
        return this.show("Info", message ?? this.getDefaultMessage("info", moduleKey), "secondary", options);
    }

    public warning(message?: string, moduleKey?: string, options?: ToastOptions) {
        const resolved = message ?? this.getDefaultMessage("warning", moduleKey);
        // Mirror error(): warnings are captured too (parity with lib/toast.ts).
        try {
            captureError({
                source: "user-toast",
                relation: moduleKey,
                message: `[warning] ${resolved}`,
                userMessage: resolved,
                raw: { kind: "warning", message: resolved },
            });
        } catch {
            /* capture must never break the toast */
        }
        return this.show("Warning", resolved, "ghost", options);
    }

    public notify(message?: string, moduleKey?: string, options?: ToastOptions) {
        return this.show("Notification", message ?? this.getDefaultMessage("notify", moduleKey), "primary", options);
    }

    public async loading<T>(
        promiseFn: () => Promise<T>,
        options: { loading?: string; success?: string; error?: string; duration?: number } = {},
        moduleKey?: string
    ): Promise<T> {
        const toastId = this.show(
            "Loading",
            options.loading ?? this.getDefaultMessage("loading", moduleKey),
            "default",
            { duration: Infinity }
        );

        try {
            const result = await promiseFn();
            this.dismissFn?.(toastId);
            this.success(options.success, moduleKey, { duration: options.duration });
            return result;
        } catch (e) {
            this.dismissFn?.(toastId);
            this.error(options.error ?? e, moduleKey, { duration: options.duration });
            throw e;
        }
    }

    public dismiss(toastId: string) {
        this.dismissFn?.(toastId);
    }
}

export const toast = ToastService.getInstance();
