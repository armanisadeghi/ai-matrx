/**
 * lib/pwa/install.ts — the platform's ONE install-to-home-screen primitive.
 *
 * Any surface that wants to be installable consumes this; nobody hand-rolls a
 * second `beforeinstallprompt` listener. The listener must be attached EARLY
 * (the event fires once, usually before React hydrates a deep route), so the
 * module captures it at import time on the client and replays the captured
 * event to whoever asks later.
 *
 * Platform reality this encodes, because it is the part that gets got wrong:
 *   • Chrome/Edge/Android fire `beforeinstallprompt`; we must preventDefault()
 *     and stash the event to call `prompt()` later from a user gesture.
 *   • iOS Safari NEVER fires it. Installing there is a manual Share → "Add to
 *     Home Screen". A button that does nothing on iOS is worse than a button
 *     that explains the two taps, so the state machine has an explicit
 *     `ios-manual` mode rather than pretending install is unavailable.
 *   • An already-installed app reports `display-mode: standalone` (or
 *     `navigator.standalone` on iOS) — never prompt there.
 */

export type InstallAvailability =
  /** Already running as an installed app. */
  | "installed"
  /** A real prompt is captured and ready to fire. */
  | "promptable"
  /** iOS Safari: no API — the UI must show the Share-sheet instructions. */
  | "ios-manual"
  /** No prompt captured and not iOS — nothing useful to offer yet. */
  | "unavailable";

/** The non-standard event Chromium fires. Not in lib.dom. */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    window.matchMedia?.("(display-mode: fullscreen)").matches === true ||
    iosStandalone === true
  );
}

export function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // iPadOS 13+ reports as Macintosh; the touch-point check disambiguates.
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  // Chrome/Firefox on iOS (CriOS/FxiOS) cannot add to the home screen at all.
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function getInstallAvailability(): InstallAvailability {
  if (typeof window === "undefined") return "unavailable";
  if (isStandalone()) return "installed";
  if (deferredPrompt) return "promptable";
  if (isIosSafari()) return "ios-manual";
  return "unavailable";
}

/**
 * Fire the captured prompt. Must be called from a user gesture.
 * Returns the user's choice, or null when there was nothing to prompt.
 * The event is single-use: it is dropped whatever the outcome.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | null> {
  const event = deferredPrompt;
  if (!event) return null;
  deferredPrompt = null;
  notify();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  } catch {
    return null;
  }
}

/** Subscribe to availability changes. Returns an unsubscribe function. */
export function subscribeToInstallAvailability(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}
