import { toast } from "@/lib/toast";

/**
 * THE copy outcome notifier — pass it as `notify` to `useClipboard` / `copyText`.
 *
 * A copy that landed confirms on the control that was pressed (it shows a check for a moment —
 * macOS, Linear, GitHub); it never raises a toast. A failed copy still toasts. When the pressed
 * control is gone (a menu item that closed on press) or there was no press (a keyboard shortcut),
 * a short success toast is the only way left to say it landed, so it stays as that fallback.
 * The check itself is CSS: `[data-copy-flash]` in `app/globals.css`.
 */
const FLASH_MS = 1200;

let lastPress: Element | null = null;
let lastPressAt = 0;

if (typeof document !== "undefined") {
  const remember = (event: Event) => {
    const target = event.target;
    lastPress = target instanceof Element ? target : null;
    lastPressAt = Date.now();
  };
  document.addEventListener("pointerdown", remember, true);
  document.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Enter" || (event as KeyboardEvent).key === " ") remember(event);
  }, true);
}

const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

function pressedControl(): HTMLElement | null {
  // A copy resolves within a moment of the press; an old press is not this copy's trigger.
  if (!lastPress || Date.now() - lastPressAt > 10_000) return null;
  const control = lastPress.closest<HTMLElement>('button, [role="button"], a[href]');
  if (!control || !control.isConnected) return null;
  if (control.closest('[role="menu"], [role="menuitem"], [role="option"]')) return null;
  return control;
}

export function copyNotify(message: string, kind: "success" | "error"): void {
  if (kind === "error") {
    toast.error(message);
    return;
  }
  const control = pressedControl();
  if (!control) {
    toast.success(message);
    return;
  }
  const running = timers.get(control);
  if (running) clearTimeout(running);
  control.setAttribute("data-copy-flash", "true");
  timers.set(control, setTimeout(() => control.removeAttribute("data-copy-flash"), FLASH_MS));
}
